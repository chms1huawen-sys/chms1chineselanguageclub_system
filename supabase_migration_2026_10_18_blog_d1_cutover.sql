-- Restrict the legacy authorization boundary before activating D1.
begin;
create or replace function public.blog_manager()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.users u where u.id=auth.uid()
    and u.is_active=true and u.can_manage_blog is distinct from false
    and u.role::text in ('convener_teacher','advisor_teacher','advisor','media_lead','vice_media_lead','social_media_editor'));
$$;
comment on column public.users.can_manage_blog is 'NULL/true permits eligible teachers and media; false revokes. Other roles cannot gain blog access through this flag.';
create table if not exists public.blog_platform_status (
  id integer primary key check(id=1), provider text not null check(provider in ('supabase','cloudflare-d1'))
);
insert into public.blog_platform_status(id,provider) values(1,'supabase') on conflict do nothing;
alter table public.blog_platform_status enable row level security;
revoke all on public.blog_platform_status from anon,authenticated;
create or replace function public.blog_legacy_write_guard()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if exists(select 1 from public.blog_platform_status where id=1 and provider='cloudflare-d1') then
    raise exception 'BLOG_MOVED_TO_D1';
  end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end $$;
do $$ declare t text; begin
  foreach t in array array['blog_posts','blog_albums','blog_media','blog_links','blog_downloads','blog_post_albums','blog_settings','blog_categories','blog_tags','blog_years'] loop
    execute format('drop trigger if exists blog_legacy_write_guard on public.%I',t);
    execute format('create trigger blog_legacy_write_guard before insert or update or delete on public.%I for each row execute function public.blog_legacy_write_guard()',t);
  end loop;
end $$;
commit;
-- Activate only after import checks pass:
-- update public.blog_platform_status set provider='cloudflare-d1' where id=1;
