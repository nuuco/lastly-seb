import type { ModelSpec } from './models';
import type { OnDeviceKnownItem } from './types';

export interface ParseInput {
  text: string;
  referenceDate: string;
  knownItems: OnDeviceKnownItem[];
  /** 지시문을 통째로 바꿀 때. 실험실에서만 쓴다. 비우면 parse-prompt.ts 의 지시문. */
  instruction?: string;
  /** Chrome 내장 AI 에 줄 JSON 스키마. instruction 을 바꿀 때 함께 바꾼다. */
  responseSchema?: object;
}

/**
 * 온디바이스 모델 하나. 런타임(MediaPipe·Chrome 내장 AI)이 달라도 이 모양으로 쓴다.
 * generate 는 모델이 낸 글자 그대로 돌려준다. JSON 해석과 규칙 덧씌우기는 engine.ts 가 한다.
 */
export interface LocalModel {
  spec: ModelSpec;
  /** 이 브라우저에서 돌릴 수 있는지. */
  isSupported(): boolean;
  isReady(): boolean;
  /** 받기·올리기. 진행률은 만들 때 넘긴 콜백으로 알린다. */
  prepare(): Promise<void>;
  generate(input: ParseInput): Promise<string>;
  /** 받기를 멈추고 덜 받은 파일을 지운다. */
  cancel(): Promise<void>;
  unload(): void;
  removeFiles(): Promise<void>;
}
