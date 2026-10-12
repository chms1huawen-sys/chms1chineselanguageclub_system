// The server cannot see hash routes. Hide public SSR before a member launch paints.
(() => {
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
