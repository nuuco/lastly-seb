/**
 * 테스트 계정과 샘플 항목을 만든다.
 *
 * 카카오·구글 OAuth를 등록하지 않아도 앱이 도는 걸 확인할 수 있게 하기 위한 것이다.
 * 여러 번 돌려도 같은 상태가 된다.
 *
 *   node scripts/seed-dev-user.mjs
 *
 * 공개 배포에 쓸 거면 비밀번호를 정해서 돌린다 — 기본값은 저장소에 적혀 있다.
 *
 *   LASTLY_DEV_PASSWORD=... node scripts/seed-dev-user.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { addDays, format, subDays } from 'date-fns';

config({ path: new URL('../.env', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const EMAIL = process.env.LASTLY_DEV_EMAIL ?? 'dev@lastly.local';

/**
 * 공개 저장소라 기본값은 누구나 안다.
 * 공개 배포에 쓸 거면 LASTLY_DEV_PASSWORD 로 다른 값을 정한다.
 */
const PASSWORD = process.env.LASTLY_DEV_PASSWORD ?? 'lastly-dev-1234';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || url.includes('placeholder')) {
  console.error('.env의 Supabase 설정이 비어 있습니다.');
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const iso = (d) => format(d, 'yyyy-MM-dd');
const today = new Date();

/**
 * 설계 05 에 그려진 값을 그대로 재현한다.
 * 화면과 나란히 놓고 비교하려면 숫자까지 같아야 한다.
 *
 *   욕실 배수구 청소  D+2 · 32일 전 · 한 달마다   ← 밀림
 *   에어컨 필터 청소  오늘 · 45일 전 · 45일마다   ← 오늘
 *   이불 빨래        D-2 · 12일 전 · 2주마다
 *   칫솔 교체        D-12 · 78일 전 · 3달마다
 */
const SAMPLES = [
  {
    name: '욕실 배수구 청소',
    cadence: { unit: 'month', interval: 1, weekdays: [] },
    source: 'community',
    // 32일 전 + 한 달 주기 → 이틀 밀렸다. 캐러셀 첫 장이 된다.
    doneDaysAgo: [32, 63, 95],
  },
  {
    name: '에어컨 필터 청소',
    cadence: { unit: 'day', interval: 45, weekdays: [] },
    source: 'community',
    // 45일 전 → 오늘이 예정일
    doneDaysAgo: [45, 92, 136],
    // 설계 05-D 의 검색 결과에 나오는 메모. 이름에 없는 말로도 찾아진다.
    notes: { 45: '필터 두 장 남음, 다음엔 주문하기' },
  },
  {
    name: '이불 빨래',
    cadence: { unit: 'week', interval: 2, weekdays: [] },
    source: 'personal',
    doneDaysAgo: [12, 28, 42],
  },
  {
    name: '칫솔 교체',
    cadence: { unit: 'month', interval: 3, weekdays: [] },
    source: 'community',
    doneDaysAgo: [78],
  },
  {
    name: '정수기 필터 교체',
    cadence: { unit: 'month', interval: 3, weekdays: [] },
    source: 'community',
    doneDaysAgo: [20, 112],
    notes: { 20: '필터 색이 많이 어두웠음' },
  },
  {
    name: '화분 물 주기',
    cadence: { unit: 'week', interval: 1, weekdays: [] },
    source: 'personal',
    doneDaysAgo: [3, 10, 18, 24],
  },
];

async function findOrCreateUser() {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((u) => u.email === EMAIL);

  if (existing) {
    // 비밀번호를 바꿔 다시 돌렸을 수 있으므로 현재 값으로 맞춰 둔다.
    await admin.auth.admin.updateUserById(existing.id, { password: PASSWORD });
    console.log(`기존 테스트 계정 사용: ${EMAIL}`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: '지현' },
  });

  if (error) throw error;
  console.log(`테스트 계정 생성: ${EMAIL}`);
  return data.user.id;
}

async function main() {
  const userId = await findOrCreateUser();

  // 트리거가 프로필을 만들지만, 이름이 비어 있으면 채워준다.
  await admin
    .from('profiles')
    .upsert({ id: userId, display_name: '지현', timezone: 'Asia/Seoul' }, { onConflict: 'id' });

  // 여러 번 돌려도 같은 상태가 되도록 먼저 지운다.
  await admin.from('items').delete().eq('user_id', userId);

  for (const sample of SAMPLES) {
    const { data: item, error } = await admin
      .from('items')
      .insert({
        user_id: userId,
        name: sample.name,
        cadence_unit: sample.cadence.unit,
        cadence_interval: sample.cadence.interval,
        cadence_weekdays: sample.cadence.weekdays,
        cadence_source: sample.source,
      })
      .select('id')
      .single();

    if (error) throw error;

    // 오래된 기록부터 넣어야 gap 계산이 자연스럽다.
    const logs = [...sample.doneDaysAgo]
      .sort((a, b) => b - a)
      .map((days) => ({
        user_id: userId,
        item_id: item.id,
        done_on: iso(subDays(today, days)),
        source: 'manual',
        note: sample.notes?.[days] ?? null,
      }));

    const { error: logError } = await admin.from('item_logs').insert(logs);
    if (logError) throw logError;

    console.log(`  ${sample.name} — 기록 ${logs.length}건`);
  }

  const { data: check } = await admin
    .from('items')
    .select('name, last_done_on, next_due_on, average_interval_days')
    .eq('user_id', userId)
    .order('next_due_on');

  console.log('\n트리거가 계산한 값:');
  for (const row of check ?? []) {
    const due = row.next_due_on ?? '—';
    const badge = due !== '—' && due <= iso(today) ? ' ← 오늘 챙길 것' : '';
    console.log(
      `  ${row.name.padEnd(18)} 마지막 ${row.last_done_on} → 다음 ${due}` +
        `  (평균 ${row.average_interval_days ?? '—'}일)${badge}`,
    );
  }

  console.log(`\n로그인 정보:  ${EMAIL}  /  ${PASSWORD}`);
  console.log(`다음 알림 기준일: ${iso(addDays(today, 1))} 이후`);

  if (!process.env.LASTLY_DEV_PASSWORD) {
    console.log('\n주의: 기본 비밀번호를 쓰고 있습니다. 저장소가 공개라 누구나 아는 값입니다.');
    console.log('      공개 배포에 쓸 거면 LASTLY_DEV_PASSWORD 를 정해 다시 실행하세요.');
  }
}

main().catch((err) => {
  console.error('실패:', err.message ?? err);
  process.exit(1);
});
