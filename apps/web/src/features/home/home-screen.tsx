'use client';

import type { HomeFeed, Item } from '@lastly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { Toast } from '@/components/ui/toast';
import { CadenceSheet } from '@/features/capture/components/cadence-sheet';
import { CaptureBar } from '@/features/capture/components/capture-bar';
import { ConfirmSheet } from '@/features/capture/components/confirm-sheet';
import { DisambiguateSheet } from '@/features/capture/components/disambiguate-sheet';
import { useCapture } from '@/features/capture/use-capture';
import { useSpeechRecognition } from '@/features/capture/use-speech-recognition';
import { itemsApi } from '@/lib/api/items';
import { queryKeys } from '@/lib/api/query-keys';
import { formatShortDate } from '@/lib/date';

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

  /** "직접 고치기" — 들은 문장을 입력창에 담아 고치게 한다. */
  const retryWithKeyboard = () => {
    const heard = capture.result?.transcript ?? '';
    capture.cancel();
    setDraft(heard);
    inputRef.current?.focus();
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
        <HomeHeader summary={summary} today={today} empty={isEmpty} />

        {isEmpty ? (
          <EmptyState
            onExampleTap={(text) => {
              setDraft(text);
              inputRef.current?.focus();
            }}
          />
        ) : (
          <div>
            {due.length > 0 ? (
              <HeroCarousel
                items={due}
                onComplete={complete.mutate}
                completingId={complete.isPending ? (complete.variables?.id ?? null) : null}
              />
            ) : (
              <AllDoneCard summary={summary} />
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
          onKeyboard={retryWithKeyboard}
          onDismiss={capture.cancel}
          committing={capture.committing}
          mode={capture.lastMode}
        />
      ) : null}

      {cadenceItem ? (
        <CadenceSheet
          open
          itemName={cadenceItem.name}
          doneOn={cadenceItem.lastDoneOn ?? new Date().toISOString().slice(0, 10)}
          value={cadenceItem.cadence}
          onChange={async (rule) => {
            await itemsApi.update(cadenceItem.id, { cadence: rule, cadenceSource: 'user' });
            await queryClient.invalidateQueries({ queryKey: queryKeys.home });
            setCadenceItem(null);
          }}
          onClose={() => setCadenceItem(null)}
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

