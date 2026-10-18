(() => {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.slice(1))
  // Auth fragments must stay on the member origin, never be forwarded to the public host.
  const authKeys = ['code', 'token_hash', 'token', 'access_token', 'refresh_token', 'error', 'error_code', 'error_description']
  const member = url.hash.startsWith('#/') || authKeys.some(key => url.searchParams.has(key) || hash.has(key))
  const target = member ? new URL('/member', url.origin) : new URL('https://chms1clc.org/')
  target.search = url.search
  target.hash = url.hash
  window.location.replace(target.href)
})()
