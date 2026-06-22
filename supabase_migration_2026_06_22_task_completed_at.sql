-- Track task completion time so late completions remain visible in member performance.

alter table public.tasks
  add column if not exists completed_at timestamp with time zone;

-- Backfill existing completed tasks with updated_at only when no completion time exists.
-- This cannot perfectly reconstruct old completion times, but preserves the best available timestamp.
update public.tasks
set completed_at = coalesce(updated_at, created_at, now())
where status = 'completed'
  and completed_at is null;

notify pgrst, 'reload schema';
