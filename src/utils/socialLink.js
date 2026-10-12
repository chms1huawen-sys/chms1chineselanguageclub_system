import { safePublicLink } from './blogContent.js'

export function safeSocialLink(value, platform) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (platform === 'email') {
    const email = trimmed.replace(/^mailto:/i, '')
    if (email.length > 254 || !/^[a-z0-9.!#$%&'*+_`{|}~=-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(email)) return ''
    return `mailto:${email}`
  }
  return /^https?:\/\//i.test(trimmed) ? safePublicLink(trimmed) : ''
}
