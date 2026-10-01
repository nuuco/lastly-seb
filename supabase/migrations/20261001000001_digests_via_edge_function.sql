-- 알림 배치를 Edge Function 이 보내게 한다.
--
-- 지금까지는 cron 이 Render 의 API 를 불렀다. 그 서버는 15분이면 잠들어서,
-- 알림을 보내려고 깨우고 기다리는 동안 실패하면 그 시간대 알림이 통째로 빠진다.
-- Edge Function 은 잠들지 않는다.
--
-- 보낼 대상을 고르는 기준(users_due_for_digest)은 그대로다. 발송하는 쪽만 바뀐다.
--
-- 되돌리려면 아래 url 을 다시
--   https://lastly-api.onrender.com/v1/internal/dispatch-digests
-- 로 바꾸고 db push 한다. 함수 본문 외에는 건드릴 것이 없다.
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
    url := 'https://mimbdlhyguuctnodtijq.supabase.co/functions/v1/dispatch-digests',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    ),
    -- Edge Function 은 잠들지 않으므로 기상 대기가 필요 없다. 60초 → 20초.
    timeout_milliseconds := 20000
  );
end;
$$;

comment on function public.dispatch_digests() is
  '알림 배치를 호출한다. cron 이 매시 정각에 부르고, 발송은 Edge Function 이 한다.';

-- 아무나 부를 수 있으면 안 된다. cron(postgres) 만 부른다.
revoke execute on function public.dispatch_digests() from public, anon, authenticated;
