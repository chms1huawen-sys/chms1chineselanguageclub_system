begin;
alter table public.finance_report_format add column if not exists club_label text;
alter table public.finance_report_format add column if not exists club_name text;
alter table public.finance_report_format drop constraint if exists finance_report_format_category_check;
alter table public.finance_report_format drop constraint if exists finance_report_format_item_check;
update public.finance_report_format set
  club_label=coalesce(club_label,case when lang='zh' then '社团/学会' else 'Club/Society' end),
  club_name=coalesce(club_name,case when lang='zh' then '一中华文学会' else 'CLC_sys' end),
  title=case when title='一中华文学会 · 收支账目' then '{year}年社团财政报告' when title='CLC_sys · Financial Statement' then '{year} Club Financial Report' else title end,
  category=case when category in ('类别','Type') then '' else category end,
  item=case when item in ('项目','Description') then '' else item end,
  total=case when total='合计' then '总收入' else total end
where club_label is null;
alter table public.finance_report_format add constraint finance_report_format_category_check check(length(category)<=30);
alter table public.finance_report_format add constraint finance_report_format_item_check check(length(item)<=30);
create or replace function public.finance_save_report_headings(p_lang text,p_title text,p_category text,p_item text,p_total text,p_club_label text,p_club_name text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.finance_can_record_income() then raise exception 'FINANCE_FORBIDDEN'; end if;
  if p_club_label is null or length(trim(p_club_label)) not between 1 and 60 or p_club_name is null or length(trim(p_club_name)) not between 1 and 60 then raise exception 'FINANCE_INVALID'; end if;
  insert into public.finance_report_format(lang,title,category,item,total,club_label,club_name,updated_by)
  values(p_lang,trim(p_title),trim(p_category),trim(p_item),trim(p_total),trim(p_club_label),trim(p_club_name),auth.uid())
  on conflict(lang) do update set title=excluded.title,category=excluded.category,item=excluded.item,total=excluded.total,club_label=excluded.club_label,club_name=excluded.club_name,updated_by=excluded.updated_by,updated_at=now();
end; $$;
revoke all on function public.finance_save_report_headings(text,text,text,text,text,text,text) from public,anon;
grant execute on function public.finance_save_report_headings(text,text,text,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
