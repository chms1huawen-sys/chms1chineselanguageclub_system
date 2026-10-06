import { createClient } from '@supabase/supabase-js'
import process from 'node:process'
import { displayPhotoPath } from '../src/utils/blogDisplayPhoto.js'
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end()
  const path = req.query?.path
  if (typeof path !== 'string') return res.status(400).end()
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp)$/.test(path)) return res.status(404).end()
  try {
    const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await db.storage.from('blog-photos').createSignedUrl(await displayPhotoPath(db, path), 3600)
    if (error || !data) return res.status(404).end()
    res.setHeader('Cache-Control', 'private, max-age=1800')
    return res.redirect(302, data.signedUrl)
  } catch { return res.status(503).end() }
}
