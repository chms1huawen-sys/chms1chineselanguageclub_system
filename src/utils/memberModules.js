let shell
let login
export const loadMemberShell = () => shell ||= import('../pages/MemberShell')
export const loadMemberLogin = () => login ||= import('../pages/Login')
export function preloadMemberEntry(hash) {
  const modules = [loadMemberShell()]
  if (hash.startsWith('#/login')) modules.push(loadMemberLogin())
  if (/^#\/(?:dashboard)?(?:\?|$)/.test(hash)) modules.push(import('../pages/Dashboard'))
  return Promise.all(modules)
}
