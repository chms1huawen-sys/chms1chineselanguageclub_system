begin transaction read only;
select c.relname,t.tgname,t.tgenabled,
  has_table_privilege('anon','public.member_write_budget','SELECT') as anon_budget_read,
  has_table_privilege('authenticated','public.member_write_budget','INSERT,UPDATE,DELETE') as member_budget_write,
  has_function_privilege('authenticated','public.enforce_member_write_budget(text,integer)','EXECUTE') as member_direct_limit_call,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and t.tgname like 'member_write_%' order by c.relname,t.tgname;
commit;
