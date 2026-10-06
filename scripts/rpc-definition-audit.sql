begin transaction read only;
select p.oid::regprocedure::text as signature, pg_get_functiondef(p.oid) as definition,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as member_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f' order by p.proname;
commit;
