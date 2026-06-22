// src/pages/Settings.jsx
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { KeyRound, User, Bell, CheckCircle, AlertCircle, Loader, ShieldCheck, Camera, Trash2 } from 'lucide-react'
import { requestFcmToken } from '../firebase'

const ROLE_LABELS = {
  convener_teacher: { zh: '召集老师', en: 'Convener Teacher' },
  advisor_teacher: { zh: '指导老师', en: 'Advisor Teacher' },
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
  ordinary_member: { zh: '普通会员', en: 'Ordinary Member' },
  custom: { zh: '自定义', en: 'Custom' },
  advisor: { zh: '指导老师', en: 'Advisor Teacher' },
  committee: { zh: '自定义', en: 'Custom' },
  event_member: { zh: '活动组组员', en: 'Activity Member' }
}

const cardStyle = {
  background: 'white',
  border: '1.5px solid #e0f1ff',
  borderRadius: 24,
  padding: 24,
  boxShadow: '0 4px 20px rgba(149,203,255,0.12)',
}

const inputStyle = {
  width: '100%',
  padding: '10px 14px',
  borderRadius: 14,
  border: '1.5px solid #95CBFF',
  background: '#f0f7ff',
  color: '#1a1a1a',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "'Nunito', sans-serif",
  outline: 'none',
}

const T = {
  zh: {
    title: '⚙️ 个人设置',
    subtitle: '管理你的账号信息与通知偏好',
    info_title: '账号信息',
    lbl_name: '姓名',
    lbl_email: '电子邮箱',
    lbl_role: '系统角色',
    lbl_status: '账号状态',
    lbl_status_active: '✅ 使用中',
    lbl_status_inactive: '❌ 已停用',
    lbl_admin_note: '如需修改姓名或角色，请联系主席或顾问老师。',

    pw_title: '修改密码',
    pw_success: '密码已成功更新！请用新密码重新登录。',
    pw_err_match: '两次输入的新密码不一致。',
    pw_err_len: '新密码至少需要 6 位。',
    pw_err_wrong: '当前密码不正确，请重新输入。',
    pw_err_fail: '密码更新失败，请稍后再试。',
    lbl_pw_current: '当前密码',
    lbl_pw_new: '新密码',
    lbl_pw_confirm: '确认新密码',
    pw_note: '密码至少 6 位。修改后需重新登录。',
    pw_btn_saving: '更新中...',
    pw_btn_save: '确认修改密码',

    notif_title: '推送通知',
    notif_desc: '开启后，任务截止提醒将推送到你的设备。',
    notif_status_lbl: '当前通知权限',
    notif_status_desc: 'Browser notification permission status',
    notif_badge_enabled: '已开启',
    notif_badge_denied: '已拒绝',
    notif_badge_notset: '未设置',
    notif_badge_unsupported: '不支持',
    notif_btn_loading: '请求中...',
    notif_btn_enable: '开启推送通知',
    notif_btn_refresh: '重新注册推送通知',
    notif_success: '推送通知已成功开启！',
    notif_denied_msg: '通知权限已被拒绝。 请前往浏览器设置 → 网站权限，手动开启此网站的通知权限，然后刷新页面。',
    notif_unsupported_msg: '📱 iPhone 用户：请用 Safari 打开系统，点击「分享」→「添加到主屏幕」后，推送通知功能即可使用。',
    notif_unsupported_alert: '你的浏览器不支持推送通知。请使用 Chrome 或 Safari（iOS 需添加到主屏幕）。',
    notif_success_alert: '✅ 通知已开启！系统将在任务截止前提醒你。',
    notif_denied_alert: '❌ 通知权限被拒绝。\n\n请前往浏览器设置 > 网站权限，手动开启此网站的通知权限。'
  },
  en: {
    title: '⚙️ Settings',
    subtitle: 'Account Settings · Manage your profile info and notification preferences',
    info_title: 'Account Info',
    lbl_name: 'Name',
    lbl_email: 'Email',
    lbl_role: 'Role',
    lbl_status: 'Status',
    lbl_status_active: '✅ Active',
    lbl_status_inactive: '❌ Deactivated',
    lbl_admin_note: 'To change your name or role, please contact the President or Advisor Teacher.',

    pw_title: 'Change Password',
    pw_success: 'Password updated successfully! Please log in again with your new password.',
    pw_err_match: 'New passwords do not match.',
    pw_err_len: 'New password must be at least 6 characters.',
    pw_err_wrong: 'Current password is incorrect. Please try again.',
    pw_err_fail: 'Failed to update password. Please try again later.',
    lbl_pw_current: 'Current Password',
    lbl_pw_new: 'New Password',
    lbl_pw_confirm: 'Confirm New Password',
    pw_note: 'Password must be at least 6 characters. Re-login is required after change.',
    pw_btn_saving: 'Updating...',
    pw_btn_save: 'Change Password',

    notif_title: 'Push Notifications',
    notif_desc: 'Once enabled, task deadline reminders will be pushed to your device.',
    notif_status_lbl: 'Notification Permission Status',
    notif_status_desc: 'Browser notification permission status',
    notif_badge_enabled: 'Enabled',
    notif_badge_denied: 'Denied',
    notif_badge_notset: 'Not Set',
    notif_badge_unsupported: 'Unsupported',
    notif_btn_loading: 'Requesting...',
    notif_btn_enable: 'Enable Push Notifications',
    notif_btn_refresh: 'Refresh Push Registration',
    notif_success: 'Push notifications successfully enabled!',
    notif_denied_msg: 'Notification permission denied. Please go to browser settings -> site permissions, enable notifications manually, and refresh the page.',
    notif_unsupported_msg: '📱 iPhone users: Open the system in Safari, tap "Share" -> "Add to Home Screen" to enable push notifications.',
    notif_unsupported_alert: 'Your browser does not support push notifications. Use Chrome or Safari (iOS requires Add to Home Screen).',
    notif_success_alert: '✅ Notifications enabled! The system will remind you before task deadlines.',
    notif_denied_alert: '❌ Notification permission denied.\n\nPlease go to browser settings > site permissions and enable notifications manually.'
  }
}

const withTimeout = (promise, ms = 20000) => {
  let timeoutId
  const timeout = new Promise((_, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), ms)
  })

  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId))
}

const getDeviceKey = () => {
  if (typeof window === 'undefined') return ''
  const existing = window.localStorage.getItem('clc_device_key')
  if (existing) return existing
  const key = crypto?.randomUUID ? crypto.randomUUID() : `device-${Date.now()}-${Math.random().toString(16).slice(2)}`
  window.localStorage.setItem('clc_device_key', key)
  return key
}

const getDevicePlatform = () => {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent || ''
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios'
  if (/android/i.test(ua)) return 'android'
  if (/windows/i.test(ua)) return 'windows'
  if (/macintosh|mac os/i.test(ua)) return 'macos'
  return 'desktop'
}

export default function Settings({ currentUserProfile, lang = 'zh', onProfileUpdate }) {
  const t = T[lang] || T.zh

  const [profileDraft, setProfileDraft] = useState(currentUserProfile || {})
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [avatarError, setAvatarError] = useState('')
  const [avatarSuccess, setAvatarSuccess] = useState('')

  useEffect(() => {
    setProfileDraft(currentUserProfile || {})
  }, [currentUserProfile])

  // ── Password change ──
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwError, setPwError] = useState('')

  // ── Notification permission ──
  const [notifStatus, setNotifStatus] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'
  )
  const [notifLoading, setNotifLoading] = useState(false)
  const [localFcmToken, setLocalFcmToken] = useState(() =>
    typeof window !== 'undefined' ? (window.localStorage.getItem('clc_fcm_token') || '') : ''
  )

  useEffect(() => {
    let active = true

    const verifyLocalPushToken = async () => {
      if (!localFcmToken || !currentUserProfile?.id) return

      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('id, is_active')
        .eq('fcm_token', localFcmToken)
        .eq('user_id', currentUserProfile.id)
        .maybeSingle()

      if (!active) return
      if (error || !data?.is_active) {
        window.localStorage.removeItem('clc_fcm_token')
        setLocalFcmToken('')
      }
    }

    verifyLocalPushToken()
    return () => { active = false }
  }, [localFcmToken, currentUserProfile?.id])

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')

    if (pwNew !== pwConfirm) {
      setPwError(t.pw_err_match)
      return
    }
    if (pwNew.length < 6) {
      setPwError(t.pw_err_len)
      return
    }

    setPwLoading(true)
    try {
      // Step 1: 用现有密码重新验证
      const { error: signInError } = await withTimeout(supabase.auth.signInWithPassword({
        email: currentUserProfile.email,
        password: pwCurrent,
      }))
      if (signInError) {
        setPwError(t.pw_err_wrong)
        return
      }

      // Step 2: 更新密码
      const { error: updateError } = await withTimeout(supabase.auth.updateUser({ password: pwNew }))
      if (updateError) throw updateError

      setPwSuccess(t.pw_success)
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
    } catch (err) {
      if (err.message === 'REQUEST_TIMEOUT') {
        setPwError(lang === 'zh'
          ? '手机网络连接较慢，请刷新页面后再试，或换到稳定 Wi-Fi。'
          : 'The connection is slow. Please refresh and try again, or use a stable Wi-Fi connection.')
      } else {
        setPwError(err.message || t.pw_err_fail)
      }
    } finally {
      setPwLoading(false)
    }
  }

  const syncProfile = (patch) => {
    const nextProfile = { ...(profileDraft || {}), ...patch }
    setProfileDraft(nextProfile)
    onProfileUpdate?.(nextProfile)
  }

  const handleAvatarUpload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !currentUserProfile?.id) return

    setAvatarError('')
    setAvatarSuccess('')

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setAvatarError(lang === 'zh' ? '头像只支持 JPG、PNG 或 WEBP。' : 'Avatar must be JPG, PNG, or WEBP.')
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setAvatarError(lang === 'zh' ? '头像大小不能超过 5MB。' : 'Avatar must be 5MB or smaller.')
      return
    }

    setAvatarLoading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const filePath = `${currentUserProfile.id}/avatar-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: true,
        })

      if (uploadError) throw uploadError

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      const avatarUrl = data.publicUrl

      const { error: updateError } = await supabase.rpc('update_my_avatar_url', {
        p_avatar_url: avatarUrl,
      })

      if (updateError) throw updateError

      syncProfile({ avatar_url: avatarUrl })
      setAvatarSuccess(lang === 'zh' ? '头像已更新。' : 'Avatar updated.')
    } catch (err) {
      setAvatarError(err.message || (lang === 'zh' ? '头像上传失败。' : 'Failed to upload avatar.'))
    } finally {
      setAvatarLoading(false)
    }
  }

  const handleRemoveAvatar = async () => {
    if (!currentUserProfile?.id) return
    setAvatarError('')
    setAvatarSuccess('')
    setAvatarLoading(true)
    try {
      const { error } = await supabase.rpc('update_my_avatar_url', { p_avatar_url: '' })
      if (error) throw error
      syncProfile({ avatar_url: null })
      setAvatarSuccess(lang === 'zh' ? '已恢复系统默认头像。' : 'Default avatar restored.')
    } catch (err) {
      setAvatarError(err.message || (lang === 'zh' ? '无法移除头像。' : 'Failed to remove avatar.'))
    } finally {
      setAvatarLoading(false)
    }
  }

  const handleRequestNotifPermission = async () => {
    if (!('Notification' in window)) {
      alert(t.notif_unsupported_alert)
      return
    }

    setNotifLoading(true)

    try {
      // 1. 请求通知权限
      const permission = await Notification.requestPermission()

      setNotifStatus(permission)

      // 2. 用户拒绝
      if (permission === 'denied') {
        alert(t.notif_denied_alert)
        return
      }

      // 3. 用户允许
      if (permission === 'granted') {

        // 获取 FCM Token
        const token = await requestFcmToken()

        console.log('FCM TOKEN:', token)

        // 没拿到 token
        if (!token) {
          alert(lang === 'zh'
            ? '没有取得推送 Token。请确认已允许通知权限，并将系统以 PWA/App 方式打开后再试一次。'
            : 'Could not get a push token. Please make sure notifications are allowed and open the system as a PWA/App, then try again.')
          return
        }

        // 保存 token 到 Supabase
        const { error } = await supabase.rpc('update_my_notification_settings', {
          p_fcm_token: token,
          p_notification_enabled: true,
          p_device_key: getDeviceKey(),
          p_platform: getDevicePlatform(),
        })

        if (error) {
          console.error(error)
          alert('Failed to save notification token.')
          return
        }

        window.localStorage.setItem('clc_fcm_token', token)
        setLocalFcmToken(token)
        alert(t.notif_success_alert)
      }

    } catch (err) {
      console.error(err)
      alert(err.message || 'Notification setup failed.')
    } finally {
      setNotifLoading(false)
    }
  }

  const notifBadge = {
    granted: { label: t.notif_badge_enabled, bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
    denied: { label: t.notif_badge_denied, bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
    default: { label: t.notif_badge_notset, bg: '#fef9c3', color: '#ca8a04', border: '#fde047' },
    unsupported: { label: t.notif_badge_unsupported, bg: '#f5f5f5', color: '#6b7280', border: '#d1d5db' },
  }
  const badge = notifBadge[notifStatus] || notifBadge.default
  const hasPushToken = Boolean(localFcmToken)
  const displayBadge = notifStatus === 'granted' && !hasPushToken
    ? {
      label: lang === 'zh' ? '需重新注册' : 'Registration Needed',
      bg: '#fef9c3',
      color: '#ca8a04',
      border: '#fde047',
    }
    : badge

  const userRoleText = currentUserProfile?.role
    ? (currentUserProfile.role === 'custom' && currentUserProfile.custom_role_label
      ? currentUserProfile.custom_role_label
      : (ROLE_LABELS[currentUserProfile.role]?.[lang] || currentUserProfile.role))
    : '—'

  const avatarUrl = profileDraft?.avatar_url
  const avatarInitials = (profileDraft?.name || currentUserProfile?.name || (lang === 'zh' ? '会员' : 'ME')).slice(0, 2)

  return (
    <div className="space-y-6 max-w-2xl animate-[fadeIn_0.4s_ease]" style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* Page Title */}
      <div className="pb-4" style={{ borderBottom: '1.5px solid #e0f1ff' }}>
        <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
          {t.title}
        </h1>
        <p className="text-sm font-semibold mt-1" style={{ color: '#6b7280' }}>
          {t.subtitle}
        </p>
      </div>

      {/* ── 账号信息 ── */}
      <div style={cardStyle}>
        <h2 className="font-black text-base flex items-center gap-2 mb-4" style={{ color: '#1a1a1a' }}>
          <Camera size={18} style={{ color: '#95CBFF' }} />
          {lang === 'zh' ? '个人头像' : 'Profile Avatar'}
        </h2>

        <div className="flex flex-col sm:flex-row sm:items-center gap-5">
          <div className="w-24 h-24 rounded-3xl overflow-hidden flex items-center justify-center shrink-0"
            style={{ background: 'linear-gradient(135deg, #95CBFF 0%, #FFB3C6 100%)', boxShadow: '0 6px 20px rgba(149,203,255,0.35)' }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-black text-white" style={{ textShadow: '0 2px 8px rgba(40,96,150,0.35)' }}>
                {avatarInitials}
              </span>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <p className="text-xs font-semibold" style={{ color: '#6b7280' }}>
              {lang === 'zh'
                ? '可上传 JPG、PNG 或 WEBP，最大 5MB。不上传时会使用系统默认头像。'
                : 'Upload JPG, PNG, or WEBP up to 5MB. If empty, the system default avatar is used.'}
            </p>

            {avatarError && (
              <div className="p-3 rounded-2xl text-xs font-semibold"
                style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
                {avatarError}
              </div>
            )}
            {avatarSuccess && (
              <div className="p-3 rounded-2xl text-xs font-semibold"
                style={{ background: '#dcfce7', border: '1.5px solid #86efac', color: '#16a34a' }}>
                {avatarSuccess}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black cursor-pointer text-white"
                style={{ background: avatarLoading ? '#b8deff' : '#95CBFF', boxShadow: '0 4px 16px rgba(149,203,255,0.25)' }}>
                {avatarLoading ? <Loader size={14} className="animate-spin" /> : <Camera size={14} />}
                {avatarLoading ? (lang === 'zh' ? '上传中...' : 'Uploading...') : (lang === 'zh' ? '上传头像' : 'Upload Avatar')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  disabled={avatarLoading}
                  className="hidden"
                />
              </label>

              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={avatarLoading}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-black"
                  style={{ background: '#f5f5f5', color: '#6b7280', border: '1.5px solid #d1d5db' }}>
                  <Trash2 size={14} />
                  {lang === 'zh' ? '恢复默认' : 'Use Default'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 className="font-black text-base flex items-center gap-2 mb-4" style={{ color: '#1a1a1a' }}>
          <User size={18} style={{ color: '#95CBFF' }} />
          {t.info_title}
        </h2>
        <div className="space-y-3">
          {[
            { label: t.lbl_name, value: currentUserProfile?.name || '—' },
            { label: t.lbl_email, value: currentUserProfile?.email || '—' },
            { label: t.lbl_role, value: userRoleText },
            { label: t.lbl_status, value: currentUserProfile?.is_active ? t.lbl_status_active : t.lbl_status_inactive },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-3 rounded-2xl"
              style={{ background: '#f0f7ff' }}>
              <span className="text-xs font-black uppercase tracking-wider text-gray-500">
                {row.label}
              </span>
              <span className="text-sm font-black text-gray-800">
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs font-semibold mt-3" style={{ color: '#9ca3af' }}>
          {t.lbl_admin_note}
        </p>
      </div>

      {/* ── 修改密码 ── */}
      <div style={cardStyle}>
        <h2 className="font-black text-base flex items-center gap-2 mb-4" style={{ color: '#1a1a1a' }}>
          <KeyRound size={18} style={{ color: '#95CBFF' }} />
          {t.pw_title}
        </h2>

        {pwSuccess && (
          <div className="flex items-start gap-2.5 p-3.5 mb-4 rounded-2xl text-sm font-semibold animate-pulse"
            style={{ background: '#dcfce7', border: '1.5px solid #86efac', color: '#16a34a' }}>
            <CheckCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            {pwSuccess}
          </div>
        )}
        {pwError && (
          <div className="flex items-start gap-2.5 p-3.5 mb-4 rounded-2xl text-sm font-semibold"
            style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
            <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
            {pwError}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          {[
            { label: t.lbl_pw_current, value: pwCurrent, setter: setPwCurrent },
            { label: t.lbl_pw_new, value: pwNew, setter: setPwNew },
            { label: t.lbl_pw_confirm, value: pwConfirm, setter: setPwConfirm },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-black uppercase tracking-wider mb-1.5 text-gray-500">
                {f.label}
              </label>
              <input
                type="password"
                required
                value={f.value}
                onChange={(e) => f.setter(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>
          ))}

          <div className="flex items-center gap-2 p-3 rounded-2xl text-xs font-semibold"
            style={{ background: '#fef9c3', border: '1.5px solid #fde047', color: '#ca8a04' }}>
            <ShieldCheck size={14} style={{ flexShrink: 0 }} />
            {t.pw_note}
          </div>

          <button
            type="submit"
            disabled={pwLoading}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-black transition cursor-pointer text-white"
            style={{ background: pwLoading ? '#b8deff' : '#95CBFF' }}>
            {pwLoading ? <><Loader size={14} className="animate-spin" /> {t.pw_btn_saving}</> : t.pw_btn_save}
          </button>
        </form>
      </div>

      {/* ── 通知权限 ── */}
      <div style={cardStyle}>
        <h2 className="font-black text-base flex items-center gap-2 mb-2" style={{ color: '#1a1a1a' }}>
          <Bell size={18} style={{ color: '#95CBFF' }} />
          {t.notif_title}
        </h2>
        <p className="text-sm font-semibold mb-4" style={{ color: '#6b7280' }}>
          {t.notif_desc}
        </p>

        <div className="flex items-center justify-between p-4 rounded-2xl mb-4"
          style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
          <div>
            <div className="text-sm font-black" style={{ color: '#1a1a1a' }}>{t.notif_status_lbl}</div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: '#6b7280' }}>
              {t.notif_status_desc}
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-black"
            style={{ background: displayBadge.bg, color: displayBadge.color, border: `1.5px solid ${displayBadge.border}` }}>
            {displayBadge.label}
          </span>
        </div>

        {notifStatus !== 'unsupported' && (
          <button
            onClick={handleRequestNotifPermission}
            disabled={notifLoading || notifStatus === 'denied'}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black transition cursor-pointer text-white"
            style={{
              background: notifStatus === 'denied' ? '#f5f5f5' : '#95CBFF',
              color: notifStatus === 'denied' ? '#9ca3af' : 'white',
              cursor: notifStatus === 'denied' ? 'not-allowed' : 'pointer',
            }}>
            {notifLoading
              ? <><Loader size={14} className="animate-spin" /> {t.notif_btn_loading}</>
              : <><Bell size={14} /> {notifStatus === 'granted' ? t.notif_btn_refresh : t.notif_btn_enable}</>}
          </button>
        )}

        {notifStatus === 'granted' && hasPushToken && (
          <div className="flex items-center gap-2 text-sm font-black text-green-600">
            <CheckCircle size={16} />
            {t.notif_success}
          </div>
        )}

        {notifStatus === 'granted' && !hasPushToken && (
          <div className="p-3 rounded-2xl text-xs font-semibold"
            style={{ background: '#fef9c3', border: '1.5px solid #fde047', color: '#ca8a04' }}>
            {lang === 'zh'
              ? '通知权限已经允许，但这台设备还没有完成推送注册。请点击「重新注册推送通知」，让系统重新取得这台设备的 Token。'
              : 'Notification permission is allowed, but this device has not completed push registration. Click "Refresh Push Registration" to get a token for this device.'}
          </div>
        )}

        {notifStatus === 'denied' && (
          <div className="p-3 rounded-2xl text-xs font-semibold"
            style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
            {t.notif_denied_msg}
          </div>
        )}

        {notifStatus === 'unsupported' && (
          <div className="p-3 rounded-2xl text-xs font-semibold"
            style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
            {t.notif_unsupported_msg}
          </div>
        )}
      </div>
    </div>
  )
}
