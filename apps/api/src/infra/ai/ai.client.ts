import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AiCadenceRequest, AiCadenceResponse, AiEmbedResponse, AiParseRequest, AiParseResponse } from './ai.types';

/** 깨어 있는 AI는 1초 안에 답한다. 이걸 넘기면 자고 있다고 본다. */
const TIMEOUT_MS = 8_000;

/**
 * 무료 호스팅은 15분 놀면 컨테이너를 재운다. 다시 깨는 데 20초 남짓 걸려서,
 * 한 번만 시도하면 '한동안 안 쓰다가 처음 하는 기록'은 매번 인식에 실패한다.
 * 컨테이너가 없다고 판단됐을 때 이 예산 안에서 깨어나기를 기다린다.
 */
const COLD_START_TIMEOUT_MS = 30_000;

/** 이 시간 안에 이미 깨워봤으면 다시 두드리지 않는다. */
const WARMUP_INTERVAL_MS = 5 * 60_000;

/**
 * 자고 있는 컨테이너 앞에서 프록시가 내는 상태값.
 * 서비스가 낸 답이 아니라 "아직 없다"는 뜻이므로 다시 부르면 된다.
 */
const GATEWAY_STATUSES = new Set([502, 503, 504]);

/** 502가 즉시 돌아오므로 곧바로 다시 부르면 의미 없이 두드리기만 한다. */
const RETRY_DELAY_MS = 1_500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

/**
 * apps/ai (FastAPI) 호출 클라이언트.
 * AI는 거들 뿐이라 실패해도 기능 전체가 멈추면 안 된다.
 * 각 메서드는 실패 시 null을 돌려주고, 호출부가 규칙 기반으로 폴백한다.
 */
@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private lastWarmUpAt = 0;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('AI_SERVICE_URL').replace(/\/$/, '');
    this.token = config.getOrThrow<string>('AI_SERVICE_TOKEN');
  }

  /**
   * 잠들어 있을 AI를 미리 깨운다. 응답을 기다리지 않는다.
   *
   * 홈을 열 때 불러두면, 사용자가 문장을 말하고 누르기까지의 몇 초 동안
   * 컨테이너가 먼저 뜬다. 첫 기록에서 30초를 기다리는 일이 사실상 없어진다.
   * 실패해도 아무것도 하지 않는다 — 어차피 진짜 호출이 다시 시도한다.
   */
  warmUp(): void {
    const now = Date.now();
    if (now - this.lastWarmUpAt < WARMUP_INTERVAL_MS) return;
    this.lastWarmUpAt = now;

    fetch(`${this.baseUrl}/healthz`, { signal: AbortSignal.timeout(COLD_START_TIMEOUT_MS) }).catch(
      () => undefined,
    );
  }

  parseUtterance(body: AiParseRequest) {
    return this.post<AiParseResponse>('/v1/parse', body);
  }

  suggestCadence(body: AiCadenceRequest) {
    return this.post<AiCadenceResponse>('/v1/cadence/suggest', body);
  }

  embed(text: string) {
    return this.post<AiEmbedResponse>('/v1/embed', { text });
  }

  private async post<T>(path: string, body: unknown): Promise<T | null> {
    const first = await this.attempt<T>(path, body, TIMEOUT_MS);
    if (first.ok) return first.value;

    // 서비스가 실제로 낸 답(4xx, 500 등)이면 다시 불러도 같다.
    if (!first.unreachable) return null;

    // 깨어날 때까지 두드린다. 부팅 중에는 프록시가 502를 계속 즉시 돌려주므로
    // 한 번 더 부르는 것으로는 모자라고, 예산이 다할 때까지 기다려야 한다.
    this.logger.log(`AI ${path} 응답 없음 — 깨어나길 기다린다`);
    const deadline = Date.now() + COLD_START_TIMEOUT_MS;

    while (Date.now() < deadline) {
      await sleep(RETRY_DELAY_MS);

      const retry = await this.attempt<T>(path, body, deadline - Date.now());
      if (retry.ok) return retry.value;
      if (!retry.unreachable) return null;
    }

    return null;
  }

  private async attempt<T>(
    path: string,
    body: unknown,
    timeoutMs: number,
  ): Promise<{ ok: true; value: T } | { ok: false; unreachable: boolean }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        this.logger.warn(`AI ${path} responded ${res.status}`);
        // 자고 있는 컨테이너는 프록시가 502를 즉시 돌려준다. 시간 초과가 아니다.
        return { ok: false, unreachable: GATEWAY_STATUSES.has(res.status) };
      }
      return { ok: true, value: (await res.json()) as T };
    } catch (err) {
      this.logger.warn(`AI ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
      return { ok: false, unreachable: true };
    } finally {
      clearTimeout(timer);
    }
  }
}
