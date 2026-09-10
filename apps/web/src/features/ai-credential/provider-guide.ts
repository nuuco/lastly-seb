import type { AiProvider } from '@lastly/contracts';

/**
 * 키를 어디서 받는지, 무엇이 다른지.
 *
 * 고르기 전에 알아야 할 것만 적는다. 특히 카드 등록 여부는 일반 사용자에게
 * 가장 큰 문턱이라 숨기지 않는다.
 */
export const PROVIDERS: Array<{
  id: AiProvider;
  label: string;
  hint: string;
  note: string;
  url: string;
  prefix: string;
}> = [
  {
    id: 'gemini',
    label: 'Gemini',
    hint: 'Google',
    note: '무료로 시작할 수 있어요. 카드 등록 없이 키를 받습니다.',
    url: 'https://aistudio.google.com/apikey',
    prefix: 'AIza…',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    hint: 'Anthropic',
    note: '주기를 웹에서 찾아 제안하는 기능이 가장 잘 동작해요. 선불 충전이 필요합니다.',
    url: 'https://console.anthropic.com/settings/keys',
    prefix: 'sk-ant-…',
  },
  {
    id: 'openai',
    label: 'GPT',
    hint: 'OpenAI',
    note: '선불 충전이 필요합니다.',
    url: 'https://platform.openai.com/api-keys',
    prefix: 'sk-…',
  },
];
