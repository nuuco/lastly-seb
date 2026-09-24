/**
 * 온디바이스 모델 목록. 모델을 바꾸거나 더할 때는 이 파일만 고친다.
 * 워커·엔진·동의 시트는 여기 값을 받아 쓴다.
 */
export type ModelId = 'gemma3-1b';

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
};

const DEFAULT_MODEL: ModelId = 'gemma3-1b';

export function activeModel(): ModelSpec {
  return MODELS[DEFAULT_MODEL];
}

export function listModels(): ModelSpec[] {
  return Object.values(MODELS);
}
