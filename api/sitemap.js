import { createClient } from '@supabase/supabase-js'
import process from 'node:process'
import { escapeHtml, siteOrigin } from '../server/blogSeo.js'
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end()
  try {
    const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const due = await db.rpc('blog_publish_due')
    if (due.error) throw due.error
    const rows = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from('blog_posts').select('slug,updated_at').eq('status', 'published').order('id').range(offset, offset + 999)
      if (error) throw error
      rows.push(...data)
      if (data.length < 1000) break
    }
    const origin = escapeHtml(siteOrigin(process.env))
    res.setHeader('Content-Type', 'application/xml; charset=utf-8')
    return res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/literature', '/activities', '/bookroom', '/news', '/about'].map(path => `<url><loc>${origin}${path}</loc></url>`).join('')}${rows.map(p => `<url><loc>${origin}/blog/${escapeHtml(p.slug)}</loc><lastmod>${escapeHtml(p.updated_at)}</lastmod></url>`).join('')}</urlset>`)
  } catch { return res.status(503).send('Sitemap temporarily unavailable') }
}
