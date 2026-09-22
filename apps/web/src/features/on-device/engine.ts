import { overlayWithRules } from './apply-rules';
import { buildParsePrompt, parseModelJson } from './parse-prompt';
import type {
  EngineProgress,
  OnDeviceKnownItem,
  OnDeviceParseResult,
} from './types';

export type { EngineProgress };

const MODEL = {
  /** gemma3-1b-it-int4-web.task 에 박힌 KV 캐시 크기. */
  maxTokens: 1280,
  label: 'Gemma 3 1B int4',
};

export const MODEL_LABEL = MODEL.label;

const MEDIAPIPE_GENAI =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/genai_bundle.mjs';
const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm';
const DEFAULT_MODEL_URL =
  'https://huggingface.co/nuuco/gemma-3-1b-it-int4-web/resolve/main/gemma3-1b-it-int4-web.task';
const DEFAULT_MODEL_BYTES = 700_383_232;
const MODEL_OPFS_FILE = 'gemma3-1b-it-int4-web.task';
const MODEL_META_FILE = 'gemma3-1b-it-int4-web.meta.json';
const COMPILE_TIMEOUT_MS = 240_000;
const COMPILE_ESTIMATE_MS = 90_000;
const INIT_STALL_MS = 60_000;
const GPU_UNAVAILABLE = '이 브라우저는 기기 이해를 지원하지 않아요. Chrome에서 localhost로 열어 주세요.';
const GPU_INSECURE = '이 주소에서는 쓸 수 없어요. localhost로 열어 주세요.';
const CANCELLED = 'cancelled';

export function isEngineBusy(progress: EngineProgress | null): boolean {
  return progress?.status === 'downloading' || progress?.status === 'compiling';
}

export function engineProgressPercent(progress: EngineProgress): number {
  if (progress.status === 'ready') return 100;
  if (progress.status === 'error') return 0;
  if (progress.total <= 0) return 0;
  return Math.min(100, Math.round((progress.loaded / progress.total) * 100));
}

export function engineProgressLabel(progress: EngineProgress): string {
  if (progress.status === 'idle' || progress.status === 'checking') return '';
  if (progress.status === 'compiling') {
    return `이 기기에서 준비하는 중 ${engineProgressPercent(progress)}%`;
  }
  if (progress.status === 'ready') return '준비됐어요';
  if (progress.status === 'error') return progress.message || '준비하지 못했어요';
  return `AI 받는 중 ${engineProgressPercent(progress)}%`;
}

export function engineProgressHint(progress: EngineProgress): string | null {
  if (progress.status === 'downloading') return '받는 동안은 음성인식이 어렵습니다. 글로 작성해주세요.';
  if (progress.status === 'error') return progress.message;
  return null;
}

export function isEngineCancelled(err: unknown): boolean {
  return err instanceof Error && err.message === CANCELLED;
}

export function engineErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '');
  if (/secure context|isSecureContext|localhost로 열어/i.test(raw)) return GPU_INSECURE;
  if (/can not be cloned|cannot be cloned|DataCloneError/i.test(raw)) return GPU_UNAVAILABLE;
  if (/Unable to request adapter|navigator\.gpu|WebGPU is enabled/i.test(raw)) {
    if (typeof window !== 'undefined' && !window.isSecureContext) return GPU_INSECURE;
    return GPU_UNAVAILABLE;
  }
  return raw || '모델을 준비하지 못했어요.';
}

/** 브라우저가 GET 할 주소. 비우면 Hugging Face 공개 파일을 쓴다. */
export function modelAssetUrl(): string {
  return process.env.NEXT_PUBLIC_ONDEVICE_MODEL_URL || DEFAULT_MODEL_URL;
}

type GpuDevice = { destroy?: () => void };

type LlmHandle = {
  generateResponse(
    prompt: string,
    cb?: (partial: string, done: boolean) => void,
  ): Promise<string>;
  cancelProcessing(): void;
  close?: () => void;
};

type GpuAdapter = {
  features: { has(name: string): boolean };
  limits: {
    maxStorageBufferBindingSize: number;
    maxBufferSize: number;
    maxStorageBuffersPerShaderStage: number;
  };
  requestDevice(desc: {
    requiredFeatures?: string[];
    requiredLimits?: Record<string, number>;
  }): Promise<GpuDevice>;
};

type Gpu = {
  requestAdapter(options?: { powerPreference?: string }): Promise<GpuAdapter | null>;
};

type WorkerIn = { id: number; type: 'init'; modelUrl: string };
type WorkerOut =
  | { id: number; type: 'progress'; stage: 'download'; loaded: number; total: number }
  | { id: number; type: 'ready' }
  | { id: number; type: 'error'; message: string };

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();
let ready = false;
let initPromise: Promise<void> | null = null;
let llm: LlmHandle | null = null;
let progressHandlers = new Set<(progress: EngineProgress) => void>();
let compileTick: ReturnType<typeof setInterval> | null = null;
let compileDeadline: ReturnType<typeof setTimeout> | null = null;
let initStall: ReturnType<typeof setTimeout> | null = null;
/** 받기·올리기 한 회차. 취소·타임아웃 뒤에도 이전 회차가 다음 워커를 죽이지 않게 한다. */
let generation = 0;

export function subscribeEngineProgress(handler: (progress: EngineProgress) => void): () => void {
  progressHandlers.add(handler);
  return () => {
    progressHandlers.delete(handler);
  };
}

export function hasWebGpu(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    (typeof window === 'undefined' || window.isSecureContext)
  );
}

export async function ensureEngine(): Promise<void> {
  if (ready) return;
  if (initPromise) return initPromise;
  initPromise = startEngine();
  return initPromise;
}

async function startEngine(): Promise<void> {
  const id = bumpGeneration();
  try {
    const device = await createWebGpuDevice();
    if (!isCurrent(id)) throw cancelledError();
    if (navigator.storage?.persist) void navigator.storage.persist();

    const w = getWorker();
    armInitStall();
    await request(w, { type: 'init', modelUrl: modelAssetUrl() });
    if (!isCurrent(id)) throw cancelledError();
    startCompileWatch();
    const next = await createLlm(device);
    if (!isCurrent(id)) {
      closeLlm(next);
      throw cancelledError();
    }
    llm = next;
    stopWatches();
    ready = true;
    emit({ status: 'ready', loaded: 100, total: 100, message: '준비됨' });
  } catch (err) {
    if (!isCurrent(id)) {
      throw err instanceof Error ? err : cancelledError();
    }
    teardownRuntime();
    if (isEngineCancelled(err)) {
      emit({ status: 'idle', loaded: 0, total: 0, message: '' });
      throw err instanceof Error ? err : cancelledError();
    }
    emit({ status: 'error', loaded: 0, total: 0, message: engineErrorMessage(err) });
    throw err instanceof Error ? err : new Error(engineErrorMessage(err));
  }
}

export function isEngineReady(): boolean {
  return ready;
}

/** 설정에서 이 기기 이해를 끌 때. 워커만 내린다. */
export function unloadEngine(): void {
  bumpGeneration();
  teardownRuntime();
}

/** 받기를 멈춘다. 덜 받은 파일은 지운다. */
export async function cancelEngineLoad(): Promise<void> {
  bumpGeneration();
  rejectAll(cancelledError());
  teardownRuntime();
  await removeStoredModel();
  emit({ status: 'idle', loaded: 0, total: 0, message: '' });
}

/** 동의를 지울 때 받아 둔 모델 파일도 함께 지운다. */
export async function clearModelCache(): Promise<void> {
  unloadEngine();
  await removeStoredModel();
}

export async function parseOnDevice(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): Promise<OnDeviceParseResult> {
  const raw = await generateRaw(text, referenceDate, knownItems);
  return overlayWithRules(text, referenceDate, knownItems, parseModelJson(raw));
}

async function generateRaw(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): Promise<string> {
  await ensureEngine();
  if (!llm) throw new Error('모델이 아직 없습니다.');
  const prompt = buildParsePrompt(text, referenceDate, knownItems);
  let acc = '';
  const textOut = await llm.generateResponse(prompt, (partial, done) => {
    acc += partial;
    if (!done && (hasClosedJson(acc) || isDegenerate(acc))) {
      llm?.cancelProcessing();
    }
  });
  return (acc || textOut || '').trim();
}

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker('/on-device-worker.js?v=13', { type: 'module' });
  worker = w;
  w.onmessage = (event: MessageEvent<WorkerOut>) => {
    if (worker !== w) return;
    const msg = event.data;
    if (msg.type === 'progress') {
      armInitStall();
      emit({
        status: 'downloading',
        loaded: msg.loaded,
        total: msg.total > 0 ? msg.total : DEFAULT_MODEL_BYTES,
        message: 'AI 받는 중',
      });
      return;
    }

    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.type === 'error') job.reject(new Error(engineErrorMessage(msg.message)));
    else job.resolve(undefined);
  };
  w.onerror = (event) => {
    if (worker !== w) return;
    failInit(new Error(engineErrorMessage(event.message || GPU_UNAVAILABLE)));
  };
  return w;
}

function request(w: Worker, payload: { type: 'init'; modelUrl: string }) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const message: WorkerIn = { id, ...payload };
    w.postMessage(message);
  });
}

function emit(progress: EngineProgress) {
  for (const handler of progressHandlers) handler(progress);
}

function armInitStall() {
  if (initStall) clearTimeout(initStall);
  const id = generation;
  initStall = setTimeout(() => {
    if (!isCurrent(id)) return;
    failInit(new Error('모델을 준비하지 못했어요. 네트워크를 확인하고 다시 받아 주세요.'));
  }, INIT_STALL_MS);
}

function startCompileWatch() {
  if (compileTick) return;
  if (initStall) {
    clearTimeout(initStall);
    initStall = null;
  }
  const id = generation;
  const started = Date.now();
  const tick = () => {
    if (!isCurrent(id)) return;
    const elapsed = Date.now() - started;
    const percent = Math.min(95, Math.round((elapsed / COMPILE_ESTIMATE_MS) * 95));
    emit({
      status: 'compiling',
      loaded: percent,
      total: 100,
      message: '이 기기에서 준비하는 중',
    });
  };
  tick();
  compileTick = setInterval(tick, 500);
  compileDeadline = setTimeout(() => {
    if (!isCurrent(id)) return;
    failInit(new Error('이 기기에서 모델을 준비하지 못했어요. 페이지를 새로고침해 주세요.'));
  }, COMPILE_TIMEOUT_MS);
}

function stopWatches() {
  if (compileTick) clearInterval(compileTick);
  if (compileDeadline) clearTimeout(compileDeadline);
  if (initStall) clearTimeout(initStall);
  compileTick = null;
  compileDeadline = null;
  initStall = null;
}

function bumpGeneration() {
  generation += 1;
  return generation;
}

function isCurrent(id: number) {
  return id === generation;
}

function cancelledError() {
  return new Error(CANCELLED);
}

function closeLlm(handle: LlmHandle | null) {
  try {
    handle?.close?.();
  } catch {
    // ignore
  }
}

function dropLlm() {
  const current = llm;
  llm = null;
  closeLlm(current);
}

function rejectAll(error: Error) {
  for (const job of pending.values()) job.reject(error);
  pending.clear();
}

function teardownRuntime() {
  stopWatches();
  dropLlm();
  if (worker) {
    worker.terminate();
    worker = null;
  }
  ready = false;
  initPromise = null;
}

async function removeStoredModel() {
  try {
    const root = await navigator.storage.getDirectory();
    await Promise.allSettled([root.removeEntry(MODEL_OPFS_FILE), root.removeEntry(MODEL_META_FILE)]);
  } catch {
    // ignore
  }
}

function failInit(error: Error) {
  bumpGeneration();
  rejectAll(error);
  teardownRuntime();
  emit({ status: 'error', loaded: 0, total: 0, message: engineErrorMessage(error) });
}

async function createWebGpuDevice(): Promise<GpuDevice> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    throw new Error(GPU_INSECURE);
  }
  const gpu = (navigator as Navigator & { gpu?: Gpu }).gpu;
  if (!gpu) throw new Error(GPU_UNAVAILABLE);

  const adapter = await gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) throw new Error(GPU_UNAVAILABLE);

  const features: string[] = [];
  if (adapter.features.has('shader-f16')) features.push('shader-f16');

  try {
    return await adapter.requestDevice({
      requiredFeatures: features as never,
      requiredLimits: {
        maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
        maxBufferSize: adapter.limits.maxBufferSize,
        maxStorageBuffersPerShaderStage: adapter.limits.maxStorageBuffersPerShaderStage,
      },
    });
  } catch {
    throw new Error(GPU_UNAVAILABLE);
  }
}

async function createLlm(device: GpuDevice): Promise<LlmHandle> {
  const genai = await loadFileset();
  const file = await openOpfsFile();
  const options = (forceF32 = false) => ({
    baseOptions: {
      modelAssetBuffer: file.stream().getReader(),
      gpuOptions: { device },
    },
    maxTokens: MODEL.maxTokens,
    topK: 40,
    temperature: 0.8,
    randomSeed: 101,
    numResponses: 1,
    ...(forceF32 ? { forceF32: true } : {}),
  });

  try {
    return await genai.LlmInference.createFromOptions(genai.fileset, options());
  } catch (first) {
    try {
      return await genai.LlmInference.createFromOptions(genai.fileset, options(true));
    } catch {
      throw first;
    }
  }
}

async function openOpfsFile(): Promise<File> {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(MODEL_OPFS_FILE);
  return handle.getFile();
}

async function loadFileset() {
  const mod = (await import(
    /* webpackIgnore: true */ MEDIAPIPE_GENAI
  )) as {
    FilesetResolver: {
      forGenAiTasks: (
        root: string,
        locateFile?: boolean,
      ) => Promise<{ wasmLoaderPath?: string }>;
    };
    LlmInference: {
      createFromOptions: (fileset: unknown, options: unknown) => Promise<LlmHandle>;
    };
  };

  const fileset = await mod.FilesetResolver.forGenAiTasks(WASM_ROOT, true);
  const g = globalThis as unknown as { ModuleFactory?: unknown };
  if (typeof g.ModuleFactory !== 'function' && fileset.wasmLoaderPath) {
    const loader = (await import(
      /* webpackIgnore: true */ fileset.wasmLoaderPath
    )) as { ModuleFactory?: unknown; default?: unknown };
    if (typeof loader.ModuleFactory === 'function') g.ModuleFactory = loader.ModuleFactory;
    else if (typeof loader.default === 'function') g.ModuleFactory = loader.default;
    delete fileset.wasmLoaderPath;
  }

  return { fileset, LlmInference: mod.LlmInference };
}

function hasClosedJson(text: string) {
  const start = text.indexOf('{');
  if (start < 0) return false;
  let depth = 0;
  for (let i = start; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1;
    if (text[i] === '}') {
      depth -= 1;
      if (depth === 0) return true;
    }
  }
  return false;
}

function isDegenerate(text: string) {
  if (text.length < 80) return false;
  if (text.includes('{') || text.includes('"intent"')) return false;
  const chunk = text.slice(-24);
  return text.split(chunk).length >= 4;
}
