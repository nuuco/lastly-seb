'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  GOLDEN_KNOWN_ITEMS,
  GOLDEN_REF_DATE,
  casesForKind,
  cadenceLabel,
} from '@/features/on-device/eval-fixtures';
import type { GoldenCase, GoldenKind } from '@/features/on-device/eval-fixtures';
import { UTTERANCE_RULES_REV, parseWithRulesOnly } from '@/features/on-device/apply-rules';
import {
  ensureEngine,
  hasWebGpu,
  parseOnDevice,
  probeModel,
  subscribeEngineProgress,
} from '@/features/on-device/engine';
import { GoldenSetPanel } from '@/features/on-device/golden-set-panel';
import type { GoldenRun } from '@/features/on-device/golden-set-panel';
import { scoreGolden, marksOk } from '@/features/on-device/score-golden';
import type { EngineProgress, OnDeviceParseResult } from '@/features/on-device/types';

const SMOKE = [
  '오늘 이불 빨았어',
  '이불 세탁했어',
  '어제 가습기 필터 갈았어',
  '이불 언제 빨았지?',
  '그저께 설거지 했고 이틀에 한번 할 거야',
];

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** 설계에 없는 실험 화면. 캡처 본선·규칙 파서는 타지 않고 LLM만 본다. */
export default function OnDeviceLabPage() {
  const [webGpu, setWebGpu] = useState<boolean | null>(null);
  const [model, setModel] = useState<{ ok: boolean; bytes: number } | null>(null);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [text, setText] = useState('오늘 이불 빨았어');
  const [golden, setGolden] = useState<GoldenCase | null>(null);
  const [result, setResult] = useState<OnDeviceParseResult | null>(null);
  const [rawOpen, setRawOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [busy, setBusy] = useState<'load' | 'parse' | 'batch' | null>(null);
  const [batchLabel, setBatchLabel] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<number, GoldenRun>>({});

  useEffect(() => {
    const gpu = hasWebGpu();
    setWebGpu(gpu);
    const unsub = subscribeEngineProgress(setProgress);

    void (async () => {
      const found = await probeModel().catch(() => ({ ok: false, bytes: 0 }));
      setModel(found);
      if (!gpu || !found.ok) return;
      setBusy('load');
      try {
        await ensureEngine();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    })();

    return unsub;
  }, []);

  const load = async () => {
    setError(null);
    setBusy('load');
    try {
      await ensureEngine();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const runParse = async (utterance: string, referenceDate: string) => {
    setError(null);
    setResult(null);
    setBusy('parse');
    const started = performance.now();
    try {
      const parsed = await parseOnDevice(utterance, referenceDate, GOLDEN_KNOWN_ITEMS);
      const ms = Math.round(performance.now() - started);
      setResult(parsed);
      setElapsedMs(ms);
      return { parsed, ms, error: null as string | null };
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setElapsedMs(ms);
      return { parsed: null, ms, error: message };
    } finally {
      setBusy(null);
    }
  };

  const parse = async () => {
    const utterance = text.trim();
    if (!utterance) return;
    const ref = golden && golden.text === utterance ? GOLDEN_REF_DATE : todayIso();
    const { parsed, ms, error: parseError } = await runParse(utterance, ref);
    if (golden && golden.text === utterance) {
      setRuns((prev) => ({
        ...prev,
        [golden.n]: { n: golden.n, ms, result: parsed, error: parseError },
      }));
    }
  };

  const parseGolden = async (row: GoldenCase) => {
    setGolden(row);
    setText(row.text);
    setError(null);
    setResult(null);
    setBusy('parse');
    const started = performance.now();
    try {
      const parsed = await parseOnDevice(row.text, GOLDEN_REF_DATE, GOLDEN_KNOWN_ITEMS);
      const ms = Math.round(performance.now() - started);
      setResult(parsed);
      setElapsedMs(ms);
      setRuns((prev) => ({ ...prev, [row.n]: { n: row.n, ms, result: parsed, error: null } }));
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setElapsedMs(ms);
      setRuns((prev) => ({ ...prev, [row.n]: { n: row.n, ms, result: null, error: message } }));
    } finally {
      setBusy(null);
    }
  };

  const parseKind = async (kind: GoldenKind | 'all') => {
    const rows = casesForKind(kind);
    setBusy('batch');
    setError(null);
    try {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!;
        setBatchLabel(`${i + 1}/${rows.length}`);
        setGolden(row);
        setText(row.text);
        const started = performance.now();
        try {
          const parsed = await parseOnDevice(row.text, GOLDEN_REF_DATE, GOLDEN_KNOWN_ITEMS);
          const ms = Math.round(performance.now() - started);
          setResult(parsed);
          setElapsedMs(ms);
          setRuns((prev) => ({ ...prev, [row.n]: { n: row.n, ms, result: parsed, error: null } }));
        } catch (err) {
          const ms = Math.round(performance.now() - started);
          const message = err instanceof Error ? err.message : String(err);
          setRuns((prev) => ({ ...prev, [row.n]: { n: row.n, ms, result: null, error: message } }));
        }
      }
    } finally {
      setBusy(null);
      setBatchLabel(null);
    }
  };

  const scoreRulesKind = (kind: GoldenKind | 'all') => {
    const rows = casesForKind(kind);
    const next: Record<number, GoldenRun> = { ...runs };
    let last: OnDeviceParseResult | null = null;
    for (const row of rows) {
      const started = performance.now();
      const parsed = parseWithRulesOnly(row.text, GOLDEN_REF_DATE, GOLDEN_KNOWN_ITEMS);
      const ms = Math.round(performance.now() - started);
      next[row.n] = { n: row.n, ms, result: parsed, error: null };
      last = parsed;
    }
    setRuns(next);
    if (rows.length > 0) {
      const lastRow = rows[rows.length - 1]!;
      setGolden(lastRow);
      setText(lastRow.text);
      setResult(last);
      setElapsedMs(0);
    }
  };

  const ready = progress?.status === 'ready';
  const percent =
    progress && progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : 0;
  const marks = result && golden && golden.text === text ? scoreGolden(result, golden) : null;

  return (
    <main className="safe-top min-h-dvh px-6 pb-10 pt-6">
      <div className="flex items-center gap-3.5 px-1">
        <Link href="/" aria-label="뒤로" className="py-1">
          <span className="block h-[9px] w-[9px] rotate-45 border-b-[1.8px] border-l-[1.8px] border-ink-2" />
        </Link>
        <h1 className="text-16 font-semibold text-ink">온디바이스 실험</h1>
      </div>

      <p className="mt-4 px-1 text-[13.5px] leading-[1.7] text-ink-2">
        규칙 파서는 건너뛰고 Gemma에 문장만 넣었던 실험입니다. 지금은 나온 JSON을 본선과 같이
        의도·날짜·주기·이름·매칭 규칙으로 한 번 보정합니다.
      </p>

      <section className="mt-5 rounded-card border border-line bg-card px-[18px] py-4 shadow-card">
        <Row
          label="WebGPU"
          ok={webGpu !== false}
          detail={webGpu == null ? '확인 중' : webGpu ? '사용 가능' : '없음 · Chrome 또는 Safari 26+'}
        />
        <Row
          label="모델"
          ok={model == null || model.ok}
          detail={
            model == null
              ? '확인 중'
              : model.ok
                ? `Gemma 3 1B int4 · ${(model.bytes / 1_000_000).toFixed(0)}MB`
                : '없음 · pnpm download:ondevice-model'
          }
        />
        <Row
          label="상태"
          ok={ready}
          detail={batchLabel ? `채점 ${batchLabel}` : (progress?.message ?? '아직 안 올림')}
          last
        />
        {progress && progress.status !== 'idle' && progress.status !== 'ready' && progress.status !== 'error' ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line-muted">
            <div className="h-full bg-sage" style={{ width: `${percent}%` }} />
          </div>
        ) : null}
      </section>

      <button
        type="button"
        onClick={load}
        disabled={webGpu !== true || busy !== null}
        className="mt-4 flex h-[52px] w-full items-center justify-center rounded-lg bg-ink text-15.5 font-semibold text-white disabled:opacity-40"
      >
        {busy === 'load' ? '올리는 중…' : ready ? '다시 올리기' : '모델 올리기'}
      </button>

      <p className="mt-6 px-1 text-12.5 tracking-[.06em] text-ink-3">스모크 5문장</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {SMOKE.map((sample) => (
          <button
            key={sample}
            type="button"
            onClick={() => {
              setGolden(null);
              setText(sample);
            }}
            className="rounded-[9px] border border-line bg-card px-3 py-1.5 text-13 font-semibold text-ink-2"
          >
            {sample}
          </button>
        ))}
      </div>
      <textarea
        value={text}
        onChange={(e) => {
          setGolden(null);
          setText(e.target.value);
        }}
        rows={3}
        className="mt-3 w-full resize-none rounded-lg border border-line bg-card px-4 py-3 text-15.5 text-ink outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={parse}
        disabled={!text.trim() || busy !== null}
        className="mt-3 flex h-[52px] w-full items-center justify-center rounded-lg bg-action text-15.5 font-semibold text-white disabled:opacity-40"
      >
        {busy === 'parse' || busy === 'batch' ? '해석하는 중…' : '이 기기에서 해석'}
      </button>

      {error ? (
        <p className="mt-4 rounded-lg border border-danger bg-card px-4 py-3 text-[13.5px] leading-[1.7] text-danger">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className="mt-5 rounded-card border border-line bg-card px-[18px] py-4 shadow-card">
          <p className="text-12.5 font-bold tracking-wide2 text-ink-3">
            결과{elapsedMs != null ? ` · ${elapsedMs}ms` : ''}
            {marks ? (marksOk(marks) ? ' · 골든 통과' : ' · 골든 실패') : ''}
          </p>
          {golden && golden.text === text ? (
            <p className="mt-2 text-[13.5px] leading-[1.6] text-ink-2">
              기대 #{golden.n}: {golden.intent} · {golden.itemName ?? 'null'} ·{' '}
              {golden.daysAgo == null ? '날짜 없음' : `${golden.daysAgo}일 전`} · {cadenceLabel(golden.cadence)} ·{' '}
              {golden.save ? '저장' : '저장 안 함'}
            </p>
          ) : null}
          <dl className="mt-3 space-y-2 text-[14.5px] text-ink">
            <Fact label="intent" value={result.intent} />
            <Fact label="item_name" value={result.itemName ?? 'null'} />
            <Fact label="days_ago" value={String(result.daysAgo)} />
            <Fact label="matched_item_id" value={result.matchedItemId ?? 'null'} />
            <Fact label="candidate_ids" value={result.candidateIds.join(', ') || '[]'} />
            <Fact label="confidence" value={result.confidence.toFixed(2)} />
            <Fact label="stated_cadence_days" value={result.statedCadenceDays == null ? 'null' : String(result.statedCadenceDays)} />
            <Fact label="will_save" value={result.willSave ? '저장' : '저장 안 함'} />
          </dl>
          <button
            type="button"
            onClick={() => setRawOpen((open) => !open)}
            className="mt-3 text-13 font-semibold text-accent-ink"
          >
            {rawOpen ? '원문 닫기' : '모델 원문 보기'}
          </button>
          {rawOpen ? (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-12.5 leading-[1.6] text-ink-2">
              {result.raw}
            </pre>
          ) : null}
        </section>
      ) : null}

      <GoldenSetPanel
        selected={golden}
        onSelect={(row) => {
          setGolden(row);
          setText(row.text);
        }}
        busy={busy !== null}
        onParseOne={parseGolden}
        onParseKind={parseKind}
        onScoreRules={scoreRulesKind}
        rulesRev={UTTERANCE_RULES_REV}
        runs={runs}
      />
    </main>
  );
}

function Row({
  label,
  ok,
  detail,
  last,
}: {
  label: string;
  ok: boolean;
  detail: string;
  last?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-3 py-2.5 ${last ? '' : 'border-b border-line'}`}>
      <p className="text-13 font-semibold text-ink-3">{label}</p>
      <p className={`text-right text-[13.5px] font-semibold ${ok ? 'text-ink' : 'text-danger'}`}>{detail}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
