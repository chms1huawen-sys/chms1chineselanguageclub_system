import { lazy, Suspense, useState, useEffect, useEffectEvent } from 'react'
import { HashRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { publicHomeUrl } from '../utils/pwaLaunch'
import { canViewExecutiveManagement as canViewExecutivePage, hasPermission } from '../utils/permissions'
import TutorialModal from '../components/TutorialModal'
import UserAvatar from '../components/UserAvatar'
import PageLoading from '../components/PageLoading'
import '../mobileNavigation.css'
import {
  LayoutDashboard, Users, LogOut, Menu, X, Shield,
  Calendar, CheckSquare, FolderGit, CircleAlert,
  History, ShieldAlert, Globe, HelpCircle, Bell, Settings as SettingsIcon,
  ClipboardList, CheckCircle, Package
} from 'lucide-react'

const Dashboard = lazy(() => import('./Dashboard'))
const Members = lazy(() => import('./Members'))
const Tasks = lazy(() => import('./Tasks'))
const Committees = lazy(() => import('./Committees'))
const Handover = lazy(() => import('./Handover'))
const HistoricalMembers = lazy(() => import('./HistoricalMembers'))
const CalendarPage = lazy(() => import('./CalendarPage'))
const LeaveApplications = lazy(() => import('./LeaveApplications'))
const ExecutiveManagement = lazy(() => import('./ExecutiveManagement'))
const Settings = lazy(() => import('./Settings'))
const Inventory = lazy(() => import('./Inventory'))
const Finance = lazy(() => import('./Finance'))

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
  vice_general_affairs: { zh: '副总务', en: 'Assistant General Affairs' },
  activity_lead: { zh: '活动组组长', en: 'Activity Organiser' },
  vice_activity_lead: { zh: '活动组副组长', en: 'Vice Activity Organiser' },
  activity_member: { zh: '活动组组员', en: 'Assistant Activity Organiser' },
  media_lead: { zh: '正摄影', en: 'Photographer' },
  vice_media_lead: { zh: '副摄影', en: 'Assistant Photographer' },
  social_media_editor: { zh: '媒体', en: 'Social Media Editor' },
  ordinary_member: { zh: '普通会员', en: 'Ordinary Member' },
  custom: { zh: '自定义', en: 'Custom' },
  advisor: { zh: '指导老师', en: 'Advisor Teacher' },
  committee: { zh: '自定义', en: 'Custom' },
  event_member: { zh: '活动组组员', en: 'Assistant Activity Organiser' }
}
const getProfileRoleText = (profile, lang) => {
  if (!profile) return ''
  if (profile.role === 'custom' && profile.custom_role_label) return profile.custom_role_label
  return APP_ROLE_LABELS[profile.role]?.[lang] || profile.role || ''
}


function NotificationCenter({ profile, lang }) {
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  async function fetchNotifications(silent = false) {
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

  const syncFetchNotifications = useEffectEvent((...args) => { return fetchNotifications(...args) })

  useEffect(() => {
    if (!profile?.id) return
    const initialLoad = setTimeout(() => syncFetchNotifications(), 0)

    const channel = supabase
      .channel('notifications-user-' + profile.id)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + profile.id },
        () => syncFetchNotifications(true)
      )
      .subscribe()

    return () => { clearTimeout(initialLoad); supabase.removeChannel(channel) }
  }, [profile?.id])


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

function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="fixed top-4 right-4 z-[80] w-[calc(100vw-2rem)] max-w-sm space-y-2 pointer-events-none">
      {toasts.map(toast => {
        const isError = toast.type === 'error'
        const Icon = isError ? CircleAlert : CheckCircle
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 rounded-3xl px-4 py-3"
            style={{
              background: 'white',
              border: `1.5px solid ${isError ? '#fecaca' : '#bfdbfe'}`,
              boxShadow: '0 14px 34px rgba(15,23,42,0.14)',
            }}>
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
              style={{ background: isError ? '#fef2f2' : '#f0f7ff', color: isError ? '#dc2626' : '#2563eb' }}>
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black" style={{ color: '#1a1a1a' }}>{toast.title}</p>
              {toast.message && <p className="text-xs font-bold mt-0.5 leading-snug" style={{ color: '#6b7280' }}>{toast.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded-full shrink-0"
              style={{ color: '#9ca3af' }}>
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

function AppShell({ profile, onLogout, lang, setLang, onProfileUpdate }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [tutorialOpen, setShowTutorial] = useState(false)
  const [dismissedTutorialLanguage, setDismissedTutorialLanguage] = useState(null)
  const showTutorial = tutorialOpen || (dismissedTutorialLanguage !== lang && !localStorage.getItem(`cls_tutorial_completed_${lang}`))
  const [toasts, setToasts] = useState([])
  const location = useLocation()
  const navigate = useNavigate()

  const canManageHandover = hasPermission(profile, 'can_manage_handover')
  const canViewExecutiveManagement = canViewExecutivePage(profile)
  const sidebarTextShadow = '0 1px 2px rgba(34, 91, 145, 0.95), 0 0 2px rgba(34, 91, 145, 0.75)'

  const canAccessInventoryManagement = profile?.is_active !== false && (hasPermission(profile, 'can_manage_inventory') || hasPermission(profile, 'can_approve_inventory'))
  const canAccessFinanceManagement = profile?.is_active !== false && (hasPermission(profile, 'can_manage_finance') || hasPermission(profile, 'can_approve_finance'))
  const navItems = lang === 'zh' ? [
    { name: '仪表板', path: '/', icon: <LayoutDashboard size={18} />, allowed: true },
    { name: '任务看板', path: '/tasks', icon: <CheckSquare size={18} />, allowed: true },
    { name: '执委层管理', path: '/executive-management', icon: <Shield size={18} />, allowed: canViewExecutiveManagement },
    { name: '筹委管理', path: '/committees', icon: <FolderGit size={18} />, allowed: true },
    { name: '账号管理', path: '/members', icon: <Users size={18} />, allowed: true },
    { name: '历年名单', path: '/historical-members', icon: <History size={18} />, allowed: true },
    { name: '学期切换', path: '/handover', icon: <ShieldAlert size={18} />, allowed: canManageHandover },
    { name: '活动行事历', path: '/calendar', icon: <Calendar size={18} />, allowed: true },
    { name: '请假申请', path: '/leave', icon: <ClipboardList size={18} />, allowed: true },
    { name: '物品与借用', path: '/inventory', icon: <Package size={18} />, allowed: true },
    { name: '报销申请', path: '/finance', icon: <ClipboardList size={18} />, allowed: true },
    { name: '个人设置', path: '/settings', icon: <SettingsIcon size={18} />, allowed: true },
  ] : [
    { name: 'Dashboard', path: '/', icon: <LayoutDashboard size={18} />, allowed: true },
    { name: 'Tasks', path: '/tasks', icon: <CheckSquare size={18} />, allowed: true },
    { name: 'Executive Management', path: '/executive-management', icon: <Shield size={18} />, allowed: canViewExecutiveManagement },
    { name: 'Committees', path: '/committees', icon: <FolderGit size={18} />, allowed: true },
    { name: 'Accounts', path: '/members', icon: <Users size={18} />, allowed: true },
    { name: 'Historical Lists', path: '/historical-members', icon: <History size={18} />, allowed: true },
    { name: 'Term Handover', path: '/handover', icon: <ShieldAlert size={18} />, allowed: canManageHandover },
    { name: 'Calendar', path: '/calendar', icon: <Calendar size={18} />, allowed: true },
    { name: 'Leave Application', path: '/leave', icon: <ClipboardList size={18} />, allowed: true },
    { name: 'Inventory & Borrowing', path: '/inventory', icon: <Package size={18} />, allowed: true },
    { name: 'Reimbursement Applications', path: '/finance', icon: <ClipboardList size={18} />, allowed: true },
    { name: 'Settings', path: '/settings', icon: <SettingsIcon size={18} />, allowed: true },
  ]

  const handleNavClick = (path) => {
    setMobileMenuOpen(false)
    navigate(path)
  }

  const notify = ({ type = 'success', title, message }) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts(prev => [...prev.slice(-3), { id, type, title, message }])
    window.setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 3600)
  }

  const dismissToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }

  return (
    <div className={`min-h-screen flex flex-col md:flex-row overflow-x-hidden ${mobileMenuOpen ? 'club-mobile-menu-open' : ''}`} style={{ background: '#f0f7ff', fontFamily: "'Nunito', sans-serif" }}>
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Tutorial Modal */}
      {showTutorial && (
        <TutorialModal lang={lang} onClose={() => { setShowTutorial(false); setDismissedTutorialLanguage(lang) }} />
      )}

      {/* Mobile Top Navbar */}
      <div className="md:hidden flex items-center justify-between px-5 py-4 shrink-0"
        style={{ background: '#95CBFF', borderBottom: '1.5px solid #6db8ff' }}>
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-full flex items-center justify-center overflow-hidden shrink-0"
            style={{ background: 'transparent', boxShadow: '0 4px 14px rgba(74, 163, 236, 0.48), 0 0 0 2px rgba(255,255,255,0.32)' }}>
            <img src="/logo-192.png" alt="CLC_sys" className="w-full h-full object-cover rounded-full" />
          </div>
          <span className="font-black text-xs leading-tight tracking-wide max-w-[180px]" style={{ color: 'white', textShadow: sidebarTextShadow }}>{lang === 'zh' ? '\u4e00\u4e2d\u534e\u6587\u5b66\u4f1a' : 'CLC_sys'}</span>
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
        club-sidebar fixed inset-y-0 left-0 z-40 w-64 p-5 flex flex-col justify-between transition-transform duration-300 ease-in-out shrink-0
        md:relative md:translate-x-0
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:flex'}
      `} style={{ background: '#95CBFF', borderRight: '1.5px solid #6db8ff', overflow: 'hidden' }}>

        {/* Decorative circles */}
        <div style={{ position: 'absolute', bottom: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: 100, left: -30, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: 80, right: 20, width: 60, height: 60, borderRadius: '50%', background: '#FFB3C6', opacity: 0.25, pointerEvents: 'none' }} />

        <div className="space-y-6" style={{ position: 'relative', zIndex: 1 }}>
          <div className="flex items-center justify-between md:hidden text-white font-bold"><span>{lang === 'zh' ? '导航菜单' : 'Navigation'}</span><button aria-label={lang === 'zh' ? '关闭导航菜单' : 'Close navigation'} className="p-3" onClick={() => setMobileMenuOpen(false)}><X size={20}/></button></div>
          {/* Logo + Language toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                style={{ background: 'transparent', boxShadow: '0 5px 16px rgba(74, 163, 236, 0.5), 0 0 0 2px rgba(255,255,255,0.34)' }}>
                <img src="/logo-192.png" alt="CLC_sys" className="w-full h-full object-cover rounded-full" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-black text-xs leading-tight break-words" style={{ color: 'white', textShadow: sidebarTextShadow }}>{lang === 'zh' ? '\u4e00\u4e2d\u534e\u6587\u5b66\u4f1a' : 'CLC_sys'}</h2>
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
            <a data-public-navigation href={publicHomeUrl()} className="flex items-center gap-3 px-4 py-3 rounded-xl font-bold" style={{ color: 'white', textShadow: sidebarTextShadow }}><Globe size={18} />{lang === 'zh' ? '学会网站首页' : 'Club website'}</a>
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
            onClick={() => { setMobileMenuOpen(false); setShowTutorial(true) }}
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
          className="club-sidebar-overlay fixed inset-0 z-30 md:hidden"
          style={{ background: 'rgba(149,203,255,0.3)', backdropFilter: 'blur(2px)' }} />
      )}

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6 md:p-10 overflow-y-auto max-w-7xl mx-auto w-full min-w-0">
        <Suspense fallback={<PageLoading lang={lang} />}><Routes>
          <Route path="/" element={<Dashboard currentUserProfile={profile} lang={lang} onShowTutorial={() => setShowTutorial(true)} notify={notify} />} />
          <Route path="/tasks" element={<Tasks currentUserProfile={profile} lang={lang} notify={notify} />} />
          <Route path="/task-performance" element={<Tasks key="performance" comparisonOnly currentUserProfile={profile} lang={lang} notify={notify} />} />
          <Route path="/executive-management" element={
            canViewExecutiveManagement
              ? <ExecutiveManagement currentUserProfile={profile} lang={lang} notify={notify} />
              : <Navigate to="/" replace />
          } />
          <Route path="/committees" element={<Committees currentUserProfile={profile} lang={lang} notify={notify} />} />
          <Route path="/calendar" element={<CalendarPage currentUserProfile={profile} lang={lang} notify={notify} />} />
          <Route path="/leave" element={<LeaveApplications currentUserProfile={profile} lang={lang} notify={notify} />} />
          <Route path="/inventory" element={<Inventory key="member-inventory" currentUserProfile={profile} lang={lang} notify={notify} />} />
          <Route path="/inventory-management" element={canAccessInventoryManagement ? <Inventory key="manage-inventory" management currentUserProfile={profile} lang={lang} notify={notify} /> : <Navigate to="/inventory" replace />} />
          <Route path="/finance" element={<Finance key="member-finance" currentUserProfile={profile} lang={lang} notify={notify} />} />
          <Route path="/finance-management" element={canAccessFinanceManagement ? <Finance key="manage-finance" management currentUserProfile={profile} lang={lang} notify={notify} /> : <Navigate to="/finance" replace />} />
          <Route path="/settings" element={<Settings currentUserProfile={profile} lang={lang} onProfileUpdate={onProfileUpdate} notify={notify} />} />
          <Route path="/historical-members" element={<HistoricalMembers lang={lang} />} />
          <Route path="/handover" element={
            canManageHandover
              ? <Handover currentUserProfile={profile} lang={lang} notify={notify} />
              : <Navigate to="/" replace />
          } />
          <Route path="/members" element={<Members currentUserProfile={profile} lang={lang} notify={notify} />} />
          {/* Legacy placeholder redirects */}
          <Route path="/tasks-placeholder" element={<Navigate to="/tasks" replace />} />
          <Route path="/committees-placeholder" element={<Navigate to="/committees" replace />} />
          <Route path="/calendar-placeholder" element={<Navigate to="/calendar" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes></Suspense>
      </main>
    </div>
  )
}

export default function MemberShell(props) {
  return <Router><AppShell {...props} /></Router>
}
