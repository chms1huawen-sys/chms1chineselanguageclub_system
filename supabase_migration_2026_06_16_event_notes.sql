-- Add editable notes to calendar events.
-- Run this once in Supabase SQL Editor before using the new calendar notes field online.

alter table public.events
  add column if not exists notes text;

notify pgrst, 'reload schema';
