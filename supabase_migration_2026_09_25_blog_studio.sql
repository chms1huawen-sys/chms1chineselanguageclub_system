begin;
alter table public.blog_posts add column if not exists content_type text not null default 'article' check(content_type in ('article','event','publication','notice'));
alter table public.blog_posts add column if not exists content_year integer;
alter table public.blog_posts disable trigger blog_post_stamp;
update public.blog_posts set content_year=extract(year from coalesce(event_date,published_at::date,created_at::date)) where content_year is null;
alter table public.blog_posts enable trigger blog_post_stamp;
alter table public.blog_posts alter column content_year set default extract(year from current_date);
alter table public.blog_posts alter column content_year set not null;
alter table public.blog_posts add column if not exists is_sticky boolean not null default false;
alter table public.blog_posts add column if not exists related_ids uuid[] not null default '{}';
alter table public.blog_posts add column if not exists event_id uuid references public.blog_posts(id) on delete set null;
alter table public.blog_posts add column if not exists behind_scenes text not null default '';
alter table public.blog_posts add column if not exists video_url text not null default '';
alter table public.blog_posts drop constraint if exists blog_video_url_check;
alter table public.blog_posts add constraint blog_video_url_check check(video_url='' or video_url ~ '^https?://[^[:space:][:cntrl:]]+$');
alter table public.blog_posts add column if not exists scheduled_at timestamptz;
alter table public.blog_posts add column if not exists deleted_at timestamptz;
alter table public.blog_posts add column if not exists created_by uuid references public.users(id) on delete set null default auth.uid();
alter table public.blog_posts add column if not exists updated_by uuid references public.users(id) on delete set null default auth.uid();
alter table public.blog_posts drop constraint if exists blog_posts_status_check;
alter table public.blog_posts add constraint blog_posts_status_check check(status in ('draft','review','published','scheduled','hidden','trash'));
create index if not exists blog_posts_year_idx on public.blog_posts(content_year,content_type,status);
create index if not exists blog_posts_schedule_idx on public.blog_posts(scheduled_at) where status='scheduled';
alter table public.blog_settings add column if not exists content jsonb not null default '{}';
create table if not exists public.blog_years(year integer primary key check(year between 1900 and 2200),is_archived boolean not null default false);
insert into public.blog_years(year) select distinct content_year from public.blog_posts on conflict do nothing;
insert into public.blog_years(year) values(extract(year from current_date)::integer) on conflict do nothing;
create table if not exists public.blog_tags(id uuid primary key default gen_random_uuid(),name text not null unique check(length(btrim(name)) between 1 and 60),group_name text not null default '活动类型');
insert into public.blog_tags(name) select distinct btrim(tag) from public.blog_posts p,unnest(p.tags) tag where length(btrim(tag)) between 1 and 60 on conflict do nothing;
create table if not exists public.blog_albums(
id uuid primary key default gen_random_uuid(),title text not null check(length(btrim(title)) between 1 and 200),content_year integer not null default extract(year from current_date) check(content_year between 1900 and 2200),
status text not null default 'draft' check(status in ('draft','published','hidden','trash')),description text not null default '',cover_path text not null default '',event_id uuid references public.blog_posts(id) on delete set null,
deleted_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.blog_post_albums(post_id uuid references public.blog_posts(id) on delete cascade,album_id uuid references public.blog_albums(id) on delete cascade,primary key(post_id,album_id));
alter table public.blog_media alter column post_id drop not null;
alter table public.blog_media add column if not exists album_id uuid references public.blog_albums(id) on delete cascade;
alter table public.blog_media drop constraint if exists blog_media_owner_check;
alter table public.blog_media add constraint blog_media_owner_check check(num_nonnulls(post_id,album_id)=1 and path like coalesce(post_id,album_id)::text||'/%');
create index if not exists blog_media_album_idx on public.blog_media(album_id,position);
create table if not exists public.blog_links(
id uuid primary key default gen_random_uuid(),post_id uuid not null references public.blog_posts(id) on delete cascade,label text not null check(length(btrim(label)) between 1 and 100),
url text not null check(url ~ '^https?://[^[:space:][:cntrl:]]+$' and length(url)<=2000),visibility text not null default 'public' check(visibility in ('public','member')),type text not null default 'website',position integer not null default 0);
create index if not exists blog_links_post_idx on public.blog_links(post_id,position);
insert into public.blog_links(post_id,label,url,visibility,type) select d.post_id,'Google Drive 原图相册',d.drive_url,'member','drive' from public.blog_downloads d where d.drive_url<>'' and not exists(select 1 from public.blog_links l where l.post_id=d.post_id and l.url=d.drive_url);

create or replace function public.blog_year_locked(p_year integer) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.blog_years where year=p_year and is_archived); $$;
create or replace function public.blog_archive_manager() returns boolean language sql stable security definer set search_path='' as $$ select public.blog_manager() and exists(select 1 from public.users where id=auth.uid() and is_active and role::text in ('convener_teacher','advisor_teacher','advisor','chairperson')); $$;
revoke all on function public.blog_year_locked(integer),public.blog_archive_manager() from public;
grant execute on function public.blog_year_locked(integer),public.blog_archive_manager() to anon,authenticated;
alter table public.blog_years enable row level security;
alter table public.blog_tags enable row level security;
alter table public.blog_albums enable row level security;
alter table public.blog_post_albums enable row level security;
alter table public.blog_links enable row level security;
grant select on public.blog_years,public.blog_tags,public.blog_albums,public.blog_post_albums,public.blog_links to anon,authenticated;
grant insert,update,delete on public.blog_tags,public.blog_albums,public.blog_post_albums,public.blog_links to authenticated;
grant insert,update on public.blog_years to authenticated;
drop policy if exists blog_years_read on public.blog_years;
create policy blog_years_read on public.blog_years for select to anon,authenticated using(true);
drop policy if exists blog_years_insert on public.blog_years;
create policy blog_years_insert on public.blog_years for insert to authenticated with check(public.blog_manager() and (not is_archived or public.blog_archive_manager()));
drop policy if exists blog_years_update on public.blog_years;
create policy blog_years_update on public.blog_years for update to authenticated using(public.blog_archive_manager()) with check(public.blog_archive_manager());
drop policy if exists blog_tags_read on public.blog_tags;
create policy blog_tags_read on public.blog_tags for select to anon,authenticated using(true);
drop policy if exists blog_tags_write on public.blog_tags;
create policy blog_tags_write on public.blog_tags for all to authenticated using(public.blog_manager()) with check(public.blog_manager());
drop policy if exists blog_albums_read on public.blog_albums;
create policy blog_albums_read on public.blog_albums for select to anon,authenticated using(status='published' or public.blog_manager());
drop policy if exists blog_albums_write on public.blog_albums;
create policy blog_albums_write on public.blog_albums for all to authenticated using(public.blog_manager()) with check(public.blog_manager());
drop policy if exists blog_post_albums_read on public.blog_post_albums;
create policy blog_post_albums_read on public.blog_post_albums for select to anon,authenticated using(public.blog_manager() or (exists(select 1 from public.blog_posts p where p.id=post_id and p.status='published') and exists(select 1 from public.blog_albums a where a.id=album_id and a.status='published')));
drop policy if exists blog_post_albums_write on public.blog_post_albums;
create policy blog_post_albums_write on public.blog_post_albums for all to authenticated using(public.blog_manager()) with check(public.blog_manager());
drop policy if exists blog_links_read on public.blog_links;
create policy blog_links_read on public.blog_links for select to anon,authenticated using(public.blog_manager() or ((visibility='public' or (visibility='member' and public.blog_member())) and exists(select 1 from public.blog_posts p where p.id=post_id and p.status='published')));
drop policy if exists blog_links_write on public.blog_links;
create policy blog_links_write on public.blog_links for all to authenticated using(public.blog_manager()) with check(public.blog_manager());
drop policy if exists blog_media_read on public.blog_media;
create policy blog_media_read on public.blog_media for select to anon,authenticated using(public.blog_manager() or exists(select 1 from public.blog_posts p where p.id=post_id and p.status='published') or exists(select 1 from public.blog_albums a where a.id=album_id and a.status='published'));

-- Protect archived years against direct writes as well as editor RPCs.
create or replace function public.blog_guard_year() returns trigger language plpgsql security definer set search_path='' as $$
declare old_year integer; new_year integer; row_data jsonb;
begin
if tg_op<>'INSERT' then
  if tg_table_name in ('blog_posts','blog_albums') then old_year:=old.content_year;
  else
    row_data:=to_jsonb(old);
    select content_year into old_year from public.blog_posts where id=nullif(row_data->>'post_id','')::uuid;
    if public.blog_year_locked(old_year) then raise exception 'BLOG_YEAR_ARCHIVED'; end if;
    select content_year into old_year from public.blog_albums where id=nullif(row_data->>'album_id','')::uuid;
  end if;
  if public.blog_year_locked(old_year) then raise exception 'BLOG_YEAR_ARCHIVED'; end if;
end if;
if tg_op<>'DELETE' then
  if tg_table_name in ('blog_posts','blog_albums') then
    new_year:=new.content_year;
    if new_year not between 1900 and 2200 then raise exception 'BLOG_YEAR_INVALID'; end if;
    new.updated_at:=now();
    if new.status='trash' and new.deleted_at is null then new.deleted_at:=now(); end if;
    if new.status<>'trash' then new.deleted_at:=null; end if;
    if tg_table_name='blog_posts' then
      if new.status='scheduled' and new.scheduled_at is null then raise exception 'BLOG_SCHEDULE_REQUIRED'; end if;
      if tg_op='INSERT' then new.created_by:=auth.uid(); else new.created_by:=old.created_by; end if;
      if public.blog_manager() then new.updated_by:=auth.uid(); end if;
    end if;
    insert into public.blog_years(year) values(new_year) on conflict do nothing;
  else
    row_data:=to_jsonb(new);
    select content_year into new_year from public.blog_posts where id=nullif(row_data->>'post_id','')::uuid;
    if public.blog_year_locked(new_year) then raise exception 'BLOG_YEAR_ARCHIVED'; end if;
    select content_year into new_year from public.blog_albums where id=nullif(row_data->>'album_id','')::uuid;
  end if;
  if public.blog_year_locked(new_year) then raise exception 'BLOG_YEAR_ARCHIVED'; end if;
  return new;
end if;
return old;
end $$;
do $$ declare t text; begin foreach t in array array['blog_posts','blog_albums','blog_media','blog_links','blog_post_albums','blog_downloads'] loop
execute format('drop trigger if exists blog_guard_year on public.%I',t);
execute format('create trigger blog_guard_year before insert or update or delete on public.%I for each row execute function public.blog_guard_year()',t);
end loop; end $$;
revoke all on function public.blog_guard_year() from public,anon,authenticated;

create or replace function public.blog_studio_save(p_post jsonb,p_links jsonb default '[]',p_album_ids uuid[] default '{}',p_media jsonb default '[]',p_version integer default null)
returns public.blog_posts language plpgsql security invoker set search_path=public as $$
declare result public.blog_posts; old_version integer; target uuid; link jsonb;
begin
if not public.blog_manager() then raise exception 'BLOG_FORBIDDEN'; end if;
target:=coalesce(nullif(p_post->>'id','')::uuid,gen_random_uuid());
select version into old_version from public.blog_posts where id=target for update;
if found and old_version is distinct from p_version then raise exception 'BLOG_EDIT_CONFLICT'; end if;
if jsonb_array_length(p_links)>30 or cardinality(p_album_ids)>30 then raise exception 'BLOG_TOO_MANY_LINKS'; end if;
insert into public.blog_posts(id,title,slug,summary,body,category_id,event_date,location,tags,credit,cover_path,featured,status,content_type,content_year,is_sticky,related_ids,event_id,behind_scenes,video_url,scheduled_at)
values(target,p_post->>'title',p_post->>'slug',coalesce(p_post->>'summary',''),coalesce(p_post->>'body',''),nullif(p_post->>'category_id','')::uuid,nullif(p_post->>'event_date','')::date,coalesce(p_post->>'location',''),array(select jsonb_array_elements_text(coalesce(p_post->'tags','[]'))),coalesce(p_post->>'credit',''),coalesce(p_post->>'cover_path',''),coalesce((p_post->>'featured')::boolean,false),coalesce(p_post->>'status','draft'),coalesce(p_post->>'content_type','article'),coalesce((p_post->>'content_year')::integer,extract(year from current_date)::integer),coalesce((p_post->>'is_sticky')::boolean,false),array(select jsonb_array_elements_text(coalesce(p_post->'related_ids','[]'))::uuid),nullif(p_post->>'event_id','')::uuid,coalesce(p_post->>'behind_scenes',''),coalesce(p_post->>'video_url',''),nullif(p_post->>'scheduled_at','')::timestamptz)
on conflict(id) do update set title=excluded.title,slug=excluded.slug,summary=excluded.summary,body=excluded.body,category_id=excluded.category_id,event_date=excluded.event_date,location=excluded.location,tags=excluded.tags,credit=excluded.credit,cover_path=excluded.cover_path,featured=excluded.featured,status=excluded.status,content_type=excluded.content_type,content_year=excluded.content_year,is_sticky=excluded.is_sticky,related_ids=excluded.related_ids,event_id=excluded.event_id,behind_scenes=excluded.behind_scenes,video_url=excluded.video_url,scheduled_at=excluded.scheduled_at returning * into result;
delete from public.blog_links where post_id=target;
for link in select * from jsonb_array_elements(p_links) loop
insert into public.blog_links(post_id,label,url,visibility,type,position) values(target,link->>'label',link->>'url',coalesce(link->>'visibility','public'),coalesce(link->>'type','website'),coalesce((link->>'position')::integer,0)); end loop;
delete from public.blog_downloads where post_id=target;
delete from public.blog_post_albums where post_id=target;
insert into public.blog_post_albums(post_id,album_id) select target,unnest(p_album_ids) on conflict do nothing;
update public.blog_media m set caption=coalesce(e.value->>'caption',''),position=coalesce((e.value->>'position')::integer,m.position) from jsonb_array_elements(p_media) e(value) where m.post_id=target and m.id=(e.value->>'id')::uuid;
return result;
end $$;
revoke all on function public.blog_studio_save(jsonb,jsonb,uuid[],jsonb,integer) from public,anon;
grant execute on function public.blog_studio_save(jsonb,jsonb,uuid[],jsonb,integer) to authenticated;
create or replace function public.blog_publish_due() returns integer language plpgsql security definer set search_path='' as $$
declare affected integer; begin
update public.blog_posts set status='published',published_at=scheduled_at where status='scheduled' and scheduled_at<=now() and not public.blog_year_locked(content_year);
get diagnostics affected=row_count; return affected; end $$;
revoke all on function public.blog_publish_due() from public;
grant execute on function public.blog_publish_due() to anon,authenticated;

create or replace function public.blog_asset_editable(p_path text) returns boolean language plpgsql stable security definer set search_path='' as $$
declare target uuid; y integer; begin
if not public.blog_manager() or p_path !~ '^[a-f0-9-]{36}/' then return false; end if;
begin target:=split_part(p_path,'/',1)::uuid; exception when invalid_text_representation then return false; end;
select content_year into y from public.blog_posts where id=target;
if y is null then select content_year into y from public.blog_albums where id=target; end if;
return not public.blog_year_locked(y); end $$;
revoke all on function public.blog_asset_editable(text) from public;
grant execute on function public.blog_asset_editable(text) to authenticated;
drop policy if exists blog_photos_read on storage.objects;
create policy blog_photos_read on storage.objects for select to anon,authenticated using(bucket_id='blog-photos' and (public.blog_manager() or exists(select 1 from public.blog_media m where m.path=name)));
drop policy if exists blog_photos_insert on storage.objects;
create policy blog_photos_insert on storage.objects for insert to authenticated with check(bucket_id='blog-photos' and public.blog_asset_editable(name));
drop policy if exists blog_photos_delete on storage.objects;
create policy blog_photos_delete on storage.objects for delete to authenticated using(bucket_id='blog-photos' and public.blog_asset_editable(name));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('blog-site-media','blog-site-media',true,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
drop policy if exists blog_site_media_read on storage.objects;
create policy blog_site_media_read on storage.objects for select to anon,authenticated using(bucket_id='blog-site-media');
drop policy if exists blog_site_media_insert on storage.objects;
create policy blog_site_media_insert on storage.objects for insert to authenticated with check(bucket_id='blog-site-media' and public.blog_manager());
drop policy if exists blog_site_media_delete on storage.objects;
create policy blog_site_media_delete on storage.objects for delete to authenticated using(bucket_id='blog-site-media' and public.blog_manager());
notify pgrst,'reload schema';
commit;
