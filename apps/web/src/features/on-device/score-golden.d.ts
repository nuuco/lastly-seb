import type { GoldenCase } from './eval-fixtures';
import type { OnDeviceParseResult } from './types';
export interface SlotMarks {
    intent: boolean;
    days: boolean | 'skip';
    name: 'exact' | 'partial' | 'miss';
    match: boolean;
    cadence: boolean;
    /** 예정·못 함·조회는 로그로 남기면 실패. */
    save: boolean;
}
export declare function scoreGolden(got: OnDeviceParseResult, gold: GoldenCase): SlotMarks;
export declare function marksOk(marks: SlotMarks): boolean;
