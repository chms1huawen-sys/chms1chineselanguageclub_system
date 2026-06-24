import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import UserAvatar from '../components/UserAvatar'
import {
  AlertCircle,
  BriefcaseBusiness,
  CheckCircle,
  ExternalLink,
  FolderOpen,
  Loader,
  Save,
  ShieldCheck,
} from 'lucide-react'

const EXECUTIVE_DRIVE_SETTING_KEY = 'executive_drive_folder_url'
const DEFAULT_EXECUTIVE_DRIVE_URL = import.meta.env.VITE_EXECUTIVE_DRIVE_FOLDER_URL || ''

const EXECUTIVE_ROLES = [
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
  'custom',
]

const ROLE_ORDER = [
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
  'custom',
]

const DRIVE_MANAGER_ROLES = [
  'convener_teacher',
  'advisor_teacher',
  'advisor',
  'chairperson',
  'vice_chairperson',
  'secretary',
  'vice_secretary',
]

const ROLE_LABELS = {
  convener_teacher: { zh: '召集老师', en: 'Convener Teacher' },
  advisor_teacher: { zh: '指导老师', en: 'Advisor Teacher' },
  advisor: { zh: '指导老师', en: 'Advisor Teacher' },
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
  custom: { zh: '自定义岗位', en: 'Custom Position' },
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
  fontWeight: 800,
  padding: '12px 14px',
  outline: 'none',
}

const getRoleText = (profile, lang) => {
  if (!profile) return '-'
  if (profile.role === 'custom' && profile.custom_role_label) return profile.custom_role_label
  return ROLE_LABELS[profile.role]?.[lang] || profile.role || '-'
}

const sortExecutiveMembers = (members = []) => [...members].sort((a, b) => {
  const roleDiff = ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role)
  if (roleDiff !== 0) return roleDiff
  return (a.name || '').localeCompare(b.name || '', 'zh-Hans')
})

export default function ExecutiveManagement({ currentUserProfile, lang = 'zh', notify }) {
  const [driveUrl, setDriveUrl] = useState(DEFAULT_EXECUTIVE_DRIVE_URL)
  const [driveDraft, setDriveDraft] = useState(DEFAULT_EXECUTIVE_DRIVE_URL)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [membersLoading, setMembersLoading] = useState(true)
  const [executiveMembers, setExecutiveMembers] = useState([])
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const isExecutive = EXECUTIVE_ROLES.includes(currentUserProfile?.role)
  const canManageDrive = DRIVE_MANAGER_ROLES.includes(currentUserProfile?.role)
  const roleText = getRoleText(currentUserProfile, lang)

  useEffect(() => {
    if (!currentUserProfile?.id || !isExecutive) return
    fetchDriveSetting()
    fetchExecutiveMembers()

    const settingsChannel = supabase
      .channel('executive-drive-setting')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'system_settings', filter: `key=eq.${EXECUTIVE_DRIVE_SETTING_KEY}` },
        () => fetchDriveSetting(true),
      )
      .subscribe()

    const usersChannel = supabase
      .channel('executive-members-list')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => fetchExecutiveMembers(true),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(settingsChannel)
      supabase.removeChannel(usersChannel)
    }
  }, [currentUserProfile?.id, isExecutive])

  useEffect(() => {
    if (successMsg) notify?.({ type: 'success', title: lang === 'zh' ? '操作成功' : 'Success', message: successMsg })
  }, [successMsg])

  useEffect(() => {
    if (errorMsg) notify?.({ type: 'error', title: lang === 'zh' ? '操作失败' : 'Failed', message: errorMsg })
  }, [errorMsg])

  const fetchDriveSetting = async (silent = false) => {
    if (!silent) setLoading(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', EXECUTIVE_DRIVE_SETTING_KEY)
        .maybeSingle()

      if (error) throw error
      const nextUrl = data?.value || DEFAULT_EXECUTIVE_DRIVE_URL
      setDriveUrl(nextUrl)
      setDriveDraft(nextUrl)
    } catch (err) {
      setErrorMsg(err.message || (lang === 'zh' ? '无法读取执委层 Google Drive 链接。' : 'Failed to load the executive Google Drive link.'))
      setDriveUrl(DEFAULT_EXECUTIVE_DRIVE_URL)
      setDriveDraft(DEFAULT_EXECUTIVE_DRIVE_URL)
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const handleSaveDriveUrl = async () => {
    if (!canManageDrive) return
    setErrorMsg('')
    setSuccessMsg('')
    setSaving(true)
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key: EXECUTIVE_DRIVE_SETTING_KEY,
          value: driveDraft.trim(),
          updated_by: currentUserProfile.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })

      if (error) throw error
      setDriveUrl(driveDraft.trim())
      setSuccessMsg(lang === 'zh' ? '执委层 Google Drive 链接已更新。' : 'Executive Google Drive link updated.')
    } catch (err) {
      setErrorMsg(err.message || (lang === 'zh' ? '保存 Google Drive 链接失败。' : 'Failed to save Google Drive link.'))
    } finally {
      setSaving(false)
    }
  }

  const fetchExecutiveMembers = async (silent = false) => {
    if (!silent) setMembersLoading(true)
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, email, role, custom_role_label, avatar_url, is_active')
        .eq('is_active', true)
        .in('role', EXECUTIVE_ROLES)

      if (error) throw error
      setExecutiveMembers(sortExecutiveMembers(data || []))
    } catch (err) {
      setErrorMsg(err.message || (lang === 'zh' ? '无法读取本届执委层名单。' : 'Failed to load executive member list.'))
    } finally {
      if (!silent) setMembersLoading(false)
    }
  }

  if (!isExecutive) {
    return (
      <div className="max-w-3xl mx-auto" style={{ fontFamily: "'Nunito', sans-serif" }}>
        <div className="p-6" style={cardStyle}>
          <div className="flex items-start gap-3">
            <AlertCircle size={22} style={{ color: '#FFB3C6' }} />
            <div>
              <h1 className="text-xl font-black" style={{ color: '#1a1a1a' }}>
                {lang === 'zh' ? '无法进入执委层管理' : 'Executive Management Unavailable'}
              </h1>
              <p className="text-sm font-bold mt-2" style={{ color: '#6b7280' }}>
                {lang === 'zh'
                  ? '这个页面只开放给执委层、老师与相关自定义岗位查看。'
                  : 'This page is only available to executive roles, teachers, and related custom positions.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-[fadeIn_0.4s_ease]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 pb-4" style={{ borderBottom: '1.5px solid #e0f1ff' }}>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <BriefcaseBusiness size={24} style={{ color: '#95CBFF' }} />
            <h1 className="text-2xl font-black" style={{ color: '#1a1a1a' }}>
              {lang === 'zh' ? '执委层管理' : 'Executive Management'}
            </h1>
          </div>
          <p className="text-sm font-bold" style={{ color: '#4b5563' }}>
            {lang === 'zh'
              ? '查看自己的岗位说明，并进入执委层总 Google Drive。'
              : 'View your role guide and open the executive Google Drive folder.'}
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black self-start lg:self-auto"
          style={{ background: '#fff0f5', color: '#FF7FA3', border: '1.5px solid #FFB3C6' }}>
          <ShieldCheck size={14} />
          {canManageDrive
            ? (lang === 'zh' ? '可管理链接' : 'Can Manage Link')
            : (lang === 'zh' ? '查看权限' : 'View Access')}
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-3xl text-sm font-bold"
          style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
          <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-3xl text-sm font-bold"
          style={{ background: '#dcfce7', border: '1.5px solid #86efac', color: '#16a34a' }}>
          <CheckCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          {successMsg}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_0.9fr] gap-6">
        <section className="p-6 sm:p-7" style={cardStyle}>
          <div className="flex items-start gap-4">
            <UserAvatar user={currentUserProfile} name={currentUserProfile?.name} size={58} rounded={22} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-wide" style={{ color: '#95CBFF' }}>
                {lang === 'zh' ? '我的岗位' : 'My Role'}
              </p>
              <h2 className="text-2xl font-black mt-1" style={{ color: '#1a1a1a' }}>
                {lang === 'zh' ? `你好，${roleText}` : `Hello, ${roleText}`}
              </h2>
              <p className="text-sm font-bold mt-2" style={{ color: '#6b7280' }}>
                {lang === 'zh'
                  ? '这里之后会显示你的岗位工作说明。'
                  : 'Your role description will appear here later.'}
              </p>
            </div>
          </div>

          <div className="mt-6 p-5 rounded-3xl min-h-[180px] flex items-center justify-center text-center"
            style={{ background: '#f0f7ff', border: '1.5px dashed #b8deff' }}>
            <div>
              <p className="text-sm font-black" style={{ color: '#4b5563' }}>
                {lang === 'zh' ? '岗位说明尚未填写' : 'Role description is not filled yet'}
              </p>
              <p className="text-xs font-bold mt-2 max-w-md" style={{ color: '#8ca0b3' }}>
                {lang === 'zh'
                  ? '等你给我各岗位说明后，我会把内容整理到这里。'
                  : 'Once you provide the role descriptions, they can be added here.'}
              </p>
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-7" style={cardStyle}>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-3xl flex items-center justify-center shrink-0"
              style={{ background: '#fff0f5', color: '#FF7FA3' }}>
              <FolderOpen size={22} />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-black" style={{ color: '#1a1a1a' }}>
                {lang === 'zh' ? '执委层总 Google Drive' : 'Executive Google Drive'}
              </h2>
              <p className="text-xs font-bold mt-1" style={{ color: '#6b7280' }}>
                {lang === 'zh'
                  ? '所有执委层资料统一从这里进入，再按 Google Drive 内的分类查找。'
                  : 'Open the main folder first, then use the folders inside Google Drive.'}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm font-bold" style={{ color: '#6b7280' }}>
                <Loader size={16} className="animate-spin" style={{ color: '#95CBFF' }} />
                {lang === 'zh' ? '读取链接中...' : 'Loading link...'}
              </div>
            ) : driveUrl ? (
              <a
                href={driveUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-black transition"
                style={{ background: '#95CBFF', color: 'white', boxShadow: '0 8px 18px rgba(149,203,255,0.35)' }}>
                {lang === 'zh' ? '打开 Google Drive' : 'Open Google Drive'}
                <ExternalLink size={15} />
              </a>
            ) : (
              <div className="p-4 rounded-2xl text-xs font-bold"
                style={{ background: '#fff7ed', color: '#c2410c', border: '1.5px solid #fed7aa' }}>
                {lang === 'zh'
                  ? '尚未设置总 Google Drive 链接。'
                  : 'The main Google Drive link has not been set yet.'}
              </div>
            )}

            {canManageDrive && (
              <div className="pt-4 space-y-3" style={{ borderTop: '1.5px solid #e0f1ff' }}>
                <label className="block text-xs font-black uppercase tracking-wide" style={{ color: '#6b7280' }}>
                  {lang === 'zh' ? '负责人设置总链接' : 'Manager Link Setting'}
                </label>
                <input
                  type="url"
                  value={driveDraft}
                  onChange={(event) => setDriveDraft(event.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full text-sm"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={handleSaveDriveUrl}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black transition"
                  style={{ background: saving ? '#b8deff' : '#FFB3C6', color: 'white' }}>
                  {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                  {lang === 'zh' ? '保存链接' : 'Save Link'}
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="p-6 sm:p-7" style={cardStyle}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
              <ShieldCheck size={20} style={{ color: '#95CBFF' }} />
              {lang === 'zh' ? '本届执委层名单' : 'Current Executive Members'}
            </h2>
            <p className="text-xs font-bold mt-1" style={{ color: '#6b7280' }}>
              {lang === 'zh'
                ? '方便执委层确认彼此岗位与联系资料。'
                : 'Use this list to identify roles and contact details within the executive team.'}
            </p>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-black"
            style={{ background: '#f0f7ff', color: '#6db8ff', border: '1.5px solid #b8deff' }}>
            {executiveMembers.length}
          </span>
        </div>

        {membersLoading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold" style={{ color: '#6b7280' }}>
            <Loader size={18} className="animate-spin" style={{ color: '#95CBFF' }} />
            {lang === 'zh' ? '读取名单中...' : 'Loading members...'}
          </div>
        ) : executiveMembers.length === 0 ? (
          <div className="p-6 rounded-3xl text-center text-sm font-bold"
            style={{ background: '#f0f7ff', border: '1.5px dashed #b8deff', color: '#8ca0b3' }}>
            {lang === 'zh' ? '暂无执委层成员。' : 'No executive members yet.'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl" style={{ border: '1.5px solid #e0f1ff' }}>
            {executiveMembers.map((member, index) => (
              <div
                key={member.id}
                className="grid grid-cols-[auto_1fr] md:grid-cols-[auto_1fr_1fr] gap-3 md:gap-5 items-center p-4"
                style={{
                  background: index % 2 === 0 ? 'white' : '#f8fbff',
                  borderBottom: index === executiveMembers.length - 1 ? 'none' : '1px solid #e0f1ff',
                }}>
                <div className="flex items-center gap-3 min-w-0">
                  <UserAvatar user={member} name={member.name} size={42} rounded={18} />
                  <div className="min-w-0">
                    <p className="text-sm font-black truncate" style={{ color: '#1a1a1a' }}>{member.name || '-'}</p>
                    <p className="text-xs font-bold mt-0.5 md:hidden truncate" style={{ color: '#6b7280' }}>{member.email || '-'}</p>
                  </div>
                </div>

                <div className="min-w-0">
                  <span className="inline-flex px-3 py-1 rounded-full text-xs font-black"
                    style={{ background: '#f0f7ff', color: '#4a9dea', border: '1px solid #b8deff' }}>
                    {getRoleText(member, lang)}
                  </span>
                </div>

                <p className="hidden md:block text-sm font-bold truncate" style={{ color: '#6b7280' }}>
                  {member.email || '-'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
