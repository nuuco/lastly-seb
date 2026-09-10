import type {
  CadencePreviewRequest,
  CadencePreviewResult,
  CommitRequest,
  CommitResult,
  InterpretRequest,
  InterpretResult,
} from '@lastly/contracts';

import { apiFetch } from './client';

export const captureApi = {
  interpret: (body: InterpretRequest, signal?: AbortSignal) =>
    apiFetch<InterpretResult>('/capture/interpret', { method: 'POST', body, signal }),

  /** 확인 시트에서 이름을 고쳤을 때 주기를 다시 묻는다 — 화면 08-B. */
  previewCadence: (body: CadencePreviewRequest, signal?: AbortSignal) =>
    apiFetch<CadencePreviewResult>('/capture/cadence', { method: 'POST', body, signal }),

  commit: (body: CommitRequest) =>
    apiFetch<CommitResult>('/capture/commit', { method: 'POST', body }),
};
