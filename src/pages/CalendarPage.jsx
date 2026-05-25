import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  ExternalLink,
  Trash2,
  AlertCircle,
  CheckCircle,
  Clock,
  Loader
} from 'lucide-react'

const EVENT_TYPE_LABELS = {
  event: { zh: '学会活动', en: 'CLS Event', color: '#3b82f6', bg: '#eff6ff', border: '#bfdbfe' },
  meeting: { zh: '内部会议', en: 'Committee Meeting', color: '#10b981', bg: '#ecfdf5', border: '#a7f3d0' },
  deadline: { zh: '截止日期', en: 'Task Deadline', color: '#ef4444', bg: '#fef2f2', border: '#fca5a5' }
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

export default function CalendarPage({ currentUserProfile, lang }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState([])
  const [tasks, setTasks] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Date selection state
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [showAddModal, setShowAddModal] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)

  // Event form data
  const [formData, setFormData] = useState({
    title: '',
    type: 'event',
    team_id: '',
    drive_link: ''
  })

  const isPowerUser = TASK_MANAGER_ROLES.includes(currentUserProfile?.role)

  useEffect(() => {
    fetchCalendarData()

    // Subscribe to both 'events' and 'tasks' table changes for realtime calendar synchronization
    const eventsChannel = supabase
      .channel('calendar-events-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => {
          fetchCalendarData(true)
        }
      )
      .subscribe()

    const tasksChannel = supabase
      .channel('calendar-tasks-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => {
          fetchCalendarData(true)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(eventsChannel)
      supabase.removeChannel(tasksChannel)
    }
  }, [currentDate])

  const fetchCalendarData = async (isSilent = false) => {
    if (!isSilent) setLoading(true)
    setErrorMsg('')
    try {
      // 1. Fetch active teams
      const { data: teamsData, error: teamsError } = await supabase
        .from('teams')
        .select('*')
        .eq('is_archived', false)

      if (teamsError) throw teamsError
      setTeams(teamsData || [])

      // Calculate start and end date for current month view in local timezone to avoid UTC shifting
      const yearVal = currentDate.getFullYear()
      const monthVal = currentDate.getMonth()
      const startOfMonth = `${yearVal}-${String(monthVal + 1).padStart(2, '0')}-01`
      const lastDay = new Date(yearVal, monthVal + 1, 0).getDate()
      const endOfMonth = `${yearVal}-${String(monthVal + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      // 2. Fetch events in this month range (exclude Drive binder placeholders)
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select('*')
        .gte('date', startOfMonth)
        .lte('date', endOfMonth)
        .neq('title', 'EXEC_DRIVE_LINK')
        .not('title', 'ilike', 'Google Drive%')

      if (eventsError) throw eventsError
      setEvents(eventsData || [])

      // 3. Fetch tasks with due_date in this month range
      const { data: tasksData, error: tasksError } = await supabase
        .from('tasks')
        .select('*')
        .gte('due_date', startOfMonth + 'T00:00:00Z')
        .lte('due_date', endOfMonth + 'T23:59:59Z')

      if (tasksError) throw tasksError
      setTasks(tasksData || [])

    } catch (err) {
      setErrorMsg(err.message || '获取日程数据失败 Failed to load calendar.')
    } finally {
      if (!isSilent) setLoading(false)
    }
  }

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  // Monthly grid algorithm
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonthIndex = new Date(year, month, 1).getDay()
  const totalDaysInMonth = new Date(year, month + 1, 0).getDate()

  const calendarDays = []
  // Empty blocks at the beginning of grid
  for (let i = 0; i < firstDayOfMonthIndex; i++) {
    calendarDays.push(null)
  }
  // Days of month
  for (let d = 1; d <= totalDaysInMonth; d++) {
    calendarDays.push(new Date(year, month, d))
  }

  const getItemsForDate = (date) => {
    if (!date) return { events: [], tasks: [] }
    // Construct local date string to avoid timezone shifts
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${d}`

    // Filter out any Drive binder placeholders
    const dateEvents = events.filter(e =>
      e.date === dateStr &&
      e.title !== 'EXEC_DRIVE_LINK' &&
      !e.title.includes('Google Drive')
    )
    const dateTasks = tasks.filter(t => {
      if (!t.due_date) return false
      return t.due_date.split('T')[0] === dateStr
    })

    return { events: dateEvents, tasks: dateTasks }
  }

  const handleAddEventSubmit = async (e) => {
    e.preventDefault()
    if (!selectedDate) return
    setFormSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      // Format local date string to avoid timezone shift upon saving
      const y = selectedDate.getFullYear()
      const m = String(selectedDate.getMonth() + 1).padStart(2, '0')
      const d = String(selectedDate.getDate()).padStart(2, '0')
      const dateStr = `${y}-${m}-${d}`

      const color = formData.type === 'event' ? 'blue' : formData.type === 'meeting' ? 'green' : 'red'

      // Must belong to a team, default to first available active team
      const teamId = formData.team_id || (teams.length > 0 ? teams[0].id : null)

      if (!teamId) {
        throw new Error('系统无法自动绑定活动组，请先前往“任务”初始化执委团。')
      }

      const { error } = await supabase
        .from('events')
        .insert({
          title: formData.title,
          date: dateStr,
          type: formData.type,
          color: color,
          team_id: teamId,
          drive_link: formData.drive_link || null
        })

      if (error) throw error
      setSuccessMsg(lang === 'zh' ? '日程成功添加到日历中！' : 'Event successfully added to calendar!')
      setShowAddModal(false)
      setFormData({ title: '', type: 'event', team_id: '', drive_link: '' })
      fetchCalendarData(true)  // silent: don't trigger full loading state
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDeleteEvent = async (eventId) => {
    if (!window.confirm(lang === 'zh' ? '确定要删除此日程吗？' : 'Are you sure you want to delete this event?')) return
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)

      if (error) throw error
      setSuccessMsg(lang === 'zh' ? '日程已成功删除' : 'Event deleted.')
      fetchCalendarData(true)  // silent: don't trigger full loading state
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  // Details for currently selected date
  const { events: selectedEvents, tasks: selectedTasks } = getItemsForDate(selectedDate)

  const MONTH_NAMES = {
    zh: ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  }
  const WEEK_DAYS = {
    zh: ['日', '一', '二', '三', '四', '五', '六'],
    en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  }

  return (
    <div className="space-y-6 text-left animate-[fadeIn_0.3s_ease]" style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 border-b-1.5 border-[#e0f1ff]">
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
            <CalendarIcon style={{ color: '#95CBFF' }} />
            {lang === 'zh' ? '活动行事历' : 'Event Calendar'}
          </h1>
          <p className="text-sm mt-1 font-semibold" style={{ color: '#6b7280' }}>
            {lang === 'zh' ? '月度活动计划、会议周期与任务截止日历' : 'Monthly activities grid, meeting schedules and tasks deadline'}
          </p>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold animate-[fadeIn_0.2s_ease]"
          style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
          <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
          <p>{errorMsg}</p>
        </div>
      )}
      {successMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold animate-[fadeIn_0.2s_ease]"
          style={{ background: '#dcfce7', border: '1.5px solid #86efac', color: '#16a34a' }}>
          <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
          <p>{successMsg}</p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
          <Loader size={32} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
          <p className="font-bold">{lang === 'zh' ? '加载日历数据中...' : 'Loading calendar...'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

          {/* Monthly Calendar Core Grid (2 columns on large screen) */}
          <div className="lg:col-span-2 p-6 rounded-3xl bg-white border border-[#e0f1ff]"
            style={{ boxShadow: '0 4px 20px rgba(149,203,255,0.06)' }}>
            
            {/* Calendar Controls */}
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-black text-gray-800 flex items-center gap-1.5">
                {MONTH_NAMES[lang][month]} {year}
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={handlePrevMonth}
                  className="p-2 rounded-xl border border-[#e0f1ff] hover:bg-[#f0f7ff] transition cursor-pointer text-gray-500"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-2 rounded-xl border border-[#e0f1ff] hover:bg-[#f0f7ff] transition cursor-pointer text-gray-500"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-7 gap-2">
              {/* Day Headers */}
              {WEEK_DAYS[lang].map(d => (
                <div key={d} className="text-center py-2 text-xs font-black text-gray-400 select-none">{d}</div>
              ))}

              {/* Day Cells */}
              {calendarDays.map((day, idx) => {
                if (!day) {
                  return <div key={`empty-${idx}`} className="aspect-square bg-gray-50/50 rounded-2xl" />
                }

                const isSelected = selectedDate && day.toDateString() === selectedDate.toDateString()
                const isToday = day.toDateString() === new Date().toDateString()
                const { events: dayEvs, tasks: dayTsk } = getItemsForDate(day)

                return (
                  <div
                    key={`day-${day.getDate()}`}
                    onClick={() => setSelectedDate(day)}
                    className="aspect-square rounded-2xl p-1.5 border transition cursor-pointer flex flex-col justify-between items-center hover:bg-[#f8fbff]"
                    style={{
                      background: isSelected ? '#f0f7ff' : 'white',
                      borderColor: isSelected ? '#95CBFF' : isToday ? '#FFB3C6' : '#f0f7ff',
                      borderWidth: isSelected || isToday ? '2px' : '1px'
                    }}
                  >
                    {/* Day number */}
                    <span className="text-xs font-black" style={{ color: isToday ? '#db2777' : '#1a1a1a' }}>
                      {day.getDate()}
                    </span>

                    {/* Dots indicator */}
                    <div className="flex justify-center gap-1 flex-wrap max-w-full pb-0.5">
                      {dayEvs.slice(0, 3).map(e => (
                        <span
                          key={e.id}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{
                            background: EVENT_TYPE_LABELS[e.type]?.color || '#9ca3af'
                          }}
                          title={e.title}
                        />
                      ))}
                      {dayTsk.slice(0, 2).map(t => (
                        <span
                          key={t.id}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: '#ef4444' }}
                          title={`Task due: ${t.title}`}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Colors legend */}
            <div className="flex flex-wrap gap-4 mt-6 pt-4 border-t border-[#f0f7ff] text-[10px] font-black text-gray-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3b82f6' }} />
                {lang === 'zh' ? '学会活动' : 'CLS Event'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#10b981' }} />
                {lang === 'zh' ? '内部会议' : 'Committee Meeting'}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#ef4444' }} />
                {lang === 'zh' ? '任务截止期' : 'Task Deadline'}
              </span>
            </div>

          </div>

          {/* Right Panel: Daily Schedule Details (1 column) */}
          <div className="space-y-6">
            <div className="p-6 rounded-3xl bg-white border border-[#e0f1ff] space-y-5"
              style={{ boxShadow: '0 4px 20px rgba(149,203,255,0.06)' }}>
              
              <div className="flex justify-between items-center pb-3 border-b-1.5 border-[#f0f7ff]">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                    {selectedDate ? selectedDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'long' }) : ''}
                  </span>
                  <h3 className="font-black text-sm text-gray-800">
                    {selectedDate ? selectedDate.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }) : ''}
                  </h3>
                </div>

                {isPowerUser && (
                  <button
                    onClick={() => {
                      setFormData({ title: '', type: 'event', team_id: teams.length > 0 ? teams[0].id : '', drive_link: '' })
                      setShowAddModal(true)
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-black rounded-xl text-white transition cursor-pointer"
                    style={{ background: '#95CBFF' }}
                  >
                    <Plus size={12} /> {lang === 'zh' ? '添加活动' : 'Add Event'}
                  </button>
                )}
              </div>

              {/* List of items */}
              <div className="space-y-4 max-h-[440px] overflow-y-auto pr-1">
                {selectedEvents.length === 0 && selectedTasks.length === 0 ? (
                  <div className="text-center py-12 text-xs font-bold text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
                    {lang === 'zh' ? '当天暂无活动或截止任务' : 'No schedules or deadlines on this day.'}
                  </div>
                ) : (
                  <>
                    {/* Events */}
                    {selectedEvents.map(e => {
                      const typeLabel = EVENT_TYPE_LABELS[e.type] || EVENT_TYPE_LABELS.event
                      return (
                        <div key={e.id} className="p-4 rounded-2xl border border-[#e0f1ff] bg-[#fcfcfc] space-y-3 relative">
                          <div className="flex items-start justify-between gap-4">
                            <div className="space-y-1">
                              <span className="px-2 py-0.5 text-[8px] font-black rounded-full"
                                style={{ background: typeLabel.bg, color: typeLabel.color, border: `1px solid ${typeLabel.border}` }}>
                                {lang === 'zh' ? typeLabel.zh : typeLabel.en}
                              </span>
                              <h4 className="font-black text-xs text-gray-800 pt-1 leading-snug">{e.title}</h4>
                            </div>
                            
                            {isPowerUser && (
                              <button
                                onClick={() => handleDeleteEvent(e.id)}
                                className="text-red-400 hover:text-red-600 transition p-1 cursor-pointer shrink-0"
                                title={lang === 'zh' ? '删除日程' : 'Delete event'}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>

                          {e.drive_link && (
                            <a
                              href={e.drive_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] font-black text-blue-600 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-200 hover:bg-blue-100 transition cursor-pointer"
                            >
                              Google Drive <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      )
                    })}

                    {/* Tasks deadlines */}
                    {selectedTasks.map(t => (
                      <div key={t.id} className="p-4 rounded-2xl border border-red-200 bg-red-50/30 space-y-1.5 text-left">
                        <span className="px-2 py-0.5 text-[8px] font-black rounded-full bg-red-100 text-red-600 border border-red-200">
                          {lang === 'zh' ? '任务截止期' : 'Task Deadline'}
                        </span>
                        <h4 className="font-black text-xs text-gray-800 pt-1 leading-snug">{t.title}</h4>
                        {t.due_date && (
                          <span className="text-[9px] font-bold text-gray-400 flex items-center gap-0.5">
                            <Clock size={10} />
                            {new Date(t.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} {lang === 'zh' ? '截止' : 'due'}
                          </span>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>

            </div>
          </div>

        </div>
      )}

      {/* Add Event Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-xs">
          <div className="bg-white border border-[#e0f1ff] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden text-left">
            <div className="px-6 py-4 flex items-center justify-between border-b-1.5 border-[#e0f1ff]">
              <h3 className="font-black text-base flex items-center gap-2 text-gray-900">
                <CalendarIcon size={18} style={{ color: '#95CBFF' }} />
                {lang === 'zh' ? '添加日历日程' : 'Add Calendar Event'}
              </h3>
              <button onClick={() => setShowAddModal(false)} className="text-lg transition cursor-pointer font-black text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleAddEventSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">
                  {lang === 'zh' ? '活动主题 / 日程名称' : 'Event Title / Name'}
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder={lang === 'zh' ? "例如: 召开五月份第一次筹备会议" : "e.g. Committee meeting"}
                  className="w-full text-sm font-semibold outline-none py-2.5 transition"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">
                  {lang === 'zh' ? '日程分类' : 'Event Category'}
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full text-sm outline-none py-2.5 transition cursor-pointer"
                  style={{ ...inputStyle, background: 'white' }}
                >
                  <option value="event">🔵 {lang === 'zh' ? '学会活动 CLS Event' : 'CLS Event'}</option>
                  <option value="meeting">🟢 {lang === 'zh' ? '内部会议 Meeting' : 'Committee Meeting'}</option>
                  <option value="deadline">🔴 {lang === 'zh' ? '任务截止期 Task Deadline' : 'Task Deadline'}</option>
                </select>
              </div>

              {teams.length > 0 && (
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">
                    {lang === 'zh' ? '关联团队' : 'Link to Team'}
                  </label>
                  <select
                    value={formData.team_id}
                    onChange={(e) => setFormData({ ...formData, team_id: e.target.value })}
                    className="w-full text-sm outline-none py-2.5 transition cursor-pointer"
                    style={{ ...inputStyle, background: 'white' }}
                  >
                    {teams.map(t => (
                      <option key={t.id} value={t.id}>
                        {t.type === 'board' ? '📅 执委团: ' : '🏆 筹委: '} {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">
                  {lang === 'zh' ? '文件目录链接 (Google Drive)' : 'File sharing link (Google Drive)'}
                </label>
                <input
                  type="url"
                  value={formData.drive_link}
                  onChange={(e) => setFormData({ ...formData, drive_link: e.target.value })}
                  placeholder="https://drive.google.com/..."
                  className="w-full text-sm font-semibold outline-none py-2.5 transition"
                  style={inputStyle}
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-1.5 border-[#f0f7ff]">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer"
                  style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button type="submit" disabled={formSubmitting}
                  className="px-4 py-2 rounded-2xl text-xs font-black text-white transition cursor-pointer"
                  style={{ background: '#95CBFF', opacity: formSubmitting ? 0.7 : 1 }}
                >
                  {formSubmitting ? (lang === 'zh' ? '保存中...' : 'Saving...') : (lang === 'zh' ? '确认添加' : 'Add Event')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
