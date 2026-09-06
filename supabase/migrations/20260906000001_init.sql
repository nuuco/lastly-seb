-- Lastly 초기 스키마
-- 원칙: 모든 사용자 데이터 테이블은 user_id를 가지고 RLS로 격리한다.
--       API(service_role)는 RLS를 우회하므로 애플리케이션 레벨에서도 반드시 user_id를 건다.

-- 확장은 extensions 스키마에 둔다 (Supabase 관례).
-- public에 두면 확장이 만든 타입·함수가 PostgREST API 스키마에 그대로 노출된다.
-- 이 스키마에 있으므로 아래에서 opclass와 타입을 extensions.* 로 명시한다.
create schema if not exists extensions;
create extension if not exists vector  with schema extensions;  -- 임베딩 유사도
create extension if not exists pg_trgm with schema extensions;  -- 한글 표기 흔들림 보정

-- uuid 생성은 gen_random_uuid()(Postgres 13+ 코어)를 쓴다. uuid-ossp 확장이 필요 없다.

-- ─────────────────────────────────────────────────────────────
-- profiles : auth.users 확장
-- ─────────────────────────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  display_name    text,
  timezone        text        not null default 'Asia/Seoul',
  digest_time     time        not null default '09:00',
  weekend_enabled boolean     not null default true,
  onboarded_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- items : 관리 항목
-- ─────────────────────────────────────────────────────────────
create type public.cadence_unit   as enum ('day', 'week', 'month');
create type public.cadence_source as enum ('user', 'personal', 'community', 'default');
create type public.item_status    as enum ('active', 'archived');

create table public.items (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 60),
  status         public.item_status not null default 'active',

  -- 반복 규칙 (packages/contracts CadenceRule과 1:1)
  cadence_unit     public.cadence_unit   not null default 'week',
  cadence_interval integer               not null default 2 check (cadence_interval between 1 and 365),
  cadence_weekdays smallint[]            not null default '{}',
  notify_time      time,                 -- null이면 profiles.digest_time 사용
  cadence_source   public.cadence_source not null default 'default',

  -- 비정규화 캐시. 기록 변경 시 트리거로 재계산한다.
  last_done_on          date,
  next_due_on           date,
  average_interval_days numeric(6,2),
  log_count             integer not null default 0,

  -- AI 매칭용. 차원은 사용 모델에 맞춰 조정한다 (1536 = text-embedding-3-small).
  name_embedding extensions.vector(1536),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint items_weekdays_only_for_week
    check (cadence_unit = 'week' or cardinality(cadence_weekdays) = 0),
  constraint items_name_unique_per_user unique (user_id, name)
);

create index items_user_status_due_idx on public.items (user_id, status, next_due_on);
create index items_name_trgm_idx       on public.items using gin (name extensions.gin_trgm_ops);
create index items_embedding_idx       on public.items using hnsw (name_embedding extensions.vector_cosine_ops);

-- ─────────────────────────────────────────────────────────────
-- item_aliases : "이불 빨래" ← "이불 세탁", "이불 빨았어"
--   AI가 같은 항목으로 묶은 표현을 누적해 다음 매칭을 빠르고 싸게 만든다.
-- ─────────────────────────────────────────────────────────────
create table public.item_aliases (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  phrase     text not null,
  hit_count  integer not null default 1,
  created_at timestamptz not null default now(),
  constraint item_aliases_unique unique (user_id, phrase)
);

create index item_aliases_item_idx on public.item_aliases (item_id);

-- ─────────────────────────────────────────────────────────────
-- item_logs : 수행 기록
-- ─────────────────────────────────────────────────────────────
create table public.item_logs (
  id         uuid primary key default gen_random_uuid(),
  item_id    uuid not null references public.items(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  done_on    date not null,
  note       text check (note is null or char_length(note) <= 200),
  -- 기록 출처. 자연어 입력 원문을 남겨두면 AI 품질 개선에 쓸 수 있다.
  source     text not null default 'manual' check (source in ('manual', 'voice', 'text', 'notification')),
  raw_input  text,
  created_at timestamptz not null default now()
);

create index item_logs_item_done_idx on public.item_logs (item_id, done_on desc);
create index item_logs_user_done_idx on public.item_logs (user_id, done_on desc);

-- ─────────────────────────────────────────────────────────────
-- cadence_priors : "보통 사람들은 이 일을 얼마마다 하는가"
--   AI가 외부 근거를 조사해 채우는 공용 사전. user_id 없음 = 전역 공유.
-- ─────────────────────────────────────────────────────────────
create table public.cadence_priors (
  id             uuid primary key default gen_random_uuid(),
  canonical_name text not null unique,
  cadence_unit     public.cadence_unit not null,
  cadence_interval integer             not null,
  confidence     numeric(3,2) not null default 0.5 check (confidence between 0 and 1),
  rationale      text,
  sources        jsonb not null default '[]'::jsonb,
  -- 실사용자들이 이 항목을 실제로 얼마마다 하는지 (집계 배치가 갱신)
  observed_median_days numeric(6,2),
  observed_sample_size integer not null default 0,
  name_embedding extensions.vector(1536),
  updated_at     timestamptz not null default now()
);

create index cadence_priors_embedding_idx on public.cadence_priors using hnsw (name_embedding extensions.vector_cosine_ops);
create index cadence_priors_name_trgm_idx on public.cadence_priors using gin (canonical_name extensions.gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- push_subscriptions / notifications
-- ─────────────────────────────────────────────────────────────
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  item_id      uuid not null references public.items(id) on delete cascade,
  title        text not null,
  body         text not null,
  scheduled_at timestamptz not null,
  sent_at      timestamptz,
  action_taken text check (action_taken in ('complete', 'snooze_3d', 'snooze_weekend')),
  created_at   timestamptz not null default now()
);

create index notifications_pending_idx
  on public.notifications (scheduled_at)
  where sent_at is null;
