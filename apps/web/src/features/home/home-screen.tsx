'use client';

import type { HomeFeed, Item } from '@lastly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { parseISO } from 'date-fns';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Toast } from '@/components/ui/toast';
import { CadenceSheet } from '@/features/capture/components/cadence-sheet';
import { AnswerCard } from '@/features/capture/components/answer-card';
import { CaptureBar } from '@/features/capture/components/capture-bar';
import { ConfirmSheet } from '@/features/capture/components/confirm-sheet';
import { DisambiguateSheet } from '@/features/capture/components/disambiguate-sheet';
import { useCapture } from '@/features/capture/use-capture';
import { useSpeechRecognition } from '@/features/capture/use-speech-recognition';
import { SignupPromptSheet } from '@/features/auth/signup-prompt-sheet';
import { CalendarView } from '@/features/calendar/calendar-view';
import {
  getModelConsent,
  hasModelConsent,
  setModelConsent,
  clearModelConsent,
} from '@/features/on-device/consent';
import {
  cancelEngineLoad,
  engineErrorMessage,
  engineProgressHint,
  engineProgressLabel,
  ensureEngine,
  isEngineSupported,
  isEngineCancelled,
  subscribeEngineProgress,
  type EngineProgress,
} from '@/features/on-device/engine';
import { EngineProgressBar } from '@/features/on-device/engine-progress-bar';
import { ModelConsentSheet } from '@/features/on-device/model-consent-sheet';
import type { OnDeviceKnownItem } from '@/features/on-device/types';
import { takeDeletedNotice, type DeletedNotice } from '@/features/items/deleted-notice';
import { itemsApi } from '@/lib/api/items';
import { profileApi } from '@/lib/api/profile';
import { queryKeys } from '@/lib/api/query-keys';
import { loadFeed, loadFeedAt, saveFeed } from '@/lib/offline/feed-cache';
import { useOnline } from '@/lib/offline/use-online';
import { useSignedIn } from '@/lib/supabase/use-signed-in';
import { usePending } from '@/lib/offline/use-pending';
import { formatMonth, formatShortDate, formatYearMonth, todayIso } from '@/lib/date';

import { EmptyState } from './components/empty-state';
import { HomeError, HomeSkeleton } from './components/home-states';
import { HeroCarousel } from './components/hero-carousel';
import { AllDoneCard, HomeHeader } from './components/home-header';
import { LaterGroup, SectionHeader, UpcomingGroup } from './components/item-rows';

interface HomeScreenProps {
  /** 서버에서 미리 가져온 피드. 없으면 클라이언트가 다시 가져온다. */
  initialFeed: HomeFeed | null;
  /**
   * 계정이 있는지. 아직 아무것도 저장하지 않은 사람은 없다.
   *
   * 계정이 없으면 서버를 부르지 않는다 — 부를 수도 없고(누구 것인지 모른다),
   * 보여줄 것도 없다. 첫 기록을 남기면 그때 계정이 생기고 목록이 붙는다.
   */
  signedIn: boolean;
}

/** 계정이 생기기 전에 보여줄 홈. 첫 기록을 남기면 서버 것으로 바뀐다. */
const EMPTY_FEED: HomeFeed = {
  today: todayIso(),
  summary: {
    greetingName: null,
    completedThisWeek: 0,
    averageIntervalDays: null,
    overdueCount: 0,
    dueTodayCount: 0,
    nextUp: null,
  },
  signupPrompt: null,
  due: [],
  upcoming: [],
  later: [],
};

/** 화면 04 / 05 / 05-B / 07 / 07-C / 08 / 09 / 10 — 단일 홈 구조의 전부. */
export function HomeScreen({ initialFeed, signedIn: initiallySignedIn }: HomeScreenProps) {
  /** 계정이 생기는 순간(첫 저장)을 알아채야 목록을 부르기 시작한다. */
  const signedIn = useSignedIn(initiallySignedIn) ?? false;
  const queryClient = useQueryClient();
  const feed = useQuery({
    queryKey: queryKeys.home,
    queryFn: itemsApi.homeFeed,
    // initialData가 있으면 첫 렌더에 그대로 그리고, staleTime이 지나기 전까진 다시 안 부른다.
    initialData: initialFeed ?? (signedIn ? undefined : EMPTY_FEED),
    enabled: signedIn,
  });

  /**
   * 받은 목록을 기기에 복사해 둔다. 연결이 끊긴 자리에서 열었을 때 보여줄 것이다.
   * 서버에서 새로 받을 때마다 덮어쓰므로 사본이 낡아 있을 일이 없다.
   */
  useEffect(() => {
    if (feed.data && signedIn) saveFeed(feed.data);
  }, [feed.data, signedIn]);

  /** 서버를 못 불렀을 때 꺼내 쓸 사본. 없으면 예전처럼 오류 화면으로 간다. */
  const [cached, setCached] = useState<{ feed: HomeFeed; at: number | null } | null>(null);

  /**
   * 부르기에 실패했는지. isError 로 보면 안 된다 — 이미 들고 있는 데이터가 있으면
   * 다시 부르다 실패해도 성공 상태로 남는다. 실패 횟수를 봐야 드러난다.
   */
  const failed = feed.failureCount > 0;

  useEffect(() => {
    if (!failed) return;
    const saved = loadFeed();
    if (saved) setCached({ feed: saved, at: loadFeedAt() });
  }, [failed]);

  /** 이 화면이 그리는 목록. 서버 것이 없으면 기기에 복사해 둔 것. */
  const shown = feed.data ?? cached?.feed;
  const shownRef = useRef(shown);
  shownRef.current = shown;
  /**
   * 낡은 것을 보여주는 중인지. 알려주지 않으면 최신으로 착각한다.
   *
   * 연결이 끊긴 것만으로도 알린다. 목록을 30초 동안 최신으로 보기 때문에,
   * 부르기 실패만 기다리면 끊긴 직후에는 아무 표시도 안 뜬다.
   */
  const online = useOnline();
  const offline = (!online || failed) && Boolean(shown);

  /**
   * 서버가 본 오늘을 쓴다. 기기 시계를 쓰면 맨 윗줄만 따로 움직인다 —
   * 폰 날짜를 바꾸면 날짜는 바뀌는데 항목은 그대로였다.
   */
  const today = parseISO(shown?.today ?? todayIso());

  const [draft, setDraft] = useState('');
  // 해석이 끝나야 입력창을 비운다. 기다리는 동안 보낸 문장이 남아 있어야 한다.
  const capture = useCapture({ onInterpreted: () => setDraft('') });

  /**
   * 연결이 끊긴 사이에 남긴 기록. 이미 풀린 것은 훅이 알아서 올리고,
   * 서버에 물어봐야 하는 말만 화면에 남는다.
   */
  const pending = usePending(signedIn, capture.step);

  const processPending = () => {
    const next = pending.takeRaw();
    if (next) capture.interpret({ text: next.text, mode: next.mode, knownItems: knownFrom(shown) });
  };

  const [cadenceItem, setCadenceItem] = useState<Item | null>(null);
  /** 이번 화면에서 유도를 닫았는지. 서버 표시가 반영되기 전까지 다시 뜨지 않게 한다. */
  const [promptDismissed, setPromptDismissed] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [modelProgress, setModelProgress] = useState<EngineProgress | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  /** 상세에서 항목을 지우고 넘어왔다면 되돌릴 기회를 띄운다. */
  const [deleted, setDeleted] = useState<DeletedNotice | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [month, setMonth] = useState(() => formatMonth(new Date()));
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 말이 끝나면 바로 이해한다. 받아쓰기는 훅, 확인 시트 진입만 여기서.
   */
  const speech = useSpeechRecognition();
  const wasListening = useRef(false);
  const heardRef = useRef('');
  const interpretVoiceRef = useRef(capture.interpret);
  interpretVoiceRef.current = capture.interpret;
  const { listening, transcript, reset: resetSpeech, stop: stopSpeech } = speech;
  const downloadingModel = modelProgress?.status === 'downloading';

  const dropListenWithoutInterpret = useCallback(() => {
    wasListening.current = false;
    heardRef.current = '';
    resetSpeech();
    stopSpeech();
  }, [resetSpeech, stopSpeech]);

  useEffect(() => {
    if (transcript) heardRef.current = transcript;
  }, [transcript]);

  useEffect(() => {
    const justStopped = wasListening.current && !listening;
    wasListening.current = listening;
    if (!justStopped) return;

    const text = (transcript || heardRef.current).trim();
    heardRef.current = '';
    if (text) {
      setDraft(text);
      interpretVoiceRef.current({
        text,
        mode: 'voice',
        knownItems: knownFrom(shownRef.current),
      });
    }
    resetSpeech();
  }, [listening, transcript, resetSpeech]);

  /** 해석이 시작되면 메인 마이크를 놓는다. */
  useEffect(() => {
    if (capture.step === 'interpreting' && listening) dropListenWithoutInterpret();
  }, [capture.step, listening, dropListenWithoutInterpret]);

  useEffect(() => {
    if (downloadingModel && listening) dropListenWithoutInterpret();
  }, [downloadingModel, listening, dropListenWithoutInterpret]);

  /**
   * 설계 06의 "자주 쓰는 문장" 칩.
   * 곧 할 차례인 것부터 세 개만 — 지금 누를 만한 것이어야 의미가 있다.
   */
  const quickPhrases = [
    ...(shown?.due ?? []),
    ...(shown?.upcoming ?? []),
  ]
    .slice(0, 3)
    .map((item) => item.name);

  /**
   * 홈에 들어올 때 한 번만 본다. 읽으면 지워지므로 새로고침해도 다시 뜨지 않는다.
   *
   * ref 로 막는 이유: 개발 모드의 StrictMode 는 effect 를 두 번 실행한다.
   * 첫 번째가 읽고 지운 값을 두 번째가 못 찾아 null 로 덮어써서 토스트가
   * 뜨자마자 사라진다.
   */
  const noticeRead = useRef(false);
  useEffect(() => {
    if (noticeRead.current) return;
    noticeRead.current = true;
    setDeleted(takeDeletedNotice());
  }, []);

  useEffect(() => {
    return subscribeEngineProgress((next) => {
      setModelProgress(next);
      if (next.status === 'ready') {
        setModelError(null);
        setConsentOpen(false);
      }
      if (next.status === 'error') {
        setModelError(next.message);
        setConsentOpen(true);
      }
      if (next.status === 'idle') {
        setModelProgress(null);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.isSecureContext) {
      setModelError('이 주소에서는 쓸 수 없어요. localhost로 열어 주세요.');
      if (getModelConsent() !== 'declined') setConsentOpen(true);
      return;
    }
    if (!isEngineSupported()) return;
    if (getModelConsent() === null) setConsentOpen(true);
    if (hasModelConsent()) void ensureEngine().catch((err) => {
      if (isEngineCancelled(err)) return;
      setModelError(engineErrorMessage(err));
    });
  }, []);

  const restore = useMutation({
    mutationFn: (id: string) => itemsApi.restore(id),
    onSuccess: async () => {
      setDeleted(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
  });

  const complete = useMutation({
    mutationFn: (item: Item) => itemsApi.complete(item.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.home });
    },
  });

  /**
   * "다시 말하기" — 시트를 닫는 데서 그치지 않고 곧바로 다시 듣기 시작한다.
   * 사용자는 말을 고치려는 것이지 입력창으로 돌아가려는 게 아니다.
   * 클릭이 사용자 제스처이므로 같은 틱에서 start()를 불러야 브라우저가 마이크를 허용한다.
   */
  const retryWithVoice = () => {
    capture.cancel();
    if (downloadingModel) inputRef.current?.focus();
    else if (speech.supported) speech.start();
    else inputRef.current?.focus();
  };

  const submitDraft = (mode: 'voice' | 'text') => {
    const text = draft.trim();
    if (!text || capture.interpreting) return;
    capture.interpret({ text, mode, knownItems: knownFrom(shown) });
  };

  if (feed.isPending) return <HomeSkeleton />;
  if (!shown) return <HomeError onRetry={() => feed.refetch()} />;

  const { summary, due, upcoming, later } = shown;
  const isEmpty = due.length + upcoming.length + later.length === 0;
  const resting = later.filter((i) => i.snoozedUntil).length;

  return (
    <main className="pb-capture-bar min-h-dvh">
      <div className="px-6 pt-[18px]">
        <HomeHeader
          summary={summary}
          today={today}
          empty={isEmpty}
          // 기록이 없으면 볼 달력도 없다.
          view={isEmpty ? undefined : view}
          onViewChange={isEmpty ? undefined : setView}
          title={view === 'calendar' ? formatYearMonth(month) : undefined}
        />

        {/*
          * 사본으로 그리는 중이라고 알린다. 낡은 목록을 최신으로 착각하면
          * 이미 한 일을 또 하거나, 방금 적은 것이 사라진 줄 안다.
          */}
        {offline ? (
          <button
            type="button"
            onClick={() => feed.refetch()}
            className="mt-3 flex w-full items-center justify-between rounded-md bg-surface-alt px-3.5 py-2.5 text-left"
          >
            <span className="text-12.5 text-ink-2">
              연결이 끊겨 마지막으로 받은 목록을 보여드리고 있어요
              {cached?.at ? ` · ${formatShortDate(new Date(cached.at).toISOString().slice(0, 10))} 기준` : ''}
            </span>
            <span className="shrink-0 pl-2 text-12.5 font-semibold text-accent-ink">다시 시도</span>
          </button>
        ) : null}

        {modelProgress?.status === 'downloading' && !consentOpen ? (
          <div className="mt-3 rounded-md bg-surface-alt px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-12.5 text-ink-2">{engineProgressLabel(modelProgress)}</p>
              <button
                type="button"
                onClick={() => {
                  void cancelEngineLoad();
                  clearModelConsent();
                }}
                className="shrink-0 text-12.5 font-semibold text-danger"
              >
                받기 취소
              </button>
            </div>
            <EngineProgressBar progress={modelProgress} />
            {engineProgressHint(modelProgress) ? (
              <p className="mt-1.5 text-12 leading-[1.6] text-ink-3">{engineProgressHint(modelProgress)}</p>
            ) : null}
          </div>
        ) : null}

        {pending.raw.length > 0 ? (
          <div className="mt-2 flex items-center justify-between rounded-md bg-accent-soft px-3.5 py-2.5">
            <span className="min-w-0 truncate pr-2 text-12.5 text-accent-ink">
              적어둔 기록 {pending.raw.length}개 · “{pending.raw[0]!.text}”
            </span>
            {pending.online ? (
              <button
                type="button"
                onClick={processPending}
                className="shrink-0 text-12.5 font-semibold text-accent-ink underline"
              >
                정리하기
              </button>
            ) : (
              <span className="shrink-0 text-12.5 text-ink-3">연결되면 올려요</span>
            )}
          </div>
        ) : null}

        {isEmpty ? (
          <EmptyState
            onExampleTap={(text) => {
              setDraft(text);
              inputRef.current?.focus();
            }}
          />
        ) : view === 'calendar' ? (
          <CalendarView today={today} month={month} onMonthChange={setMonth} />
        ) : (
          <div>
            {due.length > 0 ? (
              <HeroCarousel
                items={due}
                onComplete={complete.mutate}
                completingId={complete.isPending ? (complete.variables?.id ?? null) : null}
              />
            ) : (
              /* 방금 기록해서 비워진 날(05-B)과 애초에 없던 날(05-E)의 말이 다르다. */
              <AllDoneCard justFinished={Boolean(capture.committed)} />
            )}

            {upcoming.length > 0 ? (
              <>
                <SectionHeader label="다가오는 항목" count={upcoming.length} />
                <UpcomingGroup items={upcoming} />
              </>
            ) : null}

            {later.length > 0 ? (
              <>
                <SectionHeader
                  label="여유 있는 항목"
                  count={later.length}
                  dim
                  // 접혀 있어도 쉬는 게 있다는 건 알 수 있어야 한다.
                  note={resting > 0 ? `쉬는 중 ${resting}` : null}
                />
                <LaterGroup items={later} />
              </>
            ) : null}
          </div>
        )}
      </div>


      <CaptureBar
        ref={inputRef}
        value={draft}
        onChange={setDraft}
        onSubmit={() => submitDraft('text')}
        onMic={() => {
          if (downloadingModel) return;
          if (capture.step !== 'idle') capture.cancel();
          if (speech.listening) speech.stop();
          else if (speech.supported) speech.start();
          else inputRef.current?.focus();
        }}
        micDisabled={downloadingModel}
        listening={speech.listening}
        liveTranscript={speech.transcript}
        listenError={speech.error}
        interpreting={capture.interpreting}
        quickPhrases={quickPhrases}
        onSkipWait={() => {
          capture.saveRaw(draft.trim() || '기록');
          setDraft('');
        }}
        above={
          capture.step === 'answered' && capture.result ? (
            <AnswerCard
              result={capture.result}
              completing={complete.isPending}
              onComplete={(itemId) => {
                const item = [...due, ...upcoming, ...later].find((i) => i.id === itemId);
                if (item) complete.mutate(item);
                capture.cancel();
              }}
              onDismiss={capture.cancel}
            />
          ) : null
        }
      />

      {shown?.signupPrompt && !promptDismissed && capture.step === 'idle' ? (
        <SignupPromptSheet
          prompt={shown.signupPrompt}
          onDismiss={() => {
            setPromptDismissed(true);
            // 실패해도 이번 화면에서는 닫힌다. 다음에 다시 뜨는 편이 막히는 것보다 낫다.
            profileApi.markSignupPromptSeen(feed.data!.signupPrompt!).catch(() => undefined);
          }}
        />
      ) : null}

      {capture.step === 'confirm' && capture.result ? (
        <ConfirmSheet
          open
          result={capture.result}
          cadence={capture.cadence}
          cadenceFixed={capture.cadenceFixed}
          onCadenceChange={capture.setCadenceOverride}
          onConfirm={capture.commit}
          onRetry={retryWithVoice}
          onCancel={capture.cancel}
          committing={capture.committing}
          mode={capture.lastMode}
        />
      ) : null}

      {(capture.step === 'disambiguate' || capture.step === 'retry') && capture.result ? (
        <DisambiguateSheet
          open
          result={capture.result}
          onChoose={capture.chooseCandidate}
          onCreateNew={capture.createAsNew}
          onRetry={retryWithVoice}
          onDismiss={capture.cancel}
          committing={capture.committing}
          mode={capture.lastMode}
        />
      ) : null}

      {cadenceItem ? (
        <CadenceSheet
          open
          itemName={cadenceItem.name}
          doneOn={cadenceItem.lastDoneOn ?? todayIso()}
          value={cadenceItem.cadence}
          onChange={async (rule) => {
            await itemsApi.update(cadenceItem.id, { cadence: rule, cadenceSource: 'user' });
            await queryClient.invalidateQueries({ queryKey: queryKeys.home });
            setCadenceItem(null);
          }}
          onClose={() => setCadenceItem(null)}
        />
      ) : null}

      {deleted ? (
        <Toast
          message={`${deleted.name} 삭제됨`}
          actionLabel="되돌리기"
          onAction={() => restore.mutate(deleted.id)}
          onDismiss={() => setDeleted(null)}
          // 지운 걸 알아채는 데 시간이 걸린다. 완료 토스트보다 길게 연다.
          durationMs={10000}
        />
      ) : null}

      {capture.rawSaved ? (
        <Toast
          message={`${capture.rawSaved} 기록했어요`}
          onDismiss={capture.dismissRawSaved}
        />
      ) : null}

      {/* 연결이 끊긴 사이에 남긴 기록. 잃지 않았다는 것부터 알린다. */}
      {capture.pendingSaved ? (
        <Toast message={capture.pendingSaved} onDismiss={capture.dismissPendingSaved} durationMs={6000} />
      ) : null}

      {capture.deferredMessage ? (
        <Toast message={capture.deferredMessage} onDismiss={capture.dismissDeferred} />
      ) : null}

      <ModelConsentSheet
        open={consentOpen}
        progress={modelProgress}
        error={modelError}
        onAccept={() => {
          setModelConsent('granted');
          setModelError(null);
          void ensureEngine()
            .then(() => setConsentOpen(false))
            .catch((err) => {
              if (isEngineCancelled(err)) return;
              setModelError(engineErrorMessage(err));
            });
        }}
        onLater={() => {
          setModelConsent('declined');
          setConsentOpen(false);
        }}
        onHide={() => setConsentOpen(false)}
        onCancel={() => {
          void cancelEngineLoad();
          clearModelConsent();
          setModelError(null);
        }}
      />

      {capture.committed ? (
        <Toast
          message={`${capture.committed.itemName} 완료 · 다음 알림`}
          highlight={
            capture.committed.nextDueOn ? formatShortDate(capture.committed.nextDueOn) : undefined
          }
          actionLabel="되돌리기"
          onAction={() => capture.undo(capture.committed!.undoToken)}
          onDismiss={capture.dismissToast}
        />
      ) : null}

      {complete.data ? (
        <Toast
          message={`${complete.data.itemName} 완료 · 다음 알림`}
          highlight={complete.data.nextDueOn ? formatShortDate(complete.data.nextDueOn) : undefined}
          actionLabel="되돌리기"
          onAction={async () => {
            await itemsApi.undo(complete.data!.undoToken);
            complete.reset();
            await queryClient.invalidateQueries({ queryKey: queryKeys.home });
          }}
          onDismiss={complete.reset}
        />
      ) : null}
    </main>
  );
}

function knownFrom(feed: HomeFeed | undefined | null): OnDeviceKnownItem[] {
  if (!feed) return [];
  return [...feed.due, ...feed.upcoming, ...feed.later].map((item) => ({
    id: item.id,
    name: item.name,
    lastDoneOn: item.lastDoneOn,
  }));
}

