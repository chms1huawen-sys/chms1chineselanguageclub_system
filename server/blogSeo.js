export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const siteOrigin = env => new URL(env.BLOG_SITE_URL || 'https://chms1chineselanguageclubsystem.vercel.app').origin
const safeHref = url => typeof url === 'string' && /^https?:\/\//.test(url) ? url : ''

export function renderBlogHtml(template, site, posts, media, slug, origin, view = 'home', links = []) {
  const e = escapeHtml
  const post = slug ? posts[0] : null
  const names = { home: '首页', literature: '文学角落', activities: '活动记录', bookroom: '书坊', news: '学会资讯', about: '关于我们' }
  const title = slug ? (post ? `${post.title} | ${site.title}` : `文章不存在 | ${site.title}`) : `${names[view]} | ${site.title}`
  const description = (post?.summary || site.intro || '').slice(0, 300)
  const canonical = origin + (slug ? `/blog/${encodeURIComponent(slug)}` : view === 'home' ? '/' : `/${view}`)
  const photoUrl = path => safeHref(path) || (path?.startsWith('/') && !path.startsWith('//') ? origin + path : `${origin}/api/blog-media?path=${encodeURIComponent(path || '')}`)
  const slide = site.content?.hero_slides?.find(item => item.enabled !== false && item.path)
  const cover = post?.cover_path || slide?.path || site.hero_path
  const image = cover ? `<meta property="og:image" content="${e(photoUrl(cover))}">` : ''
  const structured = post
    ? { '@context': 'https://schema.org', '@type': post.content_type === 'publication' ? 'Book' : 'BlogPosting', ...(post.content_type === 'publication' ? { name: post.title, isbn: post.book_details?.isbn || undefined } : {}), headline: post.title, description, datePublished: post.published_at, dateModified: post.updated_at, mainEntityOfPage: canonical, image: cover ? photoUrl(cover) : undefined, author: { '@type': post.book_details?.author ? 'Person' : 'Organization', name: post.book_details?.author || site.title } }
    : { '@context': 'https://schema.org', '@type': 'Organization', name: site.title, url: origin, description }
  const metadata = `<title>${e(title)}</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${e(canonical)}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(canonical)}"><meta property="og:type" content="${post ? 'article' : 'website'}">${image}<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>`
  const nav = `<header class="blog-nav"><a class="blog-brand" href="/"><img src="/logo-192.png" alt=""><span>${e(site.title)}<small>${e(site.subtitle)}</small></span></a><nav>${Object.entries(names).map(([key, name]) => `<a href="${key === 'home' ? '/' : '/' + key}">${name}</a>`).join('')}<a href="/#/login">会员登入</a></nav></header>`
  const paragraphs = text => String(text || '').split(/\n\s*\n/).map(p => `<p>${e(p)}</p>`).join('')
  const picture = (path, alt, css = '') => `<img class="${css}" src="${e(photoUrl(path))}" alt="${e(alt)}" loading="lazy">`
  const socials = values => (Array.isArray(values) ? values : []).filter(link => link.enabled !== false && safeHref(link.url)).map(link => `<a href="${e(link.url)}" target="_blank" rel="noopener noreferrer">${e(link.label)}</a>`).join(' ')
  const book = post?.content_type === 'publication' ? `<section><h2>书籍资料</h2><dl>${[['author','作者'],['price','价格'],['published_on','出版日期'],['pages','页数'],['isbn','ISBN']].filter(([key]) => post.book_details?.[key]).map(([key,label]) => `<dt>${label}</dt><dd>${e(post.book_details[key])}</dd>`).join('')}</dl>${paragraphs(post.book_details?.author_bio)}<p>如欲购买，请通过以下社交媒体联系我们。</p>${socials(post.book_details?.purchase_links)}</section>` : ''
  const about = `<section class="blog-about"><h2>${e(site.content?.about_title || '关于华文学会')}</h2><div>${site.content?.about_image ? picture(site.content.about_image, site.title) : ''}${paragraphs(site.about)}</div></section>`
  let body
  if (post) {
    body = `<main class="blog-main"><article class="blog-article"><h1>${e(post.title)}</h1><p class="blog-summary">${e(post.summary)}</p><p>${e(post.event_date)} ${e(post.location)} ${e(post.credit)}</p>${post.cover_path ? picture(post.cover_path, post.title, 'blog-article-cover') : ''}<div class="blog-prose">${paragraphs(post.body)}${book}${post.behind_scenes ? `<h2>幕后花絮</h2>${paragraphs(post.behind_scenes)}` : ''}</div><div class="blog-gallery">${media.map(m => `<figure>${picture(m.path, m.caption || post.title)}<figcaption>${e(m.caption)}</figcaption></figure>`).join('')}</div>${links.length ? `<section><h2>相关链接</h2>${links.filter(l => safeHref(l.url)).map(l => `<p><a href="${e(l.url)}" target="_blank" rel="noopener noreferrer">${e(l.label)}</a></p>`).join('')}</section>` : ''}</article><a href="/activities">所有文章</a></main>`
  } else if (slug) {
    body = '<main class="blog-main"><h1>文章不存在或尚未公开</h1><a href="/">返回首页</a></main>'
  } else if (view === 'about') {
    body = `<main class="blog-main"><h1>关于我们</h1>${about}</main>`
  } else {
    const hero = view === 'home' ? `<section class="blog-hero">${picture(cover, site.title)}<div class="blog-hero-copy"><p>${e(site.subtitle)}</p><h1>${e(site.title)}</h1><p>${e(slide?.title || site.intro)}</p></div></section>` : ''
    const level = view === 'home' ? '2' : '1'
    body = `${hero}<main class="blog-main"><h${level}>${e(view === 'home' ? (site.content?.latest_title || '最新活动') : names[view])}</h${level}><div class="blog-post-grid">${posts.map(p => `<a class="blog-post" href="/blog/${e(p.slug)}">${p.cover_path ? picture(p.cover_path, p.title) : ''}<div><small>${e(p.content_year || '')}</small><h3>${e(p.title)}</h3><p>${e(p.summary)}</p></div></a>`).join('')}</div>${view === 'home' ? about : ''}</main>`
  }
  return template.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta name="description"[^>]*>/, '')
    .replace('</head>', () => metadata + '</head>')
    .replace('<div id="root"></div>', () => `<div id="root"><div class="club-blog">${nav}${body}<footer class="blog-footer">${e(site.contact)} ${socials(site.content?.social_links)}</footer></div></div>`)
}
