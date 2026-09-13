-- 가입을 권한 적이 있는지 남긴다.
--
-- 로그인 없이 쓸 수 있게 하면서, 기록이 쌓였을 때 한 번 권한다.
-- 같은 이유로 두 번 묻지 않으려면 무엇을 이미 물었는지 기억해야 한다.
--
-- 쿠키가 아니라 여기 두는 이유: 익명 계정도 auth.users 에 진짜 행이 있어
-- 프로필을 가진다. 기기를 옮겨도 따라오고, 브라우저를 비워도 계정이 살아 있으면 남는다.
alter table public.profiles
  add column signup_prompts_seen text[] not null default '{}';

comment on column public.profiles.signup_prompts_seen is
  '이미 보여준 가입 유도의 종류. records · notifications 등.';
