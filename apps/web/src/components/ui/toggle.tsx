import { cn } from '@/lib/cn';

/** 설계의 토글 — 켜지면 세이지, 꺼지면 회색. */
export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cn(
        'flex h-7 w-12 items-center rounded-[14px] px-[3px] transition-colors',
        on ? 'justify-end bg-sage' : 'justify-start bg-line-muted',
      )}
    >
      <span className="block h-[22px] w-[22px] rounded-full bg-white" />
    </button>
  );
}
