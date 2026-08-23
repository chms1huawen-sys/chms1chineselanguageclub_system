-- Allow the Social Media Editor role when creating or updating accounts.
-- Run this once in Supabase SQL Editor.

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

notify pgrst, 'reload schema';
