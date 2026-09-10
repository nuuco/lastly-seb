'use client';

import type { Item, LogEntry } from '@lastly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { CadenceSheet } from '@/features/capture/components/cadence-sheet';

import { DeleteSheet } from './components/delete-sheet';
import { SnoozeSheet } from './components/snooze-sheet';
import { putDeletedNotice } from './deleted-notice';
import { itemsApi } from '@/lib/api/items';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/cn';
import {
  describeCadence,
  formatFullDate,
  formatLogDate,
  formatShortDate,
  todayIso,
} from '@/lib/date';

import { LogEditSheet } from './components/log-edit-sheet';

interface ItemDetailScreenProps {
  itemId: string;
  initialItem: Item | null;
  initialLogs: LogEntry[] | null;
}

/** 설계 11 / 11-B / 14-B. */
export function ItemDetailScreen({ itemId, initialItem, initialLogs }: ItemDetailScreenProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const fromNotification = useSearchParams().get('from') === 'notification';

  const [cadenceOpen, setCadenceOpen] = useState(false);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const item = useQuery({
    queryKey: queryKeys.item(itemId),
    queryFn: () => itemsApi.get(itemId),
    initialData: initialItem ?? undefined,
  });

  const logs = useQuery({
    queryKey: queryKeys.logs(itemId),
    queryFn: () => itemsApi.logs(itemId),
    initialData: initialLogs ?? undefined,
  });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.item(itemId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.logs(itemId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.home }),
    ]);

  const complete = useMutation({
    mutationFn: () => itemsApi.complete(itemId),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => itemsApi.remove(itemId),
    onSuccess: async () => {
      // 지운 항목의 상세에 머물면 "오늘 했어요" 로 다시 기록할 수 있다.
      // 곧바로 홈으로 보내고 되돌리기는 거기서 띄운다.
      putDeletedNotice({ id: itemId, name: item.data?.name ?? '항목' });
      setDeleteOpen(false);
      await invalidate();
      router.replace('/');
    },
  });

  const snooze = useMutation({
    mutationFn: (until: string | null) => itemsApi.update(itemId, { snoozedUntil: until }),
    onSuccess: async () => {
      await invalidate();
      setCadenceOpen(false);
    },
  });

  if (item.isPending) return <div className="safe-top px-6 pt-4" aria-busy />;
  if (item.isError) {
    return <p className="px-6 pt-20 text-center text-ink-2">항목을 찾을 수 없어요.</p>;
  }

  const data = item.data;
  const editingLog = logs.data?.find((log) => log.id === editingLogId) ?? null;

  const nextLabel = data.snoozedUntil
    ? `${formatShortDate(data.snoozedUntil)}에 다시`
    : data.nextDueOn
      ? `${dueLabel(data.daysUntilDue)} · ${formatShortDate(data.nextDueOn)}`
      : '—';

  return (
    <main className="min-h-dvh pb-[120px]">
      <div className="safe-top px-6 pt-4">
        <div className="flex items-center justify-between px-1">
          <Link href="/" aria-label="뒤로" className="py-1">
            <span className="block h-[9px] w-[9px] rotate-45 border-b-[1.8px] border-l-[1.8px] border-ink-2" />
          </Link>
          {fromNotification ? (
            <span className="text-12 text-ink-3">알림에서 열림</span>
          ) : (
            <span className="text-14 text-ink-3">편집</span>
          )}
        </div>

        {/* 경과일을 화면 한가운데 크게 두는 것이 이 앱의 주장이다. */}
        <div className="mt-[18px] text-center">
          <p className="mt-3.5 text-18 font-semibold text-ink">{data.name}</p>

          <p className="mt-2.5 text-[64px] font-bold leading-none tracking-[-.05em] tabular-nums text-ink">
            {data.daysSinceLastDone ?? '—'}
            <span className="ml-1.5 text-[22px] font-semibold tracking-[-.02em]">일 전</span>
          </p>

          <p className="mt-2.5 text-14 text-ink-2">
            {data.lastDoneOn
              ? `마지막으로 한 날 · ${formatFullDate(data.lastDoneOn)}`
              : '아직 기록이 없어요'}
          </p>
        </div>

        <div className="mt-[18px] flex gap-2">
          <div
            className={cn(
              'flex-1 rounded-row px-4 py-3.5',
              data.snoozedUntil ? 'border border-line bg-card' : 'bg-sage-soft',
            )}
          >
            <p className="text-12 text-ink-3">{data.snoozedUntil ? '쉬는 중' : '다음 예정일'}</p>
            {/**
             * 한 줄로 붙잡는다. 설계의 "2일 후 · 9월 8일" 은 짧지만 실제 값은
             * "14일 후 · 9월 24일" 처럼 길어져 카드 폭을 넘고 두 줄로 깨진다.
             * 자간을 좁히고 넘칠 때만 크기를 한 단계 내린다.
             */}
            <p
              className={cn(
                'mt-1 whitespace-nowrap font-bold tracking-t3',
                nextLabel.length > 12 ? 'text-[14.5px]' : 'text-16',
                data.snoozedUntil ? 'text-ink-3' : 'text-accent-ink',
              )}
            >
              {nextLabel}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setCadenceOpen(true)}
            className="flex-1 rounded-row border border-line bg-card px-4 py-3.5 text-left"
          >
            <p className="text-12 text-ink-3">관리 주기</p>
            <p className="mt-1 text-16 font-bold text-ink">{describeCadence(data.cadence)}</p>
          </button>
        </div>

        <section className="mt-5">
          <h2 className="mb-2 px-1 text-12.5 tracking-[.06em] text-ink-3">지난 기록</h2>

          {logs.data?.length ? (
            <ul className="flex flex-col">
              {logs.data.map((log, i) => (
                <li key={log.id}>
                  <button
                    type="button"
                    onClick={() => setEditingLogId(log.id)}
                    className="flex w-full items-start gap-3.5 border-b border-line px-1 py-[13px] text-left"
                  >
                    {/* 가장 최근 기록만 짚어 준다. */}
                    <span
                      className={cn(
                        'mt-1.5 block h-[7px] w-[7px] shrink-0 rounded-full',
                        i === 0 ? 'bg-sage' : 'bg-rule',
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2.5">
                        <span className="flex-1 text-15 font-medium text-ink">
                          {formatLogDate(log.doneOn)}
                        </span>
                        <span className="text-13 text-ink-3">
                          {log.gapDays !== null ? `${log.gapDays}일 만에` : '첫 기록'}
                        </span>
                      </span>
                      {/**
                       * 메모 — 설계 11. 없으면 "메모 없음" 을 흐리게 남긴다.
                       * 줄을 비우면 기록마다 높이가 달라져 목록이 들쭉날쭉해진다.
                       */}
                      <span
                        className={cn(
                          'mt-1 block text-13 leading-[1.5]',
                          log.note ? 'text-ink-2' : 'text-ink-3',
                        )}
                      >
                        {log.note ? `“${log.note}”` : '메모 없음'}
                      </span>
                    </span>
                    <span className="mt-2 block h-1.5 w-1.5 shrink-0 rotate-45 border-r-[1.5px] border-t-[1.5px] border-ink-disabled" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 py-6 text-center text-14 text-ink-3">아직 기록이 없어요</p>
          )}
        </section>

        <div className="mt-3.5 flex gap-2">
          <MinorAction onClick={() => setCadenceOpen(true)}>주기 수정</MinorAction>
          {/* 주기 수정과 다른 일이다. 리듬은 그대로 두고 다음 차례만 미룬다. */}
          <MinorAction onClick={() => setSnoozeOpen(true)}>잠시 쉬어가기</MinorAction>
          <MinorAction danger onClick={() => setDeleteOpen(true)}>
            삭제
          </MinorAction>
        </div>
      </div>

      <div className="safe-bottom fixed inset-x-0 bottom-0 mx-auto w-full max-w-[430px] bg-[linear-gradient(180deg,rgba(245,242,236,0),var(--lastly-paper)_34%)] px-6 pb-[26px] pt-2.5">
        <button
          type="button"
          disabled={complete.isPending}
          onClick={() => complete.mutate()}
          className="flex h-[58px] w-full items-center justify-center rounded-lg bg-action text-17 font-semibold text-white shadow-action active:bg-action-pressed disabled:opacity-60"
        >
          {complete.isPending ? '기록하는 중…' : '오늘 했어요'}
        </button>
      </div>

      {cadenceOpen ? (
        <CadenceSheet
          open
          itemName={data.name}
          doneOn={data.lastDoneOn ?? todayIso()}
          value={data.cadence}
          onChange={async (rule) => {
            await itemsApi.update(itemId, { cadence: rule, cadenceSource: 'user' });
            await invalidate();
            setCadenceOpen(false);
          }}
          onClose={() => setCadenceOpen(false)}
        />
      ) : null}

      {snoozeOpen ? (
        <SnoozeSheet
          snoozedUntil={data.snoozedUntil}
          onPick={(until) => {
            snooze.mutate(until);
            setSnoozeOpen(false);
          }}
          onClose={() => setSnoozeOpen(false)}
        />
      ) : null}

      {deleteOpen ? (
        <DeleteSheet
          item={data}
          logs={logs.data ?? []}
          deleting={remove.isPending}
          onConfirm={() => remove.mutate()}
          onCancel={() => setDeleteOpen(false)}
        />
      ) : null}

      {editingLog ? (
        <LogEditSheet
          log={editingLog}
          itemName={data.name}
          onClose={() => setEditingLogId(null)}
          onSaved={async () => {
            await invalidate();
            setEditingLogId(null);
          }}
        />
      ) : null}
    </main>
  );
}

function MinorAction({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-xl border border-line bg-card py-3 text-center text-[13.5px] font-semibold',
        danger ? 'text-danger' : 'text-ink-2',
      )}
    >
      {children}
    </button>
  );
}

function dueLabel(daysUntilDue: number | null): string {
  if (daysUntilDue === null) return '—';
  if (daysUntilDue < 0) return `${Math.abs(daysUntilDue)}일 지남`;
  if (daysUntilDue === 0) return '오늘';
  return `${daysUntilDue}일 후`;
}
