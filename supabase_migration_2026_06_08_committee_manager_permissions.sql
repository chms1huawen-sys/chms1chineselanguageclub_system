-- Allow committee presidents and vice presidents to manage their own committee.
-- Run this in Supabase SQL Editor after deploying the frontend.

create or replace function public.can_manage_committee(target_team_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and role in ('convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor')
      and is_active = true
  )
  or exists (
    select 1
    from public.team_members
    where team_id = target_team_id
      and user_id = auth.uid()
      and position in ('筹委主席', '筹委副主席')
  );
$$;

grant execute on function public.can_manage_committee(uuid) to authenticated;

drop policy if exists "Committee managers can insert team members." on public.team_members;
create policy "Committee managers can insert team members." on public.team_members
  for insert to authenticated
  with check (public.can_manage_committee(team_id));

drop policy if exists "Committee managers can delete team members." on public.team_members;
create policy "Committee managers can delete team members." on public.team_members
  for delete to authenticated
  using (public.can_manage_committee(team_id));

drop policy if exists "Committee managers can create committee tasks." on public.tasks;
create policy "Committee managers can create committee tasks." on public.tasks
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and public.can_manage_committee(team_id)
  );

drop policy if exists "Committee managers can view committee tasks." on public.tasks;
create policy "Committee managers can view committee tasks." on public.tasks
  for select to authenticated
  using (public.can_manage_committee(team_id));

drop policy if exists "Committee managers can update committee tasks." on public.tasks;
create policy "Committee managers can update committee tasks." on public.tasks
  for update to authenticated
  using (public.can_manage_committee(team_id))
  with check (public.can_manage_committee(team_id));

drop policy if exists "Committee managers can delete committee tasks." on public.tasks;
create policy "Committee managers can delete committee tasks." on public.tasks
  for delete to authenticated
  using (public.can_manage_committee(team_id));

drop policy if exists "Committee managers can insert committee drive events." on public.events;
create policy "Committee managers can insert committee drive events." on public.events
  for insert to authenticated
  with check (
    team_id is not null
    and public.can_manage_committee(team_id)
  );

drop policy if exists "Committee managers can update committee drive events." on public.events;
create policy "Committee managers can update committee drive events." on public.events
  for update to authenticated
  using (
    team_id is not null
    and public.can_manage_committee(team_id)
  )
  with check (
    team_id is not null
    and public.can_manage_committee(team_id)
  );
