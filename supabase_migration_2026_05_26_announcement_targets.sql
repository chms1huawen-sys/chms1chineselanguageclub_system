-- Announcement visibility targets.
-- Run once in Supabase SQL Editor before using targeted announcements.

alter table public.announcements
  add column if not exists target_type text not null default 'all'
  check (target_type in ('all', 'board', 'committee'));

alter table public.announcements
  add column if not exists target_team_id uuid references public.teams(id) on delete set null;

create index if not exists announcements_target_type_idx
  on public.announcements(target_type);

create index if not exists announcements_target_team_id_idx
  on public.announcements(target_team_id);
