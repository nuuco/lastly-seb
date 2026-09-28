import type { RuleGoldenCase } from './rule-golden.cases';

type SequenceSpec = {
  target: string;
  past: string;
  connectedPast: string;
  normalizedName: string;
};

type DatePrefix = {
  text: string;
  daysAgo: number;
};

type CadenceVariant = {
  suffix: (spec: SequenceSpec) => string;
  days: number;
};

/** 완료 동사·대상 조합을 넓혀도 기대 이름은 항상 명시적으로 고정한다. */
const SEQUENCE_SPECS: readonly SequenceSpec[] = [
  { target: '책', past: '읽었어', connectedPast: '읽었고', normalizedName: '책 읽기' },
  { target: '주방후드', past: '청소했어', connectedPast: '청소했고', normalizedName: '주방후드 청소' },
  { target: '이불', past: '빨았어', connectedPast: '빨았고', normalizedName: '이불 빨래' },
  { target: '화분', past: '물 줬어', connectedPast: '물 줬고', normalizedName: '화분 물 주기' },
  { target: '칫솔', past: '갈았어', connectedPast: '갈았고', normalizedName: '칫솔 교체' },
  { target: '정수기 필터', past: '갈았어', connectedPast: '갈았고', normalizedName: '정수기 필터 교체' },
  { target: '방', past: '청소했어', connectedPast: '청소했고', normalizedName: '방 청소' },
  { target: '가습기 필터', past: '설치했어', connectedPast: '설치했고', normalizedName: '가습기 필터 설치' },
  { target: '세탁조', past: '청소했어', connectedPast: '청소했고', normalizedName: '세탁조 청소' },
  { target: '욕실 배수구', past: '청소했어', connectedPast: '청소했고', normalizedName: '욕실 배수구 청소' },
  { target: '강아지', past: '산책시켰어', connectedPast: '산책시켰고', normalizedName: '강아지 산책' },
  { target: '워셔액', past: '넣었어', connectedPast: '넣었고', normalizedName: '워셔액 보충' },
  { target: '세제', past: '채웠어', connectedPast: '채웠고', normalizedName: '세제 보충' },
  { target: '강아지 발톱', past: '깎았어', connectedPast: '깎았고', normalizedName: '강아지 발톱 깎기' },
  { target: '화분', past: '분갈이 했어', connectedPast: '분갈이 했고', normalizedName: '화분 분갈이' },
  { target: '강아지', past: '양치시켰어', connectedPast: '양치시켰고', normalizedName: '강아지 양치' },
  { target: '어항', past: '물갈이 했어', connectedPast: '물갈이 했고', normalizedName: '어항 물갈이' },
  { target: '차', past: '세차했어', connectedPast: '세차했고', normalizedName: '차 세차' },
  { target: '창문', past: '닦았어', connectedPast: '닦았고', normalizedName: '창문 청소' },
  { target: '책상', past: '닦았어', connectedPast: '닦았고', normalizedName: '책상 청소' },
  { target: '렌즈', past: '교체했어', connectedPast: '교체했고', normalizedName: '렌즈 교체' },
  { target: '필터', past: '갈았어', connectedPast: '갈았고', normalizedName: '필터 교체' },
  { target: '', past: '분리수거 했어', connectedPast: '분리수거 했고', normalizedName: '분리수거' },
  { target: '', past: '설거지 했어', connectedPast: '설거지 했고', normalizedName: '설거지' },
  { target: '', past: '다림질 했어', connectedPast: '다림질 했고', normalizedName: '다림질' },
];

const DATE_PREFIXES: readonly DatePrefix[] = [
  { text: '오늘', daysAgo: 0 },
  { text: '어제', daysAgo: 1 },
  { text: '그저께', daysAgo: 2 },
  { text: '3일 전에', daysAgo: 3 },
  { text: '나 오늘', daysAgo: 0 },
];

const CADENCE_VARIANTS: readonly CadenceVariant[] = [
  {
    suffix: (spec) => `${spec.past} 한달에 한번씩 할거야`,
    days: 30,
  },
  {
    suffix: (spec) => `${spec.past} 일주일에 한번씩 할거야`,
    days: 7,
  },
  {
    suffix: (spec) => `${spec.connectedPast} 한달에 한번씩 할거야`,
    days: 30,
  },
  {
    // 완료 사실 뒤의 미래 표현은 수행일이 아니라 반복 일정의 시작점이다.
    suffix: (spec) => `${spec.connectedPast} 다음주부터 일주일에 한번씩할거야`,
    days: 7,
  },
];

/** 25 × 5 × 4 = 500개의 고정 문장을 만든다. */
export const RULE_SEQUENCE_GOLDEN_CASES: readonly RuleGoldenCase[] = SEQUENCE_SPECS.flatMap((spec) =>
  DATE_PREFIXES.flatMap((date) =>
    CADENCE_VARIANTS.map((cadence) => ({
      date,
      cadence,
      spec,
      text: `${date.text} ${spec.target} ${cadence.suffix(spec)}`,
    })),
  ),
).map(({ date, cadence, spec, text }, index) => ({
  id: `sequence-${String(index + 1).padStart(3, '0')}`,
  category: 'completed',
  text,
  expected: {
    intent: 'COMPLETED',
    recordCandidate: true,
    daysAgo: date.daysAgo,
    cadenceDays: cadence.days,
    normalizedName: spec.normalizedName,
  },
}));
