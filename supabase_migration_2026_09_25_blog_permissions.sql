-- Apply after supabase_migration_2026_09_25_blog.sql and custom_permissions.sql.
begin;

alter table public.users add column if not exists can_manage_blog boolean default null;

comment on column public.users.can_manage_blog is
  'NULL inherits Blog roles; true grants access; false revokes role-based access.';

create or replace function public.blog_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid() and u.is_active = true
      and coalesce(u.can_manage_blog, u.role::text in (
        'convener_teacher', 'advisor_teacher', 'advisor', 'chairperson',
        'media_lead', 'vice_media_lead', 'social_media_editor'
      ))
  );
$$;

create or replace function public.blog_permission_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' then
    if new.can_manage_blog is not distinct from old.can_manage_blog then
      return new;
    end if;
  elsif new.can_manage_blog is null then
    return new;
  end if;

  -- Permit trusted backend provisioning and direct administrative SQL only.
  -- A missing uid alone must never bypass the guard for anonymous API calls.
  if auth.role() = 'service_role'
    or (auth.uid() is null and auth.role() is null
        and session_user in ('postgres', 'supabase_admin')) then
    return new;
  end if;

  if auth.uid() is null
    or not exists (select 1 from public.users where id = auth.uid() and is_active = true)
    or public.current_user_has_permission('can_manage_accounts') is not true then
    raise exception 'BLOG_PERMISSION_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists blog_permission_guard on public.users;
create trigger blog_permission_guard before insert or update on public.users
for each row execute function public.blog_permission_guard();

revoke all on function public.blog_permission_guard() from public, anon, authenticated;
revoke all on function public.blog_manager() from public;
grant execute on function public.blog_manager() to anon, authenticated;

commit;
