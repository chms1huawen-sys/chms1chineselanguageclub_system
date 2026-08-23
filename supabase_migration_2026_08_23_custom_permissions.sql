-- Add explicit permission switches for custom executive roles.
-- Run once in Supabase SQL Editor.

create table if not exists public.system_settings (
  key text primary key,
  value text,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.system_settings enable row level security;

alter table public.users
  add column if not exists can_manage_accounts boolean not null default false,
  add column if not exists can_manage_executive boolean not null default false,
  add column if not exists can_create_tasks boolean not null default false,
  add column if not exists can_manage_announcements boolean not null default false,
  add column if not exists can_manage_calendar boolean not null default false,
  add column if not exists can_view_leave_records boolean not null default false,
  add column if not exists can_manage_handover boolean not null default false;

alter table public.users
  drop constraint if exists users_role_check;

alter table public.users
  add constraint users_role_check
  check (
    role in (
      'convener_teacher',
      'advisor_teacher',
      'advisor',
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
      'social_media_editor',
      'ordinary_member',
      'custom',
      'committee',
      'event_member'
    )
  );

create or replace function public.current_user_has_permission(p_permission text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select case p_permission
        when 'can_manage_accounts' then
          u.can_manage_accounts or u.role in ('convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson')
        when 'can_manage_executive' then
          u.can_manage_executive or u.role in ('convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson')
        when 'can_create_tasks' then
          u.can_create_tasks or u.role in (
            'convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson',
            'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer',
            'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead',
            'media_lead', 'vice_media_lead', 'social_media_editor'
          )
        when 'can_manage_announcements' then
          u.can_manage_announcements or u.role in ('convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson')
        when 'can_manage_calendar' then
          u.can_manage_calendar or u.role in (
            'convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson',
            'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer'
          )
        when 'can_view_leave_records' then
          u.can_view_leave_records or u.role in ('convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'secretary', 'vice_secretary')
        when 'can_manage_handover' then
          u.can_manage_handover or u.role in ('convener_teacher', 'advisor_teacher', 'advisor', 'chairperson', 'vice_chairperson')
        else false
      end
      from public.users u
      where u.id = auth.uid()
        and u.is_active = true
      limit 1
    ),
    false
  );
$$;

grant execute on function public.current_user_has_permission(text) to authenticated;

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

drop policy if exists "Advisors and Chairpersons can insert users." on public.users;
create policy "Advisors and Chairpersons can insert users." on public.users
  for insert to authenticated with check (public.current_user_has_permission('can_manage_accounts'));

drop policy if exists "Advisors and Chairpersons can update users." on public.users;
create policy "Advisors and Chairpersons can update users." on public.users
  for update to authenticated using (public.current_user_has_permission('can_manage_accounts'))
  with check (public.current_user_has_permission('can_manage_accounts'));

drop policy if exists "Advisors and Chairpersons can delete users." on public.users;
create policy "Advisors and Chairpersons can delete users." on public.users
  for delete to authenticated using (public.current_user_has_permission('can_manage_accounts'));

drop policy if exists "Permission users can manage teams." on public.teams;
create policy "Permission users can manage teams." on public.teams
  for all to authenticated using (
    public.current_user_has_permission('can_manage_executive')
    or public.current_user_has_permission('can_manage_handover')
  )
  with check (
    public.current_user_has_permission('can_manage_executive')
    or public.current_user_has_permission('can_manage_handover')
  );

drop policy if exists "Permission users can manage team members." on public.team_members;
create policy "Permission users can manage team members." on public.team_members
  for all to authenticated using (public.current_user_has_permission('can_manage_executive'))
  with check (public.current_user_has_permission('can_manage_executive'));

drop policy if exists "Permission users can create tasks." on public.tasks;
create policy "Permission users can create tasks." on public.tasks
  for insert to authenticated with check (public.current_user_has_permission('can_create_tasks'));

drop policy if exists "Permission users can update tasks." on public.tasks;
create policy "Permission users can update tasks." on public.tasks
  for update to authenticated using (public.current_user_has_permission('can_create_tasks'))
  with check (public.current_user_has_permission('can_create_tasks'));

drop policy if exists "Permission users can delete tasks." on public.tasks;
create policy "Permission users can delete tasks." on public.tasks
  for delete to authenticated using (public.current_user_has_permission('can_create_tasks'));

drop policy if exists "Permission users can manage events." on public.events;
create policy "Permission users can manage events." on public.events
  for all to authenticated using (public.current_user_has_permission('can_manage_calendar'))
  with check (public.current_user_has_permission('can_manage_calendar'));

drop policy if exists "Permission users can create announcements." on public.announcements;
create policy "Permission users can create announcements." on public.announcements
  for insert to authenticated with check (public.current_user_has_permission('can_manage_announcements'));

drop policy if exists "Permission users can update announcements." on public.announcements;
create policy "Permission users can update announcements." on public.announcements
  for update to authenticated using (public.current_user_has_permission('can_manage_announcements'))
  with check (public.current_user_has_permission('can_manage_announcements'));

drop policy if exists "Permission users can delete announcements." on public.announcements;
create policy "Permission users can delete announcements." on public.announcements
  for delete to authenticated using (public.current_user_has_permission('can_manage_announcements'));

drop policy if exists "Permission users can insert system settings." on public.system_settings;
create policy "Permission users can insert system settings." on public.system_settings
  for insert to authenticated with check (public.current_user_has_permission('can_manage_executive'));

drop policy if exists "Permission users can update system settings." on public.system_settings;
create policy "Permission users can update system settings." on public.system_settings
  for update to authenticated using (public.current_user_has_permission('can_manage_executive'))
  with check (public.current_user_has_permission('can_manage_executive'));

drop policy if exists "Permission users can view leave applications." on public.leave_applications;
create policy "Permission users can view leave applications." on public.leave_applications
  for select to authenticated using (public.current_user_has_permission('can_view_leave_records'));

notify pgrst, 'reload schema';
