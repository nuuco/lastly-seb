'use client';

import type { HomeFeed, Item } from '@lastly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { Toast } from '@/components/ui/toast';
import { CadenceSheet } from '@/features/capture/components/cadence-sheet';
import { AnswerCard } from '@/features/capture/components/answer-card';
import { CaptureBar } from '@/features/capture/components/capture-bar';
import { ConfirmSheet } from '@/features/capture/components/confirm-sheet';
import { DisambiguateSheet } from '@/features/capture/components/disambiguate-sheet';
import { useCapture } from '@/features/capture/use-capture';
import { useSpeechRecognition } from '@/features/capture/use-speech-recognition';
import { CalendarView } from '@/features/calendar/calendar-view';
import { takeDeletedNotice, type DeletedNotice } from '@/features/items/deleted-notice';
import { itemsApi } from '@/lib/api/items';
import { queryKeys } from '@/lib/api/query-keys';
import { formatMonth, formatShortDate, formatYearMonth, todayIso } from '@/lib/date';

import { EmptyState } from './components/empty-state';
import { HomeError, HomeSkeleton } from './components/home-states';
import { HeroCarousel } from './components/hero-carousel';
import { AllDoneCard, HomeHeader } from './components/home-header';
import { LaterGroup, RowGroup, SectionHeader, UpcomingRow } from './components/item-rows';

interface HomeScreenProps {
  /** 서버에서 미리 가져온 피드. 없으면(비로그인 등) 클라이언트가 다시 가져온다. */
  initialFeed: HomeFeed | null;
}

/** 화면 04 / 05 / 05-B / 07 / 07-B / 08 / 09 / 10 — 단일 홈 구조의 전부. */
export function HomeScreen({ initialFeed }: HomeScreenProps) {
  const queryClient = useQueryClient();
  const today = new Date();

  const feed = useQuery({
    queryKey: queryKeys.home,
    queryFn: itemsApi.homeFeed,
    // initialData가 있으면 첫 렌더에 그대로 그리고, staleTime이 지나기 전까진 다시 안 부른다.
    initialData: initialFeed ?? undefined,
  });
  const speech = useSpeechRecognition();
  // 해석이 끝나야 입력창을 비운다. 기다리는 동안 보낸 문장이 남아 있어야 한다.
  const capture = useCapture({ onInterpreted: () => setDraft('') });

  const [cadenceItem, setCadenceItem] = useState<Item | null>(null);
  const [draft, setDraft] = useState('');
  /** 상세에서 항목을 지우고 넘어왔다면 되돌릴 기회를 띄운다. */
  const [deleted, setDeleted] = useState<DeletedNotice | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [month, setMonth] = useState(() => formatMonth(new Date()));
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 설계 06의 "자주 쓰는 문장" 칩.
   * 곧 할 차례인 것부터 세 개만 — 지금 누를 만한 것이어야 의미가 있다.
   */
  const quickPhrases = [
    ...(feed.data?.due ?? []),
    ...(feed.data?.upcoming ?? []),
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

  const startVoice = () => {
    if (!speech.supported) return;
    speech.start();
  };

  /**
   * 음성 인식이 끝나면 바로 보내지 않고 입력창에 채운다.
   * 잘못 들었을 때 사용자가 고쳐서 보낼 수 있어야 한다.
   */
  const wasListening = useRef(false);

  useEffect(() => {
    const justStopped = wasListening.current && !speech.listening;
    wasListening.current = speech.listening;

    if (!justStopped) return;

    const text = speech.transcript.trim();
    if (text) {
      setDraft(text);
      inputRef.current?.focus();
    }
    speech.reset();
  }, [speech]);

  /**
   * "다시 말하기" — 시트를 닫는 데서 그치지 않고 곧바로 다시 듣기 시작한다.
   * 사용자는 말을 고치려는 것이지 입력창으로 돌아가려는 게 아니다.
   * 클릭이 사용자 제스처이므로 같은 틱에서 start()를 불러야 브라우저가 마이크를 허용한다.
   */
  const retryWithVoice = () => {
    capture.cancel();
    if (speech.supported) speech.start();
    else inputRef.current?.focus();
  };

  const submitDraft = (mode: 'voice' | 'text') => {
    const text = draft.trim();
    if (!text || capture.interpreting) return;
    capture.interpret({ text, mode });
  };

  if (feed.isPending) return <HomeSkeleton />;
  if (feed.isError) return <HomeError onRetry={() => feed.refetch()} />;

  const { summary, due, upcoming, later } = feed.data;
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
              <AllDoneCard summary={summary} justFinished={Boolean(capture.committed)} />
            )}

            {upcoming.length > 0 ? (
              <>
                <SectionHeader label="다가오는 항목" count={upcoming.length} />
                <RowGroup>
                  {upcoming.map((item, i) => (
                    <UpcomingRow key={item.id} item={item} last={i === upcoming.length - 1} />
                  ))}
                </RowGroup>
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
          if (speech.listening) {
            speech.stop();
          } else if (speech.supported) {
            speech.start();
          } else {
            inputRef.current?.focus();
          }
        }}
        listening={speech.listening}
        liveTranscript={speech.transcript}
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

      {capture.step === 'confirm' && capture.result ? (
        <ConfirmSheet
          open
          result={capture.result}
          cadence={capture.cadence}
          onCadenceChange={capture.setCadenceOverride}
          onConfirm={capture.commit}
          onRetry={retryWithVoice}
          committing={capture.committing}
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

