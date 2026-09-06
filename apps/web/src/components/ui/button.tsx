import { forwardRef } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-action text-white active:bg-action-pressed disabled:bg-line-muted',
  secondary: 'bg-surface text-ink border border-line active:bg-surface-alt',
  ghost: 'bg-transparent text-ink-secondary active:bg-surface-alt',
  danger: 'bg-transparent text-danger active:bg-surface-alt',
};

const SIZES: Record<Size, string> = {
  md: 'h-11 px-4 text-[15px] rounded-md',
  lg: 'h-[52px] px-5 text-[17px] rounded-lg',
};

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    />
  );
});
