import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { createClient } from '@supabase/supabase-js'
import { UserPlus, Search, Edit2, Shield, UserX, UserCheck, AlertCircle, Loader } from 'lucide-react'
import PositionSelect from '../components/PositionSelect'
import UserAvatar from '../components/UserAvatar'
import AvatarPreviewModal from '../components/AvatarPreviewModal'

const ROLE_OPTIONS = [
  { value: 'convener_teacher', zh: '召集老师', en: 'Convener Teacher', bg: '#ffe4ec', color: '#be185d', border: '#FFB3C6' },
  { value: 'advisor_teacher', zh: '指导老师', en: 'Advisor Teacher', bg: '#fff1f2', color: '#e11d48', border: '#fecdd3' },
  { value: 'chairperson', zh: '主席', en: 'President', bg: '#e0f1ff', color: '#2E86C1', border: '#95CBFF' },
  { value: 'vice_chairperson', zh: '副主席', en: 'Vice President', bg: '#ede9fe', color: '#7c3aed', border: '#c4b5fd' },
  { value: 'secretary', zh: '正文书', en: 'Secretary', bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
  { value: 'vice_secretary', zh: '副文书', en: 'Vice Secretary', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  { value: 'treasurer', zh: '正财政', en: 'Treasurer', bg: '#fef9c3', color: '#ca8a04', border: '#fde047' },
  { value: 'vice_treasurer', zh: '副财政', en: 'Vice Treasurer', bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
  { value: 'general_affairs', zh: '正总务', en: 'General Affairs', bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
  { value: 'vice_general_affairs', zh: '副总务', en: 'Vice General Affairs', bg: '#f0f9ff', color: '#0284c7', border: '#bae6fd' },
  { value: 'activity_lead', zh: '活动组组长', en: 'Activity Lead', bg: '#fef3c7', color: '#d97706', border: '#fcd34d' },
  { value: 'vice_activity_lead', zh: '活动组副组长', en: 'Vice Activity Lead', bg: '#fff7ed', color: '#ea580c', border: '#fed7aa' },
  { value: 'activity_member', zh: '活动组组员', en: 'Activity Member', bg: '#f5f5f5', color: '#6b7280', border: '#d1d5db' },
  { value: 'media_lead', zh: '正摄影', en: 'Photographer', bg: '#fce7f3', color: '#db2777', border: '#f9a8d4' },
  { value: 'vice_media_lead', zh: '副摄影', en: 'Vice Photographer', bg: '#fdf2f8', color: '#be185d', border: '#fbcfe8' },
  { value: 'ordinary_member', zh: '普通会员', en: 'Ordinary Member', bg: '#eef2ff', color: '#4f46e5', border: '#c7d2fe' },
  { value: 'custom', zh: '自定义', en: 'Custom', bg: '#f3f4f6', color: '#4b5563', border: '#d1d5db' }
]

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map(role => [role.value, role]))
const getMemberRoleLabel = (member) => {
  const base = ROLE_LABELS[member.role] || { zh: member.role, en: member.role, bg: '#f5f5f5', color: '#6b7280', border: '#d1d5db' }
  if (member.role === 'custom' && member.custom_role_label) {
    return { ...base, zh: member.custom_role_label, en: member.custom_role_label }
  }
  return base
}
const BOARD_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor']
const TASK_MANAGER_ROLES = [...BOARD_MANAGER_ROLES, 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead']
const inputStyle = {
  background: '#f0f7ff',
  border: '1.5px solid #95CBFF',
  color: '#1a1a1a',
  borderRadius: 16,
  fontFamily: "'Nunito', sans-serif",
  fontWeight: 700
}

const selectStyle = {
  background: '#f0f7ff',
  border: '1.5px solid #95CBFF',
  color: '#1a1a1a',
  borderRadius: 16,
  fontFamily: "'Nunito', sans-serif",
  fontWeight: 700
}

export default function Members({ currentUserProfile, lang }) {
  const _ = (zh, en) => lang === 'zh' ? zh : en
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('active')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [avatarPreviewUser, setAvatarPreviewUser] = useState(null)
  const [formData, setFormData] = useState({ name: '', email: '', role: 'ordinary_member', custom_role_label: '', birthday: '', password: '', is_active: true })
  const [formSubmitting, setFormSubmitting] = useState(false)

  const isPowerUser = BOARD_MANAGER_ROLES.includes(currentUserProfile?.role)

  useEffect(() => { fetchMembers() }, [])

  const validateCustomRole = () => {
    if (formData.role !== 'custom') return true
    if (formData.custom_role_label?.trim()) return true
    setErrorMsg(_('请输入自定义职称名称', 'Please enter a custom role name.'))
    return false
  }

  const fetchMembers = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setMembers(data || [])
    } catch (err) {
      setErrorMsg(err.message || _('获取成员列表失败', 'Failed to load members.'))
    } finally {
      setLoading(false)
    }
  }

  const addToCurrentBoardRoster = async (userId, role, customRoleLabel) => {
    if (!userId) return false

    const { data: currentBoard, error: boardError } = await supabase
      .from('teams')
      .select('id')
      .eq('type', 'board')
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (boardError) throw boardError
    if (!currentBoard?.id) return false

    const { error: memberError } = await supabase
      .from('team_members')
      .upsert({
        team_id: currentBoard.id,
        user_id: userId,
        position: role === 'custom' && customRoleLabel ? customRoleLabel : (ROLE_LABELS[role]?.zh || role),
      }, { onConflict: 'team_id,user_id' })

    if (memberError) throw memberError
    return true
  }

  const handleToggleStatus = async (member) => {
    if (!isPowerUser) return
    setErrorMsg('')
    setSuccessMsg('')
    const nextStatus = !member.is_active
    const confirmMsg = nextStatus
      ? _(`确定要重新启用 ${member.name} 的账号吗？`, `Reactivate ${member.name}'s account?`)
      : _(`确定要停用 ${member.name} 的账号吗？停用后该成员将无法登录系统。`, `Deactivate ${member.name}'s account? They will not be able to log in.`)
    if (!window.confirm(confirmMsg)) return
    try {
      if (!validateCustomRole()) return
      const { error } = await supabase.from('users').update({ is_active: nextStatus }).eq('id', member.id)
      if (error) throw error
      setSuccessMsg(nextStatus ? _('账号已启用', 'Account activated.') : _('账号已停用', 'Account deactivated.'))
      fetchMembers()
    } catch (err) {
      setErrorMsg(err.message)
    }
  }

  const handleAddMember = async (e) => {
    e.preventDefault()
    setFormSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      if (!validateCustomRole()) return
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      const tempClient = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false } })
      const { data, error } = await tempClient.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: { data: { name: formData.name, role: formData.role, custom_role_label: formData.role === 'custom' ? formData.custom_role_label.trim() : null } }
      })
      if (error) throw error
      if (formData.birthday && data?.user?.id) {
        const { error: birthdayError } = await supabase
          .from('users')
          .update({ birthday: formData.birthday })
          .eq('id', data.user.id)
        if (birthdayError) throw birthdayError
      }
      setSuccessMsg(_(`成功添加账号 ${formData.name}。`, `Account ${formData.name} created.`))
      setShowAddModal(false)
      setFormData({ name: '', email: '', role: 'ordinary_member', custom_role_label: '', birthday: '', password: '', is_active: true })
      fetchMembers()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleEditMemberSubmit = async (e) => {
    e.preventDefault()
    setFormSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const { error } = await supabase.from('users').update({ name: formData.name, role: formData.role, custom_role_label: formData.role === 'custom' ? formData.custom_role_label.trim() : null, birthday: formData.birthday || null }).eq('id', selectedMember.id)
      if (error) throw error
      setSuccessMsg(_(`成功修改账号 ${formData.name} 的信息。`, `Account ${formData.name} updated.`))
      await addToCurrentBoardRoster(selectedMember.id, formData.role, formData.custom_role_label?.trim())
      setShowEditModal(false)
      fetchMembers()
    } catch (err) {
      setErrorMsg(err.message)
    } finally {
      setFormSubmitting(false)
    }
  }

  const openEditModal = (member) => {
    setSelectedMember(member)
    setFormData({ name: member.name, email: member.email, role: member.role, custom_role_label: member.custom_role_label || '', birthday: member.birthday || '', is_active: member.is_active })
    setShowEditModal(true)
  }

  const filteredMembers = members.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase()) || m.email.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesRole = roleFilter === 'all' || m.role === roleFilter
    const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' && m.is_active) || (statusFilter === 'inactive' && !m.is_active)
    return matchesSearch && matchesRole && matchesStatus
  })

  const modalOverlay = { position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(149,203,255,0.15)', backdropFilter: 'blur(4px)', padding: 16 }
  const modalCard = { background: 'white', border: '1.5px solid #e0f1ff', borderRadius: 24, width: '100%', maxWidth: 440, overflow: 'hidden', boxShadow: '0 8px 40px rgba(149,203,255,0.3)' }

  return (
    <div className="space-y-6" style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-5"
        style={{ borderBottom: '1.5px solid #e0f1ff' }}>
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
            <Shield style={{ color: '#95CBFF' }} />
            {_('系统账号管理', 'Members')}
          </h1>
          <p className="text-sm mt-1 font-semibold" style={{ color: '#6b7280' }}>
            {_('系统账号 — 管理所有成员、召集老师、指导老师与普通会员账号', 'Manage all member accounts, convener, advisor, and ordinary members.')}
          </p>
        </div>
        {isPowerUser && (
          <button
            onClick={() => { setFormData({ name: '', email: '', role: 'ordinary_member', custom_role_label: '', birthday: '', password: '', is_active: true }); setShowAddModal(true) }}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black transition cursor-pointer"
            style={{ background: '#95CBFF', color: 'white', boxShadow: '0 4px 16px rgba(149,203,255,0.4)' }}>
            <UserPlus size={16} />
            {_('添加账号', 'Add Account')}
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
        <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold"
          style={{ background: '#dcfce7', border: '1.5px solid #86efac', color: '#16a34a' }}>
          <UserCheck size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
          <p>{successMsg}</p>
        </div>
      )}


      {/* Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-2xl"
        style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
        <div className="relative md:col-span-2">
          <Search size={16} style={{ position: 'absolute', left: 14, top: 12, color: '#95CBFF' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={_('搜索姓名或邮箱', 'Search by name or email')}
            className="w-full pl-10 pr-4 py-2.5 text-sm outline-none transition"
            style={inputStyle}
          />
        </div>
        <div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full px-3 py-2.5 text-sm outline-none transition" style={selectStyle}>
            <option value="all">{_('所有职务', 'All Roles')}</option>
            {ROLE_OPTIONS.map(role => (
              <option key={role.value} value={role.value}>{role[lang]}</option>
            ))}
          </select>
        </div>
        <div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full px-3 py-2.5 text-sm outline-none transition" style={selectStyle}>
            <option value="all">{_('所有状态', 'All Status')}</option>
            <option value="active">{_('使用中', 'Active')}</option>
            <option value="inactive">{_('已停用', 'Inactive')}</option>
          </select>
        </div>
      </div>

      {/* Member Table */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3" style={{ color: '#6b7280' }}>
          <Loader size={30} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
          <p className="font-bold">{_('加载成员列表中...', 'Loading members...')}</p>
        </div>
      ) : filteredMembers.length === 0 ? (
        <div className="text-center py-16 rounded-2xl font-semibold"
          style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
          {_('没有找到符合条件的成员', 'No members found.')}
        </div>
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-2xl" style={{ border: '1.5px solid #e0f1ff' }}>
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr style={{ background: '#95CBFF' }}>
                  {[_('姓名', 'Name'), _('邮箱', 'Email'), _('职务', 'Role'), _('状态', 'Status'), ...(isPowerUser ? [_('操作', 'Actions')] : [])].map(h => (
                    <th key={h} className="py-4 px-5 font-black" style={{ color: 'white' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredMembers.map((m, idx) => {
                  const roleLabel = getMemberRoleLabel(m)
                  return (
                    <tr key={m.id} style={{ background: idx % 2 === 0 ? 'white' : '#f7fbff', borderBottom: '1px solid #e0f1ff' }}>
                      <td className="py-4 px-5">
                        <div className="flex items-center gap-3">
                          <UserAvatar user={m} size={34} rounded={13} onClick={() => setAvatarPreviewUser(m)} />
                          <span className="font-black" style={{ color: '#1a1a1a' }}>{m.name}</span>
                        </div>
                      </td>
                      <td className="py-4 px-5 font-mono text-xs font-semibold" style={{ color: '#6b7280' }}>{m.email}</td>
                      <td className="py-4 px-5">
                        <span className="px-2.5 py-1 text-xs font-black rounded-full"
                          style={{ background: roleLabel.bg, color: roleLabel.color, border: `1.5px solid ${roleLabel.border}` }}>
                          {roleLabel[lang]}
                        </span>
                      </td>
                      <td className="py-4 px-5">
                        {m.is_active ? (
                          <span className="flex items-center gap-1.5 text-xs font-black" style={{ color: '#16a34a' }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
 {_('使用中', 'Active')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5 text-xs font-black" style={{ color: '#9ca3af' }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: '#9ca3af' }} />
                            {_('已停用', 'Inactive')}
                          </span>
                        )}
                      </td>
                      {isPowerUser && (
                        <td className="py-4 px-5">
                          <div className="flex justify-end gap-2">
                            <button onClick={() => openEditModal(m)}
                              className="p-1.5 rounded-xl transition cursor-pointer"
                              style={{ border: '1.5px solid #e0f1ff', background: 'white', color: '#6b7280' }}
                              title={_('编辑', 'Edit')}>
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleToggleStatus(m)}
                              className="p-1.5 rounded-xl transition cursor-pointer"
                              style={{
                                border: m.is_active ? '1.5px solid #fca5a5' : '1.5px solid #86efac',
                                background: m.is_active ? '#fee2e2' : '#dcfce7',
                                color: m.is_active ? '#dc2626' : '#16a34a'
                              }}
                              title={m.is_active ? _('停用', 'Deactivate') : _('启用', 'Activate')}
                              disabled={m.id === currentUserProfile.id}>
                              {m.is_active ? <UserX size={14} /> : <UserCheck size={14} />}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 lg:hidden">
            {filteredMembers.map((m) => {
              const roleLabel = getMemberRoleLabel(m)
              return (
                <div key={m.id} className="p-4 rounded-2xl flex flex-col justify-between gap-4"
                  style={{ border: '1.5px solid #e0f1ff', background: 'white', boxShadow: '0 2px 12px rgba(149,203,255,0.12)' }}>
                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <UserAvatar user={m} size={34} rounded={13} onClick={() => setAvatarPreviewUser(m)} />
                          <div>
                            <h4 className="font-black text-base" style={{ color: '#1a1a1a' }}>{m.name}</h4>
                            <p className="font-mono text-xs mt-0.5 font-semibold" style={{ color: '#6b7280' }}>{m.email}</p>
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 text-[10px] font-black rounded-full shrink-0"
                        style={{ background: roleLabel.bg, color: roleLabel.color, border: `1.5px solid ${roleLabel.border}` }}>
                        {roleLabel[lang]}
                      </span>
                    </div>
                    <div className="text-xs pt-1.5" style={{ borderTop: '1.5px solid #f0f7ff' }}>
                      {m.is_active ? (
                        <span className="inline-flex items-center gap-1.5 font-black" style={{ color: '#16a34a' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#22c55e' }} />
                          {_('使用中', 'Active')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 font-black" style={{ color: '#9ca3af' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#9ca3af' }} />
                          {_('已停用', 'Inactive')}
                        </span>
                      )}
                    </div>
                  </div>
                  {isPowerUser && (
                    <div className="flex gap-2 justify-end pt-3 mt-1" style={{ borderTop: '1.5px solid #f0f7ff' }}>
                      <button onClick={() => openEditModal(m)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                        style={{ border: '1.5px solid #e0f1ff', background: '#f0f7ff', color: '#6b7280' }}>
                        <Edit2 size={12} />{_('编辑', 'Edit')}
                      </button>
                      <button onClick={() => handleToggleStatus(m)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer"
                        style={{
                          border: m.is_active ? '1.5px solid #fca5a5' : '1.5px solid #86efac',
                          background: m.is_active ? '#fee2e2' : '#dcfce7',
                          color: m.is_active ? '#dc2626' : '#16a34a'
                        }}
                        disabled={m.id === currentUserProfile.id}>
                        {m.is_active ? <><UserX size={12} />{_('停用', 'Deactivate')}</> : <><UserCheck size={12} />{_('启用', 'Activate')}</>}
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: '1.5px solid #e0f1ff' }}>
              <h3 className="font-black text-lg flex items-center gap-2" style={{ color: '#1a1a1a' }}>
                <UserPlus size={18} style={{ color: '#95CBFF' }} />{_('添加账号', 'Add Account')}
              </h3>
              <button onClick={() => setShowAddModal(false)}
                className="text-lg transition cursor-pointer font-black" style={{ color: '#6b7280' }}>✕</button>
            </div>
            <form onSubmit={handleAddMember} className="p-6 space-y-4">
              {[
                { label: _('成员姓名', 'Name'), key: 'name', type: 'text', placeholder: _('如: 陈大文', 'e.g. Chen Da-wen') },
                { label: _('登录邮箱', 'Email'), key: 'email', type: 'email', placeholder: 'member@huawenxuehui.com' },
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>{f.label}</label>
                  <input type={f.type} required value={formData[f.key]}
                    onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                    placeholder={f.placeholder} className="w-full px-3 py-2 text-sm outline-none transition" style={inputStyle} />
                </div>
              ))}
              <PositionSelect
                value={formData.role}
                onChange={(val) => setFormData({ ...formData, role: val })}
                customLabel={formData.custom_role_label}
                onCustomLabelChange={(label) => setFormData({ ...formData, custom_role_label: label })}
                lang={lang}
              />
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>{_('生日', 'Birthday')}</label>
                <input type="date" value={formData.birthday}
                  onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                  className="w-full px-3 py-2 text-sm outline-none transition" style={inputStyle} />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>{_('初始登录密码', 'Initial Password')}</label>
                <input type="password" required value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={_('至少 6 位密码', 'Min 6 characters')} minLength={6}
                  className="w-full px-3 py-2 text-sm outline-none transition" style={inputStyle} />
              </div>
              <div className="flex items-center gap-2.5 text-xs p-3 rounded-2xl font-semibold"
                style={{ background: '#fef9c3', border: '1.5px solid #fde047', color: '#ca8a04' }}>
                <AlertCircle size={14} style={{ flexShrink: 0 }} />
                <p>{_('提交后，系统将自动为该用户分配账号。成员可通过此邮箱与设定的初始密码登录。', 'The system will create an account via Supabase Auth. The member can log in with this email and the initial password.')}</p>
              </div>
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-2xl text-sm font-bold transition cursor-pointer"
                  style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>取消</button>
                <button type="submit" disabled={formSubmitting}
                  className="px-4 py-2 rounded-2xl text-sm font-black transition cursor-pointer"
                  style={{ background: '#95CBFF', color: 'white', opacity: formSubmitting ? 0.7 : 1 }}>
                  {formSubmitting ? _('保存中...', 'Saving...') : _('确认创建', 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Member Modal */}
      {showEditModal && selectedMember && (
        <div style={modalOverlay}>
          <div style={modalCard}>
            <div className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: '1.5px solid #e0f1ff' }}>
              <h3 className="font-black text-lg flex items-center gap-2" style={{ color: '#1a1a1a' }}>
                <Edit2 size={18} style={{ color: '#95CBFF' }} />{_('修改账号信息', 'Edit Account')}
              </h3>
              <button onClick={() => setShowEditModal(false)}
                className="text-lg transition cursor-pointer font-black" style={{ color: '#6b7280' }}>✕</button>
            </div>
            <form onSubmit={handleEditMemberSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>{_('登录邮箱', 'Email')}</label>
                <input type="email" disabled value={formData.email}
                  className="w-full px-3 py-2 text-sm outline-none font-mono"
                  style={{ ...inputStyle, background: '#f5f5f5', color: '#9ca3af', cursor: 'not-allowed' }} />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>{_('成员姓名', 'Name')}</label>
                <input type="text" required value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder={_('如: 陈大文', 'e.g. Chen Da-wen')} className="w-full px-3 py-2 text-sm outline-none transition" style={inputStyle} />
              </div>
              <PositionSelect
                value={formData.role}
                onChange={(val) => setFormData({ ...formData, role: val })}
                customLabel={formData.custom_role_label}
                onCustomLabelChange={(label) => setFormData({ ...formData, custom_role_label: label })}
                disabled={selectedMember.id === currentUserProfile.id}
                lang={lang}
              />
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>{_('生日', 'Birthday')}</label>
                <input type="date" value={formData.birthday}
                  onChange={(e) => setFormData({ ...formData, birthday: e.target.value })}
                  className="w-full px-3 py-2 text-sm outline-none transition" style={inputStyle} />
              </div>
              {selectedMember.id === currentUserProfile.id && (
                <p className="text-[10px] mt-1 font-semibold" style={{ color: '#9ca3af' }}>
                  {_('不可更改你自己的系统角色，以防止系统锁定。', 'You cannot change your own role to prevent system lockout.')}
                </p>
              )}
              <div className="flex justify-end gap-3 pt-3">
                <button type="button" onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 rounded-2xl text-sm font-bold transition cursor-pointer"
                  style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>{_('取消', 'Cancel')}</button>
                <button type="submit" disabled={formSubmitting}
                  className="px-4 py-2 rounded-2xl text-sm font-black transition cursor-pointer"
                  style={{ background: '#95CBFF', color: 'white', opacity: formSubmitting ? 0.7 : 1 }}>
                  {formSubmitting ? _('保存中...', 'Saving...') : _('确认更新', 'Update')}
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
