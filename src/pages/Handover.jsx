import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import {
  AlertTriangle,
  Calendar,
  CheckCircle,
  Loader,
  ShieldAlert,
  UserCheck,
  UserMinus,
  Users,
} from 'lucide-react'

const BOARD_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor']

const ROLE_LABELS = {
  convener_teacher: { zh: '召集老师', en: 'Convener' },
  advisor_teacher: { zh: '指导老师', en: 'Advisor' },
  advisor: { zh: '指导老师', en: 'Advisor' },
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
  media_lead: { zh: '正摄影', en: 'Media Lead' },
  vice_media_lead: { zh: '副摄影', en: 'Vice Media Lead' },
  ordinary_member: { zh: '普通会员', en: 'Member' },
  custom: { zh: '自定义', en: 'Custom' },
}

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

const getLocalDate = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const getRoleLabel = (user, lang) => {
  if (user?.role === 'custom' && user.custom_role_label) return user.custom_role_label
  const label = ROLE_LABELS[user?.role]
  return label ? label[lang] : user?.role || (lang === 'zh' ? '成员' : 'Member')
}

export default function Handover({ currentUserProfile, lang }) {
  const _ = (zh, en) => lang === 'zh' ? zh : en
  const [currentBoard, setCurrentBoard] = useState(null)
  const [activeUsers, setActiveUsers] = useState([])
  const [newYear, setNewYear] = useState(String(new Date().getFullYear()))
  const [newHalf, setNewHalf] = useState(new Date().getMonth() < 6 ? '上半年' : '下半年')
  const [deactivateIds, setDeactivateIds] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [handoverStep, setHandoverStep] = useState('confirm')

  const isPowerUser = BOARD_MANAGER_ROLES.includes(currentUserProfile?.role)
  const sessionLabel = `${newYear} ${newHalf}`
  const sessionCode = `${newYear}-${newHalf === '上半年' ? 'H1' : 'H2'}`

  const keptUsers = useMemo(
    () => activeUsers.filter(user => !deactivateIds.includes(user.id)),
    [activeUsers, deactivateIds],
  )

  useEffect(() => {
    fetchHandoverData()
  }, [])

  const fetchHandoverData = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const [boardResult, usersResult] = await Promise.all([
        supabase
          .from('teams')
          .select('*')
          .eq('type', 'board')
          .eq('is_archived', false)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('users')
          .select('id, name, email, role, custom_role_label, is_active')
          .eq('is_active', true)
          .order('role', { ascending: true })
          .order('name', { ascending: true }),
      ])

      if (boardResult.error) throw boardResult.error
      if (usersResult.error) throw usersResult.error

      setCurrentBoard(boardResult.data || null)
      setActiveUsers(usersResult.data || [])
    } catch (err) {
      setErrorMsg(err.message || _('获取学期切换资料失败', 'Failed to load handover data.'))
    } finally {
      setLoading(false)
    }
  }

  const toggleDeactivate = (userId) => {
    if (userId === currentUserProfile?.id) return
    setDeactivateIds(prev => prev.includes(userId)
      ? prev.filter(id => id !== userId)
      : [...prev, userId])
  }

  const handleTriggerHandover = async (event) => {
    event.preventDefault()
    if (!isPowerUser) return

    if (!/^\d{4}$/.test(newYear)) {
      setErrorMsg(_('年份格式不正确，请输入 4 位年份，例如 2026。', 'Invalid year format. Enter a 4-digit year, e.g. 2026.'))
      return
    }

    const safeDeactivateIds = deactivateIds.filter(id => id !== currentUserProfile?.id)
    const confirmMsg = _('⚠️ 确认执行学期名单切换？\n\n', '⚠️ Confirm term handover?\n\n') +
      _('新学期：', 'New term: ') + sessionLabel + '\n' +
      _('将归档当前名单：', 'Archive current roster: ') + (currentBoard ? `${currentBoard.name} (${currentBoard.session})` : _('无活跃名单', 'No active roster')) + '\n' +
      _('将停用账号：', 'Deactivate accounts: ') + safeDeactivateIds.length + _(' 个', '') + '\n' +
      _('将保留账号：', 'Keep accounts: ') + keptUsers.length + _(' 个', '') + '\n\n' +
      _('请输入 "YES" 确认执行。', 'Type "YES" to confirm.')

    if (window.prompt(confirmMsg) !== 'YES') {
      alert(_('已取消学期切换。', 'Handover cancelled.'))
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      const today = getLocalDate()

      if (currentBoard) {
        const { error: archiveError } = await supabase
          .from('teams')
          .update({ is_archived: true, end_date: today })
          .eq('id', currentBoard.id)

        if (archiveError) throw archiveError
      }

      const { data: newRoster, error: createError } = await supabase
        .from('teams')
        .insert({
          name: `一中华文学会 ${sessionLabel} 名单`,
          type: 'board',
          session: sessionCode,
          is_archived: false,
          start_date: today,
        })
        .select()
        .single()

      if (createError) throw createError

      if (safeDeactivateIds.length > 0) {
        const { error: deactivateError } = await supabase
          .from('users')
          .update({ is_active: false })
          .in('id', safeDeactivateIds)

        if (deactivateError) throw deactivateError
      }

      const rosterRows = activeUsers
        .filter(user => !safeDeactivateIds.includes(user.id))
        .map(user => ({
          team_id: newRoster.id,
          user_id: user.id,
          position: getRoleLabel(user, 'zh'),
        }))

      if (rosterRows.length > 0) {
        const { error: memberError } = await supabase
          .from('team_members')
          .insert(rosterRows)

        if (memberError) throw memberError
      }

      setSuccessMsg(_(`已建立 ${sessionLabel} 名单，停用 ${safeDeactivateIds.length} 个账号，保留 ${rosterRows.length} 个账号。`, `Created ${sessionLabel} roster. Deactivated ${safeDeactivateIds.length} accounts, kept ${rosterRows.length} accounts.`))
      setHandoverStep('success')
    } catch (err) {
      setErrorMsg(err.message || _('学期切换失败', 'Handover failed.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!isPowerUser) {
    return (
      <div className="py-20 text-center space-y-3 p-8 rounded-3xl"
        style={{ background: 'white', border: '1.5px solid #e0f1ff', boxShadow: '0 4px 20px rgba(149,203,255,0.15)' }}>
        <ShieldAlert size={36} style={{ color: '#ef4444', margin: '0 auto' }} />
        <h2 className="text-lg font-black" style={{ color: '#1a1a1a' }}>{_('越权访问', 'Unauthorized')}</h2>
        <p className="text-sm max-w-md mx-auto font-semibold" style={{ color: '#6b7280' }}>
          {_('只有召集老师、指导老师、主席或副主席拥有学期名单切换权限。', 'Only the convener teacher, advisor teacher, president, or vice president can access term handover.')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 text-left" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <div className="pb-5" style={{ borderBottom: '1.5px solid #e0f1ff' }}>
        <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
          <ShieldAlert style={{ color: '#95CBFF' }} />
          {_('学期名单切换', 'Term Roster Handover')}
        </h1>
        <p className="text-sm mt-1 font-semibold" style={{ color: '#6b7280' }}>
          {_('学期名单切换 — 手动指定年份与半年，停用权限到期账号', 'Manually specify the year and half, deactivate expired accounts.')}
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
          <Loader size={32} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
          <p className="font-bold">{_('加载学期切换状态中...', 'Loading handover data...')}</p>
        </div>
      ) : handoverStep === 'confirm' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <form onSubmit={handleTriggerHandover} className="lg:col-span-2 p-6 rounded-3xl bg-white border border-[#e0f1ff] space-y-6"
            style={{ boxShadow: '0 4px 20px rgba(149,203,255,0.06)' }}>
            <div className="space-y-2.5">
              <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5 pb-2 border-b-1.5 border-[#f0f7ff]">
                <Calendar size={16} style={{ color: '#95CBFF' }} />
                {_('新学期资料', 'New Term Details')}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-2 text-gray-500">{_('年份', 'Year')}</label>
                  <input
                    type="text"
                    required
                    value={newYear}
                    onChange={(e) => setNewYear(e.target.value)}
                    placeholder={_('例如: 2026', 'e.g. 2026')}
                    className="w-full text-sm font-black transition"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider mb-2 text-gray-500">{_('半年', 'Half')}</label>
                  <select
                    value={newHalf}
                    onChange={(e) => setNewHalf(e.target.value)}
                    className="w-full text-sm font-black transition"
                    style={inputStyle}>
                    <option value="上半年">{_('上半年', 'First Half')}</option>
                    <option value="下半年">{_('下半年', 'Second Half')}</option>
                  </select>
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#f0f7ff] border border-[#e0f1ff] text-xs font-semibold text-gray-600">
                {_('当前活跃名单：', 'Current active roster: ')}<strong>{currentBoard ? `${currentBoard.name} (${currentBoard.session})` : _('无活跃名单', 'None')}</strong>
                <br />
                {_('即将建立：', 'New roster: ')}<strong>{_('一中华文学会 ', 'CLC_sys ') + sessionLabel + _(' 名单', ' Roster')} ({sessionCode})</strong>
              </div>
            </div>

            {errorMsg && (
              <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold"
                style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
                <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                <p>{errorMsg}</p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
              <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5">
                <UserMinus size={16} style={{ color: '#ef4444' }} />
                {_('勾选要停用的账号', 'Select Accounts to Deactivate')}
              </h3>
              <span className="text-xs font-black px-3 py-1 rounded-full" style={{ background: '#ffe4ec', color: '#be185d' }}>
                {_('已选', 'Selected')} {deactivateIds.length}
              </span>
              </div>

              <div className="max-h-[430px] overflow-y-auto rounded-2xl" style={{ border: '1.5px solid #e0f1ff' }}>
                {activeUsers.map(user => {
                  const selected = deactivateIds.includes(user.id)
                  const isSelf = user.id === currentUserProfile?.id
                  return (
                    <label
                      key={user.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      style={{
                        background: selected ? '#fff1f2' : 'white',
                        borderBottom: '1px solid #f0f7ff',
                        opacity: isSelf ? 0.62 : 1,
                      }}>
                      <input
                        type="checkbox"
                        checked={selected}
                        disabled={isSelf}
                        onChange={() => toggleDeactivate(user.id)}
                      />
                      <div className="w-9 h-9 rounded-2xl flex items-center justify-center font-black shrink-0" style={{ background: '#f0f7ff', color: '#6db8ff' }}>
                        {user.name?.slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-black truncate" style={{ color: '#1a1a1a' }}>
                          {user.name} {isSelf ? _('（当前操作人，不能停用）', ' (cannot deactivate yourself)') : ''}
                        </p>
                        <p className="text-xs font-semibold truncate" style={{ color: '#6b7280' }}>
                          {getRoleLabel(user, lang)} · {user.email}
                        </p>
                      </div>
                      <span className="text-[10px] font-black px-2.5 py-1 rounded-full" style={{ background: selected ? '#fee2e2' : '#dcfce7', color: selected ? '#dc2626' : '#16a34a' }}>
                        {selected ? _('将停用', 'Deactivate') : _('保留', 'Keep')}
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex gap-3 text-xs font-semibold text-amber-700">
              <AlertTriangle size={18} className="shrink-0 text-amber-500 mt-0.5" />
              <div className="space-y-1">
                <p className="font-black">{_('执行规则：', 'Rules:')}</p>
                <p>{_('1. 系统只会停用你勾选的账号，主席、执委、普通会员都可被勾选。', '1. Only checked accounts will be deactivated. Any role can be checked.')}</p>
                <p>{_('2. 没有被勾选的人会继续保留登录权限，并写入新学期名单。', '2. Unchecked users keep login access and are added to the new roster.')}</p>
                <p>{_('3. 当前操作人无法勾选自己，避免系统被锁死。', '3. You cannot deactivate yourself to prevent lockout.')}</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-2xl font-black text-sm text-white transition flex items-center justify-center gap-2 cursor-pointer"
              style={{ background: '#ef4444', boxShadow: '0 4px 16px rgba(239, 68, 68, 0.2)', opacity: submitting ? 0.72 : 1 }}>
              {submitting ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  {_('学期名单切换中...', 'Handing over...')}
                </>
              ) : (
                _('确认执行学期名单切换', 'Execute Term Handover')
              )}
            </button>
          </form>

          <div className="p-6 rounded-3xl bg-[#f0f7ff] border border-[#e0f1ff] space-y-4">
            <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5 pb-2 border-b-1.5 border-[#e0f1ff]">
              <Users size={16} style={{ color: '#95CBFF' }} />
              {_('切换摘要', 'Handover Summary')}
            </h3>
            <div className="grid grid-cols-1 gap-3">
              <SummaryCard icon={<UserCheck size={16} />} label={_('保留账号', 'Kept Accounts')} value={keptUsers.length} color="#16a34a" />
              <SummaryCard icon={<UserMinus size={16} />} label={_('停用账号', 'Deactivated')} value={deactivateIds.length} color="#dc2626" />
              <SummaryCard icon={<Calendar size={16} />} label={_('新学期', 'New Term')} value={sessionLabel} color="#6db8ff" />
            </div>
            <div className="space-y-3.5 text-xs leading-relaxed font-semibold text-gray-500">
              <p className="font-black text-gray-700">{_('为什么这样设计？', 'Why this design?')}</p>
              <p>{_('一年有上半年、下半年两次切换，所以名单周期以年份 + 半年为单位。', 'Academic year has two halves; rosters are organized by year + half.')}</p>
              <p>{_('账号由人本身持有，不再因为换届自动全部封锁；是否停用由老师或管理者人工决定。', 'Accounts are person-bound; they are not auto-blocked on handover. Deactivation is manual.')}</p>
              <p>{_('普通会员也会进入新学期名单，不再只处理执委。', 'Ordinary members are included in the new roster too.')}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-xl mx-auto p-8 rounded-3xl bg-white border border-[#e0f1ff] text-center space-y-6 animate-[fadeIn_0.4s_ease]"
          style={{ boxShadow: '0 8px 40px rgba(149,203,255,0.18)' }}>
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-500 border border-emerald-200">
            <CheckCircle size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="font-black text-lg text-gray-900">{_('学期名单已切换完成', 'Term Handover Complete')}</h2>
            <p className="text-sm font-semibold text-gray-500 leading-relaxed">
              {successMsg || _('系统已建立 ' + sessionLabel + ' 名单。', sessionLabel + ' roster created.')}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#f0f7ff] border border-[#e0f1ff] text-left space-y-2.5 text-xs font-semibold text-gray-600">
            <p className="font-black text-gray-700">{_('下一步：', 'Next steps:')}</p>
            <p>{_('1. 到「账号管理」检查保留和停用状态。', '1. Go to Members to review kept and deactivated accounts.')}</p>
            <p>{_('2. 如果新主席或新执委还没有账号，直接新增账号。', '2. Add new accounts if the new board members do not have one yet.')}</p>
            <p>{_('3. 如果有人误停用，可以在账号管理重新启用。', '3. Re-enable accounts from Members if someone was deactivated by mistake.')}</p>
          </div>

          <button
            onClick={() => {
              setHandoverStep('confirm')
              setDeactivateIds([])
              fetchHandoverData()
            }}
            className="px-6 py-2.5 rounded-2xl text-xs font-black text-white cursor-pointer transition"
            style={{ background: '#95CBFF' }}>
            {_('返回学期切换面板', 'Back to Handover Panel')}
          </button>
        </div>
      )}
    </div>
  )
}

function SummaryCard({ icon, label, value, color }) {
  return (
    <div className="p-4 rounded-2xl bg-white flex items-center gap-3" style={{ border: '1.5px solid #e0f1ff' }}>
      <span style={{ color }}>{icon}</span>
      <div>
        <p className="text-[10px] font-black text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-lg font-black" style={{ color: '#1a1a1a' }}>{value}</p>
      </div>
    </div>
  )
}
