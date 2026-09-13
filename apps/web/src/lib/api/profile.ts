import type {
  NotificationSettings,
  PushSubscriptionInput,
  SignupPrompt,
  UpdateNotificationSettingsInput,
} from '@lastly/contracts';

import { apiFetch } from './client';

export const profileApi = {
  notificationSettings: () => apiFetch<NotificationSettings>('/me/notification-settings'),
  updateNotificationSettings: (body: UpdateNotificationSettingsInput) =>
    apiFetch<NotificationSettings>('/me/notification-settings', { method: 'PATCH', body }),
  subscribePush: (body: PushSubscriptionInput) =>
    apiFetch<void>('/notifications/subscribe', { method: 'POST', body }),
  /** 가입 유도를 보여줬다고 남긴다. 같은 이유로 두 번 묻지 않기 위한 것. */
  markSignupPromptSeen: (prompt: SignupPrompt) =>
    apiFetch<void>('/me/signup-prompts', { method: 'POST', body: { prompt } }),
  exportData: () => apiFetch<unknown>('/me/export'),
  deleteAccount: () => apiFetch<void>('/me', { method: 'DELETE' }),
};
