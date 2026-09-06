import { z } from 'zod';
import { cadenceRuleSchema, cadenceSourceSchema } from './cadence';
import { isoDateSchema, isoDateTimeSchema, uuidSchema } from './common';

export const itemStatusSchema = z.enum(['active', 'archived']);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

/** 홈 화면(05)의 3분할 섹션. 서버가 계산해 내려준다. */
export const itemBucketSchema = z.enum(['due', 'upcoming', 'later']);
export type ItemBucket = z.infer<typeof itemBucketSchema>;

export const itemSchema = z.object({
  id: uuidSchema,
  name: z.string().min(1).max(60),
  status: itemStatusSchema,
  cadence: cadenceRuleSchema,
  cadenceSource: cadenceSourceSchema,
  lastDoneOn: isoDateSchema.nullable(),
  nextDueOn: isoDateSchema.nullable(),
  /**
   * 이 날까지 알림을 쉰다. 주기 수정과 달리 리듬은 그대로 두고 다음 차례만 미룬다.
   * 기록이 새로 쌓이면 서버가 자동으로 해제한다.
   */
  snoozedUntil: isoDateSchema.nullable(),
  /** 오늘 기준 경과일. lastDoneOn이 없으면 null. */
  daysSinceLastDone: z.number().int().nullable(),
  /** 음수면 밀린 항목. 화면의 D-n 배지. */
  daysUntilDue: z.number().int().nullable(),
  bucket: itemBucketSchema,
  /** 실제 기록에서 계산한 평균 간격 — "평균 14일마다 하셨어요". */
  averageIntervalDays: z.number().nullable(),
  logCount: z.number().int().nonnegative(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Item = z.infer<typeof itemSchema>;

export const createItemSchema = z.object({
  name: z.string().min(1).max(60),
  cadence: cadenceRuleSchema,
  cadenceSource: cadenceSourceSchema.default('user'),
  /** 생성과 동시에 첫 기록을 남길 때. */
  firstDoneOn: isoDateSchema.optional(),
});
export type CreateItemInput = z.infer<typeof createItemSchema>;

export const updateItemSchema = createItemSchema
  .omit({ firstDoneOn: true })
  .partial()
  .extend({
    status: itemStatusSchema.optional(),
    /** null을 보내면 쉬어가기를 해제하고 원래 주기로 돌아간다. */
    snoozedUntil: isoDateSchema.nullable().optional(),
  });
export type UpdateItemInput = z.infer<typeof updateItemSchema>;

/** 홈 화면 상단 요약 — "이번 주 3개 완료 · 평균 주기 18일 · 밀린 항목 없음". */
export const homeSummarySchema = z.object({
  greetingName: z.string().nullable(),
  completedThisWeek: z.number().int().nonnegative(),
  averageIntervalDays: z.number().nullable(),
  overdueCount: z.number().int().nonnegative(),
  dueTodayCount: z.number().int().nonnegative(),
  /** 오늘 할 게 없을 때 보여줄 다음 예정 항목 (05-B). */
  nextUp: z.object({ itemId: uuidSchema, name: z.string(), dueOn: isoDateSchema }).nullable(),
});
export type HomeSummary = z.infer<typeof homeSummarySchema>;

export const homeFeedSchema = z.object({
  summary: homeSummarySchema,
  due: z.array(itemSchema),
  upcoming: z.array(itemSchema),
  later: z.array(itemSchema),
});
export type HomeFeed = z.infer<typeof homeFeedSchema>;
