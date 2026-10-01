'use client';

import { useEffect, useRef, useState } from 'react';

import { isVoiceGuidanceOn, setVoiceGuidance } from '@/features/on-device/consent';
import { useSpokenConfirm } from '@/features/on-device/use-spoken-confirm';

/**
 * 확인 시트의 응/아니 듣기를 서버 없이 돌려 본다.
 *
 * 훅은 앱과 같은 것을 그대로 쓴다. 시간 기록은 훅을 고치지 않고
 * 브라우저의 음성 인식·음성 합성에 기록 장치를 끼워 얻는다. 끝나면 원래대로 돌린다.
 */

const DEFAULT_PROMPT = '설거지, 오늘로 기록할까요?';

/** use-spoken-confirm.ts 의 isWebKitOnly 와 같은 판정. 어느 경로를 타는지 보이려고 쓴다. */
function pathLabel(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const webkit = /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android/.test(ua);
  return webkit
    ? 'WebKit 경로 — 안내 끝 0.4초 뒤부터 4초 듣기'
    : 'Chrome 경로 — 안내 시작부터 듣고, 안내 끝 4초 뒤 멈춤';
}

type RecognitionCtor = new () => EventTarget & {
  start(): void;
  stop(): void;
  abort(): void;
};

interface ResultEventLike extends Event {
  resultIndex?: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

/** 기록 장치를 끼우고, 떼는 함수를 돌려준다. */
function instrument(log: (line: string) => void): () => void {
  const w = window as unknown as Record<string, unknown>;
  const restores: (() => void)[] = [];

  for (const key of ['SpeechRecognition', 'webkitSpeechRecognition']) {
    const Orig = w[key] as RecognitionCtor | undefined;
    if (!Orig) continue;
    class Traced extends Orig {
      constructor() {
        super();
        this.addEventListener('audiostart', () => log('🎤 마이크 열림'));
        this.addEventListener('speechstart', () => log('🗣 말소리 감지'));
        this.addEventListener('speechend', () => log('🗣 말소리 끝'));
        this.addEventListener('result', (event) => {
          const { resultIndex = 0, results } = event as ResultEventLike;
          for (let i = resultIndex; i < results.length; i += 1) {
            const result = results[i];
            if (!result) continue;
            log(`📝 들은 말: "${result[0]?.transcript ?? ''}"${result.isFinal ? '' : ' (중간)'}`);
          }
        });
        this.addEventListener('error', (event) => {
          log(`⚠️ 인식 오류: ${(event as unknown as { error?: string }).error ?? '?'}`);
        });
        this.addEventListener('end', () => log('⏹ 듣기 종료'));
      }
      override start() {
        log('▶️ 듣기 시작');
        super.start();
      }
      override stop() {
        log('⏸ 듣기 멈춤 요청 (기한)');
        super.stop();
      }
      override abort() {
        log('✖️ 듣기 중단');
        super.abort();
      }
    }
    w[key] = Traced;
    restores.push(() => {
      w[key] = Orig;
    });
  }

  const synth = window.speechSynthesis;
  if (synth) {
    const speak = synth.speak.bind(synth);
    synth.speak = (utterance: SpeechSynthesisUtterance) => {
      utterance.addEventListener('start', () => log(`🔊 안내 시작: "${utterance.text}"`));
      utterance.addEventListener('end', () => log('🔇 안내 끝'));
      utterance.addEventListener('error', (event) =>
        log(`🔇 안내 끊김 (${(event as SpeechSynthesisErrorEvent).error})`),
      );
      speak(utterance);
    };
    restores.push(() => {
      delete (synth as unknown as Record<string, unknown>).speak;
    });
  }

  return () => restores.forEach((restore) => restore());
}

export function VoiceConfirmLab() {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [voiceOn, setVoiceOn] = useState(true);
  const [path, setPath] = useState('');
  const startedAt = useRef(0);
  const uninstall = useRef<(() => void) | null>(null);

  useEffect(() => {
    setVoiceOn(isVoiceGuidanceOn());
    setPath(pathLabel());
    return () => uninstall.current?.();
  }, []);

  const log = (line: string) => {
    const at = ((performance.now() - startedAt.current) / 1000).toFixed(1);
    setLines((prev) => [...prev, `${at}s  ${line}`]);
  };
  const logRef = useRef(log);
  logRef.current = log;

  const start = () => {
    uninstall.current?.();
    startedAt.current = performance.now();
    setLines([]);
    uninstall.current = instrument((line) => logRef.current(line));
    setRunning(true);
  };

  const finish = (line: string) => {
    log(line);
    setRunning(false);
  };

  return (
    <section className="rounded-lg border border-line bg-card p-4">
      <h2 className="mb-3 text-[16px] font-bold">⑩ 응/아니 음성 확인</h2>
      <p className="text-[13px] text-ink-2">
        확인 시트와 같은 코드(<code>use-spoken-confirm.ts</code>)로 안내를 읽고 응/아니를 들어요.
        서버 없이 돌고, 저장은 하지 않아요.
      </p>
      <p className="mt-1 text-[13px] text-ink-2">{path}</p>

      {!voiceOn ? (
        <div className="mt-3 rounded-md border border-line bg-bg p-3 text-[13px]">
          음성 안내가 꺼져 있어 듣지 않아요.{' '}
          <button
            type="button"
            className="underline"
            onClick={() => {
              setVoiceGuidance(true);
              setVoiceOn(true);
            }}
          >
            켜기
          </button>
        </div>
      ) : null}

      <label className="mt-3 block text-[12px] font-bold text-ink-3">
        안내 문장
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={running}
          className="mt-1 block h-10 w-full rounded-md border border-line bg-bg px-3 text-[14px] font-normal text-ink"
        />
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={start}
          disabled={running || !voiceOn || !prompt.trim()}
          className="h-10 rounded-md border border-line bg-bg px-3 text-[13px] font-semibold disabled:opacity-40"
        >
          시작
        </button>
        <button
          type="button"
          onClick={() => finish('— 끝내기 (시트 닫힘과 같음)')}
          disabled={!running}
          className="h-10 rounded-md border border-line bg-bg px-3 text-[13px] font-semibold disabled:opacity-40"
        >
          끝내기
        </button>
      </div>

      {running ? (
        <Probe
          prompt={prompt.trim()}
          onYes={() => finish('✅ 응으로 확정')}
          onNo={() => finish('❎ 아니로 확정')}
        />
      ) : null}

      {lines.length > 0 ? (
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md border border-line bg-bg p-3 text-[12px] leading-[1.7]">
          {lines.join('\n')}
        </pre>
      ) : null}
      <p className="mt-2 text-[12px] text-ink-3">
        응: 응·네·예·어·맞아·그래·기록·저장·해줘·좋아 · 아니:
        아니·아냐·아니요·아니오·취소·됐어·그만·싫어·닫아. &quot;듣기 종료&quot; 뒤에 다시 시작이
        없으면 그때부터는 말해도 안 들어요.
      </p>
    </section>
  );
}

/** 확인 시트 자리. 켜져 있는 동안 듣고, 사라지면 시트가 닫힌 것처럼 정리된다. */
function Probe({ prompt, onYes, onNo }: { prompt: string; onYes: () => void; onNo: () => void }) {
  useSpokenConfirm({ enabled: true, prompt, onYes, onNo });
  return null;
}
