'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSpeechRecognition } from '@/features/capture/use-speech-recognition';
import { parseWithRulesOnly } from '@/features/on-device/apply-rules';
import { setModelConsent } from '@/features/on-device/consent';
import {
  activeModelSpec,
  clearModelFiles,
  engineErrorMessage,
  engineProgressLabel,
  ensureEngine,
  isEngineReady,
  setActiveModel,
  subscribeEngineProgress,
  type EngineProgress,
} from '@/features/on-device/engine';
import type { ModelId } from '@/features/on-device/models';
import { buildParseInstruction } from '@/features/on-device/parse-prompt';
import type { OnDeviceKnownItem } from '@/features/on-device/types';

import { jsHeapMB, readDeviceInfo, type DeviceInfo } from './device-info';
import {
  ENGINE_LABELS,
  markCase,
  MODE_LABELS,
  runCase,
  summarize,
  type CaseOutcome,
  type EngineId,
  type RunMode,
} from './evaluate';
import { GOLDEN_V1, parseGoldenCsv, resolveDaysAgo, type GoldenSet } from './golden';
import {
  EMPTY_STATE,
  loadLab,
  runKey,
  saveLab,
  type BenchRecord,
  type LabState,
} from './lab-store';
import { buildInstructionV2 } from './prompt-v2';

const ENGINES: EngineId[] = ['rule', 'gemma3-1b', 'gemma3-270m', 'chrome-nano'];
const MODES: RunMode[] = ['actual', 'model-v2'];

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ms: number | null) => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}초`);
const mb = (bytes: number | null) => (bytes === null ? '—' : `${Math.round(bytes / 1_048_576)}MB`);

export function LabScreen() {
  const [lab, setLab] = useState<LabState>(EMPTY_STATE);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [engine, setEngine] = useState<EngineId>('gemma3-1b');
  const [goldenSet, setGoldenSet] = useState<GoldenSet>(GOLDEN_V1);
  const [referenceDate, setReferenceDate] = useState(todayIso);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setLab(loadLab());
    void readDeviceInfo().then(setDevice);
    return subscribeEngineProgress(setProgress);
  }, []);

  const update = useCallback((fn: (prev: LabState) => LabState) => {
    setLab((prev) => {
      const next = fn(prev);
      saveLab(next);
      return next;
    });
  }, []);

  const knownItems: OnDeviceKnownItem[] = useMemo(
    () => goldenSet.knownItems.map((item) => ({ ...item, lastDoneOn: null })),
    [goldenSet],
  );

  /** 고른 엔진이 실제로 올라갔는지. Nano 가 없는 기기는 1B 로 대체되므로 막는다. */
  const engineMatches = useCallback(() => {
    if (engine === 'rule') return true;
    return activeModelSpec().id === engine;
  }, [engine]);

  const selectEngine = (next: EngineId) => {
    setEngine(next);
    setNotice(null);
    if (next !== 'rule') setActiveModel(next as ModelId);
  };

  const prepare = async (fresh: boolean) => {
    if (engine === 'rule') return;
    setNotice(null);
    setModelConsent('granted');
    setActiveModel(engine as ModelId);
    if (!engineMatches()) {
      setNotice(
        `이 기기에서는 ${ENGINE_LABELS[engine]} 를 쓸 수 없어요. 앱은 ${activeModelSpec().label} 로 대체해요.`,
      );
      update((prev) => ({
        ...prev,
        bench: { ...prev.bench, [engine]: benchRecord(prev.bench[engine], { support: '미지원' }) },
      }));
      return;
    }

    setPreparing(true);
    if (fresh) await clearModelFiles(engine as ModelId);

    const t0 = performance.now();
    let sawDownload = false;
    let compileAt: number | null = null;
    let bytes: number | null = null;
    const unsub = subscribeEngineProgress((p) => {
      if (p.status === 'downloading') {
        sawDownload = true;
        if (p.total > 100) bytes = p.total;
      }
      if (p.status === 'compiling' && compileAt === null) compileAt = performance.now();
    });

    try {
      await ensureEngine();
      const readyAt = performance.now();
      const compileStart: number = compileAt ?? t0;
      update((prev) => ({
        ...prev,
        bench: {
          ...prev.bench,
          [engine]: benchRecord(prev.bench[engine], {
            fromCache: !sawDownload,
            downloadMs: sawDownload ? Math.round(compileStart - t0) : null,
            downloadBytes: bytes,
            prepareMs: Math.round(readyAt - compileStart),
            jsHeapMB: jsHeapMB(),
            support: '지원',
          }),
        },
      }));
    } catch (err) {
      setNotice(engineErrorMessage(err));
    } finally {
      unsub();
      setPreparing(false);
      void readDeviceInfo().then(setDevice);
    }
  };

  const onCsv = async (file: File) => {
    try {
      const text = await file.text();
      setGoldenSet(parseGoldenCsv(text, file.name.replace(/\.csv$/i, '')));
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const exportJson = () => {
    const tables = Object.values(lab.runs).map((run) => ({
      engine: run.engine,
      mode: run.mode,
      setVersion: run.setVersion,
      referenceDate: run.referenceDate,
      at: run.at,
      summary: summarize(
        run.setVersion === goldenSet.version ? goldenSet.cases : GOLDEN_V1.cases,
        run.outcomes,
        run.referenceDate,
      ),
    }));
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            commit: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null,
            device,
            bench: lab.bench,
            tables,
            runs: lab.runs,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lastly-lab-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="space-y-6 px-4 pb-24 pt-6 text-[14px] text-ink">
      <header>
        <p className="text-[12px] font-bold text-accent-ink">개발용 · 서버 없이 이 기기에서만 동작</p>
        <h1 className="mt-1 text-[22px] font-bold">온디바이스 실험실</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          실사용 = 캡처 화면과 같은 interpretLocally · 모델 판단 = 실험용 지시문 v2
        </p>
      </header>

      <Section title="① 기기 · 엔진 준비">
        <DeviceBox device={device} />
        <div className="mt-3 flex flex-wrap gap-2">
          {ENGINES.map((id) => (
            <Chip key={id} active={engine === id} onClick={() => selectEngine(id)}>
              {ENGINE_LABELS[id]}
            </Chip>
          ))}
        </div>
        {engine !== 'rule' ? (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <Button onClick={() => void prepare(false)} disabled={preparing}>
                준비
              </Button>
              <Button onClick={() => void prepare(true)} disabled={preparing || engine === 'chrome-nano'}>
                파일 지우고 새로 받기 (다운로드 시간 측정)
              </Button>
            </div>
            <p className="text-[13px] text-ink-2">
              {progress ? engineProgressLabel(progress) || progress.status : '대기'}
              {isEngineReady() && engineMatches() ? ' · 준비 완료' : ''}
            </p>
          </div>
        ) : (
          <p className="mt-3 text-[13px] text-ink-3">규칙 엔진은 받을 파일이 없어요.</p>
        )}
        {notice ? <p className="mt-2 text-[13px] text-danger">{notice}</p> : null}
      </Section>

      <DirectInput
        engine={engine}
        referenceDate={referenceDate}
        knownItems={knownItems}
        engineMatches={engineMatches}
      />

      <GoldenRunner
        engine={engine}
        goldenSet={goldenSet}
        referenceDate={referenceDate}
        setReferenceDate={setReferenceDate}
        knownItems={knownItems}
        lab={lab}
        update={update}
        engineMatches={engineMatches}
        onCsv={onCsv}
      />

      <Table1 lab={lab} goldenSet={goldenSet} update={update} />
      <Table2 lab={lab} goldenSet={goldenSet} />

      <Section title="⑥ 내보내기">
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson}>결과 JSON 내려받기</Button>
          <Button
            onClick={() => {
              if (confirm('쌓아 둔 결과를 모두 지울까요?')) update(() => EMPTY_STATE);
            }}
          >
            결과 초기화
          </Button>
        </div>
      </Section>
    </main>
  );
}

function benchRecord(prev: BenchRecord | undefined, patch: Partial<BenchRecord>): BenchRecord {
  return {
    fromCache: false,
    downloadMs: null,
    downloadBytes: null,
    prepareMs: null,
    jsHeapMB: null,
    crashed: false,
    support: '—',
    ...prev,
    ...patch,
    at: new Date().toISOString(),
  };
}

/* ───────────── ② 직접 입력 ───────────── */

function DirectInput({
  engine,
  referenceDate,
  knownItems,
  engineMatches,
}: {
  engine: EngineId;
  referenceDate: string;
  knownItems: OnDeviceKnownItem[];
  engineMatches: () => boolean;
}) {
  const speech = useSpeechRecognition();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!speech.listening && speech.transcript) setText(speech.transcript);
  }, [speech.listening, speech.transcript]);

  const run = async () => {
    const input = text.trim();
    if (!input) return;
    setBusy(true);
    try {
      const rules = parseWithRulesOnly(input, referenceDate, knownItems);
      const out: Record<string, unknown> = { rules };
      if (engine !== 'rule' && !engineMatches()) {
        out.warning = '고른 엔진이 이 기기에서 올라가지 않았어요. ①에서 준비해 주세요.';
      }
      if (engine !== 'rule' && !isEngineReady()) {
        out.warning = '모델이 준비 전이라 실사용 결과는 규칙으로만 나와요. ①에서 준비해 주세요.';
      }
      const actual = await runCase(engine, 'actual', input, referenceDate, knownItems);
      out.actual = actual;
      if (engine !== 'rule' && isEngineReady()) {
        out.v2 = await runCase(engine, 'model-v2', input, referenceDate, knownItems);
      }
      out.promptV1 = buildParseInstruction(input, referenceDate, knownItems);
      out.promptV2 = buildInstructionV2(input, referenceDate, knownItems);
      setResult(out);
    } finally {
      setBusy(false);
    }
  };

  const actual = result?.actual as (CaseOutcome & { detail: unknown }) | undefined;
  const v2 = result?.v2 as (CaseOutcome & { detail: unknown }) | undefined;

  return (
    <Section title="② 직접 입력 (음성 · 텍스트)">
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 어제 필터 갈았어"
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-card px-3"
        />
        {speech.supported ? (
          <Button onClick={speech.listening ? speech.stop : speech.start}>
            {speech.listening ? '■ 멈춤' : '🎤 말하기'}
          </Button>
        ) : null}
        <Button onClick={() => void run()} disabled={busy || !text.trim()}>
          {busy ? '해석 중' : '해석'}
        </Button>
      </div>
      {speech.error ? <p className="mt-1 text-[13px] text-danger">{speech.error}</p> : null}
      {result ? (
        <div className="mt-3 space-y-3">
          {result.warning ? <p className="text-[13px] text-danger">{String(result.warning)}</p> : null}
          {actual ? (
            <Verdict
              title={`실사용 (앱 그대로) · ${actual.ms}ms · ${actual.usedModel ? '모델 사용' : '규칙으로 끝남'}`}
              outcome={actual}
            />
          ) : null}
          {v2 ? <Verdict title={`모델 판단 (v2) · ${v2.ms}ms`} outcome={v2} /> : null}
          <Json title="규칙 결과" value={result.rules} />
          {actual ? <Json title="실사용 전체 (interpretLocally)" value={actual.detail} /> : null}
          {actual?.raw ? <Json title="실사용 모델 원문" value={actual.raw} /> : null}
          {v2 ? <Json title="v2 모델 원문" value={v2.raw ?? v2.error} /> : null}
          <Json title="보낸 지시문 v1 (앱)" value={result.promptV1} />
          <Json title="보낸 지시문 v2 (실험)" value={result.promptV2} />
        </div>
      ) : null}
    </Section>
  );
}

function Verdict({ title, outcome }: { title: string; outcome: CaseOutcome }) {
  return (
    <div className="rounded-md border border-line bg-card p-3">
      <p className="text-[12px] font-bold text-ink-3">{title}</p>
      <p className="mt-1">
        {outcome.intent === 'query' ? '조회' : '기록'} · {outcome.status ?? '—'} ·{' '}
        {outcome.activity ?? '(이름 없음)'} · {outcome.daysAgo ?? '—'}일 전 ·{' '}
        <b className={outcome.saved ? 'text-accent-ink' : 'text-ink-2'}>
          {outcome.saved ? '완료로 저장' : '저장 안 함'}
        </b>
      </p>
      {outcome.error ? <p className="mt-1 text-[12px] text-danger">{outcome.error}</p> : null}
    </div>
  );
}

/* ───────────── ③ 골든셋 ───────────── */

function GoldenRunner({
  engine,
  goldenSet,
  referenceDate,
  setReferenceDate,
  knownItems,
  lab,
  update,
  engineMatches,
  onCsv,
}: {
  engine: EngineId;
  goldenSet: GoldenSet;
  referenceDate: string;
  setReferenceDate: (v: string) => void;
  knownItems: OnDeviceKnownItem[];
  lab: LabState;
  update: (fn: (prev: LabState) => LabState) => void;
  engineMatches: () => boolean;
  onCsv: (file: File) => void;
}) {
  const [mode, setMode] = useState<RunMode>('actual');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showRows, setShowRows] = useState(false);
  const stopRef = useRef(false);

  const key = runKey(engine, mode, goldenSet.version);
  const run = lab.runs[key];

  const start = async () => {
    setError(null);
    if (engine !== 'rule') {
      if (!engineMatches()) {
        setError('고른 엔진이 이 기기에서 올라가지 않았어요.');
        return;
      }
      if (!isEngineReady()) {
        setError('①에서 먼저 "준비"를 눌러 모델을 올려 주세요. 준비 전이면 결과가 규칙으로만 나와요.');
        return;
      }
    }
    if (engine === 'rule' && mode === 'model-v2') {
      setError('규칙 엔진은 실사용만 있어요.');
      return;
    }

    stopRef.current = false;
    setRunning(true);
    setDone(0);
    const outcomes: Record<number, CaseOutcome> = {};
    const save = () =>
      update((prev) => ({
        ...prev,
        runs: {
          ...prev.runs,
          [key]: {
            engine,
            mode,
            setVersion: goldenSet.version,
            referenceDate,
            at: new Date().toISOString(),
            outcomes: { ...outcomes },
          },
        },
      }));

    for (const [index, gold] of goldenSet.cases.entries()) {
      if (stopRef.current) break;
      const got = await runCase(engine, mode, gold.text, referenceDate, knownItems);
      const { detail: _detail, ...outcome } = got;
      outcomes[gold.n] = { ...outcome, n: gold.n };
      setDone(index + 1);
      if ((index + 1) % 5 === 0) save();
    }
    save();
    setRunning(false);
  };

  return (
    <Section title="③ 골든셋 실행">
      <div className="flex flex-wrap items-center gap-2">
        {MODES.map((m) => (
          <Chip key={m} active={mode === m} onClick={() => setMode(m)}>
            {MODE_LABELS[m]}
          </Chip>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
        <span>
          세트 {goldenSet.version} · {goldenSet.cases.length}문장
        </span>
        <label className="cursor-pointer underline">
          CSV 올리기
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onCsv(file);
            }}
          />
        </label>
        <span>기준일</span>
        <input
          type="date"
          value={referenceDate}
          onChange={(e) => setReferenceDate(e.target.value)}
          className="rounded border border-line bg-card px-2 py-1"
        />
      </div>
      <div className="mt-3 flex gap-2">
        {running ? (
          <Button onClick={() => (stopRef.current = true)}>멈추기</Button>
        ) : (
          <Button onClick={() => void start()}>
            {ENGINE_LABELS[engine]} · {MODE_LABELS[mode]} 실행
          </Button>
        )}
        {run ? <Button onClick={() => setShowRows((v) => !v)}>{showRows ? '문장별 접기' : '문장별 보기'}</Button> : null}
      </div>
      {running ? (
        <p className="mt-2 text-[13px] text-ink-2">
          {done} / {goldenSet.cases.length}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
      {run && showRows ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="text-ink-3">
              <tr>
                <th className="p-1 text-left">#</th>
                <th className="p-1 text-left">문장</th>
                <th className="p-1 text-left">기대</th>
                <th className="p-1 text-left">결과</th>
                <th className="p-1">판정</th>
              </tr>
            </thead>
            <tbody>
              {goldenSet.cases.map((gold) => {
                const got = run.outcomes[gold.n];
                if (!got) return null;
                const m = markCase(gold, got, run.referenceDate);
                const want = resolveDaysAgo(gold.date, run.referenceDate);
                const bad =
                  m.falseCompletion || !m.intent || !m.status || m.activity === 'miss' || m.date === false;
                return (
                  <tr key={gold.n} className={`border-t border-line align-top ${bad ? 'bg-[#fff1ef]' : ''}`}>
                    <td className="p-1">{gold.n}</td>
                    <td className="p-1">{gold.text}</td>
                    <td className="p-1 text-ink-2">
                      {gold.status} · {gold.activity ?? '—'} · {want ?? '—'}
                    </td>
                    <td className="p-1">
                      {got.status ?? '—'} · {got.activity ?? '—'} · {got.daysAgo ?? '—'}
                      {got.error ? <span className="text-danger"> · 오류</span> : null}
                    </td>
                    <td className="p-1 text-center">
                      {m.falseCompletion ? 'FC' : bad ? '✗' : '✓'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </Section>
  );
}

/* ───────────── ④ 표 1 ───────────── */

function Table1({
  lab,
  goldenSet,
  update,
}: {
  lab: LabState;
  goldenSet: GoldenSet;
  update: (fn: (prev: LabState) => LabState) => void;
}) {
  const accuracy = (engine: EngineId, mode: RunMode) => {
    const run = lab.runs[runKey(engine, mode, goldenSet.version)];
    return run ? summarize(goldenSet.cases, run.outcomes, run.referenceDate) : null;
  };

  return (
    <Section title="④ 표 1 — 방식별 비교">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[12px]">
          <thead className="text-ink-3">
            <tr>
              {['방식', '정확도 실사용', '정확도 v2', '평균 응답', '다운로드', '용량', '준비', 'JS 메모리', '탭 종료', '지원'].map(
                (h) => (
                  <th key={h} className="p-1 text-left">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {ENGINES.map((engine) => {
              const actual = accuracy(engine, 'actual');
              const v2 = accuracy(engine, 'model-v2');
              const bench = lab.bench[engine];
              return (
                <tr key={engine} className="border-t border-line">
                  <td className="p-1 font-bold">{ENGINE_LABELS[engine]}</td>
                  <td className="p-1">{actual ? pct(actual.all) : '—'}</td>
                  <td className="p-1">{v2 ? pct(v2.all) : '—'}</td>
                  <td className="p-1">
                    {actual ? `${actual.avgMs}ms` : '—'}
                    {v2 ? ` / v2 ${v2.avgMs}ms` : ''}
                  </td>
                  <td className="p-1">{bench?.fromCache ? '캐시' : sec(bench?.downloadMs ?? null)}</td>
                  <td className="p-1">{mb(bench?.downloadBytes ?? null)}</td>
                  <td className="p-1">{sec(bench?.prepareMs ?? null)}</td>
                  <td className="p-1">{bench?.jsHeapMB != null ? `${bench.jsHeapMB}MB` : '—'}</td>
                  <td className="p-1">
                    {engine === 'rule' ? (
                      '—'
                    ) : (
                      <input
                        type="checkbox"
                        checked={bench?.crashed ?? false}
                        onChange={(e) =>
                          update((prev) => ({
                            ...prev,
                            bench: {
                              ...prev.bench,
                              [engine]: benchRecord(prev.bench[engine], { crashed: e.target.checked }),
                            },
                          }))
                        }
                      />
                    )}
                  </td>
                  <td className="p-1">{engine === 'rule' ? '전부' : (bench?.support ?? '—')}</td>
                </tr>
              );
            })}
            <tr className="border-t border-line text-ink-3">
              <td className="p-1 font-bold">Cloud LLM</td>
              <td className="p-1" colSpan={9}>
                서버가 필요해 이 페이지에서는 재지 않아요 (latency · 비용은 PC 에서 따로)
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">
        정확도 = Intent · Status · Activity · Date 가 모두 맞은 문장 비율. 메모리는 JS 힙만이라 모델의 GPU
        메모리는 빠져 있어요 — 탭이 강제로 닫히면 &quot;탭 종료&quot;에 체크하세요.
      </p>
    </Section>
  );
}

/* ───────────── ⑤ 표 2 ───────────── */

function Table2({ lab, goldenSet }: { lab: LabState; goldenSet: GoldenSet }) {
  const rows = ENGINES.flatMap((engine) =>
    MODES.map((mode) => {
      const run = lab.runs[runKey(engine, mode, goldenSet.version)];
      return run ? { engine, mode, summary: summarize(goldenSet.cases, run.outcomes, run.referenceDate) } : null;
    }),
  ).filter((row): row is NonNullable<typeof row> => Boolean(row?.summary));

  return (
    <Section title="⑤ 표 2 — 정확도 자세히">
      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-3">③에서 실행하면 여기에 쌓여요.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead className="text-ink-3">
              <tr>
                {['엔진', '방식', 'Intent', 'Status', 'Activity', 'Date', 'False Completion', '문장'].map((h) => (
                  <th key={h} className="p-1 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ engine, mode, summary }) => (
                <tr key={`${engine}-${mode}`} className="border-t border-line">
                  <td className="p-1 font-bold">{ENGINE_LABELS[engine]}</td>
                  <td className="p-1">{mode === 'actual' ? '실사용' : 'v2'}</td>
                  <td className="p-1">{pct(summary!.intent)}</td>
                  <td className="p-1">{pct(summary!.status)}</td>
                  <td className="p-1">
                    {pct(summary!.activity)}
                    <span className="text-ink-3"> (부분 {pct(summary!.activityPartial)})</span>
                  </td>
                  <td className="p-1">{pct(summary!.date)}</td>
                  <td className="p-1 font-bold">
                    {pct(summary!.falseCompletion)}
                    <span className="font-normal text-ink-3">
                      {' '}
                      ({summary!.fcCount}/{summary!.fcBase})
                    </span>
                  </td>
                  <td className="p-1 text-ink-3">
                    {summary!.total}
                    {mode === 'actual' && engine !== 'rule' ? ` · 모델 ${summary!.usedModel}` : ''}
                    {summary!.toServer ? ` · 서버행 ${summary!.toServer}` : ''}
                    {summary!.errors ? ` · 오류 ${summary!.errors}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[12px] text-ink-3">
        실사용의 Status 는 &quot;저장 / 저장 안 함&quot; 만 맞춰요 (했는지는 규칙이 정해서 엔진마다 같아요). 엔진별
        Status · False Completion 비교는 v2 줄로 보세요. 미래 날짜는 채점하지 않아요.
      </p>
    </Section>
  );
}

/* ───────────── 작은 부품 ───────────── */

function DeviceBox({ device }: { device: DeviceInfo | null }) {
  if (!device) return <p className="text-[13px] text-ink-3">기기 정보를 읽는 중…</p>;
  return (
    <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-[12px]">
      <dt className="text-ink-3">RAM 등급</dt>
      <dd>{device.deviceMemory ? `${device.deviceMemory}GB 이상` : '알 수 없음'}</dd>
      <dt className="text-ink-3">CPU 코어</dt>
      <dd>{device.cores ?? '—'}</dd>
      <dt className="text-ink-3">WebGPU</dt>
      <dd>{device.webgpu}</dd>
      <dt className="text-ink-3">Chrome Nano</dt>
      <dd>{device.nano}</dd>
      <dt className="text-ink-3">저장공간</dt>
      <dd>
        {device.storageUsedMB ?? '—'}MB 사용 / {device.storageQuotaMB ?? '—'}MB
      </dd>
      <dt className="text-ink-3">브라우저</dt>
      <dd className="break-all text-ink-3">{device.userAgent}</dd>
    </dl>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <h2 className="mb-3 text-[16px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-10 shrink-0 rounded-md border border-line bg-bg px-3 text-[13px] font-semibold disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function Chip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-[13px] ${
        active ? 'border-accent-ink bg-accent-ink text-white' : 'border-line bg-bg text-ink-2'
      }`}
    >
      {children}
    </button>
  );
}

function Json({ title, value }: { title: string; value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return (
    <details className="rounded-md border border-line bg-bg">
      <summary className="cursor-pointer px-3 py-2 text-[12px] font-bold text-ink-2">{title}</summary>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all px-3 pb-3 text-[11px]">{text}</pre>
    </details>
  );
}
