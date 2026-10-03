begin;
alter table public.blog_media add column if not exists display_path text;
comment on column public.blog_media.display_path is 'Optional smaller display copy; path and original files remain unchanged.';
-- Both representations must follow the same existing media-row visibility rules.
alter policy blog_photos_read on storage.objects using (
  bucket_id = 'blog-photos' and (
    public.blog_manager() or exists (
      select 1 from public.blog_media m
      where m.path = objects.name or m.display_path = objects.name
    )
  )
);
commit;
