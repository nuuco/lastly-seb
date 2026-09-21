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
 * - Safari: getUserMedia 로 마이크 권한을 연 뒤 인식 시작 (없으면 결과가 비다)
 * - 한국어: isFinal 마다 abort 하지 않고, 침묵 뒤에 stop
 * - Safari 가 세션을 먼저 끊으면 앞문장을 남기고 다시 붙인다
 */

const MAX_LISTEN_MS = 15_000;
const SILENCE_MS = 1_500;

export interface SpeechState {
  supported: boolean;
  listening: boolean;
  transcript: string;
  confidence: number;
  error: string | null;
}

export function useSpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restartRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 침묵·수동 종료 전까지 true. */
  const listeningIntentRef = useRef(false);
  const transcriptRef = useRef('');
  const confidenceRef = useRef(0);
  const committedRef = useRef('');
  const sessionFinalsRef = useRef('');
  const abortRef = useRef<() => void>(() => undefined);

  const [state, setState] = useState<SpeechState>({
    supported: false,
    listening: false,
    transcript: '',
    confidence: 0,
    error: null,
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
    if (restartRef.current) {
      clearTimeout(restartRef.current);
      restartRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
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

  abortRef.current = abort;

  useEffect(() => () => abortRef.current(), []);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState !== 'hidden') return;
      abortRef.current();
      setState((prev) => ({ ...prev, listening: false }));
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, []);

  const settle = useCallback(() => {
    clearTimers();
    listeningIntentRef.current = false;
    setState((prev) => ({
      ...prev,
      listening: false,
      transcript: transcriptRef.current,
      confidence: confidenceRef.current,
    }));
  }, [clearTimers]);

  const requestStop = useCallback(() => {
    listeningIntentRef.current = false;
    clearTimers();
    const recognition = recognitionRef.current;
    if (!recognition) {
      settle();
      return;
    }
    try {
      recognition.stop();
    } catch {
      abort();
      settle();
    }
  }, [abort, clearTimers, settle]);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setState((prev) => ({ ...prev, error: '이 브라우저에서는 음성 입력을 쓸 수 없어요.' }));
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState((prev) => ({ ...prev, error: '마이크를 쓸 수 없는 환경이에요.' }));
      return;
    }

    abort();
    listeningIntentRef.current = true;
    committedRef.current = '';
    sessionFinalsRef.current = '';
    transcriptRef.current = '';
    confidenceRef.current = 0;

    setState((prev) => ({
      ...prev,
      transcript: '',
      confidence: 0,
      error: null,
      listening: true,
    }));

    const begin = () => {
      if (!listeningIntentRef.current) {
        settle();
        return;
      }

      const recognition = new Ctor();
      recognition.lang = 'ko-KR';
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event) => {
        let finals = '';
        let interim = '';
        let confidence = confidenceRef.current;
        for (let i = 0; i < event.results.length; i += 1) {
          const result = event.results[i]!;
          const piece = result[0]?.transcript ?? '';
          if (result.isFinal) {
            finals += piece;
            confidence = result[0]?.confidence ?? confidence;
          } else {
            interim += piece;
          }
        }

        sessionFinalsRef.current = finals;
        const text = `${committedRef.current}${finals}${interim}`;
        transcriptRef.current = text;
        confidenceRef.current = confidence;
        setState((prev) => ({
          ...prev,
          listening: true,
          transcript: text,
          confidence,
          error: null,
        }));

        if (!listeningIntentRef.current) return;
        if (silenceRef.current) clearTimeout(silenceRef.current);
        silenceRef.current = setTimeout(requestStop, SILENCE_MS);
      };

      recognition.onerror = (event) => {
        if (event.error === 'aborted' || event.error === 'no-speech') return;
        listeningIntentRef.current = false;
        clearTimers();
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        detachRecognition(recognition);
        setState((prev) => ({
          ...prev,
          listening: false,
          transcript: transcriptRef.current,
          error: describeError(event.error),
        }));
      };

      recognition.onend = () => {
        committedRef.current = `${committedRef.current}${sessionFinalsRef.current}`;
        sessionFinalsRef.current = '';
        if (recognitionRef.current === recognition) recognitionRef.current = null;
        detachRecognition(recognition);

        if (!listeningIntentRef.current) {
          settle();
          return;
        }

        transcriptRef.current = committedRef.current || transcriptRef.current;
        setState((prev) => ({ ...prev, listening: true, transcript: transcriptRef.current }));
        restartRef.current = setTimeout(() => {
          restartRef.current = null;
          begin();
        }, 100);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
      } catch {
        restartRef.current = setTimeout(() => {
          restartRef.current = null;
          begin();
        }, 200);
      }
    };

    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        stream.getTracks().forEach((track) => track.stop());
        if (!listeningIntentRef.current) return;
        maxTimerRef.current = setTimeout(requestStop, MAX_LISTEN_MS);
        begin();
      })
      .catch(() => {
        listeningIntentRef.current = false;
        setState((prev) => ({
          ...prev,
          listening: false,
          error: '마이크 권한이 필요해요. 주소창·설정에서 허용해 주세요.',
        }));
      });
  }, [abort, clearTimers, requestStop, settle]);

  const reset = useCallback(
    () => setState((prev) => ({ ...prev, transcript: '', confidence: 0, error: null })),
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
