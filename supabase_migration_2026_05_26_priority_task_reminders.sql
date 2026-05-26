-- Priority-based task reminder logs.
-- Run once in Supabase SQL Editor before deploying task-deadline-reminder.

alter table public.tasks
  add column if not exists priority text not null default 'medium'
  check (priority in ('high', 'medium', 'low'));

create table if not exists public.task_reminder_logs (
  id uuid default gen_random_uuid() primary key,
  task_id uuid references public.tasks(id) on delete cascade not null,
  user_id uuid references public.users(id) on delete cascade not null,
  reminder_key text not null,
  sent_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(task_id, user_id, reminder_key)
);

alter table public.task_reminder_logs enable row level security;

drop policy if exists "Users can view own task reminder logs." on public.task_reminder_logs;

create policy "Users can view own task reminder logs." on public.task_reminder_logs
  for select to authenticated using (user_id = auth.uid());

grant select on public.task_reminder_logs to authenticated;
grant select, insert, update, delete on public.task_reminder_logs to service_role;
