'use client';

import type { CadenceRule, InterpretResult } from '@lastly/contracts';
import { useState } from 'react';

import { Sheet, SheetActions, SheetRow } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { describeCadence, formatShortDate } from '@/lib/date';

import { CadenceSheet } from './cadence-sheet';

interface ConfirmSheetProps {
  open: boolean;
  result: InterpretResult;
  cadence: CadenceRule | null;
  onCadenceChange: (rule: CadenceRule) => void;
  onConfirm: (input: { itemId?: string; newItemName?: string }) => void;
  onRetry: () => void;
  committing: boolean;
}

/**
 * 설계 08(기존 항목) / 09(새 항목) 통합 바텀시트.
 *
 * 구조가 같고 배지 색과 안내 문구만 다르다.
 * 기존 항목은 세이지(이미 알던 것), 새 항목은 앰버(처음 보는 것)로 구분한다.
 */
export function ConfirmSheet({
  open,
  result,
  cadence,
  onCadenceChange,
  onConfirm,
  onRetry,
  committing,
}: ConfirmSheetProps) {
  const [cadenceOpen, setCadenceOpen] = useState(false);
  const [name, setName] = useState(result.normalizedName ?? '');

  const isNew = result.outcome === 'new_item';

  return (
    <>
      <Sheet open={open} onClose={onRetry} dismissible={false} label="기록 확인">
        <p className="text-13 text-ink-3">이렇게 들었어요</p>
        <p className="mt-2 text-18 font-semibold tracking-[-.02em] text-ink-2">
          “{result.transcript}”
        </p>

        <div className="mt-4 flex items-center gap-2.5 rounded-[16px] border-[1.5px] border-line bg-card px-4 py-[13px]">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="항목 이름"
            className="min-w-0 flex-1 bg-transparent text-[22px] font-bold tracking-[-.03em] text-ink outline-none"
          />
          <span
            className={cn(
              'shrink-0 rounded-[9px] px-[11px] py-1.5 text-12.5 font-bold',
              isNew ? 'bg-accent-soft text-accent-ink' : 'bg-sage-soft text-sage-ink',
            )}
          >
            {isNew ? '새 항목' : '기존 항목'}
          </span>
        </div>

        <div className="mt-3 border-t border-line">
          <SheetRow
            label="한 날짜"
            value={`${dayLabel(result.doneOn)} · ${formatShortDate(result.doneOn)}`}
            divider
          />
          <SheetRow
            label="관리 주기"
            value={
              cadence
                ? `${describeCadence(cadence)} · 다음 ${result.cadence ? formatShortDate(result.cadence.nextDueOn) : '—'}`
                : '설정 안 됨'
            }
            onClick={() => setCadenceOpen(true)}
          />
        </div>

        {result.cadence ? (
          <p className="mt-3 text-[13.5px] leading-[1.7] text-ink-3">{result.cadence.rationale}</p>
        ) : null}

        <SheetActions
          primary={{
            label: committing ? '저장하는 중…' : '이대로 저장하기',
            disabled: committing || !name.trim(),
            onClick: () =>
              onConfirm(
                isNew ? { newItemName: name.trim() } : { itemId: result.matchedItemId ?? undefined },
              ),
          }}
          secondary={{ label: '다시 말하기', onClick: onRetry, disabled: committing }}
        />
      </Sheet>

      {cadenceOpen && cadence ? (
        <CadenceSheet
          open
          itemName={name}
          transcript={result.transcript}
          doneOn={result.doneOn}
          value={cadence}
          onChange={(rule) => {
            onCadenceChange(rule);
            setCadenceOpen(false);
          }}
          onClose={() => setCadenceOpen(false)}
        />
      ) : null}
    </>
  );
}

function dayLabel(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  if (iso === today) return '오늘';

  const diff = Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000);
  if (diff === 1) return '어제';
  if (diff === 2) return '그저께';
  return `${diff}일 전`;
}
