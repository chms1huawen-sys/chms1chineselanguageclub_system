-- Apply ONLY after the frontend using MEMBER_PROFILE_FIELDS has been deployed.
-- Older frontend bundles selecting users(*) will fail after this migration.
begin;
revoke select on public.users from public, anon, authenticated;
revoke select(fcm_token) on public.users from public, anon, authenticated;
do $$
declare columns text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into columns
  from information_schema.columns
  where table_schema='public' and table_name='users' and column_name <> 'fcm_token';
  execute format('grant select (%s) on public.users to authenticated', columns);
end;
$$;
notify pgrst, 'reload schema';
commit;
