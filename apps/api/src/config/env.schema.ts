import { z } from 'zod';

/** URL-safe base64. 끝의 `=` 패딩이 없어야 한다. */
const VAPID_KEY = /^[A-Za-z0-9_-]{20,}$/;
const VAPID_HINT = 'VAPID 키 형식이 아닙니다. `npx web-push generate-vapid-keys` 로 만드세요.';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  /**
   * 서버가 제공하는 기본 키. 이게 있으면 사용자는 아무것도 등록하지 않아도 된다.
   *
   * Gemini 무료 등급을 쓴다 — 셋 중 유일하게 카드 없이 발급되고,
   * 규칙이 대부분을 처리해 남는 호출이 드물어 한도 안에 들어간다.
   */
  GEMINI_API_KEY: z.string().optional(),

  /** 예전 기본 키. GEMINI_API_KEY 가 없을 때만 쓴다. */
  ANTHROPIC_API_KEY: z.string().optional(),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  AI_SERVICE_URL: z.string().url(),
  AI_SERVICE_TOKEN: z.string().min(1),

  /**
   * 웹푸시 키. 형식까지 본다.
   *
   * 문자열이기만 하면 통과시키면 .env.example 의 자리표시자가 그대로 들어가고,
   * 한참 뒤 web-push 안에서 "Vapid public key must be a URL safe Base 64" 로
   * 터진다. 그 메시지로는 무엇을 해야 할지 알 수 없다.
   */
  VAPID_PUBLIC_KEY: z.string().regex(VAPID_KEY, VAPID_HINT),
  VAPID_PRIVATE_KEY: z.string().regex(VAPID_KEY, VAPID_HINT),
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

/**
 * 기동 시 환경변수를 검증한다.
 *
 * zod 의 기본 오류는 JSON 덤프라, 처음 띄우는 사람이 무엇을 채워야 하는지
 * 알아보기 어렵다. 빠진 이름과 이유만 줄 단위로 정리해서 던진다.
 */
export function parseEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const lines = result.error.issues.map((i) => `  ${i.path.join('.')} — ${i.message}`);

  throw new Error(
    [
      '환경변수가 준비되지 않았습니다. .env 를 확인하세요.',
      ...lines,
      '',
      '자세한 건 README 의 "필요한 외부 키" 와 docs/SETUP.md 를 보세요.',
    ].join('\n'),
  );
}
