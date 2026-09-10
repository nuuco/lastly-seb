/**
 * 설계 01 — 온보딩 소개.
 *
 * 무엇을 하는 앱인지 세 단계로 나눠 말한다. 기록 → 계산 → 알림 순서가
 * 그대로 이 앱의 동작 순서다.
 */
const STEPS = [
  { n: 1, title: '한 문장으로 기록', body: '말하거나 적으면 항목과 날짜를 알아서 정리해요.' },
  { n: 2, title: '주기는 자동 계산', body: '지금까지 해온 간격을 보고 다음 시점을 잡아드려요.' },
  { n: 3, title: '때가 되면 조용히 알림', body: '재촉하지 않고 알맞은 때에 한 번만 알려드려요.' },
] as const;

export function Intro({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <main className="safe-top flex min-h-dvh flex-col px-8 pb-10 pt-[52px]">
      <p className="text-13 font-bold tracking-[.16em] text-accent-ink">LASTLY</p>

      <h1 className="mt-[26px] text-[31px] font-bold leading-[1.42] tracking-[-.04em] text-ink">
        마지막으로 언제 했는지
        <br />
        기억해주는 앱
      </h1>

      <p className="mt-[18px] text-15.5 leading-[1.8] text-ink-2">
        “오늘 이불 빨았어”처럼 한 줄만 적으면,
        <br />
        다음 알림일까지 알아서 척척 계산해드려요.
      </p>

      <div className="mt-10 rounded-card border border-line bg-card px-5 py-1 shadow-hero-card">
        {STEPS.map((step, i) => (
          <div
            key={step.n}
            className={`flex items-start gap-3.5 px-0.5 py-4 ${
              i === STEPS.length - 1 ? '' : 'border-b border-line'
            }`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-12.5 font-bold text-accent-ink">
              {step.n}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-16 font-semibold tracking-t25 text-ink">{step.title}</p>
              <p className="mt-[5px] break-keep text-13.5 leading-[1.6] text-ink-2">{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto">
        <button
          type="button"
          onClick={onNext}
          className="flex h-[58px] w-full items-center justify-center rounded-lg bg-action text-17 font-semibold text-white shadow-action active:bg-action-pressed"
        >
          시작하기
        </button>

        <button
          type="button"
          onClick={onSkip}
          className="mt-[18px] w-full text-center text-14 text-ink-3"
        >
          이미 쓰고 있어요
        </button>
      </div>
    </main>
  );
}
