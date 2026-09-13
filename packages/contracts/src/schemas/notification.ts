import { z } from 'zod';
import { isoDateTimeSchema, uuidSchema } from './common';

export const notificationSettingsSchema = z.object({
  /** 하루 한 번 모아서 보내는 시각. */
  digestTimeLocal: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  timezone: z.string().default('Asia/Seoul'),
  weekendEnabled: z.boolean(),
  pushGranted: z.boolean(),
  /**
   * 알림을 켤 때 가입을 권할지. 권할 자리가 아니면 null.
   *
   * 익명 계정은 이 브라우저의 쿠키가 유일한 열쇠라, 그걸 잃으면 알림도 끊긴다.
   * 알림을 켜겠다는 건 챙김받고 싶다는 뜻이므로 그때 말하는 것이 맞다.
   */
  signupPrompt: z.enum(['notifications']).nullable().default(null),
});
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;

export const updateNotificationSettingsSchema = notificationSettingsSchema
  .omit({ pushGranted: true, signupPrompt: true })
  .partial();
export type UpdateNotificationSettingsInput = z.infer<typeof updateNotificationSettingsSchema>;

/** 브라우저 PushSubscription을 그대로 받는다. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
  userAgent: z.string().max(300).optional(),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

/** 알림 액션(14) — 잠금화면에서 바로 처리. */
export const notificationActionSchema = z.enum(['complete', 'snooze_3d', 'snooze_weekend']);
export type NotificationAction = z.infer<typeof notificationActionSchema>;

export const notificationSchema = z.object({
  id: uuidSchema,
  itemId: uuidSchema,
  title: z.string(),
  body: z.string(),
  scheduledAt: isoDateTimeSchema,
  sentAt: isoDateTimeSchema.nullable(),
});
export type Notification = z.infer<typeof notificationSchema>;
