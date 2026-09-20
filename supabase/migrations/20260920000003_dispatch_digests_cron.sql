-- 알림 배치를 DB 가 직접 호출한다.
--
-- 지금까지 GitHub Actions 가 매시 정각에 불렀는데, 예약 실행이 밀리거나 아예 건너뛴다.
-- 실제 기록을 보면 하루에 서너 시간씩 빠졌다 — 그 시간대에 알림을 받기로 한 사람은
-- 그날 알림을 못 받는다. DB 스케줄러는 밀리지 않는다.
--
-- 토큰은 Vault 에 둔다(이름: cron_secret). 이 파일에 적으면 저장소에 남는다.
create or replace function public.dispatch_digests()
returns void
language plpgsql
security definer
set search_path = public, net, vault
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret
    from vault.decrypted_secrets
   where name = 'cron_secret';

  if v_secret is null then
    raise warning '알림 배치를 부르지 못했습니다 — Vault 에 cron_secret 이 없습니다.';
    return;
  end if;

  -- 응답은 기다리지 않는다. 결과는 net._http_response 에 남는다.
  perform net.http_post(
    url := 'https://lastly-api.onrender.com/v1/internal/dispatch-digests',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    -- 무료 호스팅이 자고 있으면 깨어나는 데 시간이 걸린다.
    timeout_milliseconds := 120000
  );
end;
$$;

comment on function public.dispatch_digests() is
  '알림 배치를 호출한다. cron 이 매시 정각에 부른다.';

-- 아무나 부를 수 있으면 안 된다. cron(postgres) 만 부른다.
revoke execute on function public.dispatch_digests() from public, anon, authenticated;

select cron.unschedule('dispatch-digests')
 where exists (select 1 from cron.job where jobname = 'dispatch-digests');

-- 매시 정각. 사용자별 시간대 비교는 서버가 한다.
select cron.schedule('dispatch-digests', '0 * * * *', $$ select public.dispatch_digests() $$);
