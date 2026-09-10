/**
 * 기록이 하나도 없을 때 — 설계 04.
 *
 * 개정 설계에서 점선이 빠지고 보통 카드가 됐다. 처음 열었을 때 화면이
 * "아직 덜 된 상태" 로 보이지 않게 하려는 것이다. 대신 문구가 무엇을
 * 하라는 안내가 아니라 권유가 됐다 — "첫 기록을 남겨볼까요?"
 */
const EXAMPLES = [
  '오늘 이불 빨았어',
  '어제 정수기 필터 갈았어',
  '지난주에 화분에 물 줬어',
] as const;

export function EmptyState({ onExampleTap }: { onExampleTap?: (text: string) => void }) {
  return (
    <div>
      <div className="mt-10 rounded-[28px] border border-line bg-card px-[26px] py-[34px] shadow-hero-card">
        <p className="break-keep text-21 font-bold tracking-t3 text-ink">첫 기록을 남겨볼까요?</p>
        <p className="mt-3 break-keep text-[14.5px] leading-[1.8] text-ink-2">
          오늘 한 집안일을 한 문장으로 남겨두면,
          <br />
          다음에 챙길 때가 됐을 때 알려드릴게요.
        </p>
      </div>

      <div className="mt-7 px-1">
        <p className="text-12.5 tracking-[.06em] text-ink-3">이렇게 말해보세요</p>

        <ul className="mt-3 flex flex-col gap-2.5">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => onExampleTap?.(example)}
                className="w-full rounded-md border border-line bg-card px-[18px] py-[15px] text-left text-15 text-ink-2 active:bg-surface-alt"
              >
                “{example}”
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
