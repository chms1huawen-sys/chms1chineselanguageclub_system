import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async request => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  const secret = Deno.env.get('INVENTORY_CRON_SECRET')
  if (!secret || request.headers.get('x-cron-secret') !== secret) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const db = createClient(url, key)
  try {
    const published = await db.rpc('publish_due_task_plans')
    if (published.error) throw published.error
    const archived = await db.rpc('archive_expired_tasks')
    if (archived.error) throw archived.error
    const outbox = await db.rpc('claim_task_notification_outbox')
    if (outbox.error) throw outbox.error
    const ids = (outbox.data || []).map(row => row.notification_id)
    if (ids.length) {
      const response = await fetch(`${url}/functions/v1/send-push-notification`, {
        method: 'POST', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: ids, url: '/tasks' }),
      })
      if (!response.ok) throw new Error(`Dispatch failed (${response.status})`)
      const updated = await db.from('task_notification_outbox').update({ delivered_at: new Date().toISOString() }).in('notification_id', ids)
      if (updated.error) throw updated.error
    }
    return Response.json({ published: published.data, archived: archived.data, dispatched: ids.length })
  } catch (error) {
    console.error('Task scheduler failed', String(error))
    return Response.json({ error: 'Task scheduler failed. Check logs.' }, { status: 500 })
  }
})
