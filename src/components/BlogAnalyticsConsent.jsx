import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import './BlogAnalyticsConsent.css'

const CHOICE = 'clc_blog_statistics'
function readChoice() { try { return localStorage.getItem(CHOICE) || '' } catch { return 'declined' } }
function visitPayload(path, referrer = document.referrer) {
  if (!['/', '/activities', '/literature', '/news', '/bookroom', '/about'].includes(path) && !/^\/blog\/[a-z0-9]+(-[a-z0-9]+)*$/.test(path)) return null
  let source = '(direct)'
  try { const ref = new URL(referrer); if (ref.hostname !== window.location.hostname) source = ref.hostname.toLowerCase() } catch { /* Direct visit. */ }
  try {
    let visitor = localStorage.getItem('clc_blog_visitor')
    if (!visitor) { visitor = crypto.randomUUID(); localStorage.setItem('clc_blog_visitor', visitor) }
    let session = sessionStorage.getItem('clc_blog_session')
    if (!session) { session = crypto.randomUUID(); sessionStorage.setItem('clc_blog_session', session) }
    return { p_id: crypto.randomUUID(), p_visitor: visitor, p_session: session, p_path: path, p_source: source, p_device: innerWidth < 600 ? 'mobile' : innerWidth < 1024 ? 'tablet' : 'desktop' }
  } catch { return null }
}
export default function BlogAnalyticsConsent({ lang = 'zh', disabled = false, allowLocal = false }) {
  const [choice, setChoice] = useState(readChoice)
  const [open, setOpen] = useState(false)
  const en = lang === 'en'
  const optedOut = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1'
  const path = window.location.pathname
  useEffect(() => {
    if (disabled || choice !== 'allowed' || optedOut || (!allowLocal && ['localhost', '127.0.0.1'].includes(location.hostname))) return
    // Delay avoids counting accidental bounces and React development remounts.
    const timer = setTimeout(() => {
      if (document.visibilityState !== 'visible') return
      const payload = visitPayload(path)
      if (payload) supabase.rpc('blog_record_visit', payload).then(() => {}).catch(() => {})
    }, 1200)
    return () => clearTimeout(timer)
  }, [choice, disabled, optedOut, path, allowLocal])
  function decide(next) {
    try {
      localStorage.setItem(CHOICE, next)
      if (next !== 'allowed') { localStorage.removeItem('clc_blog_visitor'); sessionStorage.removeItem('clc_blog_session') }
    } catch { /* Storage unavailable: do not track. */ }
    setChoice(next); setOpen(false)
  }
  if (disabled) return null
  return <aside className="blog-statistics-consent">
    <button className="blog-statistics-choice" onClick={() => setOpen(v => !v)}>{en ? 'Privacy preferences' : '隐私设置'}</button>
    {(open || !choice) && <div className="blog-statistics-panel" role="region" aria-label={en ? 'Anonymous visit statistics' : '匿名访问统计'}>
      <strong>{en ? 'Anonymous visit statistics' : '匿名访问统计'}</strong>
      <p>{en ? 'May we count public-page visits using a random browser ID? No names, emails, IP addresses or member-system activity are stored by this feature.' : '是否允许使用随机浏览器标识统计公开网页的访问？此功能不储存姓名、邮箱、IP 地址，也不记录会员系统操作。'}</p>
      {optedOut && <p>{en ? 'Your browser privacy signal is respected; collection is disabled.' : '已遵从浏览器的隐私偏好，统计不会开启。'}</p>}
      <div><button onClick={() => decide('declined')}>{en ? 'Decline' : '不允许'}</button><button disabled={optedOut} onClick={() => decide('allowed')}>{en ? 'Allow statistics' : '允许统计'}</button></div>
    </div>}
  </aside>
}
