-- Apply after the four 2026-09-25 Blog migrations. No member data is changed.
begin;
alter table public.blog_categories add column if not exists section text not null default 'all' check(section in ('all','article','event','publication','notice'));
alter table public.blog_categories add column if not exists parent_id uuid references public.blog_categories(id) on delete set null;
alter table public.blog_categories add column if not exists position integer not null default 0;
alter table public.blog_categories add column if not exists is_visible boolean not null default true;
alter table public.blog_categories add column if not exists icon text not null default '' check(length(icon)<=32);
alter table public.blog_categories add column if not exists color text not null default '#28688e' check(color ~ '^#[0-9a-fA-F]{6}$');
alter table public.blog_tags add column if not exists position integer not null default 0;
alter table public.blog_tags add column if not exists is_visible boolean not null default true;
alter table public.blog_tags add column if not exists icon text not null default '' check(length(icon)<=32);
alter table public.blog_tags add column if not exists color text not null default '#28688e' check(color ~ '^#[0-9a-fA-F]{6}$');
alter table public.blog_posts add column if not exists tag_ids uuid[] not null default '{}';
alter table public.blog_posts add column if not exists book_details jsonb not null default '{}' check(jsonb_typeof(book_details)='object');
alter table public.blog_posts add column if not exists show_in_moments boolean not null default true;
alter table public.blog_albums add column if not exists migrated_to_post boolean not null default false;

-- Keep IDs and storage paths intact. Each legacy album becomes an event with its own photos.
-- Retain the old album rows as a backup; no files or content are deleted.
alter table public.blog_posts disable trigger blog_guard_year;
alter table public.blog_posts disable trigger blog_post_stamp;
alter table public.blog_media disable trigger blog_guard_year;
alter table public.blog_albums disable trigger blog_guard_year;
do $$ begin
  if exists(select 1 from public.blog_albums a join public.blog_posts p on p.id=a.id where not a.migrated_to_post) then
    raise exception 'BLOG_ALBUM_ID_COLLISION_REQUIRES_REVIEW';
  end if;
end $$;
insert into public.blog_posts(id,title,slug,summary,body,content_type,content_year,status,cover_path,published_at,created_at,updated_at,deleted_at,related_ids)
select a.id,a.title,'archive-'||a.id,left(a.description,500),a.description,'event',a.content_year,a.status,a.cover_path,
case when a.status='published' then a.created_at end,a.created_at,a.updated_at,a.deleted_at,
array(select distinct p.id from public.blog_posts p where p.id=a.event_id or p.id in (select j.post_id from public.blog_post_albums j where j.album_id=a.id))
from public.blog_albums a where not a.migrated_to_post;
update public.blog_media m set post_id=m.album_id,album_id=null
from public.blog_albums a where m.album_id=a.id and not a.migrated_to_post;
update public.blog_posts p set related_ids=array(select distinct x from unnest(p.related_ids||array(
select a.id from public.blog_albums a where not a.migrated_to_post and
(a.event_id=p.id or exists(select 1 from public.blog_post_albums j where j.post_id=p.id and j.album_id=a.id))
)) x)
where exists(select 1 from public.blog_albums a where not a.migrated_to_post and
(a.event_id=p.id or exists(select 1 from public.blog_post_albums j where j.post_id=p.id and j.album_id=a.id)));
update public.blog_albums set migrated_to_post=true where not migrated_to_post;
-- Backfill tags once, without changing published dates, versions or archived-year locks.
do $$ begin
if not coalesce((select (content->>'cultural_site_initialized')::boolean from public.blog_settings where id=1),false) then
  update public.blog_posts p set tag_ids=array(select t.id from public.blog_tags t where t.name=any(p.tags));
  insert into public.blog_categories(name,section,position) values
    ('文学创作','article',0),('思想札记','article',1),('视觉杂记','article',2),('生活随笔','article',3),
    ('日常活动','event',0),('跨学会合作','event',1),('社区联合','event',2),('比赛','event',3),('专题策展','event',4),
    ('学会出版','publication',0),('作者寄售','publication',1)
  on conflict(name) do nothing;
  insert into public.blog_categories(name,section,parent_id,position)
  select v.name,'article',c.id,v.position from (values ('散文',0),('诗歌',1),('小说',2),('剧本',3)) v(name,position)
  join public.blog_categories c on c.name='文学创作' and c.section='article'
  on conflict(name) do nothing;
  update public.blog_settings set content=content||'{"cultural_site_initialized":true}'::jsonb where id=1;
end if;
end $$;
alter table public.blog_posts enable trigger blog_guard_year;
alter table public.blog_posts enable trigger blog_post_stamp;
alter table public.blog_media enable trigger blog_guard_year;
alter table public.blog_albums enable trigger blog_guard_year;
-- Old albums are archival backups, not another public photo permission path.
drop policy if exists blog_albums_read on public.blog_albums;
create policy blog_albums_read on public.blog_albums for select to authenticated using(public.blog_manager());
drop policy if exists blog_albums_write on public.blog_albums;
drop policy if exists blog_post_albums_write on public.blog_post_albums;
revoke insert,update,delete on public.blog_albums,public.blog_post_albums from authenticated;
create or replace function public.blog_taxonomy_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if new.parent_id is not null and not exists(select 1 from blog_categories where id=new.parent_id and section=new.section and parent_id is null and id<>new.id) then
    raise exception 'BLOG_CATEGORY_PARENT_INVALID';
  end if;
  if exists(select 1 from blog_categories where parent_id=new.id and (section<>new.section or new.parent_id is not null)) then
    raise exception 'BLOG_CATEGORY_CHILDREN_REQUIRES_REVIEW';
  end if;
  if new.section<>'all' and exists(select 1 from blog_posts where category_id=new.id and content_type<>new.section) then
    raise exception 'BLOG_CATEGORY_HAS_OTHER_CONTENT_TYPES';
  end if;
  return new;
end $$;
drop trigger if exists blog_taxonomy_guard on public.blog_categories;
create trigger blog_taxonomy_guard before insert or update on public.blog_categories for each row execute function public.blog_taxonomy_guard();
create or replace function public.blog_content_guard() returns trigger language plpgsql set search_path=public as $$
begin
  if new.category_id is not null and not exists(select 1 from blog_categories where id=new.category_id and section in ('all',new.content_type)) then
    raise exception 'BLOG_CATEGORY_SECTION_MISMATCH';
  end if;
  new.tag_ids:=array(select id from blog_tags where id=any(new.tag_ids) order by position,name);
  new.tags:=array(select name from blog_tags where id=any(new.tag_ids) order by position,name);
  return new;
end $$;
drop trigger if exists blog_content_guard on public.blog_posts;
create trigger blog_content_guard before insert or update on public.blog_posts for each row execute function public.blog_content_guard();
create or replace function public.blog_studio_save(p_post jsonb,p_links jsonb default '[]',p_album_ids uuid[] default '{}',p_media jsonb default '[]',p_version integer default null)
returns public.blog_posts language plpgsql security invoker set search_path=public as $$
declare result public.blog_posts; old_version integer; target uuid; link jsonb;
begin
if not public.blog_manager() then raise exception 'BLOG_FORBIDDEN'; end if;
if cardinality(p_album_ids)>0 then raise exception 'BLOG_USE_ARTICLE_PHOTOS'; end if;
target:=coalesce(nullif(p_post->>'id','')::uuid,gen_random_uuid());
select version into old_version from public.blog_posts where id=target for update;
if found and old_version is distinct from p_version then raise exception 'BLOG_EDIT_CONFLICT'; end if;
if jsonb_array_length(p_links)>30 or cardinality(p_album_ids)>30 then raise exception 'BLOG_TOO_MANY_LINKS'; end if;
insert into public.blog_posts(id,title,slug,summary,body,category_id,event_date,location,tags,credit,cover_path,featured,status,content_type,content_year,is_sticky,related_ids,event_id,behind_scenes,video_url,scheduled_at,tag_ids,book_details,show_in_moments)
values(target,p_post->>'title',p_post->>'slug',coalesce(p_post->>'summary',''),coalesce(p_post->>'body',''),nullif(p_post->>'category_id','')::uuid,nullif(p_post->>'event_date','')::date,coalesce(p_post->>'location',''),array(select jsonb_array_elements_text(coalesce(p_post->'tags','[]'))),coalesce(p_post->>'credit',''),coalesce(p_post->>'cover_path',''),coalesce((p_post->>'featured')::boolean,false),coalesce(p_post->>'status','draft'),coalesce(p_post->>'content_type','article'),coalesce((p_post->>'content_year')::integer,extract(year from current_date)::integer),coalesce((p_post->>'is_sticky')::boolean,false),array(select jsonb_array_elements_text(coalesce(p_post->'related_ids','[]'))::uuid),nullif(p_post->>'event_id','')::uuid,coalesce(p_post->>'behind_scenes',''),coalesce(p_post->>'video_url',''),nullif(p_post->>'scheduled_at','')::timestamptz,array(select jsonb_array_elements_text(coalesce(p_post->'tag_ids','[]'))::uuid),coalesce(p_post->'book_details','{}'),coalesce((p_post->>'show_in_moments')::boolean,true))
on conflict(id) do update set title=excluded.title,slug=excluded.slug,summary=excluded.summary,body=excluded.body,category_id=excluded.category_id,event_date=excluded.event_date,location=excluded.location,tags=excluded.tags,credit=excluded.credit,cover_path=excluded.cover_path,featured=excluded.featured,status=excluded.status,content_type=excluded.content_type,content_year=excluded.content_year,is_sticky=excluded.is_sticky,related_ids=excluded.related_ids,event_id=excluded.event_id,behind_scenes=excluded.behind_scenes,video_url=excluded.video_url,scheduled_at=excluded.scheduled_at,tag_ids=excluded.tag_ids,book_details=excluded.book_details,show_in_moments=excluded.show_in_moments returning * into result;
delete from public.blog_links where post_id=target;
for link in select * from jsonb_array_elements(p_links) loop
insert into public.blog_links(post_id,label,url,visibility,type,position) values(target,link->>'label',link->>'url',coalesce(link->>'visibility','public'),coalesce(link->>'type','website'),coalesce((link->>'position')::integer,0)); end loop;
delete from public.blog_downloads where post_id=target;
update public.blog_media m set caption=coalesce(e.value->>'caption',''),position=coalesce((e.value->>'position')::integer,m.position) from jsonb_array_elements(p_media) e(value) where m.post_id=target and m.id=(e.value->>'id')::uuid;
return result;
end $$;
revoke all on function public.blog_studio_save(jsonb,jsonb,uuid[],jsonb,integer) from public,anon;
grant execute on function public.blog_studio_save(jsonb,jsonb,uuid[],jsonb,integer) to authenticated;
create or replace function public.blog_record_visit(p_id uuid,p_visitor uuid,p_session uuid,p_path text,p_source text default '(direct)',p_device text default 'desktop')
returns boolean language plpgsql security definer set search_path='' as $$
declare n integer; begin
if p_id is null or p_visitor is null or p_session is null or p_device not in ('desktop','mobile','tablet') then return false; end if;
if public.blog_manager() then return false; end if;
if p_path not in ('/','/activities','/bookroom','/about','/literature','/news') then
  if p_path !~ '^/blog/[a-z0-9]+(-[a-z0-9]+)*$' or not exists(select 1 from public.blog_posts where status='published' and '/blog/'||slug=p_path) then return false; end if;
end if;
if length(p_path)>200 or p_path is null then return false; end if;
if p_source is null or (p_source<>'(direct)' and (length(p_source)>253 or p_source !~ '[a-z]' or p_source !~ '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$')) then p_source:='(direct)'; end if;
perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_visitor::text)::bigint);
if (select count(*) from public.blog_visits where visitor_id=p_visitor and visited_at>now()-interval '1 minute')>=20 then return false; end if;
insert into public.blog_visits(id,visitor_id,session_id,path,source,device,minute_bucket)
values(p_id,p_visitor,p_session,p_path,p_source,p_device,date_trunc('minute',now())) on conflict do nothing;
get diagnostics n=row_count; return n=1;
end $$;
revoke all on function public.blog_record_visit(uuid,uuid,uuid,text,text,text) from public;
grant execute on function public.blog_record_visit(uuid,uuid,uuid,text,text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
