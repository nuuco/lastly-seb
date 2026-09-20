import { UTTERANCE_RULES_REV } from '../../../../api/src/modules/capture/utterance-rules';
import type { OnDeviceKnownItem, OnDeviceParseResult } from './types';
export { UTTERANCE_RULES_REV };
/**
 * 1B는 칸을 자주 틀린다. 본선과 같이 의도·날짜·주기·이름은 규칙이 먼저 채우고,
 * 모델 값은 규칙이 비울 때만 쓴다. 매칭은 알려진 항목 이름과 비교한다.
 */
export declare function overlayWithRules(text: string, referenceDate: string, knownItems: OnDeviceKnownItem[], llm: OnDeviceParseResult): OnDeviceParseResult;
/** Gemma 없이 규칙만으로 슬롯을 채운다. 번들 갱신 확인용. */
export declare function parseWithRulesOnly(text: string, referenceDate: string, knownItems: OnDeviceKnownItem[]): OnDeviceParseResult;
/** "빨았어, 일주일마다 알려줘" 는 조회가 아니라 기록+알림이다. */
export declare function readIntentFixed(text: string): 'record' | 'query';
/**
 * 골든셋 저장 게이트. `못`/`안 했`이면 저장하지 않는다.
 * "만 빨았어"처럼 다른 일을 빼고 한 일은 저장한다.
 */
export declare function shouldRecordLog(text: string): boolean;
/**
 * 짧은 조각("청소", "필터")은 여러 항목에 들어가므로 붙이지 않는다.
 * 글자 겹침(트라이그램)은 빨래끼리 서로 달라붙어 쓰지 않는다.
 */
export declare function matchKnown(name: string | null, items: OnDeviceKnownItem[]): string | null;
