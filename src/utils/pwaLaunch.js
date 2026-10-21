import { PUBLIC_ORIGIN, SOURCE_ORIGIN } from './siteOrigins.js'

export const isInstalledApp = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
export const isPublicPreview = (doc = document) => !!doc.querySelector('meta[name="public-static-preview"]')
export const isStatisticsPreview = (doc = document, origin = window.location.origin) => isPublicPreview(doc) && origin !== PUBLIC_ORIGIN

export function memberLaunchUrl(href) {
  const url = new URL(href)
  const legacy = url.pathname === '/' && url.hash.startsWith('#/')
  const memberEntry = /^\/member\/?$/.test(url.pathname) && !url.hash
  if (!legacy && !memberEntry) return null
  url.pathname = '/member'
  if (!url.hash) url.hash = '/'
  return url.href
}

export const publicHomeUrl = (origin = window.location.origin) => origin === SOURCE_ORIGIN ? PUBLIC_ORIGIN + '/' : '/'

export function prepareAppLaunch(browserWindow = window, doc = document) {
  const destination = memberLaunchUrl(browserWindow.location.href)
  if (isPublicPreview(doc)) {
    doc.querySelector('link[rel="manifest"]')?.remove()
    const url = new URL(browserWindow.location.href)
    if (destination || url.hash.startsWith('#/')) {
      browserWindow.location.replace(new URL('/member' + url.search + (url.hash || '#/'), SOURCE_ORIGIN).href)
    }
    return
  }
  if (destination) browserWindow.history.replaceState(browserWindow.history.state, '', destination)
  if (new URLSearchParams(browserWindow.location.search).get('app') === 'blog') {
    doc.querySelector('link[rel="manifest"]')?.setAttribute('href', '/manifest-blog.json')
  }
}

