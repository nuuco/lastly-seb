'use client';

import type { CadenceRule } from '@lastly/contracts';
import { addDays, addMonths, addWeeks, format, parseISO } from 'date-fns';
import { useState } from 'react';

import { Chevron, Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/cn';
import { formatShortDate } from '@/lib/date';

import { SnoozeEntry, SnoozePicker } from './snooze-picker';

const PRESETS: Array<{ label: string; rule: Pick<CadenceRule, 'unit' | 'interval'> }> = [
  { label: '2주마다', rule: { unit: 'week', interval: 2 } },
  { label: '1달마다', rule: { unit: 'month', interval: 1 } },
  { label: '3달마다', rule: { unit: 'month', interval: 3 } },
];

/** 설계는 월요일부터 늘어놓는다. 값은 Date.getDay 기준(0=일). */
const WEEKDAYS = [
  { label: '월', value: 1 },
  { label: '화', value: 2 },
  { label: '수', value: 3 },
  { label: '목', value: 4 },
  { label: '금', value: 5 },
  { label: '토', value: 6 },
  { label: '일', value: 0 },
] as const;

interface CadenceSheetProps {
  open: boolean;
  itemName: string;
  transcript?: string;
  doneOn: string;
  value: CadenceRule;
  onChange: (rule: CadenceRule) => void;
  onClose: () => void;
  /**
   * 쉬어가기를 함께 다룰 때만 넘긴다.
   * 아직 저장되지 않은 항목(기록 직후 확인 시트)에서는 미룰 대상이 없으므로 감춘다.
   */
  snoozedUntil?: string | null;
  onSnooze?: (until: string | null) => void;
}

/** 설계 10(프리셋) + 10-B(직접 입력). 한 시트 안에서 모드만 바뀐다. */
export function CadenceSheet({
  open,
  itemName,
  doneOn,
  value,
  onChange,
  onClose,
  snoozedUntil = null,
  onSnooze,
}: CadenceSheetProps) {
  const [draft, setDraft] = useState<CadenceRule>(value);
  const [custom, setCustom] = useState(!matchesPreset(value));
  const [snoozing, setSnoozing] = useState(false);

  const update = (patch: Partial<CadenceRule>) => setDraft((prev) => ({ ...prev, ...patch }));

  if (snoozing && onSnooze) {
    return (
      <Sheet open={open} onClose={onClose} label="쉬어가기">
        <SnoozePicker
          snoozedUntil={snoozedUntil}
          onPick={(until) => onSnooze(until)}
          onCancel={() => onSnooze(null)}
          onBack={() => setSnoozing(false)}
        />
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={onClose} label="주기 선택">
      {custom ? (
        <CustomEditor
          draft={draft}
          doneOn={doneOn}
          onUpdate={update}
          onBack={() => setCustom(false)}
          onClose={onClose}
        />
      ) : (
        <>
          <h2 className="text-[20px] font-bold tracking-[-.03em] text-ink">
            얼마마다 알려드릴까요?
          </h2>
          <p className="mt-1.5 text-[13.5px] text-ink-3">{itemName}</p>

          <div className="mt-5 flex flex-col gap-[9px]">
            {PRESETS.map((preset) => {
              const selected =
                draft.unit === preset.rule.unit &&
                draft.interval === preset.rule.interval &&
                draft.weekdays.length === 0;

              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => update({ ...preset.rule, weekdays: [] })}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-[18px] py-4 text-left',
                    selected
                      ? 'border-[1.5px] border-accent bg-accent-soft'
                      : 'border border-line',
                  )}
                >
                  <span className={cn('text-16', selected ? 'font-bold' : 'font-semibold')}>
                    {preset.label}
                  </span>
                  <span
                    className={cn(
                      'flex items-center gap-2.5 text-13',
                      selected ? 'text-accent-ink' : 'text-ink-3',
                    )}
                  >
                    {formatShortDate(previewNextDue(doneOn, { ...draft, ...preset.rule, weekdays: [] }))}
                    {selected ? <CheckDot /> : null}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setCustom(true)}
              className="flex items-center justify-between rounded-lg border border-line px-[18px] py-4 text-left"
            >
              <span className="text-16 font-semibold text-ink">직접 입력</span>
              <Chevron className="border-[1.8px] border-l-0 border-b-0" />
            </button>
          </div>
        </>
      )}

      <button
        type="button"
        onClick={() => onChange(draft)}
        className="mt-5 flex h-14 w-full items-center justify-center rounded-lg bg-action text-17 font-semibold text-white shadow-action active:bg-action-pressed"
      >
        이 주기로 저장
      </button>

      {onSnooze ? (
        <SnoozeEntry snoozedUntil={snoozedUntil} onClick={() => setSnoozing(true)} />
      ) : null}
    </Sheet>
  );
}

/** 선택된 프리셋에 붙는 체크 동그라미. 설계가 테두리로 그린 체크를 그대로 옮겼다. */
function CheckDot() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent" aria-hidden>
      <span className="-mt-0.5 block h-1 w-2 -rotate-45 border-b-[1.8px] border-l-[1.8px] border-white" />
    </span>
  );
}

/** 설계 10-B — 반복 방식, 간격, 요일. */
function CustomEditor({
  draft,
  doneOn,
  onUpdate,
  onBack,
  onClose,
}: {
  draft: CadenceRule;
  doneOn: string;
  onUpdate: (patch: Partial<CadenceRule>) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const unitLabel = { day: '일', week: '주', month: '달' }[draft.unit];

  const toggleWeekday = (day: number) => {
    const next = draft.weekdays.includes(day)
      ? draft.weekdays.filter((d) => d !== day)
      : [...draft.weekdays, day];
    onUpdate({ weekdays: next.sort((a, b) => a - b) });
  };

  return (
    <>
      <div className="flex items-center">
        <button type="button" onClick={onBack} className="text-14 text-ink-3">
          뒤로
        </button>
        <span className="ml-auto text-19 font-bold tracking-[-.03em] text-ink">직접 입력</span>
        <button type="button" onClick={onClose} className="ml-auto text-14 text-ink-3">
          닫기
        </button>
      </div>

      <FieldLabel>반복 방식</FieldLabel>
      <div className="mt-2 flex gap-[5px] rounded-[14px] bg-surface-alt p-1">
        {(['day', 'week', 'month'] as const).map((unit) => {
          const on = draft.unit === unit;
          return (
            <button
              key={unit}
              type="button"
              onClick={() => onUpdate(convertUnit(draft, unit))}
              className={cn(
                'flex-1 rounded-[11px] py-[9px] text-center text-[13.5px]',
                on ? 'bg-card font-bold text-ink shadow-hair' : 'font-semibold text-ink-3',
              )}
            >
              {{ day: '일 단위', week: '주 단위', month: '월 단위' }[unit]}
            </button>
          );
        })}
      </div>

      <div className="mt-[18px] flex items-center justify-between rounded-row border border-line bg-card px-[18px] py-3.5">
        <span className="text-15.5 font-semibold text-ink">몇 {unitLabel}마다</span>
        <span className="flex items-center gap-4">
          <StepButton
            label="줄이기"
            onClick={() => onUpdate({ interval: Math.max(1, draft.interval - 1) })}
            disabled={draft.interval <= 1}
          >
            −
          </StepButton>
          <span className="min-w-6 text-center text-19 font-bold tracking-[-.03em] tabular-nums text-ink">
            {draft.interval}
          </span>
          <StepButton
            label="늘리기"
            onClick={() =>
              onUpdate({ interval: Math.min(MAX_INTERVAL[draft.unit], draft.interval + 1) })
            }
          >
            +
          </StepButton>
        </span>
      </div>

      {draft.unit === 'week' ? (
        <>
          <FieldLabel>요일 (선택)</FieldLabel>
          <div className="mt-2 flex gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = draft.weekdays.includes(d.value);
              return (
                <button
                  key={d.label}
                  type="button"
                  onClick={() => toggleWeekday(d.value)}
                  aria-pressed={on}
                  className={cn(
                    'flex-1 rounded-xl py-[11px] text-center text-[13.5px]',
                    on
                      ? 'border-[1.5px] border-action bg-[#F8EAE1] font-bold text-action-pressed'
                      : 'border border-line text-ink-3',
                  )}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      <p className="mt-5 text-[13.5px] leading-[1.7] text-ink-3">
        다음 알림 · {formatShortDate(previewNextDue(doneOn, draft))}
      </p>
    </>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="mt-[18px] text-12.5 tracking-wide4 text-ink-3">{children}</p>;
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-surface-alt text-16 font-bold text-ink-2 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** 단위별 상한. 이 이상은 사람이 주기로 생각하지 않는다. */
const MAX_INTERVAL = { day: 365, week: 52, month: 24 } as const;
const DAYS_PER = { day: 1, week: 7, month: 30 } as const;

/**
 * 단위를 바꿔도 "대략 같은 간격"을 유지한다.
 *
 * 숫자를 그대로 두면 45일이 45주(약 10개월)가 되어버린다.
 * 사용자가 원한 건 단위를 바꾸는 것이지 주기를 20배로 늘리는 게 아니다.
 * 그래서 일수로 환산한 뒤 새 단위로 다시 나눈다 — 45일 → 6주 → 2달.
 */
function convertUnit(rule: CadenceRule, unit: CadenceRule['unit']): Partial<CadenceRule> {
  if (unit === rule.unit) return {};

  const days = rule.interval * DAYS_PER[rule.unit];
  const interval = Math.min(MAX_INTERVAL[unit], Math.max(1, Math.round(days / DAYS_PER[unit])));

  return {
    unit,
    interval,
    // 요일 지정은 주 단위에서만 의미가 있다.
    weekdays: unit === 'week' ? rule.weekdays : [],
  };
}

const matchesPreset = (rule: CadenceRule) =>
  rule.weekdays.length === 0 &&
  PRESETS.some((p) => p.rule.unit === rule.unit && p.rule.interval === rule.interval);

/**
 * 다음 예정일 미리보기.
 * apps/api의 CadenceService.nextDueOn과 같은 규칙 — 셋 중 하나를 고치면 나머지도 고쳐야 한다.
 */
function previewNextDue(doneOn: string, rule: CadenceRule): string {
  const from = parseISO(doneOn);
  const base =
    rule.unit === 'day'
      ? addDays(from, rule.interval)
      : rule.unit === 'week'
        ? addWeeks(from, rule.interval)
        : addMonths(from, rule.interval);

  if (rule.unit !== 'week' || rule.weekdays.length === 0) {
    return format(base, 'yyyy-MM-dd');
  }

  const baseDow = base.getDay();
  const delta = Math.min(...rule.weekdays.map((d) => (d - baseDow + 7) % 7));
  return format(addDays(base, delta), 'yyyy-MM-dd');
}
