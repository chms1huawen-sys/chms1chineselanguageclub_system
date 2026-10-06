import process from 'node:process'
import { pathToFileURL } from 'node:url'

export function checkPage(path, response, body, origin) {
  const errors = []
  if (response.status !== 200) errors.push(`HTTP ${response.status}`)
  for (const [header, expected] of [
    ['x-content-type-options', 'nosniff'], ['x-frame-options', 'DENY'],
  ]) if (response.headers.get(header) !== expected) errors.push(`Missing ${header}`)
  if (!response.headers.get('content-security-policy')) errors.push('Missing CSP')
  if (!response.headers.get('strict-transport-security')) errors.push('Missing HSTS')
  if (path === '/member' || path === '/blog-admin') {
    if (!/noindex/i.test(response.headers.get('x-robots-tag') || '')) errors.push('Private entry is indexable')
    if (!body.includes('/app-launch.js')) errors.push('Missing launch guard')
  }
  if (path === '/literature' && !body.includes(`href="${origin}/literature"`)) errors.push('Canonical origin mismatch')
  if (path === '/sitemap.xml') {
    if (!body.includes('<urlset')) errors.push('Invalid sitemap')
    if (!body.includes(`<loc>${origin}/literature</loc>`)) errors.push('Missing public section')
    if (/<loc>[^<]*(?:\/member|\/blog-admin|#\/)/i.test(body)) errors.push('Private entry in sitemap')
  }
  if (path === '/robots.txt' && !body.includes(`Sitemap: ${origin}/sitemap.xml`)) errors.push('Robots sitemap origin mismatch')
  return errors
}

export async function checkProduction(input, fetcher = fetch) {
  const url = new URL(input)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Use an HTTPS site origin without credentials, query or path')
  }
  const results = []
  for (const path of ['/member', '/blog-admin', '/literature', '/robots.txt', '/sitemap.xml']) {
    const start = performance.now()
    try {
      const response = await fetcher(url.origin + path, { signal: AbortSignal.timeout(15000), redirect: 'error' })
      const body = await response.text()
      results.push({ path, milliseconds: Math.round(performance.now() - start), errors: checkPage(path, response, body, url.origin) })
    } catch {
      results.push({ path, milliseconds: Math.round(performance.now() - start), errors: ['Request failed or timed out'] })
    }
  }
  return results
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const results = await checkProduction(process.argv[2] || 'https://chms1chineselanguageclubsystem.vercel.app')
    console.log(JSON.stringify(results, null, 2))
    if (results.some(result => result.errors.length)) process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
