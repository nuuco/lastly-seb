import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'due' | 'overdue' | 'calm';

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface-alt text-ink-secondary',
  due: 'bg-accent-soft text-accent-ink',
  overdue: 'bg-warning-soft text-warning',
  calm: 'bg-surface-alt text-ink-disabled',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-sm px-2 py-1 text-[13px] font-semibold tabular-nums',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
