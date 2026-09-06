import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  AI_SERVICE_URL: z.string().url(),
  AI_SERVICE_TOKEN: z.string().min(1),

  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().default('mailto:team@lastly.app'),

  /** capture 초안 토큰 서명 키. */
  DRAFT_TOKEN_SECRET: z.string().min(16).default('dev-draft-secret-change-me'),
});

export type Env = z.infer<typeof envSchema>;
