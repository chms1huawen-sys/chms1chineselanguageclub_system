import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import {
  LayoutDashboard, CheckSquare, Calendar, Users,
  ArrowUpRight, AlertTriangle, TrendingUp, Clock,
  Loader, HelpCircle, ChevronRight, FolderGit, ExternalLink,
  CheckCircle2
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

const ROLE_OPTIONS = [
  { value: 'convener_teacher', zh: '召集老师', en: 'Convener Teacher', bg: '#ffe4ec', color: '#be185d', border: '#FFB3C6' },
  { value: 'advisor_teacher', zh: '指导老师', en: 'Advisor Teacher', bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' },
  { value: 'chairperson', zh: '主席', en: 'Chairperson', bg: '#e0f1ff', color: '#2E86C1', border: '#95CBFF' },
  { value: 'vice_chairperson', zh: '副主席', en: 'Vice Chairperson', bg: '#ede9fe', color: '#7c3aed', border: '#c4b5fd' },
  { value: 'secretary', zh: '正文书', en: 'Secretary', bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
  { value: 'vice_secretary', zh: '副文书', en: 'Vice Secretary', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  { value: 'treasurer', zh: '正财政', en: 'Treasurer', bg: '#fef9c3', color: '#ca8a04', border: '#fde047' },
  { value: 'vice_treasurer', zh: '副财政', en: 'Vice Treasurer', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  { value: 'general_affairs', zh: '正总务', en: 'General Affairs', bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
  { value: 'vice_general_affairs', zh: '副总务', en: 'Vice General Affairs', bg: '#f0f9ff', color: '#0284c7', border: '#bae6fd' },
  { value: 'activity_lead', zh: '活动组组长', en: 'Activity Lead', bg: '#fef3c7', color: '#d97706', border: '#fcd34d' },
  { value: 'vice_activity_lead', zh: '活动组副组长', en: 'Vice Activity Lead', bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  { value: 'activity_member', zh: '活动组组员', en: 'Activity Member', bg: '#f5f5f5', color: '#6b7280', border: '#d1d5db' },
  { value: 'media_lead', zh: '媒体组组长', en: 'Media Lead', bg: '#fce7f3', color: '#db2777', border: '#f9a8d4' },
  { value: 'vice_media_lead', zh: '媒体组副组长', en: 'Vice Media Lead', bg: '#fdf2f8', color: '#be185d', border: '#fbcfe8' },
  { value: 'custom', zh: '自定义', en: 'Custom', bg: '#f3f4f6', color: '#4b5563', border: '#d1d5db' }
]

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map(role => [role.value, role]))
const getUserRoleLabel = (user) => {
  const base = ROLE_LABELS[user?.role] || { zh: user?.role, en: user?.role }
  if (user?.role === 'custom' && user?.custom_role_label) return { ...base, zh: user.custom_role_label, en: user.custom_role_label }
  return base
}
const BOARD_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor']
const TASK_MANAGER_ROLES = [...BOARD_MANAGER_ROLES, 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead']
// ─── Exec Google Drive Card ─────────────────────────────────────────────────
// Stored in the `events` table as a special placeholder with title 'EXEC_DRIVE_LINK'.
// Only advisor / chairperson can write; everyone can read. Persists across session changes.
function ExecDriveCard({ isAdmin, lang }) {
  const [driveLink, setDriveLink] = useState('')
  const [eventId, setEventId] = useState(null)
  const [teamId, setTeamId] = useState(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => { fetchLink() }, [])

  const fetchLink = async () => {
    try {
      const { data: boardData } = await supabase
        .from('teams')
        .select('id')
        .eq('type', 'board')
        .eq('is_archived', false)
        .limit(1)
        .maybeSingle()
      setTeamId(boardData?.id || null)

      const { data } = await supabase
        .from('events')
        .select('id, drive_link')
        .eq('title', 'EXEC_DRIVE_LINK')
        .limit(1)
      if (data && data.length > 0) {
        setEventId(data[0].id)
        setDriveLink(data[0].drive_link || '')
        setDraft(data[0].drive_link || '')
      }
    } catch (e) {
      console.error('ExecDriveCard fetch:', e)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (!eventId && !teamId) {
        throw new Error('No active board team found for executive Drive link.')
      }

      if (eventId) {
        const { error } = await supabase.from('events').update({ drive_link: draft }).eq('id', eventId)
        if (error) throw error
      } else {
        const { data, error } = await supabase.from('events').insert({
          title: 'EXEC_DRIVE_LINK',
          date: '2000-01-01',   // sentinel date — never rendered on calendar
          type: 'event',
          color: 'blue',
          team_id: teamId,
          drive_link: draft
        }).select().single()
        if (error) throw error
        if (data) setEventId(data.id)
      }
      setDriveLink(draft)
      setSaved(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      console.error('ExecDriveCard save:', e)
    } finally {
      setSaving(false)
    }
  }

  const label = lang === 'zh'
    ? '📁 执委团 Google Drive 共享目录'
    : '📁 Executive Committee Google Drive Folder'

  return (
    <div className="p-5 rounded-3xl text-left"
      style={{ background: 'white', border: '1.5px solid #e0f1ff', boxShadow: '0 4px 16px rgba(149,203,255,0.06)' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <FolderGit size={18} style={{ color: '#95CBFF' }} />
          <h3 className="font-black text-sm text-gray-800">{label}</h3>
        </div>
        {isAdmin && !editing && (
          <button
            onClick={() => { setDraft(driveLink); setEditing(true) }}
            className="text-[10px] font-black px-3 py-1 rounded-xl cursor-pointer transition"
            style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6db8ff' }}
          >
            {lang === 'zh' ? '编辑' : 'Edit'}
          </button>
        )}
      </div>

      {isAdmin && editing ? (
        <div className="space-y-2">
          <input
            type="url"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="https://drive.google.com/..."
            className="w-full px-3.5 py-2.5 rounded-2xl text-xs outline-none transition"
            style={{ background: '#f0f7ff', border: '1.5px solid #95CBFF', color: '#1a1a1a', fontWeight: 700 }}
            autoFocus
          />
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setEditing(false)}
              className="px-4 py-2 rounded-2xl text-xs font-bold cursor-pointer"
              style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}
            >
              {lang === 'zh' ? '取消' : 'Cancel'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-2xl text-xs font-black cursor-pointer text-white"
              style={{ background: '#95CBFF', opacity: saving ? 0.7 : 1 }}
            >
              {saved ? '✓' : saving ? '...' : (lang === 'zh' ? '保存' : 'Save')}
            </button>
          </div>
        </div>
      ) : driveLink ? (
        <a
          href={driveLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-black text-blue-600 bg-blue-50 px-3.5 py-2 rounded-2xl border border-blue-200 hover:bg-blue-100 transition cursor-pointer"
        >
          {lang === 'zh' ? '点击打开 Google Drive 目录' : 'Open Google Drive Folder'}
          <ExternalLink size={12} />
        </a>
      ) : (
        <p className="text-xs font-semibold text-gray-400 border border-dashed border-gray-200 rounded-2xl p-3 bg-gray-50/50">
          {isAdmin
            ? (lang === 'zh' ? '点击「编辑」设置执委团共享文件夹链接。' : 'Click "Edit" to set the shared folder link.')
            : (lang === 'zh' ? '🔒 召集老师、指导老师、主席或副主席尚未设置执委团共享文件夹。' : '🔒 Shared folder not yet set by Convener Teacher, Advisor Teacher, Chairperson or Vice Chairperson.')}
        </p>
      )}
    </div>
  )
}
// ────────────────────────────────────────────────────────────────────────────

export default function Dashboard({ currentUserProfile, lang = 'zh', onShowTutorial }) {
  const navigate = useNavigate()
  const [statsData, setStatsData] = useState({ pending: 0, events: 0, members: 0, needHelp: 0 })
  const [myTasks, setMyTasks] = useState([])
  const [memberStats, setMemberStats] = useState([])
  const [recentDone, setRecentDone] = useState([])   // recently completed tasks for updates feed
  const [loading, setLoading] = useState(true)

  const isAdmin = BOARD_MANAGER_ROLES.includes(currentUserProfile?.role)

  const isPowerUser = TASK_MANAGER_ROLES.includes(currentUserProfile?.role)

  // Initial load + realtime subscription
  useEffect(() => {
    if (!currentUserProfile) return
    fetchDashboardData()

    const channel = supabase
      .channel('dashboard-tasks-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchDashboardData()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUserProfile])

  const fetchDashboardData = async () => {
    setLoading(true)
    try {
      const today = new Date()
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
      const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7)
      const weekEndStr = `${weekEnd.getFullYear()}-${String(weekEnd.getMonth()+1).padStart(2,'0')}-${String(weekEnd.getDate()).padStart(2,'0')}`

      // 1. My pending tasks
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('*')
        .contains('assigned_to', [currentUserProfile.id])

      const pending = (allTasks || []).filter(t => t.status !== 'completed').length
      const needHelp = (allTasks || []).filter(t => t.status === 'need_help').length
      setMyTasks((allTasks || []).filter(t => t.status !== 'completed').slice(0, 5))

      // 2. Upcoming events this week — exclude Drive binder placeholders
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .gte('date', todayStr)
        .lte('date', weekEndStr)
        .neq('title', 'EXEC_DRIVE_LINK')
        .not('title', 'ilike', 'Google Drive 文件夹%')

      // 3. Active members
      const { count: membersCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true)

      setStatsData({
        pending,
        events: (events || []).length,
        members: membersCount || 0,
        needHelp
      })

      // 4. Recently completed tasks (last 10) for updates feed
      const { data: doneTasks } = await supabase
        .from('tasks')
        .select('id, title, updated_at')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(6)
      setRecentDone(doneTasks || [])

      // 5. Power users: member analytics
      if (isPowerUser) {
        const { data: activeUsers } = await supabase
          .from('users').select('id, name, role, custom_role_label').eq('is_active', true).not('role', 'in', '(convener_teacher,advisor_teacher,advisor)')
        const { data: allTasksData } = await supabase
          .from('tasks').select('assigned_to, status, due_date')

        const now = new Date()
        const userStats = (activeUsers || []).map(user => {
          const userTasks = (allTasksData || []).filter(t =>
            Array.isArray(t.assigned_to) && t.assigned_to.includes(user.id))
          const total = userTasks.length
          const completed = userTasks.filter(t => t.status === 'completed').length
          const overdue = userTasks.filter(t =>
            t.due_date && new Date(t.due_date) < now && t.status !== 'completed').length
          const needHelpCount = userTasks.filter(t => t.status === 'need_help').length
          const rate = total > 0 ? Math.round((completed / total) * 100) : null
          return { ...user, total, completed, overdue, needHelp: needHelpCount, rate }
        }).filter(u => u.total > 0).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))
        setMemberStats(userStats)
      }
    } catch (err) {
      console.error('Dashboard fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const isOverdue = task => task.due_date && new Date(task.due_date) < new Date()

  const T = {
    zh: {
      greeting: `你好，${currentUserProfile?.name || '华文学会成员'}！`,
      subtitle: '欢迎使用一中华文学会系统。你当前拥有的身份是：',
      system: '学会内部系统已激活',
      tasks_desc: '所有分配给你的任务将在下方展示，请及时更新进度状态。',
      pending: '待完成任务', events: '本周近期活动', members: '活跃干部总数',
      my_tasks: '我的任务 My Tasks', view_all: '查看看板',
      no_tasks: '目前暂无分配给你的待办任务。',
      overdue_badge: '已逾期',
      member_stats: '干部执行力报表 Committee Analytics',
      total: '任务总数', done: '完成率', overdue_col: '逾期次数', help_col: '需协助',
      no_stats: '暂无任务数据，待任务指派后自动生成报表。',
      updates: '系统动态 Updates',
      tutorial_btn: '重看使用引导',
      task_done_label: '任务完成',
    },
    en: {
      greeting: `Hello, ${currentUserProfile?.name || 'CLS Member'}!`,
      subtitle: 'Welcome to the CLS System. Your current role is:',
      system: 'CLS Internal System Active',
      tasks_desc: 'All tasks assigned to you are shown below. Please update your progress status.',
      pending: 'Pending Tasks', events: 'Events This Week', members: 'Active Members',
      my_tasks: 'My Tasks', view_all: 'View Board',
      no_tasks: 'No pending tasks assigned to you.',
      overdue_badge: 'Overdue',
      member_stats: 'Committee Performance Analytics',
      total: 'Total', done: 'Done %', overdue_col: 'Overdue', help_col: 'Need Help',
      no_stats: 'No task data yet. Reports auto-generate once tasks are assigned.',
      updates: 'System Updates',
      tutorial_btn: 'View Tutorial Again',
      task_done_label: 'Task Completed',
    }
  }
  const t = T[lang] || T.zh
  const roleLabel = currentUserProfile
    ? getUserRoleLabel(currentUserProfile)
    : null

  const statsCards = [
    { label: t.pending, value: statsData.pending, icon: <CheckSquare size={20} color="#95CBFF" />, sub: `${lang === 'zh' ? '需协助' : 'Need help'}: ${statsData.needHelp}`, accent: '#95CBFF', onClick: () => navigate('/tasks') },
    { label: t.events, value: statsData.events, icon: <Calendar size={20} color="#4ade80" />, sub: lang === 'zh' ? '未来7天' : 'Next 7 days', accent: '#4ade80', onClick: () => navigate('/calendar') },
    { label: t.members, value: statsData.members, icon: <Users size={20} color="#FFB3C6" />, sub: lang === 'zh' ? '已激活账号' : 'Active accounts', accent: '#FFB3C6', onClick: () => navigate('/members') },
  ]

  // Static system announcements
  const systemAnnouncements = [
    {
      date: '2026-05-25',
      title: lang === 'zh' ? '系统第三阶段全面上线' : 'Phase 3 Launch Complete',
      body: lang === 'zh'
        ? '新增月历行事历、干部执行力报表、中英双语切换与首次登录使用引导。'
        : 'New: monthly calendar, member analytics, bilingual UI and onboarding tutorial.'
    },
    {
      date: '2026-05-24',
      title: lang === 'zh' ? '第二阶段任务与筹委功能上线' : 'Phase 2 Tasks & Committees Live',
      body: lang === 'zh'
        ? '任务看板、筹委团管理、换届归档与历年名册全部上线。'
        : 'Task kanban, event committees, handover & historical records now available.'
    },
  ]

  return (
    <div className="space-y-8 animate-[fadeIn_0.4s_ease]" style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* ── Welcome Banner ──────────────────────────────── */}
      <div className="relative p-6 sm:p-8 rounded-3xl overflow-hidden"
        style={{ background: '#95CBFF', boxShadow: '0 4px 24px rgba(149,203,255,0.35)' }}>
        <div className="absolute top-[-20px] right-[-20px] w-32 h-32 rounded-full pointer-events-none opacity-30" style={{ background: '#FFB3C6' }} />
        <div className="absolute bottom-[-10px] right-[80px] w-20 h-20 rounded-full pointer-events-none opacity-20" style={{ background: '#FFB3C6' }} />
        <svg className="absolute right-[130px] bottom-2 opacity-20 pointer-events-none" width="80" height="80" viewBox="0 0 80 80" fill="none">
          <polygon points="40,6 48,28 72,28 54,44 62,66 40,52 18,66 26,44 8,28 32,28" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="none" />
          <circle cx="12" cy="12" r="4" stroke="white" strokeWidth="1.5" fill="none" />
          <circle cx="68" cy="68" r="3" stroke="white" strokeWidth="1.5" fill="none" />
        </svg>

        <div className="relative z-10 max-w-2xl space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black"
            style={{ background: 'rgba(255,255,255,0.25)', color: 'white' }}>
            <LayoutDashboard size={12} />
            {t.system}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black pt-1" style={{ color: 'white' }}>{t.greeting}</h1>
          <p className="text-sm sm:text-base font-semibold leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
            {t.subtitle}
            {roleLabel && (
              <strong className="font-black mx-1" style={{ color: 'white' }}>
                {lang === 'zh' ? roleLabel.zh : roleLabel.en}
              </strong>
            )}
            。{t.tasks_desc}
          </p>
        </div>

        {onShowTutorial && (
          <button
            onClick={onShowTutorial}
            className="absolute top-4 right-4 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-black transition cursor-pointer"
            style={{ background: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            <HelpCircle size={12} /> {t.tutorial_btn}
          </button>
        )}
      </div>

      {/* ── Stats Cards ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statsCards.map((s, i) => (
          <div key={i} onClick={s.onClick}
            className="relative p-6 rounded-3xl overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg cursor-pointer"
            style={{ background: 'white', boxShadow: '0 4px 20px rgba(149,203,255,0.18)', border: '1.5px solid #e0f1ff' }}>
            <div className="absolute top-0 left-0 right-0 h-1 rounded-t-3xl" style={{ background: s.accent }} />
            <div className="absolute bottom-[-12px] right-[-12px] w-16 h-16 rounded-full opacity-15 pointer-events-none" style={{ background: s.accent }} />
            <div className="flex items-start justify-between">
              <div className="space-y-3">
                <span className="text-xs font-black uppercase tracking-wider block" style={{ color: '#6b7280' }}>{s.label}</span>
                <span className="text-3xl font-black block" style={{ color: '#1a1a1a' }}>{loading ? '—' : s.value}</span>
                <span className="text-xs font-semibold block" style={{ color: '#6b7280' }}>{s.sub}</span>
              </div>
              <div className="p-3 rounded-2xl" style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
                {s.icon}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Exec Drive Card ─────────────────────────────── */}
      <ExecDriveCard isAdmin={isAdmin} lang={lang} />

      {/* ── Main Body ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* My Tasks Panel */}
        <div className="lg:col-span-2 p-6 rounded-3xl space-y-4"
          style={{ background: 'white', boxShadow: '0 4px 20px rgba(149,203,255,0.15)', border: '1.5px solid #e0f1ff' }}>
          <div className="flex items-center justify-between pb-3" style={{ borderBottom: '1.5px solid #f0f7ff' }}>
            <h3 className="font-black text-base" style={{ color: '#1a1a1a' }}>{t.my_tasks}</h3>
            <button onClick={() => navigate('/tasks')}
              className="text-xs font-bold flex items-center gap-1 transition hover:opacity-70 cursor-pointer"
              style={{ color: '#6db8ff' }}>
              {t.view_all} <ArrowUpRight size={12} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader size={20} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
              <span className="text-xs font-bold">{lang === 'zh' ? '加载中...' : 'Loading...'}</span>
            </div>
          ) : myTasks.length === 0 ? (
            <div className="py-12 text-center text-sm font-semibold" style={{ color: '#6b7280' }}>{t.no_tasks}</div>
          ) : (
            <div className="space-y-3">
              {myTasks.map(task => {
                const overdue = isOverdue(task)
                const statusColors = {
                  pending: { bg: '#eff6ff', color: '#3b82f6' },
                  in_progress: { bg: '#eef2ff', color: '#6366f1' },
                  need_help: { bg: '#fffbeb', color: '#f59e0b' },
                  completed: { bg: '#ecfdf5', color: '#10b981' }
                }
                const sc = statusColors[task.status] || statusColors.pending
                return (
                  <div key={task.id} onClick={() => navigate('/tasks')}
                    className="flex items-center justify-between gap-4 p-4 rounded-2xl border cursor-pointer hover:bg-[#f8fbff] transition"
                    style={{ borderColor: overdue ? '#fca5a5' : '#e0f1ff', borderWidth: overdue ? '2px' : '1.5px' }}>
                    <div className="space-y-1 flex-1 min-w-0">
                      <p className="text-sm font-black text-gray-800 truncate">{task.title}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full"
                          style={{ background: sc.bg, color: sc.color }}>
                          {task.status === 'pending' ? (lang === 'zh' ? '待开始' : 'Pending')
                            : task.status === 'in_progress' ? (lang === 'zh' ? '进行中' : 'In Progress')
                            : task.status === 'need_help' ? (lang === 'zh' ? '需协助' : 'Need Help')
                            : (lang === 'zh' ? '已完成' : 'Completed')}
                        </span>
                        {task.due_date && (
                          <span className="text-[9px] font-bold text-gray-400 flex items-center gap-0.5">
                            <Clock size={9} />
                            {new Date(task.due_date).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {overdue && (
                          <span className="text-[9px] font-black text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full border border-red-200 animate-pulse flex items-center gap-0.5">
                            <AlertTriangle size={9} /> {t.overdue_badge}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} className="text-gray-300 shrink-0" />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* System Updates panel */}
        <div className="space-y-4 p-6 rounded-3xl"
          style={{ background: 'white', boxShadow: '0 4px 20px rgba(149,203,255,0.15)', border: '1.5px solid #e0f1ff' }}>
          <div className="pb-3" style={{ borderBottom: '1.5px solid #f0f7ff' }}>
            <h3 className="font-black text-base" style={{ color: '#1a1a1a' }}>{t.updates}</h3>
          </div>
          <div className="space-y-3 max-h-[380px] overflow-y-auto pr-0.5">

            {/* Dynamic: recently completed tasks */}
            {recentDone.map(task => (
              <div key={`done-${task.id}`} className="p-3.5 rounded-2xl text-xs leading-relaxed space-y-1"
                style={{ background: '#f0fdf4', border: '1.5px solid #a7f3d0' }}>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={10} style={{ color: '#10b981' }} />
                  <span className="text-[10px] font-black" style={{ color: '#10b981' }}>
                    {task.updated_at
                      ? new Date(task.updated_at).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })
                      : '—'}
                  </span>
                  <span className="text-[10px] font-bold text-green-600">
                    {t.task_done_label}
                  </span>
                </div>
                <p className="font-black truncate" style={{ color: '#065f46' }}>{task.title}</p>
              </div>
            ))}

            {/* Static system announcements */}
            {systemAnnouncements.map((u, i) => (
              <div key={`ann-${i}`} className="p-3.5 rounded-2xl text-xs leading-relaxed space-y-1"
                style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
                <span className="text-[10px] font-black" style={{ color: '#6db8ff' }}>{u.date}</span>
                <p className="font-black" style={{ color: '#1a1a1a' }}>{u.title}</p>
                <p className="font-semibold" style={{ color: '#6b7280' }}>{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Member Performance Report (Power Users Only) ── */}
      {isPowerUser && (
        <div className="p-6 rounded-3xl space-y-5"
          style={{ background: 'white', boxShadow: '0 4px 20px rgba(149,203,255,0.15)', border: '1.5px solid #e0f1ff' }}>
          <div className="flex items-center gap-2 pb-3" style={{ borderBottom: '1.5px solid #f0f7ff' }}>
            <TrendingUp size={18} style={{ color: '#95CBFF' }} />
            <h3 className="font-black text-base" style={{ color: '#1a1a1a' }}>{t.member_stats}</h3>
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader size={24} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
            </div>
          ) : memberStats.length === 0 ? (
            <p className="text-xs font-semibold text-gray-400 text-center py-8">{t.no_stats}</p>
          ) : (
            <div className="space-y-4">
              {memberStats.map(m => {
                const rate = m.rate ?? 0
                const barColor = rate >= 80 ? '#10b981' : rate >= 50 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={m.id} className="space-y-2">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center font-black text-[10px] shrink-0"
                          style={{ background: '#f0f7ff', color: '#6db8ff', border: '1.5px solid #e0f1ff' }}>
                          {m.name.slice(0, 2)}
                        </div>
                        <div>
                          <span className="text-xs font-black text-gray-800">{m.name}</span>
                          <span className="text-[9px] font-bold text-gray-400 ml-2">
                            {getUserRoleLabel(m)?.[lang] || m.role}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-[10px] font-bold text-gray-500 shrink-0 flex-wrap">
                        <span>{t.total}: <strong className="text-gray-700">{m.total}</strong></span>
                        <span style={{ color: barColor }}>{m.rate !== null ? `${m.rate}%` : '—'}</span>
                        {m.overdue > 0 && (
                          <span className="text-red-500 flex items-center gap-0.5">
                            <AlertTriangle size={9} /> {m.overdue}
                          </span>
                        )}
                        {m.needHelp > 0 && (
                          <span className="text-amber-500">{t.help_col}: {m.needHelp}</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: '#f0f7ff', border: '1px solid #e0f1ff' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${rate}%`, background: barColor }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div>
  )
}