import { createClient } from '@/lib/supabase/client';
import { ensureSession } from '@/lib/supabase/ensure-session';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

/**
 * apps/api 호출기.
 * 인증 토큰은 매 요청마다 Supabase 세션에서 새로 읽는다 — 갱신 타이밍을 신경 쓰지 않기 위해서.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options;

  /**
   * 연결이 없으면 시도조차 하지 않는다.
   *
   * 세션을 읽는 단계에서 멈춰 버려 오류도 안 나고 화면이 계속 기다리기만 했다.
   * 여기서 바로 끊어야 부르는 쪽이 "적어만 두기" 같은 대비를 할 수 있다.
   */
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new ApiError(0, 'offline', '연결이 끊겼어요.');
  }

  /**
   * 저장하는 요청이면 계정이 없을 때 여기서 만든다.
   *
   * 둘러보기(GET)만으로는 계정을 만들지 않는다 — 남길 것이 없는 사람에게 계정을
   * 내주지 않으려는 것이다. 기록·완료·알림 설정 어디서 시작하든 이 한 곳을 지난다.
   */
  const token =
    method === 'GET'
      ? (await createClient().auth.getSession()).data.session?.access_token
      : await ensureSession();

  const res = await fetch(`${BASE_URL}/v1${path}`, {
    method,
    signal,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const error = payload?.error;
    throw new ApiError(
      res.status,
      error?.code ?? 'UNKNOWN',
      error?.message ?? '잠시 후 다시 시도해 주세요.',
    );
  }

  return payload as T;
}
