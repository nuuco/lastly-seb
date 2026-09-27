import { cancelledError, deviceFailure } from './engine-errors';
import type { LocalModel } from './local-model';
import type { ChromeBuiltinSpec } from './models';
import { buildParseInstruction } from './parse-prompt';
import type { EngineProgress } from './types';

/**
 * Chrome 내장 Gemini Nano (Prompt API, `LanguageModel`).
 * 데스크톱 Chrome 148+ 만 있다. Android Chrome 에는 API 자체가 없다.
 *
 * availability 가 downloadable·downloading 이면 create 가 모델을 받는다.
 * 받기는 사용자 조작(클릭) 뒤에만 시작된다.
 */
const NANO_UNAVAILABLE = '이 기기에서는 Chrome 내장 AI를 쓸 수 없어요.';

type Availability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

type NanoSession = {
  prompt(
    input: string,
    options?: { responseConstraint?: object; signal?: AbortSignal },
  ): Promise<string>;
  clone(options?: { signal?: AbortSignal }): Promise<NanoSession>;
  destroy(): void;
};

type DownloadMonitor = {
  addEventListener(type: 'downloadprogress', listener: (event: { loaded: number }) => void): void;
};

type LanguageModelApi = {
  availability(): Promise<Availability>;
  create(options?: {
    monitor?: (monitor: DownloadMonitor) => void;
    signal?: AbortSignal;
  }): Promise<NanoSession>;
};

/** Nano 가 내는 JSON 모양을 고정한다. Gemma 와 같은 키. */
const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    say: { type: 'string' },
    intent: { type: 'string', enum: ['record', 'query'] },
    item_name: { type: ['string', 'null'] },
    days_ago: { type: 'integer', minimum: 0 },
  },
  required: ['say', 'item_name', 'intent', 'days_ago'],
};

function api(): LanguageModelApi | null {
  if (typeof self === 'undefined') return null;
  return (self as unknown as { LanguageModel?: LanguageModelApi }).LanguageModel ?? null;
}

/** API 가 있어도 기기 사양·저장공간이 모자라면 unavailable 이다. */
export async function chromeNanoAvailability(): Promise<Availability> {
  const lm = api();
  if (!lm) return 'unavailable';
  try {
    return await lm.availability();
  } catch {
    return 'unavailable';
  }
}

export function createChromeNanoModel(
  spec: ChromeBuiltinSpec,
  onProgress: (progress: EngineProgress) => void,
): LocalModel {
  let session: NanoSession | null = null;
  let loading: Promise<void> | null = null;
  let abort: AbortController | null = null;

  const prepare = (): Promise<void> => {
    if (session) return Promise.resolve();
    if (loading) return loading;
    loading = (async () => {
      const lm = api();
      const availability = await chromeNanoAvailability();
      if (!lm || availability === 'unavailable') {
        throw new Error(NANO_UNAVAILABLE);
      }
      abort = new AbortController();
      // 이미 받아 둔 기기에서는 받기 단계를 알리지 않는다. 받는 중 표시가 잠깐 떴다 사라지지 않게.
      if (availability !== 'available') {
        onProgress({ status: 'downloading', loaded: 0, total: 100, message: 'AI 받는 중' });
      }
      session = await lm.create({
        signal: abort.signal,
        monitor(m) {
          m.addEventListener('downloadprogress', (event) => {
            onProgress({
              status: 'downloading',
              loaded: Math.round(event.loaded * 100),
              total: 100,
              message: 'AI 받는 중',
            });
          });
        },
      });
      onProgress({ status: 'ready', loaded: 100, total: 100, message: '준비됨' });
    })()
      .catch((err: unknown) => {
        const cancelled = abort?.signal.aborted;
        onProgress({ status: 'idle', loaded: 0, total: 0, message: '' });
        if (cancelled) throw cancelledError();
        // Nano 준비 실패는 모두 기기 탓으로 본다. engine 이 기록하고 다른 모델로 넘기거나 알린다.
        throw deviceFailure(err);
      })
      .finally(() => {
        loading = null;
        abort = null;
      });
    return loading;
  };

  const unload = () => {
    abort?.abort();
    session?.destroy();
    session = null;
  };

  return {
    spec,
    isReady: () => session !== null,
    prepare,
    async generate(input) {
      await prepare();
      if (!session) throw new Error('모델이 아직 없습니다.');
      // 문장마다 빈 대화에서 시작한다. 앞 문장이 다음 답에 섞이지 않게.
      const turn = await session.clone();
      try {
        return await turn.prompt(
          buildParseInstruction(input.text),
          { responseConstraint: RESPONSE_SCHEMA },
        );
      } finally {
        turn.destroy();
      }
    },
    async cancel() {
      unload();
      onProgress({ status: 'idle', loaded: 0, total: 0, message: '' });
    },
    unload,
    // 파일은 Chrome 이 관리한다. 페이지에서 지울 수 없다.
    removeFiles: async () => undefined,
  };
}
