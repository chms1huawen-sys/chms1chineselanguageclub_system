-- Fix leave application tables and system_settings RLS after reset/clean schema.
-- Run this once in Supabase SQL Editor, then refresh the app.

create table if not exists public.system_settings (
  key text primary key,
  value text,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists public.leave_applications (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  leave_type text not null,
  custom_leave_type text,
  leave_date date not null,
  reason text not null,
  drive_folder_url text,
  drive_file_url text,
  attachment_uploaded boolean not null default false,
  status text not null default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.leave_applications
  add column if not exists custom_leave_type text,
  add column if not exists drive_folder_url text,
  add column if not exists drive_file_url text,
  add column if not exists attachment_uploaded boolean not null default false,
  add column if not exists status text not null default 'pending',
  add column if not exists created_at timestamp with time zone default timezone('utc'::text, now()) not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leave_applications_user_id_fkey'
      and conrelid = 'public.leave_applications'::regclass
  ) then
    alter table public.leave_applications
      add constraint leave_applications_user_id_fkey
      foreign key (user_id) references public.users(id) on delete cascade;
  end if;
end $$;

create index if not exists leave_applications_user_id_idx on public.leave_applications(user_id);
create index if not exists leave_applications_created_at_idx on public.leave_applications(created_at desc);

alter table public.system_settings enable row level security;
alter table public.leave_applications enable row level security;

drop policy if exists "System settings are readable by authenticated users." on public.system_settings;
create policy "System settings are readable by authenticated users." on public.system_settings
  for select to authenticated using (true);

drop policy if exists "Managers can insert system settings." on public.system_settings;
create policy "Managers can insert system settings." on public.system_settings
  for insert to authenticated with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary')
        and is_active = true
    )
  );

drop policy if exists "Managers can update system settings." on public.system_settings;
create policy "Managers can update system settings." on public.system_settings
  for update to authenticated using (
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

drop policy if exists "Users can create own leave applications." on public.leave_applications;
create policy "Users can create own leave applications." on public.leave_applications
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users can view own leave applications and managers can view all." on public.leave_applications;
create policy "Users can view own leave applications and managers can view all." on public.leave_applications
  for select to authenticated using (
    auth.uid() = user_id
    or exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary')
        and is_active = true
    )
  );

drop policy if exists "Managers can update leave applications." on public.leave_applications;
create policy "Managers can update leave applications." on public.leave_applications
  for update to authenticated using (
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

notify pgrst, 'reload schema';
