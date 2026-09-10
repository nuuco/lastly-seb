'use client';

import type { Item, SearchResult } from '@lastly/contracts';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { itemsApi } from '@/lib/api/items';
import { describeCadence, formatDueBadge, formatShortDate } from '@/lib/date';

/**
 * 검색 — 설계 05-D.
 *
 * 항목 이름만이 아니라 기록에 적어둔 메모까지 뒤진다.
 * "필터 두 장 남음" 처럼 그때 적어둔 말은 항목 이름에 없지만
 * 사용자가 기억하고 찾는 단서다.
 */
export function SearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  // 한 글자마다 서버를 부르면 타이핑이 끊긴다.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const result = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => itemsApi.search(debounced),
    enabled: debounced.length > 0,
  });

  const data: SearchResult = result.data ?? { items: [], notes: [] };
  const empty =
    debounced.length > 0 && !result.isPending && !data.items.length && !data.notes.length;

  return (
    <main className="min-h-dvh px-6 pt-[18px]">
      <div className="safe-top flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2.5 rounded-md border-[1.5px] border-action bg-card px-4 py-3">
          <SearchIcon className="text-accent-ink" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="무엇을 찾으세요?"
            className="min-w-0 flex-1 bg-transparent text-16 font-semibold tracking-t2 text-ink outline-none placeholder:font-normal placeholder:text-ink-3"
          />
        </div>
        <button type="button" onClick={() => router.back()} className="text-[14.5px] text-ink-2">
          취소
        </button>
      </div>

      <p className="mt-2.5 px-0.5 text-12.5 text-ink-3">항목 이름과 메모에서 찾아요</p>

      {data.items.length > 0 ? (
        <>
          <SectionLabel label="항목" count={data.items.length} />
          <div className="mt-2 rounded-[20px] border border-line bg-card px-4 shadow-card">
            {data.items.map((item, i) => (
              <ItemHit
                key={item.id}
                item={item}
                query={debounced}
                last={i === data.items.length - 1}
              />
            ))}
          </div>
        </>
      ) : null}

      {data.notes.length > 0 ? (
        <>
          <SectionLabel label="메모" count={data.notes.length} dim />
          <div className="mt-2 rounded-[20px] border border-line bg-card px-4 shadow-card">
            {data.notes.map((note, i) => (
              <Link
                key={note.logId}
                href={`/items/${note.itemId}`}
                className={cn(
                  'block px-0.5 py-3.5',
                  i === data.notes.length - 1 || 'border-b border-line',
                )}
              >
                <p className="text-[14.5px] leading-[1.5] text-ink-2">
                  “<Highlight text={note.note} query={debounced} />”
                </p>
                <p className="mt-[5px] text-12 text-ink-3">
                  {note.itemName} · {formatShortDate(note.doneOn)}
                </p>
              </Link>
            ))}
          </div>
        </>
      ) : null}

      {empty ? (
        <p className="mt-16 text-center text-14 leading-[1.8] text-ink-3">
          “{debounced}”와 맞는 게 없어요.
          <br />
          다른 말로 찾아보시겠어요?
        </p>
      ) : null}
    </main>
  );
}

function ItemHit({ item, query, last }: { item: Item; query: string; last: boolean }) {
  const overdue = (item.daysUntilDue ?? 0) < 0;
  const due = (item.daysUntilDue ?? 99) <= 0;

  return (
    <Link
      href={`/items/${item.id}`}
      className={cn('flex items-center gap-2.5 px-0.5 py-3.5', last || 'border-b border-line')}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-15.5 font-semibold text-ink">
          <Highlight text={item.name} query={query} />
        </span>
        <span className="mt-1 block text-12 text-ink-3">
          {item.daysSinceLastDone !== null ? `${item.daysSinceLastDone}일 전` : '기록 없음'} ·{' '}
          {describeCadence(item.cadence)}
        </span>
      </span>
      <span
        className={cn(
          'shrink-0 text-13',
          due ? 'font-bold' : 'font-semibold',
          overdue ? 'text-danger' : due ? 'text-action' : 'text-ink-3',
        )}
      >
        {formatDueBadge(item.daysUntilDue)}
      </span>
    </Link>
  );
}

/** 찾은 글자에 옅은 배경을 깐다 — 설계 05-D 의 mark. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;

  const at = text.toLowerCase().indexOf(query.toLowerCase());
  if (at < 0) return <>{text}</>;

  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[4px] bg-accent-soft px-0.5 text-inherit">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}

function SectionLabel({ label, count, dim }: { label: string; count: number; dim?: boolean }) {
  return (
    <div className="mt-5 flex items-baseline gap-1.5 px-1">
      <span className={cn('text-13 font-bold', dim ? 'text-ink-2' : 'text-ink')}>{label}</span>
      <span className="text-12.5 text-ink-3">{count}</span>
    </div>
  );
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </svg>
  );
}
