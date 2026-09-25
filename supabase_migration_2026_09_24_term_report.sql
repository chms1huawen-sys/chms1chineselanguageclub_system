begin;
create or replace function public.club_term_report(p_year integer,p_half integer default 0)
returns jsonb language plpgsql security definer set search_path=public as $$
declare s date; e date; result jsonb;
begin
  if not exists(select 1 from users where id=auth.uid() and is_active)
    or not public.current_user_has_permission('can_manage_handover')
    or not public.finance_access('view') then raise exception 'REPORT_FORBIDDEN'; end if;
  if p_year is null or p_year not between 2000 and 2100 or p_half is null or p_half not in (0,1,2) then raise exception 'REPORT_PERIOD_INVALID'; end if;
  s:=make_date(p_year,case when p_half=2 then 7 else 1 end,1);
  e:=case when p_half=1 then make_date(p_year,7,1) else make_date(p_year+1,1,1) end;
  select jsonb_build_object(
    'generated_at',now(),'start',s,'end',e-1,
    'rosters',coalesce((select jsonb_agg(jsonb_build_object('name',g.name,'session',g.session,'members',
      case when not g.is_archived then (select coalesce(jsonb_agg(jsonb_build_object('name',u.name,'role',u.role,'position',u.custom_role_label) order by u.name),'[]') from users u where u.is_active)
      else (select coalesce(jsonb_agg(jsonb_build_object('name',u.name,'role',u.role,'position',m.position) order by u.name),'[]') from team_members m join users u on u.id=m.user_id where m.team_id=g.id) end
    ) order by g.session) from teams g where g.type='board' and g.session in (p_year||'-H1',p_year||'-H2') and (p_half=0 or g.session=p_year||'-H'||p_half)),'[]'),
    'committees',coalesce((select jsonb_agg(jsonb_build_object('name',g.name,'session',g.session,'members',
      (select coalesce(jsonb_agg(jsonb_build_object('name',u.name,'position',m.position) order by u.name),'[]') from team_members m join users u on u.id=m.user_id where m.team_id=g.id)) order by g.created_at)
      from teams g where g.type='event' and coalesce(g.start_date,g.created_at::date)<e and (g.end_date is null or g.end_date>=s)),'[]'),
    'leaves',coalesce((select jsonb_agg(to_jsonb(l)||jsonb_build_object('applicant_name',u.name) order by l.leave_date,u.name) from leave_applications l left join users u on u.id=l.user_id where l.leave_date>=s and l.leave_date<e),'[]'),
    'events',coalesce((select jsonb_agg(jsonb_build_object('title',v.title,'date',v.date,'type',v.type,'notes',v.notes) order by v.date,v.title) from events v where v.date>=s and v.date<e and v.type in ('event','meeting')),'[]'),
    'inventory',coalesce((select jsonb_agg(jsonb_build_object('name',i.name,'category',c.name,'available',i.available,'reserved',i.reserved,'on_loan',i.on_loan,'unit',i.unit) order by c.name,i.name) from inventory_items i join inventory_categories c on c.id=i.category_id where i.available+i.reserved+i.on_loan>0),'[]'),
    'finance',public.finance_report(make_date(p_year,1,1),make_date(p_year+1,1,1)),
    'formats',coalesce((select jsonb_agg(to_jsonb(f)) from finance_report_format f),'[]')
  ) into result;
  return result;
end $$;
revoke all on function public.club_term_report(integer,integer) from public,anon;
grant execute on function public.club_term_report(integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
