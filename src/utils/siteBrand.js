export const SITE_NAME = '古晋一中华文学会'
export const SITE_SHORT_NAME = '一中华文学会'
export const SCHOOL_NAME = '古晋中华第一中学'
export const MEMBER_NAME = `${SITE_NAME}会员系统`
export const pageTitle = heading => `${heading}｜${SITE_NAME}`
export function brandedSettings(site) {
  const legacyNames = ['华文学会', '一中华文学会', SITE_NAME]
  return { ...site, title: legacyNames.includes(site.title) ? SITE_SHORT_NAME : site.title, subtitle: ['古晋中华第一中学', '古晋中华第一中学·一中华文学会', '古晋中华第一中学 · 一中华文学会'].includes(site.subtitle) ? SCHOOL_NAME : site.subtitle }
}
