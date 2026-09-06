'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';

import { StepDots } from './notify-permission';

type Platform = 'ios' | 'android';

const COPY: Record<Platform, { lead: string; steps: Array<[string, string, string]> }> = {
  ios: {
    lead: '아이폰 사파리는 홈 화면에 추가한 뒤에만\n알림을 보낼 수 있어요. 10초면 끝나요.',
    steps: [
      ['아래쪽 ', '공유 버튼', '을 눌러요'],
      ['목록에서 ', '홈 화면에 추가', '를 골라요'],
    ],
  },
  android: {
    lead: '크롬 메뉴에서 한 번만 추가해두면\n앱처럼 바로 열리고 알림도 받을 수 있어요.',
    steps: [
      ['주소창 오른쪽 ', '메뉴 버튼', '을 눌러요'],
      ['메뉴에서 ', '홈 화면에 추가', '를 골라요'],
    ],
  },
};

/**
 * 설계 02-A / 02-B — 홈 화면에 추가.
 *
 * iOS 사파리는 홈 화면에 추가된 PWA에서만 푸시를 허용한다.
 * 그 제약 때문에 이 화면이 존재하므로, 왜 필요한지를 먼저 말한다.
 */
export function InstallGuide({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [platform, setPlatform] = useState<Platform>(detectPlatform());
  const copy = COPY[platform];

  return (
    <main className="safe-top flex min-h-dvh flex-col px-8 pb-[38px] pt-[34px]">
      <StepDots current={2} total={3} />

      <h1 className="text-26 font-bold leading-[1.45] tracking-[-.03em] text-ink">
        알림을 받으려면
        <br />
        홈 화면에 추가해 주세요
      </h1>

      <p className="mt-3 whitespace-pre-line text-[14.5px] leading-[1.75] text-ink-2">
        {copy.lead}
      </p>

      <div className="mt-[18px] flex gap-[5px] rounded-[14px] bg-line p-1">
        {(['ios', 'android'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setPlatform(value)}
            className={cn(
              'flex-1 rounded-[11px] py-[9px] text-center text-[13.5px]',
              platform === value
                ? 'bg-white font-bold text-ink shadow-hair'
                : 'font-semibold text-ink-2',
            )}
          >
            {value === 'ios' ? '아이폰 · 사파리' : '안드로이드 · 크롬'}
          </button>
        ))}
      </div>

      <ol className="mt-[22px] flex flex-col gap-[18px]">
        {copy.steps.map(([before, strong, after], index) => (
          <li key={strong} className="flex items-start gap-[13px]">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-12.5 font-bold text-accent-ink">
              {index + 1}
            </span>
            <div className="flex-1">
              <p className="mb-[11px] text-15 font-semibold text-ink">
                {before}
                <span className="text-accent-ink">{strong}</span>
                {after}
              </p>

              {index === 0 ? <AddressBarMock /> : <MenuMock platform={platform} />}
            </div>
          </li>
        ))}
      </ol>

      {platform === 'android' ? (
        <p className="mt-3.5 text-[13.5px] text-ink-3">
          “앱 설치” 안내가 바로 뜨면 그것만 눌러도 돼요.
        </p>
      ) : null}

      <div className="mt-auto pt-6">
        <button
          type="button"
          onClick={onNext}
          className="flex h-[58px] w-full items-center justify-center rounded-lg bg-action text-17 font-semibold text-white shadow-action active:bg-action-pressed"
        >
          추가했어요
        </button>
        <button type="button" onClick={onSkip} className="mt-4.5 w-full text-center text-14 text-ink-3">
          나중에 하기
        </button>
      </div>
    </main>
  );
}

/** 브라우저 주소창과 공유 버튼을 흉내 낸 그림. */
function AddressBarMock() {
  return (
    <div className="flex items-center gap-3 rounded-[22px] border border-line bg-card p-[13px_14px] shadow-card">
      <span className="flex h-8 flex-1 items-center rounded-[10px] bg-surface-alt px-3 text-12 text-ink-3">
        lastly.app
      </span>
      <span
        className="relative flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-accent-soft"
        aria-hidden
      >
        <span className="block h-[13px] w-3 rounded-b-[3px] border-x-[1.6px] border-b-[1.6px] border-accent-ink" />
        <span className="absolute left-1/2 top-[9px] -ml-px block h-[11px] w-0.5 bg-accent-ink" />
        <span className="absolute left-1/2 top-2.5 -ml-1 block h-2 w-2 rotate-45 border-l-[1.8px] border-t-[1.8px] border-accent-ink" />
      </span>
    </div>
  );
}

/** 메뉴 목록에서 "홈 화면에 추가"가 강조된 그림. */
function MenuMock({ platform }: { platform: Platform }) {
  const rows =
    platform === 'ios'
      ? ['즐겨찾기에 추가', '홈 화면에 추가', '복사']
      : ['새 탭', '홈 화면에 추가', '북마크'];

  return (
    <div className="overflow-hidden rounded-[22px] border border-line bg-card shadow-card">
      {rows.map((row, i) => {
        const highlighted = row === '홈 화면에 추가';
        return (
          <div
            key={row}
            className={cn(
              'px-[14px] py-3 text-[13.5px]',
              i < rows.length - 1 && 'border-b border-line',
              highlighted ? 'bg-accent-soft font-bold text-accent-ink' : 'text-ink-3',
            )}
          >
            {row}
          </div>
        );
      })}
    </div>
  );
}

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'ios';
  return /android/i.test(navigator.userAgent) ? 'android' : 'ios';
}
