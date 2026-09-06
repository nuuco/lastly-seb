import type {
  NotificationSettings,
  PushSubscriptionInput,
  UpdateNotificationSettingsInput,
} from '@lastly/contracts';

import { apiFetch } from './client';

export const profileApi = {
  notificationSettings: () => apiFetch<NotificationSettings>('/me/notification-settings'),
  updateNotificationSettings: (body: UpdateNotificationSettingsInput) =>
    apiFetch<NotificationSettings>('/me/notification-settings', { method: 'PATCH', body }),
  subscribePush: (body: PushSubscriptionInput) =>
    apiFetch<void>('/notifications/subscribe', { method: 'POST', body }),
  exportData: () => apiFetch<unknown>('/me/export'),
  deleteAccount: () => apiFetch<void>('/me', { method: 'DELETE' }),
};
