-- SQL Schema for 一中华文学会系统 (Chinese Language Club System)
-- Execute this in the Supabase SQL Editor

-- 1. Enable UUID Extension if not enabled
create extension if not exists "uuid-ossp";

-- 2. Drop existing tables if they exist (for clean setup)
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.notifications cascade;
drop table if exists public.activity_log cascade;
drop table if exists public.announcements cascade;
drop table if exists public.task_comments cascade;
drop table if exists public.task_reminder_logs cascade;
drop table if exists public.tasks cascade;
drop table if exists public.events cascade;
drop table if exists public.team_members cascade;
drop table if exists public.teams cascade;
drop table if exists public.push_subscriptions cascade;
drop table if exists public.users cascade;

-- 3. Create Users Table (extends auth.users)
create table public.users (
  id uuid references auth.users on delete cascade primary key,
  name text not null,
  email text not null unique,
  custom_role_label text,
  role text not null default 'ordinary_member' check (role in ('convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'activity_member', 'media_lead', 'vice_media_lead', 'social_media_editor', 'ordinary_member', 'custom', 'committee', 'event_member')),
  birthday date,
  avatar_url text,
  fcm_token text,
  notification_enabled boolean not null default true,
  can_manage_accounts boolean not null default false,
  can_manage_executive boolean not null default false,
  can_create_tasks boolean not null default false,
  can_manage_announcements boolean not null default false,
  can_manage_calendar boolean not null default false,
  can_manage_handover boolean not null default false,
  is_active boolean not null default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users on delete cascade not null,
  fcm_token text not null unique,
  device_key text,
  device_name text,
  platform text,
  is_active boolean not null default true,
  last_seen_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 4. Create Teams Table (Sessions / Event committees)
create table public.teams (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  type text not null check (type in ('board', 'event')), -- 'board' = 执委层, 'event' = 筹委团
  session text not null,                                 -- e.g. '2026/2027'
  is_archived boolean not null default false,
  start_date date,
  end_date date,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Create Team Members Table (Junction)
create table public.team_members (
  team_id uuid references public.teams on delete cascade not null,
  user_id uuid references public.users on delete cascade not null,
  position text not null,                                -- e.g. '主席', '秘书', '副主席', '筹委主席', '普通成员'
  joined_at timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (team_id, user_id)
);

-- 6. Create Tasks Table
create table public.tasks (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  assigned_to uuid[] not null default '{}',             -- List of user IDs
  created_by uuid references public.users not null,
  team_id uuid references public.teams on delete cascade not null,
  due_date timestamp with time zone,
  priority text not null check (priority in ('high', 'medium', 'low')),
  status text not null check (status in ('pending', 'in_progress', 'completed', 'need_help')) default 'pending',
  completed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Create Task Comments Table
create table public.task_comments (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.tasks on delete cascade not null,
  user_id uuid references public.users on delete cascade not null,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. Create Task Reminder Logs Table
create table public.task_reminder_logs (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.tasks on delete cascade not null,
  user_id uuid references public.users on delete cascade not null,
  reminder_key text not null,
  sent_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(task_id, user_id, reminder_key)
);

-- 9. Create Events Table (Calendar)
create table public.events (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  date date not null,
  type text not null check (type in ('event', 'meeting', 'deadline')), -- 'event'=学会活动 (blue), 'meeting'=内部会议 (green), 'deadline'=截止日期 (red)
  color text not null check (color in ('blue', 'green', 'red')),
  team_id uuid references public.teams on delete cascade not null,
  drive_link text,
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 10. Create Notifications Table
create table public.notifications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users on delete cascade not null,
  type text not null,
  title text not null,
  body text not null,
  dedupe_key text unique,
  sent_at timestamp with time zone default timezone('utc'::text, now()) not null,
  read_at timestamp with time zone
);

create table public.announcements (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  target_type text not null default 'all' check (target_type in ('all', 'board', 'committee')),
  target_team_id uuid references public.teams(id) on delete set null,
  created_by uuid references public.users on delete set null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table public.activity_log (
  id uuid default gen_random_uuid() primary key,
  actor_id uuid references public.users on delete set null,
  action_type text not null,
  message text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 11. Enable Row Level Security (RLS) on public.users
alter table public.users enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.task_reminder_logs enable row level security;
alter table public.events enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.activity_log enable row level security;

-- Committee-local permission helper:
create or replace function public.can_manage_committee(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor')
      and is_active = true
  )
  or exists (
    select 1
    from public.team_members
    where team_id = target_team_id
      and user_id = auth.uid()
      and position in ('筹委主席', '筹委副主席')
  );
$$;

grant execute on function public.can_manage_committee(uuid) to authenticated;

create or replace function public.can_view_committee(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor')
      and is_active = true
  )
  or exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.team_id = target_team_id
      and tm.user_id = auth.uid()
      and t.type = 'event'
  );
$$;

grant execute on function public.can_view_committee(uuid) to authenticated;

-- 12. Create basic RLS Policies (allows authenticated users full read, restricted writes)
-- For simplicity & full usability:
-- Users policies:
create policy "Users are viewable by all authenticated users." on public.users
  for select to authenticated using (true);

create policy "Advisors and Chairpersons can insert users." on public.users
  for insert to authenticated with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and is_active = true
        and (can_manage_accounts = true or role in ('convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson'))
    )
  );

create policy "Advisors and Chairpersons can update users." on public.users
  for update to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and is_active = true
        and (can_manage_accounts = true or role in ('convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson'))
    )
  );

create policy "Advisors and Chairpersons can delete users." on public.users
  for delete to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and is_active = true
        and (can_manage_accounts = true or role in ('convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson'))
    )
  );

-- Push subscription policies:
create policy "Users can view own push subscriptions." on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

create policy "Users can manage own push subscriptions." on public.push_subscriptions
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Teams policies:
create policy "Teams are viewable by all authenticated users." on public.teams
  for select to authenticated using (true);

create policy "Advisors and Chairpersons can manage teams." on public.teams
  for all to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
    )
  );

-- Team members policies:
create policy "Committee member rows are viewable by committee members." on public.team_members
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.can_view_committee(team_id)
  );

create policy "Advisors and Chairpersons can manage team members." on public.team_members
  for all to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
    )
  );

create policy "Committee managers can insert team members." on public.team_members
  for insert to authenticated
  with check (public.can_manage_committee(team_id));

create policy "Committee managers can delete team members." on public.team_members
  for delete to authenticated
  using (public.can_manage_committee(team_id));

-- Tasks policies:
create policy "Task managers and related users can view tasks." on public.tasks
  for select to authenticated using (
    auth.uid() = created_by
    or auth.uid() = any(assigned_to)
    or exists (
      select 1 from public.users
      where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead')
    )
  );

create policy "Committee managers can view committee tasks." on public.tasks
  for select to authenticated
  using (public.can_manage_committee(team_id));

create policy "Committee members can view committee tasks." on public.tasks
  for select to authenticated
  using (public.can_view_committee(team_id));

create policy "Task managers can create tasks." on public.tasks
  for insert to authenticated with check (
    auth.uid() = created_by and
    exists (
      select 1 from public.users
      where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead')
    )
  );

create policy "Committee managers can create committee tasks." on public.tasks
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and public.can_manage_committee(team_id)
  );

create policy "Task managers and assignees can update tasks." on public.tasks
  for update to authenticated using (
    auth.uid() = created_by or 
    auth.uid() = any(assigned_to) or
    exists (
      select 1 from public.users
      where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead')
    )
  );

create policy "Committee managers can update committee tasks." on public.tasks
  for update to authenticated
  using (public.can_manage_committee(team_id))
  with check (public.can_manage_committee(team_id));

create policy "Task managers can delete tasks." on public.tasks
  for delete to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead')
    )
  );

create policy "Committee managers can delete committee tasks." on public.tasks
  for delete to authenticated
  using (public.can_manage_committee(team_id));

-- Comments policies:
create policy "Comments are viewable by all authenticated users." on public.task_comments
  for select to authenticated using (true);

create policy "Authenticated users can create comments." on public.task_comments
  for insert to authenticated with check (auth.uid() = user_id);

create policy "Users can delete their own comments." on public.task_comments
  for delete to authenticated using (auth.uid() = user_id);

-- Task reminder log policies:
create policy "Users can view own task reminder logs." on public.task_reminder_logs
  for select to authenticated using (auth.uid() = user_id);

-- Events policies:
create policy "Events are viewable by authenticated users with private committee drive links." on public.events
  for select to authenticated
  using (
    team_id is null
    or title not ilike '%Google Drive%'
    or public.can_view_committee(team_id)
  );

create policy "Advisors, chairpersons, secretaries, and treasurers can manage events." on public.events
  for all to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead')
    )
  );

create policy "Committee managers can insert committee drive events." on public.events
  for insert to authenticated
  with check (
    team_id is not null
    and public.can_manage_committee(team_id)
  );

create policy "Committee managers can update committee drive events." on public.events
  for update to authenticated
  using (
    team_id is not null
    and public.can_manage_committee(team_id)
  )
  with check (
    team_id is not null
    and public.can_manage_committee(team_id)
  );

-- Notifications policies:
create policy "Notifications are viewable by recipient." on public.notifications
  for select to authenticated using (auth.uid() = user_id);

create policy "Authenticated users can create notifications." on public.notifications
  for insert to authenticated with check (auth.uid() is not null);

create policy "Recipient can update (mark read) notifications." on public.notifications
  for update to authenticated using (auth.uid() = user_id);

create policy "Announcements are viewable by authenticated users." on public.announcements
  for select to authenticated using (true);

create policy "Announcement managers can create announcements." on public.announcements
  for insert to authenticated with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.users
      where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
    )
  );

create policy "Announcement managers can update announcements." on public.announcements
  for update to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_active = true and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
    )
  )
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_active = true and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
    )
  );

create policy "Announcement managers can delete announcements." on public.announcements
  for delete to authenticated
  using (
    exists (
      select 1 from public.users
      where id = auth.uid() and is_active = true and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')
    )
  );

create policy "Activity log is viewable by authenticated users." on public.activity_log
  for select to authenticated using (true);

create policy "Authenticated users can create activity log." on public.activity_log
  for insert to authenticated with check (auth.uid() is not null);


-- 13. Trigger function to handle new registered user in auth.users
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, name, email, custom_role_label, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'custom_role_label', '')), ''),
    coalesce(new.raw_user_meta_data->>'role', 'ordinary_member'),
    true
  );
  return new;
end;
$$ language plpgsql security definer;


-- Allow each logged-in user to save their own push-notification token without opening role updates.
create or replace function public.update_my_notification_settings(
  p_fcm_token text,
  p_notification_enabled boolean default true,
  p_device_key text default null,
  p_platform text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set fcm_token = p_fcm_token,
      notification_enabled = p_notification_enabled
  where id = auth.uid();

  if p_fcm_token is not null and length(trim(p_fcm_token)) > 0 then
    if p_device_key is not null and length(trim(p_device_key)) > 0 then
      update public.push_subscriptions
      set is_active = false
      where user_id = auth.uid()
        and (
          device_key = p_device_key
          or device_key is null
        )
        and fcm_token <> p_fcm_token;
    elsif p_platform is not null and length(trim(p_platform)) > 0 then
      update public.push_subscriptions
      set is_active = false
      where user_id = auth.uid()
        and platform = p_platform
        and fcm_token <> p_fcm_token;
    end if;

    insert into public.push_subscriptions (
      user_id,
      fcm_token,
      device_key,
      device_name,
      platform,
      is_active,
      last_seen_at
    )
    values (
      auth.uid(),
      p_fcm_token,
      nullif(trim(coalesce(p_device_key, '')), ''),
      null,
      nullif(trim(coalesce(p_platform, '')), ''),
      p_notification_enabled,
      now()
    )
    on conflict (fcm_token)
    do update set
      user_id = excluded.user_id,
      device_key = excluded.device_key,
      platform = excluded.platform,
      is_active = excluded.is_active,
      last_seen_at = now();
  end if;
end;
$$;

grant execute on function public.update_my_notification_settings(text, boolean, text, text) to authenticated;

create or replace function public.update_my_avatar_url(
  p_avatar_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.users
  set avatar_url = nullif(trim(coalesce(p_avatar_url, '')), '')
  where id = auth.uid();
end;
$$;

grant execute on function public.update_my_avatar_url(text) to authenticated;

-- Trigger to sync auth users with public.users
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
