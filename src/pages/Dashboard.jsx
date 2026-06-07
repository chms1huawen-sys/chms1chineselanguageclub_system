import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { createNotificationsAndPush, syncAnnouncementNotifications } from '../utils/pushNotifications'
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
  Pencil,
  Plus,
  Send,
  Sparkles,
  TrendingUp,
  Trash2,
  Users,
  X,
} from 'lucide-react'

const MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary']
const ANNOUNCEMENT_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson']
const MEMBER_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson']
const TASK_QUICK_ACCESS_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead']
const BOARD_ROLES = [
  'convener_teacher',
  'advisor_teacher',
  'advisor',
  'chairperson',
  'vice_chairperson',
  'secretary',
  'vice_secretary',
  'treasurer',
  'vice_treasurer',
  'general_affairs',
  'vice_general_affairs',
  'activity_lead',
  'vice_activity_lead',
  'activity_member',
  'media_lead',
  'vice_media_lead',
]

const EVENT_TYPE_LABELS = {
  event: { zh: '活动', en: 'Event', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  meeting: { zh: '会议', en: 'Meeting', bg: '#ecfdf5', color: '#059669', border: '#a7f3d0' },
  deadline: { zh: '截止', en: 'Deadline', bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
}

const isClubActivityEvent = (event) => {
  const title = (event?.title || '').toLowerCase()
  const isActivityType = ['event', 'meeting'].includes(event?.type)
  const isActivityColor = !event?.color || ['blue', 'green'].includes(event.color)
  const looksLikeDeadline = title.includes('截止') || title.includes('deadline') || title.includes('task')
  const isDrivePlaceholder = title.includes('google drive') || title.includes('drive 文件夹') || title.includes('文件夹')
  return isActivityType && isActivityColor && !looksLikeDeadline && !isDrivePlaceholder
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

const getAnnouncementTargetLabel = (announcement) => {
  if (announcement?.target_type === 'board') return '仅执委层'
  if (announcement?.target_type === 'committee') return announcement.target_team?.name || '指定筹委'
  return '全部'
}

export default function Dashboard({ currentUserProfile, lang = 'zh', onShowTutorial }) {
  const navigate = useNavigate()
  const bannerTextShadow = '0 1px 2px rgba(34, 91, 145, 0.9), 0 0 2px rgba(34, 91, 145, 0.65)'
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ myPendingTasks: 0, monthEvents: 0, activeMembers: 0, pendingLeaves: 0 })
  const [weekEvents, setWeekEvents] = useState([])
  const [leaveApplications, setLeaveApplications] = useState([])
  const [birthdays, setBirthdays] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [committeeTeams, setCommitteeTeams] = useState([])
  const [myCommitteeTeamIds, setMyCommitteeTeamIds] = useState([])
  const [activityFeed, setActivityFeed] = useState([])
  const [activeTab, setActiveTab] = useState('announcements')
  const [showAnnouncementModal, setShowAnnouncementModal] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState(null)
  const [announcementForm, setAnnouncementForm] = useState({ title: '', body: '', is_pinned: false, target_type: 'all', target_team_id: '' })
  const [announcementSubmitting, setAnnouncementSubmitting] = useState(false)
  const [birthdayWishTarget, setBirthdayWishTarget] = useState(null)
  const [birthdayWishText, setBirthdayWishText] = useState('')
  const [birthdayWishSubmitting, setBirthdayWishSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const isLeaveManager = MANAGER_ROLES.includes(currentUserProfile?.role)
  const canPublishAnnouncements = ANNOUNCEMENT_ROLES.includes(currentUserProfile?.role)
  const canManageMembers = MEMBER_MANAGER_ROLES.includes(currentUserProfile?.role)
  const canCreateTasks = TASK_QUICK_ACCESS_ROLES.includes(currentUserProfile?.role)

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
        committeeTeamsResult,
        myCommitteeMembershipResult,
        activityResult,
        notificationsResult,
      ] = await Promise.all([
        supabase.from('tasks').select('id, status, assigned_to').contains('assigned_to', [currentUserProfile.id]),
        supabase.from('events').select('id, type, color, title, date').gte('date', monthStart).lte('date', monthEnd).neq('title', 'EXEC_DRIVE_LINK').not('title', 'ilike', 'Google Drive%'),
        supabase.from('events').select('*').gte('date', todayStr).lte('date', weekEndStr).in('type', ['event', 'meeting']).in('color', ['blue', 'green']).neq('title', 'EXEC_DRIVE_LINK').not('title', 'ilike', 'Google Drive%').order('date', { ascending: true }),
        supabase.rpc('get_active_member_count'),
        isLeaveManager
          ? supabase.from('leave_applications').select('*, applicant:users(id, name, email)').order('created_at', { ascending: false }).limit(5)
          : Promise.resolve({ data: [] }),
        supabase.from('users').select('id, name, birthday').eq('is_active', true).not('birthday', 'is', null),
        supabase.from('announcements').select('*, author:users(id, name), target_team:teams(id, name)').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20),
        supabase.from('teams').select('id, name, session').eq('type', 'event').eq('is_archived', false).order('created_at', { ascending: false }),
        supabase.from('team_members').select('team_id, teams(id, type, is_archived)').eq('user_id', currentUserProfile.id),
        supabase.from('activity_log').select('*, actor:users(id, name)').order('created_at', { ascending: false }).limit(10),
        supabase.from('notifications').select('id, title, body, sent_at').order('sent_at', { ascending: false }).limit(10),
      ])

      const myPendingTasks = (tasksResult.data || []).filter(task => task.status !== 'completed').length
      const monthActivities = (monthEventsResult.data || []).filter(isClubActivityEvent)
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
        monthEvents: monthActivities.length,
        activeMembers: Number(membersResult.data || 0),
        pendingLeaves,
      })
      setWeekEvents((weekEventsResult.data || []).filter(isClubActivityEvent))
      setLeaveApplications(latestLeaves)
      setBirthdays(thisMonthBirthdays)
      const committeeIds = (myCommitteeMembershipResult.data || [])
        .filter(item => item.teams?.type === 'event' && !item.teams?.is_archived)
        .map(item => item.team_id)
      const canSeeBoardAnnouncements = BOARD_ROLES.includes(currentUserProfile?.role)
      const visibleAnnouncements = (announcementsResult.data || []).filter(item => {
        if (canPublishAnnouncements || item.created_by === currentUserProfile.id) return true
        if (!item.target_type || item.target_type === 'all') return true
        if (item.target_type === 'board') return canSeeBoardAnnouncements
        if (item.target_type === 'committee') return item.target_team_id && committeeIds.includes(item.target_team_id)
        return true
      }).slice(0, 8)
      setCommitteeTeams(committeeTeamsResult.data || [])
      setMyCommitteeTeamIds(committeeIds)
      setAnnouncements(visibleAnnouncements)
      setActivityFeed((activityResult.data?.length ? activityResult.data : notificationFeed).slice(0, 10))
    } catch (err) {
      console.error('Dashboard fetch error:', err)
      setErrorMsg(err.message || (lang === 'zh' ? '加载仪表盘失败' : 'Dashboard loading failed.'))
    } finally {
      setLoading(false)
    }
  }

  const getAnnouncementRecipientIds = async (targetType, targetTeamId) => {
    let recipientQuery = supabase
      .from('users')
      .select('id')
      .eq('is_active', true)

    if (targetType === 'board') {
      recipientQuery = recipientQuery.in('role', BOARD_ROLES)
    }

    const { data: recipientUsers, error: recipientError } = await recipientQuery
    if (recipientError) throw recipientError

    let recipientIds = (recipientUsers || []).map(user => user.id)
    if (targetType === 'committee' && targetTeamId) {
      const { data: committeeMembers, error: committeeError } = await supabase
        .from('team_members')
        .select('user_id')
        .eq('team_id', targetTeamId)

      if (committeeError) throw committeeError
      const committeeIds = new Set((committeeMembers || []).map(item => item.user_id))
      recipientIds = recipientIds.filter(id => committeeIds.has(id))
    }

    return [...new Set(recipientIds)]
  }

  const resetAnnouncementModal = () => {
    setAnnouncementForm({ title: '', body: '', is_pinned: false, target_type: 'all', target_team_id: '' })
    setEditingAnnouncement(null)
    setShowAnnouncementModal(false)
  }

  const openNewAnnouncementModal = () => {
    setAnnouncementForm({ title: '', body: '', is_pinned: false, target_type: 'all', target_team_id: '' })
    setEditingAnnouncement(null)
    setShowAnnouncementModal(true)
  }

  const openEditAnnouncementModal = (announcement) => {
    setAnnouncementForm({
      title: announcement.title || '',
      body: announcement.body || '',
      is_pinned: Boolean(announcement.is_pinned),
      target_type: announcement.target_type || 'all',
      target_team_id: announcement.target_team_id || '',
    })
    setEditingAnnouncement(announcement)
    setShowAnnouncementModal(true)
  }

  const handleDeleteAnnouncement = async (announcement) => {
    if (!canPublishAnnouncements || !announcement?.id) return
    if (!window.confirm(lang === 'zh' ? '确定要删除这则公告吗？关联的站内通知也会一起删除。' : 'Delete this announcement? Related in-app notifications will also be deleted.')) return

    setErrorMsg('')
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', announcement.id)

      if (error) throw error

      await syncAnnouncementNotifications({
        action: 'delete',
        announcementId: announcement.id,
      })

      await supabase.from('activity_log').insert({
        actor_id: currentUserProfile.id,
        action_type: 'announcement_deleted',
        message: `${currentUserProfile.name} 删除了公告《${announcement.title}》`,
      })

      fetchDashboardData()
    } catch (err) {
      setErrorMsg(err.message || (lang === 'zh' ? '删除公告失败' : 'Failed to delete announcement.'))
    }
  }

  const handlePublishAnnouncement = async (event) => {
    event.preventDefault()
    if (!canPublishAnnouncements) return
    setAnnouncementSubmitting(true)
    setErrorMsg('')
    try {
      const payload = {
        title: announcementForm.title.trim(),
        body: announcementForm.body.trim(),
        is_pinned: announcementForm.is_pinned,
        target_type: announcementForm.target_type,
        target_team_id: announcementForm.target_type === 'committee' ? announcementForm.target_team_id : null,
      }

      if (editingAnnouncement?.id) {
        const { data, error } = await supabase
          .from('announcements')
          .update(payload)
          .eq('id', editingAnnouncement.id)
          .select()
          .single()

        if (error) throw error

        const recipientIds = await getAnnouncementRecipientIds(payload.target_type, payload.target_team_id)
        await syncAnnouncementNotifications({
          action: 'update',
          announcementId: data.id,
          title: `新公告：${data.title}`,
          body: data.body,
          recipientIds,
        })

        await supabase.from('activity_log').insert({
          actor_id: currentUserProfile.id,
          action_type: 'announcement_updated',
          message: `${currentUserProfile.name} 修改了公告《${data.title}》`,
        })

        resetAnnouncementModal()
        fetchDashboardData()
        return
      }

      const { data, error } = await supabase
        .from('announcements')
        .insert({
          title: announcementForm.title.trim(),
          body: announcementForm.body.trim(),
          is_pinned: announcementForm.is_pinned,
          target_type: announcementForm.target_type,
          target_team_id: announcementForm.target_type === 'committee' ? announcementForm.target_team_id : null,
          created_by: currentUserProfile.id,
        })
        .select()
        .single()

      if (error) throw error

      let recipientQuery = supabase
        .from('users')
        .select('id')
        .eq('is_active', true)

      if (announcementForm.target_type === 'board') {
        recipientQuery = recipientQuery.in('role', BOARD_ROLES)
      }

      const { data: recipientUsers, error: recipientError } = await recipientQuery
      if (recipientError) throw recipientError

      let recipientIds = (recipientUsers || []).map(user => user.id)
      if (announcementForm.target_type === 'committee' && announcementForm.target_team_id) {
        const { data: committeeMembers, error: committeeError } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', announcementForm.target_team_id)

        if (committeeError) throw committeeError
        const committeeIds = new Set((committeeMembers || []).map(item => item.user_id))
        recipientIds = recipientIds.filter(id => committeeIds.has(id))
      }

      const notificationRows = [...new Set(recipientIds)].map(userId => ({
        user_id: userId,
        type: 'announcement',
        title: `新公告：${data.title}`,
        body: data.body,
        dedupe_key: `announcement-${data.id}-${userId}`,
      }))

      await createNotificationsAndPush(notificationRows, '/')

      await supabase.from('activity_log').insert({
        actor_id: currentUserProfile.id,
        action_type: 'announcement_created',
        message: `${currentUserProfile.name} 发布了公告《${data.title}》`,
      })

      setAnnouncementForm({ title: '', body: '', is_pinned: false, target_type: 'all', target_team_id: '' })
      setShowAnnouncementModal(false)
      fetchDashboardData()
    } catch (err) {
      setErrorMsg(err.message || (lang === 'zh' ? '发布公告失败' : 'Failed to publish announcement.'))
    } finally {
      setAnnouncementSubmitting(false)
    }
  }

  const openBirthdayWish = (user, isToday) => {
    setBirthdayWishTarget(user)
    setBirthdayWishText(
      isToday
        ? `生日快乐，${user.name}！祝你新的一岁平安顺利，继续发光。`
        : `${user.name}，提前祝你生日快乐！愿你新的一岁一切顺心。`,
    )
  }

  const handleSendBirthdayWish = async (event) => {
    event.preventDefault()
    if (!birthdayWishTarget?.id || !birthdayWishText.trim()) return

    setBirthdayWishSubmitting(true)
    setErrorMsg('')
    try {
      await createNotificationsAndPush(
        [
          {
            user_id: birthdayWishTarget.id,
            type: 'birthday_wish',
            title: `来自 ${currentUserProfile?.name || '成员'} 的生日祝福`,
            body: birthdayWishText.trim(),
            dedupe_key: `birthday-wish-${birthdayWishTarget.id}-${currentUserProfile?.id || 'member'}-${Date.now()}`,
          },
        ],
        '/',
      )
      setBirthdayWishTarget(null)
      setBirthdayWishText('')
      fetchDashboardData()
    } catch (err) {
      setErrorMsg(err.message || (lang === 'zh' ? '发送生日祝福失败' : 'Failed to send birthday wish.'))
    } finally {
      setBirthdayWishSubmitting(false)
    }
  }

  const statsCards = useMemo(() => {
    const cards = [
      { label: lang === 'zh' ? '我的待完成任务' : 'My Pending Tasks', value: stats.myPendingTasks, icon: CheckSquare, color: '#95CBFF', path: '/tasks' },
      { label: lang === 'zh' ? '本月活动' : 'Events This Month', value: stats.monthEvents, icon: Calendar, color: '#4ade80', path: '/calendar' },
      { label: lang === 'zh' ? '\u672c\u5c4a\u6210\u5458\u4eba\u6570' : 'Active Members', value: stats.activeMembers, icon: Users, color: '#FFB3C6', path: '/members' },
    ]
    if (isLeaveManager) {
      cards.push({ label: lang === 'zh' ? '请假历史' : 'Leave History', value: stats.pendingLeaves, icon: ClipboardList, color: '#f59e0b', path: '/leave' })
    }
    return cards
  }, [isLeaveManager, stats, lang])

  const todayKey = getLocalDate()

  return (
    <div className="space-y-4 sm:space-y-6 max-w-full overflow-x-hidden" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <section className="relative overflow-hidden p-4 sm:p-6 md:p-8 rounded-3xl" style={{ background: '#95CBFF', boxShadow: '0 4px 24px rgba(149,203,255,0.35)' }}>
        <img
          src="/cls-cartoon.png"
          alt=""
          className="absolute right-4 top-2 w-44 md:w-72 opacity-28 pointer-events-none select-none"
          style={{ mixBlendMode: 'multiply' }}
        />
        <div className="absolute -right-10 -bottom-10 w-36 h-36 rounded-full opacity-30" style={{ background: '#FFB3C6' }} />
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black" style={{ background: 'rgba(255,255,255,0.25)', color: 'white', textShadow: bannerTextShadow }}>
            <Sparkles size={13} />
            {lang === 'zh' ? '学会仪表盘' : 'CLC_sys Dashboard'}
          </span>
          <h1 className="text-2xl md:text-3xl font-black mt-3" style={{ color: 'white', textShadow: bannerTextShadow }}>
            {lang === 'zh' ? `你好，${currentUserProfile?.name || '成员'}！` : `Hello, ${currentUserProfile?.name || 'Member'}!`}
          </h1>
          <p className="text-sm md:text-base font-semibold mt-2" style={{ color: 'white', textShadow: bannerTextShadow }}>
            {lang === 'zh' ? '这里是今天需要关注的任务、活动、请假与学会动态。' : 'Here are the tasks, events, leave records and society updates that need attention today.'}
          </p>
        </div>
        {onShowTutorial && (
          <button onClick={onShowTutorial} className="absolute top-4 right-4 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black cursor-pointer" style={{ background: 'rgba(255,255,255,0.2)', color: 'white', textShadow: bannerTextShadow }}>
            <HelpCircle size={12} /> {lang === 'zh' ? '新手引导' : 'Tutorial'}
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
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
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

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <div className="p-4 sm:p-5 space-y-4 min-w-0" style={cardStyle}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#1a1a1a' }}>
              <Calendar size={18} color="#95CBFF" /> {lang === 'zh' ? '本周行事历' : 'This Week'}
            </h2>
            <button onClick={() => navigate('/calendar')} className="text-xs font-black inline-flex items-center gap-1 self-start sm:self-auto" style={{ color: '#6db8ff' }}>
              {lang === 'zh' ? '查看完整行事历' : 'Full Calendar'} <ExternalLink size={12} />
            </button>
          </div>
          {loading ? (
            <SkeletonLines />
          ) : weekEvents.length === 0 ? (
            <EmptyText text={lang === 'zh' ? '本周暂无活动安排' : 'No events this week'} />
          ) : (
            <div className="space-y-3">
              {weekEvents.map(event => {
                const type = EVENT_TYPE_LABELS[event.type] || EVENT_TYPE_LABELS.event
                return (
                  <div key={event.id} className="flex items-start justify-between gap-3 p-3 rounded-2xl min-w-0" style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
                    <div>
                      <p className="text-sm font-black" style={{ color: '#1a1a1a' }}>{event.title}</p>
                      <p className="text-xs font-bold mt-1" style={{ color: '#6b7280' }}>{formatDate(event.date, lang)}</p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black shrink-0" style={{ background: type.bg, color: type.color, border: `1.5px solid ${type.border}` }}>
                      {type.zh}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="p-4 sm:p-5 space-y-4 min-w-0" style={cardStyle}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-wrap gap-2 min-w-0">
              <TabButton active={activeTab === 'announcements'} onClick={() => setActiveTab('announcements')}>{lang === 'zh' ? '公告' : 'Announcements'}</TabButton>
              <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>{lang === 'zh' ? '动态' : 'Activity'}</TabButton>
            </div>
            {canPublishAnnouncements && (
              <button onClick={openNewAnnouncementModal} className="px-3 py-2 rounded-2xl text-xs font-black inline-flex items-center gap-1 self-start sm:self-auto" style={{ background: '#FFB3C6', color: 'white' }}>
                <Plus size={13} /> {lang === 'zh' ? '发布' : 'Post'}
              </button>
            )}
          </div>
          {activeTab === 'announcements' ? (
            announcements.length === 0 ? <EmptyText text={lang === 'zh' ? '暂无系统公告' : 'No announcements'} /> : (
              <div className="space-y-3">
                {announcements.map(item => (
                  <div key={item.id} className="p-3 rounded-2xl min-w-0" style={{ background: item.is_pinned ? '#fff7fb' : '#f0f7ff', border: `1.5px solid ${item.is_pinned ? '#FFB3C6' : '#e0f1ff'}` }}>
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <p className="text-sm font-black break-words min-w-0" style={{ color: '#1a1a1a' }}>{item.is_pinned ? '置顶 ' : ''}{item.title}</p>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <span className="px-2 py-1 rounded-full text-[10px] font-black" style={{ background: 'white', color: '#6db8ff', border: '1.5px solid #e0f1ff' }}>
                          {getAnnouncementTargetLabel(item)}
                        </span>
                        {canPublishAnnouncements && (
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => openEditAnnouncementModal(item)} className="p-1.5 rounded-full" style={{ background: 'white', color: '#6db8ff', border: '1.5px solid #e0f1ff' }} title={lang === 'zh' ? '修改公告' : 'Edit announcement'}>
                              <Pencil size={12} />
                            </button>
                            <button type="button" onClick={() => handleDeleteAnnouncement(item)} className="p-1.5 rounded-full" style={{ background: 'white', color: '#ef4444', border: '1.5px solid #fee2e2' }} title={lang === 'zh' ? '删除公告' : 'Delete announcement'}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <p className="text-xs font-semibold mt-2 break-words whitespace-pre-wrap" style={{ color: '#6b7280' }}>{item.body}</p>
                    <p className="text-[10px] font-bold mt-2" style={{ color: '#9ca3af' }}>{item.author?.name || '-'} · {new Date(item.created_at).toLocaleString()}</p>
                  </div>
                ))}
              </div>
            )
          ) : (
            activityFeed.length === 0 ? <EmptyText text={lang === 'zh' ? '暂无系统动态' : 'No activity'} /> : (
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

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {isLeaveManager && (
          <div className="p-4 sm:p-5 space-y-4 min-w-0" style={cardStyle}>
            <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#1a1a1a' }}>
              <ClipboardList size={18} color="#95CBFF" /> {lang === 'zh' ? '最新请假状态' : 'Recent Leave'}
            </h2>
            {leaveApplications.length === 0 || leaveApplications.every(item => (item.status || 'pending') !== 'pending') ? (
              <EmptyText text={lang === 'zh' ? '暂无请假历史' : 'No leave applications'} />
            ) : (
              <div className="space-y-3">
                {leaveApplications.map(leave => {
                  const status = STATUS_LABELS[leave.status || 'pending'] || STATUS_LABELS.pending
                  return (
                    <div key={leave.id} className="p-3 rounded-2xl" style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div>
                          <p className="text-sm font-black" style={{ color: '#1a1a1a' }}>{leave.applicant?.name || '-'}</p>
                          <p className="text-xs font-bold mt-1" style={{ color: '#6b7280' }}>{getLeaveTypeText(leave, lang)} · {formatDate(leave.leave_date, lang)} · 1 天</p>
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-black" style={{ background: status.bg, color: status.color, border: `1.5px solid ${status.border}` }}>
                          {status.zh}
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

        <div className="p-4 sm:p-5 space-y-4 min-w-0" style={cardStyle}>
          <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#1a1a1a' }}>
            <Cake size={18} color="#FFB3C6" /> {lang === 'zh' ? '本月生日' : 'Birthdays This Month'}
          </h2>
          {birthdays.length === 0 ? (
            <EmptyText text={lang === 'zh' ? '本月暂无生日' : 'No birthdays this month'} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {birthdays.map(user => {
                const birthdayKey = user.birthday?.slice(5)
                const isToday = birthdayKey === todayKey.slice(5)
                return (
                  <div key={user.id} className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 rounded-2xl" style={{ background: isToday ? '#fff7fb' : '#f0f7ff', border: `1.5px solid ${isToday ? '#FFB3C6' : '#e0f1ff'}` }}>
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black shrink-0" style={{ background: 'white', color: '#6db8ff' }}>
                      {user.name?.slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black" style={{ color: '#1a1a1a' }}>{isToday ? '🎂 ' : ''}{user.name}</p>
                      <p className="text-xs font-bold" style={{ color: '#6b7280' }}>{formatDate(user.birthday, lang)}</p>
                    </div>
                    {user.id !== currentUserProfile?.id && (
                      <button
                        type="button"
                        onClick={() => openBirthdayWish(user, isToday)}
                        className="px-3 py-1.5 rounded-2xl text-[10px] font-black shrink-0 ml-auto"
                        style={{ background: isToday ? '#FFB3C6' : '#95CBFF', color: 'white' }}>
                        {lang === 'zh' ? '写祝福' : 'Send Wish'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </section>

      <section className="p-4 sm:p-5 min-w-0" style={cardStyle}>
        <h2 className="font-black text-base flex items-center gap-2 mb-4" style={{ color: '#1a1a1a' }}>
          <TrendingUp size={18} color="#95CBFF" /> {lang === 'zh' ? '快捷入口' : 'Quick Access'}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {canCreateTasks && <QuickButton icon={<Plus size={16} />} label={lang === 'zh' ? '新建任务' : 'New Task'} onClick={() => navigate('/tasks')} />}
          <QuickButton icon={<ClipboardList size={16} />} label={lang === 'zh' ? '提交请假' : 'Submit Leave'} onClick={() => navigate('/leave')} />
          <QuickButton icon={<Calendar size={16} />} label={lang === 'zh' ? '查看行事历' : 'View Calendar'} onClick={() => navigate('/calendar')} />
          {isLeaveManager && <QuickButton icon={<CheckSquare size={16} />} label={lang === 'zh' ? '检查请假' : 'Review Leave'} onClick={() => navigate('/leave')} />}
          {canManageMembers && <QuickButton icon={<Users size={16} />} label={lang === 'zh' ? '管理成员' : 'Manage Members'} onClick={() => navigate('/members')} />}
          {canPublishAnnouncements && <QuickButton icon={<Megaphone size={16} />} label={lang === 'zh' ? '发布公告' : 'Post Announcement'} onClick={openNewAnnouncementModal} />}
        </div>
      </section>

      {showAnnouncementModal && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" style={{ background: 'rgba(149,203,255,0.18)', backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handlePublishAnnouncement} className="w-full max-w-lg p-4 sm:p-6 my-4 space-y-4 max-h-[92vh] overflow-y-auto" style={cardStyle}>
            <h3 className="font-black text-lg flex items-center gap-2" style={{ color: '#1a1a1a' }}>
              <Megaphone size={18} color="#95CBFF" /> {editingAnnouncement ? (lang === 'zh' ? '修改公告' : 'Edit Announcement') : (lang === 'zh' ? '发布公告' : 'Post Announcement')}
            </h3>
            <input required value={announcementForm.title} onChange={e => setAnnouncementForm(prev => ({ ...prev, title: e.target.value }))}             placeholder={lang === 'zh' ? '公告标题' : 'Announcement title'} className="w-full text-sm" style={inputStyle} />
            <textarea required value={announcementForm.body} onChange={e => setAnnouncementForm(prev => ({ ...prev, body: e.target.value }))}             placeholder={lang === 'zh' ? '公告内容' : 'Announcement content'} rows={5} className="w-full text-sm resize-none" style={inputStyle} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>{lang === 'zh' ? '发布对象' : 'Target'}</label>
                <select
                  value={announcementForm.target_type}
                  onChange={e => setAnnouncementForm(prev => ({ ...prev, target_type: e.target.value, target_team_id: '' }))}
                  className="w-full text-sm"
                  style={inputStyle}>
                  <option value="all">{lang === 'zh' ? '全部成员' : 'All Members'}</option>
                  <option value="board">{lang === 'zh' ? '仅执委层' : 'Executive Level Only'}</option>
                  <option value="committee">{lang === 'zh' ? '指定筹委团' : 'Specific Committee'}</option>
                </select>
              </div>
              {announcementForm.target_type === 'committee' && (
                <div>
                   <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>{lang === 'zh' ? '筹委团' : 'Committee'}</label>
                  <select
                    required
                    value={announcementForm.target_team_id}
                    onChange={e => setAnnouncementForm(prev => ({ ...prev, target_team_id: e.target.value }))}
                    className="w-full text-sm"
                    style={inputStyle}>
                    <option value="">{lang === 'zh' ? '请选择筹委团' : 'Select committee'}</option>
                    {committeeTeams.map(team => (
                      <option key={team.id} value={team.id}>{team.name} ({team.session})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 text-xs font-bold" style={{ color: '#6b7280' }}>
              <input type="checkbox" checked={announcementForm.is_pinned} onChange={e => setAnnouncementForm(prev => ({ ...prev, is_pinned: e.target.checked }))} />
              {lang === 'zh' ? '置顶公告' : 'Pin announcement'}
            </label>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={resetAnnouncementModal} className="px-4 py-2 rounded-2xl text-sm font-bold" style={{ background: '#f0f7ff', color: '#6b7280' }}>{lang === 'zh' ? '取消' : 'Cancel'}</button>
              <button disabled={announcementSubmitting} className="px-4 py-2 rounded-2xl text-sm font-black flex items-center gap-2" style={{ background: '#95CBFF', color: 'white' }}>
                {announcementSubmitting ? <Loader size={14} className="animate-spin" /> : <Send size={14} />} {editingAnnouncement ? (lang === 'zh' ? '保存修改' : 'Save') : (lang === 'zh' ? '发布' : 'Post')}
              </button>
            </div>
          </form>
        </div>
      )}

      {birthdayWishTarget && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto" style={{ background: 'rgba(149,203,255,0.18)', backdropFilter: 'blur(4px)' }}>
          <form onSubmit={handleSendBirthdayWish} className="w-full max-w-lg p-4 sm:p-6 my-4 space-y-4 max-h-[92vh] overflow-y-auto" style={cardStyle}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="font-black text-lg flex items-center gap-2" style={{ color: '#1a1a1a' }}>
                <Cake size={18} color="#FFB3C6" /> {lang === 'zh' ? `写给 ${birthdayWishTarget.name} 的生日祝福` : `Birthday wish for ${birthdayWishTarget.name}`}
              </h3>
              <button type="button" onClick={() => setBirthdayWishTarget(null)} className="p-2 rounded-full" style={{ background: '#f0f7ff', color: '#6b7280' }}>
                <X size={15} />
              </button>
            </div>
            <textarea
              required
              value={birthdayWishText}
              onChange={e => setBirthdayWishText(e.target.value)}
              placeholder={lang === 'zh' ? '写一句祝福语...' : 'Write a birthday wish...'}
              rows={5}
              className="w-full text-sm resize-none"
              style={inputStyle}
            />
            <p className="text-xs font-semibold" style={{ color: '#6b7280' }}>
              {lang === 'zh' ? '发送后，祝福会出现在对方右上角的站内通知里。' : 'The wish will appear in their in-app notifications.'}
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setBirthdayWishTarget(null)} className="px-4 py-2 rounded-2xl text-sm font-bold" style={{ background: '#f0f7ff', color: '#6b7280' }}>{lang === 'zh' ? '取消' : 'Cancel'}</button>
              <button disabled={birthdayWishSubmitting} className="px-4 py-2 rounded-2xl text-sm font-black flex items-center gap-2" style={{ background: '#95CBFF', color: 'white' }}>
                {birthdayWishSubmitting ? <Loader size={14} className="animate-spin" /> : <Send size={14} />} {lang === 'zh' ? '发送祝福' : 'Send Wish'}
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
