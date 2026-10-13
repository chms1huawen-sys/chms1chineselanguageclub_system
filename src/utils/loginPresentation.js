import { cropStyles } from './photoCrop.js'

export const LOGIN_DEFAULTS = {
  title: '古晋一中华文学会会员系统', title_en: 'CLC_sys',
  subtitle: '华文学会内部管理平台', subtitle_en: 'Internal Management & Task Reminder Platform',
  footer: '古晋一中华文学会会员系统', footer_en: 'CLC_sys',
  slides: [
    { path: '/login-group-2026.jpeg', title: '一中华文学会 · 2026', title_en: 'CHMS1 Chinese Language Club · 2026', eyebrow: '古晋一中华文学会会员系统', eyebrow_en: 'CLC_sys' },
    { path: '/login-event-2026.jpeg', title: '第四届“传承”全校性华语诗歌朗诵比赛', title_en: 'The 4th “Inheritance” School-wide Chinese Poetry Recitation Competition', eyebrow: '古晋一中华文学会会员系统', eyebrow_en: 'CLC_sys' },
  ],
}
export function loginImagePath(value) {
  if (typeof value !== 'string') return ''
  if (/^\/(?!\/)[^\\\s]*$/.test(value) && !value.includes('..')) return value
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : '' } catch { return '' }
}
export function loginPresentation(value) {
  const source = value && typeof value === 'object' ? value : {}
  const text = (key, defaults) => typeof source[key] === 'string' ? source[key].slice(0, 300) : defaults[key]
  const result = Object.fromEntries(['title', 'title_en', 'subtitle', 'subtitle_en', 'footer', 'footer_en'].map(key => [key, text(key, LOGIN_DEFAULTS)]))
  result.slides = LOGIN_DEFAULTS.slides.map((defaults, index) => {
    const slide = Array.isArray(source.slides) ? source.slides[index] : null
    return { ...defaults, ...Object.fromEntries(['title', 'title_en', 'eyebrow', 'eyebrow_en'].map(key => [key, typeof slide?.[key] === 'string' ? slide[key].slice(0, 300) : defaults[key]])), path: loginImagePath(slide?.path) || defaults.path, crop: cropStyles(slide?.crop) ? slide.crop : null }
  })
  return result
}

export function loginPhotoLayout(crop, box) {
  if (!cropStyles(crop) || !box?.width || !box?.height) return null
  const width = crop.naturalWidth * crop.width / 100
  const height = crop.naturalHeight * crop.height / 100
  const scale = Math.max(box.width / width, box.height / height)
  return { position: 'absolute', maxWidth: 'none', width: crop.naturalWidth * scale, height: crop.naturalHeight * scale, left: (box.width - width * scale) / 2 - crop.naturalWidth * crop.x / 100 * scale, top: (box.height - height * scale) / 2 - crop.naturalHeight * crop.y / 100 * scale }
}
