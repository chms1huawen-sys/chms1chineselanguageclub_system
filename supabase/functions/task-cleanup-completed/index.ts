// supabase/functions/task-cleanup-completed/index.ts
// Deploy: supabase functions deploy task-cleanup-completed
// Legacy cron endpoint: archive expired tasks without deleting performance history.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { authorizeCronRequest } from '../cronAuth.js'

const corsHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

Deno.serve(async (req) => {
  const authStatus = authorizeCronRequest(req, Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), Deno.env.get('INVENTORY_CRON_SECRET'))
  if (authStatus !== 200) return Response.json({ error: authStatus === 405 ? 'Method not allowed.' : 'Unauthorized.' }, { status: authStatus })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i,'')
    const secret = Deno.env.get('INVENTORY_CRON_SECRET')
    if (bearer !== serviceRoleKey && (!secret || req.headers.get('x-cron-secret') !== secret)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await supabase.rpc('archive_expired_tasks')

    if (error) throw error

    return new Response(
      JSON.stringify({
        message: 'Expired tasks archived. No tasks deleted.',
        archived: data || 0,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Task archival failed. Check function logs.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
