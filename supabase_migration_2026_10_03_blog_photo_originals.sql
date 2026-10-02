begin;
alter table public.blog_media add column if not exists original_path text;
comment on column public.blog_media.original_path is 'Preserved source object when path refers to a smaller display copy. Existing media paths are unchanged.';
commit;
