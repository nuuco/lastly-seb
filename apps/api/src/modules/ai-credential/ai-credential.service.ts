import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  AiCredential,
  AiCredentialStatus,
  AiProvider,
  SaveAiCredentialInput,
} from '@lastly/contracts';

import { SecretBoxService } from '../../infra/crypto/secret-box.service';
import { SupabaseService } from '../../infra/supabase/supabase.service';

export interface ResolvedCaller {
  provider: AiProvider;
  apiKey: string;
}

interface CredentialRow {
  provider: AiProvider;
  encrypted_key: string;
  key_hint: string;
  updated_at: string;
}

/** 제공자별로 "이 키가 진짜 되는가" 를 확인하는 가장 싼 호출. */
const PROBES: Record<AiProvider, (key: string) => { url: string; init: RequestInit }> = {
  anthropic: (key) => ({
    url: 'https://api.anthropic.com/v1/models?limit=1',
    init: { headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' } },
  }),
  openai: (key) => ({
    url: 'https://api.openai.com/v1/models?limit=1',
    init: { headers: { authorization: `Bearer ${key}` } },
  }),
  gemini: (key) => ({
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    init: { headers: { 'x-goog-api-key': key } },
  }),
};

/**
 * 사용자별 AI 키를 맡아 둔다.
 *
 * 원문은 어떤 응답에도 담기지 않는다. 저장 후 사용자가 다시 볼 수 있는 것은
 * 가림 문자열뿐이고, 원문을 꺼내는 곳은 AI 를 실제로 부르는 자리 하나다.
 */
@Injectable()
export class AiCredentialService {
  private readonly logger = new Logger(AiCredentialService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly box: SecretBoxService,
    private readonly config: ConfigService,
  ) {}

  private get table() {
    return this.supabase.admin.from('ai_credentials');
  }

  async status(userId: string): Promise<AiCredentialStatus> {
    return {
      credential: await this.find(userId),
      serverKeyAvailable: this.serverCaller() !== null,
    };
  }

  /**
   * 서버가 들고 있는 기본 자격. 사용자가 등록하지 않았을 때 이걸 쓴다.
   *
   * Gemini 를 먼저 본다. 무료 등급이 있어 비용이 들지 않는 쪽이다.
   */
  private serverCaller(): ResolvedCaller | null {
    const gemini = this.config.get<string>('GEMINI_API_KEY');
    if (gemini) return { provider: 'gemini', apiKey: gemini };

    const anthropic = this.config.get<string>('ANTHROPIC_API_KEY');
    if (anthropic) return { provider: 'anthropic', apiKey: anthropic };

    return null;
  }

  async find(userId: string): Promise<AiCredential | null> {
    const { data, error } = await this.table
      .select('provider, key_hint, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return { provider: data.provider, keyHint: data.key_hint, updatedAt: data.updated_at };
  }

  /**
   * 키를 저장하기 전에 한 번 써 본다.
   *
   * 오타 난 키를 그대로 받아 두면, 사용자는 등록에 성공했다고 믿고 있다가
   * 기록할 때마다 조용히 실패하는 것만 겪는다. 틀렸다는 사실은 지금 알려야 한다.
   */
  async save(userId: string, input: SaveAiCredentialInput): Promise<AiCredential> {
    const key = input.apiKey.trim();
    await this.verify(input.provider, key);

    const { error } = await this.table.upsert(
      {
        user_id: userId,
        provider: input.provider,
        encrypted_key: this.box.seal(key),
        key_hint: this.box.hint(key),
      },
      { onConflict: 'user_id' },
    );

    if (error) throw error;
    return (await this.find(userId))!;
  }

  async remove(userId: string): Promise<void> {
    const { error } = await this.table.delete().eq('user_id', userId);
    if (error) throw error;
  }

  /** AI 를 부를 때만 쓴다. 이 값이 컨트롤러 밖으로 나가는 길은 없다. */
  async resolve(userId: string): Promise<ResolvedCaller | null> {
    const { data, error } = await this.table
      .select('provider, encrypted_key')
      .eq('user_id', userId)
      .maybeSingle<Pick<CredentialRow, 'provider' | 'encrypted_key'>>();

    if (error) throw error;

    if (data) {
      try {
        return { provider: data.provider, apiKey: this.box.open(data.encrypted_key) };
      } catch {
        // 비밀값이 바뀌었거나 저장된 값이 깨졌다. 키 내용은 로그에 남기지 않는다.
        this.logger.error(`저장된 AI 키를 풀 수 없습니다: user=${userId}`);
        return null;
      }
    }

    // 등록하지 않았으면 서버 키로 돌린다. 횟수 제한은 두지 않는다.
    return this.serverCaller();
  }

  private async verify(provider: AiProvider, key: string): Promise<void> {
    const { url, init } = PROBES[provider](key);

    let response: Response;
    try {
      response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new BadRequestException(
        '제공자에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new BadRequestException('키가 올바르지 않아요. 다시 확인해 주세요.');
    }

    if (!response.ok) {
      throw new BadRequestException(
        `제공자가 키를 확인해 주지 못했어요 (${response.status}). 잠시 후 다시 시도해 주세요.`,
      );
    }
  }
}
