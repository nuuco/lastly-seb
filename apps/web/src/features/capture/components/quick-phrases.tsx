'use client';

/**
 * 입력창 위 문장 칩 — 설계 06.
 *
 * 개정 설계에서 "자주 쓰는 문장" 라벨이 빠졌다. 칩만 한 줄로 놓인다.
 * 라벨이 없어도 눌러보면 아는 것이고, 키보드가 올라온 좁은 화면에서
 * 한 줄을 설명에 쓰는 건 아까운 자리다.
 *
 * 줄바꿈하지 않고 옆으로 흐른다. 두 줄이 되면 키보드를 밀어 올려
 * 입력창이 가려진다.
 */
interface QuickPhrasesProps {
  phrases: string[];
  onPick: (phrase: string) => void;
}

export function QuickPhrases({ phrases, onPick }: QuickPhrasesProps) {
  if (phrases.length === 0) return null;

  return (
    <div className="scrollbar-none mb-3 flex gap-2 overflow-x-auto">
      {phrases.map((phrase) => (
        <button
          key={phrase}
          type="button"
          // 포커스가 입력창을 떠나면 칩이 사라져 탭이 먹지 않는다. blur 전에 가로챈다.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(phrase)}
          className="shrink-0 whitespace-nowrap rounded-full border border-line bg-white/[.92] px-3.5 py-2 text-13.5 font-medium text-ink-2 shadow-chip active:bg-surface-alt"
        >
          {phrase}
        </button>
      ))}
    </div>
  );
}
