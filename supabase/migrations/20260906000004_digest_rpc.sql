-- 매시 정각 배치가 "지금이 알림 시간인 사용자"만 골라올 때 쓴다.
-- 사용자마다 타임존이 다르므로 비교는 각자의 로컬 시각 기준으로 한다.
create or replace function public.users_due_for_digest(p_now timestamptz)
returns table (
  user_id         uuid,
  display_name    text,
  timezone        text,
  weekend_enabled boolean
)
language sql
stable
as $$
  select p.id, p.display_name, p.timezone, p.weekend_enabled
    from public.profiles p
   where
     -- 로컬 시각의 '시'가 알림 설정 시각의 '시'와 같은 회차에만 발송한다.
     date_trunc('hour', p_now at time zone p.timezone) =
     date_trunc('hour', (p_now at time zone p.timezone)::date + p.digest_time)
     -- 오늘 이미 보냈으면 건너뛴다.
     and not exists (
       select 1
         from public.notifications n
        where n.user_id = p.id
          and n.sent_at is not null
          and (n.sent_at at time zone p.timezone)::date = (p_now at time zone p.timezone)::date
     )
     -- 보낼 항목이 하나라도 있어야 한다.
     and exists (
       select 1
         from public.items i
        where i.user_id = p.id
          and i.status = 'active'
          and i.next_due_on is not null
          and i.next_due_on <= (p_now at time zone p.timezone)::date
     );
$$;
