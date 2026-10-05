export const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

export function memberLaunchUrl(href, installed) {
  const url = new URL(href)
  const legacy = url.pathname === '/' && (url.hash.startsWith('#/') || installed && !url.hash && !url.search)
  const memberEntry = /^\/member\/?$/.test(url.pathname) && !url.hash
  if (!legacy && !memberEntry) return null
  url.pathname = '/member'
  if (!url.hash) url.hash = '/'
  return url.href
}

export const publicHomeUrl = () => isInstalledApp() ? '/?view=blog' : '/'

export function prepareAppLaunch() {
  const destination = memberLaunchUrl(window.location.href, isInstalledApp())
  if (destination) window.history.replaceState(window.history.state, '', destination)
  if (new URLSearchParams(window.location.search).get('app') === 'blog') {
    document.querySelector('link[rel="manifest"]')?.setAttribute('href', '/manifest-blog.json')
  }
}
