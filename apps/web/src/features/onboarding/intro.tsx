'use client';

import { StepDots } from './notify-permission';

/**
 * 설계 01 — 이 앱이 무엇이 "아닌지"부터 말한다.
 * 두 번째 문단만 앰버로 칠해 대비를 만드는 게 이 화면의 핵심이다.
 */
export function Intro({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <main className="safe-top flex min-h-dvh flex-col px-8 pb-10 pt-12">
      <StepDots current={1} total={3} />

      <p className="text-13 font-bold tracking-[.16em] text-accent-ink">LASTLY</p>

      <h1 className="mt-6 text-30 font-bold leading-[1.45] tracking-t35 text-ink">
        해야 할 일을
        <br />
        알려주는 앱이 아니라,
      </h1>
      <h1 className="mt-2.5 text-30 font-bold leading-[1.45] tracking-t35 text-accent-ink">
        마지막으로 언제 했는지
        <br />
        기억해주는 앱
      </h1>

      <p className="mt-5 text-15 leading-[1.8] text-ink-2">
        이불 빨래, 칫솔 교체, 필터 청소.
        <br />
        말 한마디만 남기면 나머지는 저희가 챙길게요.
      </p>

      <div className="mt-auto">
        <div className="rounded-hero border border-[#EBE3D4] bg-[linear-gradient(180deg,#F8F4EA,#FCFBF8)] px-6 py-[22px] shadow-soft">
          <div className="mb-3.5 flex items-center gap-2 text-12 tracking-[.06em] text-ink-3">
            <span className="block h-3.5 w-3.5 rounded-full bg-accent" />
            말하거나 적기만 하면
          </div>

          <p className="text-21 font-semibold tracking-[-.02em] text-ink">“오늘 이불 빨았어”</p>

          <div className="mt-4.5 flex items-center gap-2.5 border-t border-line pt-4">
            <span className="block h-2 w-2 shrink-0 rounded-full bg-sage" />
            <span className="text-14 text-ink-2">이불 빨래 · 9월 6일 기록 · 다음 알림 9월 20일</span>
          </div>
        </div>

        <button
          type="button"
          onClick={onNext}
          className="mt-8 flex h-[58px] w-full items-center justify-center rounded-lg bg-action text-17 font-semibold text-white shadow-action active:bg-action-pressed"
        >
          시작하기
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="mt-4.5 w-full text-center text-14 text-ink-3"
        >
          이미 쓰고 있어요
        </button>
      </div>
    </main>
  );
}
