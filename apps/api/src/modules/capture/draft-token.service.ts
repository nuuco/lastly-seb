import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

/** interpret 시점에 확정한 값. commit이 AI를 다시 부르지 않도록 서명해 넘긴다. */
export interface DraftPayload {
  userId: string;
  rawInput: string;
  normalizedName: string | null;
  doneOn: string;
  matchedItemId: string | null;
  mode: 'voice' | 'text';
  issuedAt: number;
}

const TTL_MS = 10 * 60 * 1000;

@Injectable()
export class DraftTokenService {
  private readonly secret: string;

  constructor(config: ConfigService) {
    this.secret = config.getOrThrow<string>('DRAFT_TOKEN_SECRET');
  }

  sign(payload: DraftPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }

  verify(token: string, userId: string): DraftPayload {
    const [body, mac] = token.split('.');
    if (!body || !mac) throw new BadRequestException('입력 정보가 만료되었어요. 다시 말해주세요.');

    const expected = Buffer.from(this.mac(body));
    const actual = Buffer.from(mac);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new BadRequestException('입력 정보가 올바르지 않아요.');
    }

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as DraftPayload;

    if (payload.userId !== userId) throw new BadRequestException('입력 정보가 올바르지 않아요.');
    if (Date.now() - payload.issuedAt > TTL_MS) {
      throw new BadRequestException('입력 정보가 만료되었어요. 다시 말해주세요.');
    }

    return payload;
  }

  private mac(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
