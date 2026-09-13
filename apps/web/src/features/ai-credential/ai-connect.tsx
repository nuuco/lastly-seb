'use client';

import type { AiProvider } from '@lastly/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { cn } from '@/lib/cn';
import { aiCredentialApi } from '@/lib/api/ai-credential';

import { PROVIDERS } from './provider-guide';

/**
 * AI 연결.
 *
 * 등록은 선택이다. 서버가 무료 등급 키를 두고 있어 아무것도 하지 않아도 동작한다.
 * 자기 키로 쓰고 싶거나 다른 제공자를 쓰고 싶은 사람을 위한 화면이다.
 *
 * 키는 저장된 뒤 다시 화면으로 내려오지 않는다. 사용자가 볼 수 있는 것은
 * "내가 넣은 그 키가 맞나" 를 확인할 만큼의 가림 문자열뿐이다.
 */
export function AiConnect({ onDone }: { onDone?: () => void }) {
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<AiProvider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const status = useQuery({ queryKey: ['ai-credential'], queryFn: aiCredentialApi.status });
  const current = status.data?.credential ?? null;
  const serverKey = status.data?.serverKeyAvailable ?? false;

  const save = useMutation({
    mutationFn: () => aiCredentialApi.save({ provider, apiKey: apiKey.trim() }),
    onSuccess: async () => {
      setApiKey('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['ai-credential'] });
      onDone?.();
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: aiCredentialApi.remove,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ai-credential'] }),
  });

  if (current) {
    const meta = PROVIDERS.find((p) => p.id === current.provider);
    return (
      <div className="rounded-card border border-line bg-card p-5 shadow-card">
        <p className="text-12.5 font-bold tracking-wide2 text-ink-3">연결된 AI</p>
        <p className="mt-2 text-17 font-bold tracking-t25 text-ink">{meta?.label ?? current.provider}</p>
        <p className="mt-1 font-mono text-13 text-ink-3">{current.keyHint}</p>

        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="mt-4 h-11 w-full rounded-md border border-line bg-card text-14 font-semibold text-danger disabled:opacity-60"
        >
          {remove.isPending ? '해제하는 중…' : '연결 해제'}
        </button>
      </div>
    );
  }

  const picked = PROVIDERS.find((p) => p.id === provider)!;

  return (
    <div>
      {/**
       * 등록하지 않아도 된다는 말을 가장 먼저 한다.
       * 이 화면에 들어온 사람은 대개 "해야 하나?" 를 확인하러 온 것이다.
       */}
      <div
        className={cn(
          'mb-4 rounded-md border px-4 py-3.5',
          serverKey ? 'border-line bg-card' : 'border-line bg-accent-soft',
        )}
      >
        <p
          className={cn('text-[14.5px] font-bold', serverKey ? 'text-ink' : 'text-action-pressed')}
        >
          {serverKey ? '연결하지 않아도 쓸 수 있어요' : 'AI 연결이 필요해요'}
        </p>
        <p className="mt-1.5 break-keep text-13 leading-[1.7] text-ink-2">
          {serverKey
            ? '기본 제공되는 AI 로 동작하고 있어요. 내 키로 쓰고 싶을 때만 아래에서 연결하세요.'
            : '지금은 기본 AI 가 꺼져 있어요. 아래에서 하나 골라 연결해 주세요.'}
        </p>
      </div>

      <div className="flex gap-2">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setProvider(p.id);
              setError(null);
            }}
            className={cn(
              'flex-1 rounded-md border py-3 text-center',
              provider === p.id ? 'border-action bg-accent-soft' : 'border-line bg-card',
            )}
          >
            <span
              className={cn(
                'block text-15 font-bold',
                provider === p.id ? 'text-accent-ink' : 'text-ink',
              )}
            >
              {p.label}
            </span>
            <span className="mt-0.5 block text-11 text-ink-3">{p.hint}</span>
          </button>
        ))}
      </div>

      <p className="mt-3 break-keep text-13.5 leading-[1.7] text-ink-2">{picked.note}</p>

      <a
        href={picked.url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-block text-13 font-semibold text-accent-ink underline underline-offset-4"
      >
        {picked.label} 키 받으러 가기
      </a>

      <input
        type="password"
        value={apiKey}
        onChange={(e) => {
          setApiKey(e.target.value);
          setError(null);
        }}
        placeholder={picked.prefix}
        autoComplete="off"
        spellCheck={false}
        className="mt-4 w-full rounded-md border border-line bg-card px-4 py-3.5 font-mono text-15 text-ink outline-none focus:border-action placeholder:font-sans placeholder:text-ink-3"
      />

      {error ? <p className="mt-2 text-13 leading-[1.6] text-danger">{error}</p> : null}

      <button
        type="button"
        onClick={() => save.mutate()}
        disabled={save.isPending || apiKey.trim().length < 20}
        className="mt-3 flex h-[52px] w-full items-center justify-center rounded-lg bg-action text-16 font-semibold text-white shadow-action active:bg-action-pressed disabled:opacity-60"
      >
        {save.isPending ? '확인하는 중…' : '연결하기'}
      </button>

      <p className="mt-3 break-keep text-12 leading-[1.7] text-ink-3">
        키는 암호화해서 보관하고, 저장한 뒤에는 다시 보여드리지 않아요. 연결하면 요금은
        각자 계정으로 청구돼요.
      </p>
    </div>
  );
}
