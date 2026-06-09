import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import {
  FolderGit,
  Plus,
  Calendar,
  Users,
  AlertCircle,
  Loader,
  CheckCircle,
  ExternalLink,
  Lock,
  UserPlus,
  Trash2,
  ListTodo
} from 'lucide-react'
import UserAvatar from '../components/UserAvatar'
import AvatarPreviewModal from '../components/AvatarPreviewModal'

const BOARD_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor']
const TASK_MANAGER_ROLES = [...BOARD_MANAGER_ROLES, 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead']
const CUSTOM_POSITION_VALUE = '__custom__'
const COMMITTEE_POSITION_OPTIONS = [
  { value: '召集老师', zh: '召集老师', en: 'Convener Teacher' },
  { value: '指导老师', zh: '指导老师', en: 'Advisor Teacher' },
  { value: '筹委主席', zh: '筹委主席', en: 'Committee President' },
  { value: '筹委副主席', zh: '筹委副主席', en: 'Committee Vice President' },
  { value: '文书干事', zh: '文书干事', en: 'Secretary' },
  { value: '财政干事', zh: '财政干事', en: 'Treasurer' },
  { value: '总务干事', zh: '总务干事', en: 'General Affairs' },
  { value: '宣传组长', zh: '宣传组长', en: 'Publicity Lead' },
  { value: '普通筹委', zh: '普通筹委', en: 'Committee Member' },
]
const COMMITTEE_MANAGER_POSITIONS = ['筹委主席', '筹委副主席']

const inputStyle = {
  background: '#f0f7ff',
  border: '1.5px solid #95CBFF',
  color: '#1a1a1a',
  borderRadius: 16,
  fontFamily: "'Nunito', sans-serif",
  fontWeight: 700,
  padding: '10px 14px'
}

export default function Committees({ currentUserProfile, lang }) {
  const _ = (zh, en) => lang === 'zh' ? zh : en
  const [committees, setCommittees] = useState([])
  const [activeTab, setActiveTab] = useState('active') // 'active' or 'archived'
  const [archiveYearFilter, setArchiveYearFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Selected committee details
  const [selectedComm, setSelectedComm] = useState(null)
  const [commMembers, setCommMembers] = useState([])
  const [commTasks, setCommTasks] = useState([])
  const [commDriveLink, setCommDriveLink] = useState('')
  const [driveEventId, setDriveEventId] = useState(null)
  const [canViewSelectedCommittee, setCanViewSelectedCommittee] = useState(null)
  const [avatarPreviewUser, setAvatarPreviewUser] = useState(null)

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showAddMemberModal, setShowAddMemberModal] = useState(false)
  const [showTaskShortcutModal, setShowTaskShortcutModal] = useState(false)

  // Form states
  const [newCommData, setNewCommData] = useState({
    name: '',
    session: '',
    start_date: '',
    end_date: ''
  })
  const [newMemberData, setNewMemberData] = useState({
    user_id: '',
    position: '普通筹委'  // internal data, stored in DB as Chinese
  })
  const [customMemberPosition, setCustomMemberPosition] = useState('')
  const [newCommTask, setNewCommTask] = useState({
    title: '',
    description: '',
    assigned_to: [],
    due_date: '',
    priority: 'medium'
  })

  const [formSubmitting, setFormSubmitting] = useState(false)
  const [users, setUsers] = useState([])

  const isPowerUser = BOARD_MANAGER_ROLES.includes(currentUserProfile?.role)
  const isSelectedCommitteeManager = selectedComm && commMembers.some(member =>
    member.user_id === currentUserProfile?.id &&
    COMMITTEE_MANAGER_POSITIONS.includes(member.position)
  )
  const canManageSelectedCommittee = isPowerUser || isSelectedCommitteeManager

  useEffect(() => {
    if (!currentUserProfile?.id) return
    fetchCommittees()
    fetchUsers()
  }, [currentUserProfile?.id, currentUserProfile?.role])

  useEffect(() => {
    if (selectedComm) {
      setCanViewSelectedCommittee(null)
      fetchCommitteeDetails(selectedComm.id)
    }
  }, [selectedComm])

  const fetchCommittees = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      // Fetch all teams of type 'event'
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('type', 'event')
        .order('created_at', { ascending: false })

      if (error) throw error

      // For each committee, fetch its task statistics and member counts
      const enrichedComms = await Promise.all((data || []).map(async (comm) => {
        // Fetch member count
        const { count: memberCount, error: mErr } = await supabase
          .from('team_members')
          .select('*', { count: 'exact', head: true })
          .eq('team_id', comm.id)

        // Fetch task counts
        const { data: tasks, error: tErr } = await supabase
          .from('tasks')
          .select('status')
          .eq('team_id', comm.id)

        const totalTasks = tasks ? tasks.length : 0
        const completedTasks = tasks ? tasks.filter(t => t.status === 'completed').length : 0

        return {
          ...comm,
          memberCount: memberCount || 0,
          totalTasks,
          completedTasks,
          progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
        }
      }))

      setCommittees(enrichedComms)
    } catch (err) {
      setErrorMsg(err.message || _('获取筹委团列表失败', 'Failed to load committees.'))
    } finally {
      setLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw error
      setUsers(data || [])
    } catch (err) {
      console.error('Error fetching users:', err)
    }
  }

  const fetchCommitteeDetails = async (commId) => {
    try {
      if (!isPowerUser) {
        const { data: ownMembership, error: ownMembershipError } = await supabase
          .from('team_members')
          .select('position')
          .eq('team_id', commId)
          .eq('user_id', currentUserProfile.id)
          .maybeSingle()

        if (ownMembershipError) throw ownMembershipError
        if (!ownMembership) {
          setCanViewSelectedCommittee(false)
          setCommMembers([])
          setCommTasks([])
          setCommDriveLink('')
          setDriveEventId(null)
          return
        }
      }

      setCanViewSelectedCommittee(true)

      // 1. Fetch team members (joined with users)
      const { data: members, error: mErr } = await supabase
        .from('team_members')
        .select(`
          position,
          joined_at,
          user_id,
          users (
            name,
            email,
            role,
            avatar_url
          )
        `)
        .eq('team_id', commId)
      
      if (mErr) throw mErr
      setCommMembers(members || [])

      // 2. Fetch tasks for this team
      const { data: tasks, error: tErr } = await supabase
        .from('tasks')
        .select('*')
        .eq('team_id', commId)
        .order('created_at', { ascending: false })

      if (tErr) throw tErr
      setCommTasks(tasks || [])

      // 3. Fetch Google Drive Link (stored as an event with specific title for compatibility)
      const { data: events, error: eErr } = await supabase
        .from('events')
        .select('*')
        .eq('team_id', commId)
        .eq('type', 'event')
        .ilike('title', '%Google Drive%')
        .limit(1)

      if (eErr) throw eErr
      if (events && events.length > 0) {
        setCommDriveLink(events[0].drive_link || '')
        setDriveEventId(events[0].id)
      } else {
        setCommDriveLink('')
        setDriveEventId(null)
      }

    } catch (err) {
      setErrorMsg(err.message || _('获取筹委团详情失败', 'Failed to load committee details.'))
      setCanViewSelectedCommittee(false)
    }
  }

  const handleCreateCommittee = async (e) => {
    e.preventDefault()
    setFormSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const { data, error } = await supabase
        .from('teams')
        .insert({
          name: newCommData.name,
          type: 'event',
          session: newCommData.session,
          start_date: newCommData.start_date || null,
          end_date: newCommData.end_date || null,
          is_archived: false
        })
        .select()
        .single()

      if (error) throw error

      setSuccessMsg(_(`筹委团 "${newCommData.name}" 创建成功！`, `Committee "${newCommData.name}" created!`))
      setShowCreateModal(false)
      setNewCommData({ name: '', session: '', start_date: '', end_date: '' })
      fetchCommittees()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleAddMember = async (e) => {
    e.preventDefault()
    if (!selectedComm || !newMemberData.user_id) return
    const finalPosition = newMemberData.position === CUSTOM_POSITION_VALUE
      ? customMemberPosition.trim()
      : newMemberData.position
    if (!finalPosition) {
      setErrorMsg(_('请输入自定义职位名称。', 'Please enter a custom position.'))
      return
    }
    setFormSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const { error } = await supabase
        .from('team_members')
        .insert({
          team_id: selectedComm.id,
          user_id: newMemberData.user_id,
          position: finalPosition
        })

      if (error) throw error
      setSuccessMsg(_('成功将成员招募进筹委团！', 'Member added to committee!'))
      setShowAddMemberModal(false)
      setNewMemberData({ user_id: '', position: '普通筹委' })
      setCustomMemberPosition('')
      fetchCommitteeDetails(selectedComm.id)
      fetchCommittees()
    } catch (err) {
      setErrorMsg(err.message || _('该成员已存在于此筹委团中。', 'Member already exists in this committee.'))
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleRemoveMember = async (userId) => {
    if (!selectedComm) return
    if (!window.confirm(_('确定要移出此筹委成员吗？', 'Remove this member from the committee?'))) return
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const { error } = await supabase
        .from('team_members')
        .delete()
        .eq('team_id', selectedComm.id)
        .eq('user_id', userId)

      if (error) throw error
      setSuccessMsg(_('成员已成功移出筹委团。', 'Member removed from committee.'))
      fetchCommitteeDetails(selectedComm.id)
      fetchCommittees()
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  const handleSaveDriveLink = async () => {
    if (!selectedComm) return
    setErrorMsg('')
    setSuccessMsg('')
    try {
      if (driveEventId) {
        // Update existing link event
        const { error } = await supabase
          .from('events')
          .update({ drive_link: commDriveLink })
          .eq('id', driveEventId)

        if (error) throw error
      } else {
        // Create a new event placeholder to store Drive link
        const { data, error } = await supabase
          .from('events')
          .insert({
            title: `Google Drive 文件夹 - ${selectedComm.name}`,
            date: new Date().toISOString().split('T')[0],
            type: 'event',
            color: 'blue',
            team_id: selectedComm.id,
            drive_link: commDriveLink
          })
          .select()
          .single()

        if (error) throw error
        if (data) setDriveEventId(data.id)
      }
      setSuccessMsg(_('Google Drive 分享链接已成功绑定！', 'Google Drive link saved!'))
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  const handleArchiveCommittee = async () => {
    if (!selectedComm) return
    const confirmMsg = _(`确定要归档筹委团 "${selectedComm.name}" 吗？\n归档后所有任务、成员配置将被锁定为只读历史档案！`, `Archive committee "${selectedComm.name}"?\nAll tasks and members will be locked as read-only!`)
    if (!window.confirm(confirmMsg)) return
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const { error } = await supabase
        .from('teams')
        .update({ is_archived: true })
        .eq('id', selectedComm.id)

      if (error) throw error
      setSuccessMsg(_('筹委团已成功归档并锁定！', 'Committee archived and locked!'))
      setSelectedComm(null)
      fetchCommittees()
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  // Quick Task Shortcut inside Committee Details
  const handleCreateTaskShortcut = async (e) => {
    e.preventDefault()
    if (!selectedComm) return
    setFormSubmitting(true)
    setErrorMsg('')
    try {
      const { error } = await supabase
        .from('tasks')
        .insert({
          title: newCommTask.title,
          description: newCommTask.description,
          assigned_to: newCommTask.assigned_to,
          due_date: newCommTask.due_date ? new Date(newCommTask.due_date).toISOString() : null,
          priority: newCommTask.priority,
          status: 'pending',
          team_id: selectedComm.id,
          created_by: currentUserProfile.id
        })

      if (error) throw error
      setSuccessMsg(_('筹委任务指派成功！', 'Task assigned!'))
      setShowTaskShortcutModal(false)
      setNewCommTask({ title: '', description: '', assigned_to: [], due_date: '', priority: 'medium' })
      fetchCommitteeDetails(selectedComm.id)
      fetchCommittees()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleTaskAssigneeToggle = (userId) => {
    setNewCommTask(prev => {
      const isAssigned = prev.assigned_to.includes(userId)
      const nextAssigned = isAssigned
        ? prev.assigned_to.filter(id => id !== userId)
        : [...prev.assigned_to, userId]
      return { ...prev, assigned_to: nextAssigned }
    })
  }

  const activeCommittees = committees.filter(c => !c.is_archived)
  const archivedCommittees = committees.filter(c => c.is_archived)
  const getCommitteeYear = (committee) => {
    const source = committee.session || committee.start_date || committee.end_date || committee.created_at || ''
    const match = String(source).match(/\d{4}/)
    return match ? match[0] : _('未设年份', 'No Year')
  }
  const archiveYears = [...new Set(archivedCommittees.map(getCommitteeYear))].sort((a, b) => String(b).localeCompare(String(a)))
  const filteredArchivedCommittees = archiveYearFilter === 'all'
    ? archivedCommittees
    : archivedCommittees.filter(committee => getCommitteeYear(committee) === archiveYearFilter)
  const currentTabComms = activeTab === 'active' ? activeCommittees : filteredArchivedCommittees

  return (
    <div className="space-y-6" style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5 animate-[fadeIn_0.3s_ease]"
        style={{ borderBottom: '1.5px solid #e0f1ff' }}>
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
            <FolderGit style={{ color: '#95CBFF' }} />
            {_('筹委团管理', 'Committees')}
          </h1>
          <p className="text-sm mt-1 font-semibold" style={{ color: '#6b7280' }}>
            {_('筹委团 — 组建活动团队，追踪归档记录', 'Assemble event teams and trace archive records')}
          </p>
        </div>

        {isPowerUser && (
          <button
            onClick={() => {
              const year = new Date().getFullYear()
              setNewCommData({ name: '', session: `${year}/${year+1}`, start_date: '', end_date: '' })
              setShowCreateModal(true)
            }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black transition cursor-pointer text-white"
            style={{ background: '#95CBFF', boxShadow: '0 4px 16px rgba(149,203,255,0.4)' }}
          >
            <Plus size={16} />
            {_('新建筹委团', 'New Committee')}
          </button>
        )}
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
          <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
          <p>{successMsg}</p>
        </div>
      )}

      {/* Tabs Menu */}
      {!selectedComm && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-2 p-1 rounded-2xl max-w-xs shrink-0" style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
            <button
              onClick={() => setActiveTab('active')}
              className="flex-1 py-2 text-xs font-black rounded-xl transition cursor-pointer"
              style={{
                background: activeTab === 'active' ? 'white' : 'transparent',
                color: activeTab === 'active' ? '#6db8ff' : '#6b7280'
              }}
            >
               {_('进行中', 'Active')} ({activeCommittees.length})
            </button>
            <button
              onClick={() => setActiveTab('archived')}
              className="flex-1 py-2 text-xs font-black rounded-xl transition cursor-pointer"
              style={{
                background: activeTab === 'archived' ? 'white' : 'transparent',
                color: activeTab === 'archived' ? '#6db8ff' : '#6b7280'
              }}
            >
               {_('已归档', 'Archived')} ({archivedCommittees.length})
            </button>
          </div>

          {activeTab === 'archived' && (
            <select
              value={archiveYearFilter}
              onChange={(event) => setArchiveYearFilter(event.target.value)}
              className="w-full sm:w-48 text-xs font-black outline-none rounded-2xl cursor-pointer"
              style={{ ...inputStyle, background: 'white', padding: '9px 12px' }}
            >
              <option value="all">{_('所有年份', 'All Years')}</option>
              {archiveYears.map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
          <Loader size={32} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
           <p className="font-bold">{_('加载筹委团中...', 'Loading committees...')}</p>
        </div>
      )}

      {/* Cards List Grid (when no committee is selected) */}
      {!loading && !selectedComm && (
        currentTabComms.length === 0 ? (
          <div className="text-center py-20 rounded-3xl font-semibold"
            style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
             {_('没有找到相关筹委团。', 'No committees found.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-[fadeIn_0.3s_ease]">
            {currentTabComms.map(comm => (
              <div
                key={comm.id}
                onClick={() => setSelectedComm(comm)}
                className="p-6 rounded-3xl bg-white border border-[#e0f1ff] transition-all hover:scale-[1.02] hover:shadow-md cursor-pointer flex flex-col justify-between gap-5 relative overflow-hidden text-left"
                style={{ boxShadow: '0 4px 16px rgba(149,203,255,0.06)' }}
              >
                {/* Decoration blob */}
                <div className="absolute top-[-10px] right-[-10px] w-12 h-12 rounded-full opacity-10 pointer-events-none"
                  style={{ background: comm.is_archived ? '#9ca3af' : '#95CBFF' }} />

                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-black text-gray-400 uppercase tracking-wider block">
                        {_('届次', 'Session')} {comm.session}
                      </span>
                    {comm.is_archived && (
                      <span className="flex items-center gap-0.5 text-[9px] font-black bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full border border-gray-200">
                        <Lock size={9} /> {_('归档', 'Archived')}
                      </span>
                    )}
                  </div>
                  {comm.is_archived && (
                    <span className="inline-flex w-fit items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-full"
                      style={{ background: '#f0f7ff', color: '#4b8ed8', border: '1px solid #e0f1ff' }}>
                      {getCommitteeYear(comm)}
                    </span>
                  )}

                  <h3 className="font-black text-base text-gray-900 leading-snug line-clamp-1">
                    {comm.name}
                  </h3>

                  {comm.start_date && (
                    <p className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                      <Calendar size={11} />
                      {comm.start_date} {comm.end_date ? `~ ${comm.end_date}` : ''}
                    </p>
                  )}
                </div>

                <div className="space-y-2 pt-4" style={{ borderTop: '1.5px solid #f0f7ff' }}>
                  {/* Stats info */}
                  <div className="flex justify-between items-center text-xs font-black text-gray-500">
                    <span className="flex items-center gap-1">
                      <Users size={12} style={{ color: '#95CBFF' }} />
                      {comm.memberCount} {_('成员', 'members')}
                    </span>
                    <span>
                       {_('任务进度', 'Tasks')} {comm.completedTasks}/{comm.totalTasks}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-[#f0f7ff] h-2.5 rounded-full overflow-hidden border border-[#e0f1ff]">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${comm.progress}%`,
                        background: comm.is_archived ? '#9ca3af' : 'linear-gradient(90deg, #95CBFF 0%, #6db8ff 100%)'
                      }}
                    />
                  </div>
                </div>

              </div>
            ))}
          </div>
        )
      )}

      {/* Selected Committee Details Page (Vibrant Dynamic Interface) */}
      {!loading && selectedComm && (
        <div className="space-y-6 animate-[fadeIn_0.3s_ease] text-left">
          {/* Back button and title */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setSelectedComm(null); fetchCommittees(); }}
              className="px-3.5 py-1.5 rounded-xl text-xs font-black border border-[#e0f1ff] bg-white text-gray-500 hover:bg-[#f0f7ff] cursor-pointer"
            >
              ← {_('返回列表', 'Back')}
            </button>
            <h2 className="font-black text-lg text-gray-900">{selectedComm.name}</h2>
          </div>

          {canViewSelectedCommittee === null && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 rounded-3xl bg-white border border-[#e0f1ff] text-gray-500">
              <Loader size={28} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
              <p className="text-sm font-black">{_('检查筹委权限中...', 'Checking committee access...')}</p>
            </div>
          )}

          {canViewSelectedCommittee === false && (
            <div className="p-8 rounded-3xl bg-white border border-[#e0f1ff] text-center space-y-3"
              style={{ boxShadow: '0 4px 20px rgba(149,203,255,0.08)' }}>
              <Lock size={34} style={{ color: '#95CBFF', margin: '0 auto' }} />
              <h3 className="text-lg font-black text-gray-900">
                {_('仅限本筹委成员查看', 'Committee Members Only')}
              </h3>
              <p className="text-sm font-semibold text-gray-500 leading-relaxed max-w-lg mx-auto">
                {_('你可以看到有哪些筹委团，但只有被加入该筹委团后，才能查看成员名单、任务追踪和 Google Drive 内容。', 'You can see the committee list, but only members of this committee can view its member list, tasks, and Google Drive content.')}
              </p>
            </div>
          )}

          {canViewSelectedCommittee === true && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            
            {/* Left panels (2 columns): Members and Task checklist */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Committee Members list */}
              <div className="p-6 rounded-3xl bg-white border border-[#e0f1ff] space-y-4" style={{ boxShadow: '0 4px 20px rgba(149,203,255,0.06)' }}>
                <div className="flex justify-between items-center pb-3 border-b-1.5 border-[#f0f7ff]">
                  <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5">
                    <Users size={16} style={{ color: '#95CBFF' }} />
                    {_('筹委名单', 'Committee Members')} ({commMembers.length}{_('人', '')})
                  </h3>
                  {canManageSelectedCommittee && !selectedComm.is_archived && (
                    <button
                      onClick={() => setShowAddMemberModal(true)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-black rounded-xl text-white transition cursor-pointer"
                      style={{ background: '#95CBFF' }}
                    >
                      <UserPlus size={12} /> {_('招募筹委', 'Add Member')}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {commMembers.length === 0 ? (
                    <p className="text-xs text-gray-400 font-bold col-span-2 py-6 text-center">
                      {_('暂无筹委成员，请点击右上角按钮招募成员。', 'No members yet. Click "Add Member" above.')}
                    </p>
                  ) : (
                    commMembers.map(m => {
                      const userDetails = m.users || { name: _('未知成员', 'Unknown'), email: '', role: '' }
                      return (
                        <div key={m.user_id} className="p-3.5 rounded-2xl border border-[#e0f1ff] flex justify-between items-center bg-[#fcfcfc]">
                          <div className="flex items-center gap-3 min-w-0">
                            <UserAvatar user={userDetails} size={34} rounded={13} onClick={() => setAvatarPreviewUser(userDetails)} />
                            <div className="min-w-0">
                              <h4 className="font-black text-sm text-gray-800 truncate">{userDetails.name}</h4>
                              <span className="inline-block mt-1 text-[9px] font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                                {m.position}
                              </span>
                            </div>
                          </div>
                          {canManageSelectedCommittee && !selectedComm.is_archived && (
                            <button
                              onClick={() => handleRemoveMember(m.user_id)}
                              className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition cursor-pointer"
                              title={_('移出筹委团', 'Remove')}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Committee specific Tasks */}
              <div className="p-6 rounded-3xl bg-white border border-[#e0f1ff] space-y-4" style={{ boxShadow: '0 4px 20px rgba(149,203,255,0.06)' }}>
                <div className="flex justify-between items-center pb-3 border-b-1.5 border-[#f0f7ff]">
                  <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5">
                    <ListTodo size={16} style={{ color: '#95CBFF' }} />
                    {_('特定任务追踪', 'Task Tracking')} ({commTasks.length})
                  </h3>
                  {canManageSelectedCommittee && !selectedComm.is_archived && (
                    <button
                      onClick={() => {
                        setNewCommTask({ title: '', description: '', assigned_to: [], due_date: '', priority: 'medium' })
                        setShowTaskShortcutModal(true)
                      }}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-black rounded-xl text-white transition cursor-pointer"
                      style={{ background: '#95CBFF' }}
                    >
                      <Plus size={12} /> {_('指派筹委任务', 'Assign Task')}
                    </button>
                  )}
                </div>

                <div className="space-y-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {commTasks.length === 0 ? (
                    <p className="text-xs text-gray-400 font-bold py-8 text-center border-2 border-dashed border-gray-100 rounded-2xl">
                       {_('此筹委目前无独立任务。点击“指派任务”开始。', 'No tasks for this committee. Click "Assign Task" to start.')}
                    </p>
                  ) : (
                    commTasks.map(t => (
                      <div key={t.id} className="p-3.5 rounded-2xl border border-[#e0f1ff] flex items-center justify-between gap-3 bg-white">
                        <div className="space-y-1">
                          <h4 className="font-black text-xs text-gray-800">{t.title}</h4>
                          {t.due_date && (
                            <span className="text-[9px] font-bold text-gray-400 flex items-center gap-0.5">
                              <Calendar size={10} />
                              {new Date(t.due_date).toLocaleDateString()} {_('截止', 'due')}
                            </span>
                          )}
                        </div>

                        <span className="text-[9px] font-black px-2 py-0.5 rounded-full shrink-0"
                          style={{
                            background: t.status === 'completed' ? '#ecfdf5' : t.status === 'need_help' ? '#fffbeb' : '#f0f7ff',
                            color: t.status === 'completed' ? '#10b981' : t.status === 'need_help' ? '#d97706' : '#3b82f6',
                            border: t.status === 'completed' ? '1px solid #a7f3d0' : t.status === 'need_help' ? '1px solid #fde68a' : '1px solid #bfdbfe'
                          }}
                        >
                          {t.status === 'completed' ? _('已完成', 'Completed') : t.status === 'need_help' ? _('需协助', 'Needs Help') : t.status === 'in_progress' ? _('进行中', 'In Progress') : _('待开始', 'Pending')}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* Right side panels: Settings & Google Drive Links */}
            <div className="space-y-6">
              
              {/* Google Drive links binder */}
              <div className="p-6 rounded-3xl bg-white border border-[#e0f1ff] space-y-4" style={{ boxShadow: '0 4px 20px rgba(149,203,255,0.06)' }}>
                <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5 pb-3 border-b-1.5 border-[#f0f7ff]">
                  <ExternalLink size={16} style={{ color: '#95CBFF' }} />
                  {_('文件归档 Google Drive', 'Google Drive Archive')}
                </h3>
                
                <div className="space-y-3.5">
                  <p className="text-xs font-semibold text-gray-400 leading-relaxed">
                    {_('请将当前筹委团专属的 Google Drive 共享文件夹链接贴在下方，以便所有成员点击直达查阅。', 'Paste the Google Drive shared folder link below for all members to access.')}
                  </p>
                  
                  <input
                    type="url"
                    value={commDriveLink}
                    onChange={(e) => setCommDriveLink(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    disabled={selectedComm.is_archived}
                    className="w-full text-xs font-semibold outline-none py-2.5 transition"
                    style={{ ...inputStyle, background: selectedComm.is_archived ? '#f5f5f5' : '#f0f7ff' }}
                  />

                  {commDriveLink && (
                    <a
                      href={commDriveLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2 px-3 text-xs font-black text-center flex items-center justify-center gap-1 rounded-xl text-blue-600 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition cursor-pointer"
                    >
                      {_('点击打开 Google Drive 目录', 'Open Google Drive Folder')} <ExternalLink size={12} />
                    </a>
                  )}

                  {canManageSelectedCommittee && !selectedComm.is_archived && (
                    <button
                      onClick={handleSaveDriveLink}
                      className="w-full py-2.5 rounded-2xl text-xs font-black text-white cursor-pointer transition shrink-0"
                      style={{ background: '#95CBFF' }}
                    >
                      {_('保存并绑定链接', 'Save Drive Link')}
                    </button>
                  )}
                </div>
              </div>

              {/* Lock & Archiving controls */}
              {isPowerUser && (
                <div className="p-6 rounded-3xl bg-amber-50 border border-amber-200 space-y-4">
                  <h3 className="font-black text-sm text-amber-800 flex items-center gap-1.5 pb-2 border-b border-amber-100">
                    <Lock size={15} /> {_('筹委团管理选项', 'Committee Settings')}
                  </h3>
                  
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-amber-600 leading-relaxed">
                      {selectedComm.is_archived 
                        ? _('此筹委团目前已被归档锁定。所有任务和成员构成均为只读状态，无法再进行增删改查。', 'This committee is archived and locked. All data is read-only.')
                        : _('当活动成功结束、账目和文书工作交接完成时，可点击归档。归档后，此团队的数据将永久转为只读形式。', 'When the event is completed, archive the committee. All data will become read-only.')
                      }
                    </p>

                    {!selectedComm.is_archived && (
                      <button
                        onClick={handleArchiveCommittee}
                        className="w-full py-2.5 rounded-2xl text-xs font-black text-white transition bg-amber-500 hover:bg-amber-600 cursor-pointer"
                      >
                        {_('🔒 一键归档当前活动', '🔒 Archive Committee')}
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>

          </div>
          )}
        </div>
      )}

      {/* Create Committee Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-xs">
          <div className="bg-white border border-[#e0f1ff] rounded-3xl w-full max-w-md shadow-2xl overflow-hidden text-left">
            <div className="px-6 py-4 flex items-center justify-between border-b-1.5 border-[#e0f1ff]">
              <h3 className="font-black text-base flex items-center gap-2 text-gray-900">
                <FolderGit size={18} style={{ color: '#95CBFF' }} />
                {_('新建筹委活动团队', 'New Committee')}
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-lg transition cursor-pointer font-black text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
            <form onSubmit={handleCreateCommittee} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('活动筹委团名称', 'Committee Name')}</label>
                <input
                  type="text"
                  required
                  value={newCommData.name}
                  onChange={(e) => setNewCommData({ ...newCommData, name: e.target.value })}
                  placeholder={_('例如: 华文学会50周年庆筹委团', 'e.g. CLC_sys 50th Anniversary Committee')}
                  className="w-full text-sm font-semibold outline-none py-2.5 transition"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('归属年度届次', 'Session')}</label>
                <input
                  type="text"
                  required
                  value={newCommData.session}
                  onChange={(e) => setNewCommData({ ...newCommData, session: e.target.value })}
                  placeholder={_('例如: 2026/2027', 'e.g. 2026/2027')}
                  className="w-full text-sm font-semibold outline-none py-2.5 transition"
                  style={inputStyle}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('筹备开始', 'Start Date')}</label>
                  <input
                    type="date"
                    value={newCommData.start_date}
                    onChange={(e) => setNewCommData({ ...newCommData, start_date: e.target.value })}
                    className="w-full text-sm font-semibold outline-none py-2 transition"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('活动日期', 'Event Date')}</label>
                  <input
                    type="date"
                    value={newCommData.end_date}
                    onChange={(e) => setNewCommData({ ...newCommData, end_date: e.target.value })}
                    className="w-full text-sm font-semibold outline-none py-2 transition"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-1.5 border-[#f0f7ff]">
                <button type="button" onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer"
                  style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
                  {_('取消', 'Cancel')}
                </button>
                <button type="submit" disabled={formSubmitting}
                  className="px-4 py-2 rounded-2xl text-xs font-black text-white transition cursor-pointer"
                  style={{ background: '#95CBFF', opacity: formSubmitting ? 0.7 : 1 }}
                >
                  {formSubmitting ? _('保存中...', 'Saving...') : _('确认创建', 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recruits / Add Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-xs">
          <div className="bg-white border border-[#e0f1ff] rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden text-left">
            <div className="px-6 py-4 flex items-center justify-between border-b-1.5 border-[#e0f1ff]">
              <h3 className="font-black text-base flex items-center gap-2 text-gray-900">
                <UserPlus size={18} style={{ color: '#95CBFF' }} />
                {_('招募筹备干事成员', 'Add Committee Member')}
              </h3>
              <button onClick={() => setShowAddMemberModal(false)} className="text-lg transition cursor-pointer font-black text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleAddMember} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('选择已有成员账号', 'Select an Existing Account')}</label>
                <select
                  required
                  value={newMemberData.user_id}
                  onChange={(e) => setNewMemberData({ ...newMemberData, user_id: e.target.value })}
                  className="w-full text-sm outline-none py-2.5 transition cursor-pointer"
                  style={{ ...inputStyle, background: 'white' }}
                >
                  <option value="">{_('-- 请选择一名成员 --', '-- Select a member --')}</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('在此筹委团内的职位', 'Position')}</label>
                <select
                  value={newMemberData.position}
                  onChange={(e) => {
                    setNewMemberData({ ...newMemberData, position: e.target.value })
                    if (e.target.value !== CUSTOM_POSITION_VALUE) setCustomMemberPosition('')
                  }}
                  className="w-full text-sm outline-none py-2.5 transition cursor-pointer"
                  style={{ ...inputStyle, background: 'white' }}
                >
                  {COMMITTEE_POSITION_OPTIONS.map(position => (
                    <option key={position.value} value={position.value}>
                      {_(position.zh, position.en)}
                    </option>
                  ))}
                  <option value={CUSTOM_POSITION_VALUE}>{_('自定义职位...', 'Custom Position...')}</option>
                </select>
                {newMemberData.position === CUSTOM_POSITION_VALUE && (
                  <input
                    type="text"
                    required
                    value={customMemberPosition}
                    onChange={(e) => setCustomMemberPosition(e.target.value)}
                    placeholder={_('例如：舞台组组长、报名处负责人', 'e.g. Stage Lead, Registration Lead')}
                    className="w-full text-sm font-semibold outline-none py-2.5 transition mt-3"
                    style={inputStyle}
                  />
                )}
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-1.5 border-[#f0f7ff]">
                <button type="button" onClick={() => setShowAddMemberModal(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer"
                  style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
                  {_('取消', 'Cancel')}
                </button>
                <button type="submit" disabled={formSubmitting}
                  className="px-4 py-2 rounded-2xl text-xs font-black text-white transition cursor-pointer"
                  style={{ background: '#95CBFF', opacity: formSubmitting ? 0.7 : 1 }}
                >
                  {formSubmitting ? _('保存中...', 'Saving...') : _('确认加入', 'Add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Shortcut Modal */}
      {showTaskShortcutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-xs">
          <div className="bg-white border border-[#e0f1ff] rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden text-left flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 flex items-center justify-between border-b-1.5 border-[#e0f1ff] shrink-0">
              <h3 className="font-black text-base flex items-center gap-2 text-gray-900">
                <ListTodo size={18} style={{ color: '#95CBFF' }} />
                {_('指派独立活动筹备任务', 'Assign Task')}
              </h3>
              <button onClick={() => setShowTaskShortcutModal(false)} className="text-lg transition cursor-pointer font-black text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <form onSubmit={handleCreateTaskShortcut} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('任务名称', 'Task Name')}</label>
                <input
                  type="text"
                  required
                  value={newCommTask.title}
                  onChange={(e) => setNewCommTask({ ...newCommTask, title: e.target.value })}
                  placeholder={_('例如: 借用多媒体活动教室', 'e.g. Book multimedia room')}
                  className="w-full text-sm font-semibold outline-none py-2.5 transition"
                  style={inputStyle}
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('详细描述', 'Description')}</label>
                <textarea
                  value={newCommTask.description}
                  onChange={(e) => setNewCommTask({ ...newCommTask, description: e.target.value })}
                  placeholder={_('描述该项任务的具体细节...', 'Describe the task details...')}
                  rows={2}
                  className="w-full text-sm font-semibold outline-none py-2 transition"
                  style={{ ...inputStyle, borderRadius: 20 }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('截止日期', 'Due Date')}</label>
                  <input
                    type="datetime-local"
                    value={newCommTask.due_date}
                    onChange={(e) => setNewCommTask({ ...newCommTask, due_date: e.target.value })}
                    className="w-full text-sm font-semibold outline-none py-2.5 transition"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('优先级', 'Priority')}</label>
                  <select
                    value={newCommTask.priority}
                    onChange={(e) => setNewCommTask({ ...newCommTask, priority: e.target.value })}
                    className="w-full text-sm outline-none py-2.5 transition cursor-pointer"
                    style={{ ...inputStyle, background: 'white' }}
                  >
                    <option value="high">{_('🔴 高', '🔴 High')}</option>
                    <option value="medium">{_('🟡 中', '🟡 Medium')}</option>
                    <option value="low">{_('⚪ 低', '⚪ Low')}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">{_('指派给哪些筹委 (可多选)', 'Assign To (Multiple)')}</label>
                {/* Only users assigned to this committee */}
                <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl max-h-[140px] overflow-y-auto"
                  style={{ background: '#f0f7ff', border: '1.5px solid #95CBFF' }}>
                  {commMembers.map(m => {
                    const u = m.users || { name: _('未知成员', 'Unknown'), email: '' }
                    const isChecked = newCommTask.assigned_to.includes(m.user_id)
                    return (
                      <button
                        type="button"
                        key={m.user_id}
                        onClick={() => handleTaskAssigneeToggle(m.user_id)}
                        className="px-2 py-1.5 truncate text-xs rounded-xl font-bold flex items-center gap-1.5 transition text-left"
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
                  {commMembers.length === 0 && (
                    <p className="text-[10px] text-gray-400 font-bold py-2 col-span-2 text-center">{_('请先往筹委名单中招募成员！', 'Add members to the committee first!')}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t-1.5 border-[#f0f7ff] shrink-0">
                <button type="button" onClick={() => setShowTaskShortcutModal(false)}
                  className="px-4 py-2 rounded-2xl text-xs font-bold transition cursor-pointer"
                  style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
                  {_('取消', 'Cancel')}
                </button>
                <button type="submit" disabled={formSubmitting || commMembers.length === 0}
                  className="px-4 py-2 rounded-2xl text-xs font-black text-white transition cursor-pointer"
                  style={{ background: '#95CBFF', opacity: formSubmitting ? 0.7 : 1 }}
                >
                  {formSubmitting ? _('发布中...', 'Publishing...') : _('发布任务', 'Assign Task')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <AvatarPreviewModal user={avatarPreviewUser} lang={lang} onClose={() => setAvatarPreviewUser(null)} />

    </div>
  )
}
