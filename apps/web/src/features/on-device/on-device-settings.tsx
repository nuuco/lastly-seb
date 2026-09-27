'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Toggle } from '@/components/ui/toggle';
import { watchLocalAi, type LocalAiKind } from '@/features/on-device/capability';
import {
  activeModelSpec,
  engineErrorMessage,
  engineProgressLabel,
  cancelEngineLoad,
  clearModelCache,
  ensureEngine,
  isEngineBusy,
  isEngineCancelled,
  isEngineReady,
  canUseEngine,
  subscribeEngineProgress,
  type EngineProgress,
} from '@/features/on-device/engine';
import { EngineProgressBar } from '@/features/on-device/engine-progress-bar';
import {
  clearModelConsent,
  getModelConsent,
  isVoiceGuidanceOn,
  setModelConsent,
  setVoiceGuidance,
} from '@/features/on-device/consent';
import { LOCAL_AI_UNSUPPORTED } from '@/features/on-device/engine-errors';
import type { ModelSpec } from '@/features/on-device/models';

/** 설정 13에 없는 행 — 음성 안내와 AI 모델. */
export function OnDeviceSettings() {
  const [voice, setVoice] = useState(true);
  const [consent, setConsent] = useState<'granted' | 'declined' | null>(null);
  const [ready, setReady] = useState(false);
  /** 판정 전(null)·불가(none)면 AI 모델 줄을 그리지 않는다. */
  const [kind, setKind] = useState<LocalAiKind | null>(null);
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<ModelSpec | null>(null);

  useEffect(() => {
    setVoice(isVoiceGuidanceOn());
    const current = getModelConsent();
    setConsent(current);
    setReady(isEngineReady());
    const unsub = subscribeEngineProgress((next) => {
      setProgress(next);
      if (next.status === 'ready') {
        setReady(true);
        setError(null);
      }
      if (next.status === 'error') setError(next.message);
      if (next.status === 'idle') {
        setProgress(null);
        setBusy(false);
        setReady(false);
      }
    });
    const unwatch = watchLocalAi((support) => {
      setKind(support.kind);
      setSpec(activeModelSpec());
      setReady(isEngineReady());
      // 판정이 바뀌면 앞 모델의 오류는 지운다. 기기 불가 알림은 이어서 오는 진행 알림이 다시 채운다.
      setError(null);
      if (!canUseEngine() || isEngineReady()) return;
      setBusy(true);
      void ensureEngine()
        .then(() => setReady(true))
        .catch((err) => {
          if (isEngineCancelled(err)) return;
          setError(engineErrorMessage(err));
        })
        .finally(() => setBusy(false));
    });
    return () => {
      unsub();
      unwatch();
    };
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
      if (isEngineCancelled(err)) return;
      setError(engineErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    void clearModelCache();
    clearModelConsent();
    setConsent(null);
    setReady(false);
    setProgress(null);
  };

  const showModel = kind === 'gemma' || kind === 'nano';
  const modelHint = kind === 'nano'
    ? ready
      ? 'Chrome에 내장된 AI로 알아들어요.'
      : '준비하고 있어요.'
    : ready
      ? '받아 둔 모델로 알아들어요.'
      : isEngineBusy(progress)
        ? engineProgressLabel(progress!)
        : consent === 'granted'
          ? '모델을 준비하고 있어요.'
          : `${spec?.sizeLabel ?? ''}. Wi-Fi에서 받기를 권해요.`;

  return (
    <>
      <p className="mt-6 px-1 text-12.5 tracking-[.06em] text-ink-3">이해</p>
      <div className="mt-2.5 rounded-card border border-line bg-card px-[18px] py-1 shadow-card">
        <div
          className={`flex items-center justify-between py-4${showModel || error === LOCAL_AI_UNSUPPORTED ? ' border-b border-line' : ''}`}
        >
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
        {showModel ? (
          <div className="flex items-center justify-between py-4">
            <div className="min-w-0 pr-3">
              <p className="text-15.5 font-semibold text-ink">AI 모델</p>
              <p className="mt-[3px] text-12.5 text-ink-3">{error ?? modelHint}</p>
              {isEngineBusy(progress) ? <EngineProgressBar progress={progress!} /> : null}
              {kind === 'nano' ? (
                <p className="mt-1.5 text-12 leading-[1.6] text-ink-3">{spec?.label}.</p>
              ) : (
                <p className="mt-1.5 text-12 leading-[1.6] text-ink-3">
                  {spec?.label ?? 'Gemma'} 모델.{' '}
                  <Link href="/legal/terms" className="font-semibold text-accent-ink">
                    약관
                  </Link>
                </p>
              )}
            </div>
            {kind === 'nano' ? null : busy || isEngineBusy(progress) ? (
              progress?.status === 'downloading' ? (
                <button
                  type="button"
                  onClick={() => {
                    void cancelEngineLoad();
                    clearModelConsent();
                    setConsent(null);
                    setBusy(false);
                    setProgress(null);
                  }}
                  className="shrink-0 text-13.5 font-semibold text-danger"
                >
                  취소
                </button>
              ) : (
                <button
                  type="button"
                  disabled
                  className="shrink-0 text-13.5 font-semibold text-accent-ink opacity-50"
                >
                  준비 중
                </button>
              )
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
        ) : error === LOCAL_AI_UNSUPPORTED ? (
          <p className="py-4 text-12.5 text-ink-3">{error}</p>
        ) : null}
      </div>
    </>
  );
}
