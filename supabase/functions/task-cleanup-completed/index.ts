// supabase/functions/task-cleanup-completed/index.ts
// Deploy: supabase functions deploy task-cleanup-completed
// Schedule: run once per day. It deletes tasks completed more than 30 days ago.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY')

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(
        JSON.stringify({ error: 'Missing SUPABASE_URL or SERVICE_ROLE_KEY.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)

    const { data, error } = await supabase
      .from('tasks')
      .delete()
      .eq('status', 'completed')
      .lt('completed_at', cutoff.toISOString())
      .select('id')

    if (error) throw error

    return new Response(
      JSON.stringify({
        message: `Deleted ${data?.length || 0} completed tasks older than 30 days.`,
        deleted: data?.length || 0,
        cutoff: cutoff.toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
