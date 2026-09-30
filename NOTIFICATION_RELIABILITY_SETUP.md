# Notification reliability deployment

1. Execute `supabase_migration_2026_09_30_push_retry.sql` in Supabase SQL Editor. It is additive and repeatable. Do not rerun schema.sql.
2. In Edge Function Secrets, personally set `INVENTORY_CRON_SECRET` to a random secret of at least 32 characters. Save the same value in Vault as `inventory_cron_secret`. Do not put the value in Git or chat.
3. Deploy from this repository (requires Supabase CLI login):

```powershell
npx supabase functions deploy send-push-notification --project-ref xvzxewqeadppzsbczfak
npx supabase functions deploy inventory-reminder --project-ref xvzxewqeadppzsbczfak
npx supabase functions deploy push-retry --project-ref xvzxewqeadppzsbczfak
```

4. Execute `supabase_schedule_2026_09_30_notifications.sql`. It configures the named jobs only: inventory daily at 09:00 Malaysia time and retry every five minutes. Existing task/event jobs are unchanged.
5. Deploy the frontend through the existing Vercel workflow. Close and reopen installed PWAs so the new worker can activate.

## Verification

- Use a test-only recipient group, not a broadcast to real members. Test foreground, background and locked phones separately.
- Permission alone is insufficient: initially register push in Settings. Existing registered devices with enabled accounts refresh automatically on app start/return, at most hourly per mounted session. No automatic permission prompts.
- Check function logs for accepted/failed/skipped counts. Accepted does not prove delivery.
- Check `push_retry_jobs` in the admin SQL editor. Jobs are private to the service role. They carry no FCM tokens or message bodies. Pending failures back off, stop after five claims, and use a lease to avoid concurrent workers claiming the same job.
- Delivery is at-least-once, not exactly-once: a network failure after acceptance may cause a later retry. A stable notification tag reduces duplicate visible notifications but cannot guarantee no repeated alert.
- Legacy token-only users without a push_subscriptions row cannot be queued; re-register these devices.
- Queueing currently covers per-device delivery failures after recipient loading. A function crash before that stage, OAuth failure before sending, or browser failure before invoking the function is not covered by this queue.
- Already completed inventory loans must not receive new overdue notices.

## Image work

Signed URLs are reused in memory for 50 minutes (their validity is one hour), with a 300-entry bound. Private buckets and no-store server redirects remain unchanged. The carousel only mounts its active photo. Original files are unchanged. Thumbnail generation and historical image backfill are not included in this change.
