import v1 from './golden/v1.json';

/**
 * 골든셋. 문장·기대값만 담는다. 채점은 evaluate.ts.
 *
 * date 는 세 가지다.
 * - 숫자: 며칠 전. 음수는 앞으로 (-1 = 내일)
 * - 문자열: 실행하는 날을 기준으로 계산하는 표현 ("지난 토요일", "지난달 15일", "9/14", "14일")
 * - null: 날짜를 채점하지 않는다 (애매, 조회, 알 수 없음)
 */
export type GoldenStatus = '완료' | '미완료' | '미래' | '애매' | '조회';

export interface GoldenCase {
  n: number;
  text: string;
  intent: 'record' | 'query';
  status: GoldenStatus;
  activity: string | null;
  date: number | string | null;
  cadenceDays: number | null;
  matchId: string | null;
  trap: boolean;
}

export interface GoldenSet {
  version: string;
  description?: string;
  knownItems: Array<{ id: string; name: string }>;
  cases: GoldenCase[];
}

export const GOLDEN_V1 = v1 as GoldenSet;

export const STATUSES: GoldenStatus[] = ['완료', '미완료', '미래', '애매', '조회'];

const WEEKDAYS = '일월화수목금토';

/** 기대 날짜를 "며칠 전" 숫자로. 채점하지 않을 날짜면 null. */
export function resolveDaysAgo(date: GoldenCase['date'], referenceDate: string): number | null {
  if (date === null) return null;
  if (typeof date === 'number') return date;

  const ref = parseIso(referenceDate);
  const text = date.trim();

  const weekday = text.match(/^지난\s*([일월화수목금토])요일$/);
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]!);
    const diff = (ref.getDay() - target + 7) % 7;
    return diff === 0 ? 7 : diff;
  }

  const lastMonthDay = text.match(/^지난달\s*(\d{1,2})일$/);
  if (lastMonthDay) {
    const target = new Date(ref.getFullYear(), ref.getMonth() - 1, Number(lastMonthDay[1]));
    return daysBetween(target, ref);
  }

  const monthDay = text.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (monthDay) {
    let target = new Date(ref.getFullYear(), Number(monthDay[1]) - 1, Number(monthDay[2]));
    if (target > ref) target = new Date(ref.getFullYear() - 1, target.getMonth(), target.getDate());
    return daysBetween(target, ref);
  }

  const dayOnly = text.match(/^(\d{1,2})일$/);
  if (dayOnly) {
    let target = new Date(ref.getFullYear(), ref.getMonth(), Number(dayOnly[1]));
    if (target > ref) target = new Date(ref.getFullYear(), ref.getMonth() - 1, Number(dayOnly[1]));
    return daysBetween(target, ref);
  }

  const iso = text.match(/^\d{4}-\d{2}-\d{2}$/);
  if (iso) return daysBetween(parseIso(text), ref);

  return null;
}

function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

/**
 * 구글 시트에서 내려받은 CSV 를 세트로 바꾼다. 열 이름은 v1.csv 와 같다.
 * n, 문장, Intent(기록|조회), Status, Activity, Date, 주기, 매칭, 함정(O)
 * 기존 항목 목록은 v1 것을 쓴다.
 */
export function parseGoldenCsv(text: string, version: string): GoldenSet {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const [head, ...body] = rows;
  if (!head) throw new Error('CSV 가 비어 있어요.');
  const col = (name: string) => {
    const i = head.findIndex((h) => h.trim() === name);
    if (i < 0) throw new Error(`"${name}" 열이 없어요.`);
    return i;
  };
  const at = {
    n: head.findIndex((h) => h.trim() === 'n'),
    text: col('문장'),
    intent: col('Intent'),
    status: col('Status'),
    activity: col('Activity'),
    date: col('Date'),
    cadence: head.findIndex((h) => h.trim() === '주기'),
    match: head.findIndex((h) => h.trim() === '매칭'),
    trap: head.findIndex((h) => h.trim() === '함정'),
  };

  const cases: GoldenCase[] = body
    .filter((row) => row[at.text]?.trim())
    .map((row, index) => {
      const cell = (i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
      const status = cell(at.status) as GoldenStatus;
      if (!STATUSES.includes(status)) {
        throw new Error(`${index + 2}번째 줄 Status "${status}" 는 ${STATUSES.join('/')} 중 하나여야 해요.`);
      }
      const rawDate = cell(at.date);
      const numeric = Number(rawDate);
      return {
        n: Number(cell(at.n)) || index + 1,
        text: cell(at.text),
        intent: cell(at.intent) === '조회' || status === '조회' ? 'query' : 'record',
        status,
        activity: cell(at.activity) || null,
        date: rawDate === '' ? null : Number.isFinite(numeric) ? numeric : rawDate,
        cadenceDays: Number(cell(at.cadence)) || null,
        matchId: cell(at.match) || null,
        trap: cell(at.trap) === 'O',
      };
    });

  return { version, knownItems: GOLDEN_V1.knownItems, cases };
}

/** 세트를 구글 시트용 CSV 로. parseGoldenCsv 로 다시 읽을 수 있다. */
export function goldenToCsv(set: GoldenSet): string {
  const esc = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const head = ['n', '문장', 'Intent', 'Status', 'Activity', 'Date', '주기', '매칭', '함정'];
  const rows = set.cases.map((c) =>
    [
      c.n,
      c.text,
      c.intent === 'query' ? '조회' : '기록',
      c.status,
      c.activity,
      c.date,
      c.cadenceDays,
      c.matchId,
      c.trap ? 'O' : '',
    ]
      .map(esc)
      .join(','),
  );
  return '\ufeff' + [head.join(','), ...rows].join('\n') + '\n';
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
