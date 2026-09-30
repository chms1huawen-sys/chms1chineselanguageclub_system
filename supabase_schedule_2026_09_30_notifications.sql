-- Run only after deploying inventory-reminder, push-retry and send-push-notification.
-- Set INVENTORY_CRON_SECRET in Edge Secrets and the same value as inventory_cron_secret in Vault first.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'inventory_cron_secret' and length(decrypted_secret) >= 32) then
    raise exception 'Configure inventory_cron_secret in Vault before enabling notification jobs';
  end if;
end $$;

select cron.schedule('inventory-daily-reminder', '0 1 * * *', $job$
  select net.http_post(
    url := 'https://xvzxewqeadppzsbczfak.supabase.co/functions/v1/inventory-reminder',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='inventory_cron_secret' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$job$);

select cron.schedule('push-retry-every-five-minutes', '*/5 * * * *', $job$
  select net.http_post(
    url := 'https://xvzxewqeadppzsbczfak.supabase.co/functions/v1/push-retry',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',
      (select decrypted_secret from vault.decrypted_secrets where name='inventory_cron_secret' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 120000
  );
$job$);
