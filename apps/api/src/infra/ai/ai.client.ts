import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AiCadenceRequest, AiCadenceResponse, AiEmbedResponse, AiParseRequest, AiParseResponse } from './ai.types';

const TIMEOUT_MS = 8_000;

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

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('AI_SERVICE_URL').replace(/\/$/, '');
    this.token = config.getOrThrow<string>('AI_SERVICE_TOKEN');
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-token': this.token },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        this.logger.warn(`AI ${path} responded ${res.status}`);
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      this.logger.warn(`AI ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }
}
