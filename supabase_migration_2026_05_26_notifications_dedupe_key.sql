-- Ensure notifications can use upsert(... onConflict: 'dedupe_key').
-- Run once in Supabase SQL Editor if you see:
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"

delete from public.notifications a
using public.notifications b
where a.dedupe_key is not null
  and a.dedupe_key = b.dedupe_key
  and a.ctid > b.ctid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'notifications_dedupe_key_unique'
      and conrelid = 'public.notifications'::regclass
  ) then
    alter table public.notifications
      add constraint notifications_dedupe_key_unique unique (dedupe_key);
  end if;
end $$;
