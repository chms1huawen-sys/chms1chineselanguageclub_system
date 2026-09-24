export const isExecutiveAccount = user => user.is_active !== false && !['ordinary_member', 'event_member'].includes(user.role)
export function taskRosterOptions(teams, profile) {
  return teams.flatMap(team => team.type === 'board' ? [
    {...team, task_scope: 'members', rosterKey: `${team.id}:members`},
    ...(isExecutiveAccount(profile) ? [{...team, task_scope: 'executive', rosterKey: `${team.id}:executive`}] : []),
  ] : [{...team, rosterKey: team.id}])
}
export function taskRosterName(team, lang) {
  if (team.type !== 'board') return team.name
  const session = team.session || ''
  const match = /^(\d{4})-H([12])$/.exec(session)
  const term = match ? `${match[1]} ${lang === 'zh' ? (match[2] === '1' ? '上半年' : '下半年') : `H${match[2]}`}` : session
  return lang === 'zh' ? `一中华文学会 ${term} ${team.task_scope === 'members' ? '会员名单' : '执委层名单'}` : `CLC_sys ${term} ${team.task_scope === 'members' ? 'Membership' : 'Executive'} Roster`
}
