import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import {
  ShieldAlert,
  Loader,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Users,
  UserPlus
} from 'lucide-react'

const BOARD_MANAGER_ROLES = ['convener_teacher', 'advisor_teacher', 'chairperson', 'vice_chairperson', 'advisor']
const TASK_MANAGER_ROLES = [...BOARD_MANAGER_ROLES, 'secretary', 'vice_secretary', 'treasurer', 'vice_treasurer', 'general_affairs', 'vice_general_affairs', 'activity_lead', 'vice_activity_lead', 'media_lead', 'vice_media_lead']

const inputStyle = {
  background: '#f0f7ff',
  border: '1.5px solid #95CBFF',
  color: '#1a1a1a',
  borderRadius: 16,
  fontFamily: "'Nunito', sans-serif",
  fontWeight: 700,
  padding: '10px 14px'
}

export default function Handover({ currentUserProfile }) {
  const [currentBoard, setCurrentBoard] = useState(null)
  const [newSessionYear, setNewSessionYear] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [handoverStep, setHandoverStep] = useState('confirm') // 'confirm', 'success'

  const isPowerUser = BOARD_MANAGER_ROLES.includes(currentUserProfile?.role)

  useEffect(() => {
    fetchCurrentBoard()
  }, [])

  const fetchCurrentBoard = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('type', 'board')
        .eq('is_archived', false)
        .limit(1)

      if (error) throw error
      if (data && data.length > 0) {
        setCurrentBoard(data[0])
        // Suggest next session year
        const currentYear = parseInt(data[0].session.split('/')[0])
        if (!isNaN(currentYear)) {
          setNewSessionYear(`${currentYear + 1}/${currentYear + 2}`)
        }
      } else {
        setCurrentBoard(null)
        const year = new Date().getFullYear()
        setNewSessionYear(`${year}/${year + 1}`)
      }
    } catch (err) {
      setErrorMsg(err.message || '获取当前执委团信息失败 Failed to load board info.')
    } finally {
      setLoading(false)
    }
  }

  const handleTriggerHandover = async (e) => {
    e.preventDefault()
    if (!isPowerUser) return
    
    const sessionRegex = /^\d{4}\/\d{4}$/
    if (!sessionRegex.test(newSessionYear)) {
      setErrorMsg('年份格式不正确！必须为 YYYY/YYYY (例如 2026/2027)\nInvalid session format! Must be YYYY/YYYY (e.g. 2026/2027).')
      return
    }

    const confirmMsg = `⚠️ 警告 WARNING ⚠️\n你确定要启动执委换届流程吗？此操作为高风险动作，将执行以下操作：\n\n` +
      `1. 归档当前执委团 "${currentBoard?.name || '当届执委团'}" (标记为只读)。\n` +
      `2. 一键停用当前所有干部的登录账号 (召集老师、指导老师和当前操作人除外)。\n` +
      `3. 建立全新执委团队，开启 "${newSessionYear}" 年度届次。\n\n` +
      `请输入 "YES" 并确认开始。`
    
    if (window.prompt(confirmMsg) !== 'YES') {
      alert('已取消换届操作。 Handover cancelled.')
      return
    }

    setSubmitting(true)
    setErrorMsg('')
    setSuccessMsg('')
    try {
      // 1. Archive current active board
      if (currentBoard) {
        const { error: archiveErr } = await supabase
          .from('teams')
          .update({
            is_archived: true,
            end_date: new Date().toISOString().split('T')[0]
          })
          .eq('id', currentBoard.id)

        if (archiveErr) throw archiveErr
      }

      // 2. Create the new board session team
      const nextSessionNumber = currentBoard ? parseInt(currentBoard.name.replace(/\D/g, '')) + 1 : 1
      const newBoardName = `第 ${isNaN(nextSessionNumber) ? new Date().getFullYear() - 1970 : nextSessionNumber} 届执委团`
      
      const { data: newBoard, error: createErr } = await supabase
        .from('teams')
        .insert({
          name: newBoardName,
          type: 'board',
          session: newSessionYear,
          is_archived: false,
          start_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single()

      if (createErr) throw createErr

      // 3. Deactivate all non-advisor accounts to clear database log-in access for the new session,
      // EXCEPT the person currently executing this (so they are not locked out of this session immediately)
      const { error: deactivateErr } = await supabase
        .from('users')
        .update({ is_active: false })
        .not('role', 'in', '(convener_teacher,advisor_teacher,advisor)')
        .neq('id', currentUserProfile.id)

      if (deactivateErr) throw deactivateErr

      // Add the currently logged in executor (if not advisor) to the new board team so they can manage it initially
      const { error: memberErr } = await supabase
        .from('team_members')
        .insert({
          team_id: newBoard.id,
          user_id: currentUserProfile.id,
          position: ['convener_teacher', 'advisor_teacher', 'advisor'].includes(currentUserProfile.role) ? '指导老师' : '交接监誓人 / 前主席'
        })

      setSuccessMsg(`🎉 换届归档操作圆满完成！已正式开启新年度执委团：${newBoardName} (${newSessionYear})。`)
      setHandoverStep('success')
    } catch (err) {
      setErrorMsg(err.message || '换届失败 Failed to execute handover.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isPowerUser) {
    return (
      <div className="py-20 text-center space-y-3 p-8 rounded-3xl"
        style={{ background: 'white', border: '1.5px solid #e0f1ff', boxShadow: '0 4px 20px rgba(149,203,255,0.15)' }}>
        <ShieldAlert size={36} style={{ color: '#ef4444', margin: '0 auto' }} />
        <h2 className="text-lg font-black" style={{ color: '#1a1a1a' }}>越权访问 Access Denied</h2>
        <p className="text-sm max-w-md mx-auto font-semibold" style={{ color: '#6b7280' }}>
          只有召集老师、指导老师、主席或副主席拥有系统换届的管理权限。请联系管理员进行操作。
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 text-left" style={{ fontFamily: "'Nunito', sans-serif" }}>
      
      {/* Header */}
      <div className="pb-5" style={{ borderBottom: '1.5px solid #e0f1ff' }}>
        <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
          <ShieldAlert style={{ color: '#95CBFF' }} />
          执委换届管理
        </h1>
        <p className="text-sm mt-1 font-semibold" style={{ color: '#6b7280' }}>
          Annual Session Handover (Deactivate old accounts, archive files and launch new cabinet)
        </p>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
          <Loader size={32} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
          <p className="font-bold">加载换届状态中 Loading handover panel...</p>
        </div>
      ) : handoverStep === 'confirm' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          
          {/* Form Column */}
          <div className="lg:col-span-2 p-6 rounded-3xl bg-white border border-[#e0f1ff] space-y-6"
            style={{ boxShadow: '0 4px 20px rgba(149,203,255,0.06)' }}>
            
            <div className="space-y-2.5">
              <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5 pb-2 border-b-1.5 border-[#f0f7ff]">
                <Calendar size={16} style={{ color: '#95CBFF' }} />
                届次基本概览
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-semibold text-gray-600">
                <div className="p-3.5 rounded-2xl bg-[#f0f7ff] border border-[#e0f1ff] space-y-1">
                  <span className="text-[10px] font-black text-gray-400 block">当前活跃执委团队</span>
                  <span className="text-sm font-black text-gray-700">
                    {currentBoard ? `${currentBoard.name} (${currentBoard.session})` : '无活跃执委团'}
                  </span>
                </div>
                <div className="p-3.5 rounded-2xl bg-[#f0f7ff] border border-[#e0f1ff] space-y-1">
                  <span className="text-[10px] font-black text-gray-400 block">开始筹建日期</span>
                  <span className="text-sm font-black text-gray-700">
                    {currentBoard?.start_date || 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold"
                style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
                <AlertTriangle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
                <p>{errorMsg}</p>
              </div>
            )}

            <form onSubmit={handleTriggerHandover} className="space-y-5">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider mb-2 text-gray-500">
                  新一届执委团年份 New Session Year
                </label>
                <input
                  type="text"
                  required
                  value={newSessionYear}
                  onChange={(e) => setNewSessionYear(e.target.value)}
                  placeholder="例如: 2027/2028"
                  className="w-full text-sm font-black outline-none transition"
                  style={inputStyle}
                />
                <span className="text-[10px] font-bold text-gray-400 mt-1.5 block">
                  请输入新届的学年跨度。系统将以此创建全新的只读隔离数据库视图。
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex gap-3 text-xs font-semibold text-amber-700">
                <AlertTriangle size={18} className="shrink-0 text-amber-500 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-black">换届注意事项 (Handover Policy)：</p>
                  <p>1. 换届后，前一届所有成员的系统账号将被设为<strong>停用 (Deactivated)</strong>，以防止旧执委登录修改资产。</p>
                  <p>2. 作为<strong>召集老师 / 指导老师</strong>，您的登录账号是永恒激活的，不会受任何换届动作的影响。</p>
                  <p>3. 系统将自动把您（或换届操作人）绑定到新届执委成员名单中，您可以立即登录新届管理后台为新一届干部创建注册账号。</p>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-2xl font-black text-sm text-white transition flex items-center justify-center gap-2 cursor-pointer bg-red-400 hover:bg-red-500"
                style={{ boxShadow: '0 4px 16px rgba(239, 68, 68, 0.2)' }}
              >
                {submitting ? (
                  <>
                    <Loader size={16} className="animate-spin" />
                    换届数据封存归档中...
                  </>
                ) : (
                  '⚡ 确认执行换届交接 ⚡'
                )}
              </button>
            </form>

          </div>

          {/* Guidelines Column */}
          <div className="p-6 rounded-3xl bg-[#f0f7ff] border border-[#e0f1ff] space-y-4">
            <h3 className="font-black text-sm text-gray-900 flex items-center gap-1.5 pb-2 border-b-1.5 border-[#e0f1ff]">
              <Users size={16} style={{ color: '#95CBFF' }} />
              系统换届交接指南
            </h3>
            
            <div className="space-y-3.5 text-xs leading-relaxed font-semibold text-gray-500">
              <p>
                每年学校课外活动执委团大选换届后，必须由前任主席、召集老师或指导老师在系统中执行本操作。
              </p>
              <p className="font-black text-gray-700">
                第一步：清账与归档
              </p>
              <p>
                请确保当届的所有任务已经状态更新完成，已举办活动的临时筹委团也已悉数归档。
              </p>
              <p className="font-black text-gray-700">
                第二步：触发系统换届
              </p>
              <p>
                在此输入并确认下学年。系统将在 Supabase 数据库上打上物理届次印章（Session Stamp），以便在“历年名册”中提供归类检索。
              </p>
              <p className="font-black text-gray-700">
                第三步：新建团队成员
              </p>
              <p>
                换届完成后，召集老师或指导老师在“当届执委成员”中为新干事创建崭新的账号，向其发放临时密码。
              </p>
            </div>
          </div>

        </div>
      ) : (
        /* Success Screen */
        <div className="max-w-xl mx-auto p-8 rounded-3xl bg-white border border-[#e0f1ff] text-center space-y-6 animate-[fadeIn_0.4s_ease]"
          style={{ boxShadow: '0 8px 40px rgba(149,203,255,0.18)' }}>
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto text-emerald-500 border border-emerald-200">
            <CheckCircle size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="font-black text-lg text-gray-900">新届年华正式启航！</h2>
            <p className="text-sm font-semibold text-gray-500 leading-relaxed">
              系统已成功切入并生成 <strong>{newSessionYear}</strong> 届执委团队。旧干部账号已全数标记软停用，数据已安全封存。
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#f0f7ff] border border-[#e0f1ff] text-left space-y-2.5 text-xs font-semibold text-gray-600">
            <p className="font-black text-gray-700 flex items-center gap-1">
              <UserPlus size={14} style={{ color: '#95CBFF' }} />
              下一步操作指引：
            </p>
            <p>1. 您现在可以前往<strong>「执委管理 Members」</strong>页面。</p>
            <p>2. 点击“添加执委成员”，开始注册新一届主席、秘书、干部账号。</p>
            <p>3. 注册完成后，告知新干事利用其邮箱登录并引导其修改密码。</p>
          </div>

          <button
            onClick={() => {
              setHandoverStep('confirm');
              fetchCurrentBoard();
            }}
            className="px-6 py-2.5 rounded-2xl text-xs font-black text-white cursor-pointer transition"
            style={{ background: '#95CBFF' }}
          >
            返回换届主面板
          </button>
        </div>
      )}

    </div>
  )
}
