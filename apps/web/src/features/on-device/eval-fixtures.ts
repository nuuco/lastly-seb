import type { OnDeviceKnownItem } from './types';

/**
 * 온디바이스 실험 골든셋. 문장·기대값의 단일 원천.
 *
 * 유형 1–60은 유형당 15개, 마지막 5개는 혼합 함정.
 * 61–75는 조회·주기, 76–79는 주기 칩 말투.
 *
 * 기대 발화유형(completed 등)은 규칙 게이트 기준이다. Lastly 본선 스키마는
 * record/query 뿐이라, 예정·못함은 save=false 로만 잠근다. 함정 문장에
 * `못`/`안`이 있으면 completed 저장을 차단한다.
 *
 * 날짜는 기준일 GOLDEN_REF_DATE 기준.
 */
export const GOLDEN_REF_DATE = '2026-09-14';
export const GOLDEN_SIZE = 104;

export type GoldenKind = 'completed' | 'planned' | 'incomplete' | 'uncertain' | 'query';

export type GoldenCadence =
  | { kind: 'none' }
  | { kind: 'everyDays'; days: number }
  | { kind: 'everyMonths'; months: number }
  | { kind: 'weekly'; weekday: '월' | '화' | '수' | '목' | '금' | '토' | '일' }
  | { kind: 'monthlyDay'; day: number }
  | { kind: 'monthlyNthWeekday'; nth: 'last' | 2; weekday: '월' | '화' | '수' | '목' | '금' | '토' | '일' };

export interface GoldenCase {
  n: number;
  text: string;
  kind: GoldenKind;
  trap: boolean;
  /** Lastly가 로그로 남기면 안 되면 false. 조회도 false. */
  save: boolean;
  intent: 'record' | 'query';
  itemName: string | null;
  /** 애매하거나 미래면 null. 조회는 0. */
  daysAgo: number | null;
  cadence: GoldenCadence;
  matchId: string | null;
}

export const GOLDEN_KNOWN_ITEMS: OnDeviceKnownItem[] = [
  { id: 'item-1', name: '이불 빨래', lastDoneOn: '2026-09-01' },
  { id: 'item-2', name: '정수기 필터 교체', lastDoneOn: null },
  { id: 'item-3', name: '설거지', lastDoneOn: '2026-09-13' },
  { id: 'item-4', name: '에어컨 청소', lastDoneOn: null },
  { id: 'item-5', name: '화장실 청소', lastDoneOn: null },
  { id: 'item-6', name: '커튼 빨래', lastDoneOn: null },
  { id: 'item-7', name: '쓰레기 버리기', lastDoneOn: null },
  { id: 'item-8', name: '청소기 돌리기', lastDoneOn: null },
  { id: 'item-9', name: '강아지 목욕', lastDoneOn: null },
  { id: 'item-10', name: '세탁기 청소', lastDoneOn: null },
  { id: 'item-11', name: '분리수거', lastDoneOn: null },
  { id: 'item-12', name: '베개 빨래', lastDoneOn: null },
  { id: 'item-13', name: '바닥 청소', lastDoneOn: null },
  { id: 'item-14', name: '물통 교체', lastDoneOn: null },
  { id: 'item-15', name: '가습기 필터 교체', lastDoneOn: null },
  // 80번대 확장 — 집안일 표(ACTION_NOUNS) 밖 동사 테스트용으로 추가.
  { id: 'item-16', name: '병원 방문', lastDoneOn: null },
  { id: 'item-17', name: '미용실 방문', lastDoneOn: null },
];

const NONE: GoldenCadence = { kind: 'none' };

function c(
  n: number,
  text: string,
  kind: GoldenKind,
  trap: boolean,
  save: boolean,
  intent: 'record' | 'query',
  itemName: string | null,
  daysAgo: number | null,
  cadence: GoldenCadence,
  matchId: string | null,
): GoldenCase {
  return { n, text, kind, trap, save, intent, itemName, daysAgo, cadence, matchId };
}

export const GOLDEN_CASES: GoldenCase[] = [
  // completed 1–10
  c(1, '오늘 이불 빨았어', 'completed', false, true, 'record', '이불 빨래', 0, NONE, 'item-1'),
  c(2, '어제 정수기 필터 갈았어', 'completed', false, true, 'record', '정수기 필터 교체', 1, NONE, 'item-2'),
  c(3, '지난 토요일에 에어컨 청소했어', 'completed', false, true, 'record', '에어컨 청소', 2, NONE, 'item-4'),
  c(4, '그저께 화장실 청소했다', 'completed', false, true, 'record', '화장실 청소', 2, NONE, 'item-5'),
  c(5, '오늘 아침 설거지 끝냈어', 'completed', false, true, 'record', '설거지', 0, NONE, 'item-3'),
  c(6, '이틀 전에 커튼 빨아놨어', 'completed', false, true, 'record', '커튼 빨래', 2, NONE, 'item-6'),
  c(7, '오늘 쓰레기 버렸어', 'completed', false, true, 'record', '쓰레기 버리기', 0, NONE, 'item-7'),
  c(8, '어제 청소기 돌렸어', 'completed', false, true, 'record', '청소기 돌리기', 1, NONE, 'item-8'),
  c(9, '오늘 강아지 목욕시켰어', 'completed', false, true, 'record', '강아지 목욕', 0, NONE, 'item-9'),
  c(10, '지난주에 세탁기 청소했어', 'completed', false, true, 'record', '세탁기 청소', 7, NONE, 'item-10'),
  // completed 함정 11–15 — "만"이 가리키는 일만 저장
  c(11, '오늘 이불은 안 건드리고 베개만 빨았어', 'completed', true, true, 'record', '베개 빨래', 0, NONE, 'item-12'),
  c(12, '필터는 그대로 두고 물통만 갈았어', 'completed', true, true, 'record', '물통 교체', 0, NONE, 'item-14'),
  c(13, '청소는 내일로 미루고 설거지만 했어', 'completed', true, true, 'record', '설거지', 0, NONE, 'item-3'),
  c(14, '빨래는 나중에 하고 분리수거만 끝냈어', 'completed', true, true, 'record', '분리수거', 0, NONE, 'item-11'),
  c(15, '창문은 안 닦고 바닥만 닦았어', 'completed', true, true, 'record', '바닥 청소', 0, NONE, 'item-13'),

  // planned 16–30 — 미래. 저장 차단
  c(16, '내일 이불 빨 거야', 'planned', false, false, 'record', '이불 빨래', null, NONE, 'item-1'),
  c(17, '주말에 필터 바꿀 예정이야', 'planned', false, false, 'record', '필터 교체', null, NONE, null),
  c(18, '모레 에어컨 청소하려고', 'planned', false, false, 'record', '에어컨 청소', null, NONE, 'item-4'),
  c(19, '오늘 저녁에 설거지할게', 'planned', false, false, 'record', '설거지', null, NONE, 'item-3'),
  c(20, '이따가 쓰레기 버릴게', 'planned', false, false, 'record', '쓰레기 버리기', null, NONE, 'item-7'),
  c(21, '다음 주에 커튼 빨 거야', 'planned', false, false, 'record', '커튼 빨래', null, NONE, 'item-6'),
  c(22, '내일 아침 청소기 돌릴 예정이야', 'planned', false, false, 'record', '청소기 돌리기', null, NONE, 'item-8'),
  c(23, '주말에 강아지 목욕시킬게', 'planned', false, false, 'record', '강아지 목욕', null, NONE, 'item-9'),
  c(24, '오늘 밤 화장실 청소하려고', 'planned', false, false, 'record', '화장실 청소', null, NONE, 'item-5'),
  c(25, '다음에 세탁기 청소할 거야', 'planned', false, false, 'record', '세탁기 청소', null, NONE, 'item-10'),
  c(26, '어제 하려고 했는데 내일 이불 빨 거야', 'planned', true, false, 'record', '이불 빨래', null, NONE, 'item-1'),
  c(27, '필터는 아직이고 주말에 갈 예정이야', 'planned', true, false, 'record', '필터 교체', null, NONE, null),
  c(28, '청소는 못 했고 내일 하려고', 'planned', true, false, 'record', '청소', null, NONE, null),
  c(29, '설거지는 안 했고 이따가 할게', 'planned', true, false, 'record', '설거지', null, NONE, 'item-3'),
  c(30, '빨래는 끝낸 줄 알았는데 내일 다시 빨 거야', 'planned', true, false, 'record', '이불 빨래', null, NONE, 'item-1'),

  // incomplete 31–45 — 못/안. 저장 차단
  c(31, '오늘 이불 못 빨았어', 'incomplete', false, false, 'record', '이불 빨래', 0, NONE, 'item-1'),
  c(32, '필터 아직 안 갈았어', 'incomplete', false, false, 'record', '필터 교체', null, NONE, null),
  c(33, '오늘 청소하려다 못 했어', 'incomplete', false, false, 'record', '청소', 0, NONE, null),
  c(34, '어제 설거지 안 했어', 'incomplete', false, false, 'record', '설거지', 1, NONE, 'item-3'),
  c(35, '쓰레기 아직 못 버렸어', 'incomplete', false, false, 'record', '쓰레기 버리기', null, NONE, 'item-7'),
  c(36, '커튼은 아직 안 빨았어', 'incomplete', false, false, 'record', '커튼 빨래', null, NONE, 'item-6'),
  c(37, '청소기 돌리다가 못 했어', 'incomplete', false, false, 'record', '청소기 돌리기', null, NONE, 'item-8'),
  c(38, '강아지 목욕은 안 시켰어', 'incomplete', false, false, 'record', '강아지 목욕', null, NONE, 'item-9'),
  c(39, '화장실 청소를 하지 못했어', 'incomplete', false, false, 'record', '화장실 청소', null, NONE, 'item-5'),
  c(40, '세탁기 청소는 아직이야', 'incomplete', false, false, 'record', '세탁기 청소', null, NONE, 'item-10'),
  c(41, '오늘 빨래는 못 했고 설거지만 했어', 'incomplete', true, false, 'record', '설거지', 0, NONE, 'item-3'),
  c(42, '어제 빨려고 했는데 안 했어', 'incomplete', true, false, 'record', '이불 빨래', 1, NONE, 'item-1'),
  c(43, '필터는 갈았는데 이불은 못 빨았어', 'incomplete', true, false, 'record', '이불 빨래', null, NONE, 'item-1'),
  c(44, '청소는 했어도 창문은 안 닦았어', 'incomplete', true, false, 'record', '창문 청소', null, NONE, null),
  c(45, '쓰레기 버렸는데 분리수거는 못 했어', 'incomplete', true, false, 'record', '분리수거', null, NONE, 'item-11'),

  // uncertain 46–60
  c(46, '지난주쯤 이불 빨았던 것 같은데', 'uncertain', false, true, 'record', '이불 빨래', 7, NONE, 'item-1'),
  c(47, '필터 언제 갈았더라', 'uncertain', false, false, 'query', '필터 교체', 0, NONE, null),
  c(48, '아마 어제 청소했던가', 'uncertain', false, true, 'record', '청소', 1, NONE, null),
  c(49, '이불 빨았던 게 지난주였나', 'uncertain', false, true, 'record', '이불 빨래', 7, NONE, 'item-1'),
  c(50, '그저께쯤 설거지한 것 같아', 'uncertain', false, true, 'record', '설거지', 2, NONE, 'item-3'),
  c(51, '쓰레기 버린 지가 며칠 됐지 싶어', 'uncertain', false, false, 'query', '쓰레기 버리기', 0, NONE, 'item-7'),
  c(52, '커튼은 아마 지난달에 빨았나', 'uncertain', false, true, 'record', '커튼 빨래', 30, NONE, 'item-6'),
  c(53, '청소기 돌린 게 언제였더라', 'uncertain', false, false, 'query', '청소기 돌리기', 0, NONE, 'item-8'),
  c(54, '강아지 목욕시킨 지 꽤 된 것 같아', 'uncertain', false, true, 'record', '강아지 목욕', null, NONE, 'item-9'),
  c(55, '화장실 청소가 저번 주쯤이었나', 'uncertain', false, true, 'record', '화장실 청소', 7, NONE, 'item-5'),
  c(56, '빨래는 한 것 같기도 하고 안 한 것 같기도 해', 'uncertain', true, false, 'record', '빨래', null, NONE, null),
  c(57, '필터는 간 것 같은데 정확히 언제인지 모르겠어', 'uncertain', true, true, 'record', '필터 교체', null, NONE, null),
  c(58, '청소는 못 한 것 같기도 하고 한 것 같기도 해', 'uncertain', true, false, 'record', '청소', null, NONE, null),
  c(59, '설거지는 어제인가 그저께인가 했어', 'uncertain', true, true, 'record', '설거지', null, NONE, 'item-3'),
  c(60, '이불은 빨았나 안 빨았나 기억이 안 나', 'uncertain', true, false, 'record', '이불 빨래', null, NONE, 'item-1'),

  // query · interval 61–75
  c(61, '나 이불 빨래 언제 했어?', 'query', false, false, 'query', '이불 빨래', 0, NONE, 'item-1'),
  c(62, '필터 갈아끼운 지 며칠이야?', 'query', false, false, 'query', '필터 교체', 0, NONE, null),
  c(63, '청소기 돌린 지 며칠 됐어?', 'query', false, false, 'query', '청소기 돌리기', 0, NONE, 'item-8'),
  c(64, '마지막에 커튼 언제 빨았어?', 'query', false, false, 'query', '커튼 빨래', 0, NONE, 'item-6'),
  c(65, '설거지 언제 했지?', 'query', false, false, 'query', '설거지', 0, NONE, 'item-3'),
  c(66, '오늘 이불 빨았어, 일주일마다 알려줘', 'completed', false, true, 'record', '이불 빨래', 0, { kind: 'everyDays', days: 7 }, 'item-1'),
  c(67, '어제 필터 갈았어 3일마다', 'completed', false, true, 'record', '필터 교체', 1, { kind: 'everyDays', days: 3 }, null),
  c(68, '쓰레기 버렸어 보름마다 알려줘', 'completed', false, true, 'record', '쓰레기 버리기', 0, { kind: 'everyDays', days: 15 }, 'item-7'),
  c(69, '강아지 목욕시켰어 한 달마다', 'completed', false, true, 'record', '강아지 목욕', 0, { kind: 'everyMonths', months: 1 }, 'item-9'),
  c(70, '오늘 설거지 끝냈어', 'completed', false, true, 'record', '설거지', 0, NONE, 'item-3'),
  c(71, '이불 빨래 한 지 얼마야?', 'query', false, false, 'query', '이불 빨래', 0, NONE, 'item-1'),
  c(72, '필터 언제 갈았어?', 'query', false, false, 'query', '필터 교체', 0, NONE, null),
  c(73, '에어컨 청소 언제 했어', 'query', false, false, 'query', '에어컨 청소', 0, NONE, 'item-4'),
  c(74, '오늘 커튼 빨았어 14일마다 알려줘', 'completed', false, true, 'record', '커튼 빨래', 0, { kind: 'everyDays', days: 14 }, 'item-6'),
  c(75, '화장실 청소했어 이틀마다', 'completed', false, true, 'record', '화장실 청소', 0, { kind: 'everyDays', days: 2 }, 'item-5'),

  // 주기 칩 말투 76–79
  c(76, '오늘 이불 빨았어 매주 금요일 알려줘', 'completed', false, true, 'record', '이불 빨래', 0, { kind: 'weekly', weekday: '금' }, 'item-1'),
  c(77, '오늘 필터 갈았어 매월 10일마다 알려줘', 'completed', false, true, 'record', '필터 교체', 0, { kind: 'monthlyDay', day: 10 }, null),
  c(78, '오늘 화장실 청소했어 매월 마지막 수요일 알려줘', 'completed', false, true, 'record', '화장실 청소', 0, { kind: 'monthlyNthWeekday', nth: 'last', weekday: '수' }, 'item-5'),
  c(79, '오늘 커튼 빨았어 매월 둘째 일요일 알려줘', 'completed', false, true, 'record', '커튼 빨래', 0, { kind: 'monthlyNthWeekday', nth: 2, weekday: '일' }, 'item-6'),

  // 80–87: 규칙 표(ACTION_NOUNS)에 없는 동사. sawAction=false로 모델에게 넘어가는 케이스.
  c(80, '어제 병원 갔다왔어', 'completed', false, true, 'record', '병원 방문', 1, NONE, 'item-16'),
  c(81, '지난주에 세차했어', 'completed', false, true, 'record', '세차', 7, NONE, null),
  c(82, '그저께 치과 검진 받았어', 'completed', false, true, 'record', '치과 검진', 2, NONE, null),
  c(83, '오늘 독감 예방접종 맞았어', 'completed', false, true, 'record', '예방접종', 0, NONE, null),
  c(84, '안경 새로 맞췄어', 'completed', false, true, 'record', '안경 맞춤', 0, NONE, null),
  c(85, '오늘 보험료 냈어', 'completed', false, true, 'record', '보험료 납부', 0, NONE, null),
  c(86, '오늘 미용실 다녀왔어', 'completed', false, true, 'record', '미용실 방문', 0, NONE, 'item-17'),
  c(87, '어제 자동차 정비 받았어', 'completed', false, true, 'record', '자동차 정비', 1, NONE, null),

  // 88–91: "했고/했어 + 앞으로 N마다 할 거야" 복합문. 89·91은 함정 —
  // shouldRecordLog의 future 판정이 "할 거야"에 걸려 이미 끝난 일도 저장 안 함으로 잘못 판단한다.
  c(88, '오늘 병원 다녀왔고, 3개월마다 갈 거야', 'completed', false, true, 'record', '병원 방문', 0, { kind: 'everyMonths', months: 3 }, 'item-16'),
  c(89, '세차했어, 앞으로 한 달마다 할 거야', 'completed', true, true, 'record', '세차', 0, { kind: 'everyMonths', months: 1 }, null),
  c(90, '미용실 다녀왔어, 두 달마다 갈 거야', 'completed', false, true, 'record', '미용실 방문', 0, { kind: 'everyMonths', months: 2 }, 'item-17'),
  c(91, '치과 검진 받았어, 6개월마다 할 거야', 'completed', true, true, 'record', '치과 검진', 0, { kind: 'everyMonths', months: 6 }, null),

  // 92–94: 규칙이 모르거나 잘못 처리하는 날짜 표현. 92는 함정 —
  // "지지난주"를 "지난주"(7일)로만 읽어 14일이어야 할 게 7일로 나온다.
  c(92, '지지난주에 커튼 빨았어', 'completed', true, true, 'record', '커튼 빨래', 14, NONE, 'item-6'),
  c(93, '사흘 전에 화장실 청소했어', 'completed', false, true, 'record', '화장실 청소', 3, NONE, 'item-5'),
  c(94, '지난달 15일에 정수기 필터 갈았어', 'completed', false, true, 'record', '정수기 필터 교체', 30, NONE, 'item-2'),

  // 95–96: 진짜 애매한 날짜. daysAgo는 채점에서 스킵(null)하고 다른 필드만 본다.
  c(95, '이번 주 초에 청소기 돌렸어', 'uncertain', false, true, 'record', '청소기 돌리기', null, NONE, 'item-8'),
  c(96, '얼마 전에 분리수거 했어', 'uncertain', false, true, 'record', '분리수거', null, NONE, 'item-11'),

  // 97–100: 반말·축약 말투. "함/했당/했음" 같은 어미가 섞여도 규칙·모델이 버텨야 한다.
  c(97, '오늘 설거지함', 'completed', false, true, 'record', '설거지', 0, NONE, 'item-3'),
  c(98, '어제 빨래했당', 'completed', false, true, 'record', '빨래', 1, NONE, null),
  c(99, '쓰레기 버렸음', 'completed', false, true, 'record', '쓰레기 버리기', 0, NONE, 'item-7'),
  c(100, '필터 갈아치웠어', 'completed', false, true, 'record', '필터 교체', 0, NONE, null),

  // 101–102: 표 밖 동사 + 조회.
  c(101, '병원 언제 갔었지?', 'query', false, false, 'query', '병원 방문', 0, NONE, 'item-16'),
  c(102, '세차한 지 얼마나 됐어?', 'query', false, false, 'query', '세차', 0, NONE, null),

  // 103: 함정 — "갈다"(교체)와 "가다"의 활용형이 "갈"로 겹쳐서, "미용실 갈 예정"이
  // 방문이 아니라 교체로 잘못 읽힌다. 동음이의어 충돌.
  c(103, '미용실 다음 달에 갈 예정이야', 'planned', true, false, 'record', '미용실 방문', null, NONE, 'item-17'),

  c(104, '강아지 미용했어', 'completed', false, true, 'record', '강아지 미용', 0, NONE, null),
];

if (GOLDEN_CASES.length !== GOLDEN_SIZE) {
  throw new Error(`골든셋 ${GOLDEN_CASES.length}행. ${GOLDEN_SIZE}여야 함`);
}

const KIND_COUNTS: Record<GoldenKind, number> = {
  completed: 0,
  planned: 0,
  incomplete: 0,
  uncertain: 0,
  query: 0,
};
for (const row of GOLDEN_CASES) KIND_COUNTS[row.kind] += 1;
if (KIND_COUNTS.completed !== 46) throw new Error(`completed ${KIND_COUNTS.completed}행. 46여야 함`);
if (KIND_COUNTS.planned !== 16) throw new Error(`planned ${KIND_COUNTS.planned}행. 16여야 함`);
if (KIND_COUNTS.incomplete !== 15) throw new Error(`incomplete ${KIND_COUNTS.incomplete}행. 15여야 함`);
if (KIND_COUNTS.uncertain !== 17) throw new Error(`uncertain ${KIND_COUNTS.uncertain}행. 17여야 함`);
if (KIND_COUNTS.query !== 10) throw new Error(`query ${KIND_COUNTS.query}행. 10여야 함`);

export const GOLDEN_KINDS: Array<{ id: GoldenKind | 'all'; label: string }> = [
  { id: 'all', label: '전체 104' },
  { id: 'completed', label: '했어 46' },
  { id: 'planned', label: '할 거야 16' },
  { id: 'incomplete', label: '못 했어 15' },
  { id: 'uncertain', label: '애매 17' },
  { id: 'query', label: '언제 10' },
];

export function casesForKind(kind: GoldenKind | 'all'): GoldenCase[] {
  return kind === 'all' ? GOLDEN_CASES : GOLDEN_CASES.filter((row) => row.kind === kind);
}

export function cadenceDays(cadence: GoldenCadence): number | null {
  if (cadence.kind === 'none') return null;
  if (cadence.kind === 'everyDays') return cadence.days;
  if (cadence.kind === 'everyMonths') return cadence.months * 30;
  if (cadence.kind === 'weekly') return 7;
  return 30;
}

export function cadenceLabel(cadence: GoldenCadence): string {
  if (cadence.kind === 'none') return '없음';
  if (cadence.kind === 'everyDays') return `${cadence.days}일마다`;
  if (cadence.kind === 'everyMonths') return `${cadence.months}달마다`;
  if (cadence.kind === 'weekly') return `매주 ${cadence.weekday}`;
  if (cadence.kind === 'monthlyDay') return `매월 ${cadence.day}일`;
  if (cadence.nth === 'last') return `매월 마지막 ${cadence.weekday}`;
  return `매월 둘째 ${cadence.weekday}`;
}
