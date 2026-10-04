// The server cannot see hash routes. Hide public SSR before a member launch paints.
(() => {
  const url = new URL(window.location.href)
  const installed = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  const legacyMemberLaunch = installed && url.pathname === '/' && !url.hash && !url.search
  if (url.hash.startsWith('#/') || legacyMemberLaunch) {
    document.documentElement.setAttribute('data-member-launch', '')
  }
})()
