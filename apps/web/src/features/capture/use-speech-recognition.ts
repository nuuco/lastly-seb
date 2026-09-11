'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech API 래퍼.
 *
 * 인식 객체를 들고 있지 않고 말할 때마다 만들었다가 끝나면 버린다.
 * 하나를 계속 붙들고 있으면 stop() 뒤에도 브라우저가 마이크를 놓지 않아
 * 녹음 표시가 켜진 채로 남는다.
 *
 * 사파리·크롬은 webkit 접두사를 쓰고 지원하지 않는 브라우저도 있으므로
 * supported 를 노출해 호출부가 키보드 입력으로 대체할 수 있게 한다.
 */

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string; confidence: number }> & { isFinal: boolean }
  >;
}

/** 말이 없어도 이 시간이 지나면 스스로 끊는다. onend 가 오지 않는 경우가 있다. */
const MAX_LISTEN_MS = 15_000;

function getRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as
    | (new () => SpeechRecognitionLike)
    | null;
}

export interface SpeechState {
  supported: boolean;
  listening: boolean;
  /** 말하는 중에도 화면에 흘려보낼 중간 결과 (화면 07). */
  transcript: string;
  confidence: number;
  error: string | null;
}

export function useSpeechRecognition() {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [state, setState] = useState<SpeechState>({
    supported: false,
    listening: false,
    transcript: '',
    confidence: 0,
    error: null,
  });

  // 생성자 존재 여부만 본다. 객체를 미리 만들지 않는다.
  useEffect(() => {
    if (getRecognitionCtor()) setState((prev) => ({ ...prev, supported: true }));
  }, []);

  /** 인식 객체를 확실히 버린다. 이걸 해야 마이크가 풀린다. */
  const release = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const recognition = recognitionRef.current;
    if (!recognition) return;

    recognitionRef.current = null;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    // abort 는 stop 과 달리 결과를 기다리지 않고 즉시 끊는다.
    try {
      recognition.abort();
    } catch {
      // 이미 끝난 뒤라면 무시한다.
    }
  }, []);

  // 화면을 떠날 때도 반드시 놓아준다.
  useEffect(() => release, [release]);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    // 이전 것이 남아 있으면 먼저 버린다. 두 개가 동시에 살면 마이크가 안 풀린다.
    release();

    const recognition = new Ctor();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let text = '';
      let confidence = 0;

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i]!;
        const alternative = result[0]!;
        text += alternative.transcript;
        if (result.isFinal) confidence = alternative.confidence;
      }

      setState((prev) => ({ ...prev, transcript: text, confidence }));
    };

    recognition.onerror = (event) => {
      const message = describeError(event.error);
      release();
      // no-speech 는 잘못이 아니라 그냥 조용했던 것이다. 오류로 적지 않는다.
      setState((prev) => ({
        ...prev,
        listening: false,
        error: event.error === 'no-speech' ? null : message,
      }));
    };

    recognition.onend = () => {
      release();
      setState((prev) => ({ ...prev, listening: false }));
    };

    recognitionRef.current = recognition;
    timerRef.current = setTimeout(() => {
      release();
      setState((prev) => ({ ...prev, listening: false }));
    }, MAX_LISTEN_MS);

    setState((prev) => ({ ...prev, transcript: '', confidence: 0, error: null, listening: true }));

    try {
      recognition.start();
    } catch {
      // 이미 듣는 중이면 브라우저가 던진다. 상태만 되돌린다.
      release();
      setState((prev) => ({ ...prev, listening: false }));
    }
  }, [release]);

  /** 사용자가 멈춤을 눌렀을 때. 지금까지 들은 것은 살린다. */
  const stop = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    try {
      recognition.stop();
    } catch {
      release();
      setState((prev) => ({ ...prev, listening: false }));
    }
  }, [release]);

  const reset = useCallback(
    () => setState((prev) => ({ ...prev, transcript: '', confidence: 0, error: null })),
    [],
  );

  return { ...state, start, stop, reset };
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
