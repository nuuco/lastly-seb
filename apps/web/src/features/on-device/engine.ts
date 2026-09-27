import { overlayWithRules } from './apply-rules';
import { checkLocalAi, getLocalAiSupport, reportLocalAiFailure } from './capability';
import { hasModelConsent } from './consent';
import { createChromeNanoModel } from './chrome-nano-model';
import {
  cancelledError,
  isDeviceFailure,
  isEngineCancelled,
  LOCAL_AI_UNSUPPORTED,
} from './engine-errors';
import type { LocalModel, ParseInput } from './local-model';
import { createMediaPipeModel } from './mediapipe-model';
import { defaultGemmaSpec, getModel, listModels, type ModelId, type ModelSpec } from './models';
import { parseModelJson } from './parse-prompt';
import type {
  EngineProgress,
  OnDeviceKnownItem,
  OnDeviceParseResult,
} from './types';

export type { EngineProgress };
export { engineErrorMessage, isEngineCancelled } from './engine-errors';

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
/** 실험실이 setActiveModel 로 고른 모델. 없으면 기기 판정(capability.ts)을 따른다. */
let override: ModelId | null = null;

function emit(progress: EngineProgress) {
  for (const handler of progressHandlers) handler(progress);
}

function modelFor(id: ModelId): LocalModel {
  const existing = instances.get(id);
  if (existing) return existing;
  const spec = getModel(id);
  const model =
    spec.runtime === 'chrome-builtin'
      ? createChromeNanoModel(spec, emit)
      : createMediaPipeModel(spec, emit);
  instances.set(id, model);
  return model;
}

/** 지금 쓸 모델. 기기 판정이 none 이거나 아직이면 null. */
function current(): LocalModel | null {
  if (override) return modelFor(override);
  const id = getLocalAiSupport()?.modelId;
  return id ? modelFor(id) : null;
}

export function subscribeEngineProgress(handler: (progress: EngineProgress) => void): () => void {
  progressHandlers.add(handler);
  return () => {
    progressHandlers.delete(handler);
  };
}

/** 쓸 모델을 고정한다(실험실). 올라가 있던 모델은 내리고, 받아 둔 파일은 남긴다. */
export function setActiveModel(id: ModelId): void {
  if (id === current()?.spec.id) return;
  current()?.unload();
  override = id;
  emit({ status: 'idle', loaded: 0, total: 0, message: '' });
}

/** 지금 모델. 쓸 수 없는 기기면 기본 Gemma 정보(화면 문구용). */
export function activeModelSpec(): ModelSpec {
  return current()?.spec ?? defaultGemmaSpec();
}

/** 이 기기에서 로컬 AI 를 쓸 수 있는지. 판정 전이면 지난 실행의 저장값. */
export function isEngineSupported(): boolean {
  return current() !== null;
}

/** 받을 파일이 있어 동의를 받아야 하는지. Nano 는 Chrome 이 관리해 묻지 않는다. */
function engineNeedsConsent(): boolean {
  return current()?.spec.runtime !== 'chrome-builtin';
}

/** 지금 모델을 써도 되는지. 쓸 수 있는 기기이고, 받아야 하는 모델이면 동의가 있을 때. */
export function canUseEngine(): boolean {
  return isEngineSupported() && (!engineNeedsConsent() || hasModelConsent());
}

export async function ensureEngine(): Promise<void> {
  // 지난 실행의 저장값만 보고 받기를 시작하지 않는다. 이번 실행의 검사를 기다린다.
  if (!override) await checkLocalAi();
  const model = current();
  if (!model) throw new Error(LOCAL_AI_UNSUPPORTED);
  try {
    await model.prepare();
  } catch (err) {
    // 실험실이 고른 모델의 실패는 앱 판정에 남기지 않는다. 일부러 여러 모델을 올려 보는 곳이다.
    if (isEngineCancelled(err) || override || !isDeviceFailure(err)) throw err;
    // 기기가 못 올렸다. 받은 파일을 지우고 다시 판정한다. Nano 였으면 Gemma 로 갈 수 있다.
    const reason = err instanceof Error ? err.message : String(err);
    model.unload();
    await model.removeFiles();
    const next = await reportLocalAiFailure(model.spec.id, reason);
    if (next.kind === 'none') {
      emit({ status: 'error', loaded: 0, total: 0, message: LOCAL_AI_UNSUPPORTED });
      throw new Error(LOCAL_AI_UNSUPPORTED);
    }
    // 다른 모델로 넘어갔다. 화면은 판정 변경(watchLocalAi)으로 다시 그리므로 이 실패는 알리지 않는다.
    emit({ status: 'idle', loaded: 0, total: 0, message: '' });
    throw cancelledError();
  }
}

export function isEngineReady(): boolean {
  return current()?.isReady() ?? false;
}

/** 받기를 멈춘다. 덜 받은 파일은 지운다. */
export async function cancelEngineLoad(): Promise<void> {
  await current()?.cancel();
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

function requireModel(): LocalModel {
  const model = current();
  if (!model) throw new Error(LOCAL_AI_UNSUPPORTED);
  return model;
}

/** 모델이 낸 글자 그대로. 실험실에서 지시문을 바꿔 볼 때. */
export function generateOnDevice(input: ParseInput): Promise<string> {
  return requireModel().generate(input);
}

/** 받아 둔 파일을 지운다. 실험실에서 다운로드 시간을 다시 잴 때. */
export async function clearModelFiles(id: ModelId): Promise<void> {
  const model = modelFor(id);
  model.unload();
  await model.removeFiles();
  emit({ status: 'idle', loaded: 0, total: 0, message: '' });
}

/** 규칙 없이 모델 값만. 실험실에서 모델 실력을 따로 볼 때. */
export async function parseOnDeviceModelOnly(
  text: string,
  referenceDate: string,
  knownItems: OnDeviceKnownItem[],
): Promise<OnDeviceParseResult> {
  const raw = await requireModel().generate({ text, referenceDate, knownItems });
  return parseModelJson(raw);
}
