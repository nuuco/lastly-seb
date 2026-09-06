'use client';

import type { LogEntry } from '@lastly/contracts';
import { useState } from 'react';

import { Sheet, SheetActions } from '@/components/ui/sheet';
import { itemsApi } from '@/lib/api/items';
import { formatLogDate } from '@/lib/date';

interface LogEditSheetProps {
  log: LogEntry;
  itemName: string;
  onClose: () => void;
  onSaved: () => void;
}

/** 설계 11-B — 지난 기록의 날짜·메모 수정, 삭제. */
export function LogEditSheet({ log, itemName, onClose, onSaved }: LogEditSheetProps) {
  const [doneOn, setDoneOn] = useState(log.doneOn);
  const [note, setNote] = useState(log.note ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await itemsApi.updateLog(log.id, { doneOn, note: note.trim() || null });
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirm('이 기록을 삭제할까요?')) return;
    setBusy(true);
    try {
      await itemsApi.removeLog(log.id);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} label="기록 수정">
      <p className="text-13 text-ink-3">{itemName} · 지난 기록</p>
      <h2 className="mt-1.5 text-[20px] font-bold tracking-[-.03em] text-ink">
        {formatLogDate(log.doneOn)} 기록
      </h2>

      {log.gapDays !== null ? (
        <p className="mt-1.5 text-[13.5px] text-ink-3">
          직전 기록에서 {log.gapDays}일 만이었어요
        </p>
      ) : null}

      <label className="mt-5 block">
        <span className="block text-12.5 tracking-wide4 text-ink-3">한 날짜</span>
        <input
          type="date"
          value={doneOn}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setDoneOn(e.target.value)}
          className="mt-2 h-[52px] w-full rounded-row border border-line bg-card px-[18px] text-16 text-ink outline-none focus:border-accent"
        />
      </label>

      <label className="mt-[18px] block">
        <span className="block text-12.5 tracking-wide4 text-ink-3">메모</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="없음"
          maxLength={200}
          className="mt-2 h-[52px] w-full rounded-row border border-line bg-card px-[18px] text-16 text-ink outline-none placeholder:text-ink-3 focus:border-accent"
        />
      </label>

      <p className="mt-5 text-[13.5px] leading-[1.7] text-ink-3">
        날짜를 바꾸면 다음 알림 예정일도 함께 조정돼요.
      </p>

      <SheetActions
        primary={{ label: busy ? '저장하는 중…' : '저장하기', onClick: save, disabled: busy }}
      />

      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className="mt-2.5 flex h-[52px] w-full items-center justify-center rounded-lg text-15.5 font-semibold text-danger disabled:opacity-60"
      >
        이 기록 삭제
      </button>
    </Sheet>
  );
}
