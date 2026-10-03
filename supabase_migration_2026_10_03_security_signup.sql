begin;

-- Signup metadata is user-controlled, not an administrative provisioning channel.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.users(id, name, email, custom_role_label, role, is_active)
  values (new.id, left(coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)), 150),
          new.email, null, 'ordinary_member', false);
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create or replace function public.active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.users where id = auth.uid() and is_active = true);
$$;
revoke all on function public.active_member() from public;
grant execute on function public.active_member() to authenticated;

-- A not-yet-approved account may inspect its own status, but not the member roster.
alter policy "Users are viewable by all authenticated users." on public.users
using (id = auth.uid() or public.active_member());

-- Existing per-feature and per-record rules still apply to active members.
do $$
declare target text;
begin
  foreach target in array array[
    'activity_log','announcements','events','finance_claims','finance_ledger','finance_operations',
    'finance_receipts','finance_report_format','finance_reviews','inventory_categories','inventory_items',
    'inventory_movements','inventory_operations','inventory_request_lines','inventory_requests',
    'leave_applications','notifications','push_retry_jobs','push_subscriptions','system_settings',
    'task_comments','task_notification_outbox','task_performance_archive','task_reminder_logs',
    'task_repeat_occurrences','task_repeat_plans','tasks','team_members','teams'
  ] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=target and policyname='active_member_required') then
      execute format('create policy active_member_required on public.%I as restrictive for all to authenticated using (public.active_member()) with check (public.active_member())', target);
    end if;
  end loop;
end;
$$;

-- Writes already go through the authorized Edge function or trusted finance/inventory RPCs.
revoke insert, update, delete, truncate, references, trigger on public.notifications from anon, authenticated;
grant update(read_at) on public.notifications to authenticated;

-- Block uploads from unapproved accounts without changing public image reads.
do $$
begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='active_member_upload') then
    create policy active_member_upload on storage.objects as restrictive for insert to authenticated
      with check (bucket_id not in ('avatars','blog-photos','blog-site-media','finance-receipts','inventory-photos') or public.active_member());
    create policy active_member_file_update on storage.objects as restrictive for update to authenticated
      using (bucket_id not in ('avatars','blog-photos','blog-site-media','finance-receipts','inventory-photos') or public.active_member())
      with check (bucket_id not in ('avatars','blog-photos','blog-site-media','finance-receipts','inventory-photos') or public.active_member());
    create policy active_member_file_delete on storage.objects as restrictive for delete to authenticated
      using (bucket_id not in ('avatars','blog-photos','blog-site-media','finance-receipts','inventory-photos') or public.active_member());
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
