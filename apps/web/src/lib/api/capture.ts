import type { CommitRequest, CommitResult, InterpretRequest, InterpretResult } from '@lastly/contracts';

import { apiFetch } from './client';

export const captureApi = {
  interpret: (body: InterpretRequest, signal?: AbortSignal) =>
    apiFetch<InterpretResult>('/capture/interpret', { method: 'POST', body, signal }),

  commit: (body: CommitRequest) =>
    apiFetch<CommitResult>('/capture/commit', { method: 'POST', body }),
};
