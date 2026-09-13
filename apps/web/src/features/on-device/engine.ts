import { overlayWithRules } from './apply-rules';
import { buildParsePrompt, parseModelJson } from './parse-prompt';
import type {
  EngineProgress,
  OnDeviceKnownItem,
  OnDeviceParseResult,
} from './types';

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

export function hasWebGpu(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
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
    if (!hasWebGpu()) {
      throw new Error('이 브라우저는 WebGPU를 지원하지 않습니다. Chrome 또는 Safari 26+ 가 필요합니다.');
    }

    const model = await probeModel();
    if (!model.ok) {
      throw new Error(
        '모델 파일이 없습니다. 프로젝트 루트에서 pnpm download:ondevice-model 을 실행하세요.',
      );
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
    throw err;
  }
}

export function isEngineReady(): boolean {
  return ready;
}

export async function parseOnDevice(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): Promise<OnDeviceParseResult> {
  await ensureEngine();
  const prompt = buildParsePrompt(text, referenceDate, knownItems);
  const w = getWorker();
  const raw = (await request(w, { type: 'generate', prompt })) as string;
  return overlayWithRules(text, referenceDate, knownItems, parseModelJson(raw));
}

function getWorker(): Worker {
  if (worker) return worker;
  worker = new Worker('/on-device-worker.js?v=3', { type: 'module' });
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
    if (msg.type === 'error') job.reject(new Error(msg.message));
    else if (msg.type === 'ready') job.resolve(undefined);
    else job.resolve(msg.text);
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || '온디바이스 워커가 실패했습니다.');
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
