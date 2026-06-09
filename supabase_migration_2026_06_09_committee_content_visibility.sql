-- Keep committee cards visible, but restrict internal committee content.
-- Internal content includes committee member lists, committee tasks, and committee Google Drive records.

create or replace function public.can_view_committee(target_team_id uuid)
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
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.team_id = target_team_id
      and tm.user_id = auth.uid()
      and t.type = 'event'
  );
$$;

grant execute on function public.can_view_committee(uuid) to authenticated;

drop policy if exists "Team members are viewable by all authenticated users." on public.team_members;
drop policy if exists "Committee member rows are viewable by committee members." on public.team_members;
create policy "Committee member rows are viewable by committee members." on public.team_members
  for select to authenticated
  using (
    auth.uid() = user_id
    or public.can_view_committee(team_id)
  );

drop policy if exists "Committee members can view committee tasks." on public.tasks;
create policy "Committee members can view committee tasks." on public.tasks
  for select to authenticated
  using (public.can_view_committee(team_id));

drop policy if exists "Events are viewable by all authenticated users." on public.events;
drop policy if exists "Events are viewable by authenticated users with private committee drive links." on public.events;
create policy "Events are viewable by authenticated users with private committee drive links." on public.events
  for select to authenticated
  using (
    team_id is null
    or title not ilike '%Google Drive%'
    or public.can_view_committee(team_id)
  );
