'use client';

import type { NotificationSettings, SignupPrompt } from '@lastly/contracts';

import { todayIso } from '@/lib/date';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Chevron, Sheet } from '@/components/ui/sheet';
import { SignupPromptSheet } from '@/features/auth/signup-prompt-sheet';
import { OnDeviceSettings } from '@/features/on-device/on-device-settings';
import { usePushSubscription } from '@/features/notifications/use-push-subscription';
import { profileApi } from '@/lib/api/profile';
import { queryKeys } from '@/lib/api/query-keys';
import { cn } from '@/lib/cn';
import { createClient } from '@/lib/supabase/client';
import { useAnonymous, useSignedIn } from '@/lib/supabase/use-signed-in';

/** 설계 13 / 13-B. */
export default function SettingsPage() {
  const queryClient = useQueryClient();
  const push = usePushSubscription();
  const [deleteOpen, setDeleteOpen] = useState(false);
  /** 알림을 켠 직후에만 띄운다. 설정 화면을 열었다는 이유로 권하지는 않는다. */
  const [signupPrompt, setSignupPrompt] = useState<SignupPrompt | null>(null);
  /** 알림을 켜지 못한 이유. 실패를 조용히 넘기면 사용자는 같은 행동을 반복한다. */
  const [pushError, setPushError] = useState<string | null>(null);

  /**
   * 계정이 생기기 전에도 설정을 열 수 있다. 그때는 서버를 부르지 않고 기본값을 보여준다 —
   * 알림을 켜는 순간 계정이 만들어지고 그 값이 서버에 저장된다.
   */
  const signedIn = useSignedIn();
  const anonymous = useAnonymous();
  const router = useRouter();

  const settings = useQuery({
    queryKey: queryKeys.notificationSettings,
    queryFn: profileApi.notificationSettings,
    enabled: signedIn === true,
  });

  /**
   * 알림 켜고 끄기.
   *
   * 누른 즉시 토글을 움직이고 서버 일은 뒤에서 한다. 예전에는 서버를 두 번 왕복한
   * 뒤에야 모양이 바뀌어서, 눌러도 한참 반응이 없는 것처럼 보였다.
   * 실패하면 원래대로 되돌리고 이유를 띄운다.
   */
  const togglePush = async (on: boolean) => {
    setPushError(null);

    const before = queryClient.getQueryData<NotificationSettings>(queryKeys.notificationSettings);
    if (before) {
      queryClient.setQueryData(queryKeys.notificationSettings, { ...before, pushGranted: on });
    }

    const ok = on ? await push.subscribe() : await push.unsubscribe();

    if (!ok) {
      if (before) queryClient.setQueryData(queryKeys.notificationSettings, before);
      setPushError(push.error ?? '알림을 바꾸지 못했어요.');
      return;
    }

    /**
     * 알림을 켜겠다는 건 챙김받고 싶다는 뜻이다.
     * 익명이면 이 브라우저를 비우는 순간 그 알림이 끊기므로 지금 말한다.
     */
    if (on && before?.signupPrompt) setSignupPrompt(before.signupPrompt);

    // 서버 값으로 맞춰 둔다. 화면은 이미 바뀌어 있어 기다릴 것이 없다.
    void queryClient.invalidateQueries({ queryKey: queryKeys.notificationSettings });
  };

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

        {/*
          * 기기 설정에서 알림을 막아두면 앱이 다시 물어볼 수 없다. 스위치를 눌러도
          * 조용히 실패하므로, 그 경우에는 스위치 대신 어디서 풀어야 하는지 알려준다.
          */}
        <Row divider>
          <div>
            <p className="text-15.5 font-semibold text-ink">알림 받기</p>
            {push.permission === 'denied' ? (
              <p className="mt-[3px] break-keep text-12.5 leading-[1.6] text-ink-3">
                기기 설정에서 이 앱의 알림을 막아뒀어요. 설정 앱에서 허용해주세요.
              </p>
            ) : pushError ? (
              <p className="mt-[3px] break-keep text-12.5 leading-[1.6] text-danger">{pushError}</p>
            ) : null}
          </div>

          {push.permission === 'denied' ? (
            <span className="shrink-0 rounded-[9px] bg-surface-alt px-[11px] py-1.5 text-13 font-bold text-ink-3">
              차단됨
            </span>
          ) : (
            <Toggle
              on={settings.data?.pushGranted ?? false}
              onChange={(on) => togglePush(on)}
              label="알림 받기"
            />
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

      <OnDeviceSettings />

      <SectionLabel>계정</SectionLabel>
      <Card>
        <ActionRow divider onClick={() => void downloadExport()}>
          기록 내보내기
        </ActionRow>
        {/*
          * 익명 사용자에게는 로그아웃을 보여주지 않는다.
          *
          * 이 브라우저의 토큰이 그 계정으로 가는 유일한 열쇠다. 로그아웃은 그 열쇠를
          * 버리는 일이라, 지금까지 적은 것에 다시 닿을 방법이 없어진다.
          * 먼저 계정을 연결해 잃을 것이 없게 만든 뒤에 쓰게 한다.
          */}
        {anonymous === false ? (
          <ActionRow
            divider
            onClick={async () => {
              await createClient().auth.signOut();
              router.replace('/login');
            }}
          >
            로그아웃
          </ActionRow>
        ) : (
          <ActionRow divider onClick={() => router.push('/login')}>
            구글 계정 연결하기
          </ActionRow>
        )}
        <ActionRow danger onClick={() => setDeleteOpen(true)}>
          계정 삭제
        </ActionRow>
      </Card>

      <p className="mt-8 text-center text-12 text-ink-disabled">Lastly · 1.0.3</p>

      {deleteOpen ? <DeleteAccountSheet onClose={() => setDeleteOpen(false)} /> : null}

      {signupPrompt ? (
        <SignupPromptSheet
          prompt={signupPrompt}
          onDismiss={() => {
            setSignupPrompt(null);
            profileApi.markSignupPromptSeen(signupPrompt).catch(() => undefined);
          }}
        />
      ) : null}
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
