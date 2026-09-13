'use client';

import { todayIso } from '@/lib/date';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Chevron, Sheet } from '@/components/ui/sheet';
import { usePushSubscription } from '@/features/notifications/use-push-subscription';
import { profileApi } from '@/lib/api/profile';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/cn';
import { createClient } from '@/lib/supabase/client';

/** 설계 13 / 13-B. */
export default function SettingsPage() {
  const queryClient = useQueryClient();
  const push = usePushSubscription();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const settings = useQuery({
    queryKey: queryKeys.notificationSettings,
    queryFn: profileApi.notificationSettings,
  });

  const update = useMutation({
    mutationFn: profileApi.updateNotificationSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.notificationSettings }),
  });

  return (
    <main className="safe-top min-h-dvh px-6 pb-8 pt-6">
      <div className="flex items-center gap-3.5 px-1">
        <Link href="/" aria-label="뒤로" className="py-1">
          <span className="block h-[9px] w-[9px] rotate-45 border-b-[1.8px] border-l-[1.8px] border-ink-2" />
        </Link>
        <h1 className="text-16 font-semibold text-ink">설정</h1>
      </div>

      <SectionLabel>알림</SectionLabel>
      <Card>
        <Row divider>
          <div>
            <p className="text-15.5 font-semibold text-ink">알림 받을 시간</p>
            <p className="mt-[3px] text-12.5 text-ink-3">이 시간에 하루 한 번만 모아서</p>
          </div>
          <span className="flex items-center gap-2 text-15 font-semibold text-ink">
            <input
              type="time"
              value={settings.data?.digestTimeLocal ?? '09:00'}
              onChange={(e) => update.mutate({ digestTimeLocal: e.target.value })}
              aria-label="알림 받을 시간"
              className="bg-transparent text-right outline-none"
            />
            <Chevron className="border-[1.6px] border-b-0 border-l-0" />
          </span>
        </Row>

        <Row divider>
          <p className="text-15.5 font-semibold text-ink">알림 권한</p>
          {settings.data?.pushGranted ? (
            <span className="rounded-[9px] bg-sage-soft px-[11px] py-1.5 text-13 font-bold text-accent-ink">
              허용됨
            </span>
          ) : (
            <button
              type="button"
              onClick={() => push.subscribe()}
              className="rounded-[9px] bg-accent-soft px-[11px] py-1.5 text-13 font-bold text-accent-ink"
            >
              {push.status === 'requesting' ? '요청 중…' : '알림 켜기'}
            </button>
          )}
        </Row>

        <Row>
          <p className="text-15.5 font-semibold text-ink">주말에도 알림</p>
          <Toggle
            on={settings.data?.weekendEnabled ?? true}
            onChange={(on) => update.mutate({ weekendEnabled: on })}
            label="주말에도 알림"
          />
        </Row>
      </Card>

      {!push.isStandalone && push.status === 'unsupported' ? (
        <p className="mt-2.5 px-1 text-12.5 leading-[1.7] text-ink-3">
          알림을 받으려면 홈 화면에 추가해 주세요.{' '}
          <Link href="/onboarding" className="font-semibold text-accent-ink">
            방법 보기
          </Link>
        </p>
      ) : null}

      <SectionLabel>계정</SectionLabel>
      <Card>
        <ActionRow divider onClick={() => void downloadExport()}>
          기록 내보내기
        </ActionRow>
        <ActionRow divider onClick={() => void createClient().auth.signOut()}>
          로그아웃
        </ActionRow>
        <ActionRow danger onClick={() => setDeleteOpen(true)}>
          계정 삭제
        </ActionRow>
      </Card>

      <p className="mt-8 text-center text-12 text-ink-disabled">Lastly · 1.0.3</p>

      {deleteOpen ? <DeleteAccountSheet onClose={() => setDeleteOpen(false)} /> : null}
    </main>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="mt-6 px-1 text-12.5 tracking-[.06em] text-ink-3">{children}</p>;
}

/** 설정 항목을 묶는 둥근 카드. 행 사이는 구분선으로만 나눈다. */
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2.5 rounded-card border border-line bg-card px-[18px] py-1 shadow-card">
      {children}
    </div>
  );
}

function Row({ children, divider }: { children: React.ReactNode; divider?: boolean }) {
  return (
    <div
      className={cn('flex items-center justify-between py-4', divider && 'border-b border-line')}
    >
      {children}
    </div>
  );
}

function ActionRow({
  children,
  onClick,
  divider,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  divider?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between py-4 text-left text-15.5 font-semibold',
        divider && 'border-b border-line',
        danger ? 'text-danger' : 'text-ink',
      )}
    >
      {children}
      {danger ? null : <Chevron className="border-[1.6px] border-b-0 border-l-0" />}
    </button>
  );
}

/** 설계의 토글 — 켜지면 세이지, 꺼지면 회색. */
function Toggle({
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

/** 설계 13-B — 되돌릴 수 없는 삭제이므로 확인을 한 단계 둔다. */
function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await profileApi.deleteAccount();
      await createClient().auth.signOut();
      window.location.href = '/';
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet open onClose={onClose} label="계정 삭제">
      <p className="text-13 font-bold text-danger">되돌릴 수 없어요</p>
      <h2 className="mt-2 text-[22px] font-bold leading-[1.4] tracking-[-.03em] text-ink">
        계정과 모든 기록을
        <br />
        영구 삭제할까요?
      </h2>

      <ul className="mt-5 flex flex-col gap-2 rounded-lg border border-line bg-card px-[18px] py-4 text-[13.5px] text-ink-2">
        <li>· 기록한 항목과 히스토리 전부</li>
        <li>· 예약된 알림 전부</li>
        <li>· 소셜 계정 연동 정보</li>
      </ul>

      <label className="mt-5 flex items-start gap-3">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => setAcknowledged(e.target.checked)}
          className="mt-0.5 h-5 w-5 accent-[var(--lastly-danger)]"
        />
        <span className="text-[13.5px] leading-[1.7] text-ink">
          삭제하면 되돌릴 수 없다는 점을 확인했어요
        </span>
      </label>

      <button
        type="button"
        onClick={confirmDelete}
        disabled={!acknowledged || deleting}
        className="mt-[18px] flex h-[58px] w-full items-center justify-center rounded-lg bg-danger text-17 font-semibold text-white disabled:opacity-50"
      >
        {deleting ? '삭제하는 중…' : '영구 삭제하기'}
      </button>

      <button
        type="button"
        onClick={onClose}
        disabled={deleting}
        className="mt-2.5 flex h-[52px] w-full items-center justify-center rounded-lg border border-line bg-card text-15.5 font-semibold text-ink-2"
      >
        그만두기
      </button>
    </Sheet>
  );
}

async function downloadExport() {
  const data = await profileApi.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `lastly-export-${todayIso()}.json`;
  anchor.click();

  URL.revokeObjectURL(url);
}
