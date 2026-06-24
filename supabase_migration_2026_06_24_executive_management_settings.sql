-- Allow executive managers to maintain shared system links such as the Executive Google Drive folder.
-- Run once in Supabase SQL Editor.

create table if not exists public.system_settings (
  key text primary key,
  value text,
  updated_by uuid references public.users(id) on delete set null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.system_settings enable row level security;

drop policy if exists "System settings are readable by authenticated users." on public.system_settings;
create policy "System settings are readable by authenticated users." on public.system_settings
  for select to authenticated using (true);

drop policy if exists "Managers can insert system settings." on public.system_settings;
create policy "Managers can insert system settings." on public.system_settings
  for insert to authenticated with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in (
          'convener_teacher',
          'advisor_teacher',
          'advisor',
          'chairperson',
          'vice_chairperson',
          'secretary',
          'vice_secretary'
        )
        and is_active = true
    )
  );

drop policy if exists "Managers can update system settings." on public.system_settings;
create policy "Managers can update system settings." on public.system_settings
  for update to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in (
          'convener_teacher',
          'advisor_teacher',
          'advisor',
          'chairperson',
          'vice_chairperson',
          'secretary',
          'vice_secretary'
        )
        and is_active = true
    )
  )
  with check (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in (
          'convener_teacher',
          'advisor_teacher',
          'advisor',
          'chairperson',
          'vice_chairperson',
          'secretary',
          'vice_secretary'
        )
        and is_active = true
    )
  );

notify pgrst, 'reload schema';
