'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

import { useServiceWorker } from '@/hooks/use-service-worker';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 홈 피드는 날짜 경계에 의존하므로 오래 신선하다고 보지 않는다.
            staleTime: 30_000,
            retry: 1,
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <ServiceWorkerRegistrar />
      {children}
    </QueryClientProvider>
  );
}

function ServiceWorkerRegistrar() {
  useServiceWorker();
  return null;
}
