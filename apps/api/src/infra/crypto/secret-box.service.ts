import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 남의 자격증명을 저장하기 위한 봉투.
 *
 * AES-256-GCM 을 쓴다. GCM 은 복호화할 때 위조 여부까지 확인해 주므로,
 * DB 의 암호문이 한 글자라도 바뀌면 조용히 이상한 값이 나오는 대신 예외가 난다.
 *
 * 키는 서버 환경변수에만 있다. DB 가 통째로 새어도 이 값 없이는 풀 수 없다.
 */
@Injectable()
export class SecretBoxService {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const raw = config.getOrThrow<string>('CREDENTIALS_SECRET');
    this.key = Buffer.from(raw, 'base64');

    if (this.key.length !== 32) {
      throw new Error('CREDENTIALS_SECRET 은 base64 로 인코딩한 32바이트여야 합니다.');
    }
  }

  /** iv:tag:ciphertext 를 base64 로 이어 붙인 한 줄. */
  seal(plain: string): string {
    // GCM 의 nonce 는 매번 달라야 한다. 재사용하면 암호가 통째로 무너진다.
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);

    return [iv, cipher.getAuthTag(), body].map((b) => b.toString('base64')).join(':');
  }

  open(sealed: string): string {
    const [iv, tag, body] = sealed.split(':').map((part) => Buffer.from(part, 'base64'));
    if (!iv || !tag || !body) throw new Error('저장된 값의 형식이 올바르지 않습니다.');

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  }

  /**
   * 화면에 보여줄 가림 문자열.
   * 사용자가 "내가 넣은 그 키가 맞나" 를 확인할 만큼만 남기고 나머지는 버린다.
   */
  hint(plain: string): string {
    if (plain.length <= 12) return '…';
    return `${plain.slice(0, 7)}…${plain.slice(-4)}`;
  }
}
