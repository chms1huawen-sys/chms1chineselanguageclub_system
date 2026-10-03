-- Apply only after ALL frontend upload flows use the validated gateway.
-- Existing file reads/deletes and service-role uploads are unchanged.
begin;
do $$ begin
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='validated_upload_required') then
    create policy validated_upload_required on storage.objects as restrictive for insert to authenticated
    with check(bucket_id not in ('avatars','blog-photos','blog-site-media','finance-receipts','inventory-photos'));
  end if;
  if not exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='validated_file_update_required') then
    create policy validated_file_update_required on storage.objects as restrictive for update to authenticated
    using(bucket_id not in ('avatars','blog-photos','blog-site-media','finance-receipts','inventory-photos'))
    with check(bucket_id not in ('avatars','blog-photos','blog-site-media','finance-receipts','inventory-photos'));
  end if;
end $$;
commit;
