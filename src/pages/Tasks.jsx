import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import {
  CheckSquare,
  Plus,
  Calendar,
  AlertCircle,
  MessageSquare,
  Clock,
  Trash2,
  Edit2,
  User,
  Users,
  ChevronDown,
  Loader,
  ArrowRight
} from 'lucide-react'

const PRIORITY_LABELS = {
  high: { zh: '高', en: 'High', bg: '#ffe4ec', color: '#dc2626', border: '#fca5a5' },
  medium: { zh: '中', en: 'Medium', bg: '#fef9c3', color: '#ca8a04', border: '#fde047' },
  low: { zh: '低', en: 'Low', bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' }
}

const STATUS_COLUMNS = [
  { id: 'pending', title: '待开始 Pending', color: '#3b82f6', bg: '#eff6ff' },
  { id: 'in_progress', title: '进行中 In Progress', color: '#6366f1', bg: '#eef2ff' },
  { id: 'need_help', title: '需协助 Need Help', color: '#f59e0b', bg: '#fffbeb' },
  { id: 'completed', title: '已完成 Completed', color: '#10b981', bg: '#ecfdf5' }
]

const TASK_ROLE_LABELS = {
  convener_teacher: '召集老师',
  advisor_teacher: '指导老师',
  chairperson: '主席',
  vice_chairperson: '副主席',
  secretary: '正文书',
  vice_secretary: '副文书',
  treasurer: '正财政',
  vice_treasurer: '副财政',
  general_affairs: '正总务',
  vice_general_affairs: '副总务',
  activity_lead: '活动组组长',
  vice_activity_lead: '活动组副组长',
  activity_member: '活动组组员',
  media_lead: '媒体组组长',
  vice_media_lead: '媒体组副组长',
  custom: '自定义',
  advisor: '指导老师',
  committee: '自定义',
  event_member: '活动组组员'
}
const getTaskUserRoleLabel = (user) => {
  if (user?.role === 'custom' && user.custom_role_label) return user.custom_role_label
  return TASK_ROLE_LABELS[user?.role] || '干部'
}
const BOARD_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor']
const TASK_MANAGER_ROLES = [...BOARD_MANAGER_ROLES, 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead']

const inputStyle = {
  background: '#f0f7ff',
  border: '1.5px solid #95CBFF',
  color: '#1a1a1a',
  borderRadius: 16,
  fontFamily: "'Nunito', sans-serif",
  fontWeight: 700,
  padding: '10px 14px'
}

export default function Tasks({ currentUserProfile }) {
  const [tasks, setTasks] = useState([])
  const [teams, setTeams] = useState([])
  const [activeTeam, setActiveTeam] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [priorityFilter, setPriorityFilter] = useState('all')

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [selectedTask, setSelectedTask] = useState(null)
  const [comments, setComments] = useState([])
  const [newCommentText, setNewCommentText] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  // Task form state
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    assigned_to: [],
    due_date: '',
    priority: 'medium',
    status: 'pending',
    repeat_enabled: false,
    repeat_weekday: '4',
    repeat_time: '19:00',
    repeat_count: 4
  })
  const [formSubmitting, setFormSubmitting] = useState(false)

  const isPowerUser = TASK_MANAGER_ROLES.includes(currentUserProfile?.role)

  useEffect(() => {
    fetchInitialData()
  }, [])

  useEffect(() => {
    if (!activeTeam) return

    fetchTasks(activeTeam.id)

    // Subscribe to task changes for realtime Kanban sync
    const tasksChannel = supabase
      .channel(`tasks-team-${activeTeam.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks', filter: `team_id=eq.${activeTeam.id}` },
        () => {
          fetchTasks(activeTeam.id)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(tasksChannel)
    }
  }, [activeTeam])

  const fetchInitialData = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      // 1. Fetch active teams (both board and event)
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .eq('is_archived', false)
        .order('created_at', { ascending: false })

      if (teamsError) throw teamsError

      setTeams(teamsData || [])

      if (teamsData && teamsData.length > 0) {
        // Set the active team to the first board type, or just the first available team
        const defaultTeam = teamsData.find(t => t.type === 'board') || teamsData[0]
        setActiveTeam(defaultTeam)
      } else {
        // If there are absolutely no teams, we can offer to create a default board session
        setActiveTeam(null)
      }

      // 2. Fetch users to assign tasks
      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })

      if (usersError) throw usersError
      setUsers(usersData || [])

    } catch (err) {
      setErrorMsg(err.message || '获取初始化数据失败 Failed to load initial data.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDefaultSession = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const year = new Date().getFullYear()
      const sessionString = `${year}/${year + 1}`
      const { data, error } = await supabase
        .from('teams')
        .insert({
          name: `第 ${year - 1970} 届执委团`,
          type: 'board',
          session: sessionString,
          is_archived: false,
          start_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single()

      if (error) throw error
      setSuccessMsg(`成功初始化 ${sessionString} 届执委团！`)
      fetchInitialData()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }

  const fetchTasks = async (teamId) => {
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('team_id', teamId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setTasks(data || [])
      await createDueReminderNotifications(data || [])
    } catch (err) {
      setErrorMsg(err.message || '获取任务列表失败 Failed to load tasks.')
    }
  }


  const formatTaskDueText = (dueDate) => (
    dueDate
      ? new Date(dueDate).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '未设置截止日期'
  )

  const getStatusLabel = (status) => ({
    pending: '待开始',
    in_progress: '进行中',
    need_help: '需协助',
    completed: '已完成'
  }[status] || status)

  const insertNotifications = async (notifications, options = {}) => {
    const rows = (notifications || []).filter(Boolean)
    if (rows.length === 0) return

    const query = options.dedupe
      ? supabase.from('notifications').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true })
      : supabase.from('notifications').insert(rows)

    const { error } = await query
    if (error) console.error('Create notifications failed:', error.message)
  }

  const createTaskNotifications = async (task) => {
    if (!task || !Array.isArray(task.assigned_to) || task.assigned_to.length === 0) return
    const recipients = [...new Set(task.assigned_to)].filter(Boolean)
    if (recipients.length === 0) return

    const dueText = formatTaskDueText(task.due_date)

    await insertNotifications(recipients.map(userId => ({
      user_id: userId,
      type: 'task_assigned',
      title: '新任务：' + task.title,
      body: (currentUserProfile?.name || '负责人') + ' 指派了任务给你。截止：' + dueText
    })))
  }

  const notifyTaskCreator = async (task, type, title, body) => {
    if (!task?.created_by || task.created_by === currentUserProfile?.id) return
    await insertNotifications([{ user_id: task.created_by, type, title, body }])
  }

  const createDueReminderNotifications = async (taskList) => {
    if (!isPowerUser || !Array.isArray(taskList) || taskList.length === 0) return

    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    const todayKey = startOfToday.toISOString().slice(0, 10)

    const notifications = []
    taskList.forEach(task => {
      if (!task.due_date || task.status === 'completed' || !Array.isArray(task.assigned_to)) return

      const due = new Date(task.due_date)
      const dueDay = new Date(due)
      dueDay.setHours(0, 0, 0, 0)
      const daysLeft = Math.round((dueDay - startOfToday) / 86400000)
      let type = ''
      let title = ''

      if (daysLeft === 1) {
        type = 'task_due_tomorrow'
        title = '任务明天到期：' + task.title
      } else if (daysLeft === 0) {
        type = 'task_due_today'
        title = '任务今天到期：' + task.title
      } else if (daysLeft < 0) {
        type = 'task_overdue'
        title = '任务已逾期：' + task.title
      } else {
        return
      }

      const body = '截止时间：' + formatTaskDueText(task.due_date) + '。请尽快更新任务状态。'
      ;[...new Set(task.assigned_to)].filter(Boolean).forEach(userId => {
        notifications.push({
          user_id: userId,
          type,
          title,
          body,
          dedupe_key: type + '_' + task.id + '_' + userId + '_' + todayKey
        })
      })
    })

    await insertNotifications(notifications, { dedupe: true })
  }

  const getNextWeeklyOccurrences = () => {
    const count = Math.min(Math.max(Number(formData.repeat_count) || 1, 1), 12)
    const weekday = Number(formData.repeat_weekday)
    const [hour, minute] = (formData.repeat_time || '19:00').split(':').map(Number)
    const now = new Date()
    const first = new Date(now)
    first.setHours(hour || 0, minute || 0, 0, 0)

    const daysUntil = (weekday - first.getDay() + 7) % 7
    first.setDate(first.getDate() + daysUntil)
    if (first <= now) first.setDate(first.getDate() + 7)

    return Array.from({ length: count }, (_, index) => {
      const date = new Date(first)
      date.setDate(first.getDate() + index * 7)
      return date
    })
  }

  const buildTaskPayload = (dueDate) => ({
    title: formData.title,
    description: formData.description,
    assigned_to: formData.assigned_to,
    due_date: dueDate ? new Date(dueDate).toISOString() : null,
    priority: formData.priority,
    status: formData.status,
    team_id: activeTeam.id,
    created_by: currentUserProfile.id
  })

  const handleCreateOrEditTask = async (e) => {
    e.preventDefault()
    if (!activeTeam) return
    setFormSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const payload = buildTaskPayload(formData.due_date || null)

      if (isEditing && selectedTask) {
        const { error } = await supabase
          .from('tasks')
          .update(payload)
          .eq('id', selectedTask.id)
        
        if (error) throw error
        setSuccessMsg('任务已成功更新 Task updated successfully.')
      } else if (formData.repeat_enabled) {
        const occurrences = getNextWeeklyOccurrences()
        const payloads = occurrences.map(date => buildTaskPayload(date))
        const { data, error } = await supabase
          .from('tasks')
          .insert(payloads)
          .select()

        if (error) throw error
        await Promise.all((data || []).map(task => createTaskNotifications(task)))
        setSuccessMsg('已成功创建 ' + (data?.length || payloads.length) + ' 个重复任务 Recurring tasks created.')
      } else {
        const { data, error } = await supabase
          .from('tasks')
          .insert(payload)
          .select()
          .single()

        if (error) throw error
        await createTaskNotifications(data)
        setSuccessMsg('任务已成功创建 Task created successfully.')
      }

      setShowCreateModal(false)
      fetchTasks(activeTeam.id)
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const openCreateModal = () => {
    setIsEditing(false)
    setFormData({
      title: '',
      description: '',
      assigned_to: [],
      due_date: '',
      priority: 'medium',
      status: 'pending',
      repeat_enabled: false,
      repeat_weekday: '4',
      repeat_time: '19:00',
      repeat_count: 4
    })
    setShowCreateModal(true)
  }

  const openEditModal = (task) => {
    setIsEditing(true)
    setSelectedTask(task)
    setFormData({
      title: task.title,
      description: task.description || '',
      assigned_to: task.assigned_to || [],
      due_date: task.due_date ? task.due_date.slice(0, 16) : '',
      priority: task.priority,
      status: task.status,
      repeat_enabled: false,
      repeat_weekday: '4',
      repeat_time: '19:00',
      repeat_count: 4
    })
    setShowCreateModal(true)
  }

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('确定要删除这个任务吗？此操作无法撤销。\nAre you sure you want to delete this task?')) return
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', taskId)

      if (error) throw error
      setSuccessMsg('任务已成功删除 Task deleted.')
      setShowDetailModal(false)
      fetchTasks(activeTeam.id)
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  const handleUpdateStatus = async (task, newStatus) => {
    setErrorMsg('')
    try {
      const { error } = await supabase
        .from('tasks')
        .update({ status: newStatus })
        .eq('id', task.id)

      if (error) throw error
      
      await notifyTaskCreator(
        task,
        'task_status_updated',
        '任务状态更新：' + task.title,
        (currentUserProfile?.name || '成员') + ' 将任务状态改为「' + getStatusLabel(newStatus) + '」。'
      )
      
      // Update local state for immediate feedback
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t))
      if (selectedTask?.id === task.id) {
        setSelectedTask(prev => ({ ...prev, status: newStatus }))
      }
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  // Comments Handling
  const fetchComments = async (taskId) => {
    try {
      // Join users table to get name and role of sender
      const { data, error } = await supabase
        .from('task_comments')
        .select(`
          id,
          content,
          created_at,
          user_id,
          users (
            name,
            role,
            custom_role_label
          )
        `)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setComments(data || [])
    } catch (err) {
      console.error('Error fetching comments:', err)
    }
  }

  const openDetailModal = (task) => {
    setSelectedTask(task)
    fetchComments(task.id)
    setShowDetailModal(true)
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!newCommentText.trim() || !selectedTask) return
    setSubmittingComment(true)
    try {
      const { error } = await supabase
        .from('task_comments')
        .insert({
          task_id: selectedTask.id,
          user_id: currentUserProfile.id,
          content: newCommentText.trim()
        })

      if (error) throw error
      await notifyTaskCreator(
        selectedTask,
        'task_commented',
        '任务有新留言：' + selectedTask.title,
        (currentUserProfile?.name || '成员') + '：' + newCommentText.trim()
      )
      setNewCommentText('')
      fetchComments(selectedTask.id)
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setSubmittingComment(false)
    }
  }

  const handleAssigneeToggle = (userId) => {
    setFormData(prev => {
      const isAssigned = prev.assigned_to.includes(userId)
      const nextAssigned = isAssigned
        ? prev.assigned_to.filter(id => id !== userId)
        : [...prev.assigned_to, userId]
      return { ...prev, assigned_to: nextAssigned }
    })
  }

  // Filter Tasks
  const filteredTasks = tasks.filter(t => {
    const matchesSearch = t.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
    const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter
    return matchesSearch && matchesPriority
  })

  // Group filtered tasks by status
  const tasksByStatus = {
    pending: filteredTasks.filter(t => t.status === 'pending'),
    in_progress: filteredTasks.filter(t => t.status === 'in_progress'),
    need_help: filteredTasks.filter(t => t.status === 'need_help'),
    completed: filteredTasks.filter(t => t.status === 'completed')
  }

  const isOverdue = (task) => {
    if (!task.due_date || task.status === 'completed') return false
    return new Date(task.due_date) < new Date()
  }

  return (
    <div className="space-y-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 animate-[fadeIn_0.3s_ease]"
        style={{ borderBottom: '1.5px solid #e0f1ff' }}>
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
            <CheckSquare style={{ color: '#95CBFF' }} />
            任务分配与追踪看板
          </h1>
          <p className="text-sm mt-1 font-semibold" style={{ color: '#6b7280' }}>
            Tasks Board (Assign duties, trace progress, communicate issues)
          </p>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-center gap-3">
          {teams.length > 0 ? (
            <div className="relative inline-block">
              <select
                value={activeTeam?.id || ''}
                onChange={(e) => setActiveTeam(teams.find(t => t.id === e.target.value))}
                className="appearance-none pr-10 pl-4 py-2.5 text-sm font-black rounded-2xl cursor-pointer transition outline-none"
                style={{
                  background: 'white',
                  border: '1.5px solid #e0f1ff',
                  color: '#1a1a1a',
                  boxShadow: '0 2px 10px rgba(149,203,255,0.1)'
                }}
              >
                {teams.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.type === 'board' ? '📅 执委团: ' : '🏆 筹委: '} {t.name} ({t.session})
                  </option>
                ))}
              </select>
              <div className="absolute right-3.5 top-3.5 pointer-events-none text-gray-400">
                <ChevronDown size={14} />
              </div>
            </div>
          ) : (
            isPowerUser && (
              <button
                onClick={handleCreateDefaultSession}
                className="px-4 py-2 text-xs font-black rounded-2xl bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-200 transition cursor-pointer"
              >
                ⚠️ 初始化当前执委团
              </button>
            )
          )}

          {isPowerUser && activeTeam && (
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black transition cursor-pointer text-white"
              style={{ background: '#95CBFF', boxShadow: '0 4px 16px rgba(149,203,255,0.4)' }}
            >
              <Plus size={16} />
              发布任务
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold"
          style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
          <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
          <p>{errorMsg}</p>
        </div>
      )}
      {successMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold animate-[fadeIn_0.2s_ease]"
          style={{ background: '#dcfce7', border: '1.5px solid #86efac', color: '#16a34a' }}>
          <AlertCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
          <p>{successMsg}</p>
        </div>
      )}

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-4 p-4 rounded-2xl"
        style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
        <div className="relative flex-1">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索任务名称或描述 Search task..."
            className="w-full pl-4 pr-4 py-2.5 text-sm outline-none transition"
            style={{ ...inputStyle, background: 'white' }}
          />
        </div>
        <div className="w-full sm:w-48">
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="w-full px-3 py-2.5 text-sm outline-none transition cursor-pointer"
            style={{ ...inputStyle, background: 'white' }}
          >
            <option value="all">所有优先级 / All Priorities</option>
            <option value="high">🔴 高优先级 / High</option>
            <option value="medium">🟡 中优先级 / Medium</option>
            <option value="low">⚪ 低优先级 / Low</option>
          </select>
        </div>
      </div>

      {/* Kanban Layout */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
          <Loader size={32} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
          <p className="font-bold">加载任务列表中 Loading tasks...</p>
        </div>
      ) : !activeTeam ? (
        <div className="text-center py-20 rounded-3xl font-semibold"
          style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
          ⚠️ 系统暂无执委团数据。请联系顾问老师或主席点击上方“初始化当前执委团”按钮建立第一届团队。
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
          {STATUS_COLUMNS.map(col => {
            const colTasks = tasksByStatus[col.id] || []
            return (
              <div key={col.id} className="rounded-3xl p-4 flex flex-col gap-4 min-h-[500px] transition-colors"
                style={{ background: col.bg, border: '1.5px solid #e0f1ff' }}>
                
                {/* Column Title */}
                <div className="flex items-center justify-between pb-2" style={{ borderBottom: `2.5px solid ${col.color}` }}>
                  <span className="font-black text-sm" style={{ color: '#1a1a1a' }}>{col.title}</span>
                  <span className="w-6 h-6 rounded-full text-xs font-black flex items-center justify-center text-white"
                    style={{ background: col.color }}>{colTasks.length}</span>
                </div>

                {/* Cards Container */}
                <div className="flex flex-col gap-3.5 overflow-y-auto max-h-[600px] pr-1">
                  {colTasks.length === 0 ? (
                    <div className="text-center py-10 text-xs font-bold text-gray-400 border-2 border-dashed border-gray-200 rounded-2xl">
                      暂无任务 No tasks
                    </div>
                  ) : (
                    colTasks.map(task => {
                      const priority = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.low
                      const overdue = isOverdue(task)
                      const assignees = users.filter(u => task.assigned_to?.includes(u.id))
                      const hasAssignedMe = task.assigned_to?.includes(currentUserProfile.id)

                      return (
                        <div
                          key={task.id}
                          onClick={() => openDetailModal(task)}
                          className="p-4 rounded-2xl bg-white border-1.5 transition-all hover:scale-[1.02] hover:shadow-md cursor-pointer flex flex-col justify-between gap-3 text-left"
                          style={{
                            borderColor: overdue ? '#fca5a5' : '#e0f1ff',
                            borderWidth: overdue ? '2px' : '1.5px',
                            boxShadow: overdue ? '0 4px 12px rgba(239, 68, 68, 0.08)' : '0 2px 8px rgba(149,203,255,0.06)'
                          }}
                        >
                          <div className="space-y-1.5">
                            {/* Badges */}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="px-2 py-0.5 text-[10px] font-black rounded-full shrink-0"
                                style={{ background: priority.bg, color: priority.color, border: `1px solid ${priority.border}` }}>
                                {priority.zh} / {priority.en}
                              </span>

                              {overdue && (
                                <span className="flex items-center gap-1 text-[9px] font-black bg-red-100 text-red-600 px-2 py-0.5 rounded-full border border-red-200 animate-pulse">
                                  <Clock size={10} />
                                  已逾期 Overdue
                                </span>
                              )}
                            </div>

                            {/* Title */}
                            <h4 className="font-black text-sm text-gray-900 leading-snug line-clamp-2">
                              {task.title}
                            </h4>
                          </div>

                          {/* Info Footer */}
                          <div className="flex items-center justify-between gap-2 pt-2.5" style={{ borderTop: '1.5px solid #f0f7ff' }}>
                            {/* Assignee circles */}
                            <div className="flex -space-x-1.5 overflow-hidden">
                              {assignees.length === 0 ? (
                                <div className="w-6 h-6 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center" title="未分配 Unassigned">
                                  <User size={10} className="text-gray-400" />
                                </div>
                              ) : (
                                assignees.slice(0, 3).map(u => (
                                  <div key={u.id} className="w-6 h-6 rounded-full flex items-center justify-center font-black text-[9px] border-2 border-white"
                                    style={{
                                      background: u.id === currentUserProfile.id ? '#95CBFF' : '#f0f7ff',
                                      color: u.id === currentUserProfile.id ? 'white' : '#6db8ff'
                                    }}
                                    title={u.name}
                                  >
                                    {u.name.slice(0, 2)}
                                  </div>
                                ))
                              )}
                              {assignees.length > 3 && (
                                <div className="w-6 h-6 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center font-black text-[9px] text-gray-500">
                                  +{assignees.length - 3}
                                </div>
                              )}
                            </div>

                            {/* Due Date */}
                            {task.due_date && (
                              <span className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                                <Calendar size={11} />
                                {new Date(task.due_date).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>

              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Task Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-xs">
          <div className="bg-white border-1.5 border-[#e0f1ff] rounded-3xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: '1.5px solid #e0f1ff' }}>
              <h3 className="font-black text-lg flex items-center gap-2" style={{ color: '#1a1a1a' }}>
                <CheckSquare size={18} style={{ color: '#95CBFF' }} />
                {isEditing ? '修改任务详情 Edit Task' : '发布新任务 Publish Task'}
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-lg transition cursor-pointer font-black text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <form onSubmit={handleCreateOrEditTask} className="p-6 space-y-4 flex-1">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">任务名称 Title</label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="例如: 制作国庆活动海报"
                  className="w-full px-3 py-2.5 text-sm outline-none transition"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">详细描述 Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="写明任务的具体细节与交付物标准..."
                  rows={3}
                  className="w-full px-3 py-2.5 text-sm outline-none transition"
                  style={{ ...inputStyle, borderRadius: 20 }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">截止时间 Due Date</label>
                  <input
                    type="datetime-local"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm outline-none transition"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">优先级 Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm outline-none transition"
                    style={selectStyle}
                  >
                    <option value="high">🔴 高 Priority High</option>
                    <option value="medium">🟡 中 Priority Medium</option>
                    <option value="low">⚪ 低 Priority Low</option>
                  </select>
                </div>
              </div>

              {isEditing && (
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">任务状态 Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2.5 text-sm outline-none transition"
                    style={selectStyle}
                  >
                    <option value="pending">待开始 Pending</option>
                    <option value="in_progress">进行中 In Progress</option>
                    <option value="need_help">需协助 Need Help</option>
                    <option value="completed">已完成 Completed</option>
                  </select>
                </div>
              )}

              {!isEditing && (
                <div className="space-y-3 p-4 rounded-2xl" style={{ background: '#f8fbff', border: '1.5px solid #e0f1ff' }}>
                  <label className="flex items-center gap-2 text-xs font-black text-gray-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formData.repeat_enabled}
                      onChange={(e) => setFormData({ ...formData, repeat_enabled: e.target.checked })}
                      className="h-4 w-4 accent-[#95CBFF]"
                    />
                    重复发布 Recurring weekly task
                  </label>
                  {formData.repeat_enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider mb-1 text-gray-400">星期 Weekday</label>
                        <select
                          value={formData.repeat_weekday}
                          onChange={(e) => setFormData({ ...formData, repeat_weekday: e.target.value })}
                          className="w-full px-3 py-2 text-xs outline-none transition"
                          style={selectStyle}
                        >
                          <option value="1">星期一</option>
                          <option value="2">星期二</option>
                          <option value="3">星期三</option>
                          <option value="4">星期四</option>
                          <option value="5">星期五</option>
                          <option value="6">星期六</option>
                          <option value="0">星期日</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider mb-1 text-gray-400">时间 Time</label>
                        <input
                          type="time"
                          value={formData.repeat_time}
                          onChange={(e) => setFormData({ ...formData, repeat_time: e.target.value })}
                          className="w-full px-3 py-2 text-xs outline-none transition"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider mb-1 text-gray-400">次数 Times</label>
                        <input
                          type="number"
                          min="1"
                          max="12"
                          value={formData.repeat_count}
                          onChange={(e) => setFormData({ ...formData, repeat_count: e.target.value })}
                          className="w-full px-3 py-2 text-xs outline-none transition"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  )}
                  {formData.repeat_enabled && (
                    <p className="text-[11px] font-bold text-gray-500 leading-relaxed">
                      系统会一次建立未来 {formData.repeat_count || 1} 周的任务，并把截止时间设为你选择的星期与时间。
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">
                  指派负责人 Assignees ({formData.assigned_to.length})
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3.5 rounded-2xl max-h-[160px] overflow-y-auto"
                  style={{ background: '#f0f7ff', border: '1.5px solid #95CBFF' }}>
                  {users.map(u => {
                    const isChecked = formData.assigned_to.includes(u.id)
                    return (
                      <button
                        type="button"
                        key={u.id}
                        onClick={() => handleAssigneeToggle(u.id)}
                        className="px-2 py-1.5 text-left truncate text-xs rounded-xl font-bold flex items-center gap-1.5 transition select-none"
                        style={{
                          background: isChecked ? '#95CBFF' : 'white',
                          color: isChecked ? 'white' : '#1a1a1a',
                          border: '1.5px solid #e0f1ff'
                        }}
                      >
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: isChecked ? 'white' : '#6db8ff' }} />
                        {u.name}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3" style={{ borderTop: '1.5px solid #f0f7ff' }}>
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-2xl text-sm font-bold transition cursor-pointer"
                  style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
                  取消
                </button>
                <button type="submit" disabled={formSubmitting}
                  className="px-5 py-2.5 rounded-2xl text-sm font-black transition cursor-pointer text-white"
                  style={{ background: '#95CBFF', opacity: formSubmitting ? 0.7 : 1 }}>
                  {formSubmitting ? '提交中...' : (isEditing ? '确认更新' : (formData.repeat_enabled ? '确认重复发布' : '确认发布'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Detail Modal & Comments Area */}
      {showDetailModal && selectedTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-xs">
          <div className="bg-white border-1.5 border-[#e0f1ff] rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            
            {/* Header info */}
            <div className="px-6 py-4 flex items-center justify-between shrink-0" style={{ borderBottom: '1.5px solid #f0f7ff' }}>
              <div className="space-y-1">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">任务详情 Task Details</span>
                <h3 className="font-black text-base text-gray-900 line-clamp-1">{selectedTask.title}</h3>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="text-lg transition cursor-pointer font-black text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
              {/* Top details cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-3.5 rounded-2xl bg-[#f0f7ff] border border-[#e0f1ff] space-y-1">
                  <span className="text-[10px] font-black text-gray-400 block uppercase">负责人 Assignees</span>
                  <div className="flex -space-x-1.5 overflow-hidden">
                    {users.filter(u => selectedTask.assigned_to?.includes(u.id)).map(u => (
                      <div key={u.id} className="w-6 h-6 rounded-full flex items-center justify-center font-black text-[9px] border border-white"
                        style={{ background: '#95CBFF', color: 'white' }}
                        title={u.name}
                      >
                        {u.name.slice(0, 2)}
                      </div>
                    ))}
                    {users.filter(u => selectedTask.assigned_to?.includes(u.id)).length === 0 && (
                      <span className="text-xs font-bold text-gray-500">未指派人员</span>
                    )}
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#f0f7ff] border border-[#e0f1ff] space-y-1">
                  <span className="text-[10px] font-black text-gray-400 block uppercase">截止日期 Due Date</span>
                  <span className="text-xs font-black text-gray-700 flex items-center gap-1">
                    <Calendar size={13} />
                    {selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '无限期'}
                  </span>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#f0f7ff] border border-[#e0f1ff] space-y-1">
                  <span className="text-[10px] font-black text-gray-400 block uppercase">状态 Status</span>
                  
                  {/* Status Dropdown selector for everyone who has access */}
                  <div className="relative">
                    <select
                      value={selectedTask.status}
                      onChange={(e) => handleUpdateStatus(selectedTask, e.target.value)}
                      className="appearance-none pr-8 pl-0.5 py-0.5 text-xs font-black rounded-lg bg-transparent text-gray-800 transition outline-none cursor-pointer"
                    >
                      <option value="pending">待开始 Pending</option>
                      <option value="in_progress">进行中 In Progress</option>
                      <option value="need_help">需协助 Need Help</option>
                      <option value="completed">已完成 Completed</option>
                    </select>
                    <div className="absolute right-0.5 top-1.5 pointer-events-none text-gray-400">
                      <ChevronDown size={11} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Task Description */}
              <div className="space-y-1.5 p-4 rounded-2xl bg-[#f8fbff] border border-[#e0f1ff]">
                <span className="text-[10px] font-black text-gray-400 block uppercase">任务描述 Description</span>
                <p className="text-sm font-semibold text-gray-700 whitespace-pre-wrap leading-relaxed">
                  {selectedTask.description || '无详细描述。 No details provided.'}
                </p>
              </div>

              {/* Action buttons for admins/creators */}
              {isPowerUser && (
                <div className="flex gap-2 justify-end" style={{ borderBottom: '1.5px solid #f0f7ff', paddingBottom: '16px' }}>
                  <button
                    onClick={() => { openEditModal(selectedTask); setShowDetailModal(false); }}
                    className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-black border border-[#e0f1ff] bg-white text-gray-600 hover:bg-[#f8fbff] transition cursor-pointer"
                  >
                    <Edit2 size={12} />
                    修改详情
                  </button>
                  <button
                    onClick={() => handleDeleteTask(selectedTask.id)}
                    className="flex items-center gap-1 px-3.5 py-2 rounded-xl text-xs font-black border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 transition cursor-pointer"
                  >
                    <Trash2 size={12} />
                    删除任务
                  </button>
                </div>
              )}

              {/* Comments Section */}
              <div className="space-y-4 pt-1">
                <span className="text-xs font-black text-gray-500 block uppercase flex items-center gap-1.5">
                  <MessageSquare size={13} style={{ color: '#95CBFF' }} />
                  进展与留言沟通备注 ({comments.length})
                </span>

                <div className="space-y-3 max-h-[220px] overflow-y-auto pr-1">
                  {comments.length === 0 ? (
                    <p className="text-xs text-gray-400 font-bold text-center py-6">目前暂无进度备注，请在此输入最新留言。</p>
                  ) : (
                    comments.map(c => {
                      const userDetails = c.users || { name: '未知成员', role: 'custom' }
                      const isMe = c.user_id === currentUserProfile.id
                      return (
                        <div key={c.id} className="p-3 rounded-2xl flex flex-col gap-1 text-xs border border-[#e0f1ff]"
                          style={{
                            background: isMe ? '#f0f7ff' : '#fcfcfc',
                            alignSelf: isMe ? 'flex-end' : 'flex-start'
                          }}
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1.5">
                              <span className="font-black text-gray-800">{userDetails.name}</span>
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-white text-gray-400 border border-gray-100">
                                {getTaskUserRoleLabel(userDetails)}
                              </span>
                            </div>
                            <span className="text-[8px] font-semibold text-gray-400">
                              {new Date(c.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-gray-600 font-semibold leading-relaxed mt-0.5">{c.content}</p>
                        </div>
                      )
                    })
                  )}
                </div>

                {/* Comment Input */}
                <form onSubmit={handleAddComment} className="flex gap-2 pt-2 shrink-0">
                  <input
                    type="text"
                    required
                    value={newCommentText}
                    onChange={(e) => setNewCommentText(e.target.value)}
                    placeholder="输入最新进展或提问，按下回车发送..."
                    className="flex-1 px-4 py-2.5 text-xs outline-none transition"
                    style={{ ...inputStyle, borderRadius: 20 }}
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !newCommentText.trim()}
                    className="px-4 rounded-full text-xs font-black bg-[#95CBFF] text-white flex items-center justify-center gap-1 transition cursor-pointer select-none"
                    style={{ opacity: submittingComment ? 0.7 : 1 }}
                  >
                    发送 <ArrowRight size={12} />
                  </button>
                </form>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  )
}

const selectStyle = {
  background: '#f0f7ff',
  border: '1.5px solid #95CBFF',
  color: '#1a1a1a',
  borderRadius: 16,
  fontFamily: "'Nunito', sans-serif",
  fontWeight: 700,
  padding: '10px 14px',
  cursor: 'pointer'
}
