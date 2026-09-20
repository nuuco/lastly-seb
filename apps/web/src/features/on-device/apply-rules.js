"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UTTERANCE_RULES_REV = void 0;
exports.overlayWithRules = overlayWithRules;
exports.parseWithRulesOnly = parseWithRulesOnly;
exports.readIntentFixed = readIntentFixed;
exports.shouldRecordLog = shouldRecordLog;
exports.matchKnown = matchKnown;
const utterance_rules_1 = require("../../../../api/src/modules/capture/utterance-rules");
Object.defineProperty(exports, "UTTERANCE_RULES_REV", { enumerable: true, get: function () { return utterance_rules_1.UTTERANCE_RULES_REV; } });
const EMPTY_LLM = {
    intent: 'record',
    itemName: null,
    daysAgo: 0,
    matchedItemId: null,
    candidateIds: [],
    confidence: 0,
    statedCadenceDays: null,
    willSave: true,
    raw: '',
};
/**
 * 1B는 칸을 자주 틀린다. 본선과 같이 의도·날짜·주기·이름은 규칙이 먼저 채우고,
 * 모델 값은 규칙이 비울 때만 쓴다. 매칭은 알려진 항목 이름과 비교한다.
 */
function overlayWithRules(text, referenceDate, knownItems, llm) {
    const reference = new Date(`${referenceDate}T00:00:00`);
    const intent = readIntentFixed(text);
    const named = (0, utterance_rules_1.readName)(text);
    const dated = (0, utterance_rules_1.readDaysAgo)(text, reference);
    const cadence = (0, utterance_rules_1.readCadenceDays)(text);
    const itemName = named ?? llm.itemName;
    const matchedItemId = matchKnown(itemName, knownItems);
    const daysAgo = intent === 'query' ? 0 : dated.saw ? dated.daysAgo : llm.daysAgo;
    return {
        ...llm,
        intent,
        itemName,
        daysAgo,
        statedCadenceDays: cadence ?? llm.statedCadenceDays,
        matchedItemId,
        willSave: intent === 'query' ? false : shouldRecordLog(text),
    };
}
/** Gemma 없이 규칙만으로 슬롯을 채운다. 번들 갱신 확인용. */
function parseWithRulesOnly(text, referenceDate, knownItems) {
    return overlayWithRules(text, referenceDate, knownItems, EMPTY_LLM);
}
/** "빨았어, 일주일마다 알려줘" 는 조회가 아니라 기록+알림이다. */
function readIntentFixed(text) {
    const intent = (0, utterance_rules_1.readIntent)(text);
    if (intent !== 'query')
        return intent;
    if (!/알려\s*줘|알려줄래/.test(text))
        return intent;
    if (/(?:언제|얼마나|며칠|얼마만|몇\s*일|지\s*(?:얼마|몇)|\?|？)/.test(text))
        return 'query';
    if (DONE_VERB.test(text))
        return 'record';
    return intent;
}
const DONE_VERB = /(?:했어|했다|했음|빨았어|빨아놨어|갈았어|닦았어|돌렸어|버렸어|끝냈어|시켰어|청소했어)/;
/**
 * 골든셋 저장 게이트. `못`/`안 했`이면 저장하지 않는다.
 * "만 빨았어"처럼 다른 일을 빼고 한 일은 저장한다.
 */
function shouldRecordLog(text) {
    const t = text.replace(/\s+/g, ' ');
    const hardFail = /못\s*했|안\s*했|하지\s*못|아직(?:이야|\s*안|\s*못)|안\s*(?:빨았|갈았|닦았|시켰)|못\s*한|안\s*한/.test(t);
    if (hardFail)
        return false;
    const future = /내일|모레|이따가|예정|하려고|할(?:래|게)|할\s*거야|빨\s*거야|시킬게|버릴게|돌릴\s*예정|다음\s*주/.test(t);
    const only = /만\s*(?:빨|갈|닦|했|끝냈)/.test(t);
    if (future && only && DONE_VERB.test(t))
        return true;
    if (future)
        return false;
    return true;
}
/**
 * 짧은 조각("청소", "필터")은 여러 항목에 들어가므로 붙이지 않는다.
 * 글자 겹침(트라이그램)은 빨래끼리 서로 달라붙어 쓰지 않는다.
 */
function matchKnown(name, items) {
    if (!name || items.length === 0)
        return null;
    const trimmed = name.replace(/\s+/g, ' ').trim();
    const exact = items.filter((item) => item.name === trimmed);
    if (exact.length === 1)
        return exact[0].id;
    if (exact.length > 1)
        return null;
    const contained = items.filter((item) => item.name.includes(trimmed) || trimmed.includes(item.name));
    if (contained.length === 1)
        return contained[0].id;
    return null;
}
//# sourceMappingURL=apply-rules.js.map