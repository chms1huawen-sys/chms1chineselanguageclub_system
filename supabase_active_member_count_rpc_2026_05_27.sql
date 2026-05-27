create or replace function public.get_active_member_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.users
  where is_active = true;
$$;

grant execute on function public.get_active_member_count() to authenticated;
