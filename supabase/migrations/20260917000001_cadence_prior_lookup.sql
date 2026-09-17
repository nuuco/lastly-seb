-- 주기 사전을 apps/api 가 직접 읽을 수 있게 한다.
--
-- 지금까지 이 표는 apps/ai 만 봤다. 그래서 무료 호스팅에서 apps/ai 가 잠들면,
-- 사전에 답이 있는 항목조차 "우선 2주" 기본값으로 떨어졌다.
-- PostgREST 로는 similarity() 조건을 걸 수 없어 함수로 감싼다.
--
-- 조회 규칙은 apps/ai 의 PriorsRepository.find 와 같아야 한다. 한쪽을 고치면 같이 고친다.
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
      or similarity(p.canonical_name, p_name) > 0.5
   order by (p.canonical_name = p_name) desc, similarity(p.canonical_name, p_name) desc
   limit 1;
$$;

comment on function public.find_cadence_prior(text) is
  '항목 이름으로 일반적인 주기를 찾는다. 정확히 같거나 트라이그램 유사도가 높은 것 하나.';
