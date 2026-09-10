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

/** trial 이면 서버 키를 빌려 쓰는 중이다. 호출이 성공하면 횟수를 하나 센다. */
export interface ResolvedCaller {
  provider: AiProvider;
  apiKey: string;
  trial: boolean;
}

interface CredentialRow {
  provider: AiProvider;
  encrypted_key: string;
  key_hint: string;
  updated_at: string;
}

/**
 * 키를 등록하기 전에 서버 키로 써 볼 수 있는 횟수.
 *
 * 키부터 만들어 오라고 하면 대부분 그 자리에서 떠난다. 무엇을 하는 앱인지
 * 겪어 본 뒤 결정하게 하려는 것이다. 서버가 내는 비용이라 짧게 둔다.
 */
const TRIAL_LIMIT = 3;

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

  /** 화면이 "무료 N번 남음" 을 보여줄 때 쓴다. */
  async status(userId: string): Promise<AiCredentialStatus> {
    const credential = await this.find(userId);
    return {
      credential,
      trialRemaining: credential ? 0 : await this.trialRemaining(userId),
    };
  }

  private async trialRemaining(userId: string): Promise<number> {
    // 서버 키가 없으면 체험 자체가 불가능하다.
    if (!this.config.get<string>('ANTHROPIC_API_KEY')) return 0;

    const { data } = await this.supabase.admin
      .from('profiles')
      .select('ai_trial_used')
      .eq('id', userId)
      .maybeSingle<{ ai_trial_used: number }>();

    return Math.max(0, TRIAL_LIMIT - (data?.ai_trial_used ?? 0));
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
        return { provider: data.provider, apiKey: this.box.open(data.encrypted_key), trial: false };
      } catch {
        // 비밀값이 바뀌었거나 저장된 값이 깨졌다. 키 내용은 로그에 남기지 않는다.
        this.logger.error(`저장된 AI 키를 풀 수 없습니다: user=${userId}`);
        return null;
      }
    }

    // 등록 전이면 남은 체험 횟수만큼 서버 키를 빌려준다.
    const serverKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!serverKey || (await this.trialRemaining(userId)) <= 0) return null;

    return { provider: 'anthropic', apiKey: serverKey, trial: true };
  }

  /**
   * 체험 한 번을 쓴 것으로 센다.
   *
   * AI 가 실제로 답했을 때만 부른다. 잠든 서버를 깨우다 실패한 것까지 세면
   * 써 보지도 못하고 횟수가 사라진다.
   */
  async consumeTrial(userId: string): Promise<void> {
    const { data } = await this.supabase.admin
      .from('profiles')
      .select('ai_trial_used')
      .eq('id', userId)
      .maybeSingle<{ ai_trial_used: number }>();

    await this.supabase.admin
      .from('profiles')
      .update({ ai_trial_used: (data?.ai_trial_used ?? 0) + 1 })
      .eq('id', userId);
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
