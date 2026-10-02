'use client';

import { useCallback, useEffect, useRef } from 'react';

import {
  getMicPermission,
  getSpeechRecognitionCtor,
  type MicPermission,
  type SpeechRecognitionLike,
} from '@/lib/speech';

import { isVoiceGuidanceOn } from './consent';
import { speak, stopSpeaking } from './voice-guidance';

/** 한 글자·조사만으로 확정하지 않는다. TTS 메아리·잡음에 시트가 닫히던 것을 막는다. */
const YES = /^(?:응|네|어|맞아|그래|기록|저장|해줘|좋아|ㅇㅇ)(?:요|예)?[.!]?\s*$/;
const NO = /^(?:아니|아냐|아니요|아뇨|취소|됐어|그만|싫어|닫아?)(?:요)?[.!]?\s*$/;

/** 안내가 끝난 뒤 응/아니를 기다리는 시간. 대답하면 그 자리에서 끝난다. */
const LISTEN_WINDOW_MS = 8_000;
/** TTS 메아리가 가라앉을 틈. */
const ECHO_GAP_MS = 400;
/** 일찍 끊긴 듣기를 다시 켜기 전 틈. */
const RESTART_GAP_MS = 300;

/** 안내를 다 읽을 만한 시간. 읽기 끝 신호가 오지 않을 때만 쓴다. */
function expectedSpeakMs(text: string): number {
  return text.length * 200 + 1_000;
}

/**
 * 확인 시트에서 화면을 안 보고 응/아니로 답하게 한다.
 * 말로 들어온 기록이고 음성 안내가 켜져 있을 때만 듣는다.
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

    let recognition: SpeechRecognitionLike | null = null;
    let decided = false;
    let windowOpened = false;
    let windowClosed = false;
    let listenTimer: ReturnType<typeof setTimeout> | null = null;
    let deadlineTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
    let permission: MicPermission = 'unknown';
    void getMicPermission().then((state) => {
      permission = state;
    });

    const clearTimers = () => {
      if (listenTimer) clearTimeout(listenTimer);
      if (deadlineTimer) clearTimeout(deadlineTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      listenTimer = deadlineTimer = fallbackTimer = null;
    };

    const abortRecognition = () => {
      try {
        recognition?.abort();
      } catch {
        // already ended
      }
      recognition = null;
    };

    const decide = (yes: boolean) => {
      if (decided) return;
      decided = true;
      clearTimers();
      abortRecognition();
      // 시트가 닫혀도 cleanup이 이 안내를 끊지 않는다.
      speak(yes ? '기록했어요' : '취소했어요');
      if (yes) yesRef.current();
      else noRef.current();
    };

    const listen = () => {
      const Ctor = getSpeechRecognitionCtor();
      if (!Ctor || decided || windowClosed) return;
      const rec = new Ctor();
      recognition = rec;
      rec.lang = 'ko-KR';
      // 한 번 켜서 마감까지 듣는다. 다시 켜지 않아야 허용 팝업이 또 뜨지 않는다.
      rec.continuous = true;
      rec.interimResults = false;
      rec.maxAlternatives = 1;
      rec.onresult = (event) => {
        // 연속 듣기는 앞서 들은 구간도 함께 온다. 새로 들어온 것만 본다.
        for (let i = event.resultIndex ?? 0; i < event.results.length; i += 1) {
          const text = (event.results[i]?.[0]?.transcript ?? '').trim();
          if (YES.test(text)) return decide(true);
          if (NO.test(text)) return decide(false);
        }
      };
      rec.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          decided = true;
          clearTimers();
        }
      };
      rec.onend = () => {
        if (recognition === rec) recognition = null;
        if (decided || windowClosed) return;
        // 일부 브라우저는 연속 듣기도 조용하면 끝낸다. 남은 시간 동안 다시 켜되,
        // Safari 는 다시 켤 때마다 허용을 또 물으므로 허용이 확인됐을 때만 한다.
        if (permission !== 'granted') return;
        listenTimer = setTimeout(listen, RESTART_GAP_MS);
      };
      try {
        rec.start();
      } catch {
        // ignore
      }
    };

    // TTS 메아리가 마이크로 들어가면 취소로 오인한다. 읽기가 끝난 뒤 잠깐 쉬고 마감까지 듣는다.
    const openWindow = () => {
      if (decided || windowOpened) return;
      windowOpened = true;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      listenTimer = setTimeout(listen, ECHO_GAP_MS);
      deadlineTimer = setTimeout(() => {
        windowClosed = true;
        if (listenTimer) clearTimeout(listenTimer);
        abortRecognition();
      }, ECHO_GAP_MS + LISTEN_WINDOW_MS);
    };

    speak(prompt, openWindow);
    // 읽기가 끝났다는 신호(onend)를 안 주는 브라우저가 있다. 읽을 만한 시간이 지나면 듣기 시작한다.
    if (!windowOpened) fallbackTimer = setTimeout(openWindow, expectedSpeakMs(prompt));

    const stop = () => {
      const alreadyDecided = decided;
      decided = true;
      clearTimers();
      if (!alreadyDecided) stopSpeaking();
      abortRecognition();
    };
    stopRef.current = stop;

    // 앱을 내리거나 화면이 꺼지면 바로 놓는다. 백그라운드에서 다시 켜지 않게.
    const stopIfHidden = () => {
      if (document.visibilityState === 'hidden') stop();
    };
    document.addEventListener('visibilitychange', stopIfHidden);
    window.addEventListener('pagehide', stop);

    return () => {
      document.removeEventListener('visibilitychange', stopIfHidden);
      window.removeEventListener('pagehide', stop);
      stop();
      if (stopRef.current === stop) stopRef.current = () => undefined;
    };
  }, [enabled, prompt]);

  return useCallback(() => stopRef.current(), []);
}
