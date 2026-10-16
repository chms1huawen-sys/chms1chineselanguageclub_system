import { createClient } from '@supabase/supabase-js'

export function createPublicSnapshotHandler({ env, snapshot, client = createClient }) {
  const lastSync = new Map()
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Robots-Tag', 'noindex, nofollow')
    if (!['GET', 'HEAD', 'POST'].includes(req.method)) return res.status(405).end()
    const force = req.method === 'POST'
    if (force) {
      const origin = req.headers?.origin
      const allowedOrigin = new URL(env.BLOG_SITE_URL || 'https://chms1chineselanguageclubsystem.vercel.app').origin
      if (origin && origin !== allowedOrigin) return res.status(403).end()
      const authorization = req.headers?.authorization
      if (typeof authorization !== 'string' || !authorization.startsWith('Bearer ') || authorization.length > 8192) return res.status(401).end()
      try {
        const db = client(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
        const user = await db.auth.getUser(authorization.slice(7))
        if (user.error || !user.data?.user) return res.status(401).end()
        const permission = await db.rpc('blog_manager')
        if (permission.error || permission.data !== true) return res.status(403).end()
        const actor = user.data.user.id
        if (Date.now() - (lastSync.get(actor) || 0) < 1000) { res.setHeader('Retry-After', '1'); return res.status(429).end() }
        if (lastSync.size >= 500) lastSync.delete(lastSync.keys().next().value)
        lastSync.set(actor, Date.now())
      } catch { return res.status(503).end() }
    }
    try {
      const data = await snapshot({ force, refresh: req.query?.refresh === '1' })
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('X-Public-Site-Provider', 'r2-snapshot-v1')
      if (force) return res.status(200).send(JSON.stringify({ synced: true, generatedAt: data.generatedAt, posts: data.posts.length }))
      if (req.query?.refresh !== '1') res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, must-revalidate')
      return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(JSON.stringify(data))
    } catch { return res.status(503).send(JSON.stringify({ error: 'Public copy unavailable. Original content is preserved.' })) }
  }
}
