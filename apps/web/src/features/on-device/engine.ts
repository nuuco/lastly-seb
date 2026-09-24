import { overlayWithRules } from './apply-rules';
import type { LocalModel } from './local-model';
import { createMediaPipeModel, hasWebGpu } from './mediapipe-model';
import { defaultModelId, getModel, listModels, type ModelId, type ModelSpec } from './models';
import { parseModelJson } from './parse-prompt';
import type {
  EngineProgress,
  OnDeviceKnownItem,
  OnDeviceParseResult,
} from './types';

export type { EngineProgress };
export { engineErrorMessage, isEngineCancelled } from './engine-errors';
export { hasWebGpu };

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

const progressHandlers = new Set<(progress: EngineProgress) => void>();
const instances = new Map<ModelId, LocalModel>();
let activeId: ModelId = defaultModelId();

function emit(progress: EngineProgress) {
  for (const handler of progressHandlers) handler(progress);
}

function modelFor(id: ModelId): LocalModel {
  const existing = instances.get(id);
  if (existing) return existing;
  const model = createMediaPipeModel(getModel(id), emit);
  instances.set(id, model);
  return model;
}

function current(): LocalModel {
  return modelFor(activeId);
}

export function subscribeEngineProgress(handler: (progress: EngineProgress) => void): () => void {
  progressHandlers.add(handler);
  return () => {
    progressHandlers.delete(handler);
  };
}

export function getActiveModelId(): ModelId {
  return activeId;
}

/** 실험실에서 모델을 바꿀 때. 올라가 있던 모델은 내린다. 받아 둔 파일은 남긴다. */
export function setActiveModel(id: ModelId): void {
  if (id === activeId) return;
  current().unload();
  activeId = id;
  emit({ status: 'idle', loaded: 0, total: 0, message: '' });
}

export function activeModelSpec(): ModelSpec {
  return current().spec;
}

/** 지금 모델을 이 브라우저에서 돌릴 수 있는지. */
export function isEngineSupported(): boolean {
  return current().isSupported();
}

export function ensureEngine(): Promise<void> {
  return current().prepare();
}

export function isEngineReady(): boolean {
  return current().isReady();
}

/** 설정에서 이 기기 이해를 끌 때. 워커만 내린다. */
export function unloadEngine(): void {
  current().unload();
}

/** 받기를 멈춘다. 덜 받은 파일은 지운다. */
export function cancelEngineLoad(): Promise<void> {
  return current().cancel();
}

/** 동의를 지울 때 받아 둔 모델 파일도 함께 지운다. */
export async function clearModelCache(): Promise<void> {
  const all = listModels().map((spec) => modelFor(spec.id));
  for (const model of all) model.unload();
  await Promise.allSettled(all.map((model) => model.removeFiles()));
}

/** 모델이 낸 값 위에 규칙을 덧씌운다. 캡처 화면이 쓰는 경로. */
export async function parseOnDevice(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): Promise<OnDeviceParseResult> {
  const llm = await parseOnDeviceModelOnly(text, referenceDate, knownItems);
  return overlayWithRules(text, referenceDate, knownItems, llm);
}

/** 규칙 없이 모델 값만. 실험실에서 모델 실력을 따로 볼 때. */
export async function parseOnDeviceModelOnly(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): Promise<OnDeviceParseResult> {
  const raw = await current().generate({ text, referenceDate, knownItems });
  return parseModelJson(raw);
}
