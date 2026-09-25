// src/pages/Settings.jsx
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { KeyRound, User, Bell, BellOff, CheckCircle, AlertCircle, Loader, ShieldCheck } from 'lucide-react'

const ROLE_LABELS = {
  advisor: '顾问老师 (Advisor)',
  chairperson: '主席 (Chairperson)',
  vice_chairperson: '副主席 (Vice Chairperson)',
  secretary: '秘书 (Secretary)',
  treasurer: '财政 (Treasurer)',
  committee: '部门干部 (Committee)',
  event_member: '筹委成员 (Event Member)',
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

export default function Settings({ currentUserProfile }) {
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

  const handleChangePassword = async (e) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')

    if (pwNew !== pwConfirm) {
      setPwError('两次输入的新密码不一致。')
      return
    }
    if (pwNew.length < 6) {
      setPwError('新密码至少需要 6 位。')
      return
    }

    setPwLoading(true)
    try {
      // Step 1: 用现有密码重新验证
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: currentUserProfile.email,
        password: pwCurrent,
      })
      if (signInError) {
        setPwError('当前密码不正确，请重新输入。')
        setPwLoading(false)
        return
      }

      // Step 2: 更新密码
      const { error: updateError } = await supabase.auth.updateUser({ password: pwNew })
      if (updateError) throw updateError

      setPwSuccess('密码已成功更新！请用新密码重新登录。')
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
    } catch (err) {
      setPwError(err.message || '密码更新失败，请稍后再试。')
    } finally {
      setPwLoading(false)
    }
  }

  const handleRequestNotifPermission = async () => {
    if (!('Notification' in window)) {
      alert('你的浏览器不支持推送通知。请使用 Chrome 或 Safari（iOS 需添加到主屏幕）。')
      return
    }

    setNotifLoading(true)
    try {
      const permission = await Notification.requestPermission()
      setNotifStatus(permission)

      if (permission === 'granted') {
        // 如果你已经集成 FCM，在这里重新获取并保存 token
        // import { getFCMToken } from '../utils/fcm'
        // const token = await getFCMToken()
        // if (token) await saveFCMToken(token, currentUserProfile.id)
        alert('✅ 通知已开启！系统将在任务截止前提醒你。')
      } else if (permission === 'denied') {
        alert('❌ 通知权限被拒绝。\n\n请前往浏览器设置 > 网站权限，手动开启此网站的通知权限。')
      }
    } finally {
      setNotifLoading(false)
    }
  }

  const notifBadge = {
    granted: { label: '已开启 Enabled', bg: '#dcfce7', color: '#16a34a', border: '#86efac' },
    denied: { label: '已拒绝 Denied', bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' },
    default: { label: '未设置 Not Set', bg: '#fef9c3', color: '#ca8a04', border: '#fde047' },
    unsupported: { label: '不支持 Unsupported', bg: '#f5f5f5', color: '#6b7280', border: '#d1d5db' },
  }
  const badge = notifBadge[notifStatus] || notifBadge.default

  return (
    <div className="space-y-6 max-w-2xl" style={{ fontFamily: "'Nunito', sans-serif" }}>

      {/* Page Title */}
      <div className="pb-4" style={{ borderBottom: '1.5px solid #e0f1ff' }}>
        <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
          ⚙️ 个人设置
        </h1>
        <p className="text-sm font-semibold mt-1" style={{ color: '#6b7280' }}>
          Account Settings · 管理你的账号信息与通知偏好
        </p>
      </div>

      {/* ── 账号信息 ── */}
      <div style={cardStyle}>
        <h2 className="font-black text-base flex items-center gap-2 mb-4" style={{ color: '#1a1a1a' }}>
          <User size={18} style={{ color: '#95CBFF' }} />
          账号信息 Account Info
        </h2>
        <div className="space-y-3">
          {[
            { label: '姓名 Name', value: currentUserProfile?.name || '—' },
            { label: '电子邮箱 Email', value: currentUserProfile?.email || '—' },
            { label: '系统角色 Role', value: ROLE_LABELS[currentUserProfile?.role] || currentUserProfile?.role || '—' },
            { label: '账号状态 Status', value: currentUserProfile?.is_active ? '✅ 使用中 Active' : '❌ 已停用 Deactivated' },
          ].map((row) => (
            <div key={row.label} className="flex items-center justify-between px-4 py-3 rounded-2xl"
              style={{ background: '#f0f7ff' }}>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: '#6b7280' }}>
                {row.label}
              </span>
              <span className="text-sm font-black" style={{ color: '#1a1a1a' }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs font-semibold mt-3" style={{ color: '#9ca3af' }}>
          如需修改姓名或角色，请联系主席或顾问老师。
        </p>
      </div>

      {/* ── 修改密码 ── */}
      <div style={cardStyle}>
        <h2 className="font-black text-base flex items-center gap-2 mb-4" style={{ color: '#1a1a1a' }}>
          <KeyRound size={18} style={{ color: '#95CBFF' }} />
          修改密码 Change Password
        </h2>

        {pwSuccess && (
          <div className="flex items-start gap-2.5 p-3.5 mb-4 rounded-2xl text-sm font-semibold"
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
            { label: '当前密码 Current Password', value: pwCurrent, setter: setPwCurrent },
            { label: '新密码 New Password', value: pwNew, setter: setPwNew },
            { label: '确认新密码 Confirm New Password', value: pwConfirm, setter: setPwConfirm },
          ].map((f) => (
            <div key={f.label}>
              <label className="block text-xs font-black uppercase tracking-wider mb-1.5"
                style={{ color: '#6b7280' }}>
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
            密码至少 6 位。修改后需重新登录。
          </div>

          <button
            type="submit"
            disabled={pwLoading}
            className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-2xl text-sm font-black transition cursor-pointer"
            style={{ background: pwLoading ? '#b8deff' : '#95CBFF', color: 'white' }}>
            {pwLoading ? <><Loader size={14} className="animate-spin" /> 更新中...</> : '确认修改密码'}
          </button>
        </form>
      </div>

      {/* ── 通知权限 ── */}
      <div style={cardStyle}>
        <h2 className="font-black text-base flex items-center gap-2 mb-2" style={{ color: '#1a1a1a' }}>
          <Bell size={18} style={{ color: '#95CBFF' }} />
          推送通知 Push Notifications
        </h2>
        <p className="text-sm font-semibold mb-4" style={{ color: '#6b7280' }}>
          开启后，任务截止提醒将推送到你的设备。
        </p>

        <div className="flex items-center justify-between p-4 rounded-2xl mb-4"
          style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
          <div>
            <div className="text-sm font-black" style={{ color: '#1a1a1a' }}>当前通知权限</div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: '#6b7280' }}>
              Browser notification permission status
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-black"
            style={{ background: badge.bg, color: badge.color, border: `1.5px solid ${badge.border}` }}>
            {badge.label}
          </span>
        </div>

        {notifStatus !== 'granted' && notifStatus !== 'unsupported' && (
          <button
            onClick={handleRequestNotifPermission}
            disabled={notifLoading || notifStatus === 'denied'}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl text-sm font-black transition cursor-pointer"
            style={{
              background: notifStatus === 'denied' ? '#f5f5f5' : '#95CBFF',
              color: notifStatus === 'denied' ? '#9ca3af' : 'white',
              cursor: notifStatus === 'denied' ? 'not-allowed' : 'pointer',
            }}>
            {notifLoading
              ? <><Loader size={14} className="animate-spin" /> 请求中...</>
              : <><Bell size={14} /> 开启推送通知</>}
          </button>
        )}

        {notifStatus === 'granted' && (
          <div className="flex items-center gap-2 text-sm font-black" style={{ color: '#16a34a' }}>
            <CheckCircle size={16} />
            推送通知已成功开启！
          </div>
        )}

        {notifStatus === 'denied' && (
          <div className="p-3 rounded-2xl text-xs font-semibold"
            style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
            <strong>通知权限已被拒绝。</strong> 请前往浏览器设置 → 网站权限，手动开启此网站的通知权限，然后刷新页面。
          </div>
        )}

        {notifStatus === 'unsupported' && (
          <div className="p-3 rounded-2xl text-xs font-semibold"
            style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
            📱 iPhone 用户：请用 <strong>Safari</strong> 打开系统，点击「分享」→「添加到主屏幕」后，推送通知功能即可使用。
          </div>
        )}
      </div>
    </div>
  )
}
