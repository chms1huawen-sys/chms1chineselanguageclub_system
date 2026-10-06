-- Metadata-only audit. Findings require code review, not automatic permission removal.
begin transaction read only;
select p.oid::regprocedure::text as function_signature,
       p.prosecdef as security_definer,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anonymous_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as member_execute,
       exists(select 1 from unnest(coalesce(p.proconfig, array[]::text[])) config
              where config like 'search_path=%') as fixed_search_path
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef
order by p.proname, p.oid
limit 200;
commit;
