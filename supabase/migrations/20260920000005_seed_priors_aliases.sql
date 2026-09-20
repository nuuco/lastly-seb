-- 사전 이름을 규칙 파서의 어휘에 맞춘다.
--
-- 파서는 "세탁했어" 도 "빨았어" 도 모두 '빨래' 로 바꾼다
-- (packages/parser 의 ACTION_NOUNS). 그래서 "… 세탁" 으로 끝나는 사전 항목은
-- 파서가 만들어낸 이름과 영영 만나지 못한다 -- 트라이그램 유사도도 0.5 를 넘지 못했다.
--
-- 측정: 실제 문장 50개 중 47개가 사전에 걸렸고, 놓친 셋이
-- "베갯잇 세탁"·"강아지 목욕"·"세차" 였다. 셋 다 이름이 어긋난 경우다.
--
-- 값을 고치는 것이 아니라 같은 값을 다른 이름으로 하나 더 두는 것이다.
-- 사람이 직접 "베갯잇 세탁" 이라고 적는 경우도 있어 원래 이름은 남긴다.

-- "… 세탁" 에 "… 빨래" 짝을 만든다. 앞으로 세탁 항목이 늘어도 같은 구문으로 처리된다.
insert into public.cadence_priors (canonical_name, cadence_unit, cadence_interval, confidence, rationale)
select replace(canonical_name, ' 세탁', ' 빨래'),
       cadence_unit,
       cadence_interval,
       confidence,
       rationale
  from public.cadence_priors
 where canonical_name like '% 세탁'
on conflict (canonical_name) do nothing;

-- 부르는 말이 갈리는 것들. 파서는 사용자가 말한 대상을 그대로 두므로
-- "강아지" 라고 말하면 "강아지 …" 가 되고 "반려견 …" 에는 닿지 않는다.
insert into public.cadence_priors (canonical_name, cadence_unit, cadence_interval, confidence, rationale)
select replace(canonical_name, '반려견', '강아지'),
       cadence_unit,
       cadence_interval,
       confidence,
       rationale
  from public.cadence_priors
 where canonical_name like '반려견%'
on conflict (canonical_name) do nothing;

-- 행동 자체가 이름인 말들. 사전에 대상이 붙은 이름만 있으면 걸리지 않는다.
insert into public.cadence_priors (canonical_name, cadence_unit, cadence_interval, confidence, rationale) values
  ('세차',        'month', 1, 0.60, '먼지와 오염 정도를 감안해 월 1회가 일반적입니다.'),
  ('빨래',        'day',   3, 0.60, '속옷과 수건이 모이는 3일 간격이 일반적입니다.'),
  ('청소',        'day',   4, 0.55, '먼지가 눈에 띄기 시작하는 3~4일 간격이 적당합니다.'),
  ('환기',        'day',   1, 0.70, '하루 한 번 이상 공기를 바꾸는 것이 권장됩니다.'),
  ('이불 정리',   'day',   1, 0.50, '아침에 정리하는 습관으로 매일이 일반적입니다.')
on conflict (canonical_name) do nothing;
