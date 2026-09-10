import type { AiCredentialStatus, SaveAiCredentialInput } from '@lastly/contracts';

import { apiFetch } from './client';

export const aiCredentialApi = {
  status: () => apiFetch<AiCredentialStatus>('/me/ai-credential'),
  save: (body: SaveAiCredentialInput) =>
    apiFetch<AiCredentialStatus['credential']>('/me/ai-credential', { method: 'POST', body }),
  remove: () => apiFetch<void>('/me/ai-credential', { method: 'DELETE' }),
};
