import React, { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { listenForegroundMessages } from './firebase'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Members from './pages/Members'
import Tasks from './pages/Tasks'
import Committees from './pages/Committees'
import Handover from './pages/Handover'
import HistoricalMembers from './pages/HistoricalMembers'
import CalendarPage from './pages/CalendarPage'
import LeaveApplications from './pages/LeaveApplications'
import Settings from './pages/Settings'
import TutorialModal from './components/TutorialModal'
import UserAvatar from './components/UserAvatar'
import {
  LayoutDashboard, Users, LogOut, Menu, X, Shield,
  Calendar, CheckSquare, FolderGit, Loader, CircleAlert,
  History, ShieldAlert, Globe, HelpCircle, Bell, Settings as SettingsIcon,
  ClipboardList
} from 'lucide-react'

const APP_ROLE_LABELS = {
  convener_teacher: { zh: '召集老师', en: 'Convener Teacher' },
  advisor_teacher: { zh: '指导老师', en: 'Advisor Teacher' },
  chairperson: { zh: '主席', en: 'President' },
  vice_chairperson: { zh: '副主席', en: 'Vice President' },
  secretary: { zh: '正文书', en: 'Secretary' },
  vice_secretary: { zh: '副文书', en: 'Vice Secretary' },
  treasurer: { zh: '正财政', en: 'Treasurer' },
  vice_treasurer: { zh: '副财政', en: 'Vice Treasurer' },
  general_affairs: { zh: '正总务', en: 'General Affairs' },
  vice_general_affairs: { zh: '副总务', en: 'Vice General Affairs' },
  activity_lead: { zh: '活动组组长', en: 'Activity Lead' },
  vice_activity_lead: { zh: '活动组副组长', en: 'Vice Activity Lead' },
  activity_member: { zh: '活动组组员', en: 'Activity Member' },
  media_lead: { zh: '正摄影', en: 'Photographer' },
  vice_media_lead: { zh: '副摄影', en: 'Vice Photographer' },
  ordinary_member: { zh: '普通会员', en: 'Ordinary Member' },
  custom: { zh: '自定义', en: 'Custom' },
  advisor: { zh: '指导老师', en: 'Advisor Teacher' },
  committee: { zh: '自定义', en: 'Custom' },
  event_member: { zh: '活动组组员', en: 'Activity Member' }
}
const BOARD_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor']
const getProfileRoleText = (profile, lang) => {
  if (!profile) return ''
  if (profile.role === 'custom' && profile.custom_role_label) return profile.custom_role_label
  return APP_ROLE_LABELS[profile.role]?.[lang] || profile.role || ''
}


function NotificationCenter({ profile, lang }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!profile?.id) return
    fetchNotifications()

    const channel = supabase
      .channel('notifications-user-' + profile.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + profile.id },
        () => fetchNotifications(true)
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.id])

  const fetchNotifications = async (silent = false) => {
    if (!profile?.id) return
    if (!silent) setLoading(true)
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('sent_at', { ascending: false })
        .limit(20)
      if (error) throw error
      setNotifications(data || [])
    } catch (err) {
      console.error('Notification fetch failed:', err.message)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const markOneRead = async (notification) => {
    if (!notification || notification.read_at) return
    const readAt = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', notification.id)
    if (!error) {
      setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read_at: readAt } : n))
    }
  }

  const unreadCount = notifications.filter(n => !n.read_at).length
  const sidebarTextShadow = '0 1px 2px rgba(34, 91, 145, 0.95), 0 0 2px rgba(34, 91, 145, 0.75)'

  const markAllRead = async () => {
    if (!profile?.id || unreadCount === 0) return
    const readAt = new Date().toISOString()
    const { error } = await supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('user_id', profile.id)
      .is('read_at', null)
    if (!error) {
      setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: readAt }))
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-3.5 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer text-left"
        style={{ color: 'white', background: open ? 'rgba(255,255,255,0.16)' : 'transparent', textShadow: sidebarTextShadow }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
        onMouseLeave={e => e.currentTarget.style.background = open ? 'rgba(255,255,255,0.16)' : 'transparent'}>
        <span className="flex items-center gap-3.5">
          <Bell size={16} style={{ color: 'white', filter: 'drop-shadow(0 1px 2px rgba(34, 91, 145, 0.85))' }} />
          {lang === 'zh' ? '通知' : 'Notifications'}
        </span>
        {unreadCount > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full text-[10px] font-black flex items-center justify-center"
            style={{ background: '#FFB3C6', color: 'white' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-2 rounded-2xl overflow-hidden z-50"
          style={{ background: 'white', border: '1.5px solid #e0f1ff', boxShadow: '0 10px 32px rgba(15,23,42,0.18)' }}>
          <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid #f0f7ff' }}>
            <span className="text-xs font-black text-gray-800">{lang === 'zh' ? '站内通知' : 'In-app Notifications'}</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[10px] font-black text-blue-500 cursor-pointer">
                {lang === 'zh' ? '全部已读' : 'Mark all read'}
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <p className="p-4 text-xs font-bold text-gray-400 text-center">{lang === 'zh' ? '加载中...' : 'Loading...'}</p>
            ) : notifications.length === 0 ? (
              <p className="p-4 text-xs font-bold text-gray-400 text-center">{lang === 'zh' ? '暂无通知' : 'No notifications yet.'}</p>
            ) : notifications.map(n => (
              <button
                key={n.id}
                onClick={() => markOneRead(n)}
                className="w-full text-left px-4 py-3 transition cursor-pointer"
                style={{ background: n.read_at ? 'white' : '#f0f7ff', borderBottom: '1px solid #f0f7ff' }}>
                <div className="flex items-start gap-2">
                  {!n.read_at && <span className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: '#FFB3C6' }} />}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-gray-800 truncate">{n.title}</p>
                    <p className="text-[11px] font-semibold text-gray-500 leading-snug mt-1 line-clamp-2">{n.body}</p>
                    <p className="text-[9px] font-bold text-gray-300 mt-1">
                      {n.sent_at ? new Date(n.sent_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function AppShell({ user, profile, onLogout, lang, setLang, onProfileUpdate }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()

  const isBoardManager = BOARD_MANAGER_ROLES.includes(profile?.role)
  const sidebarTextShadow = '0 1px 2px rgba(34, 91, 145, 0.95), 0 0 2px rgba(34, 91, 145, 0.75)'

  // Check for first-time login tutorial
  useEffect(() => {
    const done = localStorage.getItem('cls_tutorial_completed')
    if (!done) {
      setShowTutorial(true)
    }
  }, [])

  useEffect(() => {
    let unsubscribe = () => {}
    let active = true

    listenForegroundMessages((payload) => {
      if (!active || !('Notification' in window) || Notification.permission !== 'granted') return

      const notification = payload.notification || {}
      const data = payload.data || {}
      const title = notification.title || data.title || '一中华文学会系统'
      const body = notification.body || data.body || '你有一则新的系统通知。'

      new Notification(title, {
        body,
        icon: '/logo-192.png',
        badge: '/logo-192.png',
        data: { url: data.url || '/' },
      })
    }).then((cleanup) => {
      if (typeof cleanup === 'function') unsubscribe = cleanup
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const navItems = lang === 'zh' ? [
    { name: '仪表板', path: '/', icon: <LayoutDashboard size={18} />, allowed: true },
    { name: '任务看板', path: '/tasks', icon: <CheckSquare size={18} />, allowed: true },
    { name: '筹委管理', path: '/committees', icon: <FolderGit size={18} />, allowed: true },
    { name: '账号管理', path: '/members', icon: <Users size={18} />, allowed: isBoardManager },
    { name: '历年名单', path: '/historical-members', icon: <History size={18} />, allowed: true },
    { name: '学期切换', path: '/handover', icon: <ShieldAlert size={18} />, allowed: isBoardManager },
    { name: '活动行事历', path: '/calendar', icon: <Calendar size={18} />, allowed: true },
    { name: '请假申请', path: '/leave', icon: <ClipboardList size={18} />, allowed: true },
    { name: '个人设置', path: '/settings', icon: <SettingsIcon size={18} />, allowed: true },
  ] : [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={18} />, allowed: true },
    { name: 'Tasks', path: '/tasks', icon: <CheckSquare size={18} />, allowed: true },
    { name: 'Committees', path: '/committees', icon: <FolderGit size={18} />, allowed: true },
    { name: 'Accounts', path: '/members', icon: <Users size={18} />, allowed: isBoardManager },
    { name: 'Historical Lists', path: '/historical-members', icon: <History size={18} />, allowed: true },
    { name: 'Term Handover', path: '/handover', icon: <ShieldAlert size={18} />, allowed: isBoardManager },
    { name: 'Calendar', path: '/calendar', icon: <Calendar size={18} />, allowed: true },
    { name: 'Leave Application', path: '/leave', icon: <ClipboardList size={18} />, allowed: true },
    { name: 'Settings', path: '/settings', icon: <SettingsIcon size={18} />, allowed: true },
  ]

  const handleNavClick = (path) => {
    setMobileMenuOpen(false)
    navigate(path)
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row overflow-x-hidden" style={{ background: '#f0f7ff', fontFamily: "'Nunito', sans-serif" }}>

      {/* Tutorial Modal */}
      {showTutorial && (
        <TutorialModal lang={lang} onClose={() => setShowTutorial(false)} />
      )}

      {/* Mobile Top Navbar */}
      <div className="md:hidden flex items-center justify-between px-5 py-4 shrink-0"
        style={{ background: '#95CBFF', borderBottom: '1.5px solid #6db8ff' }}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
            style={{ background: 'transparent', boxShadow: '0 4px 14px rgba(74, 163, 236, 0.48), 0 0 0 2px rgba(255,255,255,0.32)' }}>
            <img src="/logo-192.png" alt="CLC_sys" className="w-full h-full object-cover rounded-full" />
          </div>
          <span className="font-black text-xs leading-tight tracking-wide max-w-[180px]" style={{ color: 'white', textShadow: sidebarTextShadow }}>{lang === 'zh' ? '\u4e00\u4e2d\u534e\u6587\u5b66\u4f1a' : 'CHMS1 Chinese Language Club'}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Mobile lang toggle */}
          <button
            onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
            className="text-xs font-black px-2 py-1 rounded-full transition cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.25)', color: 'white', textShadow: sidebarTextShadow }}>
            {lang === 'zh' ? '英文' : '中'}
          </button>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} style={{ color: 'white' }}>
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-40 w-64 p-5 flex flex-col justify-between transition-transform duration-300 ease-in-out shrink-0
        md:relative md:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:flex'}
      `} style={{ background: '#95CBFF', borderRight: '1.5px solid #6db8ff', overflow: 'hidden' }}>

        {/* Decorative circles */}
        <div style={{ position: 'absolute', bottom: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 100, left: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 80, right: 20, width: 60, height: 60, borderRadius: '50%', background: '#FFB3C6', opacity: 0.25, pointerEvents: 'none' }} />

        <div className="space-y-6" style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo + Language toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                style={{ background: 'transparent', boxShadow: '0 5px 16px rgba(74, 163, 236, 0.5), 0 0 0 2px rgba(255,255,255,0.34)' }}>
                <img src="/logo-192.png" alt="CLC_sys" className="w-full h-full object-cover rounded-full" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-black text-xs leading-tight break-words" style={{ color: 'white', textShadow: sidebarTextShadow }}>{lang === 'zh' ? '\u4e00\u4e2d\u534e\u6587\u5b66\u4f1a' : 'CHMS1 Chinese Language Club'}</h2>
              </div>
            </div>
            {/* Language Toggle */}
            <button
              onClick={() => setLang(l => l === 'zh' ? 'en' : 'zh')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full transition cursor-pointer text-xs font-black"
              style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', textShadow: sidebarTextShadow }}
              title={lang === 'zh' ? '切换至英文' : 'Switch to Chinese'}
            >
              <Globe size={11} />
              {lang === 'zh' ? '英文' : '中'}
            </button>
          </div>

          {/* Nav */}
          <nav className="space-y-1">
            {navItems.filter(item => item.allowed).map((item) => {
              const isActive = location.pathname === item.path
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavClick(item.path)}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-bold transition cursor-pointer text-left"
                  style={{
                    background: isActive ? 'white' : 'transparent',
                    color: isActive ? '#6db8ff' : 'white',
                    textShadow: isActive ? 'none' : '0 1px 2px rgba(40, 96, 150, 0.8), 0 0 1px rgba(40, 96, 150, 0.85)',
                    boxShadow: isActive ? '0 2px 12px rgba(149,203,255,0.2)' : 'none',
                    border: isActive ? 'none' : '1.5px solid transparent'
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.18)' }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                  <span style={{ color: isActive ? '#95CBFF' : 'white', filter: isActive ? 'none' : 'drop-shadow(0 1px 2px rgba(40, 96, 150, 0.75))' }}>{item.icon}</span>
                  {item.name}
                </button>
              )
            })}
          </nav>
        </div>

        {/* User Info + Actions */}
        <div className="space-y-3 pt-5" style={{ borderTop: '1.5px solid rgba(255,255,255,0.25)', position: 'relative', zIndex: 1 }}>
          {/* User card */}
          <div className="flex items-center gap-3 p-2 rounded-2xl" style={{ background: 'rgba(255,255,255,0.2)' }}>
            <UserAvatar user={profile} name={profile?.name || '会员'} size={36} rounded={999} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black truncate" style={{ color: 'white', textShadow: sidebarTextShadow }}>{profile?.name || (lang === 'zh' ? '未知成员' : 'Unknown')}</p>
              <p className="text-[10px] font-semibold truncate mt-0.5" style={{ color: 'white', textShadow: sidebarTextShadow }}>
                {getProfileRoleText(profile, lang)}
              </p>
            </div>
          </div>

          <NotificationCenter profile={profile} lang={lang} />

          {/* Tutorial button */}
          <button
            onClick={() => setShowTutorial(true)}
            className="w-full flex items-center gap-3.5 px-4 py-2.5 rounded-2xl text-xs font-bold transition cursor-pointer text-left"
            style={{ color: 'white', background: 'transparent', textShadow: sidebarTextShadow }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.15)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <HelpCircle size={16} style={{ color: 'white', filter: 'drop-shadow(0 1px 2px rgba(34, 91, 145, 0.85))' }} />
            {lang === 'zh' ? '使用引导' : 'Tutorial Guide'}
          </button>

          {/* Logout button */}
          <button onClick={onLogout}
            className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl text-sm font-bold transition cursor-pointer text-left"
            style={{ color: 'white', background: 'transparent', textShadow: sidebarTextShadow }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,100,100,0.2)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <LogOut size={18} style={{ color: 'white', filter: 'drop-shadow(0 1px 2px rgba(34, 91, 145, 0.85))' }} />
            {lang === 'zh' ? '退出系统' : 'Log Out'}
          </button>
        </div>
      </aside>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 md:hidden"
          style={{ background: 'rgba(149,203,255,0.3)', backdropFilter: 'blur(2px)' }} />
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-7xl mx-auto w-full min-w-0">
        <Routes>
          <Route path="/" element={<Dashboard currentUserProfile={profile} lang={lang} onShowTutorial={() => setShowTutorial(true)} />} />
          <Route path="/tasks" element={<Tasks currentUserProfile={profile} lang={lang} />} />
          <Route path="/committees" element={<Committees currentUserProfile={profile} lang={lang} />} />
          <Route path="/calendar" element={<CalendarPage currentUserProfile={profile} lang={lang} />} />
          <Route path="/leave" element={<LeaveApplications currentUserProfile={profile} lang={lang} />} />
          <Route path="/settings" element={<Settings currentUserProfile={profile} lang={lang} onProfileUpdate={onProfileUpdate} />} />
          <Route path="/historical-members" element={<HistoricalMembers lang={lang} />} />
          <Route path="/handover" element={
            isBoardManager
              ? <Handover currentUserProfile={profile} lang={lang} />
              : <Navigate to="/" replace />
          } />
          <Route path="/members" element={
            isBoardManager
              ? <Members currentUserProfile={profile} lang={lang} />
              : <Navigate to="/" replace />
          } />
          {/* Legacy placeholder redirects */}
          <Route path="/tasks-placeholder" element={<Navigate to="/tasks" replace />} />
          <Route path="/committees-placeholder" element={<Navigate to="/committees" replace />} />
          <Route path="/calendar-placeholder" element={<Navigate to="/calendar" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  // Global bilingual state — persisted to localStorage
  const [lang, setLangState] = useState(() => localStorage.getItem('cls_lang') || 'zh')

  const setLang = (val) => {
    const next = typeof val === 'function' ? val(lang) : val
    setLangState(next)
    localStorage.setItem('cls_lang', next)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        setUser(session.user)
        fetchProfile(session.user.id)
      } else {
        setUser(null)
        setProfile(null)
        setLoading(false)
      }
    })

    return () => { subscription.unsubscribe() }
  }, [])

  const fetchProfile = async (uid) => {
    try {
      const { data, error } = await supabase.from('users').select('*').eq('id', uid).single()

      if (error || !data) {
        await new Promise(resolve => setTimeout(resolve, 800))
        const { data: retryData, error: retryError } = await supabase.from('users').select('*').eq('id', uid).single()
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

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4"
        style={{ background: 'linear-gradient(135deg, #e0f1ff 0%, #f0f7ff 100%)', fontFamily: "'Nunito', sans-serif" }}>
        <div style={{ width: 56, height: 56, borderRadius: 18, background: '#95CBFF', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 20px rgba(149,203,255,0.4)' }}>
          <Loader size={28} color="white" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
        <span className="text-sm font-black tracking-wide" style={{ color: '#6b7280' }}>
          {lang === 'zh' ? '载入系统中...' : 'Loading System...'}
        </span>
      </div>
    )
  }

  return (
    <Router>
      {user && profile ? (
        <AppShell user={user} profile={profile} onLogout={handleLogout} lang={lang} setLang={setLang} onProfileUpdate={setProfile} />
      ) : (
        <Login onLoginSuccess={handleLoginSuccess} />
      )}
    </Router>
  )
}
