const publicPaths = new Set(['/', '/literature', '/activities', '/bookroom', '/news', '/about'])
export function publicNavigationTarget(href, origin) {
  try {
    const url = new URL(href, origin)
    if (url.origin !== origin || url.hash || url.searchParams.has('app') || !publicPaths.has(url.pathname) && !/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)) return null
    return url.pathname + url.search
  } catch { return null }
}
