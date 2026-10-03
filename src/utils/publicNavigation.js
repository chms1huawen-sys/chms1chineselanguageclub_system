const publicPaths = new Set(['/', '/literature', '/activities', '/bookroom', '/news', '/about'])
export function navigateMemberLink(event, browserWindow) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  const link = event.target.closest?.('.club-blog a[href]')
  if (!link || link.target || link.hasAttribute('download')) return false
  const target = memberNavigationTarget(link.href, browserWindow.location.origin)
  if (!target) return false
  event.preventDefault()
  if (target !== browserWindow.location.pathname + browserWindow.location.search + browserWindow.location.hash) {
    browserWindow.history.pushState(null, '', target)
  }
  return true
}

export function memberNavigationTarget(href, origin) {
  try {
    const url = new URL(href, origin)
    // Only website entry links use this path; member deep links and admin routing stay unchanged.
    if (url.origin !== origin || url.pathname !== '/' || url.search || !/^#\/(?:login(?:\?.*)?)?$/.test(url.hash)) return null
    return url.pathname + url.hash
  } catch { return null }
}

export function navigatePublicLink(event, browserWindow) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
  const link = event.target.closest?.('.club-blog a[href], a[data-public-navigation][href]')
  if (!link || link.target || link.hasAttribute('download')) return false
  const target = publicNavigationTarget(link.href, browserWindow.location.origin)
  if (!target) return false
  event.preventDefault()
  if (target !== browserWindow.location.pathname + browserWindow.location.search || browserWindow.location.hash) {
    browserWindow.history.pushState(null, '', target)
  }
  return true
}

export function publicNavigationTarget(href, origin) {
  try {
    const url = new URL(href, origin)
    if (url.origin !== origin || url.hash || url.searchParams.has('app') || !publicPaths.has(url.pathname) && !/^\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.pathname)) return null
    return url.pathname + url.search
  } catch { return null }
}
