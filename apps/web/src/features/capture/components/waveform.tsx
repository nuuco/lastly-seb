import { cn } from '@/lib/cn';

/**
 * 음성 입력 중임을 알리는 파형.
 *
 * 막대의 높이·색·지연시간은 설계 07에 그려진 값을 그대로 옮겼다.
 * 규칙적으로 생성하면 기계적으로 보여서, 불규칙한 원본을 유지한다.
 */
const BARS = [
  { h: 12, tone: 1, delay: 0 },
  { h: 22, tone: 2, delay: 0.1 },
  { h: 30, tone: 3, delay: 0.2 },
  { h: 18, tone: 2, delay: 0.05 },
  { h: 26, tone: 3, delay: 0.25 },
  { h: 14, tone: 1, delay: 0.15 },
  { h: 22, tone: 2, delay: 0.3 },
  { h: 10, tone: 1, delay: 0.12 },
  { h: 24, tone: 2, delay: 0.22 },
  { h: 16, tone: 1, delay: 0.07 },
] as const;

const TONE = { 1: 'bg-wave-1', 2: 'bg-wave-2', 3: 'bg-wave-3' } as const;

/** scale은 입력창 안에 들어갈 때처럼 좁은 자리에 맞추기 위한 축소 비율. */
export function Waveform({ scale = 1, className }: { scale?: number; className?: string }) {
  return (
    <div
      className={cn('flex shrink-0 items-center gap-[5px]', className)}
      style={{ height: 30 * scale }}
      aria-hidden
    >
      {BARS.map((bar, i) => (
        <span
          key={i}
          className={cn('block w-[3px] animate-wv rounded-[2px]', TONE[bar.tone])}
          style={{ height: bar.h * scale, animationDelay: `${bar.delay}s` }}
        />
      ))}
    </div>
  );
}
