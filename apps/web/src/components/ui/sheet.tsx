'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** 확인 시트처럼 사용자가 반드시 선택해야 하면 배경 탭으로 닫지 않는다. */
  dismissible?: boolean;
  label: string;
}

/**
 * 열려 있는 시트 수. 확인 시트 위에 주기 시트가 겹치는 경우가 있어서,
 * 각자 이전 값을 기억했다 되돌리면 마지막 하나가 'hidden'을 되돌려 놓는다.
 * 마지막 시트가 닫힐 때만 잠금을 푼다.
 */
let openSheets = 0;

function lockBodyScroll(): () => void {
  if (openSheets === 0) document.body.style.overflow = 'hidden';
  openSheets += 1;

  return () => {
    openSheets = Math.max(0, openSheets - 1);
    if (openSheets === 0) document.body.style.overflow = '';
  };
}

/**
 * 하단 바텀시트 — 설계 08/09/10/11-B/13-B 공통.
 *
 * 배경을 어둡게 덮고, 시트 자체는 반투명 지면색에 blur를 걸어
 * 뒤에 있는 목록이 비쳐 보이게 한다. 맥락을 잃지 않게 하려는 장치다.
 */
export function Sheet({ open, onClose, children, dismissible = true, label }: SheetProps) {
  // onClose는 렌더마다 새 함수라 의존성에 넣으면 매 렌더 잠금이 풀렸다 걸린다.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible) closeRef.current();
    };

    document.addEventListener('keydown', onKey);
    const unlock = lockBodyScroll();

    return () => {
      document.removeEventListener('keydown', onKey);
      unlock();
    };
  }, [open, dismissible]);

  // 아래에서 올라오는 전환. 갑자기 나타나면 화면이 바뀐 걸 놓친다.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!open) return setShown(false);
    const raf = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className={cn(
          'absolute inset-0 bg-[rgba(45,38,34,.26)] transition-opacity duration-200',
          shown ? 'opacity-100' : 'opacity-0',
        )}
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={cn(
          'safe-bottom relative mx-auto max-h-[88dvh] w-full max-w-[430px] overflow-y-auto',
          'rounded-t-sheet bg-[rgba(251,249,244,.97)] px-[26px] pb-[26px] pt-3 shadow-topline',
          'backdrop-blur-[30px]',
          'transition-transform duration-250 ease-out motion-reduce:transition-none',
          shown ? 'translate-y-0' : 'translate-y-full',
        )}
      >
        <div className="mx-auto mb-5 h-[5px] w-11 rounded-[3px] bg-line-muted" aria-hidden />
        {children}
      </div>
    </div>
  );
}

/** 설계가 회전한 정사각형으로 그린 오른쪽 화살표. */
export function Chevron({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'block h-[7px] w-[7px] rotate-45 border-r-[1.7px] border-t-[1.7px] border-ink-3',
        className,
      )}
    />
  );
}

/** 시트 안의 항목 행 — 라벨과 값, 누를 수 있으면 화살표가 붙는다. */
export function SheetRow({
  label,
  value,
  onClick,
  divider,
}: {
  label: string;
  value: string;
  onClick?: () => void;
  divider?: boolean;
}) {
  const body = (
    <>
      <span className="text-[13.5px] text-ink-3">{label}</span>
      <span className="flex items-center gap-2.5 text-[16.5px] font-semibold tracking-[-.02em] text-ink">
        {value}
        {onClick ? <Chevron /> : null}
      </span>
    </>
  );

  const cls = cn(
    'flex w-full items-center justify-between py-4 text-left',
    divider && 'border-b border-line',
  );

  return onClick ? (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/** 시트 하단의 주/보조 버튼 한 쌍. */
export function SheetActions({
  primary,
  secondary,
}: {
  primary: { label: string; onClick: () => void; disabled?: boolean };
  secondary?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <>
      <button
        type="button"
        onClick={primary.onClick}
        disabled={primary.disabled}
        className="mt-[18px] flex h-[58px] w-full items-center justify-center rounded-lg bg-action text-17 font-semibold text-white shadow-action active:bg-action-pressed disabled:opacity-60"
      >
        {primary.label}
      </button>

      {secondary ? (
        <button
          type="button"
          onClick={secondary.onClick}
          disabled={secondary.disabled}
          className="mt-2.5 flex h-[52px] w-full items-center justify-center rounded-lg border border-line bg-card text-15.5 font-semibold text-ink-2 disabled:opacity-60"
        >
          {secondary.label}
        </button>
      ) : null}
    </>
  );
}
