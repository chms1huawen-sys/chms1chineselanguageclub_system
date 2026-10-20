begin;
alter table public.leave_applications
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz;

drop policy if exists "Managers can update leave applications." on public.leave_applications;
drop policy if exists "Owners can update their leave applications." on public.leave_applications;
create policy "Owners can update their leave applications." on public.leave_applications
  for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
-- A restrictive boundary remains effective even if an older permissive policy exists.
drop policy if exists "Leave updates require active original owner." on public.leave_applications;
create policy "Leave updates require active original owner." on public.leave_applications
  as restrictive for update to authenticated
  using (user_id=auth.uid() and exists(select 1 from public.users where id=auth.uid() and is_active=true))
  with check (user_id=auth.uid() and exists(select 1 from public.users where id=auth.uid() and is_active=true));

revoke update on public.leave_applications from authenticated;
grant update(leave_type,custom_leave_type,leave_date,reason,drive_file_url,attachment_uploaded)
  on public.leave_applications to authenticated;

create or replace function public.guard_leave_owner_edit()
returns trigger language plpgsql set search_path=public as $$
begin
  if auth.role()='authenticated' then
    if auth.uid() is null or old.user_id is distinct from auth.uid()
      or not exists(select 1 from public.users where id=auth.uid() and is_active=true) then
      raise exception 'LEAVE_EDIT_FORBIDDEN' using errcode='42501';
    end if;
    if (to_jsonb(new)-array['leave_type','custom_leave_type','leave_date','reason','drive_file_url','attachment_uploaded'])
      is distinct from (to_jsonb(old)-array['leave_type','custom_leave_type','leave_date','reason','drive_file_url','attachment_uploaded']) then
      raise exception 'LEAVE_IMMUTABLE_FIELDS' using errcode='42501';
    end if;
    if new.leave_type not in ('sick','official','personal','custom')
      or (new.leave_type='custom' and nullif(btrim(new.custom_leave_type),'') is null)
      or nullif(btrim(new.reason),'') is null or length(new.reason)>10000
      or length(coalesce(new.custom_leave_type,''))>200
      or length(coalesce(new.drive_file_url,''))>2048
      or (nullif(new.drive_file_url,'') is not null and new.drive_file_url !~ '^https?://')
      or new.attachment_uploaded is distinct from true then
      raise exception 'LEAVE_INVALID_INPUT' using errcode='22023';
    end if;
  end if;
  new.version:=old.version+1;
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;
drop trigger if exists guard_leave_owner_edit on public.leave_applications;
create trigger guard_leave_owner_edit before update on public.leave_applications
  for each row execute function public.guard_leave_owner_edit();
notify pgrst,'reload schema';
commit;
