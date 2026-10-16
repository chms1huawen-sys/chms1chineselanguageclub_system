import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import { staticPublicSnapshot } from './staticPublicSnapshot.js'
import { renderSnapshotPage } from './snapshotPage.js'
import { withPublicStyles } from './publicStyles.js'

export const PUBLIC_SECTIONS = ['', 'literature', 'activities', 'bookroom', 'news', 'about']

export function buildPublicPreview(snapshot, template, projectUrl, origin) {
  const local = staticPublicSnapshot(snapshot, projectUrl)
  // Only site-owned public navigation is localized; external links are preserved.
  for (const slide of local.snapshot.settings.content?.hero_slides || []) {
    if (typeof slide.link === 'string' && slide.link.startsWith(origin + '/')) {
      const url = new URL(slide.link)
      if (/^\/(?:activities|literature|bookroom|news|about|blog\/[a-z0-9-]+)?\/?$/.test(url.pathname)) slide.link = url.pathname + url.search + url.hash
    }
  }
  const pages = {}
  const routes = PUBLIC_SECTIONS.map(path => [path ? '/' + path : '/', { view: path || 'home', slug: '', search: '' }])
  for (const post of snapshot.posts) routes.push(['/blog/' + post.slug, { view: 'home', slug: post.slug, search: '' }])
  const previewTemplate = template.replace('</head>', '<meta name="public-static-preview" content="true"></head>')
  for (const [path, request] of routes) {
    pages[path] = renderSnapshotPage(previewTemplate, local.snapshot, request, origin).html.replaceAll(origin + '/public-media/', '/public-media/')
  }
  return { schemaVersion: 1, generatedAt: snapshot.generatedAt, snapshot: local.snapshot, pages, photos: local.candidates.map(file => ({ url: `/public-media/${file.bucket}/${file.path}`, key: file.targetKey, bucket: file.bucket, path: file.path })) }
}

export async function publishedPreview(snapshot, env) {
  const [html, manifest] = await Promise.all([
    readFile(join(process.cwd(), 'dist/index.html'), 'utf8'),
    readFile(join(process.cwd(), 'dist/.vite/manifest.json'), 'utf8'),
  ])
  return buildPublicPreview(snapshot, withPublicStyles(html, JSON.parse(manifest)), env.VITE_SUPABASE_URL, new URL(env.BLOG_SITE_URL || 'https://chms1chineselanguageclubsystem.vercel.app').origin)
}
