const SNAPSHOT_KEY = 'public-site/v1/current.json'
const ORIGIN = 'https://chms1chineselanguageclubsystem.vercel.app'
const headers = {
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cache-Control': 'no-store',
}
const reply = (body, status = 200, type = 'text/html; charset=utf-8', extra = {}) => new Response(body, { status, headers: { ...headers, 'Content-Type': type, ...extra } })

export function createPreviewWorker({ now = Date.now, fetchOrigin = fetch } = {}) {
  let cached
  let until = 0
  async function current(env) {
    if (cached && now() < until) return cached
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
    cached = { preview, checkedAt: data.checkedAt }
    until = now() + 15000
    return cached
  }
  return {
    async fetch(request, env) {
      const url = new URL(request.url)
      if (!['GET', 'HEAD'].includes(request.method)) return reply(null, 405)
      let path
      try { path = decodeURIComponent(url.pathname).replace(/\/$/, '') || '/' } catch { return reply(null, 400) }
      if (/^\/(member|blog-admin)(\/|$)/.test(path)) return reply(null, 302, 'text/plain', { Location: ORIGIN + url.pathname + url.search })
      if (path === '/robots.txt') return reply('User-agent: *\nAllow: /\n', 200, 'text/plain')
      if (path === '/index.html') return reply(null, 302, 'text/plain', { Location: '/' + url.search })
      if (/^\/(?:manifest[^/]*\.json|firebase-messaging-sw\.js)$/.test(path)) return reply(null, 404)
      try {
        const { preview, checkedAt } = await current(env)
        const version = { 'X-Public-Preview-Version': preview.generatedAt }
        if (path === '/api/preview-status') return reply(request.method === 'HEAD' ? null : JSON.stringify({ automatic: true, generatedAt: preview.generatedAt, checkedAt, posts: preview.snapshot.posts.length }), 200, 'application/json', version)
        if (path === '/api/blog-public') return reply(request.method === 'HEAD' ? null : JSON.stringify(preview.snapshot), 200, 'application/json; charset=utf-8', version)
        if (path.startsWith('/public-media/')) {
          const photo = preview.photos.find(file => file.url === path)
          if (!photo || !/^photos-v1\/(blog-photos|blog-site-media)\/[a-zA-Z0-9_./-]+$/.test(photo.key) || photo.key.split('/').some(part => part === '..' || part === '.')) return reply(null, 404)
          const image = request.method === 'HEAD' ? await env.PUBLIC_SITE.head(photo.key) : await env.PUBLIC_SITE.get(photo.key)
          const marker = image && await env.PUBLIC_SITE.head(photo.key + '.verified')
          if (!image || !marker || marker.size !== 0 || !/^[a-f0-9]{64}$/.test(image.customMetadata?.sha256 || '') || marker.customMetadata?.sha256 !== image.customMetadata.sha256) {
            const target = new URL('/api/blog-media', ORIGIN)
            target.search = new URLSearchParams({ bucket: photo.bucket, path: photo.path })
            return reply(null, 302, 'text/plain', { Location: target.href })
          }
          const type = image.httpMetadata?.contentType
          if (!/^image\/(jpeg|png|webp|avif)$/.test(type || '') || image.size > 10 * 1024 * 1024) return reply(null, 503)
          return reply(request.method === 'HEAD' ? null : image.body, 200, type, { ...version, 'Cache-Control': 'private, max-age=30', ETag: image.httpEtag })
        }
        if (path === '/sitemap.xml') {
          const xml = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + Object.keys(preview.pages).map(route => `<url><loc>${ORIGIN}${route}</loc></url>`).join('') + '</urlset>'
          return reply(request.method === 'HEAD' ? null : xml, 200, 'application/xml; charset=utf-8', version)
        }
        if (Object.hasOwn(preview.pages, path)) return reply(request.method === 'HEAD' ? null : preview.pages[path], 200, 'text/html; charset=utf-8', version)
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
