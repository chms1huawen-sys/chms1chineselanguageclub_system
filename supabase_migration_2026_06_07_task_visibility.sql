-- Restrict task visibility before launch.
-- Managers can view all tasks. Ordinary members only view tasks they created or were assigned.

drop policy if exists "Tasks are viewable by all authenticated users." on public.tasks;
drop policy if exists "Task managers and related users can view tasks." on public.tasks;

create policy "Task managers and related users can view tasks." on public.tasks
  for select to authenticated using (
    auth.uid() = created_by
    or auth.uid() = any(assigned_to)
    or exists (
      select 1 from public.users
      where id = auth.uid()
        and role in (
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
          'media_lead',
          'vice_media_lead'
        )
    )
  );
