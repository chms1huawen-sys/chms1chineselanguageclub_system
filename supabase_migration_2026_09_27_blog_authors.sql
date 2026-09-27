-- Run after supabase_migration_2026_09_27_blog_editor.sql. No data is deleted.
begin;
alter table public.blog_posts add column if not exists author text not null default '';
alter table public.blog_posts drop constraint if exists blog_author_length;
alter table public.blog_posts add constraint blog_author_length check (length(author)<=120);
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
insert into public.blog_posts(id,title,slug,summary,author,body,body_document,category_id,event_date,location,tags,credit,cover_path,featured,status,content_type,content_year,is_sticky,related_ids,event_id,behind_scenes,video_url,scheduled_at,tag_ids,book_details,show_in_moments)
values(target,p_post->>'title',p_post->>'slug',coalesce(p_post->>'summary',''),coalesce(p_post->>'author',''),coalesce(p_post->>'body',''),nullif(p_post->'body_document','null'::jsonb),nullif(p_post->>'category_id','')::uuid,nullif(p_post->>'event_date','')::date,coalesce(p_post->>'location',''),array(select jsonb_array_elements_text(coalesce(p_post->'tags','[]'))),coalesce(p_post->>'credit',''),coalesce(p_post->>'cover_path',''),coalesce((p_post->>'featured')::boolean,false),coalesce(p_post->>'status','draft'),coalesce(p_post->>'content_type','article'),coalesce((p_post->>'content_year')::integer,extract(year from current_date)::integer),coalesce((p_post->>'is_sticky')::boolean,false),array(select jsonb_array_elements_text(coalesce(p_post->'related_ids','[]'))::uuid),nullif(p_post->>'event_id','')::uuid,coalesce(p_post->>'behind_scenes',''),coalesce(p_post->>'video_url',''),nullif(p_post->>'scheduled_at','')::timestamptz,array(select jsonb_array_elements_text(coalesce(p_post->'tag_ids','[]'))::uuid),coalesce(p_post->'book_details','{}'),coalesce((p_post->>'show_in_moments')::boolean,true))
on conflict(id) do update set title=excluded.title,slug=excluded.slug,summary=excluded.summary,author=excluded.author,body=excluded.body,body_document=excluded.body_document,category_id=excluded.category_id,event_date=excluded.event_date,location=excluded.location,tags=excluded.tags,credit=excluded.credit,cover_path=excluded.cover_path,featured=excluded.featured,status=excluded.status,content_type=excluded.content_type,content_year=excluded.content_year,is_sticky=excluded.is_sticky,related_ids=excluded.related_ids,event_id=excluded.event_id,behind_scenes=excluded.behind_scenes,video_url=excluded.video_url,scheduled_at=excluded.scheduled_at,tag_ids=excluded.tag_ids,book_details=excluded.book_details,show_in_moments=excluded.show_in_moments returning * into result;
delete from public.blog_links where post_id=target;
for link in select * from jsonb_array_elements(p_links) loop
insert into public.blog_links(post_id,label,url,visibility,type,position) values(target,link->>'label',link->>'url',coalesce(link->>'visibility','public'),coalesce(link->>'type','website'),coalesce((link->>'position')::integer,0)); end loop;
delete from public.blog_downloads where post_id=target;
update public.blog_media m set caption=coalesce(e.value->>'caption',''),position=coalesce((e.value->>'position')::integer,m.position),width_percent=coalesce((e.value->>'width_percent')::integer,m.width_percent),crop=nullif(e.value->'crop','null'::jsonb) from jsonb_array_elements(p_media) e(value) where m.post_id=target and m.id=(e.value->>'id')::uuid;
return result;
end $$;
revoke all on function public.blog_studio_save(jsonb,jsonb,uuid[],jsonb,integer) from public,anon;
grant execute on function public.blog_studio_save(jsonb,jsonb,uuid[],jsonb,integer) to authenticated;

notify pgrst,'reload schema';
commit;
