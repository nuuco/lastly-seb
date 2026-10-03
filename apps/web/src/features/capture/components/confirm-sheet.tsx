'use client';

import type { CadenceRule, HomeFeed, InterpretResult } from '@lastly/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Chevron, Sheet, SheetActions, SheetError, SheetHeader, SheetRow } from '@/components/ui/sheet';
import { useSpokenConfirm } from '@/features/on-device/use-spoken-confirm';
import { captureApi } from '@/lib/api/capture';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/cn';
import { describeCadence, formatShortDate, nextDueAfter, ruleToDays, todayIso } from '@/lib/date';

import { CadenceSheet } from './cadence-sheet';

interface ConfirmSheetProps {
  open: boolean;
  result: InterpretResult;
  cadence: CadenceRule | null;
  /** 이 주기를 사용자가 정했는지. 말로 했거나 주기 시트에서 고른 경우다. */
  cadenceFixed: boolean;
  onCadenceChange: (rule: CadenceRule) => void;
  onConfirm: (input: {
    itemId?: string;
    newItemName?: string;
    note?: string | null;
    cadence?: CadenceRule;
    doneOn?: string;
    announce?: boolean;
  }) => void;
  onRetry: () => void;
  /** 취소 버튼·음성 "아니" — 저장하지 않고 시트만 닫는다. */
  onCancel?: () => void;
  committing: boolean;
  /** 저장이 거절된 이유. 있으면 응/아니 듣기를 다시 켜지 않는다. */
  error?: string | null;
  mode?: 'voice' | 'text';
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
  cadenceFixed,
  onCadenceChange,
  onConfirm,
  onRetry,
  onCancel,
  committing,
  error = null,
  mode = 'text',
}: ConfirmSheetProps) {
  const [cadenceOpen, setCadenceOpen] = useState(false);
  const [name, setName] = useState(result.normalizedName ?? '');
  const [note, setNote] = useState('');
  /** 한 날짜 — 설계 08/09 의 꺾쇠 줄. 말로 들은 날짜에서 시작해 기기 달력으로 고친다. */
  const [doneOn, setDoneOn] = useState(result.doneOn);

  /**
   * 오늘은 서버가 본 날짜를 쓴다. 서버가 미래 날짜를 거절하므로 기기 시계와 어긋나면
   * 화면에서는 고를 수 있는데 저장이 막히는 날이 생긴다.
   */
  const feed = useQueryClient().getQueryData<HomeFeed>(queryKeys.home);
  const today = feed?.today ?? todayIso();

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

  /**
   * 사용자가 정해 둔 주기는 함께 보낸다. 서버가 그걸 최우선으로 두므로
   * 이름만 고쳤다고 사전값으로 덮이지 않는다.
   */
  const fixedDays = cadenceFixed && cadence ? ruleToDays(cadence) : null;

  const preview = useQuery({
    queryKey: ['cadence-preview', edited, doneOn, fixedDays],
    queryFn: () =>
      captureApi.previewCadence({
        name: edited!,
        doneOn,
        statedCadenceDays: fixedDays,
      }),
    enabled: Boolean(edited),
  });

  // 이름을 고쳤으면 그 이름의 주기를 쓴다. 되돌리면 처음 받은 것으로 돌아온다.
  const shown = edited ? (preview.data?.cadence ?? null) : result.cadence;
  const checking = Boolean(edited) && preview.isPending;
  const matchedId = edited ? (preview.data?.matchedItemId ?? null) : result.matchedItemId;
  const isNew = matchedId === null;
  // 사용자가 주기 시트에서 직접 고른 값이 언제나 우선한다.
  const shownRule = edited ? (shown?.rule ?? null) : cadence;

  /**
   * 다음 예정일은 저장 뒤 실제로 잡힐 날을 보인다.
   * DB 는 가장 최근 기록에서 다음 날을 센다. 기존 항목에 더 최근 기록이 있으면
   * 지난 날짜를 더해도 예정일은 그대로다.
   */
  const lastDoneOn = isNew ? null : findLastDoneOn(feed, matchedId);
  const keepsSchedule = lastDoneOn !== null && lastDoneOn > doneOn;
  const nextDueOn = shownRule ? nextDueAfter(keepsSchedule ? lastDoneOn : doneOn, shownRule) : null;

  const confirmPayload = {
    ...(isNew
      ? { newItemName: name.trim(), cadence: shownRule ?? undefined }
      : { itemId: matchedId ?? undefined }),
    note: note.trim() || null,
    doneOn,
  };
  const rationaleText = keepsSchedule
    ? '더 최근 기록이 있어 다음 알림은 그대로예요.'
    : edited
      ? '이름을 고치면 주기를 다시 맞춰드려요. 이미 쓰던 항목이면 원래 주기로 돌아와요.'
      : (shown?.rationale ?? '');

  const stopListening = useSpokenConfirm({
    // 저장이 거절된 뒤 다시 켜면 같은 질문을 또 읽고, 응 하면 같은 거절이 되풀이된다.
    enabled:
      open && mode === 'voice' && !committing && !error && !cadenceOpen && Boolean(name.trim()),
    // 입력 중인 이름을 따라가지 않는다. 바뀔 때마다 처음부터 다시 읽는다.
    prompt: `${result.normalizedName || '이 일'}, ${dayLabel(result.doneOn)}로 기록할까요?`,
    onYes: () => onConfirm({ ...confirmPayload, announce: true }),
    onNo: () => (onCancel ?? onRetry)(),
  });

  return (
    <>
      <Sheet open={open} onClose={onRetry} dismissible={false} label="기록 확인">
        {/*
         * 배경 탭으로는 닫지 않는다(방금 말한 것을 실수로 잃지 않게). 대신 저장도 다시 말하기도
         * 아닌 "그만두기" 는 이 버튼으로 연다. 되묻기 시트와 같은 자리·모양이다.
         */}
        <SheetHeader
          title="기록 확인"
          onCancel={() => {
            stopListening();
            (onCancel ?? onRetry)();
          }}
          disabled={committing}
          className="mb-[22px]"
        />
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
          {/* 줄 전체를 덮은 투명한 날짜 입력. 누르면 기기 달력이 열린다. */}
          <label className="relative flex w-full items-center justify-between border-b border-line py-4">
            <span className="text-[13.5px] text-ink-3">한 날짜</span>
            <span className="flex items-center gap-2.5 text-[16.5px] font-semibold tracking-[-.02em] text-ink">
              {`${dayLabel(doneOn)} · ${formatShortDate(doneOn)}`}
              <Chevron />
            </span>
            <input
              type="date"
              value={doneOn}
              max={today}
              aria-label="한 날짜"
              disabled={committing}
              // 화면을 만지면 응/아니 듣기를 끝낸다. 고른 뒤 "응" 이 바뀌기 전 질문에 답이 되지 않게.
              onPointerDown={stopListening}
              onFocus={stopListening}
              onChange={(e) => {
                const next = e.target.value;
                // 지우기 버튼으로 빈 값이 오거나, max 를 무시하는 브라우저에서 미래가 올 수 있다.
                if (next && next <= today) setDoneOn(next);
              }}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            />
          </label>
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
                shownRule && nextDueOn
                  ? `${describeCadence(shownRule)} · 다음 ${formatShortDate(nextDueOn)}`
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

        {rationaleText ? (
          <div className="mt-1 space-y-1 text-[13.5px] leading-[1.7] text-ink-3">
            <p>{rationaleText}</p>
          </div>
        ) : null}

        <SheetError message={error} className="mt-3" />

        <SheetActions
          primary={{
            label: committing ? '저장하는 중…' : '이대로 저장하기',
            disabled: committing || !name.trim(),
            // 누른 순간 응/아니 듣기를 끝낸다. 남아 있으면 같은 저장이 한 번 더 나간다.
            onClick: () => {
              stopListening();
              onConfirm(confirmPayload);
            },
          }}
          secondary={{
            label: '다시 말하기',
            // 응/아니 듣기를 먼저 끝내야 같은 틱에 켜는 새 음성 인식이 마이크를 잡는다.
            onClick: () => {
              stopListening();
              onRetry();
            },
            disabled: committing,
          }}
        />
      </Sheet>

      {cadenceOpen && cadence ? (
        <CadenceSheet
          open
          itemName={name}
          transcript={result.transcript}
          doneOn={doneOn}
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

/** 홈 피드에서 그 항목의 마지막 기록일. 피드가 없거나 항목이 없으면 null. */
function findLastDoneOn(feed: HomeFeed | undefined, itemId: string | null): string | null {
  if (!feed || !itemId) return null;
  const item = [...feed.due, ...feed.upcoming, ...feed.later].find((i) => i.id === itemId);
  return item?.lastDoneOn ?? null;
}

/**
 * toISOString 은 UTC 를 준다. 한국 시각으로 자정이 지나면 하루가 어긋나
 * "-1일 전" 같은 값이 나온다. 화면에 보이는 날짜는 늘 사용자의 지역 날짜여야 한다.
 */
function dayLabel(iso: string): string {
  const today = todayIso();
  if (iso === today) return '오늘';

  const diff = Math.round((Date.parse(today) - Date.parse(iso)) / 86_400_000);
  if (diff === 1) return '어제';
  if (diff === 2) return '그저께';
  // 서버와 기기의 시각이 어긋나 미래로 나오는 경우를 방어한다.
  if (diff < 0) return '오늘';
  return `${diff}일 전`;
}
