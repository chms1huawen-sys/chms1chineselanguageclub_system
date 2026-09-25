import { useState } from 'react'
import { ArrowLeft, ArrowUpDown, Table2 } from 'lucide-react'
import UserAvatar from '../components/UserAvatar'
import { compareMembers } from '../utils/memberOrder'
import './TaskPerformancePage.css'

export default function TaskPerformancePage({ rows, teams, activeTeam, onTeamChange, teamName, lang, error, loading }) {
  const t = (zh, en) => lang === 'zh' ? zh : en
  const [sort, setSort] = useState({ key: 'role', descending: false })
  const [selected, setSelected] = useState(null)
  const columns = [['total',t('总任务','Tasks')], ['completionRate',t('完成率','Completion')], ['onTimeRate',t('准时率','On time')], ['activeOverdue',t('逾期未完成','Overdue open')], ['completedLate',t('已完成但迟交','Completed late')], ['needHelp',t('需协助','Needs help')], ['unknownTiming',t('时间资料缺失','Missing dates')]]
  const sorted = [...rows].sort((a,b) => {
    if (sort.key === 'role') return compareMembers(a.user,b.user)
    if (a[sort.key] == null) return b[sort.key] == null ? 0 : 1
    if (b[sort.key] == null) return -1
    return (sort.descending ? -1 : 1) * (a[sort.key]-b[sort.key]) || a.user.name.localeCompare(b.user.name)
  })
  const detail = rows.find(row => row.user.id === selected)
  const date = value => value ? new Date(value).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-GB') : '—'
  return <div className="performance-page">
    <a className="performance-back" href={`#/tasks${activeTeam ? `?roster=${encodeURIComponent(activeTeam.rosterKey)}` : ''}`}><ArrowLeft size={18}/>{t('返回任务看板','Back to tasks')}</a>
    <header><h1><Table2 size={24}/>{t('成员任务对比表','Member Task Comparison')}</h1>
      <select aria-label={t('任务名单','Task roster')} value={activeTeam?.rosterKey || ''} onChange={e => {setSelected(null); onTeamChange(teams.find(team => team.rosterKey === e.target.value))}}>{teams.map(team => <option key={team.rosterKey} value={team.rosterKey}>{teamName(team)}</option>)}</select>
    </header>
    <p className="performance-caption">{t('完成率 = 已完成 ÷ 总任务；准时率 = 按时完成 ÷ 有完整截止与完成时间的已完成任务。仅统计当前名单仍保留的任务；多人任务采用共同完成状态。', 'Completion = completed / all tasks. On time = on-time / completed tasks with both dates. Existing tasks in this roster only; shared tasks use their shared completion status.')}</p>
    {error && <p role="alert">{error}</p>}
    {loading ? <div className="performance-loading" role="status">{t('加载中…','Loading…')}</div> : !rows.length ? <p>{t('暂无已分配任务的成员','No members with assigned tasks')}</p> : <div className="performance-scroll" tabIndex={0} role="region" aria-label={t('成员任务对比','Member task comparison')}><table><thead><tr><th scope="col">{t('成员','Member')}</th>{columns.map(([key,name]) => <th scope="col" key={key} aria-sort={sort.key===key ? sort.descending?'descending':'ascending' : 'none'}><button onClick={() => setSort({key,descending:sort.key===key ? !sort.descending : true})}>{name}<ArrowUpDown size={13}/></button></th>)}</tr></thead><tbody>
      {sorted.map(row => <tr key={row.user.id}><th scope="row"><button className="performance-member" aria-expanded={selected===row.user.id} onClick={() => setSelected(selected===row.user.id ? null : row.user.id)}><UserAvatar user={row.user} size={28}/><span>{row.user.name}</span></button></th>{columns.map(([key]) => <td key={key} className={['activeOverdue','completedLate'].includes(key)&&row[key]>0 ? 'performance-late' : ''}>{key.endsWith('Rate') ? <><strong>{row[key] == null ? '—' : `${row[key]}%`}</strong>{row[key]!=null && <progress max="100" value={row[key]} aria-label={`${row.user.name} ${columns.find(c=>c[0]===key)[1]}`}/>}</> : row[key]}</td>)}</tr>)}
    </tbody></table></div>}
    {detail && <section className="performance-detail"><h2>{detail.user.name} · {t('任务明细','Task details')}</h2><p>{t('按时完成','On-time completions')}: {detail.onTime} / {detail.timedCompleted} · {t('已完成','Completed')}: {detail.completed} / {detail.total}</p><ul>{detail.assignedTasks.map(task => <li key={task.id}><strong>{task.title}</strong><span>{t('截止','Due')}: {date(task.due_date)}</span><span>{t('完成','Completed')}: {date(task.completed_at)}</span></li>)}</ul></section>}
  </div>
}
