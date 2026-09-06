/**
 * 기록이 하나도 없을 때 — 설계 04.
 * 점선 테두리와 반투명 흰 면으로 "아직 비어 있다"를 형태로 말한다.
 */
const EXAMPLES = [
  '오늘 이불 빨았어',
  '어제 정수기 필터 갈았어',
  '지난주에 화분에 물 줬어',
] as const;

export function EmptyState({ onExampleTap }: { onExampleTap?: (text: string) => void }) {
  return (
    <div>
      <div className="mt-8 rounded-[30px] border-[1.5px] border-dashed border-line bg-white/70 px-6 py-9 text-center">
        <p className="text-19 font-bold tracking-[-.02em] text-ink">아직 기록이 없어요</p>
        <p className="mt-2.5 text-14 leading-[1.75] text-ink-2">
          아래 마이크를 누르고 오늘 한 일을 말해보세요.
          <br />
          항목과 날짜는 알아서 정리해드려요.
        </p>
      </div>

      <div className="mt-7 px-1">
        <p className="text-12.5 font-bold tracking-wide2 text-accent-ink">이렇게 말해보세요</p>

        <ul className="mt-3 flex flex-col gap-2">
          {EXAMPLES.map((example) => (
            <li key={example}>
              <button
                type="button"
                onClick={() => onExampleTap?.(example)}
                className="w-full rounded-row border border-line bg-card px-4 py-3.5 text-left text-15 text-ink-2 shadow-card active:bg-surface-alt"
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
