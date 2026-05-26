-- Allow both secretary and vice secretary to view/manage leave records.
-- Run once in Supabase SQL Editor if the leave module migration was already applied.

drop policy if exists "Leave managers can manage system settings." on public.system_settings;

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

drop policy if exists "Users and leave managers can view leave applications." on public.leave_applications;
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

create policy "Leave managers can delete leave applications." on public.leave_applications
  for delete to authenticated using (
    exists (
      select 1 from public.users
      where id = auth.uid()
        and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary')
        and is_active = true
    )
  );
