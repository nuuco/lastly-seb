import { overlayWithRules } from './apply-rules';
import { buildParsePrompt, parseModelJson } from './parse-prompt';
import type {
  EngineProgress,
  OnDeviceKnownItem,
  OnDeviceParseResult,
} from './types';

export type { EngineProgress };

const MODEL = {
  maxTokens: 1280,
  label: 'Gemma 3 1B int4',
};

export const MODEL_LABEL = MODEL.label;

export function isEngineBusy(progress: EngineProgress | null): boolean {
  return progress?.status === 'downloading' || progress?.status === 'compiling';
}

export function engineProgressPercent(progress: EngineProgress): number {
  if (progress.status === 'compiling' || progress.status === 'ready') return 100;
  if (progress.total <= 0) return 0;
  return Math.min(100, Math.round((progress.loaded / progress.total) * 100));
}

export function engineProgressLabel(progress: EngineProgress): string {
  if (progress.status === 'compiling') return 'GPU에서 모델을 올리는 중';
  if (progress.status === 'ready') return '준비됐어요';
  return `받는 중 ${engineProgressPercent(progress)}%`;
}

export function engineErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : '모델을 준비하지 못했어요.';
}

const DEFAULT_MODEL_URL =
  'https://huggingface.co/nuuco/gemma-3-1b-it-int4-web/resolve/main/gemma3-1b-it-int4-web.task';
const DEFAULT_MODEL_BYTES = 700_383_232;

/** 브라우저가 GET 할 주소. 비우면 Hugging Face 공개 파일을 쓴다. */
export function modelAssetUrl(): string {
  return process.env.NEXT_PUBLIC_ONDEVICE_MODEL_URL || DEFAULT_MODEL_URL;
}

type WorkerIn =
  | { id: number; type: 'init'; modelUrl: string; maxTokens: number }
  | { id: number; type: 'generate'; prompt: string };

type WorkerOut =
  | { id: number; type: 'progress'; stage: 'download' | 'compile'; loaded: number; total: number }
  | { id: number; type: 'ready' }
  | { id: number; type: 'result'; text: string }
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
let progressHandlers = new Set<(progress: EngineProgress) => void>();

export function subscribeEngineProgress(handler: (progress: EngineProgress) => void): () => void {
  progressHandlers.add(handler);
  return () => {
    progressHandlers.delete(handler);
  };
}

export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

export async function probeModel(): Promise<{ ok: boolean; bytes: number }> {
  try {
    const res = await fetch(modelAssetUrl(), { method: 'HEAD' });
    const bytes = Number(
      res.headers.get('content-length') || res.headers.get('x-linked-size') || DEFAULT_MODEL_BYTES,
    );
    const ok = res.ok || res.status === 405;
    return { ok, bytes: Number.isFinite(bytes) && bytes > 0 ? bytes : DEFAULT_MODEL_BYTES };
  } catch {
    return { ok: true, bytes: DEFAULT_MODEL_BYTES };
  }
}

export async function ensureEngine(): Promise<void> {
  if (ready) return;
  if (initPromise) return initPromise;
  initPromise = startEngine();
  return initPromise;
}

async function startEngine(): Promise<void> {
  try {
    if (!hasWebGpu()) {
      throw new Error('이 브라우저는 WebGPU를 지원하지 않습니다. Chrome 또는 Safari 26+ 가 필요합니다.');
    }

    const model = await probeModel();
    if (!model.ok) {
      throw new Error('이 기기에서 쓸 모델 파일을 찾지 못했어요.');
    }

    const w = getWorker();
    emit({
      status: 'downloading',
      loaded: 0,
      total: model.bytes,
      message: '모델을 받는 중',
    });

    await request(w, {
      type: 'init',
      modelUrl: modelAssetUrl(),
      maxTokens: MODEL.maxTokens,
    });
    ready = true;
    emit({ status: 'ready', loaded: model.bytes, total: model.bytes, message: '준비됨' });
  } catch (err) {
    initPromise = null;
    ready = false;
    if (worker) {
      worker.terminate();
      worker = null;
    }
    throw err;
  }
}

export function isEngineReady(): boolean {
  return ready;
}

/** 설정에서 이 기기 이해를 끌 때. 브라우저 캐시의 파일까지 지워지지는 않는다. */
export function unloadEngine(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  ready = false;
  initPromise = null;
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
  const prompt = buildParsePrompt(text, referenceDate, knownItems);
  const w = getWorker();
  return (await request(w, { type: 'generate', prompt })) as string;
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker('/on-device-worker.js?v=6', { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerOut>) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      const status = msg.stage === 'compile' ? 'compiling' : 'downloading';
      emit({
        status,
        loaded: msg.loaded,
        total: msg.total,
        message: msg.stage === 'compile' ? 'GPU에서 모델을 올리는 중' : '모델을 받는 중',
      });
      return;
    }

    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.type === 'error') job.reject(new Error(msg.message));
    else if (msg.type === 'ready') job.resolve(undefined);
    else job.resolve(msg.text);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || '온디바이스 워커가 실패했습니다.');
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    ready = false;
    initPromise = null;
    worker = null;
  };
  return worker;
}

function request(
  w: Worker,
  payload: { type: 'init'; modelUrl: string; maxTokens: number } | { type: 'generate'; prompt: string },
) {
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
