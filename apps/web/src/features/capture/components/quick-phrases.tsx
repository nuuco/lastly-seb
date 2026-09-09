'use client';

/**
 * 입력창 위 "자주 쓰는 문장" 칩 — 설계 06.
 *
 * 설계에는 문장 세 개가 박혀 있지만 그대로 두면 목업이 된다.
 * 실제로 자주 하는 일에서 뽑아야 누를 이유가 생긴다.
 */
interface QuickPhrasesProps {
  phrases: string[];
  onPick: (phrase: string) => void;
}

export function QuickPhrases({ phrases, onPick }: QuickPhrasesProps) {
  if (phrases.length === 0) return null;

  return (
    <div className="mb-3 px-1">
      <div className="mb-2.5 text-12.5 tracking-[.06em] text-ink-3">자주 쓰는 문장</div>
      <div className="flex flex-wrap gap-2">
        {phrases.map((phrase) => (
          <button
            key={phrase}
            type="button"
            // 포커스가 입력창을 떠나면 칩이 사라져 탭이 먹지 않는다. blur 전에 가로챈다.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onPick(phrase)}
            className="rounded-full border border-line bg-card px-[15px] py-[9px] text-sm text-ink-2 transition-colors active:bg-line/40"
          >
            {phrase}
          </button>
        ))}
      </div>
    </div>
  );
}
