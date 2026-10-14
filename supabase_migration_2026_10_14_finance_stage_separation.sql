-- Separate approval duties without changing ledger access or historical claims.
begin;
create or replace function public.finance_can_review(stage text, person uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.users u where u.id=person and u.is_active and case stage
    when 'treasury' then u.role not in ('convener_teacher','advisor_teacher','advisor','chairperson')
      and (u.role in ('treasurer','vice_treasurer') or u.can_manage_finance)
    when 'president' then u.role not in ('convener_teacher','advisor_teacher','advisor')
      and (u.role='chairperson' or u.can_approve_finance)
    when 'teacher' then u.role in ('convener_teacher','advisor_teacher','advisor')
    else false end);
$$;
revoke all on function public.finance_can_review(text,uuid) from public,anon;
grant execute on function public.finance_can_review(text,uuid) to authenticated,service_role;

create or replace function public.finance_review_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- The RPC writes its audit row in the same transaction as the status change.
  -- Rejecting here rolls back both, including requests from an old client.
  if new.action in ('approve','return') then
    if new.actor_id is distinct from auth.uid()
      or not public.finance_can_review(new.from_status,new.actor_id) then
      raise exception 'FINANCE_FORBIDDEN';
    end if;
    if new.action='approve' and new.to_status is distinct from
      (case new.from_status when 'treasury' then 'president'
        when 'president' then 'teacher' when 'teacher' then 'approved' else null end) then
      raise exception 'FINANCE_STATUS_CHANGED';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.finance_review_stage_guard() from public,anon,authenticated;
drop trigger if exists finance_review_stage_guard on public.finance_reviews;
create trigger finance_review_stage_guard before insert on public.finance_reviews
for each row execute function public.finance_review_stage_guard();
notify pgrst,'reload schema';
commit;
