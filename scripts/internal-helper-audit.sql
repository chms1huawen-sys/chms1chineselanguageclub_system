begin transaction read only;
select p.oid::regprocedure::text as signature, pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
  ('can_manage_committee','can_view_committee','finance_access','finance_can_record_income');
commit;
