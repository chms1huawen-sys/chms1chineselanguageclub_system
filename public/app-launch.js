// The server cannot see hash routes. Hide public SSR before a member launch paints.
(() => {
  // Capture before SPA navigation so preview member links leave the public host.
  const memberBoundary = event => {
    if (!document.querySelector('meta[name="public-static-preview"]')) return
    const link = event.target.closest?.('a[href]')
    if (!link) return
    const target = new URL(link.href, window.location.href)
    if (target.origin !== window.location.origin || !/^\/(?:member|blog-admin)(?:\/|$)/.test(target.pathname)) return
    link.href = new URL(target.pathname + target.search + target.hash, 'https://chms1chineselanguageclubsystem.vercel.app').href
  }
  document.addEventListener('click', memberBoundary, true)
  document.addEventListener('auxclick', memberBoundary, true)
  const url = new URL(window.location.href)
  if (url.hash.startsWith('#/') || /^\/member\/?$/.test(url.pathname)) {
    document.documentElement.setAttribute('data-member-launch', '')
    if (url.pathname === '/' || /^\/member\/?$/.test(url.pathname)) {
      url.pathname = '/member'
      if (!url.hash) url.hash = '/'
      window.history.replaceState(window.history.state, '', url.href)
    }
  }
})()
