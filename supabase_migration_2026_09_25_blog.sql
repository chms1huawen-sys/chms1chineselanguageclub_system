begin;
create or replace function public.blog_manager() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from users where id=auth.uid() and is_active and role::text in ('convener_teacher','advisor_teacher','advisor','chairperson','media_lead','vice_media_lead','social_media_editor'));
$$;
create or replace function public.blog_member() returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from users where id=auth.uid() and is_active);
$$;
revoke all on function public.blog_manager(),public.blog_member() from public;
grant execute on function public.blog_manager(),public.blog_member() to anon,authenticated;

create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(), name text not null unique check(length(btrim(name)) between 1 and 80)
);
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(), title text not null check(length(btrim(title)) between 1 and 200),
  slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=120),
  summary text not null default '' check(length(summary)<=500), body text not null default '' check(length(body)<=100000),
  category_id uuid references public.blog_categories(id) on delete set null,
  event_date date, location text not null default '', tags text[] not null default '{}', credit text not null default '',
  cover_path text not null default '', featured boolean not null default false,
  status text not null default 'draft' check(status in ('draft','published','hidden')),
  published_at timestamptz, updated_at timestamptz not null default now(), created_at timestamptz not null default now(),
  version integer not null default 1
);
create index if not exists blog_posts_published_idx on public.blog_posts(status,published_at desc);
create table if not exists public.blog_downloads (
  post_id uuid primary key references public.blog_posts(id) on delete cascade,
  drive_url text not null check(drive_url='' or drive_url ~ '^https://drive\.google\.com/(drive/folders/|file/d/)[A-Za-z0-9_-]+([/?#].*)?$')
);
create table if not exists public.blog_media (
  id uuid primary key default gen_random_uuid(), post_id uuid not null references public.blog_posts(id) on delete cascade,
  path text not null unique, caption text not null default '', position integer not null default 0,
  check(path like post_id::text||'/%')
);
create index if not exists blog_media_post_idx on public.blog_media(post_id,position);
create table if not exists public.blog_settings (
  id integer primary key default 1 check(id=1), title text not null default '一中华文学会',
  subtitle text not null default '古晋中华第一中学', intro text not null default '记录相聚的时刻，延续华文的温度。',
  about text not null default '', contact text not null default '', hero_path text not null default '/login-group-2026.jpeg'
);
insert into public.blog_settings(id) values(1) on conflict do nothing;

alter table public.blog_posts enable row level security;
alter table public.blog_categories enable row level security;
alter table public.blog_downloads enable row level security;
alter table public.blog_media enable row level security;
alter table public.blog_settings enable row level security;
drop policy if exists blog_posts_read on public.blog_posts;
create policy blog_posts_read on public.blog_posts for select to anon,authenticated using(status='published' or public.blog_manager());
drop policy if exists blog_posts_write on public.blog_posts;
create policy blog_posts_write on public.blog_posts for all to authenticated using(public.blog_manager()) with check(public.blog_manager());
drop policy if exists blog_categories_read on public.blog_categories;
create policy blog_categories_read on public.blog_categories for select to anon,authenticated using(true);
drop policy if exists blog_categories_write on public.blog_categories;
create policy blog_categories_write on public.blog_categories for all to authenticated using(public.blog_manager()) with check(public.blog_manager());
drop policy if exists blog_settings_read on public.blog_settings;
create policy blog_settings_read on public.blog_settings for select to anon,authenticated using(true);
drop policy if exists blog_settings_write on public.blog_settings;
create policy blog_settings_write on public.blog_settings for all to authenticated using(public.blog_manager()) with check(public.blog_manager());
drop policy if exists blog_media_read on public.blog_media;
create policy blog_media_read on public.blog_media for select to anon,authenticated using(public.blog_manager() or exists(select 1 from public.blog_posts p where p.id=post_id and p.status='published'));
drop policy if exists blog_media_write on public.blog_media;
create policy blog_media_write on public.blog_media for all to authenticated using(public.blog_manager()) with check(public.blog_manager());
drop policy if exists blog_downloads_read on public.blog_downloads;
create policy blog_downloads_read on public.blog_downloads for select to authenticated using(public.blog_manager() or (public.blog_member() and exists(select 1 from public.blog_posts p where p.id=post_id and p.status='published')));
drop policy if exists blog_downloads_write on public.blog_downloads;
create policy blog_downloads_write on public.blog_downloads for all to authenticated using(public.blog_manager()) with check(public.blog_manager());
revoke all on public.blog_posts,public.blog_categories,public.blog_settings,public.blog_media,public.blog_downloads from anon,authenticated;
grant select on public.blog_posts,public.blog_categories,public.blog_settings,public.blog_media to anon,authenticated;
grant select on public.blog_downloads to authenticated;
grant insert,update,delete on public.blog_posts,public.blog_categories,public.blog_settings,public.blog_media,public.blog_downloads to authenticated;

create or replace function public.blog_post_stamp() returns trigger language plpgsql set search_path=public as $$
begin
  new.updated_at:=now();
  if tg_op='UPDATE' then new.version:=old.version+1; else new.version:=1; end if;
  if new.status='published' and new.published_at is null then new.published_at:=now(); end if;
  return new;
end $$;
drop trigger if exists blog_post_stamp on public.blog_posts;
create trigger blog_post_stamp before insert or update on public.blog_posts for each row execute function public.blog_post_stamp();

-- The article and its private album link are committed together; stale editors cannot overwrite newer saves.
create or replace function public.blog_save_post(p_post jsonb,p_drive text,p_version integer default null,p_media jsonb default '[]')
returns public.blog_posts language plpgsql security invoker set search_path=public as $$
declare v public.blog_posts; old_version integer; target uuid;
begin
  if not public.blog_manager() then raise exception 'BLOG_FORBIDDEN'; end if;
  target:=coalesce(nullif(p_post->>'id','')::uuid,gen_random_uuid());
  select version into old_version from public.blog_posts where id=target for update;
  if found and old_version is distinct from p_version then raise exception 'BLOG_EDIT_CONFLICT'; end if;
  insert into public.blog_posts(id,title,slug,summary,body,category_id,event_date,location,tags,credit,cover_path,featured,status)
  values(target,p_post->>'title',p_post->>'slug',coalesce(p_post->>'summary',''),coalesce(p_post->>'body',''),nullif(p_post->>'category_id','')::uuid,nullif(p_post->>'event_date','')::date,coalesce(p_post->>'location',''),array(select jsonb_array_elements_text(coalesce(p_post->'tags','[]'))),coalesce(p_post->>'credit',''),coalesce(p_post->>'cover_path',''),coalesce((p_post->>'featured')::boolean,false),coalesce(p_post->>'status','draft'))
  on conflict(id) do update set title=excluded.title,slug=excluded.slug,summary=excluded.summary,body=excluded.body,category_id=excluded.category_id,event_date=excluded.event_date,location=excluded.location,tags=excluded.tags,credit=excluded.credit,cover_path=excluded.cover_path,featured=excluded.featured,status=excluded.status returning * into v;
  insert into public.blog_downloads(post_id,drive_url) values(target,coalesce(p_drive,'')) on conflict(post_id) do update set drive_url=excluded.drive_url;
  update public.blog_media m set caption=coalesce(entry.value->>'caption','')
  from jsonb_array_elements(p_media) entry(value)
  where m.post_id=target and m.id=(entry.value->>'id')::uuid;
  return v;
end $$;
revoke all on function public.blog_save_post(jsonb,text,integer,jsonb) from public,anon;
grant execute on function public.blog_save_post(jsonb,text,integer,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('blog-photos','blog-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists blog_photos_read on storage.objects;
create policy blog_photos_read on storage.objects for select to anon,authenticated using(bucket_id='blog-photos' and (public.blog_manager() or exists(select 1 from public.blog_media m join public.blog_posts p on p.id=m.post_id where m.path=name and p.status='published')));
drop policy if exists blog_photos_insert on storage.objects;
create policy blog_photos_insert on storage.objects for insert to authenticated with check(bucket_id='blog-photos' and public.blog_manager());
drop policy if exists blog_photos_delete on storage.objects;
create policy blog_photos_delete on storage.objects for delete to authenticated using(bucket_id='blog-photos' and public.blog_manager());
notify pgrst,'reload schema';
commit;
