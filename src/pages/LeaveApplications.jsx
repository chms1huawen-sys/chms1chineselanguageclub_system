import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { createNotificationsAndPush } from '../utils/pushNotifications'
import UserAvatar from '../components/UserAvatar'
import AvatarPreviewModal from '../components/AvatarPreviewModal'
import {
  AlertCircle,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  ExternalLink,
  FileText,
  Loader,
  Plus,
  Save,
  Search,
  User,
} from 'lucide-react'

const MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'secretary', 'vice_secretary']
const DEFAULT_LEAVE_DRIVE_FOLDER_URL = import.meta.env.VITE_LEAVE_DRIVE_FOLDER_URL || ''
const LEAVE_DRIVE_SETTING_KEY = 'leave_drive_folder_url'

const LEAVE_TYPE_OPTIONS = [
  { value: 'sick', zh: '病假', en: 'Sick Leave', bg: '#fef2f2', color: '#dc2626', border: '#fca5a5' },
  { value: 'official', zh: '公假', en: 'Official Leave', bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
  { value: 'personal', zh: '事假', en: 'Personal Leave', bg: '#fffbeb', color: '#ca8a04', border: '#fde047' },
  { value: 'custom', zh: '自定义', en: 'Custom', bg: '#f3f4f6', color: '#4b5563', border: '#d1d5db' },
]

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

const cardStyle = {
  background: 'white',
  border: '1.5px solid #e0f1ff',
  borderRadius: 24,
  boxShadow: '0 4px 20px rgba(149,203,255,0.12)',
}

const getLocalDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const formatDate = (date, lang) => {
  if (!date) return '-'
  return new Date(`${date}T00:00:00`).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

const getLeaveLabel = (application, lang = 'zh') => {
  if (application.leave_type === 'custom' && application.custom_leave_type) return application.custom_leave_type
  const option = LEAVE_TYPE_OPTIONS.find(type => type.value === application.leave_type)
  if (!option) return application.leave_type || '-'
  return lang === 'zh' ? option.zh : option.en
}

const getLeaveBadge = (type) => LEAVE_TYPE_OPTIONS.find(option => option.value === type) || LEAVE_TYPE_OPTIONS[3]

const attachApplicants = async (rows = []) => {
  const userIds = [...new Set(rows.map(row => row.user_id).filter(Boolean))]
  if (userIds.length === 0) return rows

  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email, role, avatar_url')
    .in('id', userIds)

  if (error) throw error
  const usersById = new Map((users || []).map(user => [user.id, user]))
  return rows.map(row => ({ ...row, applicant: usersById.get(row.user_id) || null }))
}

export default function LeaveApplications({ currentUserProfile, lang = 'zh', notify }) {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [selectedApplication, setSelectedApplication] = useState(null)
  const [avatarPreviewUser, setAvatarPreviewUser] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [driveFolderUrl, setDriveFolderUrl] = useState(DEFAULT_LEAVE_DRIVE_FOLDER_URL)
  const [driveFolderDraft, setDriveFolderDraft] = useState(DEFAULT_LEAVE_DRIVE_FOLDER_URL)
  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)
  const [formData, setFormData] = useState({
    leave_type: 'sick',
    custom_leave_type: '',
    leave_date: getLocalDate(),
    reason: '',
    drive_file_url: '',
    attachment_uploaded: false,
  })

  const isManager = MANAGER_ROLES.includes(currentUserProfile?.role)

  useEffect(() => {
    if (successMsg) notify?.({ type: 'success', title: lang === 'zh' ? '操作成功' : 'Success', message: successMsg })
  }, [successMsg])

  useEffect(() => {
    if (errorMsg) notify?.({ type: 'error', title: lang === 'zh' ? '操作失败' : 'Failed', message: errorMsg })
  }, [errorMsg])

  useEffect(() => {
    fetchApplications()
    fetchDriveFolderSetting()

    const channel = supabase
      .channel('leave-applications-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'leave_applications' },
        () => fetchApplications(true),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [currentUserProfile?.id, currentUserProfile?.role])

  const fetchDriveFolderSetting = async () => {
    setSettingsLoading(true)
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', LEAVE_DRIVE_SETTING_KEY)
        .maybeSingle()

      if (error) throw error
      const nextUrl = data?.value || DEFAULT_LEAVE_DRIVE_FOLDER_URL
      setDriveFolderUrl(nextUrl)
      setDriveFolderDraft(nextUrl)
    } catch (err) {
      console.error('Fetch leave Drive folder setting failed:', err.message)
      setDriveFolderUrl(DEFAULT_LEAVE_DRIVE_FOLDER_URL)
      setDriveFolderDraft(DEFAULT_LEAVE_DRIVE_FOLDER_URL)
    } finally {
      setSettingsLoading(false)
    }
  }

  const handleSaveDriveFolderUrl = async () => {
    if (!isManager) return
    setErrorMsg('')
    setSuccessMsg('')
    setSettingsSaving(true)
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key: LEAVE_DRIVE_SETTING_KEY,
          value: driveFolderDraft.trim(),
          updated_by: currentUserProfile.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'key' })

      if (error) throw error
      setDriveFolderUrl(driveFolderDraft.trim())
      setSuccessMsg(lang === 'zh' ? 'Google Drive 文件夹链接已更新。' : 'Google Drive folder link updated.')
    } catch (err) {
      setErrorMsg(err.message || (lang === 'zh' ? '保存 Google Drive 链接失败' : 'Failed to save Google Drive link.'))
    } finally {
      setSettingsSaving(false)
    }
  }

  const fetchApplications = async (silent = false) => {
    if (!currentUserProfile?.id) return
    if (!silent) setLoading(true)
    setErrorMsg('')
    try {
      let query = supabase
        .from('leave_applications')
        .select('*, applicant:users(id, name, email, role, avatar_url)')
        .order('created_at', { ascending: false })

      if (!isManager) {
        query = query.eq('user_id', currentUserProfile.id)
      }

      const { data, error } = await query
      if (error) {
        let fallbackQuery = supabase
          .from('leave_applications')
          .select('*')
          .order('created_at', { ascending: false })

        if (!isManager) {
          fallbackQuery = fallbackQuery.eq('user_id', currentUserProfile.id)
        }

        const { data: fallbackData, error: fallbackError } = await fallbackQuery
        if (fallbackError) throw fallbackError
        setApplications(await attachApplicants(fallbackData || []))
        return
      }
      setApplications(data || [])
    } catch (err) {
      setErrorMsg(err.message || (lang === 'zh' ? '获取请假记录失败' : 'Failed to load leave applications.'))
    } finally {
      if (!silent) setLoading(false)
    }
  }

  const notifyManagers = async (application) => {
    const { data: recipients, error } = await supabase
      .from('users')
      .select('id')
      .eq('is_active', true)
      .in('role', MANAGER_ROLES)

    if (error) {
      console.error('Fetch leave notification recipients failed:', error.message)
      return
    }

    const applicantName = currentUserProfile?.name || (lang === 'zh' ? '成员' : 'Member')
    const leaveTypeText = getLeaveLabel(application, 'zh')
    const dateText = formatDate(application.leave_date, 'zh')
    const rows = (recipients || []).map(user => ({
      user_id: user.id,
      type: 'leave_application_submitted',
      title: lang === 'zh' ? '新的请假申请' : 'Leave Application',
      body: `${applicantName} 提交了 ${leaveTypeText}，日期：${dateText}`,
      dedupe_key: `leave-${application.id}-${user.id}`,
    }))

    if (rows.length === 0) return
    await createNotificationsAndPush(rows, '/leave')
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMsg('')
    setSuccessMsg('')

    if (formData.leave_type === 'custom' && !formData.custom_leave_type.trim()) {
      setErrorMsg(lang === 'zh' ? '请输入自定义请假类型。' : 'Please enter a custom leave type.')
      return
    }
    if (!formData.attachment_uploaded) {
      setErrorMsg(lang === 'zh' ? '请先确认已上传签名请假信。' : 'Please confirm that the signed leave letter has been uploaded.')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        user_id: currentUserProfile.id,
        leave_type: formData.leave_type,
        custom_leave_type: formData.leave_type === 'custom' ? formData.custom_leave_type.trim() : null,
        leave_date: formData.leave_date,
        reason: formData.reason.trim(),
        drive_folder_url: driveFolderUrl || null,
        drive_file_url: formData.drive_file_url.trim() || null,
        attachment_uploaded: true,
      }

      const { data, error } = await supabase
        .from('leave_applications')
        .insert(payload)
        .select('*')
        .single()

      if (error) throw error
      const insertedApplication = (await attachApplicants([data]))[0]

      await notifyManagers(insertedApplication)
      setSuccessMsg(lang === 'zh' ? '请假申请已记录，并已通知负责老师与执委。' : 'Leave application recorded and managers notified.')
      setFormData({
        leave_type: 'sick',
        custom_leave_type: '',
        leave_date: getLocalDate(),
        reason: '',
        drive_file_url: '',
        attachment_uploaded: false,
      })
      fetchApplications(true)
    } catch (err) {
      setErrorMsg(err.message || (lang === 'zh' ? '提交请假申请失败' : 'Failed to submit leave application.'))
    } finally {
      setSubmitting(false)
    }
  }

  const filteredApplications = useMemo(() => {
    return applications.filter(application => {
      const applicantName = application.applicant?.name || ''
      const leaveType = getLeaveLabel(application, lang)
      const matchesSearch = !searchTerm.trim() ||
        applicantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        leaveType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        application.reason?.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesType = typeFilter === 'all' || application.leave_type === typeFilter
      return matchesSearch && matchesType
    })
  }, [applications, lang, searchTerm, typeFilter])

  return (
    <div className="space-y-6" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5" style={{ borderBottom: '1.5px solid #e0f1ff' }}>
        <div>
          <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
            <ClipboardList style={{ color: '#95CBFF' }} />
            {lang === 'zh' ? '请假申请' : 'Leave Application'}
          </h1>
          <p className="text-sm mt-1 font-semibold" style={{ color: '#6b7280' }}>
            {lang === 'zh'
              ? '记录已签名请假信，并自动通知召集老师、指导老师、主席与文书。'
              : 'Record signed leave letters and notify the convener teacher, advisor teacher, president, and secretary.'}
          </p>
        </div>
        {isManager && (
          <div className="px-4 py-2 rounded-2xl text-xs font-black flex items-center gap-2" style={{ background: '#ffe4ec', color: '#be185d', border: '1.5px solid #FFB3C6' }}>
            <User size={14} />
            {lang === 'zh' ? '负责人总览权限' : 'Manager View'}
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold" style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
          <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
          <p>{errorMsg}</p>
        </div>
      )}
      {successMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold" style={{ background: '#dcfce7', border: '1.5px solid #86efac', color: '#16a34a' }}>
          <CheckCircle size={18} style={{ color: '#22c55e', flexShrink: 0, marginTop: 2 }} />
          <p>{successMsg}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-6">
        <form onSubmit={handleSubmit} className="p-6 space-y-5" style={cardStyle}>
          <div className="flex items-center gap-2">
            <Plus size={18} style={{ color: '#95CBFF' }} />
            <h2 className="font-black text-base" style={{ color: '#1a1a1a' }}>
              {lang === 'zh' ? '填写请假申请' : 'Submit Leave'}
            </h2>
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>
              {lang === 'zh' ? '请假类型' : 'Leave Type'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {LEAVE_TYPE_OPTIONS.map(option => {
                const active = formData.leave_type === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, leave_type: option.value }))}
                    className="px-3 py-2.5 rounded-2xl text-xs font-black transition cursor-pointer text-left"
                    style={{
                      background: active ? option.bg : '#f0f7ff',
                      color: active ? option.color : '#6b7280',
                      border: `1.5px solid ${active ? option.border : '#e0f1ff'}`,
                    }}>
                    {lang === 'zh' ? option.zh : option.en}
                  </button>
                )
              })}
            </div>
          </div>

          {formData.leave_type === 'custom' && (
            <div>
              <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>
                {lang === 'zh' ? '自定义类型' : 'Custom Type'}
              </label>
              <input
                value={formData.custom_leave_type}
                onChange={(event) => setFormData(prev => ({ ...prev, custom_leave_type: event.target.value }))}
                placeholder={lang === 'zh' ? '例如：比赛假' : 'e.g. Competition Leave'}
                className="w-full text-sm"
                style={inputStyle}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'zh' ? '请假日期' : 'Leave Date'}
            </label>
            <input
              type="date"
              required
              value={formData.leave_date}
              onChange={(event) => setFormData(prev => ({ ...prev, leave_date: event.target.value }))}
              className="w-full text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#6b7280' }}>
              {lang === 'zh' ? '请假原因' : 'Reason'}
            </label>
            <textarea
              required
              value={formData.reason}
              onChange={(event) => setFormData(prev => ({ ...prev, reason: event.target.value }))}
              placeholder={lang === 'zh' ? '请简述请假原因...' : 'Briefly describe the reason...'}
              rows={4}
              className="w-full text-sm resize-none"
              style={inputStyle}
            />
          </div>

          <div className="p-4 rounded-2xl space-y-3" style={{ background: '#fff7fb', border: '1.5px solid #FFB3C6' }}>
              <div className="flex items-start gap-2 text-sm font-black" style={{ color: '#be185d' }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
              <p>
                {lang === 'zh'
                  ? '⚠️ 请务必上传已获得指导老师、主席及文书签名的请假信，未签名的请假信将不予受理。'
                  : '⚠️ Upload the leave letter signed by the advisor teacher, president, and secretary. Unsigned letters will not be processed.'}
              </p>
            </div>
            <p className="text-xs font-bold" style={{ color: '#be185d' }}>
              {lang === 'zh'
                ? '建议文件命名：姓名_请假日期_请假类型，例如 黄禧恩_2026-05-26_病假.pdf'
                : 'Suggested file name: Name_LeaveDate_LeaveType, e.g. Joel_2026-05-26_SickLeave.pdf'}
            </p>

            <p className="text-xs font-bold" style={{ color: '#be185d' }}>
              {lang === 'zh'
                ? '请先使用右侧的 Google Drive 文件夹链接上传请假信，再回来确认并提交记录。'
                : 'Use the Google Drive folder link on the right to upload the leave letter, then return to confirm and submit the record.'}
            </p>

            <label className="flex items-start gap-2.5 text-xs font-bold cursor-pointer" style={{ color: '#4b5563' }}>
              <input
                type="checkbox"
                checked={formData.attachment_uploaded}
                onChange={(event) => setFormData(prev => ({ ...prev, attachment_uploaded: event.target.checked }))}
                className="mt-0.5"
              />
              <span>
                {lang === 'zh'
                  ? '我确认已把签名请假信上传到指定 Google Drive 文件夹。'
                  : 'I confirm that the signed leave letter has been uploaded to the designated Google Drive folder.'}
              </span>
            </label>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#be185d' }}>
                {lang === 'zh' ? '请假信 Google Drive 链接' : 'Leave Letter Google Drive Link'}
              </label>
              <input
                type="url"
                value={formData.drive_file_url}
                onChange={(event) => setFormData(prev => ({ ...prev, drive_file_url: event.target.value }))}
                placeholder="https://drive.google.com/file/d/..."
                className="w-full text-sm"
                style={{ ...inputStyle, background: 'white', borderColor: '#FFB3C6' }}
              />
              <p className="text-[11px] font-bold mt-1.5" style={{ color: '#be185d' }}>
                {lang === 'zh'
                  ? '上传后可右键文件取得分享链接，并贴在这里，方便老师与执委直接查阅。'
                  : 'After upload, copy the file sharing link here so teachers and committee can open it directly.'}
              </p>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl text-sm font-black transition cursor-pointer"
            style={{ background: submitting ? '#b8deff' : '#95CBFF', color: 'white' }}>
            {submitting ? <><Loader size={15} className="animate-spin" /> {lang === 'zh' ? '提交中...' : 'Submitting...'}</> : lang === 'zh' ? '提交请假申请' : 'Submit Leave'}
          </button>
        </form>

        <div className="space-y-4">
          <div className="p-5 space-y-4" style={cardStyle}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#1a1a1a' }}>
                  <ExternalLink size={18} style={{ color: '#95CBFF' }} />
                  {lang === 'zh' ? '请假信 Google Drive' : 'Leave Letter Google Drive'}
                </h2>
                <p className="text-xs font-bold mt-1" style={{ color: '#6b7280' }}>
                  {lang === 'zh'
                    ? '所有成员统一上传到这里；链接由召集老师、指导老师、主席或文书设置。'
                    : 'All members upload here; the link is managed by the convener teacher, advisor teacher, president, or secretary.'}
                </p>
              </div>
              {settingsLoading && <Loader size={18} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />}
            </div>

            {driveFolderUrl ? (
              <a
                href={driveFolderUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black transition"
                style={{ background: '#95CBFF', color: 'white' }}>
                <ExternalLink size={15} />
                {lang === 'zh' ? '打开 Google Drive 上传文件' : 'Open Google Drive Folder'}
              </a>
            ) : (
              <div className="p-3 rounded-2xl text-xs font-bold" style={{ background: '#fff7fb', border: '1.5px solid #FFB3C6', color: '#be185d' }}>
                {lang === 'zh'
                  ? '尚未设置 Google Drive 文件夹链接，请联系召集老师、指导老师、主席或文书。'
                  : 'Google Drive folder link is not configured. Please contact a manager.'}
              </div>
            )}

            {isManager && (
              <div className="space-y-2 pt-4" style={{ borderTop: '1.5px solid #f0f7ff' }}>
                <label className="block text-xs font-black uppercase tracking-wider" style={{ color: '#6b7280' }}>
                  {lang === 'zh' ? '负责人设置 Google Drive 文件夹链接' : 'Manager Setting'}
                </label>
                <input
                  type="url"
                  value={driveFolderDraft}
                  onChange={(event) => setDriveFolderDraft(event.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full text-sm"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={handleSaveDriveFolderUrl}
                  disabled={settingsSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl text-xs font-black transition cursor-pointer"
                  style={{ background: settingsSaving ? '#b8deff' : '#FFB3C6', color: 'white' }}>
                  {settingsSaving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                  {lang === 'zh' ? '保存链接' : 'Save Link'}
                </button>
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl grid grid-cols-1 md:grid-cols-3 gap-3" style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
            <div className="relative md:col-span-2">
              <Search size={16} style={{ position: 'absolute', left: 16, top: 13, color: 'white', filter: 'drop-shadow(0 1px 2px rgba(64, 124, 180, 0.95))', zIndex: 1 }} />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder={lang === 'zh' ? '搜索姓名、类型或原因...' : 'Search name, type or reason...'}
                className="w-full pl-10 pr-4 py-2.5 text-sm leave-search-contrast"
                style={{
                  ...inputStyle,
                  paddingLeft: 44,
                  color: 'white',
                  background: '#95CBFF',
                  textShadow: '0 1px 2px rgba(36, 88, 138, 0.95), 0 0 1px rgba(36, 88, 138, 0.9)',
                }}
              />
            </div>
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="w-full text-sm"
              style={inputStyle}>
              <option value="all">{lang === 'zh' ? '所有类型' : 'All Types'}</option>
              {LEAVE_TYPE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{lang === 'zh' ? option.zh : option.en}</option>
              ))}
            </select>
          </div>

          <div style={cardStyle} className="overflow-hidden">
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1.5px solid #e0f1ff' }}>
              <h2 className="font-black text-base flex items-center gap-2" style={{ color: '#1a1a1a' }}>
                <FileText size={18} style={{ color: '#95CBFF' }} />
                {lang === 'zh' ? '请假历史' : 'Leave History'}
              </h2>
              <span className="text-xs font-black px-2.5 py-1 rounded-full" style={{ background: '#ffe4ec', color: '#be185d' }}>
                {filteredApplications.length}
              </span>
            </div>

            {loading ? (
              <div className="py-16 flex flex-col items-center gap-3" style={{ color: '#6b7280' }}>
                <Loader size={30} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
                <p className="font-bold">{lang === 'zh' ? '加载请假记录中...' : 'Loading leave records...'}</p>
              </div>
            ) : filteredApplications.length === 0 ? (
              <div className="py-16 text-center font-semibold" style={{ color: '#6b7280' }}>
                {lang === 'zh' ? '暂无请假记录' : 'No leave records yet.'}
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: '#f0f7ff' }}>
                {filteredApplications.map(application => {
                  const badge = getLeaveBadge(application.leave_type)
                  return (
                    <button
                      key={application.id}
                      onClick={() => setSelectedApplication(application)}
                      className="w-full text-left px-5 py-4 transition cursor-pointer hover:bg-blue-50"
                      style={{ background: 'white' }}>
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2.5 py-1 text-xs font-black rounded-full" style={{ background: badge.bg, color: badge.color, border: `1.5px solid ${badge.border}` }}>
                              {getLeaveLabel(application, lang)}
                            </span>
                            <span className="text-xs font-black" style={{ color: '#6b7280' }}>
                              {formatDate(application.leave_date, lang)}
                            </span>
                            <span className="text-xs font-black" style={{ color: '#95CBFF' }}>
                              {lang === 'zh' ? '1 天' : '1 day'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {isManager && (
                              <UserAvatar
                                user={application.applicant}
                                size={30}
                                rounded={12}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  setAvatarPreviewUser(application.applicant)
                                }}
                              />
                            )}
                            <p className="text-sm font-black truncate" style={{ color: '#1a1a1a' }}>
                              {isManager ? (application.applicant?.name || '-') : (lang === 'zh' ? '我的申请' : 'My application')}
                            </p>
                          </div>
                          <p className="text-xs font-semibold line-clamp-1" style={{ color: '#6b7280' }}>
                            {application.reason}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-bold" style={{ color: application.attachment_uploaded ? '#16a34a' : '#ca8a04' }}>
                          {application.attachment_uploaded ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
                          {application.attachment_uploaded
                            ? (lang === 'zh' ? '已确认上传' : 'Upload confirmed')
                            : (lang === 'zh' ? '未确认上传' : 'Not confirmed')}
                          {application.drive_file_url && <ExternalLink size={15} style={{ color: '#95CBFF' }} />}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedApplication && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(149,203,255,0.18)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-xl overflow-hidden" style={cardStyle}>
            <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1.5px solid #e0f1ff' }}>
              <h3 className="font-black text-lg flex items-center gap-2" style={{ color: '#1a1a1a' }}>
                <CalendarDays size={18} style={{ color: '#95CBFF' }} />
                {lang === 'zh' ? '请假详情' : 'Leave Details'}
              </h3>
              <button onClick={() => setSelectedApplication(null)} className="text-lg transition cursor-pointer font-black" style={{ color: '#6b7280' }}>x</button>
            </div>
            <div className="p-6 space-y-4">
              {[
                { label: lang === 'zh' ? '申请人' : 'Applicant', value: selectedApplication.applicant?.name || '-' },
                { label: lang === 'zh' ? '请假类型' : 'Leave Type', value: getLeaveLabel(selectedApplication, lang) },
                { label: lang === 'zh' ? '请假日期' : 'Leave Date', value: formatDate(selectedApplication.leave_date, lang) },
                { label: lang === 'zh' ? '天数' : 'Days', value: lang === 'zh' ? '1 天' : '1 day' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between gap-4 px-4 py-3 rounded-2xl" style={{ background: '#f0f7ff' }}>
                  <span className="text-xs font-black uppercase tracking-wider" style={{ color: '#6b7280' }}>{row.label}</span>
                  <span className="text-sm font-black text-right" style={{ color: '#1a1a1a' }}>{row.value}</span>
                </div>
              ))}
              <div className="px-4 py-3 rounded-2xl" style={{ background: '#f0f7ff' }}>
                <span className="text-xs font-black uppercase tracking-wider" style={{ color: '#6b7280' }}>
              {lang === 'zh' ? '请假原因' : 'Reason'}
                </span>
                <p className="text-sm font-bold mt-2 whitespace-pre-wrap" style={{ color: '#1a1a1a' }}>{selectedApplication.reason}</p>
              </div>
              {selectedApplication.drive_folder_url && (
                <a
                  href={selectedApplication.drive_folder_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black"
                  style={{ background: '#95CBFF', color: 'white' }}>
                  <ExternalLink size={15} />
                  {lang === 'zh' ? '打开请假信 Google Drive 文件夹' : 'Open Leave Letter Google Drive Folder'}
                </a>
              )}
              {selectedApplication.drive_file_url && (
                <a
                  href={selectedApplication.drive_file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black"
                  style={{ background: '#FFB3C6', color: 'white' }}>
                  <ExternalLink size={15} />
                  {lang === 'zh' ? '打开此请假信文件' : 'Open This Leave Letter'}
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      <AvatarPreviewModal user={avatarPreviewUser} lang={lang} onClose={() => setAvatarPreviewUser(null)} />
    </div>
  )
}
