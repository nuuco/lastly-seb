/**
 * 알림 배치. cron 이 매시 정각에 부른다.
 *
 * 같은 일을 apps/api 의 NotificationsService.dispatchDigests 도 한다.
 * 옮기는 중이라 둘을 함께 두고, cron 이 어느 쪽을 부르는지로만 전환한다 —
 * 되돌릴 때 마이그레이션 한 줄이면 된다.
 *
 * 여기로 옮기는 이유: 무료 호스팅의 API 는 15분이면 잠든다. 알림을 보내려고
 * 그 서버를 깨우고 기다리는 동안 실패하면 그 시간대 알림이 통째로 날아간다.
 * Edge Function 은 잠들지 않는다.
 *
 * 누구에게 보낼지 고르는 일은 users_due_for_digest RPC 가 한다 —
 * 타임존별 시각 비교, 같은 날 중복 발송 차단, 보낼 항목 존재 확인까지.
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

/** 구독이 만료됐음을 알리는 상태 코드. 해당 구독은 정리한다. */
const GONE_STATUS = new Set([404, 410]);

interface DigestRow {
  user_id: string;
  display_name: string | null;
  timezone: string;
  weekend_enabled: boolean;
}

interface ItemRow {
  id: string;
  name: string;
  next_due_on: string | null;
  last_done_on: string | null;
}

const env = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`환경변수 ${key} 가 비어 있습니다.`);
  return value;
};

const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));

/** 그 시간대의 '오늘' 을 날짜 단위로 본다. 사용자마다 시간대가 다르다. */
function zonedParts(now: Date, timeZone: string): { ymd: string; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });

  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: weekdays.indexOf(parts.weekday as string),
  };
}

/** 달력상 며칠 차이인지. 시각은 보지 않는다 — date-fns 의 differenceInCalendarDays 와 같은 기준. */
function diffDays(fromYmd: string, toYmd: string): number {
  const ms = Date.parse(`${toYmd}T00:00:00Z`) - Date.parse(`${fromYmd}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/** "8월 25일" — 알림 본문에 쓰는 형식. */
function formatKoreanDate(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${Number(month)}월 ${Number(day)}일`;
}

/**
 * 한 사용자의 모든 기기로 보낸다.
 * 만료된 구독은 조용히 정리하고, 나머지 기기 전송은 계속한다.
 */
async function sendToUser(userId: string, payload: unknown): Promise<number> {
  const { data, error } = await admin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (error) throw error;

  const results = await Promise.allSettled(
    (data ?? []).map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          JSON.stringify(payload),
        );
        await admin
          .from('push_subscriptions')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', row.id);
        return true;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status && GONE_STATUS.has(status)) {
          await admin.from('push_subscriptions').delete().eq('id', row.id);
          console.log(`만료된 구독 정리: ${row.id}`);
          return false;
        }
        console.warn(`푸시 전송 실패(${status ?? 'unknown'}): ${row.id}`);
        return false;
      }
    }),
  );

  return results.filter((r) => r.status === 'fulfilled' && r.value).length;
}

async function sendDigest(user: DigestRow, now: Date): Promise<void> {
  const local = zonedParts(now, user.timezone);

  // 주말 알림을 껐으면 토·일에는 보내지 않는다.
  if (!user.weekend_enabled && (local.weekday === 0 || local.weekday === 6)) return;

  const { data, error } = await admin
    .from('items')
    .select('id, name, next_due_on, last_done_on')
    .eq('user_id', user.user_id)
    .eq('status', 'active')
    .order('next_due_on', { ascending: true, nullsFirst: true });

  if (error) throw error;

  const due = ((data ?? []) as ItemRow[]).filter(
    (r) => r.next_due_on !== null && diffDays(local.ymd, r.next_due_on) <= 0,
  );

  if (due.length === 0) return;

  const head = due[0]!;
  const daysSince = head.last_done_on ? diffDays(head.last_done_on, local.ymd) : null;

  const title = due.length === 1 ? `${head.name}할 때가 됐어요` : `오늘 챙길 것 ${due.length}가지`;
  const body =
    due.length === 1
      ? `마지막 ${daysSince ?? 0}일 전${head.last_done_on ? ` · ${formatKoreanDate(head.last_done_on)}` : ''}`
      : due.map((d) => d.name).slice(0, 3).join(', ');

  const sent = await sendToUser(user.user_id, {
    title,
    body,
    itemId: head.id,
    actions: ['complete', 'snooze_3d', 'snooze_weekend'],
  });

  if (sent > 0) {
    await admin.from('notifications').insert({
      user_id: user.user_id,
      item_id: head.id,
      title,
      body,
      scheduled_at: now.toISOString(),
      sent_at: new Date().toISOString(),
    });
  }
}

Deno.serve(async (req) => {
  /**
   * 아무나 부를 수 있으면 안 된다. cron 이 Vault 에서 꺼내 실어 보내는 값과 맞춘다.
   * verify_jwt 는 끈다 — 부르는 쪽이 사용자가 아니라 DB 다.
   */
  const secret = Deno.env.get('CRON_SECRET');
  if (!secret || req.headers.get('Authorization') !== `Bearer ${secret}`) {
    return new Response(JSON.stringify({ error: '인증이 필요합니다.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const now = new Date();
  const { data, error } = await admin.rpc('users_due_for_digest', { p_now: now.toISOString() });

  if (error) {
    console.error(`다이제스트 대상 조회 실패: ${error.message}`);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = (data ?? []) as DigestRow[];
  let sent = 0;
  let failed = 0;

  // 한 사람이 실패해도 나머지는 계속 보낸다.
  for (const row of rows) {
    try {
      await sendDigest(row, now);
      sent += 1;
    } catch (err) {
      failed += 1;
      console.warn(`${row.user_id} 다이제스트 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`다이제스트 대상 ${rows.length}명 · 발송 ${sent} · 실패 ${failed}`);

  return new Response(JSON.stringify({ candidates: rows.length, sent, failed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
