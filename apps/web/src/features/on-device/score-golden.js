"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreGolden = scoreGolden;
exports.marksOk = marksOk;
const eval_fixtures_1 = require("./eval-fixtures");
function nameMark(pred, gold) {
    if (!gold)
        return pred ? 'partial' : 'exact';
    if (!pred)
        return 'miss';
    if (pred === gold)
        return 'exact';
    if (pred.includes(gold) || gold.includes(pred))
        return 'partial';
    return 'miss';
}
function scoreGolden(got, gold) {
    const wantCadence = (0, eval_fixtures_1.cadenceDays)(gold.cadence);
    const wouldSave = got.willSave;
    return {
        intent: got.intent === gold.intent,
        days: gold.daysAgo == null ? 'skip' : got.daysAgo === gold.daysAgo,
        name: nameMark(got.itemName, gold.itemName),
        match: (got.matchedItemId || null) === (gold.matchId || null),
        cadence: got.statedCadenceDays === wantCadence,
        save: gold.save ? wouldSave : !wouldSave,
    };
}
function marksOk(marks) {
    return (marks.intent &&
        marks.days !== false &&
        marks.name !== 'miss' &&
        marks.match &&
        marks.cadence &&
        marks.save);
}
//# sourceMappingURL=score-golden.js.map