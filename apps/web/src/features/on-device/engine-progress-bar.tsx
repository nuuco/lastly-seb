import { engineProgressPercent, type EngineProgress } from '@/features/on-device/engine';
import { cn } from '@/lib/cn';

export function EngineProgressBar({
  progress,
  className = 'mt-2 h-1',
}: {
  progress: EngineProgress;
  className?: string;
}) {
  return (
    <span className={cn('relative block overflow-hidden rounded-[2px] bg-bar-track', className)}>
      <span
        className="absolute inset-y-0 left-0 block rounded-[2px] bg-sage"
        style={{ width: `${engineProgressPercent(progress)}%` }}
      />
    </span>
  );
}
