'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MicButton } from '@/features/capture/components/capture-bar';
import { useSpeechRecognition } from '@/features/capture/use-speech-recognition';
import { parseWithRulesOnly } from '@/features/on-device/apply-rules';
import { setModelConsent } from '@/features/on-device/consent';
import { GPU_INSECURE, GPU_UNAVAILABLE } from '@/features/on-device/engine-errors';
import {
  activeModelSpec,
  clearModelFiles,
  engineErrorMessage,
  isEngineCancelled,
  engineProgressLabel,
  ensureEngine,
  isEngineReady,
  isEngineSupported,
  setActiveModel,
  subscribeEngineProgress,
  type EngineProgress,
} from '@/features/on-device/engine';
import type { ModelId } from '@/features/on-device/models';
import { buildParseInstruction } from '@/features/on-device/parse-prompt';
import type { OnDeviceKnownItem } from '@/features/on-device/types';

import {
  buildCloudUserPrompt,
  costUsd,
  EMPTY_CLOUD,
  loadCloudSettings,
  saveCloudSettings,
  type CloudSettings,
} from './cloud-gemini';
import { CLOUD_SYSTEM_PROMPT } from './cloud-prompt.generated';
import { engineVerdicts, jsHeapMB, readDeviceInfo, type DeviceInfo, type Verdict } from './device-info';
import {
  ENGINE_LABELS,
  isOnDevice,
  isCorrect,
  markCase,
  MODE_LABELS,
  modeSteps,
  runCase,
  summarize,
  type CaseOutcome,
  type EngineId,
  type RunContext,
  type RunMode,
  type Table2Row,
} from './evaluate';
import {
  GOLDEN_V1,
  goldenToCsv,
  parseGoldenCsv,
  resolveDaysAgo,
  type GoldenSet,
} from './golden';
import {
  clearPreparing,
  EMPTY_STATE,
  loadLab,
  markPreparing,
  runKey,
  saveLab,
  takeInterruptedPrepare,
  type BenchRecord,
  type LabState,
  type RunRecord,
} from './lab-store';
import { buildExperimentInstruction, EXPERIMENT_INSTRUCTIONS } from './prompt-experiment';
import { labReportMd } from './report';
import { isOriginalPrompt, loadPromptBody, promptTag, savePromptBody } from './prompt-lab';
import {
  applyRuleEdit,
  baseRules,
  EMPTY_EDIT,
  isEmptyEdit,
  loadRuleEdit,
  parseRuleEditJson,
  RULE_TABLES,
  ruleEditJson,
  ruleEditTs,
  ruleTag,
  saveRuleEdit,
  type RuleEdit,
  type RuleKey,
} from './rules-lab';

const ENGINES: EngineId[] = ['rule', 'gemma3-1b', 'gemma3-270m', 'chrome-nano', 'cloud-gemini'];
const MODES: RunMode[] = ['app', 'experiment'];

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ms: number | null | undefined) => (ms == null ? null : `${(ms / 1000).toFixed(1)}초`);
const mb = (bytes: number | null | undefined) => (bytes == null ? null : `${Math.round(bytes / 1_048_576)}MB`);

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function LabScreen() {
  const [lab, setLab] = useState<LabState>(EMPTY_STATE);
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [engine, setEngine] = useState<EngineId>('gemma3-1b');
  const [goldenSet, setGoldenSet] = useState<GoldenSet>(GOLDEN_V1);
  const [referenceDate, setReferenceDate] = useState(todayIso);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [cloud, setCloud] = useState<CloudSettings>(EMPTY_CLOUD);
  const [rules, setRules] = useState<RuleEdit>(EMPTY_EDIT);
  const [promptBody, setPromptBody] = useState(EXPERIMENT_INSTRUCTIONS);
  const [promptDirty, setPromptDirty] = useState(false);

  useEffect(() => {
    const interrupted = takeInterruptedPrepare();
    if (interrupted) {
      const loaded = loadLab();
      const next: LabState = {
        ...loaded,
        bench: {
          ...loaded.bench,
          [interrupted]: benchRecord(loaded.bench[interrupted], { crashed: true, support: '준비 중 탭 종료' }),
        },
      };
      saveLab(next);
      setLab(next);
      setNotice(
        `지난번 ${ENGINE_LABELS[interrupted]} 준비 중에 탭이 닫혔어요 (메모리 부족 추정). 표 1 에 "탭 종료"로 남겼어요. 직접 새로고침한 거라면 체크를 풀어 주세요.`,
      );
    } else {
      setLab(loadLab());
    }
    setCloud(loadCloudSettings());
    setPromptBody(loadPromptBody());
    const savedRules = loadRuleEdit();
    try {
      applyRuleEdit(savedRules);
      setRules(savedRules);
    } catch {
      saveRuleEdit(EMPTY_EDIT);
    }
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

  const updateCloud = (patch: Partial<CloudSettings>) => {
    setCloud((prev) => {
      const next = { ...prev, ...patch };
      saveCloudSettings(next);
      return next;
    });
  };

  const knownItems: OnDeviceKnownItem[] = useMemo(
    () => goldenSet.knownItems.map((item) => ({ ...item, lastDoneOn: null })),
    [goldenSet],
  );

  const context: RunContext = useMemo(
    () => ({ cloud, experimentBody: isOriginalPrompt(promptBody) ? undefined : promptBody }),
    [cloud, promptBody],
  );
  const tag = ruleTag(rules);
  const pTag = promptTag(promptBody);

  /** 고른 엔진이 실제로 올라갔는지. Nano 가 없는 기기는 1B 로 대체되므로 막는다. */
  const engineMatches = useCallback(() => {
    if (!isOnDevice(engine)) return true;
    return activeModelSpec().id === engine;
  }, [engine]);

  const selectEngine = (next: EngineId) => {
    setEngine(next);
    setNotice(null);
    if (isOnDevice(next)) setActiveModel(next as ModelId);
  };

  const prepare = async (fresh: boolean) => {
    if (!isOnDevice(engine)) return;
    setNotice(null);
    setModelConsent('granted');
    setActiveModel(engine as ModelId);
    const markUnsupported = () => {
      setNotice(
        isEngineSupported()
          ? `이 기기에서는 ${ENGINE_LABELS[engine]} 를 쓸 수 없어요. 앱은 ${activeModelSpec().label} 로 대체해요.`
          : `이 기기에서는 ${ENGINE_LABELS[engine]} 를 쓸 수 없어요. 앱은 로컬 AI 없이 규칙만 써요.`,
      );
      update((prev) => ({
        ...prev,
        bench: { ...prev.bench, [engine]: benchRecord(prev.bench[engine], { support: '미지원' }) },
      }));
    };
    if (!engineMatches()) {
      markUnsupported();
      return;
    }

    setPreparing(true);
    markPreparing(engine);
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
      // Nano API 는 있는데 사양이 모자라면 엔진이 준비 중에 Gemma 로 바꾼다. 그 기록을 Nano 로 남기지 않는다.
      if (!engineMatches()) {
        markUnsupported();
        return;
      }
      const readyAt = performance.now();
      // Nano 는 compiling 단계가 없다. 받기가 끝나면 곧 준비다.
      const compileStart: number = compileAt ?? (sawDownload ? readyAt : t0);
      update((prev) => ({
        ...prev,
        bench: {
          ...prev.bench,
          [engine]: benchRecord(prev.bench[engine], {
            fromCache: !sawDownload,
            downloadMs: sawDownload ? Math.round(compileStart - t0) : prev.bench[engine]?.downloadMs ?? null,
            downloadBytes: bytes ?? prev.bench[engine]?.downloadBytes ?? null,
            prepareMs: Math.round(readyAt - compileStart),
            jsHeapMB: jsHeapMB(),
            crashed: false,
            support: '지원',
          }),
        },
      }));
    } catch (err) {
      const message = engineErrorMessage(err);
      setNotice(message);
      // GPU 가 없어 못 올린 것도 표 1 지원환경에 남긴다.
      // 못 올린 것도 표 1 지원환경에 남긴다. 사용자가 멈춘 건 남기지 않는다.
      if (!isEngineCancelled(err)) {
        const support = message === GPU_UNAVAILABLE || message === GPU_INSECURE ? '미지원 (WebGPU)' : '준비 실패';
        update((prev) => ({
          ...prev,
          bench: { ...prev.bench, [engine]: benchRecord(prev.bench[engine], { support }) },
        }));
      }
    } finally {
      clearPreparing();
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

  const changePrompt = (next: string) => {
    setPromptBody(next);
    savePromptBody(next);
  };

  const changeRules = (next: RuleEdit) => {
    applyRuleEdit(next);
    setRules(next);
    saveRuleEdit(next);
  };

  const exportJson = () => {
    const tables = Object.values(lab.runs).map((run) => ({
      engine: run.engine,
      mode: run.mode,
      setVersion: run.setVersion,
      ruleTag: run.ruleTag,
      promptTag: run.promptTag ?? '',
      referenceDate: run.referenceDate,
      at: run.at,
      summary: summarize(
        run.setVersion === goldenSet.version ? goldenSet.cases : GOLDEN_V1.cases,
        run.outcomes,
        run.referenceDate,
      ),
    }));
    download(
      `lastly-lab-${todayIso()}.json`,
      JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          commit: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null,
          device,
          bench: lab.bench,
          cloud: { model: cloud.model, priceIn: cloud.priceIn, priceOut: cloud.priceOut },
          rules: isEmptyEdit(rules) ? null : { tag, ...rules },
          experimentPrompt: pTag ? { tag: pTag, body: promptBody } : null,
          tables,
          runs: lab.runs,
        },
        null,
        2,
      ),
      'application/json',
    );
  };

  return (
    <main className="space-y-6 px-4 pb-24 pt-6 text-[14px] text-ink">
      <header>
        <p className="text-[12px] font-bold text-accent-ink">개발용 · 서버 없이 이 기기에서만 동작</p>
        <h1 className="mt-1 text-[22px] font-bold">온디바이스 실험실</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          앱 경로 = 캡처 화면과 같은 interpretLocally · 실험 지시문 = prompt-experiment.ts 를 모델에 바로 보냄 (앱 미사용)
          {tag ? ` · 규칙 수정본 #${tag} 적용 중` : ''}
          {pTag ? ` · 실험 지시문 수정본 #${pTag} 적용 중` : ''}
        </p>
      </header>

      <Section title="① 기기 · 엔진 준비">
        <DeviceBox device={device} bench={lab.bench} />
        <div className="mt-3 flex flex-wrap gap-2">
          {ENGINES.map((id) => (
            <Chip key={id} active={engine === id} onClick={() => selectEngine(id)}>
              {ENGINE_LABELS[id]}
            </Chip>
          ))}
        </div>
        {isOnDevice(engine) ? (
          <div className="mt-3 space-y-2">
            <div className="flex flex-wrap gap-2">
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
        ) : engine === 'cloud-gemini' ? (
          <CloudBox cloud={cloud} onChange={updateCloud} />
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
        context={context}
        promptBody={promptBody}
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
        context={context}
        tag={tag}
        pTag={pTag}
        promptDirty={promptDirty}
      />

      <Table1 lab={lab} goldenSet={goldenSet} update={update} cloud={cloud} tag={tag} pTag={pTag} />
      <Table2 lab={lab} goldenSet={goldenSet} />

      <Section title="⑥ 내보내기">
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson}>결과 JSON 내려받기</Button>
          <Button
            onClick={() =>
              download(
                `lastly-lab-${todayIso()}.md`,
                labReportMd({
                  lab,
                  device,
                  goldenSet,
                  cloud,
                  ruleTag: tag,
                  promptTag: pTag,
                  commit: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? null,
                }),
                'text/markdown',
              )
            }
          >
            요약 MD 내려받기 (①·④·⑤)
          </Button>
          <Button
            onClick={() => {
              if (confirm('쌓아 둔 결과를 모두 지울까요?')) update(() => EMPTY_STATE);
            }}
          >
            결과 초기화
          </Button>
        </div>
        <p className="mt-2 text-[12px] text-ink-3">
          둘 다 이 브라우저에 쌓인 결과 전부(모든 엔진 · 방식 · 규칙/지시문 수정본)를 담아요. JSON 은 문장별 결과까지,
          MD 는 ① 기기 · ④ 표 1 · ⑤ 표 2 요약만이에요.
        </p>
      </Section>

      <RulesSection rules={rules} onChange={changeRules} tag={tag} />
      <PromptSection body={promptBody} onChange={changePrompt} tag={pTag} onDirtyChange={setPromptDirty} />
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

/* ───────────── ① Cloud 설정 ───────────── */

function CloudBox({
  cloud,
  onChange,
}: {
  cloud: CloudSettings;
  onChange: (patch: Partial<CloudSettings>) => void;
}) {
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  return (
    <div className="mt-3 space-y-2 text-[13px]">
      <label className="block">
        <span className="text-ink-3">Gemini API 키 (이 기기에만 저장)</span>
        <input
          type="password"
          value={cloud.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value.trim() })}
          className="mt-1 h-10 w-full rounded-md border border-line bg-bg px-3"
          placeholder="AI Studio 에서 받은 키"
        />
      </label>
      <label className="block">
        <span className="text-ink-3">모델 (apps/ai 기본값과 같게)</span>
        <input
          value={cloud.model}
          onChange={(e) => onChange({ model: e.target.value.trim() })}
          className="mt-1 h-10 w-full rounded-md border border-line bg-bg px-3"
        />
      </label>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="text-ink-3">입력 단가 $/1M</span>
          <input
            inputMode="decimal"
            value={cloud.priceIn ?? ''}
            onChange={(e) => onChange({ priceIn: num(e.target.value) })}
            className="mt-1 h-10 w-full rounded-md border border-line bg-bg px-3"
          />
        </label>
        <label className="flex-1">
          <span className="text-ink-3">출력 단가 $/1M</span>
          <input
            inputMode="decimal"
            value={cloud.priceOut ?? ''}
            onChange={(e) => onChange({ priceOut: num(e.target.value) })}
            className="mt-1 h-10 w-full rounded-md border border-line bg-bg px-3"
          />
        </label>
      </div>
      <p className="text-[12px] text-ink-3">
        운영 키 말고 테스트용 키를 쓰고, AI Studio 에서 키 사용처를 이 배포 주소로 제한해 두세요. 단가는
        Gemini 가격표에서 그 모델 값을 넣으면 표 1 비용이 계산돼요.
      </p>
    </div>
  );
}

/* ───────────── ② 직접 입력 ───────────── */

function DirectInput({
  engine,
  referenceDate,
  knownItems,
  engineMatches,
  context,
  promptBody,
}: {
  engine: EngineId;
  referenceDate: string;
  knownItems: OnDeviceKnownItem[];
  engineMatches: () => boolean;
  context: RunContext;
  promptBody: string;
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
      const out: Record<string, unknown> = {
        rules: parseWithRulesOnly(input, referenceDate, knownItems),
      };
      const modelReady =
        engine === 'cloud-gemini' ? Boolean(context.cloud?.apiKey) : isOnDevice(engine) && isEngineReady() && engineMatches();
      if (engine !== 'rule' && !modelReady) {
        out.warning =
          engine === 'cloud-gemini'
            ? 'Gemini API 키를 ①에 넣어 주세요. 지금은 규칙으로만 나와요.'
            : '모델이 준비 전이라 앱 경로 결과는 규칙으로만 나와요. ①에서 준비해 주세요.';
      }
      out.app = await runCase(engine, 'app', input, referenceDate, knownItems, context);
      if (engine !== 'rule' && modelReady) {
        out.experiment = await runCase(engine, 'experiment', input, referenceDate, knownItems, context);
      }
      if (engine === 'cloud-gemini') {
        out.promptCloud = `[system]\n${CLOUD_SYSTEM_PROMPT}\n\n[user]\n${buildCloudUserPrompt(input, referenceDate, knownItems)}`;
      } else {
        out.promptApp = buildParseInstruction(input, referenceDate, knownItems);
      }
      out.promptExperiment = buildExperimentInstruction(input, referenceDate, knownItems, promptBody);
      setResult(out);
    } finally {
      setBusy(false);
    }
  };

  const app = result?.app as (CaseOutcome & { detail: unknown }) | undefined;
  const experiment = result?.experiment as (CaseOutcome & { detail: unknown }) | undefined;

  return (
    <Section title="② 직접 입력 (음성 · 텍스트)">
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 어제 필터 갈았어"
          className="h-11 min-w-0 flex-1 rounded-md border border-line bg-card px-3"
        />
        {speech.supported ? (
          <MicButton listening={speech.listening} onClick={speech.listening ? speech.stop : speech.start} />
        ) : null}
        <Button onClick={() => void run()} disabled={busy || !text.trim()}>
          {busy ? '해석 중' : '해석'}
        </Button>
      </div>
      {speech.error ? <p className="mt-1 text-[13px] text-danger">{speech.error}</p> : null}
      {result ? (
        <div className="mt-3 space-y-3">
          {result.warning ? <p className="text-[13px] text-danger">{String(result.warning)}</p> : null}
          {app ? (
            <Verdict
              title={`앱 경로 · ${app.ms}ms · ${app.usedModel ? '모델 사용' : '규칙으로 끝남'}`}
              hint={
                engine === 'rule'
                  ? '규칙만으로 정했어요.'
                  : app.usedModel
                    ? '규칙이 못 끝내서 모델까지 갔어요. 모델 값 위에 규칙을 덧씌웠어요 (저장 여부는 규칙).'
                    : '규칙이 먼저 끝내서 모델은 부르지 않았어요.'
              }
              outcome={app}
            />
          ) : null}
          {experiment ? (
            <Verdict
              title={`실험 지시문 · ${experiment.ms}ms`}
              hint="규칙 없이 실험 지시문을 모델에 바로 보냈어요. status 가 완료일 때만 저장."
              outcome={experiment}
            />
          ) : null}
          <Json title="규칙 결과" value={result.rules} />
          {app ? <Json title="앱 경로 전체" value={app.detail} /> : null}
          {app?.raw ? <Json title="앱 경로 모델 원문" value={app.raw} /> : null}
          {experiment ? <Json title="실험 지시문 모델 원문" value={experiment.raw ?? experiment.error} /> : null}
          {result.promptApp ? <Json title="보낸 앱 지시문 (parse-prompt.ts)" value={result.promptApp} /> : null}
          {result.promptCloud ? <Json title="보낸 지시문 (Cloud, apps/ai 와 같음)" value={result.promptCloud} /> : null}
          <Json
            title={isOriginalPrompt(promptBody) ? '실험 지시문 (prompt-experiment.ts, 앱 미사용)' : '실험 지시문 (⑧ 수정본, 앱 미사용)'}
            value={result.promptExperiment}
          />
        </div>
      ) : null}
    </Section>
  );
}

function Verdict({ title, hint, outcome }: { title: string; hint?: string; outcome: CaseOutcome }) {
  return (
    <div className="rounded-md border border-line bg-card p-3">
      <p className="text-[12px] font-bold text-ink-3">{title}</p>
      {hint ? <p className="text-[11px] text-ink-3">{hint}</p> : null}
      <p className="mt-1">
        {outcome.intent === 'query' ? '조회' : '기록'} · {outcome.status ?? '—'} ·{' '}
        {outcome.activity ?? '(이름 없음)'} · {outcome.daysAgo ?? '—'}일 전 ·{' '}
        <b className={outcome.saved ? 'text-accent-ink' : 'text-ink-2'}>
          {outcome.saved ? '완료로 저장' : '저장 안 함'}
        </b>
        {outcome.tokensIn != null ? (
          <span className="text-ink-3">
            {' '}
            · 토큰 {outcome.tokensIn}/{outcome.tokensOut}
          </span>
        ) : null}
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
  context,
  tag,
  pTag,
  promptDirty,
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
  context: RunContext;
  tag: string;
  pTag: string;
  promptDirty: boolean;
}) {
  const [mode, setMode] = useState<RunMode>('app');
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<'none' | 'set' | 'result'>('none');
  const stopRef = useRef(false);

  /** 앱 경로는 규칙 수정에, 실험 지시문은 지시문 수정에 따라 결과가 갈린다. */
  const runTag = mode === 'app' ? tag : pTag;
  const tagLabel = runTag ? (mode === 'app' ? ` · 규칙 #${runTag}` : ` · 지시문 #${runTag}`) : '';
  const key = runKey(engine, mode, goldenSet.version, runTag);
  const run = lab.runs[key];
  const runSummary = run ? summarize(goldenSet.cases, run.outcomes, run.referenceDate) : null;
  const [liveCorrect, setLiveCorrect] = useState(0);

  const start = async () => {
    setError(null);
    if (isOnDevice(engine)) {
      if (!engineMatches()) {
        setError('고른 엔진이 이 기기에서 올라가지 않았어요.');
        return;
      }
      if (!isEngineReady()) {
        setError('①에서 먼저 "준비"를 눌러 모델을 올려 주세요. 준비 전이면 결과가 규칙으로만 나와요.');
        return;
      }
    }
    if (engine === 'cloud-gemini' && !context.cloud?.apiKey) {
      setError('①에 Gemini API 키를 넣어 주세요.');
      return;
    }
    if (engine === 'rule' && mode === 'experiment') {
      setError('규칙 엔진은 앱 경로만 있어요.');
      return;
    }

    stopRef.current = false;
    setRunning(true);
    setDone(0);
    setLiveCorrect(0);
    let correct = 0;
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
            ruleTag: mode === 'app' ? tag : '',
            promptTag: mode === 'experiment' ? pTag : '',
            referenceDate,
            at: new Date().toISOString(),
            outcomes: { ...outcomes },
          },
        },
      }));

    for (const [index, gold] of goldenSet.cases.entries()) {
      if (stopRef.current) break;
      const got = await runCase(engine, mode, gold.text, referenceDate, knownItems, context);
      const { detail: _detail, ...outcome } = got;
      const saved = { ...outcome, n: gold.n };
      outcomes[gold.n] = saved;
      if (isCorrect(markCase(gold, saved, referenceDate))) correct += 1;
      setLiveCorrect(correct);
      setDone(index + 1);
      if ((index + 1) % 5 === 0) save();
    }
    save();
    setRunning(false);
    setView('result');
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
      {engine === 'rule' && mode === 'experiment' ? null : (
        <ol className="mt-2 list-decimal space-y-0.5 rounded-md bg-bg py-2 pl-7 pr-3 text-[12px] text-ink-2">
          {modeSteps(engine, mode).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-ink-2">
        <span>
          세트 {goldenSet.version} · {goldenSet.cases.length}문장
        </span>
        <button type="button" className="underline" onClick={() => setView(view === 'set' ? 'none' : 'set')}>
          {view === 'set' ? '세트 접기' : '세트 보기'}
        </button>
        <button
          type="button"
          className="underline"
          onClick={() => download(`golden-${goldenSet.version}.csv`, goldenToCsv(goldenSet), 'text/csv')}
        >
          CSV 내려받기
        </button>
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
      </div>
      <div className="mt-2 flex items-center gap-2 text-[13px] text-ink-2">
        <span>기준일</span>
        <input
          type="date"
          value={referenceDate}
          onChange={(e) => setReferenceDate(e.target.value)}
          className="rounded border border-line bg-card px-2 py-1"
        />
      </div>
      {runSummary && !running ? (
        <p className="mt-3 text-[14px] font-bold">
          {goldenSet.cases.length}문장 중 정답 {runSummary.correctCount} · 오답{' '}
          {runSummary.total - runSummary.correctCount}
          <span className="font-normal text-ink-2">
            {' '}
            · False Completion {runSummary.fcCount}/{runSummary.fcBase}
            {runSummary.errors ? ` · 오류 ${runSummary.errors}` : ''}
            {runSummary.total < goldenSet.cases.length ? ` · ${runSummary.total}문장까지만 실행` : ''}
          </span>
          <span className="block text-[12px] font-normal text-ink-3">
            {mode === 'app'
              ? `규칙: ${tag ? `수정본 #${tag}` : '원본'} 기준 결과`
              : `실험 지시문: ${pTag ? `수정본 #${pTag}` : '원본'} 기준 결과`}
          </span>
        </p>
      ) : null}
      {mode === 'app' && (pTag || promptDirty) ? (
        <p className="mt-2 text-[12px] text-ink-3">
          앱 경로는 앱 지시문을 써서 ⑧ 실험 지시문 수정과 무관해요. 수정본을 재려면 &quot;실험 지시문&quot;을 고르세요.
        </p>
      ) : null}
      {mode === 'experiment' && promptDirty ? (
        <p className="mt-2 text-[12px] text-danger">
          ⑧에서 고친 내용을 아직 &quot;적용&quot;하지 않았어요. 지금 실행하면 {pTag ? `수정본 #${pTag}` : '원본'}으로 돌아요.
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {running ? (
          <Button onClick={() => (stopRef.current = true)}>멈추기</Button>
        ) : (
          <Button onClick={() => void start()}>
            {ENGINE_LABELS[engine]} · {MODE_LABELS[mode]}
            {tagLabel} 실행
          </Button>
        )}
        {run ? (
          <Button onClick={() => setView(view === 'result' ? 'none' : 'result')}>
            {view === 'result' ? '문장별 접기' : '문장별 결과'}
          </Button>
        ) : null}
      </div>
      {running ? (
        <p className="mt-2 text-[13px] text-ink-2">
          {done} / {goldenSet.cases.length} · 지금까지 정답 {liveCorrect}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}

      {view === 'set' ? <SetTable goldenSet={goldenSet} referenceDate={referenceDate} /> : null}
      {view === 'result' && run ? <ResultTable goldenSet={goldenSet} run={run} /> : null}
    </Section>
  );
}

function SetTable({ goldenSet, referenceDate }: { goldenSet: GoldenSet; referenceDate: string }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[520px] text-[12px]">
        <thead className="text-ink-3">
          <tr>
            {['#', '문장', 'Intent', 'Status', 'Activity', 'Date', '함정'].map((h) => (
              <th key={h} className="p-1 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {goldenSet.cases.map((c) => {
            const days = resolveDaysAgo(c.date, referenceDate);
            return (
              <tr key={c.n} className="border-t border-line align-top">
                <td className="p-1">{c.n}</td>
                <td className="p-1">{c.text}</td>
                <td className="p-1">{c.intent === 'query' ? '조회' : '기록'}</td>
                <td className="p-1">{c.status}</td>
                <td className="p-1">{c.activity ?? '—'}</td>
                <td className="p-1">
                  {c.date === null ? '—' : typeof c.date === 'string' ? `${c.date} (${days})` : c.date}
                </td>
                <td className="p-1">{c.trap ? 'O' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-1 text-[12px] text-ink-3">Date: 며칠 전(음수는 앞으로). 표현은 기준일로 계산한 값을 괄호에.</p>
    </div>
  );
}

function ResultTable({ goldenSet, run }: { goldenSet: GoldenSet; run: RunRecord }) {
  return (
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
            // 위 정답 개수와 같은 기준. 이름만 부분 일치면 노랑으로 구분한다.
            const ok = isCorrect(m);
            const partialOnly = !ok && isCorrect({ ...m, activity: 'exact' }) && m.activity === 'partial';
            const tone = ok ? '' : partialOnly ? 'bg-[#fff8e1]' : 'bg-[#fff1ef]';
            return (
              <tr key={gold.n} className={`border-t border-line align-top ${tone}`}>
                <td className="p-1">{gold.n}</td>
                <td className="p-1">{gold.text}</td>
                <td className="p-1 text-ink-2">
                  {gold.status} · {gold.activity ?? '—'} · {want ?? '—'}
                </td>
                <td className="p-1">
                  {got.status ?? '—'} · {got.activity ?? '—'} · {got.daysAgo ?? '—'}
                  {got.error ? <span className="text-danger"> · 오류</span> : null}
                </td>
                <td className="p-1 text-center">{m.falseCompletion ? 'FC' : ok ? '✓' : partialOnly ? '△' : '✗'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────── ④ 표 1 ───────────── */

function Table1({
  lab,
  goldenSet,
  update,
  cloud,
  tag,
  pTag,
}: {
  lab: LabState;
  goldenSet: GoldenSet;
  update: (fn: (prev: LabState) => LabState) => void;
  cloud: CloudSettings;
  tag: string;
  pTag: string;
}) {
  const summary = (engine: EngineId, mode: RunMode, runTag = ''): Table2Row | null => {
    const run = lab.runs[runKey(engine, mode, goldenSet.version, runTag)];
    return run ? summarize(goldenSet.cases, run.outcomes, run.referenceDate) : null;
  };

  /** 원본 결과 + 지금 적용 중인 수정본 결과(있으면). 수정본은 표 2 에 자세히. */
  const accuracy = (engine: EngineId) => {
    const parts = MODES.flatMap((mode) => {
      const variant = mode === 'app' ? tag : pTag;
      const original = summary(engine, mode);
      const edited = variant ? summary(engine, mode, variant) : null;
      const label = MODE_LABELS[mode];
      return [
        ...(original ? [`${label} ${pct(original.all)}`] : []),
        ...(edited ? [`${label} 수정 #${variant} ${pct(edited.all)}`] : []),
      ];
    });
    if (parts.length === 0) return <Todo>③ 실행</Todo>;
    return parts.join(' · ');
  };

  const bench = (engine: EngineId) => lab.bench[engine];

  const download = (engine: EngineId) => {
    const b = bench(engine);
    if (b?.support.startsWith('미지원') && b.downloadMs == null) return <span className="text-danger">{b.support}</span>;
    if (!b || (b.downloadMs == null && !b.fromCache)) return <Todo>① 새로 받기</Todo>;
    if (b.downloadMs == null) return <Todo>캐시에서 올림 — ① 새로 받기</Todo>;
    return `${sec(b.downloadMs)} · ${mb(b.downloadBytes) ?? '용량 —'}`;
  };

  const memory = (engine: EngineId) => {
    const b = bench(engine);
    return (
      <span className="inline-flex items-center gap-1">
        {b?.jsHeapMB != null ? `JS ${b.jsHeapMB}MB` : <Todo>① 준비</Todo>}
        <label className="inline-flex items-center gap-1 text-ink-3">
          <input
            type="checkbox"
            checked={b?.crashed ?? false}
            onChange={(e) =>
              update((prev) => ({
                ...prev,
                bench: { ...prev.bench, [engine]: benchRecord(prev.bench[engine], { crashed: e.target.checked }) },
              }))
            }
          />
          탭 종료
        </label>
      </span>
    );
  };

  const cloudSummary = summary('cloud-gemini', 'app') ?? summary('cloud-gemini', 'experiment');
  const cloudCalls = (() => {
    const runs = MODES.map((m) => lab.runs[runKey('cloud-gemini', m, goldenSet.version)]).filter(Boolean) as RunRecord[];
    const outs = runs.flatMap((r) => Object.values(r.outcomes)).filter((o) => o.tokensIn != null);
    if (outs.length === 0) return null;
    const tokensIn = outs.reduce((s, o) => s + (o.tokensIn ?? 0), 0) / outs.length;
    const tokensOut = outs.reduce((s, o) => s + (o.tokensOut ?? 0), 0) / outs.length;
    const ms = outs.reduce((s, o) => s + o.ms, 0) / outs.length;
    return { tokensIn, tokensOut, ms, maxMs: Math.max(...outs.map((o) => o.ms)), count: outs.length };
  })();
  const perCall = cloudCalls ? costUsd(cloud, cloudCalls.tokensIn, cloudCalls.tokensOut) : null;

  const rows: Array<{ engine: EngineId; items: Array<[string, React.ReactNode]> }> = [
    {
      engine: 'rule',
      items: [
        ['정확도', accuracy('rule')],
        ['속도', summary('rule', 'app') ? `평균 ${summary('rule', 'app')!.avgMs}ms` : <Todo>③ 실행</Todo>],
      ],
    },
    {
      engine: 'chrome-nano',
      items: [
        ['정확도', accuracy('chrome-nano')],
        [
          '준비시간',
          bench('chrome-nano')?.prepareMs != null ? (
            `${sec(bench('chrome-nano')!.prepareMs)}${bench('chrome-nano')!.downloadMs != null ? ` (받기 ${sec(bench('chrome-nano')!.downloadMs)})` : ''}`
          ) : (
            <Todo>① 준비</Todo>
          ),
        ],
        ['지원환경', bench('chrome-nano')?.support ?? <Todo>① 준비</Todo>],
      ],
    },
    ...(['gemma3-270m', 'gemma3-1b'] as EngineId[]).map((engine) => ({
      engine,
      items: [
        ['정확도', accuracy(engine)],
        ['다운로드', download(engine)],
        ['메모리', memory(engine)],
        [
          '응답 · 준비',
          <>
            {summary(engine, 'app')?.modelAvgMs != null
              ? `모델 ${summary(engine, 'app')!.modelAvgMs}ms`
              : summary(engine, 'experiment')
                ? `실험 지시문 ${summary(engine, 'experiment')!.avgMs}ms`
                : '—'}
            {bench(engine)?.prepareMs != null ? ` · 준비 ${sec(bench(engine)!.prepareMs)}` : ''}
          </>,
        ],
      ] as Array<[string, React.ReactNode]>,
    })),
    {
      engine: 'cloud-gemini',
      items: [
        ['정확도', accuracy('cloud-gemini')],
        [
          'latency',
          cloudCalls ? `평균 ${Math.round(cloudCalls.ms)}ms · 최대 ${cloudCalls.maxMs}ms` : <Todo>③ 실행 (키 필요)</Todo>,
        ],
        [
          '비용',
          cloudCalls ? (
            perCall != null ? (
              `호출당 $${perCall.toFixed(6)} · 1000회 $${(perCall * 1000).toFixed(3)} · 토큰 ${Math.round(cloudCalls.tokensIn)}/${Math.round(cloudCalls.tokensOut)}`
            ) : (
              <>
                토큰 {Math.round(cloudCalls.tokensIn)}/{Math.round(cloudCalls.tokensOut)} <Todo>① 단가 입력</Todo>
              </>
            )
          ) : (
            <Todo>③ 실행</Todo>
          ),
        ],
      ],
    },
  ];

  return (
    <Section title="④ 표 1 — 방식별 비교">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[360px] text-[12px]">
          <thead className="text-ink-3">
            <tr>
              <th className="w-[112px] p-1 text-left">방식</th>
              <th className="p-1 text-left">비교할 것</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ engine, items }) => (
              <tr key={engine} className="border-t border-line align-top">
                <td className="p-1 font-bold">{ENGINE_LABELS[engine]}</td>
                <td className="p-1">
                  <dl className="grid grid-cols-[72px_1fr] gap-x-2 gap-y-0.5">
                    {items.map(([label, value]) => (
                      <FragmentRow key={label} label={label} value={value} />
                    ))}
                  </dl>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[12px] text-ink-3">
        정확도 = Intent · Status · Activity · Date 가 모두 맞은 비율. &quot;수정 #번호&quot; 는 지금 적용 중인 규칙(앱 경로) · 실험 지시문 수정본 결과. 메모리는 JS 힙만이라 모델의
        GPU 메모리는 빠져 있어요 — 탭이 강제로 닫히면 &quot;탭 종료&quot;에 체크하세요.
        {cloudSummary ? ' Cloud 앱 경로는 서버의 DB 매칭 단계가 빠진 근사치예요.' : ''}
      </p>
    </Section>
  );
}

function FragmentRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </>
  );
}

function Todo({ children }: { children: React.ReactNode }) {
  return <span className="text-ink-3">— {children}</span>;
}

/* ───────────── ⑤ 표 2 ───────────── */

function Table2({ lab, goldenSet }: { lab: LabState; goldenSet: GoldenSet }) {
  const order = (run: RunRecord) =>
    ENGINES.indexOf(run.engine) * 10 + MODES.indexOf(run.mode) * 2 + (run.ruleTag || run.promptTag ? 1 : 0);
  const rows = Object.values(lab.runs)
    .filter((run) => run.setVersion === goldenSet.version)
    .sort((a, b) => order(a) - order(b))
    .map((run) => ({ run, summary: summarize(goldenSet.cases, run.outcomes, run.referenceDate) }))
    .filter((row): row is { run: RunRecord; summary: Table2Row } => Boolean(row.summary));

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
              {rows.map(({ run, summary }) => (
                <tr key={`${run.engine}-${run.mode}-${run.ruleTag}-${run.promptTag ?? ''}`} className="border-t border-line">
                  <td className="p-1 font-bold">
                    {ENGINE_LABELS[run.engine]}
                    {run.ruleTag ? <span className="font-normal text-accent-ink"> · 규칙 #{run.ruleTag}</span> : null}
                    {run.promptTag ? <span className="font-normal text-accent-ink"> · 지시문 #{run.promptTag}</span> : null}
                  </td>
                  <td className="p-1">{MODE_LABELS[run.mode]}</td>
                  <td className="p-1">{pct(summary.intent)}</td>
                  <td className="p-1">{pct(summary.status)}</td>
                  <td className="p-1">
                    {pct(summary.activity)}
                    <span className="text-ink-3"> (부분 {pct(summary.activityPartial)})</span>
                  </td>
                  <td className="p-1">{pct(summary.date)}</td>
                  <td className="p-1 font-bold">
                    {pct(summary.falseCompletion)}
                    <span className="font-normal text-ink-3">
                      {' '}
                      ({summary.fcCount}/{summary.fcBase})
                    </span>
                  </td>
                  <td className="p-1 text-ink-3">
                    정답 {summary.correctCount} / {summary.total}
                    {run.mode === 'app' && run.engine !== 'rule' ? ` · 모델 ${summary.usedModel}` : ''}
                    {summary.toServer ? ` · 서버행 ${summary.toServer}` : ''}
                    {summary.errors ? ` · 오류 ${summary.errors}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[12px] text-ink-3">
        앱 경로의 Status 는 &quot;저장 / 저장 안 함&quot; 만 맞춰요 (했는지는 규칙이 정해서 엔진마다 같아요). 엔진별
        Status · False Completion 비교는 실험 지시문 줄로 보세요. 미래 날짜는 채점하지 않아요.
      </p>
    </Section>
  );
}

/* ───────────── ⑦ 규칙 ───────────── */

function RulesSection({
  rules,
  onChange,
  tag,
}: {
  rules: RuleEdit;
  onChange: (next: RuleEdit) => void;
  tag: string;
}) {
  const base = useMemo(() => baseRules(), []);
  const [open, setOpen] = useState<RuleKey | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apply = (next: RuleEdit) => {
    try {
      onChange(next);
      setError(null);
    } catch (err) {
      setError(`정규식 오류: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const toggle = (key: RuleKey, index: number) => {
    const current = new Set(rules.disabled[key] ?? []);
    if (current.has(index)) current.delete(index);
    else current.add(index);
    apply({ ...rules, disabled: { ...rules.disabled, [key]: [...current].sort((a, b) => a - b) } });
  };

  const addPattern = (key: RuleKey) => {
    const input = draft.trim();
    if (!input) return;
    if (key === 'actionNouns') {
      const [source, noun] = input.split(/\s*(?:→|->)\s*/);
      if (!source || !noun) {
        setError('"정규식 → 명사" 모양으로 넣어 주세요. 예: 맞(?:았|췄)[가-힣]* → 맞춤');
        return;
      }
      apply({ ...rules, add: { ...rules.add, actionNouns: [...(rules.add.actionNouns ?? []), [source, noun]] } });
    } else {
      apply({ ...rules, add: { ...rules.add, [key]: [...(rules.add[key] ?? []), input] } });
    }
    setDraft('');
  };

  const removeAdded = (key: RuleKey, index: number) => {
    const list = [...((rules.add[key as keyof RuleEdit['add']] as unknown[]) ?? [])];
    list.splice(index, 1);
    apply({ ...rules, add: { ...rules.add, [key]: list } });
  };

  const onJson = async (file: File) => {
    try {
      apply(parseRuleEditJson(await file.text()));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Section title="⑦ 규칙 보기 · 실험">
      <p className="text-[13px] text-ink-2">
        원본: <code>packages/parser/src/utterance-rules.ts</code> (앱·API 공용). 여기서 바꾼 규칙은 이 기기의 실험실에만
        적용돼요. 바꾼 뒤 ③을 다시 돌리면 표 2에 &quot;규칙 #번호&quot; 줄이 원래 규칙 줄과 나란히 생겨요.
      </p>
      <p className="mt-1 text-[13px] font-bold">
        {tag ? `지금 규칙: 수정본 #${tag}` : '지금 규칙: 원본'}
      </p>
      <div className="mt-3 space-y-2">
        {RULE_TABLES.map((table) => {
          const patterns =
            table.key === 'actionNouns'
              ? base.actionNouns.map(([source, noun]) => `${source} → ${noun}`)
              : base[table.key];
          const added =
            table.key === 'actionNouns'
              ? (rules.add.actionNouns ?? []).map(([source, noun]) => `${source} → ${noun}`)
              : (rules.add[table.key] ?? []);
          const off = new Set(rules.disabled[table.key] ?? []);
          const isOpen = open === table.key;
          return (
            <div key={table.key} className="rounded-md border border-line bg-bg">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left"
                onClick={() => {
                  setOpen(isOpen ? null : table.key);
                  setDraft('');
                  setError(null);
                }}
              >
                <span>
                  <b>{table.label}</b> <span className="text-[12px] text-ink-3">{table.constName}</span>
                </span>
                <span className="text-[12px] text-ink-3">
                  {patterns.length}개{added.length ? ` · +${added.length}` : ''}
                  {off.size ? ` · 끔 ${off.size}` : ''}
                </span>
              </button>
              {isOpen ? (
                <div className="space-y-1 px-3 pb-3 text-[12px]">
                  <p className="text-ink-3">{table.hint}</p>
                  {added.map((source, i) => (
                    <div key={`a${i}`} className="flex items-start gap-2 text-accent-ink">
                      <button type="button" onClick={() => removeAdded(table.key, i)} className="shrink-0 underline">
                        빼기
                      </button>
                      <code className="break-all">+ {source}</code>
                    </div>
                  ))}
                  {patterns.map((source, i) => (
                    <label key={i} className="flex items-start gap-2">
                      <input type="checkbox" checked={!off.has(i)} onChange={() => toggle(table.key, i)} />
                      <code className={`break-all ${off.has(i) ? 'text-ink-3 line-through' : ''}`}>{source}</code>
                    </label>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={table.key === 'actionNouns' ? '정규식 → 명사' : '정규식 (예: 것도\\s*같)'}
                      className="h-9 min-w-0 flex-1 rounded border border-line bg-card px-2"
                    />
                    <Button onClick={() => addPattern(table.key)}>추가</Button>
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      {error ? <p className="mt-2 text-[13px] text-danger">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button onClick={() => download(`rules-${tag || 'original'}.json`, ruleEditJson(rules), 'application/json')}>
          규칙 JSON 내려받기
        </Button>
        <Button onClick={() => download(`rules-${tag || 'original'}.ts`, ruleEditTs(rules), 'text/plain')}>
          적용용 코드 내려받기
        </Button>
        <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-line bg-bg px-3 text-[13px] font-semibold">
          규칙 JSON 올리기
          <input
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onJson(file);
            }}
          />
        </label>
        <Button onClick={() => apply(EMPTY_EDIT)} disabled={!tag}>
          원래 규칙으로
        </Button>
      </div>
    </Section>
  );
}

/* ───────────── ⑧ 실험 지시문 ───────────── */

function PromptSection({
  body,
  onChange,
  tag,
  onDirtyChange,
}: {
  body: string;
  onChange: (next: string) => void;
  tag: string;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(body);
  useEffect(() => setDraft(body), [body]);
  const dirty = draft !== body;
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const onTxt = async (file: File) => {
    const text = await file.text();
    if (text.trim()) onChange(text);
  };

  return (
    <Section title="⑧ 실험 지시문 고쳐 보기">
      <p className="text-[13px] text-ink-2">
        원본: <code>apps/web/src/features/lab/prompt-experiment.ts</code>. &quot;실험 지시문&quot; 방식에서만 쓰고, 앱
        지시문(parse-prompt.ts)은 바뀌지 않아요. 기준일 · 기존 항목 · 문장 줄은 아래 본문 뒤에 자동으로 붙어요.
      </p>
      <p className="mt-1 text-[13px] text-ink-2">
        채점은 응답의 <code>intent · status · item_name · days_ago</code> 칸을 읽어요. 이 이름과 status 값(완료 ·
        미완료 · 미래 · 애매 · 조회)은 그대로 두세요.
      </p>
      <p className="mt-1 text-[13px] font-bold">{tag ? `지금 지시문: 수정본 #${tag}` : '지금 지시문: 원본'}</p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        rows={16}
        className="mt-2 w-full rounded-md border border-line bg-bg p-2 font-mono text-[12px]"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <Button onClick={() => onChange(draft)} disabled={!dirty || !draft.trim()}>
          적용
        </Button>
        <Button onClick={() => onChange(EXPERIMENT_INSTRUCTIONS)} disabled={!tag && !dirty}>
          원래 지시문으로
        </Button>
        <Button onClick={() => download(`experiment-prompt-${tag || 'original'}.txt`, body, 'text/plain')}>
          .txt 내려받기
        </Button>
        <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-line bg-bg px-3 text-[13px] font-semibold">
          .txt 올리기
          <input
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onTxt(file);
            }}
          />
        </label>
      </div>
      {dirty ? <p className="mt-1 text-[12px] text-ink-3">고친 내용은 &quot;적용&quot;을 눌러야 실행에 쓰여요.</p> : null}
      <p className="mt-1 text-[12px] text-ink-3">
        고친 뒤 ③에서 &quot;실험 지시문&quot;으로 다시 돌리면 표 2에 &quot;지시문 #번호&quot; 줄이 원본 줄과 나란히 생겨요.
      </p>
    </Section>
  );
}

/* ───────────── 작은 부품 ───────────── */

function DeviceBox({ device, bench }: { device: DeviceInfo | null; bench: LabState['bench'] }) {
  if (!device) return <p className="text-[13px] text-ink-3">기기 정보를 읽는 중…</p>;
  return (
    <div className="space-y-3">
      <SupportBox device={device} bench={bench} />
      <DeviceList device={device} />
    </div>
  );
}

function DeviceList({ device }: { device: DeviceInfo }) {
  return (
    <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-1 text-[12px]">
      <dt className="text-ink-3">RAM 등급</dt>
      <dd>{device.deviceMemory ? `${device.deviceMemory}GB 이상` : '알 수 없음'}</dd>
      <dt className="text-ink-3">CPU 코어</dt>
      <dd>{device.cores ?? '—'}</dd>
      <dt className="text-ink-3">보안 연결</dt>
      <dd>{device.secure ? '예 (https · localhost)' : '아니오'}</dd>
      <dt className="text-ink-3">WebGPU</dt>
      <dd>{device.webgpu}</dd>
      <dt className="text-ink-3">Core 어댑터</dt>
      <dd>{device.gpuAdapter ? '있음' : '없음'}</dd>
      <dt className="text-ink-3">호환 어댑터</dt>
      <dd>
        {device.compatAdapter == null ? '—' : device.compatAdapter ? '있음' : '없음'}
        {device.compatMaxBufferMB != null
          ? ` · 버퍼 ${device.compatMaxBufferMB}MB · 저장 바인딩 ${device.compatMaxStorageBindingMB ?? '—'}MB`
          : ''}
      </dd>
      <dt className="text-ink-3">shader-f16</dt>
      <dd>{device.shaderF16 == null ? '—' : device.shaderF16 ? '있음' : '없음'}</dd>
      <dt className="text-ink-3">GPU 버퍼 한도</dt>
      <dd>
        {device.maxBufferMB != null
          ? `버퍼 ${device.maxBufferMB}MB · 저장 바인딩 ${device.maxStorageBindingMB ?? '—'}MB`
          : '—'}
      </dd>
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

/** 이 기기에서 엔진별로 되는지. 앱이 실제로 고를 경로도 함께 보인다. */
function SupportBox({ device, bench }: { device: DeviceInfo; bench: LabState['bench'] }) {
  const v = engineVerdicts(device, bench);
  const rows: Array<[string, Verdict]> = [
    ['Rule Engine', v.rule],
    ['Gemma 3 270M', v['gemma3-270m']],
    ['Gemma 3 1B', v['gemma3-1b']],
    ['Chrome Nano', v['chrome-nano']],
    ['앱이 쓰는 경로', v.app],
  ];
  return (
    <div className="rounded-md border border-line bg-bg p-3">
      <p className="mb-2 text-[13px] font-bold">이 기기에서 로컬 AI</p>
      <ul className="space-y-1 text-[12px]">
        {rows.map(([label, verdict]) => (
          <li key={label} className="flex gap-2">
            <span className={verdict.ok ? 'text-accent-ink' : verdict.ok === null ? 'text-ink-3' : 'text-danger'}>
              {verdict.ok ? '✓' : verdict.ok === null ? '?' : '✕'}
            </span>
            <span className="w-[120px] shrink-0 font-semibold">{label}</span>
            <span className="text-ink-2">{verdict.text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-3">
        270M · 1B 는 WebGPU 조건이 같아도 메모리 때문에 결과가 갈릴 수 있어요. 각각 ① 준비를 눌러야 ✓/✕ 가 정해져요.
      </p>
    </div>
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
