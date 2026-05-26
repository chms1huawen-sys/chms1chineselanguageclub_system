-- Leave application module.
-- Run once in Supabase SQL Editor.

create table if not exists public.system_settings (
  key text primary key,
  value text not null,
  updated_by uuid references public.users on delete set null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.system_settings enable row level security;

drop policy if exists "Authenticated users can view system settings." on public.system_settings;
drop policy if exists "Leave managers can manage system settings." on public.system_settings;

create policy "Authenticated users can view system settings." on public.system_settings
  for select to authenticated using (true);

create policy "Leave managers can manage system settings." on public.system_settings
  for all to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary')
        and is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary')
        and is_active = true
    )
  );

grant select on public.system_settings to authenticated;
grant insert, update, delete on public.system_settings to authenticated;
grant select, insert, update, delete on public.system_settings to service_role;

create table if not exists public.leave_applications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.users on delete cascade not null,
  leave_type text not null check (leave_type in ('sick', 'official', 'personal', 'custom')),
  custom_leave_type text,
  leave_date date not null,
  reason text not null,
  drive_folder_url text,
  drive_file_url text,
  attachment_uploaded boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'recorded')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.leave_applications
  add column if not exists drive_file_url text;

alter table public.leave_applications
  add column if not exists status text not null default 'pending'
  check (status in ('pending', 'approved', 'rejected', 'recorded'));

alter table public.leave_applications enable row level security;

create index if not exists leave_applications_user_id_idx
  on public.leave_applications(user_id);

create index if not exists leave_applications_leave_date_idx
  on public.leave_applications(leave_date);

drop policy if exists "Users and leave managers can view leave applications." on public.leave_applications;
drop policy if exists "Users can create own leave applications." on public.leave_applications;
drop policy if exists "Leave managers can delete leave applications." on public.leave_applications;

create policy "Users and leave managers can view leave applications." on public.leave_applications
  for select to authenticated using (
    user_id = auth.uid()
    or exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary')
        and is_active = true
    )
  );

create policy "Users can create own leave applications." on public.leave_applications
  for insert to authenticated with check (
    user_id = auth.uid()
  );

create policy "Leave managers can delete leave applications." on public.leave_applications
  for delete to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary')
        and is_active = true
    )
  );

grant select, insert, delete on public.leave_applications to authenticated;
grant select, insert, update, delete on public.leave_applications to service_role;
