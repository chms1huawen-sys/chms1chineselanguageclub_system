export const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true

export function memberLaunchUrl(href, installed) {
  const url = new URL(href)
  // Only repair the legacy root launch; deep links and explicit website visits keep their destination.
  if (!installed || url.pathname !== '/' || url.hash || url.search) return null
  url.hash = '/'
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
