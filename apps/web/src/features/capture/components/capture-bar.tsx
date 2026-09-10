'use client';

import { forwardRef, useState } from 'react';

import { cn } from '@/lib/cn';

import { QuickPhrases } from './quick-phrases';

interface CaptureBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  /** 마이크 탭. 듣는 중이면 멈춘다. */
  onMic: () => void;
  listening: boolean;
  /** 듣는 동안 실시간으로 들어오는 문장. */
  liveTranscript: string;
  /** 서버가 문장을 해석하는 중. 몇 초 걸리므로 반드시 티를 내야 한다. */
  interpreting: boolean;
  /** 설계 06 — 입력창이 비어 있고 포커스가 있을 때 위에 뜨는 칩. */
  quickPhrases?: string[];
}

/**
 * 홈 하단 입력 바 — 설계 05.
 *
 * 알약의 모양·색·크기는 어떤 상태에서도 바뀌지 않는다.
 * 입력 중이든 듣는 중이든 같은 자리에 같은 형태로 있어야 사용자가 흔들리지 않는다.
 * 상태는 안쪽 내용과 오른쪽 버튼으로만 알린다.
 */
export const CaptureBar = forwardRef<HTMLInputElement, CaptureBarProps>(function CaptureBar(
  { value, onChange, onSubmit, onMic, listening, liveTranscript, interpreting, quickPhrases = [] },
  ref,
) {
  const [focused, setFocused] = useState(false);

  // 빈 입력창에 포커스가 있을 때만. 뭔가 적기 시작하면 방해가 된다.
  const showPhrases = focused && !value && !listening && !interpreting;

  return (
    <div className="safe-bottom fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[430px] bg-[linear-gradient(180deg,rgba(245,242,236,0),var(--lastly-paper)_34%)] px-[22px] pb-[26px] pt-3.5">
      {showPhrases ? <QuickPhrases phrases={quickPhrases} onPick={onChange} /> : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim() && !interpreting) onSubmit();
        }}
        className={cn(
          'flex items-center gap-2.5 rounded-pill border-[1.5px] bg-white/[.92] py-2 pl-[18px] pr-2 backdrop-blur-[24px]',
          // 크기도 곡률도 그대로다. 상태는 테두리와 그림자로만 알린다.
          listening
            ? // 듣는 중에는 테두리가 숨쉰다 — 설계 07. 파형 막대는 개정에서 빠졌다.
              'animate-glow border-listen-edge'
            : cn(
                'shadow-input',
                interpreting ? 'border-action' : 'border-line focus-within:border-accent',
              ),
        )}
      >
        {listening ? (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {/* 듣고 있다는 신호는 이 점 하나다. 커졌다 작아지며 맥박처럼 뛴다. */}
            <span className="block h-[7px] w-[7px] shrink-0 animate-halo rounded-full bg-action" aria-hidden />
            <span className="flex min-w-0 flex-1 items-center overflow-hidden whitespace-nowrap text-[15.5px] font-medium tracking-t2 text-ink">
              {liveTranscript || <span className="text-ink-3">듣고 있어요…</span>}
              {/* 받아쓰는 중임을 보이는 커서. 말이 멈춰도 깜빡여 아직 듣고 있음을 알린다. */}
              <span className="ml-[3px] block h-[17px] w-[2px] shrink-0 animate-caret bg-action" aria-hidden />
            </span>
          </div>
        ) : (
          <input
            ref={ref}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="말하거나 적어보세요"
            /* 해석 중에는 보낸 문장을 그대로 두되 고치지 못하게 한다. */
            readOnly={interpreting}
            aria-busy={interpreting}
            /* 16px 미만이면 iOS가 포커스 시 화면을 확대한다. */
            className={cn(
              'min-w-0 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-ink-3',
              interpreting ? 'text-ink-3' : 'text-ink',
            )}
          />
        )}

        {interpreting ? (
          <Thinking />
        ) : value.trim() && !listening ? (
          <button
            type="submit"
            className="h-[46px] shrink-0 rounded-md bg-action px-4 text-15 font-semibold text-white shadow-action active:bg-action-pressed"
          >
            기록
          </button>
        ) : (
          <MicButton listening={listening} onClick={onMic} />
        )}
      </form>

      {interpreting ? (
        <p className="mt-2.5 text-center text-12.5 text-ink-3" role="status">
          어떤 항목인지 살펴보고 있어요…
        </p>
      ) : null}
    </div>
  );
});

/** 해석 중 표시. 마이크 자리를 그대로 차지해 레이아웃이 튀지 않는다. */
function Thinking() {
  return (
    <span
      className="flex h-[46px] w-[46px] shrink-0 items-center justify-center gap-[3px] rounded-md bg-surface-alt"
      aria-hidden
    >
      {[0, 0.15, 0.3].map((delay) => (
        <span
          key={delay}
          className="block h-1.5 w-1.5 animate-halo rounded-full bg-ink-3"
          style={{ animationDelay: `${delay}s`, animationDuration: '.6s' }}
        />
      ))}
    </span>
  );
}

/**
 * 캡슐과 U자 받침을 도형으로 그린다 — 설계가 SVG 대신 이렇게 그렸다.
 * 듣는 중에는 주황으로 바뀌어 "다시 누르면 멈춘다"를 알린다.
 */
function MicButton({ listening, onClick }: { listening: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={listening ? '말하기 멈추기' : '음성으로 입력하기'}
      aria-pressed={listening}
      className={cn(
        'relative flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-md',
        listening
          ? 'bg-[linear-gradient(180deg,#B0552F,#9C4A26)] shadow-action'
          : 'bg-[linear-gradient(180deg,#5A534E,#4A433F)] shadow-toast',
      )}
    >
      <span className="block h-[18px] w-[11px] rounded-[6px] bg-white" />
      <span className="absolute bottom-[11px] block h-[9px] w-[19px] rounded-b-[10px] border-x-2 border-b-2 border-t-0 border-white" />
    </button>
  );
}
