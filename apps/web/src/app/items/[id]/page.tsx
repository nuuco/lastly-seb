import type { Item, LogEntry } from '@lastly/contracts';

import { ItemDetailScreen } from '@/features/items/item-detail-screen';
import { serverFetch } from '@/lib/api/server';

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // 항목과 기록을 함께 가져온다. 상세 화면은 둘 다 있어야 완성된다.
  const [initialItem, initialLogs] = await Promise.all([
    serverFetch<Item>(`/items/${id}`),
    serverFetch<LogEntry[]>(`/items/${id}/logs`),
  ]);

  return <ItemDetailScreen itemId={id} initialItem={initialItem} initialLogs={initialLogs} />;
}
