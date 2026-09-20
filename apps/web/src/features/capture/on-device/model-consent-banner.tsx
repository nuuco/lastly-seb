'use client';

import { useEffect, useState } from 'react';

import {
  ensureEngine,
  isEngineReady,
  probeModel,
  probeWebGpu,
  subscribeEngineProgress,
} from './engine';
import { readOnDeviceConsent, writeOnDeviceConsent } from './consent';
import type { EngineProgress } from './types';

/**
 * 홈 진입 후 온디바이스 모델 동의·준비.
 * 거절·실패해도 캡처는 규칙·서버로 이어진다.
 */
export function ModelConsentBanner() {
  const [consent, setConsent] = useState(() => readOnDeviceConsent());
  const [progress, setProgress] = useState<EngineProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => subscribeEngineProgress(setProgress), []);

  useEffect(() => {
    if (consent !== 'accepted') return;
    let cancelled = false;
    void (async () => {
      try {
        if (!(await probeWebGpu())) {
          if (!cancelled) {
            setError('이 브라우저는 기기 AI를 쓸 수 없어요. 서버·규칙으로 해석해요.');
          }
          return;
        }
        const model = await probeModel();
        if (!model.ok) {
          if (!cancelled) setError('모델 파일이 없어 기기 AI를 건너뛰어요.');
          return;
        }
        await ensureEngine();
        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '기기 AI를 준비하지 못했어요.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [consent]);

  useEffect(() => {
    if (isEngineReady()) setReady(true);
  }, [progress?.status]);

  if (consent === 'declined') return null;
  if (consent === 'accepted' && ready && !error) return null;
  if (consent === 'accepted' && error) {
    return (
      <p className="mb-2 px-1 text-12.5 leading-[1.55] text-ink-3">
        {error} 캡처는 그대로 쓸 수 있어요.
      </p>
    );
  }
  if (consent === 'accepted') {
    const pct =
      progress && progress.total > 0
        ? Math.min(100, Math.round((progress.loaded / progress.total) * 100))
        : 0;
    return (
      <p className="mb-2 px-1 text-12.5 leading-[1.55] text-ink-3">
        기기 AI 준비 중{progress?.message ? ` · ${progress.message}` : ''}
        {pct > 0 ? ` ${pct}%` : ''}
      </p>
    );
  }

  return (
    <div className="mb-2.5 rounded-[16px] border border-line bg-card px-3.5 py-3 shadow-card">
      <p className="text-13.5 font-semibold leading-[1.45] text-ink">이 기기에서 AI 쓰기</p>
      <p className="mt-1 text-12.5 leading-[1.55] text-ink-2">
        쓰려면 약 700MB를 받아야 해요. Wi‑Fi에서 받는 걸 권장해요. 나중에 해도 기록은 됩니다.
      </p>
      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-[11px] bg-action py-2.5 text-13 font-semibold text-white"
          onClick={() => {
            writeOnDeviceConsent('accepted');
            setConsent('accepted');
          }}
        >
          받기
        </button>
        <button
          type="button"
          className="flex-1 rounded-[11px] border border-line bg-card py-2.5 text-13 font-semibold text-ink-2"
          onClick={() => {
            writeOnDeviceConsent('declined');
            setConsent('declined');
          }}
        >
          나중에
        </button>
      </div>
    </div>
  );
}
