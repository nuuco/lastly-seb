-- 파생값 계산 함수 + RLS 정책

-- ─────────────────────────────────────────────────────────────
-- 다음 예정일 계산. apps/api의 CadenceService와 반드시 같은 규칙이어야 한다.
--   week + weekdays가 있으면: 기준일 + interval주 이후, 지정 요일 중 가장 이른 날
--   그 외: 단순 덧셈
-- ─────────────────────────────────────────────────────────────
create or replace function public.calc_next_due(
  p_from      date,
  p_unit      public.cadence_unit,
  p_interval  integer,
  p_weekdays  smallint[]
) returns date
language plpgsql
immutable
as $$
declare
  v_base    date;
  v_target  smallint;
  v_delta   integer;
  v_best    date;
begin
  if p_from is null then
    return null;
  end if;

  v_base := case p_unit
    when 'day'   then p_from + (p_interval || ' days')::interval
    when 'week'  then p_from + (p_interval || ' weeks')::interval
    when 'month' then p_from + (p_interval || ' months')::interval
  end::date;

  if p_unit <> 'week' or cardinality(p_weekdays) = 0 then
    return v_base;
  end if;

  -- 지정 요일 중 v_base 이후(당일 포함) 가장 이른 날로 스냅한다.
  v_best := null;
  foreach v_target in array p_weekdays loop
    v_delta := (v_target - extract(dow from v_base)::integer + 7) % 7;
    if v_best is null or v_base + v_delta < v_best then
      v_best := v_base + v_delta;
    end if;
  end loop;

  return coalesce(v_best, v_base);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- 기록이 바뀔 때마다 items의 캐시 컬럼을 다시 계산한다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.refresh_item_stats() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item_id uuid := coalesce(new.item_id, old.item_id);
  v_last    date;
  v_count   integer;
  v_avg     numeric(6,2);
begin
  select max(done_on), count(*)
    into v_last, v_count
    from public.item_logs
   where item_id = v_item_id;

  -- 평균 간격은 연속한 기록 사이 간격의 평균. 기록 2개 미만이면 계산 불가.
  select avg(gap)::numeric(6,2)
    into v_avg
    from (
      select done_on - lag(done_on) over (order by done_on) as gap
        from public.item_logs
       where item_id = v_item_id
    ) g
   where gap is not null;

  update public.items i
     set last_done_on          = v_last,
         log_count             = v_count,
         average_interval_days = v_avg,
         next_due_on           = public.calc_next_due(
                                   v_last, i.cadence_unit, i.cadence_interval, i.cadence_weekdays
                                 ),
         updated_at            = now()
   where i.id = v_item_id;

  return null;
end;
$$;

create trigger item_logs_refresh_stats
  after insert or update or delete on public.item_logs
  for each row execute function public.refresh_item_stats();

-- 주기 자체가 바뀌어도 다음 예정일을 다시 잡는다.
create or replace function public.reapply_cadence() returns trigger
language plpgsql
as $$
begin
  new.next_due_on := public.calc_next_due(
    new.last_done_on, new.cadence_unit, new.cadence_interval, new.cadence_weekdays
  );
  new.updated_at := now();
  return new;
end;
$$;

create trigger items_reapply_cadence
  before update of cadence_unit, cadence_interval, cadence_weekdays, last_done_on
  on public.items
  for each row execute function public.reapply_cadence();

-- 신규 가입 시 프로필 자동 생성
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'name',
      new.raw_user_meta_data ->> 'full_name',
      split_part(coalesce(new.email, ''), '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────
-- 유사 항목 검색 RPC — AI 매칭이 쓰는 진입점.
-- 임베딩 코사인 유사도와 트라이그램 유사도를 함께 본다.
-- ─────────────────────────────────────────────────────────────
create or replace function public.match_items(
  p_user_id   uuid,
  p_query     text,
  p_embedding extensions.vector(1536),
  p_limit     integer default 5
) returns table (
  item_id      uuid,
  name         text,
  similarity   real,
  last_done_on date
)
language sql
stable
set search_path = public, extensions
as $$
  select
    i.id,
    i.name,
    greatest(
      case when p_embedding is null or i.name_embedding is null
           then 0
           else 1 - (i.name_embedding <=> p_embedding) end,
      similarity(i.name, p_query),
      -- 이미 학습된 별칭에 걸리면 만점에 가깝게 본다.
      coalesce((
        select 0.97 from public.item_aliases a
         where a.item_id = i.id and a.phrase = p_query
      ), 0)
    )::real as similarity,
    i.last_done_on
  from public.items i
  where i.user_id = p_user_id
    and i.status = 'active'
  order by similarity desc
  limit p_limit;
$$;

-- ─────────────────────────────────────────────────────────────
-- RLS — 사용자는 자기 행만 본다.
-- ─────────────────────────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.items              enable row level security;
alter table public.item_aliases       enable row level security;
alter table public.item_logs          enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications      enable row level security;
alter table public.cadence_priors     enable row level security;

create policy "own profile" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own items" on public.items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own aliases" on public.item_aliases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own logs" on public.item_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own subscriptions" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own notifications" on public.notifications
  for select using (auth.uid() = user_id);

-- 주기 사전은 공용 읽기 전용. 쓰기는 service_role(AI 서비스)만.
create policy "priors are public read" on public.cadence_priors
  for select using (true);
