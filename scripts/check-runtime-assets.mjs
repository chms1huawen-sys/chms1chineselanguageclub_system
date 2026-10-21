import { pathToFileURL } from 'node:url'
import { PUBLIC_ORIGIN, SOURCE_ORIGIN } from '../src/utils/siteOrigins.js'

export function runtimeReferences(text, base) {
  const paths = new Set()
  for (const match of text.matchAll(/["']((?:\/?assets\/|\.\/)[a-zA-Z0-9_.-]+\.(?:js|css))["']/g)) {
    const reference = match[1].startsWith('assets/') ? '/' + match[1] : match[1]
    const url = new URL(reference, base)
    if (url.origin === new URL(base).origin && url.pathname.startsWith('/assets/')) paths.add(url.href)
  }
  return [...paths]
}

// Read-only, sequential and bounded: never requests member records or sends credentials.
export async function checkRuntimeAssets(origin, entry, fetcher = fetch) {
  if (![PUBLIC_ORIGIN, SOURCE_ORIGIN].includes(origin) || !['/', '/member'].includes(entry)) throw new Error('Unsupported audit target')
  const queue = [origin + entry]
  const seen = new Set()
  const errors = []
  let bytes = 0
  while (queue.length) {
    const url = queue.shift()
    if (seen.has(url)) continue
    if (seen.size >= 160 || bytes > 16 * 1024 * 1024) throw new Error('Runtime audit budget exceeded')
    seen.add(url)
    try {
      const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(15000) })
      const type = response.headers.get('content-type') || ''
      if (response.status !== 200 || (url.endsWith('.js') ? !/javascript|ecmascript/.test(type) : url.endsWith('.css') ? !/text\/css/.test(type) : !/text\/html/.test(type))) {
        errors.push({ url, status: response.status, type }); continue
      }
      const text = await response.text()
      bytes += Buffer.byteLength(text)
      if (!url.endsWith('.css')) queue.push(...runtimeReferences(text, url))
    } catch (error) { errors.push({ url, error: error.message }) }
  }
  return { origin, entry, checked: seen.size, bytes, errors }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [origin, entry] of [[PUBLIC_ORIGIN, '/'], [SOURCE_ORIGIN, '/member']]) {
    const result = await checkRuntimeAssets(origin, entry)
    console.log(JSON.stringify(result, null, 2))
    if (result.errors.length) process.exitCode = 1
  }
}
