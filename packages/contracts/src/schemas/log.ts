import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, uuidSchema } from './common';

export const logEntrySchema = z.object({
  id: uuidSchema,
  itemId: uuidSchema,
  doneOn: isoDateSchema,
  note: z.string().max(200).nullable(),
  /** 직전 기록과의 간격 — "16일 만에". 첫 기록이면 null. */
  gapDays: z.number().int().nullable(),
  createdAt: isoDateTimeSchema,
});
export type LogEntry = z.infer<typeof logEntrySchema>;

export const createLogSchema = z.object({
  doneOn: isoDateSchema,
  note: z.string().max(200).nullable().default(null),
});
export type CreateLogInput = z.infer<typeof createLogSchema>;

export const updateLogSchema = createLogSchema.partial();
export type UpdateLogInput = z.infer<typeof updateLogSchema>;

/** "오늘 했어요" 응답 — 토스트(05-B)에 필요한 것만. */
export const completeItemResultSchema = z.object({
  log: logEntrySchema,
  itemId: uuidSchema,
  itemName: z.string(),
  nextDueOn: isoDateSchema.nullable(),
  /** 되돌리기 토큰. 이 토큰으로 방금 만든 기록을 취소한다. */
  undoToken: z.string(),
});
export type CompleteItemResult = z.infer<typeof completeItemResultSchema>;
