-- 사용자별 AI 제공자 키.
--
-- 남의 자격증명이므로 평문으로 두지 않는다. api 가 AES-256-GCM 으로 암호화해
-- 넣고 꺼낼 때 푼다. DB 만 새어도 키 자체는 쓸 수 없다.
--
-- RLS 로 authenticated 를 전부 막는다. 사용자는 자기 행조차 직접 읽지 못하고,
-- service_role 로 붙는 api 만 접근한다. PostgREST 로 암호문이 새어 나갈 길을
-- 아예 닫아두기 위해서다. 화면에는 api 가 만들어 준 가림 문자열만 보여준다.

create type public.ai_provider as enum ('anthropic', 'openai', 'gemini');

create table public.ai_credentials (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  provider      public.ai_provider not null,
  -- base64(iv) : base64(authTag) : base64(ciphertext)
  encrypted_key text        not null,
  -- "sk-ant-…4f2a" 처럼 앞뒤만 남긴 표시용. 원문 복구 불가.
  key_hint      text        not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.ai_credentials is
  '사용자가 등록한 AI 제공자 키. 암호문만 저장하며 service_role 로만 접근한다.';

alter table public.ai_credentials enable row level security;

-- 정책을 하나도 만들지 않는다. RLS 가 켜진 채 정책이 없으면 authenticated 는
-- 아무것도 못 하고, service_role 은 RLS 를 우회하므로 api 만 읽고 쓴다.

create or replace function public.touch_ai_credentials() returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger ai_credentials_touch
  before update on public.ai_credentials
  for each row execute function public.touch_ai_credentials();
