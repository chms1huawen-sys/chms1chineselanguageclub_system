-- Run this once in Supabase SQL Editor.
-- Keeps existing data, updates role taxonomy, adds notification fields, and aligns RLS.

alter table public.users
  add column if not exists custom_role_label text,
  add column if not exists fcm_token text,
  add column if not exists notification_enabled boolean not null default true;

alter table public.tasks
  add column if not exists updated_at timestamp with time zone
  default timezone('utc'::text, now()) not null;

alter table public.notifications
  add column if not exists dedupe_key text;

create unique index if not exists notifications_dedupe_key_idx
  on public.notifications(dedupe_key)
  where dedupe_key is not null;

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at
  before update on public.tasks
  for each row execute procedure public.set_updated_at();

alter table public.users drop constraint if exists users_role_check;

update public.users
set role = case role
  when 'advisor' then 'advisor_teacher'
  when 'committee' then 'custom'
  when 'event_member' then 'activity_member'
  else role
end;

alter table public.users
  add constraint users_role_check check (role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'activity_member', 'media_lead', 'vice_media_lead', 'custom'));

alter table public.users
  alter column role set default 'activity_member';

drop policy if exists "Advisors and Chairpersons can insert users." on public.users;
drop policy if exists "Advisors and Chairpersons can update users." on public.users;
drop policy if exists "Advisors and Chairpersons can delete users." on public.users;
drop policy if exists "Board managers can insert users." on public.users;
drop policy if exists "Board managers can update users." on public.users;
drop policy if exists "Board managers can delete users." on public.users;
drop policy if exists "Advisors and Chairpersons can manage teams." on public.teams;
drop policy if exists "Board managers can manage teams." on public.teams;
drop policy if exists "Advisors and Chairpersons can manage team members." on public.team_members;
drop policy if exists "Board managers can manage team members." on public.team_members;
drop policy if exists "All authenticated users can create tasks." on public.tasks;
drop policy if exists "Task managers can create tasks." on public.tasks;
drop policy if exists "Advisors, chairpersons and assignees can update tasks." on public.tasks;
drop policy if exists "Task managers and assignees can update tasks." on public.tasks;
drop policy if exists "Advisors and chairpersons can delete tasks." on public.tasks;
drop policy if exists "Task managers can delete tasks." on public.tasks;
drop policy if exists "Advisors, chairpersons, secretaries, and treasurers can manage events." on public.events;
drop policy if exists "Task managers can manage events." on public.events;

create policy "Board managers can insert users." on public.users
  for insert to authenticated with check (exists (select 1 from public.users where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')));

create policy "Board managers can update users." on public.users
  for update to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')));

create policy "Board managers can delete users." on public.users
  for delete to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')));

create policy "Board managers can manage teams." on public.teams
  for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')));

create policy "Board managers can manage team members." on public.team_members
  for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson')));

create policy "Task managers can create tasks." on public.tasks
  for insert to authenticated with check (
    auth.uid() = created_by and
    exists (select 1 from public.users where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead'))
  );

create policy "Task managers and assignees can update tasks." on public.tasks
  for update to authenticated using (
    auth.uid() = created_by or
    auth.uid() = any(assigned_to) or
    exists (select 1 from public.users where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead'))
  );

create policy "Task managers can delete tasks." on public.tasks
  for delete to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead')));

create policy "Task managers can manage events." on public.events
  for all to authenticated using (exists (select 1 from public.users where id = auth.uid() and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead')));
drop policy if exists "Notifications are viewable by recipient." on public.notifications;
drop policy if exists "System/admins can create notifications." on public.notifications;
drop policy if exists "Task managers can create notifications." on public.notifications;
drop policy if exists "Authenticated users can create notifications." on public.notifications;
drop policy if exists "Recipient can update (mark read) notifications." on public.notifications;

create policy "Notifications are viewable by recipient." on public.notifications
  for select to authenticated using (auth.uid() = user_id);

create policy "Authenticated users can create notifications." on public.notifications
  for insert to authenticated with check (auth.uid() is not null);

create policy "Recipient can update (mark read) notifications." on public.notifications
  for update to authenticated using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, name, email, custom_role_label, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data->>'custom_role_label', '')), ''),
    coalesce(new.raw_user_meta_data->>'role', 'activity_member'),
    true
  );
  return new;
end;
$$ language plpgsql security definer;

-- Allow each logged-in user to save their own push-notification token without opening role updates.
create or replace function public.update_my_notification_settings(
  p_fcm_token text,
  p_notification_enabled boolean default true
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
end;
$$;

grant execute on function public.update_my_notification_settings(text, boolean) to authenticated;
