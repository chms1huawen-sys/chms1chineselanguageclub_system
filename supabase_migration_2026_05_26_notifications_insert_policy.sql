-- Allow authenticated users and app features to create in-app notifications for recipients.
-- Recipients can still only read their own notifications through the existing select policy.

drop policy if exists "Authenticated users can create notifications." on public.notifications;
drop policy if exists "Users can create own notifications." on public.notifications;

create policy "Authenticated users can create notifications." on public.notifications
  for insert to authenticated
  with check (auth.uid() is not null);

grant insert on public.notifications to authenticated;
