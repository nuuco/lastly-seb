-- 이름 중복은 쓰고 있는 항목끼리만 따진다.
-- 지운 항목은 보관(archived)으로 남으므로, 전체에 걸면 지운 이름으로 다시 만들 수 없다.
alter table public.items drop constraint items_name_unique_per_user;

create unique index items_name_unique_active
  on public.items (user_id, name)
  where status = 'active';
