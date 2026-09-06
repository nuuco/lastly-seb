'use client';

import { cn } from '@/lib/cn';

/**
 * 설계 03 — 알림 권한.
 *
 * 권한을 요구하기 전에 알림이 어떻게 생겼는지 잠금화면 모습으로 먼저 보여준다.
 * "재촉하지 않는다"는 이 앱의 태도를 화면으로 증명하는 자리다.
 */
export function NotifyPermission({
  onEnable,
  onSkip,
  pending,
}: {
  onEnable: () => void;
  onSkip: () => void;
  pending: boolean;
}) {
  return (
    <main className="safe-top flex min-h-dvh flex-col px-8 pb-10 pt-12">
      <StepDots current={3} total={3} />

      <h1 className="text-26 font-bold leading-[1.45] tracking-[-.03em] text-ink">
        잔소리 없이,
        <br />
        알맞은 때에 조용히 짚어드릴게요
      </h1>

      <p className="mt-3 text-[14.5px] leading-[1.75] text-ink-2">
        재촉하지 않아요. 지금 안 해도 괜찮고,
        <br />
        놓치지 않게 다음 타이밍에 다시 챙겨드릴게요.
      </p>

      <div className="mt-10 rounded-[28px] bg-[linear-gradient(180deg,#F2EEE5,#E7E1D5)] px-[18px] pb-7 pt-[26px]">
        <p className="text-center text-13 tracking-[.06em] text-ink-3">9월 6일 일요일</p>
        <p className="mt-0.5 text-center text-[56px] font-semibold leading-[1.1] tracking-[-.04em] text-ink">
          9:41
        </p>

        <div className="mt-[22px] rounded-lg bg-white/[.86] px-[18px] py-4 shadow-raise backdrop-blur-[26px]">
          <div className="mb-2 flex items-center gap-[9px] text-12 text-ink-3">
            <span className="block h-4 w-4 rounded-[5px] bg-accent" aria-hidden />
            <span className="font-semibold text-ink-2">Lastly</span>
            <span className="ml-auto">지금</span>
          </div>
          <p className="mb-[5px] text-15 font-semibold text-ink">
            에어컨 필터 청소할 때가 됐어요
          </p>
          <p className="text-[13.5px] text-ink-2">마지막 청소 45일 전 · 이번 주말 어때요?</p>
        </div>

        {/* 뒤에 알림이 더 쌓여 있다는 암시 */}
        <div className="mt-2.5 h-8 rounded-md bg-white/60" aria-hidden />
      </div>

      <div className="mt-auto">
        <button
          type="button"
          onClick={onEnable}
          disabled={pending}
          className="flex h-[58px] w-full items-center justify-center rounded-lg bg-action text-17 font-semibold text-white shadow-action active:bg-action-pressed disabled:opacity-60"
        >
          {pending ? '요청 중…' : '알림 켜기'}
        </button>

        <button type="button" onClick={onSkip} className="mt-4.5 w-full text-center text-14 text-ink-3">
          나중에 하기
        </button>
      </div>
    </main>
  );
}

/** 온보딩 단계 표시 — 현재 단계만 짙게. */
export function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-6 flex gap-1.5" aria-label={`${total}단계 중 ${current}번째`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={cn(
            'block h-1 w-[26px] rounded-[2px]',
            i + 1 === current ? 'bg-accent' : 'bg-line',
          )}
        />
      ))}
    </div>
  );
}
