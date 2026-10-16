import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { photoCandidates } from './lib/r2-photo-plan.mjs'
import { validPublicSnapshot } from '../src/utils/publicSnapshot.js'
import { snapshotPhotoPath } from '../server/snapshotPhotos.js'
import { renderSnapshotPage } from '../server/snapshotPage.js'
import { withPublicStyles } from '../server/publicStyles.js'
import { escapeHtml } from '../server/blogSeo.js'

export function staticPublicSnapshot(snapshot, projectUrl) {
  const { candidates } = photoCandidates({ posts: snapshot.posts, albums: [], media: snapshot.media, settings: snapshot.settings, projectUrl })
  const paths = new Map()
  for (const file of candidates) paths.set(`${file.bucket}/${file.path}`, `/public-media/${file.bucket}/${file.path}`)
  function transform(value) {
    if (typeof value === 'string') {
      const display = snapshotPhotoPath(snapshot, 'blog-photos', value, projectUrl)
      if (display && paths.has(`blog-photos/${display}`)) return paths.get(`blog-photos/${display}`)
      const prefix = `${new URL(projectUrl).origin}/storage/v1/object/public/blog-site-media/`
      if (value.startsWith(prefix)) {
        try { return paths.get(`blog-site-media/${decodeURIComponent(value.slice(prefix.length))}`) || value } catch { return value }
      }
      return value
    }
    if (Array.isArray(value)) return value.map(transform)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, transform(item)]))
    return value
  }
  return { snapshot: transform(snapshot), candidates }
}

async function downloadPhoto(file, origin) {
  const url = new URL('/api/blog-media', origin)
  url.search = new URLSearchParams({ bucket: file.bucket, path: file.path, format: 'json' })
  const result = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(45000) })
  if (!result.ok) throw new Error('Public image unavailable')
  const signed = await result.json()
  if (signed.provider !== 'r2' || !/^[a-f0-9]{64}$/.test(signed.verification?.sha256 || '')) throw new Error('Image not verified on R2')
  const target = new URL(signed.data.signedUrl)
  if (target.protocol !== 'https:' || !target.hostname.endsWith('.r2.cloudflarestorage.com') || target.username || target.password) throw new Error('Unexpected image provider')
  const response = await fetch(target, { redirect: 'error', signal: AbortSignal.timeout(15000) })
  if (!response.ok || Number(response.headers.get('content-length')) > 10 * 1024 * 1024) throw new Error('Image exceeds export limit')
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.byteLength
    if (size > 10 * 1024 * 1024) throw new Error('Image exceeds export limit')
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  if (size !== signed.verification.bytes || createHash('sha256').update(bytes).digest('hex') !== signed.verification.sha256) throw new Error('Image export checksum failed')
  return bytes
}

async function main() {
  const [site, directory] = process.argv.slice(2)
  if (!site || !directory || process.argv.length !== 4) throw new Error('Usage: node --env-file=.env.local scripts/export-public-site.mjs HTTPS_SITE NEW_OUTPUT_DIRECTORY')
  const origin = new URL(site)
  if (origin.protocol !== 'https:' || origin.pathname !== '/' || origin.username || origin.password || origin.search || origin.hash) throw new Error('Use the production HTTPS origin')
  const projectUrl = process.env.VITE_SUPABASE_URL
  if (!projectUrl) throw new Error('Missing public project URL')
  const response = await fetch(new URL('/api/blog-public', origin), { signal: AbortSignal.timeout(60000) })
  const original = await response.json()
  if (!response.ok || !validPublicSnapshot(original)) throw new Error('Published snapshot unavailable')
  const { snapshot, candidates } = staticPublicSnapshot(original, projectUrl)
  if (candidates.length > 1000) throw new Error('Review a larger export before downloading')
  const out = resolve(directory)
  // Only a new directory is accepted. Existing exports and user files are untouched.
  await mkdir(out)
  await cp(resolve('dist'), out, { recursive: true })
  let bytes = 0
  for (const file of candidates) {
    const image = await downloadPhoto(file, origin.origin)
    bytes += image.length
    if (bytes > 30 * 1024 * 1024) throw new Error('Static image export budget exceeded')
    const filename = join(out, 'public-media', file.bucket, file.path)
    await mkdir(dirname(filename), { recursive: true })
    await writeFile(filename, image, { flag: 'wx' })
  }
  const template = withPublicStyles(await readFile(join(out, 'index.html'), 'utf8'), JSON.parse(await readFile(join(out, '.vite/manifest.json'), 'utf8')))
    .replace('</head>', '<meta name="public-static-preview" content="true"></head>')
  const routes = [['', 'home'], ['literature', 'literature'], ['activities', 'activities'], ['bookroom', 'bookroom'], ['news', 'news'], ['about', 'about']]
  for (const post of snapshot.posts) routes.push([`blog/${post.slug}`, 'home', post.slug])
  for (const [path, view, slug = ''] of routes) {
    const filename = join(out, path, 'index.html')
    await mkdir(dirname(filename), { recursive: true })
    const page = renderSnapshotPage(template, snapshot, { slug, view, search: '' }, origin.origin)
    await writeFile(filename, page.html)
  }
  await mkdir(join(out, 'api'), { recursive: true })
  await writeFile(join(out, 'api/blog-public'), JSON.stringify(snapshot), { flag: 'wx' })
  await writeFile(join(out, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/api/blog-public\n  Content-Type: application/json; charset=utf-8\n  Cache-Control: public, max-age=30\n')
  await writeFile(join(out, '_redirects'), `/member ${origin.origin}/member 302\n/member/* ${origin.origin}/member/:splat 302\n/blog-admin ${origin.origin}/blog-admin 302\n`)
  await writeFile(join(out, 'robots.txt'), 'User-agent: *\nAllow: /\n')
  await writeFile(join(out, '404.html'), '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="robots" content="noindex"><title>页面不存在</title><h1>页面不存在或尚未公开</h1><a href="/">返回首页</a></html>')
  await writeFile(join(out, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map(([path]) => `<url><loc>${escapeHtml(origin.origin)}/${escapeHtml(path)}</loc></url>`).join('')}</urlset>`)
  console.log(JSON.stringify({ output: out, pages: routes.length, images: candidates.length, imageBytes: bytes, noindex: true, livePublishing: false }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Static export stopped. Existing files and production data were not deleted. Partial new output is preserved for diagnosis.'); process.exitCode = 1 })
}
