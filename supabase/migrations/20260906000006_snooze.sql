-- 당분간 쉬어가기.
--
-- 주기 수정과는 다르다. 주기는 그대로 두고 다음 예정일만 미룬다.
-- 겨울에 에어컨 필터를 4개월 쉬어도, 돌아오면 다시 45일 리듬을 탄다.
-- 주기를 4개월로 바꿔버리면 여름 리듬까지 망가진다.
alter table public.items
  add column snoozed_until date;

comment on column public.items.snoozed_until is
  '이 날까지 알림을 쉰다. next_due_on 과 함께 세팅되며, 기록이 새로 쌓이면 해제된다.';

-- 기록이 들어오면 사용자가 다시 하기 시작했다는 뜻이므로 쉬어가기를 푼다.
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
         snoozed_until         = null,
         next_due_on           = public.calc_next_due(
                                   v_last, i.cadence_unit, i.cadence_interval, i.cadence_weekdays
                                 ),
         updated_at            = now()
   where i.id = v_item_id;

  return null;
end;
$$;
