begin transaction read only;
select p.proname,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as member_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as server_execute,
  (select relrowsecurity from pg_class where oid='public.blog_visit_budget'::regclass) as budget_rls_enabled
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('blog_record_visit','record_public_blog_visit');
commit;
