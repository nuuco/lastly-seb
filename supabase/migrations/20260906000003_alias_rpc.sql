-- 별칭 학습: 같은 표현이 다시 오면 hit_count만 올린다.
create or replace function public.bump_item_alias(
  p_user_id uuid,
  p_item_id uuid,
  p_phrase  text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.item_aliases (user_id, item_id, phrase)
  values (p_user_id, p_item_id, p_phrase)
  on conflict (user_id, phrase)
  do update set hit_count = public.item_aliases.hit_count + 1,
                item_id   = excluded.item_id;
$$;
