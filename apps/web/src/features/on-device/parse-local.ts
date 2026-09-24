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

export const DEFERRED_MESSAGE = '아직 안 한 일은 기록하지 않아요';

export interface LocalInterpretation {
  /** null 이면 기기에서 못 채웠다. 서버가 규칙·되묻기로 이어간다. */
  parsed: OnDeviceParseResult | null;
  /** 저장하지 않을 말(못 함·예정·애매). 서버로 보내지 않는다. */
  deferred: boolean;
  /** 서버로 보낼 칸. */
  slots: ClientParseSlots | undefined;
  /** 모델까지 돌았는지. 규칙으로 끝났거나 모델이 준비 전이면 false. 측정·로그용. */
  usedModel: boolean;
  modelError: string | null;
}

/**
 * 캡처가 서버로 보내기 전까지 기기에서 하는 일 전부.
 * 규칙 → (규칙이 못 끝냈으면) 모델 → 저장하지 않을 말 거르기 → 서버로 보낼 칸.
 */
export async function interpretLocally(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
  options: { allowModel?: boolean } = {},
): Promise<LocalInterpretation> {
  const local = await parseCaptureLocally(text, referenceDate, knownItems, options.allowModel ?? true);
  const { parsed } = local;
  const deferred = Boolean(parsed && !parsed.willSave && parsed.intent === 'record');
  return {
    ...local,
    deferred,
    slots: !deferred && parsed ? toClientSlots(parsed) : undefined,
  };
}

/**
 * 이 기기에서 칸을 채운다. 규칙이 못 끝낸 문장만 모델을 돌린다.
 * 이름도 의도도 없으면 null — 그때는 서버가 규칙·되묻기로 이어간다.
 */
async function parseCaptureLocally(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
  allowModel: boolean,
): Promise<{ parsed: OnDeviceParseResult | null; usedModel: boolean; modelError: string | null }> {
  const rules = parseWithRulesOnly(text, referenceDate, knownItems);
  let modelError: string | null = null;

  if (allowModel && !rulesFinished(rules) && hasModelConsent() && isEngineSupported()) {
    if (isEngineReady()) {
      try {
        const parsed = await parseOnDevice(text, referenceDate, knownItems);
        return { parsed, usedModel: true, modelError: null };
      } catch (err) {
        // 모델이 깨져도 기록은 규칙·서버로 이어간다.
        modelError = err instanceof Error ? err.message : String(err);
      }
    } else {
      void ensureEngine().catch(() => undefined);
    }
  }

  const parsed = rules.itemName || rules.intent === 'query' || !rules.willSave ? rules : null;
  return { parsed, usedModel: false, modelError };
}
