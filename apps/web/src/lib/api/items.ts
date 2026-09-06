import type {
  CompleteItemResult,
  CreateItemInput,
  HomeFeed,
  Item,
  LogEntry,
  UpdateItemInput,
  UpdateLogInput,
} from '@lastly/contracts';

import { apiFetch } from './client';

export const itemsApi = {
  homeFeed: () => apiFetch<HomeFeed>('/home/feed'),
  list: () => apiFetch<Item[]>('/items'),
  get: (id: string) => apiFetch<Item>(`/items/${id}`),
  create: (body: CreateItemInput) => apiFetch<Item>('/items', { method: 'POST', body }),
  update: (id: string, body: UpdateItemInput) =>
    apiFetch<Item>(`/items/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => apiFetch<void>(`/items/${id}`, { method: 'DELETE' }),
  complete: (id: string) =>
    apiFetch<CompleteItemResult>(`/items/${id}/complete`, { method: 'POST' }),

  logs: (itemId: string) => apiFetch<LogEntry[]>(`/items/${itemId}/logs`),
  updateLog: (logId: string, body: UpdateLogInput) =>
    apiFetch<LogEntry>(`/logs/${logId}`, { method: 'PATCH', body }),
  removeLog: (logId: string) => apiFetch<void>(`/logs/${logId}`, { method: 'DELETE' }),
  undo: (undoToken: string) =>
    apiFetch<void>('/logs/undo', { method: 'POST', body: { undoToken } }),
};
