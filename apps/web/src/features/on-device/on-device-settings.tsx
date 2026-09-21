'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import {
  engineProgressLabel,
  engineProgressPercent,
  ensureEngine,
  hasWebGpu,
  isEngineBusy,
  isEngineReady,
  subscribeEngineProgress,
  unloadEngine,
  type EngineProgress,
} from '@/features/on-device/engine';
import {
  clearModelConsent,
  getModelConsent,
  isVoiceGuidanceOn,
  setModelConsent,
  setVoiceGuidance,
} from '@/features/on-device/consent';
import { cn } from '@/lib/cn';

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'flex h-7 w-12 items-center rounded-[14px] px-[3px] transition-colors',
        on ? 'justify-end bg-sage' : 'justify-start bg-line-muted',
      )}
    >
      <span className="block h-[22px] w-[22px] rounded-full bg-white" />
    </button>
  );
}

/** 설정 13에 없는 행 — 음성 안내와 이 기기 모델. */
export function OnDeviceSettings() {
  const [voice, setVoice] = useState(true);
  const [consent, setConsent] = useState<'granted' | 'declined' | null>(null);
  const [ready, setReady] = useState(false);
  const [gpu, setGpu] = useState(false);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setVoice(isVoiceGuidanceOn());
    const current = getModelConsent();
    setConsent(current);
    setGpu(hasWebGpu());
    setReady(isEngineReady());
    const unsub = subscribeEngineProgress((next) => {
      setProgress(next);
      if (next.status === 'ready') setReady(true);
    });
    if (current === 'granted' && hasWebGpu() && !isEngineReady()) {
      setBusy(true);
      void ensureEngine()
        .then(() => setReady(true))
        .catch((err) => {
          setError(err instanceof Error ? err.message : '모델을 준비하지 못했어요.');
        })
        .finally(() => setBusy(false));
    }
    return unsub;
  }, []);

  const download = async () => {
    setBusy(true);
    setError(null);
    setModelConsent('granted');
    setConsent('granted');
    try {
      await ensureEngine();
      setReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '모델을 준비하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    unloadEngine();
    clearModelConsent();
    setConsent(null);
    setReady(false);
    setProgress(null);
  };

  const modelHint = !gpu
    ? '이 브라우저에서는 쓸 수 없어요.'
    : ready
      ? '이 기기에서 이해하고 있어요.'
      : isEngineBusy(progress)
        ? engineProgressLabel(progress!)
        : consent === 'granted'
          ? '모델을 준비하고 있어요.'
          : '약 670MB. Wi-Fi에서 받기를 권해요.';

  return (
    <>
      <p className="mt-6 px-1 text-12.5 tracking-[.06em] text-ink-3">이해</p>
      <div className="mt-2.5 rounded-card border border-line bg-card px-[18px] py-1 shadow-card">
        <div className="flex items-center justify-between border-b border-line py-4">
          <div>
            <p className="text-15.5 font-semibold text-ink">음성 안내</p>
            <p className="mt-[3px] text-12.5 text-ink-3">조회 답과 기록 확인을 읽어 줘요</p>
          </div>
          <Toggle
            on={voice}
            onChange={(on) => {
              setVoiceGuidance(on);
              setVoice(on);
            }}
            label="음성 안내"
          />
        </div>
        <div className="flex items-center justify-between py-4">
          <div className="min-w-0 pr-3">
            <p className="text-15.5 font-semibold text-ink">이 기기에서 이해하기</p>
            <p className="mt-[3px] text-12.5 text-ink-3">{error ?? modelHint}</p>
            {isEngineBusy(progress) ? (
              <span className="relative mt-2 block h-1 overflow-hidden rounded-[2px] bg-bar-track">
                <span
                  className="absolute inset-y-0 left-0 block rounded-[2px] bg-sage"
                  style={{ width: `${engineProgressPercent(progress!)}%` }}
                />
              </span>
            ) : null}
            <p className="mt-1.5 text-12 leading-[1.6] text-ink-3">
              Gemma 모델.{' '}
              <Link href="/legal/terms" className="font-semibold text-accent-ink">
                약관
              </Link>
            </p>
          </div>
          {!gpu ? (
            <span className="shrink-0 rounded-[9px] bg-surface-alt px-[11px] py-1.5 text-13 font-bold text-ink-3">
              불가
            </span>
          ) : busy || isEngineBusy(progress) ? (
            <button
              type="button"
              disabled
              className="shrink-0 text-13.5 font-semibold text-accent-ink opacity-50"
            >
              받는 중
            </button>
          ) : error ? (
            <button
              type="button"
              onClick={() => void download()}
              className="shrink-0 text-13.5 font-semibold text-accent-ink"
            >
              다시 받기
            </button>
          ) : ready || consent === 'granted' ? (
            <button
              type="button"
              onClick={remove}
              className="shrink-0 text-13.5 font-semibold text-danger"
            >
              삭제
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void download()}
              className="shrink-0 text-13.5 font-semibold text-accent-ink"
            >
              받기
            </button>
          )}
        </div>
      </div>
    </>
  );
}
