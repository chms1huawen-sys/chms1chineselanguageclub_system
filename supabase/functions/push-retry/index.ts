import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async request => {
  const json = (body: unknown, status = 200) => Response.json(body, { status })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const secret = Deno.env.get('INVENTORY_CRON_SECRET')
  if (!secret || request.headers.get('x-cron-secret') !== secret) return json({ error: 'Unauthorized' }, 401)
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, key)
  try {
    const { error: expiredError } = await db.from('push_retry_jobs').update({ status: 'failed' })
      .eq('status', 'processing').gte('attempts', 5).lte('next_attempt_at', new Date().toISOString())
    if (expiredError) throw expiredError
    const { data: jobs, error } = await db.rpc('claim_push_retry_jobs')
    if (error) throw error
    let sent = 0
    for (const job of jobs || []) {
      let status = job.attempts >= 5 ? 'failed' : 'pending'
      try {
        const response = await fetch(`${url}/functions/v1/send-push-notification`, {
          method: 'POST', signal: AbortSignal.timeout(15000),
          headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ notification_ids: [job.notification_id], retry_subscription_id: job.subscription_id, url: job.target_url }),
        })
        const result = await response.json()
        if (response.ok && result.push_sent > 0) { status = 'sent'; sent++ }
        else if (response.ok && (result.push_skipped > 0 || result.message === 'No notifications found.')) status = 'cancelled'
      } catch (error) { console.error('Push retry attempt failed', String(error)) }
      const { error: updateError } = await db.from('push_retry_jobs').update({
        status, updated_at: new Date().toISOString(),
        next_attempt_at: new Date(Date.now() + Math.min(60, 5 * 2 ** job.attempts) * 60000).toISOString(),
      }).eq('notification_id', job.notification_id).eq('subscription_id', job.subscription_id).eq('status', 'processing')
      if (updateError) throw updateError
    }
    return json({ processed: jobs?.length || 0, sent })
  } catch (error) {
    console.error('Push retry worker failed', String(error))
    return json({ error: 'Push retry failed. Check function logs.' }, 500)
  }
})
