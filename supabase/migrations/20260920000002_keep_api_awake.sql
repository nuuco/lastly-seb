-- 백엔드가 잠들지 않게 DB 가 주기적으로 찔러 준다.
--
-- 무료 호스팅은 15분 요청이 없으면 서버를 재우고, 깨우는 데 20초 넘게 걸린다.
-- 그 사이 앱을 연 사람은 빈 화면을 본다.
--
-- GitHub Actions 로도 할 수 있지만 예약 실행이 몇 분씩 밀린다. DB 는 항상 켜져 있고
-- 밀리지 않아 이쪽이 정확하다.
--
-- 하루 종일 깨우지 않는다. 무료 한도가 워크스페이스 전체에 월 750시간인데,
-- 한 서비스를 24시간 돌리면 744시간이라 AI 서비스 몫이 남지 않는다.
-- 한도를 넘기면 그 달 남은 기간 동안 무료 서비스가 전부 멈춘다.
--
--   깨워두는 시간   16시간 × 31일        = 496시간
--   알림 배치가 깨움 (그 밖 8시간)        =  62시간
--   ──────────────────────────────────────────────
--   백엔드 합계                          = 558시간  → AI 서비스 몫 약 190시간
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 이미 있으면 지우고 다시 만든다. 주소나 시간을 고칠 때 이 파일만 고치면 되도록.
select cron.unschedule('keep-api-awake')
 where exists (select 1 from cron.job where jobname = 'keep-api-awake');

-- UTC 23시 ~ 14시 = 한국 시간 08시 ~ 24시. 5분 간격.
-- 15분이면 잠드는데 5분마다 찌르므로 한두 번 걸러도 버틴다.
select cron.schedule(
  'keep-api-awake',
  '*/5 23,0-14 * * *',
  $$ select net.http_get('https://lastly-api.onrender.com/v1/health', timeout_milliseconds := 60000) $$
);
