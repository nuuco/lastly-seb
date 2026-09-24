import { costUsd, type CloudSettings } from './cloud-gemini';
import { engineVerdicts, type DeviceInfo } from './device-info';
import { ENGINE_LABELS, MODE_LABELS, summarize, type EngineId, type RunMode } from './evaluate';
import type { GoldenSet } from './golden';
import { runKey, type LabState, type RunRecord } from './lab-store';

/**
 * 실험실 ①·④·⑤ 를 마크다운 한 장으로. 회의록·노션·README 에 그대로 붙인다.
 * 화면 표와 같은 값(같은 summarize·engineVerdicts)을 쓴다.
 */
const pct = (v: number) => `${Math.round(v * 100)}%`;
const sec = (ms: number | null | undefined) => (ms == null ? null : `${(ms / 1000).toFixed(1)}초`);
const mb = (bytes: number | null | undefined) => (bytes == null ? null : `${Math.round(bytes / 1_048_576)}MB`);
const NONE = '미측정';
const cell = (text: string | null | undefined) => (text ?? NONE).replace(/\|/g, '\\|').replace(/\n/g, ' ');

const ENGINES: EngineId[] = ['rule', 'chrome-nano', 'gemma3-270m', 'gemma3-1b', 'cloud-gemini'];
const MODES: RunMode[] = ['app', 'experiment'];

interface ReportInput {
  lab: LabState;
  device: DeviceInfo | null;
  goldenSet: GoldenSet;
  cloud: CloudSettings;
  commit: string | null;
}

export function labReportMd({ lab, device, goldenSet, cloud, commit }: ReportInput): string {
  const summary = (engine: EngineId, mode: RunMode) => {
    const run = lab.runs[runKey(engine, mode, goldenSet.version)];
    return run ? summarize(goldenSet.cases, run.outcomes, run.referenceDate) : null;
  };
  const runs = Object.values(lab.runs).filter((run) => run.setVersion === goldenSet.version);
  const refDates = [...new Set(runs.map((run) => run.referenceDate))].join(', ') || '—';

  const out: string[] = [
    `# 로컬 AI 실험 결과`,
    '',
    `- 내보낸 때: ${new Date().toLocaleString('ko-KR')}`,
    `- 골든셋: ${goldenSet.version} · ${goldenSet.cases.length}문장 · 기준일 ${refDates}`,
    `- 커밋: ${commit ?? '—'}`,
    '',
  ];

  // ① 기기
  out.push('## ① 기기 · 엔진 준비', '');
  if (!device) {
    out.push('기기 정보를 읽지 못했어요.', '');
  } else {
    const v = engineVerdicts(device, lab.bench);
    const mark = (ok: boolean | null) => (ok ? '✓' : ok === null ? '?' : '✕');
    out.push(
      '| 엔진 | 가능 | 내용 |',
      '| --- | :-: | --- |',
      ...(
        [
          ['Rule Engine', v.rule],
          ['Gemma 3 270M', v['gemma3-270m']],
          ['Gemma 3 1B', v['gemma3-1b']],
          ['Chrome Nano', v['chrome-nano']],
          ['앱이 쓰는 경로', v.app],
        ] as const
      ).map(([label, verdict]) => `| ${label} | ${mark(verdict.ok)} | ${cell(verdict.text)} |`),
      '',
      '| 항목 | 값 |',
      '| --- | --- |',
      `| RAM 등급 | ${device.deviceMemory ? `${device.deviceMemory}GB 이상` : '알 수 없음'} |`,
      `| CPU 코어 | ${device.cores ?? '—'} |`,
      `| 보안 연결 | ${device.secure ? '예' : '아니오'} |`,
      `| WebGPU | ${cell(device.webgpu)} |`,
      `| Core 어댑터 | ${device.gpuAdapter ? '있음' : '없음'} |`,
      `| 호환 어댑터 | ${device.compatAdapter == null ? '—' : device.compatAdapter ? '있음' : '없음'} |`,
      `| shader-f16 | ${device.shaderF16 == null ? '—' : device.shaderF16 ? '있음' : '없음'} |`,
      `| GPU 버퍼 한도 | ${device.maxBufferMB != null ? `버퍼 ${device.maxBufferMB}MB · 저장 바인딩 ${device.maxStorageBindingMB ?? '—'}MB` : '—'} |`,
      `| Chrome Nano | ${cell(device.nano)} |`,
      `| 저장공간 | ${device.storageUsedMB ?? '—'}MB 사용 / ${device.storageQuotaMB ?? '—'}MB |`,
      `| 브라우저 | ${cell(device.userAgent)} |`,
      '',
    );
  }

  // ④ 표 1
  const accuracy = (engine: EngineId) => {
    const parts = MODES.flatMap((mode) => {
      const s = summary(engine, mode);
      return s ? [`${MODE_LABELS[mode]} ${pct(s.all)} (${s.correctCount}/${s.total})`] : [];
    });
    return parts.length ? parts.join(' · ') : null;
  };
  const speed = (engine: EngineId) => {
    const app = summary(engine, 'app');
    const exp = summary(engine, 'experiment');
    if (engine === 'rule') return app ? `평균 ${app.avgMs}ms` : null;
    if (app?.modelAvgMs != null) return `모델 평균 ${app.modelAvgMs}ms`;
    if (exp) return `실험 지시문 평균 ${exp.avgMs}ms · 최대 ${exp.maxMs}ms`;
    return null;
  };
  const bench = (engine: EngineId) => lab.bench[engine];
  const downloadText = (engine: EngineId) => {
    const b = bench(engine);
    if (!b) return null;
    if (b.downloadMs == null) return b.support.startsWith('미지원') ? b.support : null;
    return `${sec(b.downloadMs)} · ${mb(b.downloadBytes) ?? '용량 —'}`;
  };
  const memoryText = (engine: EngineId) => {
    const b = bench(engine);
    if (!b) return null;
    const heap = b.jsHeapMB != null ? `JS ${b.jsHeapMB}MB (GPU 제외)` : null;
    return [heap, b.crashed ? '탭 종료 있음' : heap ? '탭 종료 없음' : null].filter(Boolean).join(' · ') || null;
  };
  const cloudCost = (() => {
    const cloudRuns = MODES.map((m) => lab.runs[runKey('cloud-gemini', m, goldenSet.version)]).filter(
      Boolean,
    ) as RunRecord[];
    const outs = cloudRuns.flatMap((r) => Object.values(r.outcomes)).filter((o) => o.tokensIn != null);
    if (outs.length === 0) return { latency: null, cost: null };
    const tokensIn = outs.reduce((s, o) => s + (o.tokensIn ?? 0), 0) / outs.length;
    const tokensOut = outs.reduce((s, o) => s + (o.tokensOut ?? 0), 0) / outs.length;
    const ms = outs.reduce((s, o) => s + o.ms, 0) / outs.length;
    const perCall = costUsd(cloud, tokensIn, tokensOut);
    return {
      latency: `평균 ${Math.round(ms)}ms · 최대 ${Math.max(...outs.map((o) => o.ms))}ms`,
      cost:
        perCall != null
          ? `호출당 $${perCall.toFixed(6)} · 1000회 $${(perCall * 1000).toFixed(3)}`
          : `토큰 ${Math.round(tokensIn)}/${Math.round(tokensOut)} (단가 미입력)`,
    };
  })();

  const t1: Record<EngineId, Array<string | null>> = {
    rule: [accuracy('rule'), speed('rule'), '', '', '', '항상 가능', ''],
    'chrome-nano': [
      accuracy('chrome-nano'),
      speed('chrome-nano'),
      '',
      '',
      sec(bench('chrome-nano')?.prepareMs),
      bench('chrome-nano')?.support ?? null,
      '',
    ],
    'gemma3-270m': [
      accuracy('gemma3-270m'),
      speed('gemma3-270m'),
      downloadText('gemma3-270m'),
      memoryText('gemma3-270m'),
      sec(bench('gemma3-270m')?.prepareMs),
      bench('gemma3-270m')?.support ?? null,
      '',
    ],
    'gemma3-1b': [
      accuracy('gemma3-1b'),
      speed('gemma3-1b'),
      downloadText('gemma3-1b'),
      memoryText('gemma3-1b'),
      sec(bench('gemma3-1b')?.prepareMs),
      bench('gemma3-1b')?.support ?? null,
      '',
    ],
    'cloud-gemini': [accuracy('cloud-gemini'), cloudCost.latency, '', '', '', `${cloud.model} (API)`, cloudCost.cost],
  };
  out.push(
    '## ④ 표 1 — 방식별 비교',
    '',
    '| 방식 | 정확도 | 속도 · latency | 다운로드 | 메모리 | 준비시간 | 지원환경 | 비용 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...ENGINES.map((engine) => `| ${ENGINE_LABELS[engine]} | ${t1[engine].map(cell).join(' | ')} |`),
    '',
    '- 정확도 = Intent · Status · Activity · Date 가 모두 맞은 비율 (원래 규칙 · 원래 지시문 기준). 괄호는 정답 수 / 실행 문장 수',
    '- 빈 칸은 그 방식에 해당하지 않는 항목, "미측정" 은 아직 재지 않은 항목',
    '- 메모리는 JS 힙만 (모델이 쓰는 GPU 메모리는 웹에서 잴 수 없음)',
    '- Cloud 앱 경로는 "서버에 Gemini 해석을 둔다면" 가정. 지금 앱 서버에는 없는 경로',
    '',
  );

  // ⑤ 표 2
  const order = (run: RunRecord) =>
    ENGINES.indexOf(run.engine) * 10 + MODES.indexOf(run.mode) * 2 + (run.ruleTag || run.promptTag ? 1 : 0);
  const rows = runs
    .sort((a, b) => order(a) - order(b))
    .map((run) => ({ run, s: summarize(goldenSet.cases, run.outcomes, run.referenceDate) }))
    .filter((row) => row.s);
  out.push('## ⑤ 표 2 — 정확도 자세히', '');
  if (rows.length === 0) {
    out.push('아직 실행한 결과가 없어요.', '');
  } else {
    out.push(
      '| 엔진 | 방식 | Intent | Status | Activity (부분) | Date | False Completion | 정답 |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map(({ run, s }) => {
        const tag = [run.ruleTag ? `규칙 #${run.ruleTag}` : '', run.promptTag ? `지시문 #${run.promptTag}` : '']
          .filter(Boolean)
          .join(' ');
        const extra = [
          run.mode === 'app' && run.engine !== 'rule' ? `모델 ${s!.usedModel}` : '',
          s!.errors ? `오류 ${s!.errors}` : '',
        ]
          .filter(Boolean)
          .join(' · ');
        return `| ${ENGINE_LABELS[run.engine]}${tag ? ` (${tag})` : ''} | ${MODE_LABELS[run.mode]} | ${pct(s!.intent)} | ${pct(s!.status)} | ${pct(s!.activity)} (${pct(s!.activityPartial)}) | ${pct(s!.date)} | ${pct(s!.falseCompletion)} (${s!.fcCount}/${s!.fcBase}) | ${s!.correctCount}/${s!.total}${extra ? ` · ${extra}` : ''} |`;
      }),
      '',
      '- 앱 경로: 규칙 먼저 → 규칙이 못 끝낸 문장만 모델(앱 지시문) → 규칙 덧씌움. 저장 여부는 규칙이 정해 엔진마다 Status · False Completion 이 같음',
      '- 실험 지시문: 규칙 없이 모델에 바로. 엔진끼리 Status · False Completion 비교는 이 줄로',
      '- 앱 경로에서 저장 안 하는 게 맞는 문장을 저장하지 않았으면 Activity · Date 는 채점하지 않음. 미래 날짜는 채점하지 않음',
      '',
    );
  }

  return out.join('\n');
}
