begin;

create or replace function public.can_manage_committee(target_team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.active_member() and (
    exists(select 1 from public.users where id=auth.uid()
      and role in ('convener_teacher','advisor_teacher','chairperson','vice_chairperson','advisor'))
    or exists(select 1 from public.team_members where team_id=target_team_id
      and user_id=auth.uid() and position in ('筹委主席','筹委副主席'))
  );
$$;

create or replace function public.can_view_committee(target_team_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.active_member() and (
    exists(select 1 from public.users where id=auth.uid()
      and role in ('convener_teacher','advisor_teacher','chairperson','vice_chairperson','advisor'))
    or exists(select 1 from public.team_members tm join public.teams t on t.id=tm.team_id
      where tm.team_id=target_team_id and tm.user_id=auth.uid() and t.type='event')
  );
$$;

revoke all on function public.can_manage_committee(uuid) from public, anon;
revoke all on function public.can_view_committee(uuid) from public, anon;
revoke all on function public.finance_access(text,uuid) from public, anon;
revoke all on function public.finance_can_record_income() from public, anon;
grant execute on function public.can_manage_committee(uuid), public.can_view_committee(uuid),
  public.finance_access(text,uuid), public.finance_can_record_income() to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
