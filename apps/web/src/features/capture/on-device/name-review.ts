import { generateOnDevice, isEngineReady } from './engine';
import type { OnDeviceKnownItem } from './types';

/**
 * 항목 이름만 검수한다. 의도·날짜·주기는 프롬프트에 넣지 않는다.
 */
export async function reviewItemName(
  text: string,
  draftName: string | null,
  knownItems: OnDeviceKnownItem[],
): Promise<string | null> {
  if (!isEngineReady()) return null;

  const known =
    knownItems.length === 0
      ? '(없음)'
      : knownItems.map((item) => `- ${item.name}`).join('\n');

  const user = [
    '집안일 한 문장에서 항목 이름만 JSON으로 완성해. 설명 금지.',
    'item_name은 대상+행동 명사구. 빨았어→빨래, 갈았어→교체, 닦았어→청소.',
    '기존 항목 이름과 같으면 그대로 써.',
    `초안: ${draftName ?? '(없음)'}`,
    '기존 항목:',
    known,
    `문장: ${text}`,
  ].join('\n');

  const prompt = `<start_of_turn>user\n${user}<end_of_turn>\n<start_of_turn>model\n{"item_name":"`;
  const raw = await generateOnDevice(prompt);
  return extractItemName(raw, draftName);
}

function extractItemName(raw: string, fallback: string | null): string | null {
  try {
    const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
    if (typeof parsed.item_name === 'string' && parsed.item_name.trim()) {
      return parsed.item_name.replace(/\s+/g, ' ').trim().slice(0, 60);
    }
  } catch {
    // 모델이 문장만 내면 초안을 유지한다.
  }
  return fallback;
}

function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const text = (fenced?.[1] ?? raw).trim();
  const candidates = [text, `{${text}`, `{"item_name":${text}`, `{"item_name":"${text}`];

  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start < 0 || end <= start) continue;
    const slice = candidate.slice(start, end + 1);
    try {
      const value = JSON.parse(slice);
      if (value && typeof value === 'object' && !Array.isArray(value)) return slice;
    } catch {
      continue;
    }
  }

  throw new Error('이름 JSON 파싱 실패');
}
