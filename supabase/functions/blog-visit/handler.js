import { pushCors } from '../send-push-notification/input.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const invalid = status => { throw Object.assign(new Error('Invalid visit.'), { status }) }

export async function readVisit(request) {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') invalid(400)
  if (Number(request.headers.get('content-length')) > 2048) invalid(413)
  const reader = request.body?.getReader()
  if (!reader) invalid(400)
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > 2048) { await reader.cancel(); invalid(413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  let body
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { invalid(400) }
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid(400)
  for (const key of ['p_id', 'p_visitor', 'p_session']) if (typeof body[key] !== 'string' || !uuid.test(body[key])) invalid(400)
  const path = body.p_path
  if (typeof path !== 'string' || path.length > 200 || !(['/', '/activities', '/literature', '/news', '/bookroom', '/about'].includes(path) || /^\/blog\/[a-z0-9]+(-[a-z0-9]+)*$/.test(path))) invalid(400)
  if (!['desktop', 'mobile', 'tablet'].includes(body.p_device)) invalid(400)
  const source = body.p_source
  if (typeof source !== 'string' || source.length > 253 || !(source === '(direct)' || /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(source) && /[a-z]/.test(source))) invalid(400)
  return { p_id: body.p_id, p_visitor: body.p_visitor, p_session: body.p_session, p_path: path, p_source: source, p_device: body.p_device }
}

export function createVisitHandler({ createClient, env }) {
  return async request => {
    const headers = pushCors(request.headers.get('origin'), env('ALLOWED_ORIGINS') || '')
    if (!headers) return Response.json({ error: 'Origin not allowed.' }, { status: 403 })
    const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { ...headers, ...extra } })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized.' }, 401)
    try {
      const payload = await readVisit(request)
      const url = env('SUPABASE_URL'), key = env('SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY')
      if (!url || !key || !env('SUPABASE_ANON_KEY')) return json({ error: 'Statistics unavailable.' }, 503)
      // Preserve the existing exclusion of logged-in content managers.
      const user = createClient(url, env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
      const manager = await user.rpc('blog_manager')
      if (manager.error) return json({ error: 'Statistics unavailable.' }, 503)
      if (manager.data === true) return json({ accepted: false })
      const service = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      const result = await service.rpc('record_public_blog_visit', payload)
      if (result.error) return json({ error: 'Statistics unavailable.' }, 503)
      if (result.data?.limited) return json({ error: 'Statistics temporarily limited.' }, 429, { 'Retry-After': '60' })
      return json({ accepted: result.data?.accepted === true })
    } catch (error) {
      return json({ error: 'Unable to record visit.' }, [400, 413].includes(error?.status) ? error.status : 503)
    }
  }
}
