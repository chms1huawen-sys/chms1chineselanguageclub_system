import { securityHeaders } from './securityHeaders.js'
import { SOURCE_ORIGIN, PUBLIC_ORIGIN } from '../../src/utils/siteOrigins.js'
import { createCmsHandler, publishDueCms } from './cms.js'

const SNAPSHOT_KEY = 'public-site/v1/current.json'
const ORIGIN = SOURCE_ORIGIN
const headers = {
  ...securityHeaders,
  'X-Robots-Tag': 'noindex, nofollow',
  'Cache-Control': 'no-store',
}
const reply = (body, status = 200, type = 'text/html; charset=utf-8', extra = {}) => new Response(body, { status, headers: { ...headers, 'Content-Type': type, ...extra } })

export function createPreviewWorker({ now = Date.now, fetchOrigin = fetch } = {}) {
  const cms = createCmsHandler()
  let cached
  let until = 0
  let pending
  async function readCurrent(env) {
    const object = await env.PUBLIC_SITE.get(SNAPSHOT_KEY)
    if (!object || object.size > 3 * 1024 * 1024) throw new Error('Public preview unavailable')
    const text = await object.text()
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('')
    if (hash !== object.customMetadata?.sha256) throw new Error('Public preview integrity failed')
    const data = JSON.parse(text)
    const preview = data.publicPreview
    if (preview?.schemaVersion !== 1 || preview.generatedAt !== data.generatedAt || !preview.pages?.['/'] ||
        !Array.isArray(preview.photos) || !Array.isArray(preview.snapshot?.posts) ||
        preview.snapshot.posts.some(post => post.status !== 'published') || preview.snapshot.links.some(link => link.visibility !== 'public')) throw new Error('Public preview invalid')
    cached = { preview, checkedAt: data.checkedAt, json: JSON.stringify(preview.snapshot), photos: new Map(preview.photos.map(photo => [photo.url, photo])) }
    until = now() + 15000
    return cached
  }
  function current(env) {
    if (cached && now() < until) return Promise.resolve(cached)
    pending ||= readCurrent(env).finally(() => { pending = null })
    return pending
  }
  return {
    async fetch(request, env) {
      const cmsResponse = await cms(request, env)
      if (cmsResponse) return cmsResponse
      const url = new URL(request.url)
      const formal = url.origin === PUBLIC_ORIGIN
      const indexable = formal && env.PUBLIC_SITE_INDEXABLE === 'true'
      const respond = (body, status = 200, type = 'text/html; charset=utf-8', extra = {}) => reply(body, status, type, {
        ...(indexable && status < 400 ? { 'X-Robots-Tag': url.searchParams.has('q') ? 'noindex, follow' : 'index, follow' } : {}), ...extra,
      })
      if (!['GET', 'HEAD'].includes(request.method)) return reply(null, 405)
      if (url.hostname === 'www.chms1clc.org' || (url.hostname === 'chms1clc.org' && url.protocol !== 'https:')) return reply(null, 308, 'text/plain', { Location: PUBLIC_ORIGIN + url.pathname + url.search })
      let path
      try { path = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/' } catch { return reply(null, 400) }
      if (/^\/(member|blog-admin)(\/|$)/.test(path)) return reply(null, 302, 'text/plain', { Location: ORIGIN + url.pathname + url.search })
      if (path === '/robots.txt') return respond(request.method === 'HEAD' ? null : 'User-agent: *\nAllow: /\n' + (indexable ? `Disallow: /member\nDisallow: /blog-admin\nSitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n` : ''), 200, 'text/plain')
      if (path === '/index.html') return reply(null, 302, 'text/plain', { Location: '/' + url.search })
      if (/^\/(?:manifest[^/]*\.json|firebase-messaging-sw\.js)$/.test(path)) return reply(null, 404)
      if (['/logo-192.png', '/logo-512.png'].includes(path)) {
        const asset = await env.ASSETS.fetch(request)
        const result = new Response(asset.body, asset)
        for (const [key, value] of Object.entries(headers)) result.headers.set(key, value)
        if (indexable && asset.status === 200 && asset.headers.get('Content-Type')?.startsWith('image/png')) result.headers.set('X-Robots-Tag', 'index, follow')
        return result
      }
      try {
        const { preview, checkedAt, json, photos } = await current(env)
        const pages = formal ? preview.publicSite?.origin === PUBLIC_ORIGIN && preview.publicSite.pages : preview.pages
        if (!pages?.['/']) return reply('公开网站配置同步中，请稍后重试。', 503)
        const version = { 'X-Public-Preview-Version': preview.generatedAt }
        if (path === '/api/preview-status') return reply(request.method === 'HEAD' ? null : JSON.stringify({ automatic: true, generatedAt: preview.generatedAt, checkedAt, posts: preview.snapshot.posts.length }), 200, 'application/json', version)
        if (path === '/api/blog-public') return reply(request.method === 'HEAD' ? null : json, 200, 'application/json; charset=utf-8', version)
        if (path.startsWith('/public-media/')) {
          const photo = photos.get(path)
          if (!photo || !/^photos-v1\/(blog-photos|blog-site-media)\/[a-zA-Z0-9_./-]+$/.test(photo.key) || photo.key.split('/').some(part => part === '..' || part === '.')) return reply(null, 404)
          const condition = request.headers.get('If-None-Match')
          let image = request.method === 'HEAD' || condition ? await env.PUBLIC_SITE.head(photo.key) : await env.PUBLIC_SITE.get(photo.key)
          const marker = image && await env.PUBLIC_SITE.head(photo.key + '.verified')
          if (!image || !marker || marker.size !== 0 || !/^[a-f0-9]{64}$/.test(image.customMetadata?.sha256 || '') || marker.customMetadata?.sha256 !== image.customMetadata.sha256) {
            const target = new URL('/api/blog-media', ORIGIN)
            target.search = new URLSearchParams({ bucket: photo.bucket, path: photo.path })
            return reply(null, 302, 'text/plain', { Location: target.href })
          }
          const type = image.httpMetadata?.contentType
          if (!/^image\/(jpeg|png|webp|avif)$/.test(type || '') || image.size > 10 * 1024 * 1024) return reply(null, 503)
          const imageHeaders = { ...version, 'Cache-Control': 'private, max-age=30', ETag: image.httpEtag }
          if (condition && condition.split(',').some(value => value.trim() === '*' || value.trim().replace(/^W\//, '') === image.httpEtag?.replace(/^W\//, ''))) return respond(null, 304, type, imageHeaders)
          if (condition && request.method !== 'HEAD') {
            image = await env.PUBLIC_SITE.get(photo.key)
            if (!image || image.httpEtag !== imageHeaders.ETag) return reply(null, 503)
          }
          return respond(request.method === 'HEAD' ? null : image.body, 200, type, imageHeaders)
        }
        if (path === '/sitemap.xml') {
          const escapeXml = value => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]))
          const xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + Object.keys(pages).map(route => `<url><loc>${escapeXml((formal ? PUBLIC_ORIGIN : ORIGIN) + route)}</loc></url>`).join('') + '</urlset>'
          return respond(request.method === 'HEAD' ? null : xml, 200, 'application/xml; charset=utf-8', version)
        }
        if (Object.hasOwn(pages, path)) return respond(request.method === 'HEAD' ? null : pages[path], 200, 'text/html; charset=utf-8', version)
        if (path.startsWith('/api/') || path.startsWith('/blog/')) return reply(null, 404)
        const asset = await env.ASSETS.fetch(request)
        if (asset.status === 404 && /^\/assets\/[a-zA-Z0-9_.-]+\.(js|css)$/.test(path)) return reply(null, 302, 'text/plain', { Location: ORIGIN + path })
        const result = new Response(asset.body, asset)
        for (const [key, value] of Object.entries(headers)) result.headers.set(key, value)
        return result
      } catch { return reply('公开测试副本暂时不可用，请使用正式网站。', 503) }
    },
    async scheduled(_controller, _env, ctx) {
      const task = (async () => {
        await publishDueCms(_env)
        const response = await fetchOrigin(ORIGIN + '/api/blog-public?refresh=1', { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(55000) })
        if (!response.ok) throw new Error('Scheduled public synchronization failed')
        const checkedAt = Date.parse(response.headers.get('X-Public-Site-Checked-At'))
        if (!Number.isFinite(checkedAt) || now() - checkedAt > 180000) throw new Error('Scheduled public synchronization is stale')
        cached = null
        until = 0
      })()
      ctx.waitUntil(task)
      await task
    },
  }
}

export default createPreviewWorker()
