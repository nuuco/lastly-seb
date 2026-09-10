'use client';

import type { CadenceRule, InterpretResult } from '@lastly/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Sheet, SheetActions, SheetRow } from '@/components/ui/sheet';
import { captureApi } from '@/lib/api/capture';
import { cn } from '@/lib/cn';
import { describeCadence, formatShortDate } from '@/lib/date';

import { CadenceSheet } from './cadence-sheet';

interface ConfirmSheetProps {
  open: boolean;
  result: InterpretResult;
  cadence: CadenceRule | null;
  onCadenceChange: (rule: CadenceRule) => void;
  onConfirm: (input: { itemId?: string; newItemName?: string; note?: string | null }) => void;
  onRetry: () => void;
  committing: boolean;
}

/**
 * 설계 08(기존 항목) / 09(새 항목) 통합 바텀시트.
 *
 * 구조가 같고 배지 모양과 안내 문구만 다르다.
 * 기존 항목은 테두리만 두른 배지, 새 항목은 꽉 찬 배지로 구분한다 — 설계 08/09.
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
  const [note, setNote] = useState('');

  /**
   * 이름을 고치면 주기를 다시 맞춘다 — 설계 08-B.
   *
   * 이름이 바뀌면 다른 일이 된 것이므로 앞서 받은 주기가 더 이상 맞지 않는다.
   * 한 글자마다 물으면 AI 를 그만큼 부르므로 0.5초 쉬었다 묻는다.
   */
  const original = result.normalizedName ?? '';
  const [edited, setEdited] = useState<string | null>(null);

  useEffect(() => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === original) {
      setEdited(null);
      return;
    }
    const timer = setTimeout(() => setEdited(trimmed), 500);
    return () => clearTimeout(timer);
  }, [name, original]);

  const preview = useQuery({
    queryKey: ['cadence-preview', edited, result.doneOn],
    queryFn: () => captureApi.previewCadence({ name: edited!, doneOn: result.doneOn }),
    enabled: Boolean(edited),
  });

  // 이름을 고쳤으면 그 이름의 주기를 쓴다. 되돌리면 처음 받은 것으로 돌아온다.
  const shown = edited ? (preview.data?.cadence ?? null) : result.cadence;
  const checking = Boolean(edited) && preview.isPending;
  const matchedId = edited ? (preview.data?.matchedItemId ?? null) : result.matchedItemId;
  const isNew = matchedId === null;
  // 사용자가 주기 시트에서 직접 고른 값이 언제나 우선한다.
  const shownRule = edited ? (shown?.rule ?? null) : cadence;

  return (
    <>
      <Sheet open={open} onClose={onRetry} dismissible={false} label="기록 확인">
        <p className="text-13 text-ink-3">이렇게 들었어요</p>
        <p className="mt-2 text-18 font-semibold tracking-[-.02em] text-ink-2">
          “{result.transcript}”
        </p>

        <div
          className={cn(
            'mt-4 flex items-center gap-2.5 rounded-md border-[1.5px] bg-card px-4 py-[13px]',
            // 고치는 중임을 테두리로 알린다 — 설계 08-B.
            edited ? 'border-action' : 'border-line',
          )}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="항목 이름"
            className="min-w-0 flex-1 bg-transparent text-[22px] font-bold tracking-t3 text-ink outline-none"
          />
          <span
            className={cn(
              'shrink-0 rounded-[9px] px-[11px] py-1.5 text-12.5 font-bold',
              isNew ? 'bg-action text-white' : 'border border-line text-ink-2',
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
          {checking ? (
            <div className="flex items-center justify-between py-4">
              <span className="text-12.5 font-bold tracking-wide2 text-ink-3">관리 주기</span>
              <span className="flex items-center gap-[9px] text-[16.5px] font-semibold tracking-t2 text-ink-3">
                <span
                  className="block h-[15px] w-[15px] animate-spin rounded-full border-2 border-line-2 border-t-action"
                  aria-hidden
                />
                주기 확인 중…
              </span>
            </div>
          ) : (
            <SheetRow
              label="관리 주기"
              value={
                shownRule
                  ? `${describeCadence(shownRule)} · 다음 ${shown ? formatShortDate(shown.nextDueOn) : '—'}`
                  : '설정 안 됨'
              }
              onClick={() => setCadenceOpen(true)}
            />
          )}

          {/**
           * 메모 — 설계 08/09 에 새로 생겼다.
           * "섬유유연제 새로 개봉" 처럼 다음에 할 때 알면 좋을 것을 적는 자리다.
           * 나중에 항목 상세의 지난 기록과 검색(05-D)에서 이 글이 다시 보인다.
           */}
          <div className="py-3.5">
            <label htmlFor="capture-note" className="text-12.5 font-bold tracking-wide2 text-ink-3">
              메모 (선택)
            </label>
            <div className="mt-2 rounded-soft border border-line bg-card px-3.5 py-3">
              <input
                id="capture-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="다음에 할 때 알면 좋을 것"
                className="w-full bg-transparent text-[15.5px] font-medium tracking-t2 text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
              />
            </div>
          </div>
        </div>

        <p className="mt-3 text-[13.5px] leading-[1.7] text-ink-3">
          {edited
            ? '이름을 고치면 주기를 다시 맞춰드려요. 이미 쓰던 항목이면 원래 주기로 돌아와요.'
            : (shown?.rationale ?? '')}
        </p>

        <SheetActions
          primary={{
            label: committing ? '저장하는 중…' : '이대로 저장하기',
            disabled: committing || !name.trim(),
            onClick: () =>
              onConfirm({
                ...(isNew ? { newItemName: name.trim() } : { itemId: matchedId ?? undefined }),
                note: note.trim() || null,
              }),
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
