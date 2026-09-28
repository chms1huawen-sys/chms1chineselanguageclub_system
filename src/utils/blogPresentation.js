export function publicationYear(post) {
  if (!post.published_at) return ''
  const date = new Date(post.published_at)
  if (!Number.isFinite(date.getTime())) return ''
  return new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Asia/Kuala_Lumpur' }).format(date)
}

export const submissionNote = en => en
  ? 'Submissions: visual notes are text-only; life essays may include photos. Suggested length: 10–450 characters, reviewed by our editors.'
  : '投稿提示：视觉杂记不配图；生活随笔可配图。两类短篇建议 10–450 字，由编辑人工审核。'

export function heroSlides(site) {
  const content = site.content || {}
  const introduction = {
    path: site.hero_path || '/login-group-2026.jpeg',
    title: content.hero_title || site.title,
    subtitle: content.hero_subtitle || site.intro,
    link: content.hero_link || '/activities',
    cta: content.hero_cta,
    fit: content.hero_fit || 'auto',
    crop: content.hero_path_crop,
    mobile_crop: content.hero_mobile_crop,
    position: content.hero_position || 'left',
    tone: content.hero_tone || 'light',
  }
  const custom = (Array.isArray(content.hero_slides) ? content.hero_slides : [])
    .filter(slide => slide && slide.enabled !== false && slide.path)
    .map(slide => ({ ...slide, title: slide.title || introduction.title, subtitle: slide.subtitle || introduction.subtitle, cta: slide.cta || content.hero_cta }))
  return content.hero_default_enabled === false && custom.length ? custom : [introduction, ...custom]
}

// Limit both cropping and enlargement; portrait and small originals stay complete.
export function heroImageLayout(width, height, boxWidth, boxHeight, fit = 'auto') {
  if (![width, height, boxWidth, boxHeight].every(value => Number.isFinite(value) && value > 0)) return null
  const contain = Math.min(boxWidth / width, boxHeight / height)
  const cover = Math.max(boxWidth / width, boxHeight / height)
  if (fit === 'cover') return { width: width * cover, height: height * cover, mode: 'cover', scale: cover }
  const fills = fit !== 'contain' && cover <= 1.1 && cover / contain <= 1.35
  const scale = Math.min(fills ? cover : contain, 1.1)
  return { width: width * scale, height: height * scale, mode: fills ? 'cover' : 'contain', scale }
}

export function clubStatistics(content, count, en = false, currentYear = new Date().getFullYear()) {
  const start = Number(content.stats_start_year)
  const end = Number(content.stats_end_year || currentYear)
  const valid = Number.isInteger(start) && start >= 1 && Number.isInteger(end) && end >= start
  return [
    { key: 'posts', label: content.stats_posts_label || (en ? 'Public stories' : '公开文章'), value: count },
    { key: 'members', label: content.stats_members_label || (en ? 'Current members' : '现今团员人数'), value: Math.max(0, Number(content.stats_members) || 0) },
    { key: 'years', label: content.stats_years_label || (en ? 'Years recorded' : '记录年份'), value: valid ? end - start : '—', range: valid ? `${start}–${end}` : '' },
  ]
}

export function matchesPublicSearch(post, query, tags = []) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const details = post.book_details || {}
  const haystack = [post.title, post.summary, post.body, post.location, publicationYear(post), post.author, post.credit,
    details.author, details.author_bio, details.isbn, ...(post.tags || []), ...tags].filter(Boolean).join(' ').toLocaleLowerCase()
  return words.every(word => haystack.includes(word))
}
