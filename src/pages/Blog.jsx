import { publicHomeUrl } from '../utils/pwaLaunch'
import { useEffect, useRef, useState } from 'react'
import { ArrowRight, ArrowLeft, Download, Globe, Search, X, ChevronLeft, ChevronRight, LogIn, Settings, BookOpen, Camera, Pause, Play, ExternalLink } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { blogPath, blogLogin, canManageBlog, defaultBlogSettings } from '../utils/blog'
import './Blog.css'
import BlogNavigation, { SocialLinks } from '../components/BlogNavigation'
import { sections, sectionOf, publicCategories, postTags, safeColor, safePublicLink } from '../utils/blogContent'

const localPath = value => typeof value === 'string' && /^\/(?!\/)[^\\\s]*$/.test(value) && !value.includes('..')
const webLink = value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '' } catch { return '' }
}
const imageSource = path => {
  if (localPath(path)) return path
  const url = webLink(path)
  return url && new URL(url).protocol === 'https:' ? url : ''
}
const storagePath = path => typeof path === 'string' && !!path && !/[:\\?#\s]/.test(path) && !path.startsWith('/') && !path.split('/').some(part => !part || part === '..' || part === '.')
const text = value => typeof value === 'string' ? value : ''
const yearOf = post => String(post.content_year || (post.event_date || post.published_at || '').slice(0, 4))
const dateOf = post => post.event_date || post.published_at || ''

export function BlogImage({ path, alt = '', ...props }) {
  const [signed, setSigned] = useState({ path: '', url: '' })
  const [failed, setFailed] = useState('')
  const direct = imageSource(path)
  useEffect(() => {
    if (direct || !storagePath(path)) return
    let active = true
    supabase.storage.from('blog-photos').createSignedUrl(path, 3600)
      .then(({ data }) => { if (active) setSigned({ path, url: webLink(data?.signedUrl) }) })
      .catch(() => { if (active) setSigned({ path, url: '' }) })
    return () => { active = false }
  }, [path, direct])
  const src = direct || (signed.path === path ? signed.url : '')
  return src && failed !== src ? <img src={src} alt={alt} {...props} onError={() => setFailed(src)} /> : <div className={`blog-image-placeholder ${props.className || ''}`} role="img" aria-label={alt || '照片 / Photo'}><Camera aria-hidden="true" /></div>
}

export function ArticleContent({ post, media = [], onPhoto, en = false, tagLibrary = [] }) {
  return <article className="blog-article">
    <header><p className="blog-eyebrow">{[post.event_date, post.location].filter(Boolean).join(' · ')}</p><h1>{post.title}</h1>{post.summary && <p className="blog-summary">{post.summary}</p>}{post.credit && <p className="blog-credit">{post.credit}</p>}</header>
    {post.cover_path && <BlogImage className="blog-article-cover" path={post.cover_path} alt={post.title} />}
    <div className="blog-prose">{text(post.body).split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>
    {post.content_type === 'publication' && <BookDetails details={post.book_details || {}} en={en} />}
    {webLink(post.video_url) && <p className="blog-prose"><a href={webLink(post.video_url)} target="_blank" rel="noopener noreferrer">{en ? 'Watch video' : '观看影片'} <ExternalLink size={16} /></a></p>}
    {!!media.length && <div className="blog-gallery">{media.map((photo, i) => <figure key={photo.id || `${photo.path}-${i}`}><button type="button" onClick={() => onPhoto?.(i)} aria-label={photo.caption || `照片 / Photo ${i + 1}`}><BlogImage path={photo.path} alt={photo.caption || post.title} loading="lazy" /></button>{photo.caption && <figcaption>{photo.caption}</figcaption>}</figure>)}</div>}
    {post.behind_scenes && <section className="blog-prose"><h2>{en ? 'Behind the scenes' : '幕后花絮'}</h2><p>{text(post.behind_scenes)}</p></section>}
    {!!postTags(post, tagLibrary).length && <div className="blog-tags">{postTags(post, tagLibrary).map(tag => <a key={tag.id} style={{ color: safeColor(tag.color) }} href={`${sectionOf(post.content_type).path}?tag=${encodeURIComponent(tag.name)}#articles`}>{tag.icon} {tag.name}</a>)}</div>}
  </article>
}

function BookDetails({ details, en }) {
  const fields = [['author', '作者', 'Author'], ['price', '价格', 'Price'], ['published_on', '出版日期', 'Published'], ['pages', '页数', 'Pages'], ['isbn', 'ISBN', 'ISBN']]
  return <section className="blog-book-details"><dl>{fields.filter(([key]) => details[key]).map(([key, zh, english]) => <div key={key}><dt>{en ? english : zh}</dt><dd>{details[key]}</dd></div>)}</dl>{details.author_bio && <><h2>{en ? 'About the author' : '作者介绍'}</h2><p>{details.author_bio}</p></>}<p>{en ? 'To purchase, contact us through the social links below.' : '如欲购买，请通过下方社交媒体联系我们。'}</p><SocialLinks links={details.purchase_links || []} /></section>
}

async function rows(query) {
  const result = await query
  if (result.error) throw result.error
  return result.data || []
}
async function allRows(makeQuery) {
  const data = []
  for (let offset = 0; ; offset += 100) {
    const batch = await rows(makeQuery().range(offset, offset + 99))
    data.push(...batch)
    if (batch.length < 100) return data
  }
}

export default function Blog({ profile, lang, setLang }) {
  const en = lang === 'en'
  const t = (zh, english) => en ? english : zh
  const pathname = window.location.pathname.replace(/\/$/, '') || '/'
  let slug = ''
  try { slug = pathname.startsWith('/blog/') ? decodeURIComponent(pathname.slice(6)) : '' } catch { slug = '__invalid__' }
  const section = sections.find(item => item.path === pathname) || sections[0]
  const view = section.path === '/' ? 'home' : section.path.slice(1)
  const type = section.type
  const [settings, setSettings] = useState(defaultBlogSettings)
  const [posts, setPosts] = useState([])
  const [categories, setCategories] = useState([])
  const [moments, setMoments] = useState([])
  const [tagLibrary, setTagLibrary] = useState([])
  const [media, setMedia] = useState([])
  const [links, setLinks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState(new URLSearchParams(window.location.search).get('category') || '')
  const [year, setYear] = useState('')
  const [tag, setTag] = useState(new URLSearchParams(window.location.search).get('tag') || '')
  const [sort, setSort] = useState('desc')
  const [page, setPage] = useState(1)
  const [lightbox, setLightbox] = useState(null)
  const [download, setDownload] = useState('')
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [slide, setSlide] = useState(0)
  const [paused, setPaused] = useState(false)
  const closeRef = useRef(null)
  const dialogRef = useRef(null)
  const albumTriggerRef = useRef(null)
  const activeMember = profile?.is_active === true
  const post = posts.find(item => item.slug === slug)
  const content = settings.content && typeof settings.content === 'object' ? settings.content : {}
  const override = (key, fallback) => text(content[key]) || text(content.sections?.[key]) || fallback
  const configuredSlides = Array.isArray(content.hero_slides) ? content.hero_slides.filter(item => item && item.enabled !== false && (imageSource(item.path) || storagePath(item.path))) : []
  const slides = configuredSlides.length ? configuredSlides : [{ path: settings.hero_path || '/login-group-2026.jpeg', title: settings.title, subtitle: settings.intro, link: '/activities' }]
  const currentSlide = slides[slide % slides.length]

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const schedule = await supabase.rpc('blog_publish_due')
        if (schedule.error) throw schedule.error
        const site = await supabase.from('blog_settings').select('*').eq('id', 1).single()
        if (site.error) throw site.error
        const cats = await rows(supabase.from('blog_categories').select('*').order('name'))
        // Published-only at the query boundary, including recommendations and tag searches.
        const articles = await allRows(() => supabase.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending: false }).order('id'))
        if (!active) return
        setSettings({ ...defaultBlogSettings, ...site.data }); setCategories(cats); setPosts(articles)
        const library = await rows(supabase.from('blog_tags').select('*').order('name'))
        if (active) setTagLibrary(library)
        const current = articles.find(item => item.slug === slug)
        const pictures = current ? await allRows(() => supabase.from('blog_media').select('*').eq('post_id', current.id).order('position').order('id')) : []
        if (current) {
          const publicLinks = await rows(supabase.from('blog_links').select('*').eq('post_id', current.id).eq('visibility', 'public').order('position'))
          const memberLinks = activeMember ? await rows(supabase.from('blog_links').select('*').eq('post_id', current.id).eq('visibility', 'member').order('position')) : []
          if (active) setLinks([...publicLinks, ...memberLinks])
        } else if (view === 'home') {
          const items = []
          for (const event of articles.filter(item => item.content_type === 'event' && item.show_in_moments !== false).slice(0, 8)) {
            const photos = await rows(supabase.from('blog_media').select('*').eq('post_id', event.id).order('position').limit(1))
            const path = photos[0]?.path || event.cover_path
            if (path) items.push({ ...event, moment_path: path })
          }
          if (active) setMoments(items)
        }
        if (active) setMedia(pictures)
      } catch { if (active) setError('load') }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [slug, activeMember, view])

  useEffect(() => {
    if (paused || slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const interval = window.setInterval(() => setSlide(value => (value + 1) % slides.length), Math.max(3, Math.min(60, Number(content.hero_interval) || 7)) * 1000)
    return () => window.clearInterval(interval)
  }, [slides.length, content.hero_interval, paused])

  const lightboxOpen = lightbox !== null
  useEffect(() => {
    if (!lightboxOpen) return
    const previousFocus = albumTriggerRef.current || document.activeElement
    albumTriggerRef.current = null
    const prior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    function keys(event) {
      if (event.key === 'Escape') setLightbox(null)
      if (event.key === 'ArrowRight') { event.preventDefault(); setLightbox(value => ({ ...value, index: (value.index + 1) % value.photos.length })) }
      if (event.key === 'ArrowLeft') { event.preventDefault(); setLightbox(value => ({ ...value, index: (value.index + value.photos.length - 1) % value.photos.length })) }
      if (event.key === 'Tab') {
        const buttons = Array.from(dialogRef.current?.querySelectorAll('button') || [])
        const index = buttons.indexOf(document.activeElement)
        event.preventDefault(); buttons[(index + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length]?.focus()
      }
    }
    window.addEventListener('keydown', keys)
    return () => { document.body.style.overflow = prior; window.removeEventListener('keydown', keys); previousFocus?.focus() }
  }, [lightboxOpen])

  async function getDownload() {
    if (!activeMember || !post) return
    setDownloadBusy(true)
    try {
      const result = await supabase.from('blog_downloads').select('drive_url').eq('post_id', post.id).maybeSingle()
      if (result.error || !webLink(result.data?.drive_url)) throw new Error('unavailable')
      setDownload(webLink(result.data.drive_url))
    } catch { setError('download') }
    finally { setDownloadBusy(false) }
  }
  const scopedPosts = posts.filter(item => !type || (item.content_type || 'article') === type)
  const scopedCategories = publicCategories(categories, type)
  const categoryIds = [category, ...categories.filter(cat => cat.parent_id === category).map(cat => cat.id)]
  const filtered = scopedPosts.filter(item => (!category || categoryIds.includes(item.category_id)) && (!year || yearOf(item) === year) && (!tag || postTags(item, tagLibrary).map(tag => tag.name).includes(tag)) && `${item.title} ${item.summary || ''} ${postTags(item, tagLibrary).map(tag => tag.name).join(' ')}`.toLowerCase().includes(search.toLowerCase().trim()))
    .sort((a, b) => Number(!!b.is_sticky) - Number(!!a.is_sticky) || (sort === 'asc' ? 1 : -1) * (yearOf(a).localeCompare(yearOf(b)) || dateOf(a).localeCompare(dateOf(b))) || a.id.localeCompare(b.id))
  const years = [...new Set(scopedPosts.map(yearOf).filter(Boolean))].sort().reverse()
  const tags = [...new Set(scopedPosts.flatMap(item => postTags(item, tagLibrary).map(tag => tag.name)))].sort()
  const manual = Array.isArray(post?.related_ids) ? post.related_ids : []
  const score = item => (post?.event_id && (item.id === post.event_id || item.event_id === post.event_id) || item.event_id === post?.id ? 5 : 0) + (post?.category_id && item.category_id === post.category_id ? 3 : 0) + postTags(item, tagLibrary).map(tag => tag.name).filter(value => postTags(post || {}, tagLibrary).map(tag => tag.name).includes(value)).length
  const related = post ? posts.filter(item => item.id !== post.id && (manual.includes(item.id) || score(item) > 0)).sort((a, b) => {
    const ai = manual.indexOf(a.id), bi = manual.indexOf(b.id)
    return (ai < 0 ? Infinity : ai) - (bi < 0 ? Infinity : bi) || score(b) - score(a)
  }).slice(0, 3) : []
  const card = item => <a className="blog-post" key={item.id} href={blogPath(item.slug)}>{item.cover_path && <BlogImage path={item.cover_path} alt={item.title} loading="lazy" />}<div><p className="blog-eyebrow">{categories.find(cat => cat.id === item.category_id)?.name || t('学会记录', 'Club journal')}{item.is_sticky ? t(' · 置顶', ' · Pinned') : ''}</p><h3>{item.title}</h3>{item.content_type === 'publication' && <p>{item.book_details?.author}{item.book_details?.price && ` · ${item.book_details.price}`}</p>}<time>{dateOf(item).slice(0, 10) || yearOf(item)}</time><p>{item.summary}</p><span>{t('阅读全文', 'Read story')}<ArrowRight size={16} /></span></div></a>
  const aboutNotes = text(content.about_notes || settings.about || settings.intro).split(/\n\s*\n/).map(note => note.trim()).filter(Boolean)
  const archiveYears = new Set(posts.map(yearOf).filter(Boolean)).size
  const about = <section className="blog-community" id="about">
    <div className="blog-community-intro"><h2>{override('about_title', settings.title)}</h2><p>{settings.intro}</p>
      {content.about_image && <BlogImage className="blog-community-photo" path={content.about_image} alt={settings.title} loading="lazy" />}
      <dl className="blog-community-counts">{[[posts.length, t('公开文章', 'Public stories')], [posts.filter(item => item.content_type === 'event').length, t('活动记录', 'Activities')], [archiveYears, t('记录年份', 'Years recorded')]].map(([value, label]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    </div>
    <div className="blog-community-board"><div className="blog-community-board-heading"><BookOpen size={19} aria-hidden="true" /><h3>{override('about_board_title', t('关于我们的故事', 'Our story'))}</h3></div>
      <ol>{aboutNotes.map((note, index) => <li key={index}><span className="blog-note-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><p>{note}</p></li>)}</ol>
      {view !== 'about' && <a href="/about">{t('认识我们', 'Meet our club')} <ArrowRight size={16} /></a>}
    </div>
  </section>
  const errorText = error === 'download' ? t('暂时无法取得原图相册，请稍后重试。', 'Original photos are unavailable. Please try again later.') : error === 'album' ? t('这个相册暂时没有公开照片。', 'This album has no public photos yet.') : error === 'extras' ? t('部分相册或相关链接暂时无法载入。', 'Some albums or related links are temporarily unavailable.') : t('学会动态暂时无法载入，会员仍可正常登入系统。', 'Stories are temporarily unavailable. Member login is still available.')
  return <div className="club-blog blog-public">
    <a className="blog-skip" href="#blog-content">{t('跳至内容', 'Skip to content')}</a>
    <header className="blog-nav"><a className="blog-brand" href={publicHomeUrl()}><img src="/logo-192.png" alt="" /><span>{settings.title}<small>{settings.subtitle}</small></span></a><BlogNavigation categories={categories} pathname={pathname} en={en} /><div className="blog-public-actions"><button title={t('切换语言', 'Switch language')} aria-label={t('切换语言', 'Switch language')} onClick={() => setLang(en ? 'zh' : 'en')}><Globe size={18} /></button>{canManageBlog(profile) && <a href="/blog-admin" title={t('文章后台', 'Manage blog')} aria-label={t('文章后台', 'Manage blog')}><Settings size={18} /></a>}<a className="blog-primary" href={profile ? '/#/' : blogLogin()}>{profile ? <BookOpen size={16} /> : <LogIn size={16} />}{profile ? t('会员系统', 'Members') : t('会员登入', 'Member login')}</a></div></header>
    {!slug && view === 'home' && <section className="blog-hero" aria-label={t('学会故事', 'Club stories')}><a className="blog-hero-image-link" href={safePublicLink(currentSlide.link) || '/activities'} aria-label={currentSlide.title || settings.title}><BlogImage path={currentSlide.path} alt={currentSlide.title || settings.title} fetchPriority="high" /></a><div className="blog-hero-copy"><p>{settings.subtitle}</p><h1>{currentSlide.title || override('hero_title', settings.title)}</h1><p>{currentSlide.subtitle || override('hero_subtitle', settings.intro)}</p><a href={localPath(currentSlide.link) ? currentSlide.link : webLink(currentSlide.link) || '/activities'}>{t('探索我们的故事', 'Explore our stories')}<ArrowRight size={18} /></a></div>{slides.length > 1 && <div className="blog-slide-controls"><span>{String(slide % slides.length + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span><button title={t('上一张', 'Previous slide')} aria-label={t('上一张', 'Previous slide')} onClick={() => setSlide(value => (value + slides.length - 1) % slides.length)}><ChevronLeft size={18} /></button><button title={t('下一张', 'Next slide')} aria-label={t('下一张', 'Next slide')} onClick={() => setSlide(value => (value + 1) % slides.length)}><ChevronRight size={18} /></button><button title={paused ? t('播放', 'Play') : t('暂停', 'Pause')} aria-label={paused ? t('播放', 'Play') : t('暂停', 'Pause')} onClick={() => setPaused(value => !value)}>{paused ? <Play size={16} /> : <Pause size={16} />}</button></div>}</section>}
    <main className="blog-main" id="blog-content">
      {error && <p className="blog-error" role="alert">{errorText}</p>}
      {loading ? <div className="blog-skeleton" role="status" aria-label={t('载入中', 'Loading')} /> : slug ? post ? <>
        <a className="blog-back" href={sectionOf(post.content_type).path}><ArrowLeft size={16} /> {t('返回', 'Back to')} {en ? sectionOf(post.content_type).en : sectionOf(post.content_type).zh}</a><ArticleContent post={post} en={en} tagLibrary={tagLibrary} media={media} onPhoto={index => setLightbox({ photos: media, index, title: post.title })} />
        {!!links.filter(link => webLink(link.url) && (link.visibility === 'public' || activeMember)).length && <section className="blog-download"><h2>{t('相关链接', 'Related links')}</h2><div className="blog-public-links">{links.filter(link => webLink(link.url) && (link.visibility === 'public' || activeMember)).map(link => <a key={link.id} href={webLink(link.url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={18} />{link.label}{link.visibility === 'member' && <small>{t('会员', 'Members')}</small>}</a>)}</div></section>}
        {post.content_type === 'event' && !links.some(link => ['drive', 'download'].includes(link.type)) && <section className="blog-download"><h2>{t('活动原图相册', 'Original photo album')}</h2>{activeMember ? download ? <a className="blog-primary" href={download} target="_blank" rel="noopener noreferrer"><Download size={18} />{t('前往 Google Drive 下载', 'Open Google Drive')}</a> : <button className="blog-primary" disabled={downloadBusy} onClick={getDownload}><Download size={18} />{downloadBusy ? t('读取中…', 'Loading…') : t('取得原图相册', 'Get original photos')}</button> : <a href={blogLogin()} className="blog-primary"><LogIn size={18} />{t('会员登入后下载原图', 'Log in to download originals')}</a>}</section>}
        {!!related.length && <section className="blog-public-section"><h2>{t('延伸阅读', 'More stories')}</h2><div className="blog-post-grid">{related.map(card)}</div></section>}
      </> : <section className="blog-empty"><h1>{t('文章不存在或尚未公开', 'Article unavailable')}</h1><a href={publicHomeUrl()}>{t('返回首页', 'Back to home')}</a></section> : view === 'about' ? about : <>
        <section id="articles"><div className="blog-section-heading"><div><p className="blog-eyebrow">{view === 'bookroom' ? 'THE READING ROOM' : 'OUR STORIES'}</p><h2>{view === 'home' ? override('latest_title', t('最新活动', 'Latest stories')) : (en ? section.en : section.zh)}</h2></div>{view === 'home' && <a href="/activities">{t('查看全部活动', 'All activities')} <ArrowRight size={16} /></a>}</div>
          {view === 'literature' && <p className="blog-submission-note">{t('投稿提示：视觉杂记不配图；生活随笔可配图。两类短篇建议 10–450 字，由编辑人工审核。', 'Submissions: visual notes are text-only; life essays may include photos. Suggested length: 10–450 characters, reviewed by our editors.')}</p>}<div className="blog-filters"><label className="blog-search"><Search size={18} /><input aria-label={t('搜索文章', 'Search articles')} placeholder={t('搜索文章、标签', 'Search stories and tags')} value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} /></label><select aria-label={t('年份', 'Year')} value={year} onChange={event => { setYear(event.target.value); setPage(1) }}><option value="">{t('所有年份', 'All years')}</option>{years.map(value => <option key={value}>{value}</option>)}</select><select aria-label={t('排序', 'Sort order')} value={sort} onChange={event => { setSort(event.target.value); setPage(1) }}><option value="desc">{t('由新至旧', 'Newest first')}</option><option value="asc">{t('由旧至新', 'Oldest first')}</option></select><select aria-label={t('标签', 'Tag')} value={tag} onChange={event => { setTag(event.target.value); setPage(1) }}><option value="">{t('所有标签', 'All tags')}</option>{[...new Set([...tags, ...(tag ? [tag] : [])])].map(value => <option key={value} value={value}>#{value}</option>)}</select></div>
          <div className="blog-categories"><button aria-pressed={!category} onClick={() => { setCategory(''); setPage(1) }}>{t('全部', 'All')}</button>{scopedCategories.map(item => <button key={item.id} aria-pressed={category === item.id} onClick={() => { setCategory(item.id); setPage(1) }}>{item.icon} {item.name}</button>)}</div>
          <div className="blog-post-grid">{filtered.slice(0, page * 8).map(card)}</div>{!filtered.length && <p className="blog-empty">{t('暂无符合条件的公开文章。', 'No published stories match your filters.')}</p>}{filtered.length > page * 8 && <button className="blog-more" onClick={() => setPage(value => value + 1)}>{t('更多文章', 'Load more')}</button>}
        </section>
        {view === 'home' && <><section className="blog-public-section"><div className="blog-section-heading"><div><p className="blog-eyebrow">EDITOR’S PICKS</p><h2>{override('featured_title', t('活动记录精选', 'Featured activities'))}</h2></div><BookOpen size={28} /></div><div className="blog-post-grid">{posts.filter(item => item.featured && item.content_type === 'event').slice(0, 4).map(card)}</div>{!posts.some(item => item.featured && item.content_type === 'event') && <p className="blog-empty">{t('精选故事即将更新。', 'Featured stories are coming soon.')}</p>}</section><section className="blog-public-section blog-album-section" id="albums"><div className="blog-section-heading"><div><p className="blog-eyebrow">MOMENTS WORTH REMEMBERING</p><h2>{override('albums_title', t('活动影像', 'Moments'))}</h2></div><Camera size={28} /></div><div className="blog-album-grid">{moments.map(item => <a key={item.id} className="blog-album" href={blogPath(item.slug)}><BlogImage path={item.moment_path} alt={item.title} loading="lazy" /><span><strong>{item.title}</strong><small>{yearOf(item)}</small></span></a>)}</div>{!moments.length && <p className="blog-empty">{t('活动影像即将更新。', 'Activity photos are coming soon.')}</p>}</section>{about}</>}
      </>}
    </main><footer className="blog-footer"><div><strong>{settings.title}</strong><p>{settings.contact || settings.subtitle}</p></div><div><p>{t('记录现在，传承以后。', 'Stories today. Memories for tomorrow.')}</p><span>© {new Date().getFullYear()} CHMS1 Chinese Language Club</span></div><a href="/#/">{t('会员系统', 'Member system')} <ArrowRight size={16} /></a><a href="/?app=blog">{t('安装 Blog 首页', 'Install Blog home')}</a><SocialLinks links={content.social_links || []} /></footer>
    {lightbox && <div ref={dialogRef} className="blog-lightbox" role="dialog" aria-modal="true" aria-label={t('照片查看', 'Photo viewer')} onClick={event => { if (event.target === event.currentTarget) setLightbox(null) }}><button ref={closeRef} className="blog-lightbox-close" aria-label={t('关闭', 'Close')} onClick={() => setLightbox(null)}><X /></button><button aria-label={t('上一张', 'Previous')} onClick={() => setLightbox(value => ({ ...value, index: (value.index + value.photos.length - 1) % value.photos.length }))}><ChevronLeft /></button><figure><BlogImage path={lightbox.photos[lightbox.index].path} alt={lightbox.photos[lightbox.index].caption || lightbox.title} /><figcaption aria-live="polite">{lightbox.photos[lightbox.index].caption || lightbox.title} ({lightbox.index + 1}/{lightbox.photos.length})</figcaption></figure><button aria-label={t('下一张', 'Next')} onClick={() => setLightbox(value => ({ ...value, index: (value.index + 1) % value.photos.length }))}><ChevronRight /></button></div>}
  </div>
}
