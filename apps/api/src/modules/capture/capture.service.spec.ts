import type { AiParseResponse } from '../../infra/ai/ai.types';
import { CadenceService } from '../cadence/cadence.service';
import type { ItemRow } from '../items/items.repository';
import { CaptureService } from './capture.service';

/**
 * 여기서 검증하는 것은 outcome 분기다.
 * outcome이 프론트의 화면 선택을 그대로 결정하므로(08 / 09 / 07-B),
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

    const result = await service.interpret('user-1', { text: '이불 빨래', mode: 'text' }, TODAY);

    expect(result.outcome).toBe('ambiguous');
    expect(result.candidates).toHaveLength(1);
    expect(result.confidence).toBe(0);
    // 토큰은 여전히 발급돼야 커밋으로 이어갈 수 있다.
    expect(result.draftToken).toBe('signed-token');
  });

  it('AI도 검색도 결과가 없으면 재시도로 보낸다', async () => {
    const { service } = buildService({ parse: null });

    const result = await service.interpret('user-1', { text: '알 수 없는 말', mode: 'voice' }, TODAY);

    expect(result.outcome).toBe('unrecognized');
  });

  it('주기 제안이 실패하면 2주 기본값으로 진행한다', async () => {
    const { service, ai } = buildService({
      parse: parsed({ normalized_name: '새로운 일', matched_item_id: null, candidates: [] }),
    });
    ai.suggestCadence.mockResolvedValue(null);

    const result = await service.interpret('user-1', { text: '새로운 일 했어', mode: 'text' }, TODAY);

    expect(result.outcome).toBe('new_item');
    expect(result.cadence?.source).toBe('default');
    expect(result.cadence?.rule).toMatchObject({ unit: 'week', interval: 2 });
  });
});
