import { loadEnv } from 'vite'
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const env = loadEnv('production',process.cwd(),'VITE_')
for (const [name,key] of [['CMS_AUTH_URL','VITE_SUPABASE_URL'],['CMS_AUTH_ANON_KEY','VITE_SUPABASE_ANON_KEY']]) {
  if (!env[key]) throw new Error('Missing public auth configuration')
  const result = spawnSync('cmd.exe',['/d','/s','/c',`npx --offline wrangler secret put ${name} --config cloudflare/public-preview/wrangler.jsonc`],{input:env[key],encoding:'utf8'})
  if (result.status !== 0) throw new Error(`Unable to configure ${name}`)
  console.log(`Configured ${name}; value not logged.`)
}
