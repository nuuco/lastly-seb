import type { OnDeviceKnownItem } from './types';
/**
 * 온디바이스 실험 골든셋. 문장·기대값의 단일 원천.
 *
 * 유형 1–60은 유형당 15개, 마지막 5개는 혼합 함정.
 * 61–75는 조회·주기, 76–79는 주기 칩 말투.
 *
 * 기대 발화유형(completed 등)은 규칙 게이트 기준이다. Lastly 본선 스키마는
 * record/query 뿐이라, 예정·못함은 save=false 로만 잠근다. 함정 문장에
 * `못`/`안`이 있으면 completed 저장을 차단한다.
 *
 * 날짜는 기준일 GOLDEN_REF_DATE 기준.
 */
export declare const GOLDEN_REF_DATE = "2026-09-14";
export declare const GOLDEN_SIZE = 79;
export type GoldenKind = 'completed' | 'planned' | 'incomplete' | 'uncertain' | 'query';
export type GoldenCadence = {
    kind: 'none';
} | {
    kind: 'everyDays';
    days: number;
} | {
    kind: 'everyMonths';
    months: number;
} | {
    kind: 'weekly';
    weekday: '월' | '화' | '수' | '목' | '금' | '토' | '일';
} | {
    kind: 'monthlyDay';
    day: number;
} | {
    kind: 'monthlyNthWeekday';
    nth: 'last' | 2;
    weekday: '월' | '화' | '수' | '목' | '금' | '토' | '일';
};
export interface GoldenCase {
    n: number;
    text: string;
    kind: GoldenKind;
    trap: boolean;
    /** Lastly가 로그로 남기면 안 되면 false. 조회도 false. */
    save: boolean;
    intent: 'record' | 'query';
    itemName: string | null;
    /** 애매하거나 미래면 null. 조회는 0. */
    daysAgo: number | null;
    cadence: GoldenCadence;
    matchId: string | null;
}
export declare const GOLDEN_KNOWN_ITEMS: OnDeviceKnownItem[];
export declare const GOLDEN_CASES: GoldenCase[];
export declare const GOLDEN_KINDS: Array<{
    id: GoldenKind | 'all';
    label: string;
}>;
export declare function casesForKind(kind: GoldenKind | 'all'): GoldenCase[];
export declare function cadenceDays(cadence: GoldenCadence): number | null;
export declare function cadenceLabel(cadence: GoldenCadence): string;
