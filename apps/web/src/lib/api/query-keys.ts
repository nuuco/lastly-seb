/** 캐시 무효화 범위를 한 곳에서 관리한다. */
export const queryKeys = {
  home: ['home', 'feed'] as const,
  items: ['items'] as const,
  item: (id: string) => ['items', id] as const,
  logs: (itemId: string) => ['items', itemId, 'logs'] as const,
  notificationSettings: ['me', 'notification-settings'] as const,
};
