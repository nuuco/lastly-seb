import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  /**
   * 사용자 AI 키를 암호화하는 비밀값. base64 로 인코딩한 32바이트.
   *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   * 이 값을 잃으면 저장된 키를 아무도 풀 수 없다. 사용자가 다시 등록해야 한다.
   */
  CREDENTIALS_SECRET: z.string().min(44),

  /**
   * 무료 체험용 서버 키. 없으면 체험 없이 각자 키만 쓴다.
   * 사용자가 자기 키를 등록하기 전 몇 번만 이 키로 대신 부른다.
   */
  ANTHROPIC_API_KEY: z.string().optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  AI_SERVICE_URL: z.string().url(),
  AI_SERVICE_TOKEN: z.string().min(1),

  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().default('mailto:team@lastly.app'),

  /** capture 초안 토큰 서명 키. */
  DRAFT_TOKEN_SECRET: z.string().min(16).default('dev-draft-secret-change-me'),

  /**
   * 서버 안의 시계로 알림 배치를 돌릴지.
   * 무료 호스팅은 접속이 없으면 서버를 재우므로 배포 환경에서는 끄고
   * 밖에서 /v1/internal/dispatch-digests 를 두드린다.
   */
  ENABLE_CRON: z.enum(['true', 'false']).default('true'),

  /** 위 엔드포인트를 지키는 공유 비밀. 비워두면 엔드포인트가 열리지 않는다. */
  CRON_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
