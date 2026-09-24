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
  let hash = 0;
  for (let i = 0; i < body.length; i += 1) hash = (hash * 31 + body.charCodeAt(i)) | 0;
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
