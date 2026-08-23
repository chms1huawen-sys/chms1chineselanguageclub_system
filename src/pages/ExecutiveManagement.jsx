import React, { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import UserAvatar from '../components/UserAvatar'
import { canViewExecutiveManagement, hasPermission } from '../utils/permissions'
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
  'social_media_editor',
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
  'social_media_editor',
  'custom',
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
  vice_general_affairs: { zh: '副总务', en: 'Assistant General Affairs' },
  activity_lead: { zh: '活动组组长', en: 'Activity Organiser' },
  vice_activity_lead: { zh: '活动组副组长', en: 'Vice Activity Organiser' },
  activity_member: { zh: '活动组组员', en: 'Assistant Activity Organiser' },
  media_lead: { zh: '正摄影', en: 'Photographer' },
  vice_media_lead: { zh: '副摄影', en: 'Assistant Photographer' },
  social_media_editor: { zh: '媒体', en: 'Social Media Editor' },
  custom: { zh: '自定义岗位', en: 'Custom Position' },
}

const ROLE_DESCRIPTIONS = {
  chairperson: {
    zh: '暂时空着',
    en: 'Not filled yet.',
  },
  vice_chairperson: {
    zh: '副主席主要负责协助主席处理学会事务，确保每项活动能够顺利进行，并协助现场控场。同时，副主席需留意会员的出席情况，提醒缺席会员完成请假程序，协助维持学会整体运作。',
    en: 'The Vice President assists the President in handling society affairs, ensuring activities run smoothly and supporting on-site coordination. The Vice President also monitors attendance, reminds absent members to complete leave procedures, and helps maintain overall society operations.',
  },
  secretary: {
    zh: '文书负责联课点名、处理会员请假单、整理会员资料及保存学会所有官方文件，并于会议期间负责记录会议内容，确保学会行政事务完整且有系统地进行。',
    en: 'The Secretary manages co-curricular attendance, member leave records, member information, official society documents, and meeting minutes so that administrative matters are complete and well organised.',
  },
  vice_secretary: {
    zh: '文书负责联课点名、处理会员请假单、整理会员资料及保存学会所有官方文件，并于会议期间负责记录会议内容，确保学会行政事务完整且有系统地进行。',
    en: 'The Vice Secretary assists with co-curricular attendance, member leave records, member information, official society documents, and meeting minutes so that administrative matters are complete and well organised.',
  },
  treasurer: {
    zh: '财政负责收取团费、团服等相关费用，并做好完整记录。同时负责学会所有收入、支出及报销事项，确认收齐团服费用后交还老师，并于每月将财务资料上传至 Google Drive。',
    en: 'The Treasurer collects society fees, uniform payments, and related fees with complete records. The Treasurer also manages all income, expenses, and claims, returns collected uniform payments to the teacher, and uploads monthly financial records to Google Drive.',
  },
  vice_treasurer: {
    zh: '财政负责收取团费、团服等相关费用，并做好完整记录。同时负责学会所有收入、支出及报销事项，确认收齐团服费用后交还老师，并于每月将财务资料上传至 Google Drive。',
    en: 'The Vice Treasurer assists with collecting society fees, uniform payments, and related fees with complete records, while supporting income, expenses, claims, and monthly Google Drive financial uploads.',
  },
  general_affairs: {
    zh: '总务负责申请活动场地、安排每周联课值日工作，并负责拍摄及上传鸟瞰图，确保场地使用及环境整理工作顺利完成，另外也要管理并整理好学会的用具。',
    en: 'General Affairs handles venue applications, weekly duty arrangements, aerial-view photo uploads, venue use, environment organisation, and the management of society equipment.',
  },
  vice_general_affairs: {
    zh: '总务负责申请活动场地、安排每周联课值日工作，并负责拍摄及上传鸟瞰图，确保场地使用及环境整理工作顺利完成，另外也要管理并整理好学会的用具。',
    en: 'Assistant General Affairs assists with venue applications, weekly duty arrangements, aerial-view photo uploads, venue use, environment organisation, and society equipment management.',
  },
  media_lead: {
    zh: '媒体负责拍摄联课及活动照片，管理华文学会所有社交媒体平台，并负责发布活动贴文及撰写相关文案。',
    en: 'The Photographer / Social Media role captures co-curricular and activity photos, manages the Chinese Language Club social media platforms, publishes activity posts, and writes related captions.',
  },
  vice_media_lead: {
    zh: '媒体负责拍摄联课及活动照片，管理华文学会所有社交媒体平台，并负责发布活动贴文及撰写相关文案。',
    en: 'The Assistant Photographer / Social Media role assists with photos, social media management, activity posts, and related captions.',
  },
  social_media_editor: {
    zh: '媒体负责拍摄联课及活动照片，管理华文学会所有社交媒体平台，并负责发布活动贴文及撰写相关文案。',
    en: 'The Social Media Editor manages the Chinese Language Club social media platforms, publishes activity posts, writes related captions, and supports photo organisation.',
  },
  activity_lead: {
    zh: '活动组负责策划每周游戏及活动内容、制作活动所需 PPT，并于联课期间主持及带领活动、带动气氛，确保活动顺利进行。',
    en: 'The Activity Organiser plans weekly games and activities, prepares the required PPT, hosts and leads activities during co-curricular sessions, builds the atmosphere, and ensures activities run smoothly.',
  },
  vice_activity_lead: {
    zh: '活动组负责策划每周游戏及活动内容、制作活动所需 PPT，并于联课期间主持及带领活动、带动气氛，确保活动顺利进行。',
    en: 'The Vice Activity Organiser assists with weekly games, activity planning, PPT preparation, hosting, leading activities, and keeping activities running smoothly.',
  },
  activity_member: {
    zh: '活动组负责策划每周游戏及活动内容、制作活动所需 PPT，并于联课期间主持及带领活动、带动气氛，确保活动顺利进行。',
    en: 'The Assistant Activity Organiser supports weekly games, activity planning, PPT preparation, hosting, leading activities, and keeping activities running smoothly.',
  },
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

  const isExecutive = canViewExecutiveManagement(currentUserProfile)
  const canManageDrive = hasPermission(currentUserProfile, 'can_manage_executive')
  const roleText = getRoleText(currentUserProfile, lang)
  const roleDescription = ROLE_DESCRIPTIONS[currentUserProfile?.role]?.[lang] || ''

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
                {lang === 'zh' ? '这里是你的执委层主要职责。' : 'These are your main executive responsibilities.'}
              </p>
            </div>
          </div>

          <div className="mt-6 p-5 rounded-3xl min-h-[180px]"
            style={{ background: '#f0f7ff', border: '1.5px dashed #b8deff' }}>
            {roleDescription ? (
              <p className="text-sm font-bold leading-relaxed whitespace-pre-line" style={{ color: '#4b5563' }}>
                {roleDescription}
              </p>
            ) : (
              <div className="h-full min-h-[130px] flex items-center justify-center text-center">
                <div>
                  <p className="text-sm font-black" style={{ color: '#4b5563' }}>
                    {lang === 'zh' ? '岗位说明尚未填写' : 'Role description is not filled yet'}
                  </p>
                  <p className="text-xs font-bold mt-2 max-w-md" style={{ color: '#8ca0b3' }}>
                    {lang === 'zh'
                      ? '这个岗位的职责说明之后可以再补上。'
                      : 'This role description can be added later.'}
                  </p>
                </div>
              </div>
            )}
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
