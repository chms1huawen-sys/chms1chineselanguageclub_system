import React, { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import {
  Users,
  Loader,
  AlertCircle,
  ShieldCheck,
  ChevronDown
} from 'lucide-react'

const selectStyle = {
  background: '#f0f7ff',
  border: '1.5px solid #95CBFF',
  color: '#1a1a1a',
  borderRadius: 16,
  fontFamily: "'Nunito', sans-serif",
  fontWeight: 700,
  padding: '10px 14px',
  cursor: 'pointer'
}

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
  'ordinary_member',
  'custom',
]

const getRoleRank = (role) => {
  const index = ROLE_ORDER.indexOf(role)
  return index === -1 ? ROLE_ORDER.length : index
}

const sortMembersByRole = (members = []) => [...members].sort((a, b) => {
  const userA = Array.isArray(a.users) ? a.users[0] : a.users
  const userB = Array.isArray(b.users) ? b.users[0] : b.users
  const roleDiff = getRoleRank(userA?.role) - getRoleRank(userB?.role)
  if (roleDiff !== 0) return roleDiff
  return (userA?.name || '').localeCompare(userB?.name || '', 'zh-Hans')
})

export default function HistoricalMembers({ lang }) {
  const _ = (zh, en) => lang === 'zh' ? zh : en
  const [sessions, setSessions] = useState([])
  const [selectedSessionId, setSelectedSessionId] = useState('')
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [membersLoading, setMembersLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    fetchArchivedSessions()
  }, [])

  useEffect(() => {
    if (selectedSessionId) {
      fetchSessionMembers(selectedSessionId)
    } else {
      setMembers([])
    }
  }, [selectedSessionId])

  const fetchArchivedSessions = async () => {
    setLoading(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('type', 'board')
        .eq('is_archived', true)
        .order('session', { ascending: false })

      if (error) throw error
      setSessions(data || [])

      if (data && data.length > 0) {
        setSelectedSessionId(data[0].id)
      }
    } catch (err) {
      setErrorMsg(err.message || _('获取历年名单失败', 'Failed to load historical rosters.'))
    } finally {
      setLoading(false)
    }
  }

  const fetchSessionMembers = async (teamId) => {
    setMembersLoading(true)
    setErrorMsg('')
    try {
      const { data, error } = await supabase
        .from('team_members')
        .select(`
          position,
          joined_at,
          user_id,
          users (
            name,
            email,
            role,
            is_active
          )
        `)
        .eq('team_id', teamId)

      if (error) throw error
      setMembers(sortMembersByRole(data || []))
    } catch (err) {
      setErrorMsg(err.message || _('获取该学期成员失败', 'Failed to load session members.'))
    } finally {
      setMembersLoading(false)
    }
  }

  const getSelectedSessionName = () => {
    const session = sessions.find(item => item.id === selectedSessionId)
    return session ? `${session.name} (${session.session})` : ''
  }

  return (
    <div className="space-y-6 text-left animate-[fadeIn_0.3s_ease]" style={{ fontFamily: "'Nunito', sans-serif" }}>
      <div className="pb-5 border-b-1.5 border-[#e0f1ff]">
        <h1 className="text-2xl font-black flex items-center gap-2" style={{ color: '#1a1a1a' }}>
          <Users style={{ color: '#95CBFF' }} />
          {_('历年名单', 'Historical Rosters')}
        </h1>
        <p className="text-sm mt-1 font-semibold" style={{ color: '#6b7280' }}>
          {_('查阅历年归档执委层名单，按学期切换后自动归入档案。', 'Browse archived executive level rosters from past terms.')}
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2.5 p-4 rounded-2xl text-sm font-semibold animate-[fadeIn_0.2s_ease]"
          style={{ background: '#fee2e2', border: '1.5px solid #fca5a5', color: '#dc2626' }}>
          <AlertCircle size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: 2 }} />
          <p>{errorMsg}</p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-gray-500">
          <Loader size={32} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
          <p className="font-bold">{_('加载历年名单中...', 'Loading rosters...')}</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-20 rounded-3xl font-semibold"
          style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff', color: '#6b7280' }}>
          {_('目前没有已归档的历史名单。学期切换归档后，旧学期成员记录会在这里显示。', 'No archived rosters yet. Term handover will archive past rosters here.')}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-4 rounded-2xl"
            style={{ background: '#f0f7ff', border: '1.5px solid #e0f1ff' }}>
            <span className="text-xs font-black text-gray-500 uppercase tracking-wider shrink-0">{_('选择学期名单:', 'Select Session:')}</span>
            
            <div className="relative w-full sm:w-72">
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full pr-10 pl-4 py-2.5 text-sm font-black rounded-2xl cursor-pointer transition outline-none appearance-none"
                style={{ ...selectStyle, background: 'white' }}
              >
                {sessions.map(session => (
                  <option key={session.id} value={session.id}>
                    {session.name} ({session.session})
                  </option>
                ))}
              </select>
              <div className="absolute right-3.5 top-3.5 pointer-events-none text-gray-400">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>

          {membersLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <Loader size={24} style={{ color: '#95CBFF', animation: 'spin 1s linear infinite' }} />
              <p className="font-bold">{_('拉取该学期成员中...', 'Loading members...')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2 pb-2" style={{ borderBottom: '1.5px solid #f0f7ff' }}>
                <ShieldCheck size={16} style={{ color: '#4ade80' }} />
                <h3 className="font-black text-sm text-gray-800">
                  {getSelectedSessionName()} · {_('成员名单', 'Roster')}
                </h3>
              </div>

              {members.length === 0 ? (
                <div className="text-center py-12 text-xs font-bold text-gray-400 border border-[#e0f1ff] bg-[#fdfdfd] rounded-2xl">
                  {_('该学期尚未绑定成员记录', 'No member records for this session.')}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl bg-white border border-[#e0f1ff]" style={{ boxShadow: '0 4px 16px rgba(149,203,255,0.04)' }}>
                  <div className="hidden md:grid grid-cols-[64px_1.1fr_1.6fr_1fr] gap-4 px-4 py-3 text-[10px] font-black uppercase tracking-wider" style={{ background: '#95CBFF', color: 'white' }}>
                    <span>{_('序', 'No.')}</span>
                    <span>{_('姓名', 'Name')}</span>
                    <span>{_('邮箱', 'Email')}</span>
                    <span>{_('职位', 'Position')}</span>
                  </div>
                  <div className="divide-y divide-[#f0f7ff]">
                  {members.map((member, idx) => {
                    const rawUser = Array.isArray(member.users) ? member.users[0] : member.users
                    const user = rawUser || { name: '已注销成员', email: 'N/A', role: '' }
                    return (
                      <div
                        key={member.user_id || idx}
                        className="grid grid-cols-1 md:grid-cols-[64px_1.1fr_1.6fr_1fr] md:items-center gap-2 md:gap-4 px-4 py-3 text-sm"
                      >
                        <div className="flex items-center gap-3 md:block">
                          <span className="w-8 h-8 rounded-xl inline-flex items-center justify-center font-black text-xs md:hidden"
                            style={{ background: '#f0f7ff', color: '#6db8ff', border: '1px solid #e0f1ff' }}>
                            {user.name.slice(0, 2)}
                          </span>
                          <span className="text-xs font-black text-gray-400">#{idx + 1}</span>
                        </div>
                        <p className="font-black text-gray-800 truncate">{user.name}</p>
                        <p className="text-xs font-mono font-semibold text-gray-400 truncate">{user.email}</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="w-fit text-[10px] font-black px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                            {member.position}
                          </span>
                          {user.is_active === false && (
                            <span className="w-fit text-[10px] font-black px-2.5 py-1 rounded-full bg-gray-100 text-gray-500 border border-gray-200">
                              {_('已停用', 'Inactive')}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
