'use client';

import { useState } from 'react';

import { Sheet, SheetActions } from '@/components/ui/sheet';
import { ApiError } from '@/lib/api/client';
import { itemsApi } from '@/lib/api/items';
import { cn } from '@/lib/cn';

interface RenameSheetProps {
  itemId: string;
  name: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * 항목 이름 편집 — 설계 11 의 "편집".
 *
 * 이름만 바꾼다. 주기는 건드리지 않는다. 처음 기록할 때(08-B)와 달리
 * 이름을 고쳤다고 주기를 다시 고르면 사용자가 정한 주기가 사라진다.
 */
export function RenameSheet({ itemId, name, onClose, onSaved }: RenameSheetProps) {
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const next = value.trim();
  const unchanged = next === name || next.length === 0;

  const save = async () => {
    if (unchanged) return;
    setBusy(true);
    setError(null);
    try {
      await itemsApi.update(itemId, { name: next });
      onSaved();
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 409
          ? '같은 이름의 항목이 이미 있어요.'
          : '저장하지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} label="항목 편집">
      <p className="text-13 text-ink-3">{name} · 편집</p>
      <h2 className="mt-1.5 text-[20px] font-bold tracking-[-.03em] text-ink">이름 바꾸기</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label className="mt-5 block">
          <span className="block text-12.5 tracking-wide4 text-ink-3">이름</span>
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            maxLength={60}
            autoFocus
            enterKeyHint="done"
            className="mt-2 h-[52px] w-full rounded-row border border-line bg-card px-[18px] text-16 text-ink outline-none focus:border-accent"
          />
        </label>
      </form>

      <p className={cn('mt-5 text-[13.5px] leading-[1.7]', error ? 'text-danger' : 'text-ink-3')}>
        {error ?? '이름만 바뀌어요. 주기와 지난 기록은 그대로예요.'}
      </p>

      <SheetActions
        primary={{
          label: busy ? '저장하는 중…' : '저장하기',
          onClick: save,
          disabled: busy || unchanged,
        }}
      />
    </Sheet>
  );
}
