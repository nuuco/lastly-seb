'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  detachRecognition,
  getSpeechRecognitionCtor,
  type SpeechRecognitionLike,
} from '@/lib/speech';

/**
 * Web Speech API 래퍼.
 *
 * 인식 객체를 들고 있지 않고 말할 때마다 만들었다가 끝나면 버린다.
 * 클릭과 같은 틱에서 start 한다. isFinal 이 없어도 침묵이면 stop 한다.
 * getUserMedia 로 마이크를 따로 열지 않는다. 음성 인식과 동시에 잡으면
 * 인식 쪽에 소리가 들어가지 않는다(Chrome·Safari). 권한은 인식이 직접 묻는다.
 */

const MAX_LISTEN_MS = 15_000;
const SILENCE_MS = 1_500;

export interface SpeechState {
  supported: boolean;
  listening: boolean;
  transcript: string;
  confidence: number;
  error: string | null;
  /** 이번 시도가 권한 거부로 막혔는지. 홈이 설정 안내를 띄운다. */
  permissionDenied: boolean;
}

export function useSpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeningIntentRef = useRef(false);
  const requestStopRef = useRef<() => void>(() => undefined);

  const [state, setState] = useState<SpeechState>({
    supported: false,
    listening: false,
    transcript: '',
    confidence: 0,
    error: null,
    permissionDenied: false,
  });

  useEffect(() => {
    if (getSpeechRecognitionCtor()) setState((prev) => ({ ...prev, supported: true }));
  }, []);

  const clearTimers = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    if (silenceRef.current) {
      clearTimeout(silenceRef.current);
      silenceRef.current = null;
    }
  }, []);

  const release = useCallback(() => {
    listeningIntentRef.current = false;
    clearTimers();

    const recognition = recognitionRef.current;
    if (!recognition) return;

    recognitionRef.current = null;
    detachRecognition(recognition);
    try {
      recognition.abort();
    } catch {
      // ignore
    }
  }, [clearTimers]);

  const requestStop = useCallback(() => {
    listeningIntentRef.current = false;
    clearTimers();
    const recognition = recognitionRef.current;
    if (!recognition) {
      setState((prev) => ({ ...prev, listening: false }));
      return;
    }
    try {
      recognition.stop();
    } catch {
      release();
      setState((prev) => ({ ...prev, listening: false }));
    }
  }, [clearTimers, release]);

  requestStopRef.current = requestStop;

  useEffect(() => release, [release]);

  useEffect(() => {
    const abortListen = () => {
      release();
      setState((prev) => ({ ...prev, listening: false }));
    };
    const stopIfHidden = () => {
      if (document.visibilityState === 'hidden') abortListen();
    };

    document.addEventListener('visibilitychange', stopIfHidden);
    window.addEventListener('pagehide', abortListen);

    return () => {
      document.removeEventListener('visibilitychange', stopIfHidden);
      window.removeEventListener('pagehide', abortListen);
    };
  }, [release]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setState((prev) => ({ ...prev, error: '이 브라우저에서는 음성 입력을 쓸 수 없어요.' }));
      return;
    }

    release();
    listeningIntentRef.current = true;

    const recognition = new Ctor();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let text = '';
      let confidence = 0;
      let sawFinal = false;

      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        const alternative = result[0]!;
        text += alternative.transcript;
        if (result.isFinal) {
          confidence = alternative.confidence;
          sawFinal = true;
        }
      }

      setState((prev) => ({ ...prev, transcript: text, confidence, error: null }));

      if (!listeningIntentRef.current) return;

      if (sawFinal) {
        requestStopRef.current();
        return;
      }

      if (silenceRef.current) clearTimeout(silenceRef.current);
      silenceRef.current = setTimeout(() => requestStopRef.current(), SILENCE_MS);
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      if (event.error === 'no-speech') {
        requestStopRef.current();
        return;
      }
      const message = describeError(event.error);
      const permissionDenied =
        event.error === 'not-allowed' || event.error === 'service-not-allowed';
      release();
      setState((prev) => ({ ...prev, listening: false, error: message, permissionDenied }));
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      detachRecognition(recognition);
      listeningIntentRef.current = false;
      clearTimers();
      setState((prev) => ({ ...prev, listening: false }));
    };

    recognitionRef.current = recognition;
    maxTimerRef.current = setTimeout(() => requestStopRef.current(), MAX_LISTEN_MS);

    setState((prev) => ({
      ...prev,
      transcript: '',
      confidence: 0,
      error: null,
      permissionDenied: false,
      listening: true,
    }));

    try {
      recognition.start();
    } catch {
      release();
      setState((prev) => ({ ...prev, listening: false }));
    }
  }, [clearTimers, release]);

  const reset = useCallback(
    () =>
      setState((prev) => ({
        ...prev,
        transcript: '',
        confidence: 0,
        error: null,
        permissionDenied: false,
      })),
    [],
  );

  return { ...state, start, stop: requestStop, reset };
}

function describeError(code: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return '마이크 권한이 필요해요. 설정에서 허용해 주세요.';
    case 'no-speech':
      return '소리가 들리지 않았어요. 다시 말해주세요.';
    case 'network':
      return '네트워크가 불안정해요. 키보드로 적어주세요.';
    default:
      return '잘 못 들었어요. 다시 말해주세요.';
  }
}
