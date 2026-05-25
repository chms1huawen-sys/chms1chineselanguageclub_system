import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import { LogIn, Globe, ShieldAlert } from 'lucide-react'

const TRANSLATIONS = {
  zh: {
    title: '一中华文学会系统',
    subtitle: '内部管理与任务提醒平台',
    email: '电子邮箱',
    emailPlaceholder: '请输入电子邮箱',
    password: '登录密码',
    passwordPlaceholder: '请输入密码',
    login: '立即登录',
    loggingIn: '正在登录...',
    errorTitle: '登录失败',
    invalidCreds: '邮箱或密码不正确，请重新输入。',
    installNotice: '首次登录？请在 Safari 浏览器中点击「添加到主屏幕」以开启推送通知。',
    footer: '一中华文学会 · 2026'
  },
  en: {
    title: 'SMJK Yoke Kuan CLS System',
    subtitle: 'Internal Management & Task Reminder Platform',
    email: 'Email Address',
    emailPlaceholder: 'Enter your email',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    login: 'Sign In',
    loggingIn: 'Signing in...',
    errorTitle: 'Sign In Failed',
    invalidCreds: 'Incorrect email or password. Please try again.',
    installNotice: 'First time? Tap "Add to Home Screen" in Safari to enable mobile push notifications.',
    footer: 'SMJK Yoke Kuan CLS · 2026'
  }
}

export default function Login({ onLoginSuccess }) {
  const [lang, setLang] = useState('zh')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const t = TRANSLATIONS[lang]

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        if (error.message === 'Invalid login credentials') {
          setErrorMsg(t.invalidCreds)
        } else {
          setErrorMsg(error.message)
        }
        setLoading(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .single()

      if (profileError || !profile) {
        const errorDetail = profileError ? ` (DB Error: ${profileError.message} [code ${profileError.code}])` : ' (No row matches UID in public.users)'
        setErrorMsg((lang === 'zh' ? '未找到对应的成员档案，请联系管理员。' : 'Member profile not found. Please contact your convener/advisor teacher.') + errorDetail)
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      if (!profile.is_active) {
        setErrorMsg(lang === 'zh' ? '该账号已被停用，无法登录。' : 'This account has been deactivated.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      onLoginSuccess(data.user, profile)
    } catch (err) {
      setErrorMsg(err.message || 'An unexpected error occurred.')
      setLoading(false)
    }
  }

  const toggleLanguage = () => setLang(prev => prev === 'zh' ? 'en' : 'zh')

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #e0f1ff 0%, #f0f7ff 50%, #ffe9f0 100%)', fontFamily: "'Nunito', sans-serif" }}>

      {/* Decorative blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-72 h-72 rounded-full opacity-40 pointer-events-none"
        style={{ background: '#95CBFF', filter: 'blur(80px)' }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-72 h-72 rounded-full opacity-30 pointer-events-none"
        style={{ background: '#FFB3C6', filter: 'blur(80px)' }} />

      {/* White line cartoon deco */}
      <svg className="absolute top-8 right-8 opacity-20 pointer-events-none" width="80" height="80" viewBox="0 0 80 80" fill="none">
        <polygon points="40,6 48,28 72,28 54,44 62,66 40,52 18,66 26,44 8,28 32,28"
          stroke="#95CBFF" strokeWidth="2.5" strokeLinejoin="round" fill="none" />
      </svg>
      <svg className="absolute bottom-10 left-10 opacity-20 pointer-events-none" width="60" height="60" viewBox="0 0 60 60" fill="none">
        <circle cx="30" cy="30" r="22" stroke="#95CBFF" strokeWidth="2" fill="none" />
        <circle cx="22" cy="26" r="4" stroke="#95CBFF" strokeWidth="2" fill="none" />
        <circle cx="38" cy="26" r="4" stroke="#95CBFF" strokeWidth="2" fill="none" />
        <path d="M22 38 Q30 44 38 38" stroke="#95CBFF" strokeWidth="2" strokeLinecap="round" fill="none" />
      </svg>

      <div className="w-full max-w-md z-10">
        {/* Language Selector */}
        <div className="flex justify-end mb-4">
          <button
            onClick={toggleLanguage}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition cursor-pointer"
            style={{ background: 'white', border: '1.5px solid #95CBFF', color: '#6db8ff' }}>
            <Globe size={14} style={{ color: '#95CBFF' }} />
            {lang === 'zh' ? 'English' : '中文'}
          </button>
        </div>

        {/* Card */}
        <div className="p-8 rounded-3xl" style={{ background: 'white', boxShadow: '0 8px 40px rgba(149,203,255,0.25)', border: '1.5px solid #e0f1ff' }}>

          {/* Logo area with pink blob deco */}
          <div className="text-center mb-8">
            <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
              style={{ background: '#95CBFF', boxShadow: '0 4px 20px rgba(149,203,255,0.4)' }}>
              {/* pink blob behind icon */}
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full opacity-50"
                style={{ background: '#FFB3C6' }} />
              <LogIn size={28} color="white" style={{ position: 'relative', zIndex: 1 }} />
            </div>
            <h1 className="text-2xl font-black mb-2" style={{ color: '#1a1a1a' }}>{t.title}</h1>
            <p className="text-sm font-semibold" style={{ color: '#6b7280' }}>{t.subtitle}</p>
          </div>

          {errorMsg && (
            <div className="flex items-start gap-2.5 p-3.5 mb-6 rounded-2xl text-sm"
              style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
              <ShieldAlert size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
              <div>
                <p className="font-bold">{t.errorTitle}</p>
                <p className="text-xs mt-0.5" style={{ color: '#b91c1c' }}>{errorMsg}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>{t.email}</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                className="w-full px-4 py-3 rounded-2xl text-sm font-semibold transition outline-none"
                style={{ background: '#f0f7ff', border: '1.5px solid #95CBFF', color: '#1a1a1a' }}
                onFocus={e => e.target.style.border = '1.5px solid #6db8ff'}
                onBlur={e => e.target.style.border = '1.5px solid #95CBFF'}
              />
            </div>

            <div>
              <label className="block text-xs font-black uppercase tracking-wider mb-2" style={{ color: '#6b7280' }}>{t.password}</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.passwordPlaceholder}
                className="w-full px-4 py-3 rounded-2xl text-sm font-semibold transition outline-none"
                style={{ background: '#f0f7ff', border: '1.5px solid #95CBFF', color: '#1a1a1a' }}
                onFocus={e => e.target.style.border = '1.5px solid #6db8ff'}
                onBlur={e => e.target.style.border = '1.5px solid #95CBFF'}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl text-white font-black text-sm transition cursor-pointer mt-6"
              style={{
                background: loading ? '#b8deff' : '#95CBFF',
                boxShadow: '0 4px 20px rgba(149,203,255,0.45)',
                opacity: loading ? 0.7 : 1
              }}>
              {loading ? t.loggingIn : t.login}
            </button>
          </form>
        </div>

        {/* PWA Mobile Tips */}
        <div className="mt-6 text-center text-xs px-4 leading-relaxed font-semibold" style={{ color: '#6b7280' }}>
          {t.installNotice}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-xs font-bold" style={{ color: '#95CBFF' }}>
          {t.footer}
        </div>
      </div>
    </div>
  )
}