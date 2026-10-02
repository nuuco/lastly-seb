-- 알림을 설정한 시각에 가깝게 보낸다.
--
-- 화면의 시각 입력(<input type="time">)은 분 단위를 받는데, 발송 대상을 고르는
-- 기준은 '시' 단위였다. 05:31 로 맞춰도 05:00 회차에만 대상이 됐다.
--
-- 더 나쁜 건 그 회차를 놓치면 그날 전체를 놓쳤다는 점이다. '같은 회차' 비교라
-- 06:00 회차에서는 date_trunc 가 어긋나 대상에서 아예 빠졌다. cron 이 한 번만
-- 밀려도 같은 일이 난다.
--
-- '같은 회차인가' 를 '설정 시각을 지났는가' 로 바꾼다. 하루 한 번 제한은
-- 아래 not exists 가 그대로 맡으므로 중복 발송은 나지 않고, 회차를 놓쳐도
-- 다음 회차에 복구된다.

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
     -- 로컬 시각이 알림 설정 시각을 지났으면 보낸다.
     (p_now at time zone p.timezone)::time >= p.digest_time
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

comment on function public.users_due_for_digest(timestamptz) is
  '알림 보낼 사용자. 설정 시각을 지났고 오늘 아직 안 보낸 사람만.';

-- 5분마다. 설정 시각과의 오차가 5분 이내로 줄어든다.
-- 월 8,640회로 Edge Function 무료 한도(50만)의 1.7% 다.
select cron.unschedule('dispatch-digests')
 where exists (select 1 from cron.job where jobname = 'dispatch-digests');

select cron.schedule('dispatch-digests', '*/5 * * * *', $$ select public.dispatch_digests() $$);

comment on function public.dispatch_digests() is
  '알림 배치를 호출한다. cron 이 5분마다 부른다.';
