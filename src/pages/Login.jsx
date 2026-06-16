import React, { useState } from 'react'
import { supabase } from '../supabaseClient'
import { Globe, ShieldAlert } from 'lucide-react'

const LOGIN_PHOTO_URL = 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?auto=format&fit=crop&w=1400&q=80'

const TRANSLATIONS = {
  zh: {
    title: '一中华文学会系统',
    subtitle: '华文学会内部管理平台',
    email: '电子邮箱',
    emailPlaceholder: '请输入电子邮箱',
    password: '登录密码',
    passwordPlaceholder: '请输入密码',
    login: '立即登录',
    loggingIn: '正在登录...',
    errorTitle: '登录失败',
    invalidCreds: '邮箱或密码不正确，请重新输入。',
    installNotice: '请依据主席及老师给予的账号及密码登入。',
    footer: '一中华文学会系统'
  },
  en: {
    title: 'CLC_sys',
    subtitle: 'Internal Management & Task Reminder Platform',
    email: 'Email Address',
    emailPlaceholder: 'Enter your email',
    password: 'Password',
    passwordPlaceholder: 'Enter your password',
    login: 'Sign In',
    loggingIn: 'Signing in...',
    errorTitle: 'Sign In Failed',
    invalidCreds: 'Incorrect email or password. Please try again.',
    installNotice: 'Please log in with the account and password given by the president and teachers.',
    footer: 'CLC_sys'
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
    <div
      className="relative min-h-screen flex items-center justify-center px-4 py-8 overflow-hidden"
      style={{ background: '#e0f1ff', fontFamily: "'Nunito', sans-serif" }}>
      <img
        src={LOGIN_PHOTO_URL}
        alt=""
        className="absolute inset-0 w-full h-full object-cover login-photo-motion"
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(135deg, rgba(224, 241, 255, 0.82) 0%, rgba(240, 247, 255, 0.68) 48%, rgba(255, 233, 240, 0.72) 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(circle at 18% 18%, rgba(149,203,255,0.45), transparent 34%), radial-gradient(circle at 82% 80%, rgba(255,179,198,0.38), transparent 30%)' }} />
      <div
        className="relative z-10 w-full max-w-6xl min-h-[680px] md:min-h-[760px] grid grid-cols-1 md:grid-cols-[1fr_440px] overflow-hidden rounded-3xl"
        style={{ boxShadow: '0 18px 56px rgba(90, 149, 202, 0.24)' }}>
        <div className="hidden md:flex relative p-10 items-end">
          <div className="max-w-md text-white">
            <p className="text-xs font-black uppercase tracking-[0.2em]" style={{ textShadow: '0 2px 10px rgba(38, 88, 132, 0.45)' }}>
              {lang === 'zh' ? '中华文学会系统' : 'CLC_sys'}
            </p>
            <p className="text-3xl font-black mt-2" style={{ textShadow: '0 2px 14px rgba(38, 88, 132, 0.5)' }}>
              一中华文学会系统
            </p>
          </div>
        </div>

        <div className="relative flex flex-col justify-center px-6 py-8 md:px-10 md:py-12 bg-white/94 backdrop-blur-sm rounded-3xl md:rounded-l-none"
          style={{ border: '1.5px solid rgba(224, 241, 255, 0.95)' }}>
          <button
            onClick={toggleLanguage}
            className="absolute top-5 right-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold transition cursor-pointer"
            style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6db8ff' }}>
            <Globe size={14} style={{ color: '#95CBFF' }} />
            {lang === 'zh' ? '英文' : '中文'}
          </button>

          <div className="text-center mb-8">
            <div
              className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-5 overflow-hidden"
              style={{ boxShadow: '0 8px 24px rgba(149, 203, 255, 0.28)' }}>
              <img src="/logo-192.png" alt="CLC_sys" className="w-full h-full object-cover rounded-full" />
            </div>
            <h1 className="text-2xl md:text-3xl font-black mb-2" style={{ color: '#1a1a1a' }}>{t.title}</h1>
            <p className="text-sm md:text-base font-semibold" style={{ color: '#7b8498' }}>{t.subtitle}</p>
            <div className="w-full h-px mt-7" style={{ background: '#e5e7eb' }} />
          </div>

          {errorMsg && (
            <div
              className="flex items-start gap-2.5 p-3.5 mb-6 rounded-2xl text-sm"
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
              className="w-full flex items-center justify-center gap-2 py-4 px-4 rounded-2xl text-white font-black text-base transition cursor-pointer mt-7"
              style={{
                background: loading ? '#b8deff' : '#95CBFF',
                boxShadow: '0 10px 26px rgba(149, 203, 255, 0.38)',
                opacity: loading ? 0.7 : 1
              }}>
              {loading ? t.loggingIn : t.login}
            </button>
          </form>

          <div className="mt-7 text-center text-xs px-4 leading-relaxed font-semibold" style={{ color: '#6b7280' }}>
            {t.installNotice}
          </div>

          <div className="w-full h-px mt-7" style={{ background: '#e5e7eb' }} />
          <div className="mt-5 text-center text-xs font-bold" style={{ color: '#95CBFF' }}>
            {t.footer}
          </div>
        </div>
      </div>
    </div>
  )
}
