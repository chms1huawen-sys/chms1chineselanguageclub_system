import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import {
  AlertCircle,
  Bell,
  Calendar,
  Cake,
  CheckSquare,
  ClipboardList,
  ExternalLink,
  HelpCircle,
  Loader,
  Megaphone,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  Users,
} from 'lucide-react'

const MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary']
const ANNOUNCEMENT_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson']

const EVENT_TYPE_LABELS = {
  event: { zh: '活动', en: 'Event', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  meeting: { zh: '会议', en: 'Meeting', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  deadline: { zh: '截止', en: 'Deadline', bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
}

const LEAVE_TYPE_LABELS = {
  sick: { zh: '病假', en: 'Sick Leave' },
  official: { zh: '公假', en: 'Official Leave' },
  personal: { zh: '事假', en: 'Personal Leave' },
  custom: { zh: '自定义', en: 'Custom' },
}

const STATUS_LABELS = {
  pending: { zh: '待审批', en: 'Pending', bg: '#fffbeb', color: '#ca8a04', border: '#fde047' },
  approved: { zh: '已批准', en: 'Approved', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  rejected: { zh: '已驳回', en: 'Rejected', bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
  recorded: { zh: '已记录', en: 'Recorded', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
}

const cardStyle = {
  background: 'white',
  border: '1.5px solid #e0f1ff',
  borderRadius: 24,
  boxShadow: '0 4px 20px rgba(149,203,255,0.14)',
}

const inputStyle = {
  background: '#f0f7ff',
  border: '1.5px solid #95CBFF',
  color: '#1a1a1a',
  borderRadius: 16,
  fontFamily: "'Nunito', sans-serif",
  fontWeight: 700,
  padding: '10px 14px',
  outline: 'none',
}

const getLocalDate = (date = new Date()) => (
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
)

const formatDate = (date, lang = 'zh') => {
  if (!date) return '-'
  return new Date(`${String(date).split('T')[0]}T00:00:00`).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function CountUpNumber({ value }) {
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const target = Number(value) || 0
    const start = display
    const startTime = performance.now()
    const duration = 450
    let frame = 0

    const tick = (now) => {
      const progress = Math.min((now - startTime) / duration, 1)
      setDisplay(Math.round(start + (target - start) * progress))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return display
}

const getLeaveTypeText = (leave, lang) => {
  if (leave?.leave_type === 'custom' && leave.custom_leave_type) return leave.custom_leave_type
  const label = LEAVE_TYPE_LABELS[leave?.leave_type]
  return label ? (lang === 'zh' ? label.zh : label.en) : (leave?.leave_type || '-')
}

export default function Dashboard({ currentUserProfile, lang = 'zh', onShowTutorial }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ myPendingTasks: 0, monthEvents: 0, activeMembers: 0, pendingLeaves: 0 })
  const [weekEvents, setWeekEvents] = useState([])
  const [leaveApplications, setLeaveApplications] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [activityFeed, setActivityFeed] = useState([])
  const [activeTab, setActiveTab] = useState('announcements')
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '', is_pinned: false })
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isLeaveManager = MANAGER_ROLES.includes(currentUserProfile?.role)
  const canPublishAnnouncements = ANNOUNCEMENT_ROLES.includes(currentUserProfile?.role)

  useEffect(() => {
    if (!currentUserProfile?.id) return
    fetchDashboardData()

    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'users' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_applications' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, fetchDashboardData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, fetchDashboardData)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUserProfile?.id, currentUserProfile?.role])

  const fetchDashboardData = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const now = new Date()
      const todayStr = getLocalDate(now)
      const weekEnd = new Date(now)
      weekEnd.setDate(now.getDate() + 7)
      const weekEndStr = getLocalDate(weekEnd)
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const monthEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`

      const [
        tasksResult,
        monthEventsResult,
        weekEventsResult,
        membersResult,
        leavesResult,
        birthdaysResult,
        announcementsResult,
        activityResult,
        notificationsResult,
      ] = await Promise.all([
        supabase.from('tasks').select('id, status, assigned_to').contains('assigned_to', [currentUserProfile.id]),
        supabase.from('events').select('id', { count: 'exact', head: true }).gte('date', monthStart).lte('date', monthEnd).neq('title', 'EXEC_DRIVE_LINK'),
        supabase.from('events').select('*').gte('date', todayStr).lte('date', weekEndStr).neq('title', 'EXEC_DRIVE_LINK').order('date', { ascending: true }),
        supabase.from('users').select('*', { count: 'exact', head: true }).eq('is_active', true),
        isLeaveManager
          ? supabase.from('leave_applications').select('*, applicant:users(id, name, email)').order('created_at', { ascending: false }).limit(5)
          : Promise.resolve({ data: [] }),
        supabase.from('users').select('id, name, birthday').eq('is_active', true).not('birthday', 'is', null),
        supabase.from('announcements').select('*, author:users(id, name)').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(8),
        supabase.from('activity_log').select('*, actor:users(id, name)').order('created_at', { ascending: false }).limit(10),
        supabase.from('notifications').select('id, title, body, sent_at').order('sent_at', { ascending: false }).limit(10),
      ])

      const myPendingTasks = (tasksResult.data || []).filter(task => task.status !== 'completed').length
      const latestLeaves = leavesResult.data || []
      const pendingLeaves = latestLeaves.filter(leave => (leave.status || 'pending') === 'pending').length
      const monthNumber = now.getMonth() + 1
      const thisMonthBirthdays = (birthdaysResult.data || [])
        .filter(user => {
          if (!user.birthday) return false
          const [, month] = user.birthday.split('-').map(Number)
          return month === monthNumber
        })
        .sort((a, b) => a.birthday.localeCompare(b.birthday))

      const notificationFeed = (notificationsResult.data || []).map(item => ({
        id: `notification-${item.id}`,
        message: `${item.title}${item.body ? ` - ${item.body}` : ''}`,
        created_at: item.sent_at,
      }))

      setStats({
        myPendingTasks,
        monthEvents: monthEventsResult.count || 0,
        activeMembers: membersResult.count || 0,
        pendingLeaves,
      })
      setWeekEvents(weekEventsResult.data || [])
      setLeaveApplications(latestLeaves)
      setBirthdays(thisMonthBirthdays)
      setAnnouncements(announcementsResult.data || [])
      setActivityFeed((activityResult.data?.length ? activityResult.data : notificationFeed).slice(0, 10))
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setErrorMsg(err.message || 'Dashboard loading failed.')
    } finally {
      setLoading(false)
    }
  }

  const handlePublishAnnouncement = async (event) => {
    event.preventDefault()
    if (!canPublishAnnouncements) return
    setAnnouncementSubmitting(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          title: announcementForm.title.trim(),
          body: announcementForm.body.trim(),
          is_pinned: announcementForm.is_pinned,
          created_by: currentUserProfile.id,
        })
        .select()
        .single()

      if (error) throw error

      await supabase.from('activity_log').insert({
        actor_id: currentUserProfile.id,
        action_type: 'announcement_created',
        message: `${currentUserProfile.name} 发布了公告《${data.title}》`,
      })

      setAnnouncementForm({ title: '', body: '', is_pinned: false })
      setShowAnnouncementModal(false)
      fetchDashboardData()
    } catch (err) {
      setErrorMsg(err.message || '发布公告失败 Failed to publish announcement.')
    } finally {
      setAnnouncementSubmitting(false)
    }
  }

  const statsCards = useMemo(() => {
    const cards = [
      { label: '我的待完成任务 / My Pending Tasks', value: stats.myPendingTasks, icon: CheckSquare, color: '#95CBFF', path: '/tasks' },
      { label: '本月活动 / Events This Month', value: stats.monthEvents, icon: Calendar, color: '#4ade80', path: '/calendar' },
      { label: '本届执委人数 / Active Members', value: stats.activeMembers, icon: Users, color: '#FFB3C6', path: '/members' },
    ]
    if (isLeaveManager) {
      cards.push({ label: '待审批请假 / Pending Leave', value: stats.pendingLeaves, icon: ClipboardList, color: '#f59e0b', path: '/leave' })
    }
    return cards
  }, [isLeaveManager, stats])

  const todayKey = getLocalDate()

  return (
    <div className="space-y-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <section className="relative overflow-hidden p-6 md:p-8 rounded-3xl" style={{ background: '#95CBFF', boxShadow: '0 4px 24px rgba(149,203,255,0.35)' }}>
        <img
          src="/cls-cartoon.png"
          alt=""
          className="absolute right-4 top-2 w-44 md:w-72 opacity-28 pointer-events-none select-none"
          style={{ mixBlendMode: 'multiply' }}
        />
        <div className="absolute -right-10 -bottom-10 w-36 h-36 rounded-full opacity-30" style={{ background: '#FFB3C6' }} />
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black" style={{ background: 'rgba(255,255,255,0.25)', color: 'white' }}>
            <Sparkles size={13} />
            CLS System Dashboard
          </span>
          <h1 className="text-2xl md:text-3xl font-black mt-3" style={{ color: 'white' }}>
            {lang === 'zh' ? `你好，${currentUserProfile?.name || '成员'}！` : `Hello, ${currentUserProfile?.name || 'Member'}!`}
          </h1>
          <p className="text-sm md:text-base font-semibold mt-2" style={{ color: 'rgba(255,255,255,0.86)' }}>
            {lang === 'zh' ? '这里是今天需要关注的任务、活动、请假与学会动态。' : 'Here are the tasks, events, leave records and society updates that need attention today.'}
          </p>
        </div>
        {onShowTutorial && (
          <button onClick={onShowTutorial} className="absolute top-4 right-4 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black cursor-pointer" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
            <HelpCircle size={12} /> Tutorial
          </button>
        )}
      </section>

      {errorMsg && (
        <div className="flex items-start gap-2 p-4 rounded-2xl text-sm font-semibold" style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
          <AlertCircle size={18} /> {errorMsg}
        </div>
      )}

      <section className={`grid grid-cols-1 ${isLeaveManager ? 'md:grid-cols-4' : 'md:grid-cols-3'} gap-4`}>
      {statsCards.map(card => {
          const Icon = card.icon
          return (
            <button key={card.label} onClick={() => navigate(card.path)} className="text-left p-5 transition hover:scale-[1.02]" style={cardStyle}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider" style={{ color: '#5f6f87' }}>{card.label}</p>
                  <p className="text-3xl font-black mt-3" style={{ color: '#1a1a1a' }}>{loading ? '-' : <CountUpNumber value={card.value} />}</p>
                </div>
                <span className="p-3 rounded-2xl" style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
                  <Icon size={20} color={card.color} />
                </span>
              </div>
            </button>
          )
        })}
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 space-y-4" style={cardStyle}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#1a1a1a' }}>
              <Calendar size={18} color="#95CBFF" /> 本周行事历 / This Week
            </h2>
            <button onClick={() => navigate('/calendar')} className="text-xs font-black flex items-center gap-1" style={{ color: '#6db8ff' }}>
              查看完整行事历 <ExternalLink size={12} />
            </button>
          </div>
          {loading ? (
            <SkeletonLines />
          ) : weekEvents.length === 0 ? (
            <EmptyText text="本周暂无活动安排 / No events this week" />
          ) : (
            <div className="space-y-3">
              {weekEvents.map(event => {
                const type = EVENT_TYPE_LABELS[event.type] || EVENT_TYPE_LABELS.event
                return (
                  <div key={event.id} className="flex items-center justify-between gap-3 p-3 rounded-2xl" style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
                    <div>
                      <p className="text-sm font-black" style={{ color: '#1a1a1a' }}>{event.title}</p>
                      <p className="text-xs font-bold mt-1" style={{ color: '#6b7280' }}>{formatDate(event.date, lang)}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black" style={{ background: type.bg, color: type.color, border: `1.5px solid ${type.border}` }}>
                      {type.zh} / {type.en}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-5 space-y-4" style={cardStyle}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <TabButton active={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')}>公告 Announcements</TabButton>
              <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>动态 Feed</TabButton>
            </div>
            {canPublishAnnouncements && (
              <button onClick={() => setShowAnnouncementModal(true)} className="px-3 py-2 rounded-2xl text-xs font-black flex items-center gap-1" style={{ background: '#FFB3C6', color: 'white' }}>
                <Plus size={13} /> 发布
              </button>
            )}
          </div>
          {activeTab === 'announcements' ? (
            announcements.length === 0 ? <EmptyText text="暂无系统公告 / No announcements" /> : (
              <div className="space-y-3">
                {announcements.map(item => (
                  <div key={item.id} className="p-3 rounded-2xl" style={{ background: item.is_pinned ? '#fff7fb' : '#f0f7ff', border: `1.5px solid ${item.is_pinned ? '#FFB3C6' : '#e0f1ff'}` }}>
                    <p className="text-sm font-black" style={{ color: '#1a1a1a' }}>{item.is_pinned ? '置顶 Pin · ' : ''}{item.title}</p>
                    <p className="text-xs font-semibold mt-1" style={{ color: '#6b7280' }}>{item.body}</p>
                    <p className="text-[10px] font-bold mt-2" style={{ color: '#9ca3af' }}>{item.author?.name || '-'} · {new Date(item.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )
          ) : (
            activityFeed.length === 0 ? <EmptyText text="暂无系统动态 / No activity yet" /> : (
              <div className="space-y-3">
                {activityFeed.map(item => (
                  <div key={item.id} className="flex gap-3 p-3 rounded-2xl" style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
                    <Bell size={15} style={{ color: '#95CBFF', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <p className="text-xs font-black" style={{ color: '#1a1a1a' }}>{item.message}</p>
                      <p className="text-[10px] font-bold mt-1" style={{ color: '#9ca3af' }}>{new Date(item.created_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {isLeaveManager && (
          <div className="p-5 space-y-4" style={cardStyle}>
            <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#1a1a1a' }}>
              <ClipboardList size={18} color="#95CBFF" /> 最新请假状态 / Latest Leave
            </h2>
            {leaveApplications.length === 0 || leaveApplications.every(item => (item.status || 'pending') !== 'pending') ? (
              <EmptyText text="暂无待审批请假 / No pending leave applications" />
            ) : (
              <div className="space-y-3">
                {leaveApplications.map(leave => {
                  const status = STATUS_LABELS[leave.status || 'pending'] || STATUS_LABELS.pending
                  return (
                    <div key={leave.id} className="p-3 rounded-2xl" style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-black" style={{ color: '#1a1a1a' }}>{leave.applicant?.name || '-'}</p>
                          <p className="text-xs font-bold mt-1" style={{ color: '#6b7280' }}>{getLeaveTypeText(leave, lang)} · {formatDate(leave.leave_date, lang)} · 1 天</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black" style={{ background: status.bg, color: status.color, border: `1.5px solid ${status.border}` }}>
                          {status.zh} / {status.en}
                        </span>
                      </div>
                      {(leave.status || 'pending') === 'pending' && (
                        <button onClick={() => navigate('/leave')} className="mt-3 text-xs font-black" style={{ color: '#6db8ff' }}>
                          立即审批 →
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="p-5 space-y-4" style={cardStyle}>
          <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#1a1a1a' }}>
            <Cake size={18} color="#FFB3C6" /> 本月生日 / Birthdays
          </h2>
          {birthdays.length === 0 ? (
            <EmptyText text="本月暂无生日 / No birthdays this month" />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {birthdays.map(user => {
                const birthdayKey = user.birthday?.slice(5)
                const isToday = birthdayKey === todayKey.slice(5)
                return (
                  <div key={user.id} className="flex items-center gap-3 p-3 rounded-2xl" style={{ background: isToday ? '#fff7fb' : '#f0f7ff', border: `1.5px solid ${isToday ? '#FFB3C6' : '#e0f1ff'}` }}>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black" style={{ background: 'white', color: '#6db8ff' }}>
                      {user.name?.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-black" style={{ color: '#1a1a1a' }}>{isToday ? '🎂 ' : ''}{user.name}</p>
                      <p className="text-xs font-bold" style={{ color: '#6b7280' }}>{formatDate(user.birthday, lang)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="p-5" style={cardStyle}>
        <h2 className="font-black text-base flex items-center gap-2 mb-4" style={{ color: '#1a1a1a' }}>
          <TrendingUp size={18} color="#95CBFF" /> 快捷入口 / Quick Actions
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <QuickButton icon={<Plus size={16} />} label="新建任务 / New Task" onClick={() => navigate('/tasks')} />
          <QuickButton icon={<ClipboardList size={16} />} label="提交请假 / Submit Leave" onClick={() => navigate('/leave')} />
          <QuickButton icon={<Calendar size={16} />} label="查看行事历 / Calendar" onClick={() => navigate('/calendar')} />
          {isLeaveManager && <QuickButton icon={<CheckSquare size={16} />} label="审批请假 / Review Leave" onClick={() => navigate('/leave')} />}
          {isLeaveManager && <QuickButton icon={<Users size={16} />} label="管理成员 / Accounts" onClick={() => navigate('/members')} />}
          {canPublishAnnouncements && <QuickButton icon={<Megaphone size={16} />} label="发布公告 / Announce" onClick={() => setShowAnnouncementModal(true)} />}
        </div>
      </section>

      {showAnnouncementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(149,203,255,0.18)', backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handlePublishAnnouncement} className="w-full max-w-lg p-6 space-y-4" style={cardStyle}>
            <h3 className="font-black text-lg flex items-center gap-2" style={{ color: '#1a1a1a' }}>
              <Megaphone size={18} color="#95CBFF" /> 发布公告 / Publish Announcement
            </h3>
            <input required value={announcementForm.title} onChange={e => setAnnouncementForm(prev => ({ ...prev, title: e.target.value }))} placeholder="公告标题 Title" className="w-full text-sm" style={inputStyle} />
            <textarea required value={announcementForm.body} onChange={e => setAnnouncementForm(prev => ({ ...prev, body: e.target.value }))} placeholder="公告内容 Content" rows={5} className="w-full text-sm resize-none" style={inputStyle} />
            <label className="flex items-center gap-2 text-xs font-bold" style={{ color: '#6b7280' }}>
              <input type="checkbox" checked={announcementForm.is_pinned} onChange={e => setAnnouncementForm(prev => ({ ...prev, is_pinned: e.target.checked }))} />
              置顶公告 / Pin announcement
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setShowAnnouncementModal(false)} className="px-4 py-2 rounded-2xl text-sm font-bold" style={{ background: '#f0f7ff', color: '#6b7280' }}>取消</button>
              <button disabled={announcementSubmitting} className="px-4 py-2 rounded-2xl text-sm font-black flex items-center gap-2" style={{ background: '#95CBFF', color: 'white' }}>
                {announcementSubmitting ? <Loader size={14} className="animate-spin" /> : <Send size={14} />} 发布
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function SkeletonLines() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map(item => <div key={item} className="h-16 rounded-2xl animate-pulse" style={{ background: '#f0f7ff' }} />)}
    </div>
  )
}

function EmptyText({ text }) {
  return <div className="py-10 text-center text-sm font-bold" style={{ color: '#9ca3af' }}>{text}</div>
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="px-3 py-2 rounded-2xl text-xs font-black" style={{ background: active ? '#95CBFF' : '#f0f7ff', color: active ? 'white' : '#6b7280' }}>
      {children}
    </button>
  )
}

function QuickButton({ icon, label, onClick }) {
  return (
    <button onClick={onClick} className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-black transition hover:scale-[1.02]" style={{ background: '#f0f7ff', color: '#1a1a1a', border: '1.5px solid #e0f1ff' }}>
      <span style={{ color: '#95CBFF' }}>{icon}</span>
      {label}
    </button>
  )
}
