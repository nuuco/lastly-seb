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
  const logs = { add: jest.fn() };
  const draft = { sign: jest.fn().mockReturnValue('signed-token'), verify: jest.fn() };

  const service = new CaptureService(
    ai as never,
    items as never,
    itemsService as never,
    logs as never,
    new CadenceService(),
    draft as never,
  );

  return { service, ai, items, itemsService };
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
    const { service } = buildService({
      parse: parsed({
        matched_item_id: null,
        candidates: [
          { item_id: 'item-1', name: '이불 빨래', similarity: 0.7 },
          { item_id: 'item-2', name: '이불 커버 세탁', similarity: 0.62 },
        ],
      }),
      items: [itemRow(), itemRow({ id: 'item-2', name: '이불 커버 세탁' })],
    });

    const result = await service.interpret('user-1', { text: '지난주에 이불 빠라써', mode: 'voice' }, TODAY);

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
    const { service } = buildService({ parse: parsed({ confidence: 0.2 }) });

    const result = await service.interpret('user-1', { text: '뭐 했는데', mode: 'voice' }, TODAY);

    expect(result.outcome).toBe('unrecognized');
  });

  it('약한 후보는 걸러낸다', async () => {
    const { service } = buildService({
      parse: parsed({
        matched_item_id: null,
        candidates: [
          { item_id: 'item-1', name: '이불 빨래', similarity: 0.7 },
          { item_id: 'item-2', name: '수건 교체', similarity: 0.2 },
        ],
      }),
      items: [itemRow(), itemRow({ id: 'item-2', name: '수건 교체' })],
    });

    const result = await service.interpret('user-1', { text: '이불 관련', mode: 'text' }, TODAY);

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

  it('처음 보는 항목인데 주기도 없으면 AI에게 넘긴다', async () => {
    // "얼마마다 하는 일인가" 는 세상 지식이고, 애초에 집안일이 맞는지도 판단해야 한다.
    const { service, ai } = buildService({});

    await service.interpret('user-1', { text: '베란다 창틀 닦았어', mode: 'text' }, TODAY);

    expect(ai.parseUtterance).toHaveBeenCalled();
  });
});

describe('CaptureService.interpret — AI 가 안 깨어났을 때', () => {
  /**
   * 무료 호스팅은 15분 놀면 AI 를 재우고, 깨는 데 30초 넘게 걸린다.
   * 그 사이에 기록한 사람이 손해를 보면 안 된다.
   */
  it('규칙이 이름을 뽑았으면 그걸로 확인 시트를 낸다', async () => {
    const { service, ai } = buildService({ parse: null });

    const result = await service.interpret(
      'user-1',
      { text: '나 어제 화장실 청소했어', mode: 'voice' },
      TODAY,
    );

    expect(result.outcome).toBe('new_item');
    expect(result.normalizedName).toBe('화장실 청소');
    expect(result.doneOn).toBe('2026-09-05');
    // 주기만 기본값이다. 시트에서 고칠 수 있다.
    expect(result.cadence?.source).toBe('default');
    expect(result.cadence?.rule).toMatchObject({ unit: 'week', interval: 2 });
    // 화면이 원인을 알 수 있어야 "또렷하게 말해주세요" 대신 다른 말을 한다.
    expect(result.degraded).toBe(true);
    expect(result.draftToken).toBe('signed-token');
    // 방금 응답하지 않은 상대에게 주기를 또 묻지 않는다.
    expect(ai.suggestCadence).not.toHaveBeenCalled();
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
