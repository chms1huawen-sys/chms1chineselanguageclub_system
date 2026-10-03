const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const validId = value => typeof value === 'string' && uuid.test(value)
const maxBody = 3 * 1024 * 1024
const fail = (status = 400) => { throw Object.assign(new Error(status === 413 ? 'Request too large.' : 'Invalid notification request.'), { status }) }
const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max

export function pushOrigins(extra = '') {
  const allowed = new Set(['https://chms1chineselanguageclubsystem.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173'])
  for (const value of extra.split(',')) {
    try {
      const url = new URL(value.trim())
      const secure = url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (secure && url.origin === value.trim()) allowed.add(url.origin)
    } catch { /* Ignore invalid configuration. */ }
  }
  return allowed
}

export function pushCors(origin, extra = '') {
  if (origin && !pushOrigins(extra).has(origin)) return null
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json', 'Vary': 'Origin',
    'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  }
}

export function validatePushPayload(body, extraOrigins = '') {
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail()
  const ids = body.notification_ids ?? []
  const rows = body.notifications ?? []
  if (!Array.isArray(ids) || !Array.isArray(rows) || ids.length + rows.length > 500) fail()
  if (ids.some(id => !validId(id))) fail()
  const notifications = rows.map(row => {
    if (!row || typeof row !== 'object' || !validId(row.user_id) || !text(row.type, 80) || !text(row.title, 300) || !text(row.body, 4000)) fail()
    if (row.dedupe_key != null && !text(row.dedupe_key, 250)) fail()
    return { user_id: row.user_id, type: row.type, title: row.title, body: row.body, dedupe_key: row.dedupe_key ?? null }
  })
  const sync = body.announcement_sync
  if (sync != null) {
    if (!sync || !['update', 'delete'].includes(sync.action) || !validId(sync.announcement_id)) fail()
    if (sync.action === 'update' && (!text(sync.title, 300) || !text(sync.body, 4000) || !Array.isArray(sync.recipient_ids) || sync.recipient_ids.length > 500 || sync.recipient_ids.some(id => !validId(id)))) fail()
  } else if (!ids.length && !notifications.length) fail()
  if (body.retry_subscription_id != null && !validId(body.retry_subscription_id)) fail()
  const url = body.url ?? '/'
  if (!text(url, 2048) || /[\\\s]/.test(url) || url.startsWith('//')) fail()
  let target
  try { target = new URL(url, 'https://chms1chineselanguageclubsystem.vercel.app') } catch { fail() }
  if (!pushOrigins(extraOrigins).has(target.origin) || target.username || target.password || (!url.startsWith('/') && !/^https?:\/\//.test(url))) fail()
  return { notification_ids: [...new Set(ids)], notifications, announcement_sync: sync, retry_subscription_id: body.retry_subscription_id, url }
}

export async function readPushPayload(request, extraOrigins = '') {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') fail()
  if (Number(request.headers.get('content-length')) > maxBody) fail(413)
  const reader = request.body?.getReader()
  if (!reader) fail()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > maxBody) { await reader.cancel(); fail(413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  let body
  try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) } catch { fail() }
  return validatePushPayload(body, extraOrigins)
}
