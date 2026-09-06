import { Injectable, Logger } from '@nestjs/common';
import type {
  CadenceRule,
  CadenceSuggestion,
  CommitRequest,
  CommitResult,
  InterpretOutcome,
  InterpretRequest,
  InterpretResult,
  ItemCandidate,
} from '@lastly/contracts';
import { format } from 'date-fns';

import { AiClient } from '../../infra/ai/ai.client';
import { CadenceService } from '../cadence/cadence.service';
import { toCadenceRule } from '../items/items.mapper';
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
      ),
      confidence: parsed.confidence,
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
  private async resolveCadence(
    userId: string,
    outcome: InterpretOutcome,
    matchedItemId: string | null,
    normalizedName: string | null,
    doneOn: string,
  ): Promise<CadenceSuggestion | null> {
    if (outcome === 'unrecognized') return null;

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
