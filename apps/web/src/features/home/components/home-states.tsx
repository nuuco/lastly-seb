'use client';

/**
 * 홈의 사이 상황들 — 불러오는 중, 실패했을 때.
 *
 * 이 앱은 "재촉하지 않는다"는 태도를 지키므로 오류도 다그치지 않는다.
 * 무엇이 잘못됐는지 짧게 말하고, 다시 해볼 수 있는 버튼 하나만 둔다.
 */

/** 서버 렌더가 데이터를 못 받아 클라이언트가 가져오는 동안. */
export function HomeSkeleton() {
  return (
    <div className="safe-top px-6 pt-[18px]" aria-busy aria-label="불러오는 중">
      <div className="animate-pulse">
        <div className="h-[13px] w-40 rounded bg-line" />
        <div className="mt-2 h-[23px] w-56 rounded bg-line" />

        {/* 강조 카드 자리 */}
        <div className="mt-3 h-[168px] rounded-hero border border-line-2 bg-card" />

        <div className="mt-2.5 h-3 w-48 rounded bg-line" />

        {/* 묶음 카드 자리 */}
        <div className="mt-4 h-[13px] w-24 rounded bg-line" />
        <div className="mt-2 rounded-card border border-line bg-card px-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-2.5 border-b border-line py-3.5 last:border-b-0"
            >
              <div className="h-4 w-32 rounded bg-line" />
              <div className="h-1 w-full rounded bg-line" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 목록을 못 가져왔을 때. 원인은 대개 네트워크나 서버라 사용자가 할 일은 하나뿐이다. */
export function HomeError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="safe-top flex min-h-dvh flex-col items-center justify-center px-8 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-alt"
        aria-hidden
      >
        <span className="block h-2 w-2 rounded-full bg-ink-disabled" />
      </div>

      <p className="mt-5 text-18 font-bold tracking-[-.02em] text-ink">목록을 못 가져왔어요</p>
      <p className="mt-2 text-14 leading-[1.75] text-ink-2">
        연결이 잠시 끊겼을 수 있어요.
        <br />
        기록은 그대로 있으니 다시 시도해 주세요.
      </p>

      <button
        type="button"
        onClick={onRetry}
        className="mt-7 flex h-12 items-center justify-center rounded-lg bg-action px-7 text-15.5 font-semibold text-white shadow-action active:bg-action-pressed"
      >
        다시 시도
      </button>
    </div>
  );
}
