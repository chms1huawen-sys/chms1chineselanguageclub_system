import process from 'node:process'
import { randomUUID } from 'node:crypto'
import { loadEnv } from 'vite'

const env = loadEnv('production', process.cwd(), 'VITE_')
const root = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY
if (!root || !key) throw new Error('Public Supabase configuration unavailable.')
const headers = { authorization: `Bearer ${key}`, apikey: key, 'content-type': 'application/json', origin: 'https://chms1chineselanguageclubsystem.vercel.app' }
const payload = { p_id: randomUUID(), p_visitor: randomUUID(), p_session: randomUUID(), p_path: '/member', p_source: '(direct)', p_device: 'mobile' }
const call = async (path, body) => fetch(`${root}${path}`, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) })
const malformed = await call('/functions/v1/blog-visit', payload)
const denied = await call('/rest/v1/rpc/blog_record_visit', payload)
// This path has no published post, so the database must decline without writing a visit.
const missing = await call('/functions/v1/blog-visit', { ...payload, p_path: `/blog/gateway-check-${randomUUID()}` })
const missingBody = await missing.json()
const checks = { invalidPageRejected: malformed.status === 400, directWriteDenied: [401, 403, 404].includes(denied.status), unpublishedPageNotRecorded: missing.status === 200 && missingBody.accepted === false }
console.log(JSON.stringify(checks, null, 2))
if (Object.values(checks).some(value => !value)) process.exitCode = 1
