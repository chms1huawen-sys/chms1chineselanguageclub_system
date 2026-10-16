import { createClient } from '@supabase/supabase-js'
import { displayPhotoPath } from '../src/utils/blogDisplayPhoto.js'
import { r2PhotoConfig, s3PhotoMirror, validPhotoTarget, PHOTO_URL_SECONDS } from './r2Photos.js'
import { getPublicSnapshot } from './publicSnapshot.js'
import { snapshotPhotoPath } from './snapshotPhotos.js'

export function createBlogMediaHandler({ env, client = createClient, mirrorFactory = s3PhotoMirror, snapshot = getPublicSnapshot }) {
  let mirror
  let retryAfter = 0
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Blog-Media-Version', 'r2-v2')
    if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end()
    const path = req.query?.path
    const bucket = req.query?.bucket ?? 'blog-photos'
    const format = req.query?.format
    if (typeof path !== 'string' || typeof bucket !== 'string' || (format !== undefined && format !== 'json')) return res.status(400).end()
    if (!validPhotoTarget(bucket, path)) return res.status(404).end()
    try {
      const published = await snapshot().catch(() => null)
      let db
      const database = () => db ||= client(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
      const display = published ? snapshotPhotoPath(published, bucket, path, env.VITE_SUPABASE_URL) : bucket === 'blog-photos' ? await displayPhotoPath(database(), path) : path
      if (!validPhotoTarget(bucket, display)) return res.status(404).end()
      const sourceUrl = async () => {
        const { data, error } = await database().storage.from(bucket).createSignedUrl(display, PHOTO_URL_SECONDS)
        if (error || !data?.signedUrl) throw Object.assign(new Error('Image unavailable'), { status: 404 })
        const source = new URL(data.signedUrl)
        if (source.origin !== new URL(env.VITE_SUPABASE_URL).origin || !source.pathname.startsWith(`/storage/v1/object/sign/${bucket}/`)) throw new Error('Invalid source')
        return source.href
      }
      // Without a snapshot, retain the original anonymous Storage authorization.
      let url = published ? null : await sourceUrl()
      let provider = 'supabase'
      let verification
      try {
        const config = r2PhotoConfig(env)
        if (config && Date.now() >= retryAfter) {
          mirror ||= mirrorFactory(config)
          const result = await mirror({ bucket, path: display, sourceUrl: sourceUrl, headOnly: req.method === 'HEAD' })
          url = result.signedUrl
          verification = { sha256: result.sha256, bytes: result.bytes, contentType: result.contentType }
          provider = 'r2'
        }
      } catch {
        // Keep the current source usable during R2 setup or an outage. Never log signed URLs.
        res.setHeader('X-Blog-Media-Fallback', 'r2-unavailable')
        retryAfter = Date.now() + 60000
      }
      if (!url) url = await sourceUrl()
      res.setHeader('X-Blog-Media-Provider', provider)
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        return req.method === 'HEAD' ? res.status(200).end() : res.status(200).send(JSON.stringify({ data: { signedUrl: url }, provider, verification, expiresIn: PHOTO_URL_SECONDS }))
      }
      res.setHeader('Cache-Control', 'private, max-age=60')
      return res.redirect(302, url)
    } catch (error) { return res.status(error?.status === 404 ? 404 : 503).end() }
  }
}
