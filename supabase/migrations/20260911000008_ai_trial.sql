-- 키를 등록하기 전에 서버 키로 몇 번 써 볼 수 있게 한다.
--
-- 키부터 만들어 오라고 하면 대부분 그 자리에서 떠난다. 무엇을 하는 앱인지
-- 겪어 본 뒤에 결정하게 하려는 것이다. 서버가 내는 비용이므로 횟수는 짧게 둔다.
alter table public.profiles
  add column ai_trial_used integer not null default 0;

comment on column public.profiles.ai_trial_used is
  '서버 키로 AI를 부른 횟수. 무료 체험 한도를 넘으면 사용자가 자기 키를 등록해야 한다.';
