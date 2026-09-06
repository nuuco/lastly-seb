'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech API 래퍼.
 * 사파리/크롬은 webkit 접두사를 쓰고, 지원하지 않는 브라우저도 있으므로
 * supported를 노출해 호출부가 키보드 입력으로 대체할 수 있게 한다.
 */

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
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
  const [state, setState] = useState<SpeechState>({
    supported: false,
    listening: false,
    transcript: '',
    confidence: 0,
    error: null,
  });

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'ko-KR';
    recognition.continuous = false;
    recognition.interimResults = true;

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
      setState((prev) => ({ ...prev, listening: false, error: describeError(event.error) }));
    };

    recognition.onend = () => setState((prev) => ({ ...prev, listening: false }));

    recognitionRef.current = recognition;
    setState((prev) => ({ ...prev, supported: true }));

    return () => recognition.abort();
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    setState((prev) => ({ ...prev, transcript: '', confidence: 0, error: null, listening: true }));
    recognitionRef.current.start();
  }, []);

  const stop = useCallback(() => recognitionRef.current?.stop(), []);

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
