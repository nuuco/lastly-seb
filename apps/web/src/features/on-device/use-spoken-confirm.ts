'use client';

import { useEffect, useRef } from 'react';

import { isVoiceGuidanceOn } from './consent';
import { speak, stopSpeaking } from './voice-guidance';

/** 한 글자·조사만으로 확정하지 않는다. TTS 메아리·잡음에 시트가 닫히던 것을 막는다. */
const YES = /^(?:응|네|어|맞아|그래|기록|저장|해줘|좋아|ㅇㅇ)(?:요|예)?[.!]?\s*$/;
const NO = /^(?:아니|아냐|아니요|아뇨|취소|됐어|그만|싫어|닫아?)(?:요)?[.!]?\s*$/;

function getCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: {
    results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
  }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

/**
 * 확인 시트에서 화면을 안 보고 응/아니로 답하게 한다.
 * 말로 들어온 기록이고 음성 안내가 켜져 있을 때만 듣는다.
 */
export function useSpokenConfirm({
  enabled,
  prompt,
  onYes,
  onNo,
}: {
  enabled: boolean;
  prompt: string;
  onYes: () => void;
  onNo: () => void;
}): void {
  const yesRef = useRef(onYes);
  const noRef = useRef(onNo);
  yesRef.current = onYes;
  noRef.current = onNo;

  useEffect(() => {
    if (!enabled || !isVoiceGuidanceOn()) return;

    let recognition: SpeechRecognitionLike | null = null;
    let decided = false;
    let listenTimer: ReturnType<typeof setTimeout> | null = null;

    const decide = (yes: boolean) => {
      if (decided) return;
      decided = true;
      try {
        recognition?.abort();
      } catch {
        // already ended
      }
      if (yes) yesRef.current();
      else noRef.current();
    };

    const listen = () => {
      const Ctor = getCtor();
      if (!Ctor || decided) return;
      const rec = new Ctor();
      recognition = rec;
      rec.lang = 'ko-KR';
      rec.continuous = false;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        const text = (event.results[0]?.[0]?.transcript ?? '').trim();
        if (YES.test(text)) decide(true);
        else if (NO.test(text)) decide(false);
      };
      rec.onerror = () => undefined;
      try {
        rec.start();
      } catch {
        // ignore
      }
    };

    // TTS 메아리가 마이크로 들어가면 취소로 오인한다. 읽기가 끝난 뒤 잠깐 쉰다.
    speak(prompt, () => {
      if (decided) return;
      listenTimer = setTimeout(listen, 400);
    });

    return () => {
      decided = true;
      if (listenTimer) clearTimeout(listenTimer);
      stopSpeaking();
      try {
        recognition?.abort();
      } catch {
        // ignore
      }
    };
  }, [enabled, prompt]);
}
