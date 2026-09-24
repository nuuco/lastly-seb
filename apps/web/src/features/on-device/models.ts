/**
 * 온디바이스 모델 목록. 모델을 바꾸거나 더할 때는 이 파일만 고친다.
 * 워커·엔진·동의 시트는 여기 값을 받아 쓴다.
 */
export type ModelId = 'gemma3-1b' | 'gemma3-270m' | 'chrome-nano';

export type ModelSpec = MediaPipeSpec | ChromeBuiltinSpec;

/** .task 파일을 받아 WebGPU 로 돌리는 모델. */
export interface MediaPipeSpec {
  runtime: 'mediapipe';
  id: ModelId;
  label: string;
  /** 브라우저가 GET 할 주소. */
  url: string;
  /** 응답에 크기가 없을 때 진행률 분모로 쓰는 값. */
  bytes: number;
  /** 동의 시트에 보이는 크기. */
  sizeLabel: string;
  opfsFile: string;
  metaFile: string;
  /** .task 파일에 박힌 KV 캐시 크기. */
  maxTokens: number;
}

/** Chrome 내장 Gemini Nano. 파일은 Chrome 이 받는다. */
export interface ChromeBuiltinSpec {
  runtime: 'chrome-builtin';
  id: ModelId;
  label: string;
  sizeLabel: string;
}

const MODELS: Record<ModelId, ModelSpec> = {
  'gemma3-1b': {
    runtime: 'mediapipe',
    id: 'gemma3-1b',
    label: 'Gemma 3 1B int4',
    url:
      process.env.NEXT_PUBLIC_ONDEVICE_MODEL_URL ||
      'https://huggingface.co/nuuco/gemma-3-1b-it-int4-web/resolve/main/gemma3-1b-it-int4-web.task',
    bytes: 700_383_232,
    sizeLabel: '약 670MB',
    opfsFile: 'gemma3-1b-it-int4-web.task',
    metaFile: 'gemma3-1b-it-int4-web.meta.json',
    maxTokens: 1280,
  },
  /** 원본(litert-community)은 라이선스 동의가 필요해 nuuco 에 올린 사본을 받는다. */
  'gemma3-270m': {
    runtime: 'mediapipe',
    id: 'gemma3-270m',
    label: 'Gemma 3 270M q8',
    url:
      process.env.NEXT_PUBLIC_ONDEVICE_MODEL_270M_URL ||
      'https://huggingface.co/nuuco/gemma-3-270m-it-q8-web/resolve/main/gemma3-270m-it-q8-web.task',
    bytes: 276_168_704,
    sizeLabel: '약 260MB',
    opfsFile: 'gemma3-270m-it-q8-web.task',
    metaFile: 'gemma3-270m-it-q8-web.meta.json',
    maxTokens: 1280,
  },
  /** 데스크톱 Chrome 148+ 만. Android Chrome 은 지원하지 않는다. */
  'chrome-nano': {
    runtime: 'chrome-builtin',
    id: 'chrome-nano',
    label: 'Chrome Gemini Nano',
    sizeLabel: 'Chrome이 따로 받는 약 4GB',
  },
};

/** Nano 를 못 쓰는 기기에서 대신 쓸 모델. */
export const FALLBACK_MODEL: ModelId = 'gemma3-1b';

function isModelId(value: string | undefined): value is ModelId {
  return value !== undefined && value in MODELS;
}

/** 앱 기본 모델. NEXT_PUBLIC_ONDEVICE_MODEL 로 바꾼다. */
export function defaultModelId(): ModelId {
  const env = process.env.NEXT_PUBLIC_ONDEVICE_MODEL;
  return isModelId(env) ? env : FALLBACK_MODEL;
}

export function getModel(id: ModelId): ModelSpec {
  return MODELS[id];
}

export function listModels(): ModelSpec[] {
  return Object.values(MODELS);
}
