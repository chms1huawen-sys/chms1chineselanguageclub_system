export const SITE_NAME = '古晋一中华文学会'
export const SITE_SHORT_NAME = '一中华文学会'
export const HOME_SEARCH_DESCRIPTION = '古晋一中华文学会成立于1975年，致力于弘扬中华文化、传承华族精神。浏览文学作品、活动记录、学会资讯与书坊出版物，认识我们的作品与日常活动。'
export const SCHOOL_NAME = '古晋中华第一中学'
export const MEMBER_NAME = `${SITE_NAME}会员系统`
export const siteName = site => site?.content?.site_name?.trim() || (site?.title && !['华文学会', SITE_SHORT_NAME, SITE_NAME].includes(site.title) ? site.title : SITE_NAME)
export const pageTitle = (heading, site) => `${heading}｜${siteName(site)}`
export function brandedSettings(site) {
  const legacyNames = ['华文学会', '一中华文学会', SITE_NAME]
  return { ...site, title: legacyNames.includes(site.title) ? SITE_SHORT_NAME : site.title, content: { ...site.content, site_name: siteName(site) }, subtitle: ['古晋中华第一中学', '古晋中华第一中学·一中华文学会', '古晋中华第一中学 · 一中华文学会'].includes(site.subtitle) ? SCHOOL_NAME : site.subtitle }
}
