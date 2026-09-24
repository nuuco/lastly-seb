import { APP_INSTRUCTIONS, type AppInstructionOverride } from '@/features/on-device/parse-prompt';

import { EXPERIMENT_INSTRUCTIONS } from './prompt-experiment';

/**
 * 실험실에서 고친 실험 지시문 본문. 이 기기에만 저장한다.
 * 기준일·기존 항목·문장 줄은 buildExperimentInstruction 이 뒤에 붙인다.
 */
const KEY = 'lastly-lab-prompt';

export function isOriginalPrompt(body: string): boolean {
  return body.trim() === EXPERIMENT_INSTRUCTIONS.trim();
}

/** 결과 표에서 지시문 버전을 가르는 짧은 표시. 원본이면 빈 문자열. */
export function promptTag(body: string): string {
  if (isOriginalPrompt(body)) return '';
  return hashTag(body);
}

function hashTag(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return (hash >>> 0).toString(36).slice(0, 5);
}

export function loadPromptBody(): string {
  try {
    return localStorage.getItem(KEY) || EXPERIMENT_INSTRUCTIONS;
  } catch {
    return EXPERIMENT_INSTRUCTIONS;
  }
}

export function savePromptBody(body: string): void {
  try {
    if (isOriginalPrompt(body)) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, body);
  } catch {
    // ignore
  }
}

/**
 * 실험실에서 고친 앱 지시문. "앱 경로" 측정에서만 쓴다(parse-prompt.ts setAppInstructionOverride).
 * 규칙이 먼저 도는 순서는 그대로고, 모델에 가는 지시문만 바뀐다.
 */
const APP_KEY = 'lastly-lab-app-prompt';

export const ORIGINAL_APP_PROMPT: AppInstructionOverride = {
  body: APP_INSTRUCTIONS,
  itemIds: true,
};

export function isOriginalAppPrompt(edit: AppInstructionOverride): boolean {
  return edit.itemIds && edit.body.trim() === APP_INSTRUCTIONS.trim();
}

export function appPromptTag(edit: AppInstructionOverride): string {
  if (isOriginalAppPrompt(edit)) return '';
  return hashTag(`${edit.itemIds ? 'ids' : 'names'}\n${edit.body}`);
}

export function loadAppPrompt(): AppInstructionOverride {
  try {
    const raw = localStorage.getItem(APP_KEY);
    if (!raw) return ORIGINAL_APP_PROMPT;
    const parsed = JSON.parse(raw) as Partial<AppInstructionOverride>;
    return { body: parsed.body || APP_INSTRUCTIONS, itemIds: parsed.itemIds ?? true };
  } catch {
    return ORIGINAL_APP_PROMPT;
  }
}

export function saveAppPrompt(edit: AppInstructionOverride): void {
  try {
    if (isOriginalAppPrompt(edit)) localStorage.removeItem(APP_KEY);
    else localStorage.setItem(APP_KEY, JSON.stringify(edit));
  } catch {
    // ignore
  }
}
