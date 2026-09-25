export const MEMBER_ROLE_ORDER = ['convener_teacher','advisor_teacher','chairperson','vice_chairperson','secretary','vice_secretary','treasurer','vice_treasurer','general_affairs','vice_general_affairs','activity_lead','vice_activity_lead','activity_member','media_lead','vice_media_lead','social_media_editor','ordinary_member','custom']
export function compareMembers(a,b) {
  const rank = role => { const i=MEMBER_ROLE_ORDER.indexOf(role); return i<0 ? MEMBER_ROLE_ORDER.length : i }
  return rank(a.role)-rank(b.role) || (a.is_active !== b.is_active ? (a.is_active ? -1 : 1) : 0) || (a.name||'').localeCompare(b.name||'','zh-Hans')
}
