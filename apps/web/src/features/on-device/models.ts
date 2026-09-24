/**
 * 온디바이스 모델 목록. 모델을 바꾸거나 더할 때는 이 파일만 고친다.
 * 워커·엔진·동의 시트는 여기 값을 받아 쓴다.
 */
export type ModelId = 'gemma3-1b' | 'gemma3-270m';

export interface ModelSpec {
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

const MODELS: Record<ModelId, ModelSpec> = {
  'gemma3-1b': {
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
  /**
   * 원본(litert-community)은 Gemma 라이선스 동의가 필요해 브라우저가 바로 못 받는다.
   * `node apps/web/scripts/download-model.mjs gemma3-270m` 으로 public/models 에 받아 쓴다.
   */
  'gemma3-270m': {
    id: 'gemma3-270m',
    label: 'Gemma 3 270M int4',
    url:
      process.env.NEXT_PUBLIC_ONDEVICE_MODEL_270M_URL ||
      '/models/gemma3-270m-it-q4_0-web.task',
    bytes: 249_000_000,
    sizeLabel: '약 240MB',
    opfsFile: 'gemma3-270m-it-q4_0-web.task',
    metaFile: 'gemma3-270m-it-q4_0-web.meta.json',
    maxTokens: 1024,
  },
};

function isModelId(value: string | undefined): value is ModelId {
  return value !== undefined && value in MODELS;
}

/** 앱 기본 모델. NEXT_PUBLIC_ONDEVICE_MODEL 로 바꾼다. */
export function defaultModelId(): ModelId {
  const env = process.env.NEXT_PUBLIC_ONDEVICE_MODEL;
  return isModelId(env) ? env : 'gemma3-1b';
}

export function getModel(id: ModelId): ModelSpec {
  return MODELS[id];
}

export function listModels(): ModelSpec[] {
  return Object.values(MODELS);
}
