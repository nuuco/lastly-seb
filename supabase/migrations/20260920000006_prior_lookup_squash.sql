-- 사전 조회에서 띄어쓰기를 무시한다.
--
-- 트라이그램 유사도가 경계에서 떨어지고 있었다.
--
--   similarity('변기 솔 교체',  '변기솔 교체')    = 0.5
--   similarity('차 실내 청소',  '자동차 실내 청소') = 0.5
--   조건은 > 0.5 라 딱 한 끗 차이로 둘 다 탈락한다.
--
-- 항목 이름 매칭에는 이미 공백을 지우고 비교하는 squash 가 있는데
-- (apps/api 의 capture.service.ts) 사전 조회에만 없었다. 같은 기준을 맞춘다.
--
-- 유사도 조건은 그대로 둔다. 공백만 다른 경우를 정확 일치로 끌어올리는 것이지
-- 문턱을 낮추는 것이 아니다 -- 낮추면 엉뚱한 항목이 걸린다.
create or replace function public.find_cadence_prior(p_name text)
returns table (
  canonical_name        text,
  cadence_unit          public.cadence_unit,
  cadence_interval      integer,
  confidence            numeric,
  rationale             text,
  observed_median_days  numeric,
  observed_sample_size  integer
)
language sql
stable
set search_path = public, extensions
as $$
  select p.canonical_name, p.cadence_unit, p.cadence_interval, p.confidence,
         p.rationale, p.observed_median_days, p.observed_sample_size
    from public.cadence_priors p
   where p.canonical_name = p_name
      or replace(p.canonical_name, ' ', '') = replace(p_name, ' ', '')
      or similarity(p.canonical_name, p_name) > 0.5
   order by
     -- 정확히 같은 것이 가장 앞, 그다음이 공백만 다른 것, 그다음이 유사도 순.
     (p.canonical_name = p_name) desc,
     (replace(p.canonical_name, ' ', '') = replace(p_name, ' ', '')) desc,
     similarity(p.canonical_name, p_name) desc
   limit 1;
$$;

comment on function public.find_cadence_prior(text) is
  '주기 사전에서 이름으로 찾는다. 정확 일치 > 공백 무시 일치 > 트라이그램 유사도 순.';
