-- Read-only policy metadata; no member records, keys or function bodies are returned.
begin transaction read only;
select
  (select count(*) from pg_tables where schemaname='public' and not rowsecurity) as public_tables_without_rls,
  has_column_privilege('authenticated', 'public.users', 'fcm_token', 'SELECT') as member_can_read_push_token,
  has_column_privilege('service_role', 'public.users', 'fcm_token', 'SELECT') as push_server_can_read_token,
  has_function_privilege('anon', 'public.get_active_member_count()', 'EXECUTE') as anonymous_member_count,
  has_function_privilege('authenticated', 'public.get_active_member_count()', 'EXECUTE') as member_count_available,
  exists(select 1 from pg_policies where schemaname='public' and tablename='tasks'
    and policyname='task_delete_owner_only' and permissive='RESTRICTIVE'
    and cmd='DELETE' and qual like '%created_by%auth.uid()%') as owner_delete_gate,
  exists(select 1 from pg_trigger where tgrelid='public.tasks'::regclass
    and tgname='task_update_guard' and tgenabled='O') as task_update_trigger_enabled,
  (select count(*) from pg_policies where schemaname='storage' and tablename='objects'
    and permissive='RESTRICTIVE' and cmd in ('INSERT','UPDATE')) as restrictive_upload_gates;
commit;
