import { lazy, Suspense, useState, useEffect, useLayoutEffect, useRef, useEffectEvent } from 'react'
import { supabase } from './supabaseClient'
import { MEMBER_PROFILE_FIELDS } from './utils/memberProfile'
import { loadMemberShell, loadMemberLogin, preloadMemberEntry } from './utils/memberModules'
const Login = lazy(loadMemberLogin)
const Blog = lazy(() => import('./pages/Blog'))
import BlogAnalyticsConsent from './components/BlogAnalyticsConsent'
const BlogAdminShell = lazy(() => import('./pages/BlogAdminShell'))
import { safeBlogReturn } from './utils/blog'
import PageLoading from './components/PageLoading'
import { showForegroundPush, withPushTimeout } from './utils/pushRuntime'
import { navigateMemberLink, navigatePublicLink } from './utils/publicNavigation'
const MemberShell = lazy(loadMemberShell)

export default function App() {
  useLayoutEffect(() => {
    document.documentElement.removeAttribute('data-member-launch')
  }, [])
  const blogRedirecting = useRef(false)
  const profileRequests = useRef(new Map())
  const [hash, setHash] = useState(window.location.hash)
  const [publicRoute, setPublicRoute] = useState(window.location.pathname + window.location.search)
  useEffect(() => {
    const update = () => {
      setPublicRoute(window.location.pathname + window.location.search)
      setHash(window.location.hash)
    }
    const navigate = event => {
      if (!navigatePublicLink(event, window) && !navigateMemberLink(event, window)) return
      update()
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('popstate', update)
    document.addEventListener('click', navigate)
    return () => { window.removeEventListener('popstate', update); document.removeEventListener('click', navigate) }
  }, [])
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  useEffect(() => {
    if (!profile?.is_active || !profile?.notification_enabled) return
    let active = true
    let pending = false
    let lastAttempt = 0
    const refresh = async () => {
      if (!active || document.hidden || pending || Date.now() - lastAttempt < 3600000) return
      pending = true
      lastAttempt = Date.now()
      try {
        const { refreshPushRegistration } = await import('./utils/refreshPushRegistration')
        if (active) await refreshPushRegistration(profile.id, () => active)
      } catch (error) {
        console.warn('Push registration refresh failed:', error.message)
      } finally { pending = false }
    }
    refresh()
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('online', refresh)
    return () => {
      active = false
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('online', refresh)
    }
  }, [profile?.id, profile?.is_active, profile?.notification_enabled])
  useEffect(() => {
    if (!profile?.is_active) return
    let unsubscribe = () => {}
    let active = true

    import('./firebase').then(({ listenForegroundMessages }) => active ? listenForegroundMessages((payload) => {
      if (!active || !('Notification' in window) || Notification.permission !== 'granted') return

      withPushTimeout(navigator.serviceWorker.ready)
        .then(registration => active ? showForegroundPush(payload, registration) : undefined)
        .catch(error => console.warn('Foreground notification failed:', error.message))
    }) : undefined).then((cleanup) => {
      if (typeof cleanup !== 'function') return
      if (active) unsubscribe = cleanup
      else cleanup()
    }).catch(error => console.warn('Foreground notifications unavailable:', error.message))

    return () => {
      active = false
      unsubscribe()
    }
  }, [profile?.id, profile?.is_active])
  const [loading, setLoading] = useState(true)
  // Global bilingual state — persisted to localStorage
  const [lang, setLangState] = useState(() => localStorage.getItem('cls_lang') || 'zh')
  const memberSurface = hash.startsWith('#/')
  useEffect(() => {
    if (memberSurface) preloadMemberEntry(hash).catch(error => console.warn('Member preload failed:', error.message))
  }, [memberSurface, hash])
  useEffect(() => {
    if (!memberSurface && window.location.pathname !== '/blog-admin') return
    const robots = document.createElement('meta')
    robots.name = 'robots'
    robots.content = 'noindex, nofollow'
    document.head.appendChild(robots)
    return () => robots.remove()
  }, [memberSurface])
  useEffect(() => {
    if (user && profile && hash.startsWith('#/login?')) {
      const params = new URLSearchParams(hash.split('?')[1])
      if (params.has('return') && !blogRedirecting.current) {
        blogRedirecting.current = true
        window.location.replace(safeBlogReturn(params.get('return')))
      }
    } else {
      blogRedirecting.current = false
    }
  }, [user, profile, hash])

  const setLang = (val) => {
    const next = typeof val === 'function' ? val(lang) : val
    setLangState(next)
    localStorage.setItem('cls_lang', next)
  }

  async function fetchProfile(uid) {
    try {
      const { data, error } = await supabase.from('users').select(MEMBER_PROFILE_FIELDS).eq('id', uid).single()

      if (error || !data) {
        await new Promise(resolve => setTimeout(resolve, 800))
        const { data: retryData, error: retryError } = await supabase.from('users').select(MEMBER_PROFILE_FIELDS).eq('id', uid).single()
        if (retryError || !retryData) throw new Error('Profile could not be fetched.')
        if (!retryData.is_active) throw new Error('User deactivated.')
        setProfile(retryData)
      } else {
        if (!data.is_active) throw new Error('User deactivated.')
        setProfile(data)
      }
    } catch (err) {
      console.error('Profile fetch failed:', err.message)
      await supabase.auth.signOut()
      setUser(null)
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }

  const syncFetchProfile = useEffectEvent(uid => {
    if (!profileRequests.current.has(uid)) {
      const request = fetchProfile(uid).finally(() => profileRequests.current.delete(uid))
      profileRequests.current.set(uid, request)
    }
    return profileRequests.current.get(uid)
  })

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        syncFetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setUser(session.user)
        syncFetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => { subscription.unsubscribe() }
  }, [])


  const handleLoginSuccess = (authUser, userProfile) => {
    setUser(authUser)
    setProfile(userProfile)
  }

  const handleLogout = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setLoading(false)
  }

  if (window.location.pathname === '/blog-admin' || hash === '#/blog-management') return <Suspense fallback={<PageLoading lang={lang} fullPage />}><BlogAdminShell profile={profile} loading={loading} lang={lang} setLang={setLang} /></Suspense>
  if (!memberSurface) return <Suspense fallback={<PageLoading lang={lang} fullPage />}><Blog key={publicRoute} profile={profile} lang={lang} setLang={setLang} /><BlogAnalyticsConsent lang={lang} /></Suspense>

  if (loading || (user && profile && hash.startsWith('#/login?') && new URLSearchParams(hash.split('?')[1]).has('return'))) {
    return <PageLoading lang={lang} fullPage />
  }

  return (
    <Suspense fallback={<PageLoading lang={lang} fullPage />}>
      {user && profile ? (
        <MemberShell profile={profile} onLogout={handleLogout} lang={lang} setLang={setLang} onProfileUpdate={setProfile} />
      ) : (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
    </Suspense>
  )
}
