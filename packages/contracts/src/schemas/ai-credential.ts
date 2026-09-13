import { z } from 'zod';

/**
 * 사용자가 직접 등록하는 AI 제공자 키.
 *
 * 등록은 선택이다. 서버가 무료 등급 키를 두고 있어 등록하지 않아도 동작한다.
 * 자기 키를 쓰고 싶거나 다른 제공자를 쓰고 싶은 사람을 위한 길이다.
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

export const aiCredentialStatusSchema = z.object({
  /** 등록한 키. 없으면 서버 키로 동작한다. */
  credential: aiCredentialSchema.nullable(),
  /**
   * 등록하지 않아도 쓸 수 있는지.
   * false 면 서버에 키가 없다는 뜻이라, 각자 등록해야 해석이 동작한다.
   */
  serverKeyAvailable: z.boolean(),
});
export type AiCredentialStatus = z.infer<typeof aiCredentialStatusSchema>;
