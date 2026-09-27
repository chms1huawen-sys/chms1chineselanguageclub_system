import { cropStyles } from '../src/utils/photoCrop.js'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { richBody, photoWidth } from '../src/utils/blogRichText.js'
import { heroSlides, submissionNote } from '../src/utils/blogPresentation.js'
import { safePublicLink } from '../src/utils/blogContent.js'
import { publicBlogSettings } from '../src/utils/blogBootstrap.js'
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
export const siteOrigin = env => new URL(env.BLOG_SITE_URL || 'https://chms1chineselanguageclubsystem.vercel.app').origin
const safeHref = url => typeof url === 'string' && /^https?:\/\//.test(url) ? url : ''

export function renderBlogHtml(template, site, posts, media, slug, origin, view = 'home', links = [], search = '', browseAll = false) {
  const searching = !!search || browseAll
  const e = escapeHtml
  const bootstrap = '<script id="blog-site-settings" type="application/json">' + JSON.stringify(publicBlogSettings(site)).replace(/</g, '\\u003c') + '</script>'
  const post = slug ? posts[0] : null
  const names = { home: '首页', literature: '文学角落', activities: '活动记录', bookroom: '书坊', news: '学会资讯', about: '关于我们' }
  const title = searching ? `${search ? `搜索结果: ${search}` : '全部内容'} | ${site.title}` : slug ? (post ? `${post.title} | ${site.title}` : `文章不存在 | ${site.title}`) : `${names[view]} | ${site.title}`
  const description = (post?.summary || site.intro || '').slice(0, 300)
  const canonical = origin + (slug ? `/blog/${encodeURIComponent(slug)}` : view === 'home' ? '/' : `/${view}`)
  const photoUrl = path => safeHref(path) || (path?.startsWith('/') && !path.startsWith('//') ? origin + path : `${origin}/api/blog-media?path=${encodeURIComponent(path || '')}`)
  const slide = heroSlides(site)[0]
  const cover = post?.cover_path || slide?.path || site.hero_path
  const image = cover ? `<meta property="og:image" content="${e(photoUrl(cover))}">` : ''
  const structured = post
    ? { '@context': 'https://schema.org', '@type': post.content_type === 'publication' ? 'Book' : 'BlogPosting', ...(post.content_type === 'publication' ? { name: post.title, isbn: post.book_details?.isbn || undefined } : {}), headline: post.title, description, datePublished: post.published_at, dateModified: post.updated_at, mainEntityOfPage: canonical, image: cover ? photoUrl(cover) : undefined, author: { '@type': (post.author || post.book_details?.author) ? 'Person' : 'Organization', name: post.author || post.book_details?.author || site.title } }
    : { '@context': 'https://schema.org', '@type': 'Organization', name: site.title, url: origin, description }
  const metadata = `${searching ? '<meta name="robots" content="noindex,follow">' : ''}<title>${e(title)}</title><meta name="description" content="${e(description)}"><link rel="canonical" href="${e(canonical)}"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(canonical)}"><meta property="og:type" content="${post ? 'article' : 'website'}">${image}<script type="application/ld+json">${JSON.stringify(structured).replace(/</g, '\\u003c')}</script>`
  const nav = `<header class="blog-nav"><a class="blog-brand" href="/"><img src="/logo-192.png" alt=""><span>${e(site.title)}<small>${e(site.subtitle)}</small></span></a><nav>${Object.entries(names).map(([key, name]) => `<a href="${key === 'home' ? '/' : '/' + key}">${name}</a>`).join('')}<a href="/#/login">会员登入</a></nav><form class="blog-global-search" role="search" action="/" method="get"><input name="q" type="search" maxlength="200" required aria-label="搜索公开文章和书籍" value="${e(search)}" placeholder="搜索文章、书籍"><button type="submit">搜索</button></form></header>`
  const paragraphs = text => String(text || '').split(/\n\s*\n/).map(p => `<p>${e(p)}</p>`).join('')
  const picture = (path, alt, css = '') => renderToStaticMarkup(photoElement(path, alt, css))
  function photoElement(path, alt, css = '') {
    const styles = cropStyles(media.find(photo => photo.path === path)?.crop)
    const img = createElement('img', { src: photoUrl(path), alt, loading: 'lazy', className: styles ? undefined : css, style: styles?.image })
    return styles ? createElement('span', { className: css, style: styles.frame }, img) : img
  }
  const socials = values => (Array.isArray(values) ? values : []).filter(link => link.enabled !== false && safeHref(link.url)).map(link => `<a href="${e(link.url)}" target="_blank" rel="noopener noreferrer">${e(link.label)}</a>`).join(' ')
  const book = post?.content_type === 'publication' ? `<section><h2>书籍资料</h2><dl>${[['author','作者'],['price','价格'],['published_on','出版日期'],['pages','页数'],['isbn','ISBN']].filter(([key]) => post.book_details?.[key]).map(([key,label]) => `<dt>${label}</dt><dd>${e(post.book_details[key])}</dd>`).join('')}</dl>${paragraphs(post.book_details?.author_bio)}<p>如欲购买，请通过以下社交媒体联系我们。</p>${socials(post.book_details?.purchase_links)}</section>` : ''
  const about = `<section class="blog-about"><h2>${e(site.content?.about_title || '关于华文学会')}</h2><div>${site.content?.about_image ? picture(site.content.about_image, site.title) : ''}${paragraphs(view === 'about' ? site.about : (site.content?.about_notes ?? site.about))}</div></section>`
  let body
  if (post) {
    body = `<main class="blog-main"><article class="blog-article"><h1>${e(post.title)}</h1>${post.summary ? `<div class="blog-article-summary"><span>内容摘要</span><p>${e(post.summary)}</p></div>` : ''}${post.author ? `<p class="blog-article-author"><span>作者</span><strong>${e(post.author)}</strong></p>` : ''}<p>${e(post.event_date)} ${e(post.location)} ${e(post.credit)}</p>${post.cover_path ? `<figure class="blog-cover-figure" style="width:${photoWidth(media.find(photo => photo.path === post.cover_path)?.width_percent)}%">${picture(post.cover_path, post.title, 'blog-article-cover')}<figcaption>${e(media.find(photo => photo.path === post.cover_path)?.caption || post.credit || post.title)}</figcaption></figure>` : ''}<div class="blog-prose">${renderToStaticMarkup(richBody(post.body_document, post.body, ({ path, alt }) => photoElement(path, alt), media))}${book}${post.behind_scenes ? `<h2>幕后花絮</h2>${paragraphs(post.behind_scenes)}` : ''}</div><div class="blog-gallery blog-photo-collage count-${Math.min(5, media.filter(m => m.path !== post.cover_path).length)}">${media.filter(m => m.path !== post.cover_path).slice(0,5).map((m, index) => `<figure><div class="blog-collage-preview">${picture(m.path, m.caption || post.title)}${index === 4 && media.filter(photo => photo.path !== post.cover_path).length > 5 ? `<span class="blog-photo-more">+${media.filter(photo => photo.path !== post.cover_path).length - 5}</span>` : ''} </div><figcaption>${e(m.caption || post.title)}</figcaption></figure>`).join('')}</div>${links.length ? `<section><h2>相关链接</h2>${links.filter(l => safeHref(l.url)).map(l => `<p><a href="${e(l.url)}" target="_blank" rel="noopener noreferrer">${e(l.label)}</a></p>`).join('')}</section>` : ''}</article><a href="/activities">所有文章</a></main>`
  } else if (slug) {
    body = '<main class="blog-main"><h1>文章不存在或尚未公开</h1><a href="/">返回首页</a></main>'
  } else if (view === 'about') {
    body = `<main class="blog-main"><h1>关于我们</h1>${about}</main>`
  } else {
    const hero = view === 'home' && !searching ? `<section class="blog-showcase"><div class="blog-showcase-slides"><div class="blog-showcase-slide is-active" data-position="${slide.position === 'right' ? 'right' : 'left'}" data-tone="${slide.tone === 'dark' ? 'dark' : 'light'}"><a class="blog-showcase-photo" href="${e(safePublicLink(slide.link) || '/activities')}">${picture(slide.path, slide.title)}</a><div class="blog-showcase-caption"><div><p>${e(site.subtitle)}</p><h1>${e(slide.title)}</h1><p>${e(slide.subtitle)}</p></div><a class="blog-showcase-cta" href="${e(safePublicLink(slide.link) || '/activities')}">${e(slide.cta || '探索我们的故事')}</a></div></div></div></section>` : ''
    const level = view === 'home' ? '2' : '1'
    body = `${hero}<main class="blog-main"><h${level}>${e(searching ? (search ? `搜索结果: ${search}` : '全部内容') : view === 'home' ? (site.content?.latest_title || '最新活动') : names[view])}</h${level}>${view === 'literature' ? `<p class="blog-submission-note">${e(site.content?.submission_note ?? submissionNote(false))}</p>` : ''}<div class="blog-post-grid">${posts.map(p => `<a class="blog-post" data-cover="${!!p.cover_path}" data-kind="${e(p.content_type)}" href="/blog/${e(p.slug)}">${p.cover_path ? picture(p.cover_path, p.title) : ''}<div class="blog-post-copy"><h3>${e(p.title)}</h3><p class="blog-post-excerpt">${e(p.summary)}</p><div class="blog-post-meta"><time>${e((p.published_at || '').slice(0,10) || p.content_year || '')}</time><span>阅读全文</span></div></div></a>`).join('')}</div>${view === 'home' && !searching ? about : ''}</main>`
  }
  return template.replace(/<title>[\s\S]*?<\/title>/, '').replace(/<meta name="description"[^>]*>/, '')
    .replace('</head>', () => metadata + bootstrap + '</head>')
    .replace('<div id="root"></div>', () => `<div id="root"><div class="club-blog blog-public${view === 'home' && !slug && !searching ? ' blog-home' : ''}">${nav}${body}<footer class="blog-footer">${e(site.contact)} ${socials(site.content?.social_links)}</footer></div></div>`)
}
