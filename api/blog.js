import { readFileSync } from 'node:fs'
import process from 'node:process'
import { join } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { renderBlogHtml, siteOrigin } from '../server/blogSeo.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'HEAD'].includes(req.method)) return res.status(405).end()
  try {
    const template = readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8')
    // Always use the anonymous key. Never forward the visitor session into SEO responses.
    const db = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
    const slug = String(req.query.slug || '')
    const view = req.query.view === 'blog' ? 'home' : String(req.query.view || 'home')
    if (!['home', 'activities', 'bookroom', 'about', 'literature', 'news'].includes(view)) return res.status(404).send('Not found')
    if (slug && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) return res.status(404).send('Not found')
    const due = await db.rpc('blog_publish_due')
    if (due.error) throw due.error
    const site = await db.from('blog_settings').select('*').eq('id', 1).single()
    if (site.error) throw site.error
    let query = db.from('blog_posts').select(slug ? '*' : 'id,slug,title,summary,cover_path,featured,is_sticky,published_at,content_type,content_year,book_details').eq('status', 'published')
    if (!slug && view === 'bookroom') query = query.eq('content_type', 'publication')
    if (!slug && view === 'activities') query = query.eq('content_type', 'event')
    if (!slug && view === 'literature') query = query.eq('content_type', 'article')
    if (!slug && view === 'news') query = query.eq('content_type', 'notice')
    query = slug ? query.eq('slug', slug) : query.order('is_sticky', { ascending: false }).order('content_year', { ascending: false }).order('published_at', { ascending: false }).limit(100)
    const posts = await query
    if (posts.error) throw posts.error
    let media = []
    let links = []
    if (slug && posts.data[0]) {
      const result = await db.from('blog_media').select('path,caption').eq('post_id', posts.data[0].id).order('position')
      if (result.error) throw result.error
      media = result.data
      const publicLinks = await db.from('blog_links').select('label,url').eq('post_id', posts.data[0].id).eq('visibility', 'public').order('position')
      if (publicLinks.error) throw publicLinks.error
      links = publicLinks.data
    }
    if (slug && !posts.data.length) res.setHeader('X-Robots-Tag', 'noindex')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    return res.status(slug && !posts.data.length ? 404 : 200).send(renderBlogHtml(template, site.data, posts.data, media, slug, siteOrigin(process.env), view, links))
  } catch (error) {
    console.error('Blog page unavailable:', error.message)
    // Member hash routes also request /. Keep the app bootable during migration/outages.
    res.setHeader('X-Robots-Tag', 'noindex')
    res.setHeader('Retry-After', '120')
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    try { return res.status(503).send(readFileSync(join(process.cwd(), 'dist', 'index.html'), 'utf8')) }
    catch { return res.status(503).send('Website temporarily unavailable') }
  }
}
