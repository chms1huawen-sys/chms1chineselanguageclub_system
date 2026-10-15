import { createClient } from '@supabase/supabase-js'
import { displayPhotoPath } from '../src/utils/blogDisplayPhoto.js'
import { r2PhotoConfig, s3PhotoMirror, validPhotoTarget, PHOTO_URL_SECONDS } from './r2Photos.js'

export function createBlogMediaHandler({ env, client = createClient, mirrorFactory = s3PhotoMirror }) {
  let mirror
  let retryAfter = 0
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end()
    const path = req.query?.path
    const bucket = req.query?.bucket ?? 'blog-photos'
    const format = req.query?.format
    if (typeof path !== 'string' || typeof bucket !== 'string' || (format !== undefined && format !== 'json')) return res.status(400).end()
    if (!validPhotoTarget(bucket, path)) return res.status(404).end()
    try {
      // Anonymous only: a staff session must never publish a private draft through R2.
      const db = client(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      const display = bucket === 'blog-photos' ? await displayPhotoPath(db, path) : path
      if (!validPhotoTarget(bucket, display)) return res.status(404).end()
      const { data, error } = await db.storage.from(bucket).createSignedUrl(display, PHOTO_URL_SECONDS)
      if (error || !data?.signedUrl) return res.status(404).end()
      const source = new URL(data.signedUrl)
      if (source.origin !== new URL(env.VITE_SUPABASE_URL).origin || !source.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`)) return res.status(503).end()
      let url = source.href
      let provider = 'supabase'
      let verification
      try {
        const config = r2PhotoConfig(env)
        if (config && Date.now() >= retryAfter) {
          mirror ||= mirrorFactory(config)
          const result = await mirror({ bucket, path: display, sourceUrl: source.href, headOnly: req.method === 'HEAD' })
          url = result.signedUrl
          verification = { sha256: result.sha256, bytes: result.bytes, contentType: result.contentType }
          provider = 'r2'
        }
      } catch {
        // Keep the current source usable during R2 setup or an outage. Never log signed URLs.
        res.setHeader('X-Blog-Media-Fallback', 'r2-unavailable')
        retryAfter = Date.now() + 60000
      }
      res.setHeader('X-Blog-Media-Provider', provider)
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(JSON.stringify({ data: { signedUrl: url }, provider, verification, expiresIn: PHOTO_URL_SECONDS }))
      }
      res.setHeader('Cache-Control', 'private, max-age=60')
      return res.redirect(302, url)
    } catch { return res.status(503).end() }
  }
}
