import type { EngineProgress } from './types';

const MODEL_PATH = '/models/gemma3-1b-it-int4-web.task';

type WorkerIn =
  | { id: number; type: 'init'; modelUrl: string }
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
let progressHandler: ((progress: EngineProgress) => void) | null = null;

/** `navigator.gpu` API가 있는지. 어댑터 가능 여부는 `probeWebGpu`로 본다. */
export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

/**
 * 실제로 WebGPU 어댑터를 받을 수 있는지.
 * API만 있고 플래그·드라이버가 꺼진 경우(이 에러)를 여기서 걸러 낸다.
 */
export async function probeWebGpu(): Promise<boolean> {
  if (!hasWebGpu()) return false;
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    if (!gpu?.requestAdapter) return false;
    const adapter = await gpu.requestAdapter();
    return adapter != null;
  } catch {
    return false;
  }
}

export async function probeModel(): Promise<{ ok: boolean; bytes: number }> {
  const res = await fetch(MODEL_PATH, { method: 'HEAD' });
  const bytes = Number(res.headers.get('content-length') || 0);
  return { ok: res.ok, bytes };
}

export function subscribeEngineProgress(handler: (progress: EngineProgress) => void): () => void {
  progressHandler = handler;
  return () => {
    if (progressHandler === handler) progressHandler = null;
  };
}

export async function ensureEngine(): Promise<void> {
  if (ready) return;
  if (!initPromise) initPromise = startEngine();
  return initPromise;
}

async function startEngine(): Promise<void> {
  try {
    if (!(await probeWebGpu())) {
      throw new Error(
        '이 브라우저는 WebGPU를 쓸 수 없어요. Chrome·Edge, 또는 Safari에서 WebGPU를 켠 뒤 다시 시도해 주세요.',
      );
    }

    const model = await probeModel();
    if (!model.ok) {
      throw new Error('온디바이스 모델 파일이 없습니다.');
    }

    const w = getWorker();
    emit({
      status: 'downloading',
      loaded: 0,
      total: model.bytes,
      message: '모델 파일을 읽는 중',
    });

    await request(w, { type: 'init', modelUrl: MODEL_PATH });
    ready = true;
    emit({ status: 'ready', loaded: model.bytes, total: model.bytes, message: '준비됨' });
  } catch (err) {
    initPromise = null;
    ready = false;
    if (worker) {
      worker.terminate();
      worker = null;
    }
    throw friendlyEngineError(err);
  }
}

/** MediaPipe·브라우저 영문 에러를 짧은 한글로 바꾼다. */
function friendlyEngineError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  if (/request adapter|WebGPU is enabled|navigator\.gpu/i.test(raw)) {
    return new Error(
      '이 브라우저는 WebGPU를 쓸 수 없어요. Chrome·Edge, 또는 Safari에서 WebGPU를 켠 뒤 다시 시도해 주세요.',
    );
  }
  return err instanceof Error ? err : new Error(raw);
}

export function isEngineReady(): boolean {
  return ready;
}

/** 이름 검수 등 짧은 프롬프트를 돌린다. */
export async function generateOnDevice(prompt: string): Promise<string> {
  await ensureEngine();
  const w = getWorker();
  return (await request(w, { type: 'generate', prompt })) as string;
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker('/on-device-worker.js?v=4', { type: 'module' });
  worker.onmessage = (event: MessageEvent<WorkerOut>) => {
    const msg = event.data;
    if (msg.type === 'progress') {
      const status = msg.stage === 'compile' ? 'compiling' : 'downloading';
      emit({
        status,
        loaded: msg.loaded,
        total: msg.total,
        message: msg.stage === 'compile' ? 'GPU에서 모델을 올리는 중' : '모델 파일을 읽는 중',
      });
      return;
    }

    const job = pending.get(msg.id);
    if (!job) return;
    pending.delete(msg.id);
    if (msg.type === 'error') job.reject(friendlyEngineError(new Error(msg.message)));
    else if (msg.type === 'ready') job.resolve(undefined);
    else job.resolve(msg.text);
  };
  worker.onerror = (event) => {
    const error = friendlyEngineError(new Error(event.message || '온디바이스 워커가 실패했습니다.'));
    for (const job of pending.values()) job.reject(error);
    pending.clear();
    ready = false;
    worker = null;
  };
  return worker;
}

function request(w: Worker, payload: { type: 'init'; modelUrl: string } | { type: 'generate'; prompt: string }) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    const message: WorkerIn = { id, ...payload };
    w.postMessage(message);
  });
}

function emit(progress: EngineProgress) {
  progressHandler?.(progress);
}
