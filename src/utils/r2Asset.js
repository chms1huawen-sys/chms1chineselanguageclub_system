import { PUBLIC_ORIGIN } from './siteOrigins.js'

export const isDirectR2Photo = path => typeof path === 'string' && /^[a-f0-9-]{36}\/r2-[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(path)
export const r2SiteUrl = path => PUBLIC_ORIGIN + '/api/blog-site-image?' + new URLSearchParams({ path })
export function r2SitePath(value) {
  try {
    const url = new URL(value)
    const path = url.searchParams.get('path')
    return url.origin === PUBLIC_ORIGIN && url.pathname === '/api/blog-site-image' && !url.hash && [...url.searchParams].length === 1 && /^site\/r2-[a-f0-9-]{36}\.(?:jpg|png|webp)$/.test(path || '') ? path : null
  } catch { return null }
}
