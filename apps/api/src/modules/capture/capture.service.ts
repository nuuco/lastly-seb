import { Injectable, Logger } from '@nestjs/common';
import type {
  CadenceRule,
  CadenceSuggestion,
  CommitRequest,
  CommitResult,
  InterpretOutcome,
  CadencePreviewRequest,
  CadencePreviewResult,
  InterpretRequest,
  InterpretResult,
  ItemCandidate,
} from '@lastly/contracts';
import { format } from 'date-fns';

import { AiClient } from '../../infra/ai/ai.client';
import { CadenceService } from '../cadence/cadence.service';
import { toCadenceRule, toItem } from '../items/items.mapper';
import type { ItemRow } from '../items/items.repository';
import { ItemsRepository } from '../items/items.repository';
import { ItemsService } from '../items/items.service';
import { LogsService } from '../items/logs.service';
import { DraftTokenService } from './draft-token.service';

/** 이 이상이면 확실한 매칭으로 보고 바로 확인 시트(08)를 띄운다. */
export const MATCH_THRESHOLD = 0.82;
/** 이 아래 후보는 보여줄 가치가 없다. */
export const CANDIDATE_FLOOR = 0.45;
/** AI가 항목명조차 못 뽑았다고 볼 기준. */
export const RECOGNITION_FLOOR = 0.35;

/** AI가 응답하지 않을 때 쓰는 폴백 주기. */
export const FALLBACK_CADENCE: CadenceRule = {
  unit: 'week',
  interval: 2,
  weekdays: [],
  notifyTimeLocal: null,
};

/**
 * 자연어 한 문장을 항목 + 날짜 + 주기로 바꾸는 오케스트레이터.
 * 해석은 AI가 하되, 사용자를 어느 화면으로 보낼지(outcome)는 여기서 정한다.
 */
/**
 * 이름을 견주기 위해 공백을 지우고 소문자로 눕힌다.
 * "화분 물 주기" 와 "화분물주기" 는 사람에겐 같은 말이다.
 */
const squash = (v: string) => v.replace(/\s+/g, '').toLowerCase();

@Injectable()
export class CaptureService {
  private readonly logger = new Logger(CaptureService.name);

  constructor(
    private readonly ai: AiClient,
    private readonly items: ItemsRepository,
    private readonly itemsService: ItemsService,
    private readonly logs: LogsService,
    private readonly cadence: CadenceService,
    private readonly draft: DraftTokenService,
  ) {}

  async interpret(userId: string, input: InterpretRequest, today = new Date()): Promise<InterpretResult> {
    const referenceDate = input.referenceDate ?? format(today, 'yyyy-MM-dd');
    const known = await this.items.listActive(userId);

    /**
     * 이름을 그대로 적었으면 AI에게 물을 것이 없다.
     * 자주 쓰는 문장 칩(설계 06)은 항목 이름을 그대로 넣으므로 늘 이 길로 온다.
     * AI가 자거나 죽어 있어도 칩은 항상 동작해야 한다 — 눌러서 넣은 이름을
     * "혹시 이건가요?" 하고 되묻는 건 어느 경우에도 말이 안 된다.
     */
    const typed = squash(input.text);
    const exact = known.find((i) => squash(i.name) === typed);
    if (exact) {
      return {
        transcript: input.text,
        outcome: 'matched_existing',
        normalizedName: exact.name,
        doneOn: referenceDate,
        matchedItemId: exact.id,
        candidates: [],
        cadence: await this.resolveCadence(
          userId,
          'matched_existing',
          exact.id,
          exact.name,
          referenceDate,
        ),
        confidence: 1,
        degraded: false,
        answer: null,
        draftToken: this.draft.sign({
          userId,
          rawInput: input.text,
          normalizedName: exact.name,
          doneOn: referenceDate,
          matchedItemId: exact.id,
          mode: input.mode,
          issuedAt: Date.now(),
        }),
      };
    }

    const parsed = await this.ai.parseUtterance({
      text: input.text,
      reference_date: referenceDate,
      known_items: known.map((i) => ({ id: i.id, name: i.name, last_done_on: i.last_done_on })),
    });

    // AI가 응답하지 않으면 해석을 포기하되, 이름이 비슷한 항목은 직접 고르게 한다.
    if (!parsed) {
      return this.withoutAi(userId, input, referenceDate, known);
    }

    const candidates = this.toCandidates(parsed.candidates, known, today);

    // 모델이 없는 id를 지어냈을 수 있으므로 실재하는 항목인지 확인한다.
    const claimed =
      parsed.matched_item_id && known.some((i) => i.id === parsed.matched_item_id)
        ? parsed.matched_item_id
        : null;

    /**
     * 묻는 말이면 기록하지 않고 답만 돌려준다 — 설계 07-C.
     * 어느 항목을 묻는지 알아야 답할 수 있으므로, 못 짚었으면 평소대로 되묻는다.
     */
    if (parsed.intent === 'query') {
      const target = claimed ?? candidates[0]?.itemId ?? null;
      if (target) return this.answer(userId, input, referenceDate, target, today);
    }

    const outcome = this.decideOutcome(parsed.normalized_name, parsed.confidence, claimed, candidates);
    const matchedItemId =
      outcome === 'matched_existing' ? (claimed ?? candidates[0]?.itemId ?? null) : null;

    return {
      transcript: input.text,
      outcome,
      normalizedName: parsed.normalized_name,
      doneOn: parsed.done_on,
      matchedItemId,
      candidates: outcome === 'ambiguous' ? candidates : [],
      cadence: await this.resolveCadence(
        userId,
        outcome,
        matchedItemId,
        parsed.normalized_name,
        parsed.done_on,
        parsed.stated_cadence_days ?? null,
      ),
      confidence: parsed.confidence,
      degraded: false,
      answer: null,
      draftToken: this.draft.sign({
        userId,
        rawInput: input.text,
        normalizedName: parsed.normalized_name,
        doneOn: parsed.done_on,
        matchedItemId,
        mode: input.mode,
        issuedAt: Date.now(),
      }),
    };
  }

  /** 확인 시트(08/09)의 "이대로 저장하기". 시트에서 고친 값이 AI 판단보다 우선한다. */
  async commit(userId: string, req: CommitRequest, today = new Date()): Promise<CommitResult> {
    const payload = this.draft.verify(req.draftToken, userId);
    const source = payload.mode === 'voice' ? 'voice' : 'text';

    const itemId = req.itemId ?? (await this.createFromDraft(userId, req, today));
    const itemCreated = !req.itemId;

    if (req.itemId && req.cadence) {
      await this.itemsService.update(userId, req.itemId, { cadence: req.cadence, cadenceSource: 'user' }, today);
    }

    const log = await this.logs.add(
      userId,
      itemId,
      { doneOn: req.doneOn, note: req.note },
      source,
      payload.rawInput,
    );

    // 이 표현이 이 항목을 가리킨다는 걸 학습시킨다. 다음부터는 AI 없이도 붙는다.
    await this.rememberAlias(userId, itemId, payload.rawInput);

    // 로그 삽입 트리거가 next_due_on을 다시 계산한 뒤의 값을 읽는다.
    const item = await this.items.findById(userId, itemId);

    return {
      log,
      itemId: item.id,
      itemName: item.name,
      nextDueOn: item.next_due_on,
      undoToken: log.id,
      itemCreated,
    };
  }

  private async createFromDraft(userId: string, req: CommitRequest, today: Date): Promise<string> {
    const created = await this.itemsService.create(
      userId,
      {
        name: req.newItemName!,
        cadence: req.cadence ?? FALLBACK_CADENCE,
        cadenceSource: req.cadence ? 'user' : 'community',
      },
      today,
    );
    return created.id;
  }

  /**
   * AI가 특정 항목을 지목했으면(matchedItemId) 그게 가장 강한 신호다.
   * 후보 목록은 "확실하지 않을 때"만 채워지므로, 이것만 보면 확정 매칭을 놓친다.
   */
  private decideOutcome(
    normalizedName: string | null,
    confidence: number,
    matchedItemId: string | null,
    candidates: ItemCandidate[],
  ): InterpretOutcome {
    if (!normalizedName || confidence < RECOGNITION_FLOOR) return 'unrecognized';
    if (matchedItemId) return 'matched_existing';

    const top = candidates[0];
    if (top && top.similarity >= MATCH_THRESHOLD) return 'matched_existing';
    if (candidates.length > 0) return 'ambiguous';

    return 'new_item';
  }

  private toCandidates(
    raw: Array<{ item_id: string; name: string; similarity: number }>,
    known: ItemRow[],
    today: Date,
  ): ItemCandidate[] {
    const byId = new Map(known.map((i) => [i.id, i]));

    return raw
      .filter((c) => c.similarity >= CANDIDATE_FLOOR)
      .map((c) => {
        const row = byId.get(c.item_id);
        return {
          itemId: c.item_id,
          name: row?.name ?? c.name,
          similarity: c.similarity,
          lastDoneOn: row?.last_done_on ?? null,
          daysSinceLastDone: this.cadence.daysSince(row?.last_done_on ?? null, today),
        };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  /**
   * 기존 항목이면 그 항목의 주기를, 새 항목이면 AI 제안을 붙인다.
   * 화면 08/09의 안내 문구가 이 source에 따라 갈린다.
   */
  /**
   * 이름만 주고 주기를 물어본다 — 설계 08-B.
   *
   * 이미 쓰던 이름이면 그 항목의 주기를 그대로 돌려준다. 사용자가 이름을
   * 되돌렸을 때 원래 리듬으로 돌아와야지, 같은 일에 새 주기를 제안하면 안 된다.
   */
  async previewCadence(userId: string, input: CadencePreviewRequest): Promise<CadencePreviewResult> {
    const known = await this.items.listActive(userId);
    const exact = known.find((i) => squash(i.name) === squash(input.name));

    return {
      matchedItemId: exact?.id ?? null,
      cadence: await this.resolveCadence(
        userId,
        exact ? 'matched_existing' : 'new_item',
        exact?.id ?? null,
        input.name,
        input.doneOn,
      ),
    };
  }

  /** 물어본 것에 그 자리에서 답한다 — 설계 07-C. 아무것도 기록하지 않는다. */
  private async answer(
    userId: string,
    input: InterpretRequest,
    referenceDate: string,
    itemId: string,
    today: Date,
  ): Promise<InterpretResult> {
    const item = toItem(await this.items.findById(userId, itemId), this.cadence, today);

    return {
      transcript: input.text,
      outcome: 'answered',
      normalizedName: item.name,
      doneOn: referenceDate,
      matchedItemId: item.id,
      candidates: [],
      cadence: null,
      confidence: 1,
      degraded: false,
      answer: {
        itemId: item.id,
        name: item.name,
        lastDoneOn: item.lastDoneOn,
        daysSinceLastDone: item.daysSinceLastDone,
        nextDueOn: item.nextDueOn,
        daysUntilDue: item.daysUntilDue,
      },
      // 답만 하고 끝이라 커밋으로 이어지지 않는다. 토큰은 형식을 맞추기 위한 빈 값이다.
      draftToken: this.draft.sign({
        userId,
        rawInput: input.text,
        normalizedName: item.name,
        doneOn: referenceDate,
        matchedItemId: item.id,
        mode: input.mode,
        issuedAt: Date.now(),
      }),
    };
  }

  private async resolveCadence(
    userId: string,
    outcome: InterpretOutcome,
    matchedItemId: string | null,
    normalizedName: string | null,
    doneOn: string,
    statedDays: number | null = null,
  ): Promise<CadenceSuggestion | null> {
    if (outcome === 'unrecognized') return null;

    /**
     * 사용자가 문장에서 직접 말한 주기가 최우선이다.
     * "한달에 한번 빨거야" 라고 했는데 개인 이력이나 커뮤니티 통계로 덮으면
     * 방금 한 말을 무시하는 셈이 된다.
     */
    if (statedDays) {
      const rule = { ...this.cadence.toRule(statedDays), notifyTimeLocal: null };
      return {
        rule,
        source: 'user',
        confidence: 1,
        rationale: `말씀하신 ${this.cadence.describe(rule)}로 맞춰뒀어요.`,
        nextDueOn: this.cadence.nextDueOn(doneOn, rule) ?? doneOn,
      };
    }

    if (outcome === 'matched_existing' && matchedItemId) {
      const row = await this.items.findById(userId, matchedItemId);
      const rule = toCadenceRule(row);
      const avg = row.average_interval_days;

      return {
        rule,
        source: row.cadence_source,
        confidence: 0.95,
        rationale: avg
          ? `평균 ${Math.round(avg)}일마다 하셨어요. 주기를 눌러 언제든 바꿀 수 있어요.`
          : '주기를 눌러 언제든 바꿀 수 있어요.',
        nextDueOn: this.cadence.nextDueOn(doneOn, rule) ?? doneOn,
      };
    }

    if (!normalizedName) return null;

    const suggested = await this.ai.suggestCadence({
      item_name: normalizedName,
      history: [],
      user_average_interval_days: await this.itemsService.userAverageInterval(userId),
    });

    if (!suggested) {
      this.logger.warn(`주기 제안 실패, 폴백 사용: ${normalizedName}`);
      return {
        rule: FALLBACK_CADENCE,
        source: 'default',
        confidence: 0.3,
        rationale: '우선 2주로 잡아뒀어요. 저장 전에 바꿔도 돼요.',
        nextDueOn: this.cadence.nextDueOn(doneOn, FALLBACK_CADENCE) ?? doneOn,
      };
    }

    const rule: CadenceRule = {
      unit: suggested.unit,
      interval: suggested.interval,
      weekdays: suggested.weekdays ?? [],
      notifyTimeLocal: null,
    };

    return {
      rule,
      source: suggested.source,
      confidence: suggested.confidence,
      rationale: suggested.rationale,
      nextDueOn: this.cadence.nextDueOn(doneOn, rule) ?? doneOn,
    };
  }

  /** AI 서비스가 죽었을 때의 경로. 트라이그램 검색만으로 후보를 만든다. */
  private async withoutAi(
    userId: string,
    input: InterpretRequest,
    referenceDate: string,
    known: ItemRow[],
  ): Promise<InterpretResult> {
    const rows = await this.items.matchByMeaning(userId, input.text, null, 5).catch(() => []);
    const candidates = this.toCandidates(
      rows.map((r) => ({ item_id: r.item_id, name: r.name, similarity: r.similarity })),
      known,
      new Date(referenceDate),
    );

    return {
      transcript: input.text,
      outcome: candidates.length > 0 ? 'ambiguous' : 'unrecognized',
      normalizedName: null,
      doneOn: referenceDate,
      matchedItemId: null,
      candidates,
      cadence: null,
      confidence: 0,
      // AI가 판단해서 애매한 게 아니라, 아예 대답을 못 받은 것이다.
      degraded: true,
      answer: null,
      draftToken: this.draft.sign({
        userId,
        rawInput: input.text,
        normalizedName: null,
        doneOn: referenceDate,
        matchedItemId: null,
        mode: input.mode,
        issuedAt: Date.now(),
      }),
    };
  }

  private async rememberAlias(userId: string, itemId: string, phrase: string): Promise<void> {
    const trimmed = phrase.trim().slice(0, 100);
    if (!trimmed) return;

    try {
      await this.items.recordAlias(userId, itemId, trimmed);
    } catch (err) {
      // 별칭 학습은 부가 기능이다. 실패해도 기록 자체는 이미 저장됐다.
      this.logger.warn(`별칭 학습 실패: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
