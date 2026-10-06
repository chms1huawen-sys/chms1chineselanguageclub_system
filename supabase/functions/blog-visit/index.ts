import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createVisitHandler } from './handler.js'

Deno.serve(createVisitHandler({ createClient, env: name => Deno.env.get(name) }))
