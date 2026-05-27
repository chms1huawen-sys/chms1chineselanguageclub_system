-- Dashboard + account role updates.
-- Run once in Supabase SQL Editor after the leave applications migration.

alter table public.users
  add column if not exists birthday date;

alter table public.users drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check check (role in (
    'convener_teacher',
    'advisor_teacher',
    'chairperson',
    'vice_chairperson',
    'secretary',
    'vice_secretary',
    'treasurer',
    'vice_treasurer',
    'general_affairs',
    'vice_general_affairs',
    'activity_lead',
    'vice_activity_lead',
    'activity_member',
    'media_lead',
    'vice_media_lead',
    'ordinary_member',
    'custom'
  ));

alter table public.users
  alter column role set default 'ordinary_member';

alter table public.leave_applications
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected', 'recorded'));

create table if not exists public.announcements (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  target_type text not null default 'all' check (target_type in ('all', 'board', 'committee')),
  target_team_id uuid references public.teams(id) on delete set null,
  created_by uuid references public.users on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.announcements
  add column if not exists target_type text not null default 'all'
  check (target_type in ('all', 'board', 'committee'));

alter table public.announcements
  add column if not exists target_team_id uuid references public.teams(id) on delete set null;

alter table public.announcements enable row level security;

drop policy if exists "Announcements are viewable by authenticated users." on public.announcements;
drop policy if exists "Announcement managers can create announcements." on public.announcements;
drop policy if exists "Announcement managers can update announcements." on public.announcements;
drop policy if exists "Announcement managers can delete announcements." on public.announcements;

create policy "Announcements are viewable by authenticated users." on public.announcements
  for select to authenticated using (true);

create policy "Announcement managers can create announcements." on public.announcements
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson')
        and is_active = true
    )
  );

create policy "Announcement managers can update announcements." on public.announcements
  for update to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson')
        and is_active = true
    )
  );

create policy "Announcement managers can delete announcements." on public.announcements
  for delete to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson')
        and is_active = true
    )
  );

create table if not exists public.activity_log (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid references public.users on delete set null,
  action_type text not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.activity_log enable row level security;

drop policy if exists "Activity log is viewable by authenticated users." on public.activity_log;
drop policy if exists "Authenticated users can create activity log." on public.activity_log;

create policy "Activity log is viewable by authenticated users." on public.activity_log
  for select to authenticated using (true);

create policy "Authenticated users can create activity log." on public.activity_log
  for insert to authenticated with check (auth.uid() is not null);

grant select on public.announcements to authenticated;
grant insert, update, delete on public.announcements to authenticated;
grant select, insert, update, delete on public.announcements to service_role;

grant select on public.activity_log to authenticated;
grant insert on public.activity_log to authenticated;
grant select, insert, update, delete on public.activity_log to service_role;
