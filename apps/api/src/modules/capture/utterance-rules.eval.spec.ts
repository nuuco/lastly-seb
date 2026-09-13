import { readCadenceDays, readDaysAgo, readIntent, readName } from './utterance-rules';

/**
 * 평가셋 — 실제 발화 15개로 규칙이 어디까지 커버하는지 센다.
 * 통과/실패가 아니라 "몇 개를 LLM 없이 끝낼 수 있는가" 를 보는 자리다.
 */
const REF = new Date(2026, 8, 13); // 일요일

const KNOWN = [
  ['i1', '욕실 배수구 청소'], ['i2', '에어컨 필터 청소'], ['i3', '이불 빨래'],
  ['i4', '칫솔 교체'], ['i5', '정수기 필터 교체'], ['i6', '화분 물 주기'],
] as const;

/** 이름이 얼마나 닮았는지. DB 의 트라이그램 매칭을 아주 거칠게 흉내낸 것. */
function similar(a: string, b: string): number {
  const grams = (s: string) => new Set(s.replace(/\s/g, '').split(''));
  const A = grams(a), B = grams(b);
  const inter = [...A].filter((c) => B.has(c)).length;
  return (2 * inter) / (A.size + B.size);
}

function match(name: string | null): string | null {
  if (!name) return null;
  let best: string | null = null, score = 0;
  for (const [, kname] of KNOWN) {
    const r = similar(name, kname);
    if (r > score) { best = kname; score = r; }
  }
  return score >= 0.7 ? best : null;
}

const CASES: Array<[string, string | null, number, number | null, string, string | null]> = [
  // 문장, 기대이름, 기대일전, 기대주기, 기대의도, 기대매칭
  ['오늘 이불 빨았어', '이불 빨래', 0, null, 'record', '이불 빨래'],
  ['어제 화분 물 줬어', '화분 물 주기', 1, null, 'record', '화분 물 주기'],
  ['그저께 칫솔 갈았어', '칫솔 교체', 2, null, 'record', '칫솔 교체'],
  ['이불 세탁했어', '이불 빨래', 0, null, 'record', '이불 빨래'],
  ['침구 빨래 했어', null, 0, null, 'record', '이불 빨래'],
  ['오늘 베란다 창틀 닦았어', '베란다 창틀 청소', 0, null, 'record', null],
  ['오늘 이불 빨았어 한달에 한번 빨거야', '이불 빨래', 0, 30, 'record', '이불 빨래'],
  ['세탁조 청소했어 세달에 한번 할래', '세탁조 청소', 0, 90, 'record', null],
  ['에어컨 필터 청소함 45일마다 할거야', null, 0, 45, 'record', '에어컨 필터 청소'],
  ['3일 전에 정수기 필터 갈았어', '정수기 필터 교체', 3, null, 'record', '정수기 필터 교체'],
  ['마지막으로 이불 언제 빨았지?', '이불 빨래', 0, null, 'query', '이불 빨래'],
  ['칫솔 간 지 얼마나 됐어?', null, 0, null, 'query', '칫솔 교체'],
  ['이불 빠라써', null, 0, null, 'record', '이불 빨래'],
  ['오늘 점심 맛있었다', null, 0, null, 'record', null],
  ['지난주 일요일에 욕실 배수구 청소했어', '욕실 배수구 청소', 7, null, 'record', '욕실 배수구 청소'],
];

describe('규칙 커버리지', () => {
  const tally = { intent: 0, date: 0, cadence: 0, name: 0, match: 0, full: 0 };
  const nameGraded = CASES.filter(([, n]) => n !== null).length;

  it('필드별로 센다', () => {
    for (const [text, name, days, cad, intent, matched] of CASES) {
      const okIntent = readIntent(text) === intent;
      const okDate = readDaysAgo(text, REF).daysAgo === days;
      const okCad = readCadenceDays(text) === cad;
      const got = readName(text);
      const okName = name === null ? true : got === name;
      const okMatch = match(got) === matched;

      if (okIntent) tally.intent++;
      if (okDate) tally.date++;
      if (okCad) tally.cadence++;
      if (okName) tally.name++;
      if (okMatch) tally.match++;
      if (okIntent && okDate && okCad && okName && okMatch) tally.full++;
    }

    const n = CASES.length;
    // 결과를 눈으로 보려고 남긴다. 수치가 떨어지면 아래 기대치에서 걸린다.
    console.log(
      `\n  intent  ${tally.intent}/${n}\n  날짜    ${tally.date}/${n}\n` +
      `  주기    ${tally.cadence}/${n}\n  이름    ${tally.name - (n - nameGraded)}/${nameGraded}\n` +
      `  매칭    ${tally.match}/${n}\n  ─────\n  전부    ${tally.full}/${n}  ← LLM 없이 끝나는 문장\n`,
    );

    expect(tally.intent).toBe(n);
    expect(tally.date).toBe(n);
    expect(tally.cadence).toBe(n);
  });
});
