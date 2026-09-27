export type GoldenIntent =
  | 'COMPLETED'
  | 'NOT_COMPLETED'
  | 'PLANNED'
  | 'QUERY'
  | 'UNCERTAIN'
  | 'UNKNOWN';

export type GoldenCategory =
  | 'completed'
  | 'not_completed'
  | 'planned'
  | 'query'
  | 'uncertain'
  | 'unknown'
  | 'false_completion_date';

export type RuleGoldenCase = {
  id: string;
  category: GoldenCategory;
  text: string;
  expected: {
    intent: GoldenIntent;
    /** 현재 규칙 parser의 willSave에 대응한다. 다른 엔진 비교 시 record_candidate로 매핑한다. */
    recordCandidate: boolean;
    daysAgo?: number;
    cadenceDays?: number | null;
    normalizedName?: string;
  };
};

/** 모든 엔진이 같은 기준일로 실행하도록 고정한 테스트 기준일. */
export const RULE_GOLDEN_REFERENCE_DATE = '2026-09-13';

/**
 * 규칙·로컬 AI·클라우드 LLM이 공유할 자연어 의미 기준 세트.
 *
 * 문장을 추가하거나 기대값을 바꿀 때는 제품 규칙 검토가 필요하다. 특히
 * recordCandidate=false인 문장은 False Completion 방지용 회귀 기준이다.
 */
export const RULE_GOLDEN_CASES: readonly RuleGoldenCase[] = [
  {
    id: 'completed-today-bedding',
    category: 'completed',
    text: '오늘 이불 빨았어',
    expected: { intent: 'COMPLETED', recordCandidate: true, daysAgo: 0, normalizedName: '이불 빨래' },
  },
  {
    id: 'completed-yesterday-plant',
    category: 'completed',
    text: '어제 화분 물 줬어',
    expected: { intent: 'COMPLETED', recordCandidate: true, daysAgo: 1, normalizedName: '화분 물 주기' },
  },
  {
    id: 'completed-day-before-toothbrush',
    category: 'completed',
    text: '그저께 칫솔 갈았어',
    expected: { intent: 'COMPLETED', recordCandidate: true, daysAgo: 2, normalizedName: '칫솔 교체' },
  },
  {
    id: 'completed-relative-days',
    category: 'completed',
    text: '3일 전에 정수기 필터 갈았어',
    expected: { intent: 'COMPLETED', recordCandidate: true, daysAgo: 3, normalizedName: '정수기 필터 교체' },
  },
  {
    id: 'completed-absolute-date',
    category: 'completed',
    text: '2026년 9월 10일 방 청소했어',
    expected: { intent: 'COMPLETED', recordCandidate: true, daysAgo: 3, normalizedName: '방 청소' },
  },
  {
    id: 'completed-weekday',
    category: 'completed',
    text: '지난주 일요일에 욕실 배수구 청소했어',
    expected: { intent: 'COMPLETED', recordCandidate: true, daysAgo: 7, normalizedName: '욕실 배수구 청소' },
  },
  {
    id: 'completed-omitted-date',
    category: 'completed',
    text: '화분 물 줬어',
    expected: { intent: 'COMPLETED', recordCandidate: true, normalizedName: '화분 물 주기' },
  },
  {
    id: 'completed-action-noun',
    category: 'completed',
    text: '강아지 산책시켰어',
    expected: { intent: 'COMPLETED', recordCandidate: true, normalizedName: '강아지 산책' },
  },
  {
    id: 'completed-unknown-verb',
    category: 'completed',
    text: '좋은 세제 넣었어',
    expected: { intent: 'COMPLETED', recordCandidate: true, normalizedName: '좋은 세제 보충' },
  },
  {
    id: 'completed-monthly-cycle',
    category: 'completed',
    text: '오늘 이불 빨았어 한달에 한번 빨거야',
    expected: { intent: 'COMPLETED', recordCandidate: true, daysAgo: 0, cadenceDays: 30, normalizedName: '이불 빨래' },
  },
  {
    id: 'completed-quarterly-cycle',
    category: 'completed',
    text: '세탁조 청소했어 세달에 한번 할래',
    expected: { intent: 'COMPLETED', recordCandidate: true, cadenceDays: 90, normalizedName: '세탁조 청소' },
  },
  {
    id: 'completed-action-noun-with-space',
    category: 'completed',
    text: '침구 빨래 했어',
    expected: { intent: 'COMPLETED', recordCandidate: true, normalizedName: '침구 빨래' },
  },
  {
    id: 'completed-install',
    category: 'completed',
    text: '오늘 가습기 필터 설치했어',
    expected: { intent: 'COMPLETED', recordCandidate: true, normalizedName: '가습기 필터 설치' },
  },

  {
    id: 'not-completed-cannot-laundry',
    category: 'not_completed',
    text: '오늘 이불 못 빨았어',
    expected: { intent: 'NOT_COMPLETED', recordCandidate: false },
  },
  {
    id: 'not-completed-spaced-negative',
    category: 'not_completed',
    text: '화분 물 안 줬어',
    expected: { intent: 'NOT_COMPLETED', recordCandidate: false },
  },
  {
    id: 'not-completed-cannot-water',
    category: 'not_completed',
    text: '화분 물 못 줬어',
    expected: { intent: 'NOT_COMPLETED', recordCandidate: false },
  },
  {
    id: 'not-completed-still-not',
    category: 'not_completed',
    text: '아직 신발 안 빨았어',
    expected: { intent: 'NOT_COMPLETED', recordCandidate: false },
  },
  {
    id: 'not-completed-abandoned-attempt',
    category: 'not_completed',
    text: '신발 빨려다가 말았어',
    expected: { intent: 'NOT_COMPLETED', recordCandidate: false },
  },
  {
    id: 'not-completed-near-miss',
    category: 'not_completed',
    text: '신발 빨 뻔했어',
    expected: { intent: 'NOT_COMPLETED', recordCandidate: false },
  },
  {
    id: 'not-completed-attached-negative',
    category: 'not_completed',
    text: '문안열었어',
    expected: { intent: 'NOT_COMPLETED', recordCandidate: false },
  },
  {
    id: 'not-completed-cannot-close',
    category: 'not_completed',
    text: '창문 닫지 못했어',
    expected: { intent: 'NOT_COMPLETED', recordCandidate: false },
  },

  {
    id: 'planned-tomorrow',
    category: 'planned',
    text: '내일 이불 빨 거야',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'planned-day-after',
    category: 'planned',
    text: '모레 방 청소할게',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'planned-next-week',
    category: 'planned',
    text: '다음 주 필터 갈려고 해',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'planned-trying-to',
    category: 'planned',
    text: '신발 빨려고 했어',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'planned-obligation',
    category: 'planned',
    text: '신발 빨아야 해',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'planned-intention-past',
    category: 'planned',
    text: '신발 빨 생각이었어',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'planned-deliberation',
    category: 'planned',
    text: '신발 빨까 했어',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'planned-past-obligation',
    category: 'planned',
    text: '책을 읽어야 했어',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'planned-past-desire',
    category: 'planned',
    text: '방 청소하고 싶었어',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'planned-cycle-intention',
    category: 'planned',
    text: '화분 물 줄 생각이야',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },

  {
    id: 'query-last-completed',
    category: 'query',
    text: '마지막으로 이불 언제 빨았지?',
    expected: { intent: 'QUERY', recordCandidate: false },
  },
  {
    id: 'query-filter-last',
    category: 'query',
    text: '필터 마지막에 언제 갈았지?',
    expected: { intent: 'QUERY', recordCandidate: false },
  },
  {
    id: 'query-elapsed-time',
    category: 'query',
    text: '칫솔 간 지 얼마나 됐어?',
    expected: { intent: 'QUERY', recordCandidate: false },
  },
  {
    id: 'query-recall',
    category: 'query',
    text: '이불 언제 빨았더라',
    expected: { intent: 'QUERY', recordCandidate: false },
  },
  {
    id: 'query-action',
    category: 'query',
    text: '신발 언제 빨았어?',
    expected: { intent: 'QUERY', recordCandidate: false },
  },
  {
    id: 'query-item-action',
    category: 'query',
    text: '렌즈 교체 언제 했어?',
    expected: { intent: 'QUERY', recordCandidate: false },
  },
  {
    id: 'query-no-target',
    category: 'query',
    text: '언제 했어?',
    expected: { intent: 'QUERY', recordCandidate: false },
  },

  {
    id: 'uncertain-looks-like-completed',
    category: 'uncertain',
    text: '이불 빨았던 것 같아',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
  {
    id: 'uncertain-possibility',
    category: 'uncertain',
    text: '신발 빨았을 수도 있어',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
  {
    id: 'uncertain-speculation',
    category: 'uncertain',
    text: '아마 화분에 물 줬어',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
  {
    id: 'uncertain-third-person',
    category: 'uncertain',
    text: '친구가 식탁 닦았어',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
  {
    id: 'uncertain-reported-speech',
    category: 'uncertain',
    text: '문 열었다고 들었어',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
  {
    id: 'uncertain-reported-ending',
    category: 'uncertain',
    text: '방 청소했다며',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
  {
    id: 'uncertain-hearsay-short',
    category: 'uncertain',
    text: '방 청소했대',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
  {
    id: 'uncertain-memory-question',
    category: 'uncertain',
    text: '신발 빨았나 모르겠어',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
  {
    id: 'uncertain-memory-with-clause',
    category: 'uncertain',
    text: '약 먹였는지 모르겠어',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
  {
    id: 'uncertain-deliberation-recall',
    category: 'uncertain',
    text: '정수기 필터 갈았던가',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },

  {
    id: 'unknown-descriptive-past',
    category: 'unknown',
    text: '오늘 점심 맛있었다',
    expected: { intent: 'UNKNOWN', recordCandidate: false },
  },
  {
    id: 'unknown-anaphora',
    category: 'unknown',
    text: '응 그거야',
    expected: { intent: 'UNKNOWN', recordCandidate: false },
  },
  {
    id: 'unknown-state-past',
    category: 'unknown',
    text: '나는 피곤했어',
    expected: { intent: 'UNKNOWN', recordCandidate: false },
  },
  {
    id: 'unknown-descriptive-present',
    category: 'unknown',
    text: '화분이 예뻐',
    expected: { intent: 'UNKNOWN', recordCandidate: false },
  },
  {
    id: 'unknown-weather',
    category: 'unknown',
    text: '오늘 날씨 좋다',
    expected: { intent: 'UNKNOWN', recordCandidate: false },
  },

  {
    id: 'false-completion-future-absolute',
    category: 'false_completion_date',
    text: '2099년 8월 1일 방 청소했어',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'false-completion-future-relative',
    category: 'false_completion_date',
    text: '내일 방 청소했어',
    expected: { intent: 'PLANNED', recordCandidate: false },
  },
  {
    id: 'false-completion-invalid-date',
    category: 'false_completion_date',
    text: '2026년 2월 30일 방 청소했어',
    expected: { intent: 'UNCERTAIN', recordCandidate: false },
  },
];
