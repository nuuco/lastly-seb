-- 요일 지정 주기를 "N주마다 그 요일들" 로 계산한다.
--
-- 지금까지는 N주를 더한 날에서 가장 가까운 지정 요일 하나로만 맞췄다.
-- 그래서 "1주마다 수·금" 은 수요일만 돌고 금요일은 오지 않았다.
--
-- 한 주는 월요일에 시작한다. 한 날이 속한 주에 남은 지정 요일이 있으면 그날,
-- 없으면 N주 뒤 주의 첫 지정 요일이다.
-- apps/api 의 CadenceService.nextDueOn, apps/web 의 nextDueAfter 와 같은 규칙이다.
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
  v_week_start date;
  v_target     smallint;
  v_offset     integer;
  v_min_offset integer;
  v_best       date;
begin
  if p_from is null then
    return null;
  end if;

  if p_unit <> 'week' or cardinality(p_weekdays) = 0 then
    return (case p_unit
      when 'day'   then p_from + (p_interval || ' days')::interval
      when 'week'  then p_from + (p_interval || ' weeks')::interval
      when 'month' then p_from + (p_interval || ' months')::interval
    end)::date;
  end if;

  -- isodow 는 월=1 … 일=7. 지정 요일은 0=일 기준이라 월=0 으로 옮겨 센다.
  v_week_start := p_from - (extract(isodow from p_from)::integer - 1);
  v_best := null;
  v_min_offset := null;

  foreach v_target in array p_weekdays loop
    v_offset := (v_target + 6) % 7;
    if v_min_offset is null or v_offset < v_min_offset then
      v_min_offset := v_offset;
    end if;
    if v_week_start + v_offset > p_from
       and (v_best is null or v_week_start + v_offset < v_best) then
      v_best := v_week_start + v_offset;
    end if;
  end loop;

  return coalesce(v_best, v_week_start + 7 * p_interval + v_min_offset);
end;
$$;

-- 이미 저장된 요일 지정 항목의 다음 예정일을 새 규칙으로 다시 잡는다.
-- 쉬어가는 중인 항목은 사용자가 고른 날짜를 지킨다.
update public.items
   set next_due_on = public.calc_next_due(
                       last_done_on, cadence_unit, cadence_interval, cadence_weekdays
                     )
 where cadence_unit = 'week'
   and cardinality(cadence_weekdays) > 0
   and snoozed_until is null;
