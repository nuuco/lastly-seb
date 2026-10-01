'use client';

import { useCallback, useEffect, useRef } from 'react';

import { getSpeechRecognitionCtor, type SpeechRecognitionLike } from '@/lib/speech';

import { isVoiceGuidanceOn } from './consent';
import { speak, stopSpeaking } from './voice-guidance';

/** 한 글자·조사만으로 확정하지 않는다. TTS 메아리·잡음에 시트가 닫히던 것을 막는다. */
const YES =
  /^(?:응|응응|네|네네|예|어|맞아|그래|기록|저장|해\s?줘|기록\s?해\s?줘|좋아|ㅇㅇ)(?:요|예)?[.!]?\s*$/;
const NO =
  /^(?:아니|아니아니|아냐|아니야|아니요|아니오|아뇨|취소|됐어|그만|싫어|닫아?)(?:요)?[.!]?\s*$/;

/** 안내가 끝난 뒤 응/아니를 기다리는 시간. 브라우저가 먼저 닫아도 이때까지는 듣는다. */
const LISTEN_AFTER_PROMPT_MS = 4_000;

/**
 * iOS 의 모든 브라우저와 macOS Safari. 안내 중 마이크를 켜면 안내가 끊기고,
 * 인식을 다시 켤 때마다 허용 창이 뜰 수 있다.
 */
function isWebKitOnly(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /AppleWebKit/.test(ua) && !/Chrome|Chromium|Android/.test(ua);
}

/**
 * 확인 시트에서 화면을 안 보고 응/아니로 답하게 한다.
 * 말로 들어온 기록이고 음성 안내가 켜져 있을 때만 듣는다.
 *
 * 듣는 때: Chrome 은 안내 시작부터, WebKit 은 안내가 끝난 뒤부터.
 * 둘 다 안내가 끝나고 LISTEN_AFTER_PROMPT_MS 까지 듣고 멈춘다.
 *
 * 돌려주는 stop 은 응/아니 듣기를 바로 끝낸다. 시트를 닫는 버튼이 먼저 부른다 —
 * 시트가 닫히며 정리되길 기다리면 그 사이 "다시 말하기" 의 새 음성 인식이
 * 마이크를 못 잡는다(브라우저는 음성 인식을 한 번에 하나만 허용한다).
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
}): () => void {
  const yesRef = useRef(onYes);
  const noRef = useRef(onNo);
  yesRef.current = onYes;
  noRef.current = onNo;
  const stopRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!enabled || !isVoiceGuidanceOn()) return;

    const webkit = isWebKitOnly();
    let recognition: SpeechRecognitionLike | null = null;
    let decided = false;
    /** 듣기 기한이 지났다. 이후 결과는 받되 다시 켜지 않는다. */
    let closed = false;
    let listenTimer: ReturnType<typeof setTimeout> | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;

    const decide = (yes: boolean) => {
      if (decided) return;
      decided = true;
      try {
        recognition?.abort();
      } catch {
        // already ended
      }
      recognition = null;
      // 시트가 닫혀도 cleanup이 이 안내를 끊지 않는다.
      speak(yes ? '기록했어요' : '취소했어요');
      if (yes) yesRef.current();
      else noRef.current();
    };

    const relisten = (delay: number) => {
      if (decided || closed) return;
      if (listenTimer) clearTimeout(listenTimer);
      listenTimer = setTimeout(listen, delay);
    };

    const listen = () => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor || decided || closed) return;
      const rec = new Ctor();
      recognition = rec;
      rec.lang = 'ko-KR';
      // 메아리와 대답이 한 문장으로 합쳐지지 않게 끊긴 구간마다 따로 본다.
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      let unmatched = false;
      rec.onresult = (event) => {
        for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
          const result = event.results[i];
          if (!result?.isFinal) continue;
          const text = (result[0]?.transcript ?? '').trim();
          if (YES.test(text)) return decide(true);
          if (NO.test(text)) return decide(false);
          unmatched = true;
        }
      };
      rec.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          decided = true;
        }
      };
      rec.onend = () => {
        if (recognition === rec) recognition = null;
        if (decided || closed) return;
        // Safari는 세션을 바로 끝낸다. 매번 다시 켜면 마이크 허용이 연달아 뜬다.
        if (webkit && !unmatched) return;
        relisten(300);
      };
      try {
        rec.start();
      } catch {
        // ignore
      }
    };

    /** 기한이 되면 멈춘다. abort 가 아닌 stop 이라 말하던 중인 대답은 결과로 온다. */
    const close = () => {
      closed = true;
      if (listenTimer) clearTimeout(listenTimer);
      try {
        recognition?.stop();
      } catch {
        // ignore
      }
    };

    // WebKit 은 TTS 메아리가 마이크로 들어가 취소로 오인한다. 읽기가 끝난 뒤 잠깐 쉰다.
    const echoGap = webkit ? 400 : 0;
    speak(prompt, () => {
      if (decided) return;
      if (!recognition) relisten(echoGap);
      deadlineTimer = setTimeout(close, echoGap + LISTEN_AFTER_PROMPT_MS);
    });
    if (!webkit) listen();

    const stop = () => {
      const alreadyDecided = decided;
      decided = true;
      if (listenTimer) clearTimeout(listenTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (!alreadyDecided) stopSpeaking();
      try {
        recognition?.abort();
      } catch {
        // ignore
      }
      recognition = null;
    };
    stopRef.current = stop;

    return () => {
      stop();
      if (stopRef.current === stop) stopRef.current = () => undefined;
    };
  }, [enabled, prompt]);

  return useCallback(() => stopRef.current(), []);
}
