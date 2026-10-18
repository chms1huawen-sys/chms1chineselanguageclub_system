export const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
export const isPublicPreview = (doc = document) => !!doc.querySelector('meta[name="public-static-preview"]')

export function memberLaunchUrl(href) {
  const url = new URL(href)
  const legacy = url.pathname === '/' && url.hash.startsWith('#/')
  const memberEntry = /^\/member\/?$/.test(url.pathname) && !url.hash
  if (!legacy && !memberEntry) return null
  url.pathname = '/member'
  if (!url.hash) url.hash = '/'
  return url.href
}

export const publicHomeUrl = () => isInstalledApp() ? '/?view=blog' : '/'

export function prepareAppLaunch(browserWindow = window, doc = document) {
  const destination = memberLaunchUrl(browserWindow.location.href)
  if (isPublicPreview(doc)) {
    doc.querySelector('link[rel="manifest"]')?.remove()
    if (destination) {
      const url = new URL(destination)
      browserWindow.location.replace(new URL(url.pathname + url.search + url.hash, 'https://chms1chineselanguageclubsystem.vercel.app').href)
    }
    return
  }
  if (destination) browserWindow.history.replaceState(browserWindow.history.state, '', destination)
  if (new URLSearchParams(browserWindow.location.search).get('app') === 'blog') {
    doc.querySelector('link[rel="manifest"]')?.setAttribute('href', '/manifest-blog.json')
  }
}
