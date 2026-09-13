-- 사용자별 AI 키 등록을 걷어낸다.
--
-- 서버가 Gemini 무료 등급 키를 들고 있어 각자 등록할 이유가 없어졌다.
-- 규칙 파서가 의도·날짜·주기·이름을 먼저 처리해 LLM 까지 가는 문장이 드물고,
-- 그마저 cadence_priors 에 캐시되어 무료 한도 안에서 돈다.
--
-- 남의 자격증명을 쓰지도 않으면서 보관하지 않는다. 저장된 암호문도 함께 지운다.
drop table if exists public.ai_credentials;
drop type if exists public.ai_provider;

alter table public.profiles
  drop column if exists ai_trial_used;
