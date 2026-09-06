import { z } from 'zod';
import { isoDateSchema } from './common';

/** 화면 10-B의 "반복 방식" 3종. */
export const cadenceUnitSchema = z.enum(['day', 'week', 'month']);
export type CadenceUnit = z.infer<typeof cadenceUnitSchema>;

/** 0=일요일 … 6=토요일 (Date.getDay와 동일). */
export const weekdaySchema = z.number().int().min(0).max(6);

/**
 * 반복 규칙. `unit`이 'week'일 때만 `weekdays`가 의미를 가진다
 * (예: 2주마다 토요일). 비어 있으면 마지막 수행 요일을 따른다.
 */
export const cadenceRuleSchema = z
  .object({
    unit: cadenceUnitSchema,
    interval: z.number().int().min(1).max(365),
    weekdays: z.array(weekdaySchema).max(7).default([]),
    /** 항목별 알림 시간 override. null이면 사용자 기본 알림 시간을 쓴다. */
    notifyTimeLocal: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'HH:mm 형식이어야 합니다')
      .nullable()
      .default(null),
  })
  .refine((r) => r.unit === 'week' || r.weekdays.length === 0, {
    message: 'weekdays는 주 단위 반복에서만 사용할 수 있습니다',
    path: ['weekdays'],
  });
export type CadenceRule = z.infer<typeof cadenceRuleSchema>;

/** 주기 제안의 출처 — 화면 08/09의 설명 문구를 결정한다. */
export const cadenceSourceSchema = z.enum([
  'user',      // 사용자가 직접 지정
  'personal',  // 내 기록 평균에서 학습 ("평균 14일마다 하셨어요")
  'community', // 일반적인 주기 통계 ("비슷한 가사들의 평균 주기")
  'default',   // 폴백
]);
export type CadenceSource = z.infer<typeof cadenceSourceSchema>;

export const cadenceSuggestionSchema = z.object({
  rule: cadenceRuleSchema,
  source: cadenceSourceSchema,
  confidence: z.number().min(0).max(1),
  /** 사용자에게 그대로 보여줄 한 줄 근거. */
  rationale: z.string(),
  /** 이 규칙을 오늘 적용했을 때의 다음 예정일. */
  nextDueOn: isoDateSchema,
});
export type CadenceSuggestion = z.infer<typeof cadenceSuggestionSchema>;
