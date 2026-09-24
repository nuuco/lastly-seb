import type { ClientParseSlots } from '@lastly/contracts';

import { parseWithRulesOnly, rulesFinished } from './apply-rules';
import { hasModelConsent } from './consent';
import {
  ensureEngine,
  isEngineSupported,
  isEngineReady,
  parseOnDevice,
} from './engine';
import type { OnDeviceKnownItem, OnDeviceParseResult } from './types';

export function toClientSlots(parsed: OnDeviceParseResult): ClientParseSlots {
  return {
    intent: parsed.intent,
    itemName: parsed.itemName,
    daysAgo: parsed.daysAgo,
    statedCadenceDays: parsed.statedCadenceDays,
    confidence: parsed.confidence > 0 ? parsed.confidence : parsed.itemName ? 0.8 : 0.4,
  };
}

/**
 * 이 기기에서 칸을 채운다. 규칙이 못 끝낸 문장만 모델을 돌린다.
 * 이름도 의도도 없으면 null — 그때는 서버가 규칙·되묻기로 이어간다.
 */
export async function parseCaptureLocally(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): Promise<OnDeviceParseResult | null> {
  const rules = parseWithRulesOnly(text, referenceDate, knownItems);

  if (!rulesFinished(rules) && hasModelConsent() && isEngineSupported()) {
    if (isEngineReady()) {
      try {
        return await parseOnDevice(text, referenceDate, knownItems);
      } catch {
        // 모델이 깨져도 기록은 규칙·서버로 이어간다.
      }
    } else {
      void ensureEngine().catch(() => undefined);
    }
  }

  if (rules.itemName || rules.intent === 'query' || !rules.willSave) return rules;
  return null;
}
