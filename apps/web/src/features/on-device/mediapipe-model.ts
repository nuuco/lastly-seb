import {
  cancelledError,
  engineErrorMessage,
  GPU_INSECURE,
  GPU_UNAVAILABLE,
  isEngineCancelled,
} from './engine-errors';
import type { LocalModel, ParseInput } from './local-model';
import type { MediaPipeSpec as ModelSpec } from './models';
import { buildParsePrompt } from './parse-prompt';
import type { EngineProgress } from './types';

/**
 * MediaPipe LLM Inference(WebGPU) 로 Gemma .task 파일을 돌린다.
 * 파일은 워커가 OPFS 에 받고, GPU 에 올리기는 페이지에서 한다.
 */
const MEDIAPIPE_GENAI =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/genai_bundle.mjs';
const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm';
const COMPILE_TIMEOUT_MS = 240_000;
const COMPILE_ESTIMATE_MS = 90_000;
const INIT_STALL_MS = 60_000;

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

type WorkerModel = Pick<ModelSpec, 'url' | 'bytes' | 'opfsFile' | 'metaFile'>;
type WorkerIn = { id: number; type: 'init'; model: WorkerModel };
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
let compileTick: ReturnType<typeof setInterval> | null = null;
let compileDeadline: ReturnType<typeof setTimeout> | null = null;
let initStall: ReturnType<typeof setTimeout> | null = null;
/** 받기·올리기 한 회차. 취소·타임아웃 뒤에도 이전 회차가 다음 워커를 죽이지 않게 한다. */
let generation = 0;
/** 올라가 있는 모델, 올리는 중인 모델. 한 페이지에 MediaPipe 모델은 하나만 둔다. */
let loadedSpec: ModelSpec | null = null;
let loadingSpec: ModelSpec | null = null;
let emit: (progress: EngineProgress) => void = () => undefined;

async function startEngine(spec: ModelSpec): Promise<void> {
  const id = bumpGeneration();
  try {
    const device = await createWebGpuDevice();
    if (!isCurrent(id)) throw cancelledError();
    if (navigator.storage?.persist) void navigator.storage.persist();

    const w = getWorker();
    armInitStall();
    await request(w, {
      type: 'init',
      model: { url: spec.url, bytes: spec.bytes, opfsFile: spec.opfsFile, metaFile: spec.metaFile },
    });
    if (!isCurrent(id)) throw cancelledError();
    startCompileWatch();
    const next = await createLlm(device, spec);
    if (!isCurrent(id)) {
      closeLlm(next);
      throw cancelledError();
    }
    llm = next;
    loadedSpec = spec;
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

async function generateRaw(spec: ModelSpec, input: ParseInput): Promise<string> {
  await ensureLoaded(spec);
  if (!llm) throw new Error('모델이 아직 없습니다.');
  const prompt = buildParsePrompt(input.text, input.referenceDate, input.knownItems);
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
  const w = new Worker('/on-device-worker.js?v=14', { type: 'module' });
  worker = w;
  w.onmessage = (event: MessageEvent<WorkerOut>) => {
    if (worker !== w) return;
    const msg = event.data;
    if (msg.type === 'progress') {
      armInitStall();
      emit({
        status: 'downloading',
        loaded: msg.loaded,
        total: msg.total > 0 ? msg.total : (loadingSpec?.bytes ?? msg.total),
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

function request(w: Worker, payload: { type: 'init'; model: WorkerModel }) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const message: WorkerIn = { id, ...payload };
    w.postMessage(message);
  });
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
  loadedSpec = null;
  loadingSpec = null;
}

async function removeStoredModel(spec: ModelSpec) {
  try {
    const root = await navigator.storage.getDirectory();
    await Promise.allSettled([root.removeEntry(spec.opfsFile), root.removeEntry(spec.metaFile)]);
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

async function createLlm(device: GpuDevice, spec: ModelSpec): Promise<LlmHandle> {
  const genai = await loadFileset();
  const file = await openOpfsFile(spec);
  const options = (forceF32 = false) => ({
    baseOptions: {
      modelAssetBuffer: file.stream().getReader(),
      gpuOptions: { device },
    },
    maxTokens: spec.maxTokens,
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

async function openOpfsFile(spec: ModelSpec): Promise<File> {
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(spec.opfsFile);
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

export function hasWebGpu(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'gpu' in navigator &&
    (typeof window === 'undefined' || window.isSecureContext)
  );
}

export function createMediaPipeModel(
  spec: ModelSpec,
  onProgress: (progress: EngineProgress) => void,
): LocalModel {
  return {
    spec,
    isSupported: hasWebGpu,
    isReady: () => ready && loadedSpec?.id === spec.id,
    prepare: () => {
      emit = onProgress;
      return ensureLoaded(spec);
    },
    generate: (input) => {
      emit = onProgress;
      return generateRaw(spec, input);
    },
    cancel: async () => {
      bumpGeneration();
      rejectAll(cancelledError());
      teardownRuntime();
      await removeStoredModel(spec);
      onProgress({ status: 'idle', loaded: 0, total: 0, message: '' });
    },
    unload: () => {
      if (loadedSpec?.id !== spec.id && loadingSpec?.id !== spec.id) return;
      bumpGeneration();
      teardownRuntime();
    },
    removeFiles: () => removeStoredModel(spec),
  };
}

function ensureLoaded(spec: ModelSpec): Promise<void> {
  if (ready && loadedSpec?.id === spec.id) return Promise.resolve();
  if (initPromise && loadingSpec?.id === spec.id) return initPromise;
  if (ready || initPromise) {
    bumpGeneration();
    rejectAll(cancelledError());
    teardownRuntime();
  }
  loadingSpec = spec;
  initPromise = startEngine(spec);
  return initPromise;
}
