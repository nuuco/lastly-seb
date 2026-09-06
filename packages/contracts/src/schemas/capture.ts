import { z } from 'zod';
import { cadenceRuleSchema, cadenceSuggestionSchema } from './cadence';
import { isoDateSchema, uuidSchema } from './common';
import { completeItemResultSchema } from './log';

export const captureInputModeSchema = z.enum(['voice', 'text']);
export type CaptureInputMode = z.infer<typeof captureInputModeSchema>;

/** 한 문장을 해석해달라는 요청. 화면 06/07의 입력이 그대로 들어온다. */
export const interpretRequestSchema = z.object({
  text: z.string().min(1).max(300),
  mode: captureInputModeSchema.default('text'),
  /** 상대 날짜("어제", "지난주 일요일") 해석 기준. 미지정 시 서버 오늘. */
  referenceDate: isoDateSchema.optional(),
  /** 음성 인식 신뢰도. 낮으면 07-B 재확인 화면으로 유도한다. */
  asrConfidence: z.number().min(0).max(1).optional(),
});
export type InterpretRequest = z.infer<typeof interpretRequestSchema>;

/**
 * 기존 항목 후보. "이불 빨았어" / "이불 세탁했다" 처럼 표현이 달라도
 * 같은 항목으로 묶기 위해 임베딩 유사도 + 별칭 사전을 함께 본다.
 */
export const itemCandidateSchema = z.object({
  itemId: uuidSchema,
  name: z.string(),
  similarity: z.number().min(0).max(1),
  lastDoneOn: isoDateSchema.nullable(),
  daysSinceLastDone: z.number().int().nullable(),
});
export type ItemCandidate = z.infer<typeof itemCandidateSchema>;

/** 해석 결과의 확신도 — 프론트가 어느 화면으로 갈지 이걸로 분기한다. */
export const interpretOutcomeSchema = z.enum([
  'matched_existing', // 08 · 기존 항목 확인 시트
  'new_item',         // 09 · 새 항목 확인 시트
  'ambiguous',        // 07-B · "혹시 이건가요?" 후보 목록
  'unrecognized',     // 07-B · 다시 말하기 / 직접 고치기
]);
export type InterpretOutcome = z.infer<typeof interpretOutcomeSchema>;

export const interpretResultSchema = z.object({
  /** 사용자에게 되읽어주는 원문 — "이렇게 들었어요". */
  transcript: z.string(),
  outcome: interpretOutcomeSchema,
  /** AI가 정규화한 항목 이름. unrecognized면 null. */
  normalizedName: z.string().nullable(),
  /** 해석된 수행 날짜. 문장에 날짜 표현이 없으면 오늘. */
  doneOn: isoDateSchema,
  /** matched_existing이면 확정된 항목, 아니면 null. */
  matchedItemId: uuidSchema.nullable(),
  /** ambiguous일 때 보여줄 후보들. 유사도 내림차순. */
  candidates: z.array(itemCandidateSchema).max(5),
  /** new_item일 때의 주기 제안. matched면 기존 항목 주기를 그대로 담는다. */
  cadence: cadenceSuggestionSchema.nullable(),
  confidence: z.number().min(0).max(1),
  /** 재해석 없이 그대로 커밋할 수 있는 서명된 토큰. */
  draftToken: z.string(),
});
export type InterpretResult = z.infer<typeof interpretResultSchema>;

/** 확인 시트(08/09)에서 "이대로 저장하기"를 눌렀을 때. */
export const commitRequestSchema = z
  .object({
    draftToken: z.string(),
    /** 기존 항목에 붙일 때. */
    itemId: uuidSchema.optional(),
    /** 새 항목을 만들 때. 사용자가 이름을 고쳤으면 반영된 값. */
    newItemName: z.string().min(1).max(60).optional(),
    doneOn: isoDateSchema,
    /** 사용자가 주기 시트(10)에서 바꿨다면 그 값. */
    cadence: cadenceRuleSchema.optional(),
    note: z.string().max(200).nullable().default(null),
  })
  .refine((v) => Boolean(v.itemId) !== Boolean(v.newItemName), {
    message: 'itemId 또는 newItemName 중 정확히 하나가 필요합니다',
  });
export type CommitRequest = z.infer<typeof commitRequestSchema>;

export const commitResultSchema = completeItemResultSchema.extend({
  itemCreated: z.boolean(),
});
export type CommitResult = z.infer<typeof commitResultSchema>;
