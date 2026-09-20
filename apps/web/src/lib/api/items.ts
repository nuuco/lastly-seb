import type {
  CreateLogInput,
  CalendarMonth,
  CompleteItemResult,
  CreateItemInput,
  HomeFeed,
  Item,
  LogEntry,
  SearchResult,
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
  restore: (id: string) => apiFetch<void>(`/items/${id}/restore`, { method: 'POST' }),
  calendar: (month: string) => apiFetch<CalendarMonth>(`/home/calendar?month=${month}`),
  search: (q: string) => apiFetch<SearchResult>(`/items/search?q=${encodeURIComponent(q)}`),
  complete: (id: string) =>
    apiFetch<CompleteItemResult>(`/items/${id}/complete`, { method: 'POST' }),

  logs: (itemId: string) => apiFetch<LogEntry[]>(`/items/${itemId}/logs`),
  /** 과거 날짜로도 남길 수 있다. 오프라인에서 적어 둔 기록을 올릴 때 쓴다. */
  addLog: (itemId: string, body: CreateLogInput) =>
    apiFetch<LogEntry>(`/items/${itemId}/logs`, { method: 'POST', body }),
  updateLog: (logId: string, body: UpdateLogInput) =>
    apiFetch<LogEntry>(`/logs/${logId}`, { method: 'PATCH', body }),
  removeLog: (logId: string) => apiFetch<void>(`/logs/${logId}`, { method: 'DELETE' }),
  undo: (undoToken: string) =>
    apiFetch<void>('/logs/undo', { method: 'POST', body: { undoToken } }),
};
