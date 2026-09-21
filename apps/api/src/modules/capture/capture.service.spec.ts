import type { AiParseResponse } from '../../infra/ai/ai.types';
import { CadenceService } from '../cadence/cadence.service';
import type { ItemRow } from '../items/items.repository';
import { CaptureService } from './capture.service';

/**
 * 여기서 검증하는 것은 outcome 분기다.
 * outcome이 프론트의 화면 선택을 그대로 결정하므로(08 / 09 / 07 재확인 시트),
 * 임계값을 바꾸면 사용자가 보는 화면이 바뀐다.
 */

const itemRow = (over: Partial<ItemRow> = {}): ItemRow => ({
  id: 'item-1',
  user_id: 'user-1',
  name: '이불 빨래',
  status: 'active',
  cadence_unit: 'week',
  cadence_interval: 2,
  cadence_weekdays: [],
  notify_time: null,
  cadence_source: 'personal',
  last_done_on: '2026-08-25',
  next_due_on: '2026-09-08',
  snoozed_until: null,
  average_interval_days: 14,
  log_count: 4,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  ...over,
});

const parsed = (over: Partial<AiParseResponse> = {}): AiParseResponse => ({
  normalized_name: '이불 빨래',
  done_on: '2026-09-06',
  matched_item_id: 'item-1',
  candidates: [{ item_id: 'item-1', name: '이불 빨래', similarity: 0.95 }],
  confidence: 0.9,
  reason: null,
  ...over,
});

function buildService(overrides: {
  parse?: AiParseResponse | null;
  items?: ItemRow[];
  /** 주기 사전에 있는 항목이면 일수. 기본은 "사전에 없음". */
  priorDays?: number | null;
}) {
  const rows = overrides.items ?? [itemRow()];

  // null은 "AI가 응답하지 않음"을 뜻하므로 ??로 기본값을 덮으면 안 된다.
  const parseResult = 'parse' in overrides ? overrides.parse : parsed();

  const ai = {
    parseUtterance: jest.fn().mockResolvedValue(parseResult),
    suggestCadence: jest.fn().mockResolvedValue({
      unit: 'month',
      interval: 3,
      weekdays: [],
      source: 'community',
      confidence: 0.8,
      rationale: '제조사 대부분이 3개월 주기 교체를 안내합니다.',
    }),
    embed: jest.fn().mockResolvedValue(null),
  };

  const items = {
    listActive: jest.fn().mockResolvedValue(rows),
    findById: jest.fn().mockResolvedValue(rows[0]),
    matchByMeaning: jest.fn().mockResolvedValue([]),
    recordAlias: jest.fn().mockResolvedValue(undefined),
  };

  const itemsService = { userAverageInterval: jest.fn().mockResolvedValue(14) };

  const priors = {
    find: jest.fn().mockResolvedValue(
      overrides.priorDays
        ? { name: '사전 항목', days: overrides.priorDays, confidence: 0.8, rationale: '사전 근거' }
        : null,
    ),
  };
  const logs = { add: jest.fn() };
  const draft = { sign: jest.fn().mockReturnValue('signed-token'), verify: jest.fn() };

  const service = new CaptureService(
    ai as never,
    items as never,
    itemsService as never,
    logs as never,
    new CadenceService(),
    priors as never,
    draft as never,
  );

  return { service, ai, items, itemsService, priors };
}

const TODAY = new Date('2026-09-06T00:00:00Z');

describe('CaptureService.interpret', () => {
  it('확실한 매칭이면 기존 항목 확인 시트로 보낸다', async () => {
    const { service } = buildService({});

    const result = await service.interpret('user-1', { text: '오늘 이불 빨았어', mode: 'voice' }, TODAY);

    expect(result.outcome).toBe('matched_existing');
    expect(result.matchedItemId).toBe('item-1');
    // 확정된 경우 후보 목록은 비운다 — 사용자에게 고르라고 하지 않는다.
    expect(result.candidates).toHaveLength(0);
  });

  it('기존 항목이면 그 항목의 주기와 평균을 안내한다', async () => {
    const { service } = buildService({});

    const result = await service.interpret('user-1', { text: '이불 빨았어', mode: 'text' }, TODAY);

    expect(result.cadence?.rule.interval).toBe(2);
    expect(result.cadence?.rationale).toContain('평균 14일마다');
  });

  it('후보는 있지만 확신이 부족하면 고르게 한다', async () => {
    const { service, items } = buildService({
      items: [itemRow(), itemRow({ id: 'item-2', name: '이불 커버 세탁' })],
    });
    items.matchByMeaning.mockResolvedValue([
      { item_id: 'item-1', name: '이불 빨래', similarity: 0.7 },
      { item_id: 'item-2', name: '이불 커버 세탁', similarity: 0.62 },
    ]);

    const result = await service.interpret(
      'user-1',
      {
        text: '지난주에 이불 빠라써',
        mode: 'voice',
        slots: {
          intent: 'record',
          itemName: '이불',
          daysAgo: 7,
          statedCadenceDays: null,
          confidence: 0.7,
        },
      },
      TODAY,
    );

    expect(result.outcome).toBe('ambiguous');
    expect(result.candidates).toHaveLength(2);
    // 유사도 내림차순이어야 화면에서 첫 번째가 가장 그럴듯하다.
    expect(result.candidates[0]!.similarity).toBeGreaterThan(result.candidates[1]!.similarity);
  });

  it('후보가 전혀 없으면 새 항목으로 본다', async () => {
    const { service } = buildService({
      parse: parsed({
        normalized_name: '화분 흙 갈기',
        matched_item_id: null,
        candidates: [],
      }),
    });

    const result = await service.interpret('user-1', { text: '오늘 화분 흙 갈았어', mode: 'text' }, TODAY);

    expect(result.outcome).toBe('new_item');
    expect(result.cadence?.source).toBe('community');
    expect(result.cadence?.rule.interval).toBe(3);
  });

  it('항목명을 못 뽑으면 재시도로 보낸다', async () => {
    const { service } = buildService({
      parse: parsed({ normalized_name: null, matched_item_id: null, candidates: [], confidence: 0.1 }),
    });

    const result = await service.interpret('user-1', { text: '음...', mode: 'voice' }, TODAY);

    expect(result.outcome).toBe('unrecognized');
    expect(result.cadence).toBeNull();
  });

  it('확신도가 낮으면 항목명이 있어도 재시도로 보낸다', async () => {
    const { service, items } = buildService({});
    items.matchByMeaning.mockResolvedValue([]);

    const result = await service.interpret(
      'user-1',
      {
        text: '뭐 했는데',
        mode: 'voice',
        slots: {
          intent: 'record',
          itemName: '이불 빨래',
          daysAgo: 0,
          statedCadenceDays: null,
          confidence: 0.2,
        },
      },
      TODAY,
    );

    expect(result.outcome).toBe('unrecognized');
  });

  it('약한 후보는 걸러낸다', async () => {
    const { service, items } = buildService({
      items: [itemRow(), itemRow({ id: 'item-2', name: '수건 교체' })],
    });
    items.matchByMeaning.mockResolvedValue([
      { item_id: 'item-1', name: '이불 빨래', similarity: 0.7 },
      { item_id: 'item-2', name: '수건 교체', similarity: 0.2 },
    ]);

    const result = await service.interpret(
      'user-1',
      {
        text: '이불 관련',
        mode: 'text',
        slots: {
          intent: 'record',
          itemName: '이불',
          daysAgo: 0,
          statedCadenceDays: null,
          confidence: 0.7,
        },
      },
      TODAY,
    );

    expect(result.candidates.map((c) => c.itemId)).toEqual(['item-1']);
  });
});

describe('CaptureService.interpret — AI 장애 시', () => {
  it('AI가 응답하지 않아도 실패하지 않고 직접 고르게 한다', async () => {
    const { service, items } = buildService({ parse: null });
    items.matchByMeaning.mockResolvedValue([
      { item_id: 'item-1', name: '이불 빨래', similarity: 0.6, last_done_on: '2026-08-25' },
    ]);

    /**
     * 아는 행동이 없는 말이어야 폴백까지 온다.
     * 행동을 알아보면 규칙이 이름을 세워 새 항목으로 간다.
     */
    const result = await service.interpret(
      'user-1',
      { text: '음 그거 있잖아', mode: 'text' },
      TODAY,
    );

    expect(result.outcome).toBe('ambiguous');
    expect(result.candidates).toHaveLength(1);
    expect(result.confidence).toBe(0);
    // 화면이 "또렷하게 말해주세요" 대신 다른 말을 하도록 원인을 알려준다.
    expect(result.degraded).toBe(true);
    // 토큰은 여전히 발급돼야 커밋으로 이어갈 수 있다.
    expect(result.draftToken).toBe('signed-token');
  });

  it('이름을 그대로 적었으면 AI가 죽어 있어도 바로 매칭한다', async () => {
    // 자주 쓰는 문장 칩(설계 06)은 항목 이름을 그대로 넣는다.
    // 눌러서 넣은 이름을 "혹시 이건가요?" 하고 되묻는 일이 없어야 한다.
    const { service, ai } = buildService({ parse: null });

    const result = await service.interpret('user-1', { text: '이불 빨래', mode: 'text' }, TODAY);

    expect(result.outcome).toBe('matched_existing');
    expect(result.matchedItemId).toBe('item-1');
    expect(result.confidence).toBe(1);
    expect(result.degraded).toBe(false);
    // AI에게 물어볼 것이 없으므로 부르지도 않는다.
    expect(ai.parseUtterance).not.toHaveBeenCalled();
  });

  it('띄어쓰기가 달라도 같은 이름으로 본다', async () => {
    const { service } = buildService({ parse: null });

    const result = await service.interpret('user-1', { text: '이불빨래', mode: 'text' }, TODAY);

    expect(result.outcome).toBe('matched_existing');
    expect(result.matchedItemId).toBe('item-1');
  });

  it('AI 키가 없으면 해석 없이 폴백으로 간다', async () => {
    // AiClient 가 키 없음을 null 로 알린다. 호출부는 장애와 똑같이 다룬다.
    const { service, items } = buildService({ parse: null });
    items.matchByMeaning.mockResolvedValue([]);

    const result = await service.interpret(
      'user-1',
      { text: '음 그거 있잖아', mode: 'text' },
      TODAY,
    );

    expect(result.degraded).toBe(true);
    expect(result.outcome).toBe('unrecognized');
  });
});

describe('CaptureService.interpret — 규칙으로 끝나는 문장', () => {
  it('자주 하던 일을 다시 남길 때는 AI를 부르지 않는다', async () => {
    // 앱에서 제일 흔한 경우다. 여기서 LLM 을 부르면 돈과 시간을 쓰고 같은 답을 받는다.
    const { service, ai } = buildService({});

    const result = await service.interpret(
      'user-1',
      { text: '오늘 이불 빨았어', mode: 'voice' },
      TODAY,
    );

    expect(result.outcome).toBe('matched_existing');
    expect(result.matchedItemId).toBe('item-1');
    expect(result.degraded).toBe(false);
    expect(ai.parseUtterance).not.toHaveBeenCalled();
  });

  it('규칙이 날짜를 읽어 기록일을 앞으로 옮긴다', async () => {
    const { service, ai } = buildService({});

    const result = await service.interpret(
      'user-1',
      { text: '그저께 이불 빨았어', mode: 'text' },
      TODAY,
    );

    expect(result.doneOn).toBe('2026-09-04');
    expect(ai.parseUtterance).not.toHaveBeenCalled();
  });

  it('주기를 직접 말한 새 항목은 조사도 하지 않는다', async () => {
    // 사용자가 말한 주기가 최우선이라 커뮤니티 통계를 물어볼 이유가 없다.
    const { service, ai } = buildService({});

    const result = await service.interpret(
      'user-1',
      { text: '세탁조 청소했어 세달에 한번 할래', mode: 'voice' },
      TODAY,
    );

    expect(result.outcome).toBe('new_item');
    expect(result.normalizedName).toBe('세탁조 청소');
    expect(result.cadence?.source).toBe('user');
    expect(result.cadence?.rule).toMatchObject({ unit: 'month', interval: 3 });
    expect(ai.parseUtterance).not.toHaveBeenCalled();
    expect(ai.suggestCadence).not.toHaveBeenCalled();
  });

  it('물어본 것이면 기록하지 않고 답만 돌려준다', async () => {
    const { service, ai } = buildService({});

    const result = await service.interpret(
      'user-1',
      { text: '이불 언제 빨았지?', mode: 'voice' },
      TODAY,
    );

    expect(result.outcome).toBe('answered');
    expect(result.answer?.itemId).toBe('item-1');
    expect(ai.parseUtterance).not.toHaveBeenCalled();
  });

  it('처음 보는 항목인데 주기도 없으면 주기만 AI 에게 묻는다', async () => {
    const { service, ai } = buildService({});

    const result = await service.interpret('user-1', { text: '베란다 창틀 닦았어', mode: 'text' }, TODAY);

    expect(result.outcome).toBe('new_item');
    expect(result.normalizedName).toBe('베란다 창틀 청소');
    expect(ai.parseUtterance).not.toHaveBeenCalled();
    expect(ai.suggestCadence).toHaveBeenCalled();
  });

  it('사전에 없는 동사도 완료면 새 항목으로 간다', async () => {
    const { service, ai } = buildService({});

    const result = await service.interpret(
      'user-1',
      { text: '오늘 가습기 필터 설치했어', mode: 'text' },
      TODAY,
    );

    expect(result.outcome).toBe('new_item');
    expect(result.normalizedName).toBe('가습기 필터 설치');
    expect(ai.parseUtterance).not.toHaveBeenCalled();
    expect(ai.suggestCadence).toHaveBeenCalled();
  });

  it('했고 뒤에 할거야는 말한 주기로 저장한다', async () => {
    const { service, ai } = buildService({});

    const result = await service.interpret(
      'user-1',
      { text: '오늘 가습기 필터 설치했고 한달마다 할거야', mode: 'voice' },
      TODAY,
    );

    expect(result.outcome).toBe('new_item');
    expect(result.normalizedName).toBe('가습기 필터 설치');
    expect(result.cadence?.source).toBe('user');
    expect(result.cadence?.rule).toMatchObject({ unit: 'month', interval: 1 });
    expect(ai.parseUtterance).not.toHaveBeenCalled();
    expect(ai.suggestCadence).not.toHaveBeenCalled();
  });

  it('못 한 일은 확인 시트를 열지 않는다', async () => {
    const { service, ai } = buildService({});

    const result = await service.interpret(
      'user-1',
      { text: '오늘 이불 못 빨았어', mode: 'voice' },
      TODAY,
    );

    expect(result.outcome).toBe('unrecognized');
    expect(result.normalizedName).toBeNull();
    expect(ai.parseUtterance).not.toHaveBeenCalled();
    expect(ai.suggestCadence).not.toHaveBeenCalled();
  });

  it('순수 예정은 확인 시트를 열지 않는다', async () => {
    const { service, ai } = buildService({});

    const result = await service.interpret(
      'user-1',
      { text: '내일 가습기 필터 설치할거야', mode: 'text' },
      TODAY,
    );

    expect(result.outcome).toBe('unrecognized');
    expect(ai.parseUtterance).not.toHaveBeenCalled();
  });
});

describe('CaptureService.interpret — 규칙이 이름만 뽑은 새 항목', () => {
  it('규칙이 이름을 뽑았으면 그걸로 확인 시트를 내고 주기만 묻는다', async () => {
    const { service, ai } = buildService({ parse: null });

    const result = await service.interpret(
      'user-1',
      { text: '나 어제 화장실 청소했어', mode: 'voice' },
      TODAY,
    );

    expect(result.outcome).toBe('new_item');
    expect(result.normalizedName).toBe('화장실 청소');
    expect(result.doneOn).toBe('2026-09-05');
    expect(result.cadence?.source).toBe('community');
    expect(result.draftToken).toBe('signed-token');
    expect(ai.parseUtterance).not.toHaveBeenCalled();
    expect(ai.suggestCadence).toHaveBeenCalled();
  });

  it('이름조차 못 뽑으면 직접 고르게 한다', async () => {
    const { service, items } = buildService({ parse: null });
    items.matchByMeaning.mockResolvedValue([]);

    const result = await service.interpret(
      'user-1',
      { text: '음 그러니까 그거', mode: 'voice' },
      TODAY,
    );

    expect(result.outcome).toBe('unrecognized');
    expect(result.normalizedName).toBeNull();
    expect(result.degraded).toBe(true);
  });
});

describe('CaptureService.interpret — 기준일 기본값', () => {
  /**
   * today 를 넘기지 않으면 한국 날짜로 잡히는지 본다.
   *
   * 배포 서버는 UTC 라서, 예전에는 한국 새벽에 남긴 기록이 어제 날짜로 저장됐다.
   * 시계를 그 시각으로 고정해 실제 호출 경로에서 확인한다.
   */
  beforeAll(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-16T17:04:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('UTC 로는 어제인 시각에도 한국 날짜로 기록한다', async () => {
    const { service } = buildService({ parse: null, items: [] });

    const result = await service.interpret('user-1', {
      text: '오늘 베란다 창틀 닦았어',
      mode: 'text',
    });

    expect(result.doneOn).toBe('2026-09-17');
  });
});

describe('CaptureService.interpret — 주기 사전', () => {
  /**
   * 사전은 AI 가 조사한 답이 쌓이는 곳이다. 두 번째로 같은 항목을 만나면
   * AI 를 부르지 않고 끝나야 한다 — 빠르고, AI 가 자고 있어도 정확하다.
   */
  it('사전에 있으면 AI 에게 주기를 묻지 않는다', async () => {
    const { service, ai } = buildService({
      parse: parsed({ normalized_name: '옷 빨래', matched_item_id: null, candidates: [] }),
      priorDays: 3,
    });

    const result = await service.interpret('user-1', { text: '오늘 옷 빨았어', mode: 'text' }, TODAY);

    expect(result.cadence?.rule).toMatchObject({ unit: 'day', interval: 3 });
    expect(result.cadence?.source).toBe('community');
    expect(result.cadence?.rationale).toBe('사전 근거');
    expect(ai.suggestCadence).not.toHaveBeenCalled();
  });

  it('사전에 없으면 AI 에게 묻는다', async () => {
    const { service, ai } = buildService({
      parse: parsed({ normalized_name: '운동화 빨래', matched_item_id: null, candidates: [] }),
    });

    await service.interpret('user-1', { text: '오늘 운동화 빨았어', mode: 'text' }, TODAY);

    expect(ai.suggestCadence).toHaveBeenCalled();
  });

  /**
   * 실기기에서 나온 문제다 — AI 가 잠든 사이 "옷 빨래" 가 2주마다로 저장됐다.
   * 사전에 답이 있는데도 못 읽어서 생긴 일이라, 이 경로에서도 사전을 본다.
   */
  it('AI 가 안 깨어나도 사전에 있으면 그 주기를 쓴다', async () => {
    const { service, ai } = buildService({ parse: null, priorDays: 3 });

    const result = await service.interpret(
      'user-1',
      { text: '어제 세탁했어 옷', mode: 'voice' },
      TODAY,
    );

    expect(result.cadence?.rule).toMatchObject({ unit: 'day', interval: 3 });
    expect(result.cadence?.source).toBe('community');
    // 사전은 DB 한 번이라 빠르다. 자고 있는 AI 는 여전히 부르지 않는다.
    expect(ai.suggestCadence).not.toHaveBeenCalled();
  });
});

describe('CaptureService.previewCadence — 이름을 고쳤을 때', () => {
  /**
   * 실기기에서 나온 문제다. "2주마다" 라고 말해 놓고 이름만 고쳤더니
   * 사전값 12달로 바뀌어 보였다. 사용자가 이미 정한 주기가 최우선이다.
   */
  it('사용자가 정한 주기가 있으면 사전으로 덮지 않는다', async () => {
    const { service, ai } = buildService({ priorDays: 365 });

    const result = await service.previewCadence('user-1', {
      name: '도어락 건전지 교체',
      doneOn: '2026-09-06',
      statedCadenceDays: 14,
    });

    expect(result.cadence?.rule).toMatchObject({ unit: 'week', interval: 2 });
    expect(result.cadence?.source).toBe('user');
    expect(ai.suggestCadence).not.toHaveBeenCalled();
  });

  it('정한 주기가 없으면 사전을 따른다', async () => {
    const { service } = buildService({ priorDays: 365 });

    const result = await service.previewCadence('user-1', {
      name: '도어락 건전지 교체',
      doneOn: '2026-09-06',
    });

    expect(result.cadence?.source).toBe('community');
  });
});

describe('CaptureService.interpret — 브라우저 슬롯', () => {
  it('칸이 오면 문장을 다시 해석하지 않고 매칭만 한다', async () => {
    const { service, ai } = buildService({ items: [] });

    const result = await service.interpret(
      'user-1',
      {
        text: '오늘 헤어샵 다녀왔어',
        mode: 'voice',
        slots: {
          intent: 'record',
          itemName: '헤어샵',
          daysAgo: 0,
          statedCadenceDays: null,
          confidence: 0.8,
        },
      },
      TODAY,
    );

    expect(result.outcome).toBe('new_item');
    expect(result.normalizedName).toBe('헤어샵');
    expect(ai.parseUtterance).not.toHaveBeenCalled();
  });

  it('조회 칸이면 답을 돌려주고 저장하지 않는다', async () => {
    const { service, ai } = buildService({});

    const result = await service.interpret(
      'user-1',
      {
        text: '그거 언제 했지?',
        mode: 'voice',
        slots: {
          intent: 'query',
          itemName: '이불 빨래',
          daysAgo: 0,
          statedCadenceDays: null,
          confidence: 0.9,
        },
      },
      TODAY,
    );

    expect(result.outcome).toBe('answered');
    expect(result.answer?.name).toBe('이불 빨래');
    expect(ai.parseUtterance).not.toHaveBeenCalled();
  });

  it('칸 이름이 애매하면 되묻는다', async () => {
    const { service, ai, items } = buildService({
      items: [itemRow(), itemRow({ id: 'item-2', name: '이불 커버' })],
    });
    items.matchByMeaning.mockResolvedValue([
      { item_id: 'item-1', name: '이불 빨래', similarity: 0.6 },
      { item_id: 'item-2', name: '이불 커버', similarity: 0.55 },
    ]);

    const result = await service.interpret(
      'user-1',
      {
        text: '이불 했어',
        mode: 'voice',
        slots: {
          intent: 'record',
          itemName: '이불',
          daysAgo: 0,
          statedCadenceDays: null,
          confidence: 0.7,
        },
      },
      TODAY,
    );

    expect(result.outcome).toBe('ambiguous');
    expect(result.candidates.map((c) => c.name)).toEqual(['이불 빨래', '이불 커버']);
    expect(ai.parseUtterance).not.toHaveBeenCalled();
  });

  it('칸에 이름도 확신도 없으면 재확인으로 보낸다', async () => {
    const { service, ai, items } = buildService({});
    items.matchByMeaning.mockResolvedValue([]);

    const result = await service.interpret(
      'user-1',
      {
        text: '음 그거',
        mode: 'text',
        slots: {
          intent: 'record',
          itemName: null,
          daysAgo: 0,
          statedCadenceDays: null,
          confidence: 0.2,
        },
      },
      TODAY,
    );

    expect(result.outcome).toBe('unrecognized');
    expect(result.normalizedName).toBeNull();
    expect(ai.parseUtterance).not.toHaveBeenCalled();
  });
});
