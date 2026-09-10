import { z } from 'zod';

/**
 * 사용자가 직접 등록하는 AI 제공자 키.
 *
 * 이 앱은 수익이 없어 서버가 모든 사용자의 AI 비용을 대신 낼 수 없다.
 * 각자 자기 키를 등록해 자기 몫만 쓴다.
 */
export const aiProviderSchema = z.enum(['anthropic', 'openai', 'gemini']);
export type AiProvider = z.infer<typeof aiProviderSchema>;

export const saveAiCredentialSchema = z.object({
  provider: aiProviderSchema,
  /** 원문 키. 저장 시 암호화되며 이후 어떤 응답에도 다시 담기지 않는다. */
  apiKey: z.string().min(20).max(400),
});
export type SaveAiCredentialInput = z.infer<typeof saveAiCredentialSchema>;

export const aiCredentialSchema = z.object({
  provider: aiProviderSchema,
  /** "sk-ant-…4f2a" 처럼 앞뒤만 남긴 표시용 문자열. */
  keyHint: z.string(),
  updatedAt: z.string(),
});
export type AiCredential = z.infer<typeof aiCredentialSchema>;

/** 등록 전이면 credential 이 null. 화면이 "AI 연결 필요" 안내를 띄우는 기준이다. */
export const aiCredentialStatusSchema = z.object({
  credential: aiCredentialSchema.nullable(),
  /**
   * 키를 등록하기 전에 서버 키로 더 쓸 수 있는 횟수.
   * 키를 등록했으면 의미가 없으므로 0 으로 내려간다.
   */
  trialRemaining: z.number().int().min(0),
});
export type AiCredentialStatus = z.infer<typeof aiCredentialStatusSchema>;
