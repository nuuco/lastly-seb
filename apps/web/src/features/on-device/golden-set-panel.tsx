'use client';

import { useMemo, useState } from 'react';

import {
  GOLDEN_KINDS,
  GOLDEN_REF_DATE,
  cadenceLabel,
  casesForKind,
} from './eval-fixtures';
import type { GoldenCase, GoldenKind } from './eval-fixtures';
import { marksOk, scoreGolden } from './score-golden';
import type { OnDeviceParseResult } from './types';

export interface GoldenRun {
  n: number;
  ms: number;
  result: OnDeviceParseResult | null;
  error: string | null;
}

interface Props {
  selected: GoldenCase | null;
  onSelect: (row: GoldenCase) => void;
  busy: boolean;
  onParseOne: (row: GoldenCase) => void;
  onParseKind: (kind: GoldenKind | 'all') => void;
  /** Gemma 없이 규칙만. 번들 갱신 확인용. */
  onScoreRules: (kind: GoldenKind | 'all') => void;
  /** 규칙 보정 없이 모델 출력 그대로. 모델 단독 실력 확인용. */
  onParseModelOnly: (kind: GoldenKind | 'all') => void;
  rulesRev: number;
  runs: Record<number, GoldenRun>;
}

export function GoldenSetPanel({
  selected,
  onSelect,
  busy,
  onParseOne,
  onParseKind,
  onScoreRules,
  onParseModelOnly,
  rulesRev,
  runs,
}: Props) {
  const [kind, setKind] = useState<GoldenKind | 'all'>('completed');
  const rows = useMemo(() => casesForKind(kind), [kind]);
  const scored = rows
    .map((row) => {
      const run = runs[row.n];
      if (!run?.result) return null;
      return { row, run, marks: scoreGolden(run.result, row) };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);
  const passed = scored.filter((x) => marksOk(x.marks)).length;
  const axis = {
    intent: scored.filter((x) => x.marks.intent).length,
    name: scored.filter((x) => x.marks.name !== 'miss').length,
    days: scored.filter((x) => x.marks.days !== false).length,
    match: scored.filter((x) => x.marks.match).length,
    cadence: scored.filter((x) => x.marks.cadence).length,
    save: scored.filter((x) => x.marks.save).length,
    slots: scored.filter(
      (x) =>
        x.marks.intent &&
        x.marks.days !== false &&
        x.marks.name !== 'miss' &&
        x.marks.match &&
        x.marks.cadence,
    ).length,
  };

  return (
    <section className="mt-8">
      <p className="px-1 text-12.5 tracking-[.06em] text-ink-3">
        골든셋 · 기준일 {GOLDEN_REF_DATE} (월) · 규칙 rev {rulesRev}
      </p>
      <p className="mt-1.5 px-1 text-[13.5px] leading-[1.7] text-ink-2">
        예전에 쓰던 5문장은 스모크입니다. 79개가 본 평가입니다. Gemma 출력은 규칙으로 보정합니다.
        예정·못 함은 저장하면 안 됩니다. rev가 2가 아니면 하드 새로고침하세요.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {GOLDEN_KINDS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setKind(tab.id)}
            className={`rounded-[9px] border px-3 py-1.5 text-13 font-semibold ${
              kind === tab.id ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink-2'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!selected || busy}
          onClick={() => selected && onParseOne(selected)}
          className="flex h-11 min-w-[30%] flex-1 items-center justify-center rounded-lg bg-action text-14 font-semibold text-white disabled:opacity-40"
        >
          이 문장 해석
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onParseKind(kind)}
          className="flex h-11 min-w-[30%] flex-1 items-center justify-center rounded-lg border border-line bg-card text-14 font-semibold text-ink disabled:opacity-40"
        >
          {kind === 'all' ? '79개 채점' : '이 유형 채점'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onScoreRules(kind)}
          className="flex h-11 min-w-[30%] flex-1 items-center justify-center rounded-lg border border-line bg-card text-14 font-semibold text-ink disabled:opacity-40"
        >
          규칙만 채점
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onParseModelOnly(kind)}
          className="flex h-11 min-w-[30%] flex-1 items-center justify-center rounded-lg border border-line bg-card text-14 font-semibold text-ink disabled:opacity-40"
        >
          모델만 채점
        </button>
      </div>

      {scored.length > 0 ? (
        <div className="mt-3 px-1 text-[13.5px] leading-[1.65] text-ink">
          <p className="font-semibold">
            전부 {passed}/{scored.length}
            {scored.length < rows.length ? ` · ${rows.length - scored.length}개 남음` : ''}
          </p>
          <p className="mt-1 text-ink-2">
            슬롯 {axis.slots}/{scored.length} (저장 제외) · 의도 {axis.intent} · 이름 {axis.name} · 날짜{' '}
            {axis.days} · 매칭 {axis.match} · 주기 {axis.cadence} · 저장 {axis.save}
          </p>
        </div>
      ) : null}

      <ul className="mt-3 max-h-[420px] overflow-y-auto rounded-card border border-line bg-card">
        {rows.map((row) => {
          const active = selected?.n === row.n;
          const run = runs[row.n];
          const marks = run?.result ? scoreGolden(run.result, row) : null;
          const ok = marks ? marksOk(marks) : null;
          return (
            <li key={row.n} className={active ? 'bg-sage-soft' : ''}>
              <button
                type="button"
                onClick={() => onSelect(row)}
                className="flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left"
              >
                <span className="w-7 shrink-0 pt-0.5 text-12.5 font-semibold text-ink-3">{row.n}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold leading-[1.45] text-ink">{row.text}</span>
                  <span className="mt-0.5 block text-12.5 text-ink-3">
                    {row.trap ? '함정 · ' : ''}
                    {row.save ? '저장' : '저장 안 함'}
                    {' · '}
                    {row.itemName ?? '이름 없음'}
                    {row.daysAgo != null ? ` · ${row.daysAgo}일 전` : ''}
                    {row.cadence.kind !== 'none' ? ` · ${cadenceLabel(row.cadence)}` : ''}
                  </span>
                  {run?.error ? (
                    <span className="mt-0.5 block text-12.5 text-danger">{run.error}</span>
                  ) : null}
                  {run?.result && marks ? (
                    <span className={`mt-0.5 block text-12.5 ${ok ? 'text-ink' : 'text-danger'}`}>
                      {run.ms}ms · {ok ? '통과' : failHint(marks, run.result, row)}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function failHint(marks: ReturnType<typeof scoreGolden>, got: OnDeviceParseResult, gold: GoldenCase): string {
  const bits: string[] = [];
  if (!marks.intent) bits.push(`의도 ${got.intent}`);
  if (marks.days === false) bits.push(`날짜 ${got.daysAgo}`);
  if (marks.name === 'miss') bits.push(`이름 ${got.itemName ?? 'null'}`);
  else if (marks.name === 'partial') bits.push(`이름≈${got.itemName}`);
  if (!marks.match) bits.push(`매칭 ${got.matchedItemId ?? 'null'}`);
  if (!marks.cadence) bits.push(`주기 ${got.statedCadenceDays ?? 'null'}`);
  if (!marks.save) bits.push(gold.save ? '저장해야 함' : '저장하면 안 됨');
  if (bits.length === 0) return `기대와 다름 · ${gold.intent}`;
  return bits.join(' · ');
}
