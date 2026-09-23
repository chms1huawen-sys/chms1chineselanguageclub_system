import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async request => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  const secret = Deno.env.get('INVENTORY_CRON_SECRET')
  if (!secret || request.headers.get('x-cron-secret') !== secret) return json({ error: 'Unauthorized' }, 401)
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const key = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const client = createClient(url, key)
    const { data: ids, error } = await client.rpc('inventory_due_reminders')
    if (error) throw error
    let sent = 0
    const failures: string[] = []
    for (let start = 0; start < (ids || []).length; start += 50) {
      const response = await fetch(`${url}/functions/v1/send-push-notification`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_ids: ids.slice(start, start + 50), url: '/#/inventory' }),
      })
      const body = await response.json()
      sent += body.push_sent || 0
      if (!response.ok || body.push_failed > 0) failures.push(`Push batch ${start / 50 + 1}: ${body.error || body.push_failed || response.status}`)
    }
    console.log('inventory-reminder', { in_app: ids?.length || 0, push_sent: sent, failures })
    return json({ in_app_notifications: ids?.length || 0, push_sent: sent, push_errors: failures }, failures.length ? 502 : 200)
  } catch (error) {
    console.error('inventory-reminder failed', error instanceof Error ? error.message : String(error))
    return json({ error: 'Inventory reminder failed. Check function logs.' }, 500)
  }
})
