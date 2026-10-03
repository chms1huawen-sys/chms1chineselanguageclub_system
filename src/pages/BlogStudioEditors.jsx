import BlogArticlePreview from '../components/BlogArticlePreview'
import { createImagePreview } from '../utils/imagePreview'
import { secureUpload } from '../utils/secureUpload'
import BlogPhotoCrop from '../components/BlogPhotoCrop'
import ValidatedField from '../components/BlogValidatedField'
import { lazy, Suspense, useState } from 'react'
import { Save, Plus, Trash2, ArrowUp, ArrowDown, Eye, X } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { BookEditor, SocialEditor } from './BlogCultureEditors'
import { submissionNote } from '../utils/blogPresentation'
import { safePublicLink } from '../utils/blogContent'
import StudioMedia, { StudioImage } from './BlogStudioMedia'

const BlogRichEditor = lazy(() => import('../components/BlogRichEditor'))

async function checked(query) { const result = await query; if (result.error) throw result.error; return result.data }
const choices = { article: ['文章', 'Article'], event: ['活动', 'Event'], publication: ['出版物', 'Publication'], notice: ['公告', 'Notice'], draft: ['草稿', 'Draft'], published: ['已发布', 'Published'], scheduled: ['定时发布', 'Scheduled'], hidden: ['已隐藏', 'Hidden'], trash: ['回收站', 'Trash'] }
function localTime(value) { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) }
function validUrl(value) { try { return ['https:', 'http:'].includes(new URL(value).protocol) } catch { return false } }
function reorder(items, index, delta) { const next = [...items]; [next[index], next[index + delta]] = [next[index + delta], next[index]]; return next }
function Choice({ title, value, onChange, options, en }) { return <ValidatedField>{title}<select value={value} onChange={e => onChange(e.target.value)}>{options.map(v => <option key={v} value={v}>{choices[v]?.[en ? 1 : 0] || v}</option>)}</select></ValidatedField> }

export function StudioPostEditor({ initial, data, busy, run, reload, setDirty, dirty, en, archived, onSaved }) {
  const t = (zh, english) => en ? english : zh
  const [post, setPost] = useState({ tags: [], tag_ids: [], book_details: {}, show_in_moments: true, related_ids: [], ...initial.row, status: initial.row.status === 'review' ? 'draft' : initial.row.status })
  const [links, setLinks] = useState(initial.links)
  const [media, setMedia] = useState(initial.media)
  const [preview, setPreview] = useState(false)
  const coverPhoto = media.find(photo => photo.path === post.cover_path)
  const locked = archived(initial.row.content_year) || post.status === 'trash'
  const disabled = busy || locked
  const change = (key, value) => { setPost(p => ({ ...p, [key]: value, ...(key === 'content_type' ? { category_id: null } : {}) })); setDirty(true) }
  const changeLinks = next => { setLinks(next); setDirty(true) }
  const updateLink = (index, key, value) => changeLinks(links.map((l, i) => i === index ? { ...l, [key]: value } : l))
  const candidates = data.posts.filter(p => p.id !== post.id && p.status !== 'trash' && !p.deleted_at)
  async function save(e) {
    e.preventDefault()
    const form = e.currentTarget
    for (const input of form.querySelectorAll('input,textarea,select')) {
      input.setCustomValidity('')
      if (input.required && !input.value.trim()) input.setCustomValidity(t('请填写此项。', 'Please fill in this field.'))
      if (input.validity.patternMismatch) input.setCustomValidity(t('只可使用小写英文字母、数字及连接号，例如 club-news。', 'Use lowercase letters, numbers and hyphens, e.g. club-news.'))
      if (input.name === 'slug' && data.posts.some(item => item.id !== post.id && item.slug === input.value)) input.setCustomValidity(t('此网址名称已被使用，请换一个。', 'This URL slug is already in use.'))
      if (input.type === 'url' && input.value && !validUrl(input.value)) input.setCustomValidity(t('请输入有效的 HTTP(S) 网址。', 'Enter a valid HTTP(S) URL.'))
      if (input.name === 'content_year' && archived(post.content_year)) input.setCustomValidity(t('此年份已封存。', 'This year is archived.'))
      if (input.name === 'scheduled_at' && (!post.scheduled_at || new Date(post.scheduled_at) <= new Date())) input.setCustomValidity(t('请选择未来的发布时间。', 'Choose a future publication time.'))
    }
    if (!form.checkValidity()) {
      const first = form.querySelector(':invalid:not(fieldset)')
      let ancestor = first?.parentElement
      while (ancestor && ancestor !== form) { if (ancestor.tagName === 'DETAILS') ancestor.open = true; ancestor = ancestor.parentElement }
      first?.focus(); first?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    await run(async () => {
      if (archived(post.content_year)) throw new Error(t('不可保存至已归档年份。', 'Cannot save into an archived year.'))
      if (links.some(l => !l.label.trim() || !validUrl(l.url))) throw new Error(t('每个链接都需要名称及有效的 HTTP(S) 网址。', 'Every link needs a label and valid HTTP(S) URL.'))
      if (post.status === 'scheduled' && (!post.scheduled_at || new Date(post.scheduled_at) <= new Date())) throw new Error(t('请选择未来的发布时间。', 'Choose a future publication time.'))
      if ((post.book_details?.purchase_links || []).some(link => !link.label?.trim() || !validUrl(link.url))) throw new Error(t('请填写购买联系名称及 HTTP(S) 网址。', 'Enter a contact name and HTTP(S) URL.'))
      const payload = { ...post, title: post.title.trim(), category_id: post.category_id || null, event_date: post.event_date || null, event_id: post.event_id || null, content_year: Number(post.content_year), scheduled_at: post.status === 'scheduled' ? new Date(post.scheduled_at).toISOString() : null, tags: [...new Set(post.tags || [])] }
      delete payload.kind
      const saved = await checked(supabase.rpc('blog_studio_save', { p_post: payload, p_links: links.map((l, position) => ({ ...(l.id ? { id: l.id } : {}), label: l.label.trim(), url: l.url.trim(), visibility: l.visibility, position, type: l.type || 'link' })), p_album_ids: [], p_media: media.map(({ id, caption, crop }, position) => ({ id, caption, position, crop: crop || null, width_percent: 100 })), p_version: post.version ?? null }))
      setPost(saved); setDirty(false)
      // Refresh generated link IDs so a second save updates the same records.
      setLinks(await checked(supabase.from('blog_links').select('*').eq('post_id', saved.id).order('position')))
      onSaved(saved); await reload()
    }, t('内容、链接与照片说明已保存。', 'Content, links and photo captions saved.'))
  }
  return <><div className="bs-section-heading"><h2>{post.id ? t('编辑内容', 'Edit content') : t('新增内容', 'New content')}</h2><button onClick={() => setPreview(v => !v)}><Eye size={16} />{preview ? t('继续编辑', 'Continue editing') : t('预览', 'Preview')}</button></div>{locked && <p className="bs-alert">{t('此内容为只读。请先重新开放年份或从回收站还原。', 'Read-only. Reopen the year or restore this record first.')}</p>}
    {!preview && <div className="bs-savebar bs-sticky-save"><span role="status">{busy ? t('保存中…', 'Saving…') : dirty ? t('尚未保存', 'Unsaved changes') : post.id ? t('已保存', 'Saved') : t('新内容', 'New content')}</span><button form="blog-post-form" disabled={disabled} className="bs-primary" type="submit"><Save size={17} />{t('保存内容', 'Save content')}</button></div>}
    {preview ? <BlogArticlePreview post={post} media={media} links={links} en={en} tagLibrary={data.tags} /> : <form id="blog-post-form" noValidate onSubmit={save} className="bs-editor"><fieldset disabled={disabled}>
      <div className="bs-form-grid"><Choice title={t('内容类型', 'Content type')} value={post.content_type || 'article'} onChange={v => change('content_type', v)} options={['article', 'event', 'publication', 'notice']} en={en} /><ValidatedField>{t('内容年份', 'Content year')}<input required name="content_year" type="number" min="1900" max="2200" value={post.content_year} onChange={e => change('content_year', e.target.value)} /></ValidatedField></div>
      {post.content_type === 'publication' && <BookEditor value={post.book_details} onChange={value => change('book_details', value)} en={en} />}
      {post.content_type === 'article' && <p className="bs-muted">{t('视觉杂记不配图，生活随笔可配图；两类短篇建议 10–450 字，由编辑人工审核。', 'Visual notes are text-only; life essays may include photos. Suggested length: 10–450 characters, reviewed manually.')}</p>}
      {post.content_type === 'event' && <ValidatedField className="bs-checks"><input type="checkbox" checked={post.show_in_moments !== false} onChange={e => change('show_in_moments', e.target.checked)} />{t('显示于首页活动影像', 'Show in homepage moments')}</ValidatedField>}
      <ValidatedField>{t('标题', 'Title')}<input required maxLength={200} value={post.title} onChange={e => change('title', e.target.value)} /></ValidatedField><ValidatedField>{t('网址名称', 'URL slug')}<input name="slug" required maxLength={120} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={post.slug} onChange={e => change('slug', e.target.value)} /></ValidatedField>
      {post.content_type === 'article' && <ValidatedField>{t('作者', 'Author')}<input maxLength={120} value={post.author || ''} onChange={e => change('author', e.target.value)} /></ValidatedField>}
      <ValidatedField>{t('摘要', 'Summary')}<textarea rows={3} maxLength={500} value={post.summary || ''} onChange={e => change('summary', e.target.value)} /></ValidatedField><section aria-label={t('正文编辑', 'Body editor')}><h3>{t('正文', 'Body')}</h3><Suspense fallback={<p>{t('正在加载编辑器…', 'Loading editor…')}</p>}><BlogRichEditor document={post.body_document} text={post.body || ''} onChange={(body_document, body) => { setPost(p => ({ ...p, body_document, body })); setDirty(true) }} media={media} disabled={disabled} en={en} /></Suspense></section>
      <div className="bs-form-grid"><ValidatedField>{t('分类', 'Category')}<select value={post.category_id || ''} onChange={e => change('category_id', e.target.value)}><option value="">{t('未分类', 'Uncategorised')}</option>{data.categories.filter(c => !c.section || c.section === 'all' || c.section === (post.content_type || 'article')).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></ValidatedField><ValidatedField>{t('署名 / 摄影鸣谢', 'Byline / photo credit')}<input value={post.credit || ''} onChange={e => change('credit', e.target.value)} /></ValidatedField></div>
      <details className="bs-advanced" open={post.content_type === 'event' ? true : undefined}><summary>{t('活动资料', 'Event information')}</summary><div className="bs-form-grid"><ValidatedField>{t('活动日期', 'Event date')}<input type="date" value={post.event_date || ''} onChange={e => change('event_date', e.target.value)} /></ValidatedField><ValidatedField>{t('地点', 'Location')}<input value={post.location || ''} onChange={e => change('location', e.target.value)} /></ValidatedField></div></details>
      {coverPhoto && <ValidatedField>{t('封面照片说明（显示在图片下方）', 'Cover caption (shown below the image)')}<input value={coverPhoto.caption || ''} onChange={e => { setMedia(items => items.map(item => item.id === coverPhoto.id ? { ...item, caption: e.target.value } : item)); setDirty(true) }} /></ValidatedField>}
      <h3>{t('标签', 'Tags')}</h3><div className="bs-checkbox-list">{data.tags.map(tag => <ValidatedField key={tag.id}><input type="checkbox" checked={post.tag_ids?.includes(tag.id) || false} onChange={e => change('tag_ids', e.target.checked ? [...(post.tag_ids || []), tag.id] : post.tag_ids.filter(id => id !== tag.id))} />{tag.icon} {tag.name}{tag.is_visible === false && t('（隐藏）', ' (hidden)')}</ValidatedField>)}</div>
      <details className="bs-advanced"><summary>{t('更多设置：关联活动与花絮', 'More: event and notes')}</summary><div className="bs-form-grid"><ValidatedField>{t('关联活动', 'Associated event')}<select value={post.event_id || ''} onChange={e => change('event_id', e.target.value || null)}><option value="">{t('无', 'None')}</option>{candidates.filter(p => p.content_type === 'event').map(p => <option key={p.id} value={p.id}>{p.content_year} / {p.title}</option>)}</select></ValidatedField></div>
      <ValidatedField>{t('幕后花絮', 'Behind the scenes')}<textarea rows={4} value={post.behind_scenes || ''} onChange={e => change('behind_scenes', e.target.value)} /></ValidatedField></details>
      <details><summary>{t('相关内容', 'Related content')} ({post.related_ids?.length || 0})</summary><div className="bs-checkbox-list">{candidates.map(p => <ValidatedField key={p.id}><input type="checkbox" checked={post.related_ids?.includes(p.id) || false} onChange={e => change('related_ids', e.target.checked ? [...(post.related_ids || []), p.id] : post.related_ids.filter(v => v !== p.id))} />{p.content_year} / {p.title}</ValidatedField>)}</div></details>
      <section className="bs-section"><div className="bs-section-heading"><h3>{t('相关链接', 'Related links')}</h3><button type="button" onClick={() => changeLinks([...links, { label: '', url: '', visibility: 'public', type: 'link' }])}><Plus size={16} />{t('新增链接', 'Add link')}</button></div>{links.map((link, index) => <div className="bs-link-row" key={link.id || `new-${index}`}><ValidatedField>{t('名称', 'Label')}<input required value={link.label} onChange={e => updateLink(index, 'label', e.target.value)} /></ValidatedField><ValidatedField>URL<input required type="url" value={link.url} onChange={e => updateLink(index, 'url', e.target.value)} /></ValidatedField><ValidatedField>{t('可见性', 'Visibility')}<select value={link.visibility} onChange={e => updateLink(index, 'visibility', e.target.value)}><option value="public">{t('公开', 'Public')}</option><option value="member">{t('会员专用', 'Members only')}</option></select></ValidatedField><ValidatedField>{t('链接类型', 'Link type')}<input required value={link.type || 'link'} onChange={e => updateLink(index, 'type', e.target.value)} list="bs-link-types" /></ValidatedField><div className="bs-actions"><button type="button" title={t('前移', 'Move up')} disabled={disabled || !index} onClick={() => changeLinks(reorder(links, index, -1))}><ArrowUp size={16} /></button><button type="button" title={t('后移', 'Move down')} disabled={disabled || index === links.length - 1} onClick={() => changeLinks(reorder(links, index, 1))}><ArrowDown size={16} /></button><button type="button" title={t('移除链接', 'Remove link')} onClick={() => changeLinks(links.filter((_, i) => i !== index))}><X size={16} /></button></div></div>)}<datalist id="bs-link-types"><option value="link" /><option value="download" /><option value="video" /><option value="registration" /></datalist></section>
      <div className="bs-form-grid"><Choice title={t('状态', 'Status')} value={post.status} onChange={v => change('status', v)} options={post.status === 'trash' ? ['trash'] : ['draft', 'published', 'scheduled', 'hidden']} en={en} />{post.status === 'scheduled' && <ValidatedField>{t('发布时间（本地时间）', 'Publish at (local time)')}<input required name="scheduled_at" type="datetime-local" value={localTime(post.scheduled_at)} onChange={e => change('scheduled_at', e.target.value ? new Date(e.target.value).toISOString() : null)} /></ValidatedField>}</div><div className="bs-checks"><ValidatedField><input type="checkbox" checked={!!post.featured} onChange={e => change('featured', e.target.checked)} />{t('首页精选', 'Featured')}</ValidatedField><ValidatedField><input type="checkbox" checked={!!post.is_sticky} onChange={e => change('is_sticky', e.target.checked)} />{t('置顶', 'Sticky')}</ValidatedField></div>

    </fieldset></form>}
    {!preview && <StudioMedia owner={post} kind="post" media={media} setMedia={setMedia} changeCover={v => change('cover_path', v)} savedCover={initial.row.cover_path} disabled={disabled} run={run} setDirty={setDirty} en={en} />}
  </>
}

export function StudioSettings({ initial, busy, run, reload, en, setDirty }) {
  const t = (zh, english) => en ? english : zh
  const [site, setSite] = useState({ ...initial, content: { hero_slides: [], hero_interval: 6, ...initial.content } })
  const [cropping, setCropping] = useState(null)
  const content = site.content
  const slides = content.hero_slides || []
  const change = (key, value) => { setSite(s => ({ ...s, [key]: value })); setDirty(true) }
  const changeContent = (key, value) => { setSite(s => ({ ...s, content: { ...s.content, [key]: value } })); setDirty(true) }
  const changeSlide = (index, key, value) => changeContent('hero_slides', slides.map((slide, i) => i === index ? { ...slide, [key]: value } : slide))
  async function upload(file, assign) {
    if (!file) return
    await run(async () => {
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.type]
      if (!ext || file.size > 10 * 1024 * 1024) throw new Error(t('仅支持 JPG、PNG、WEBP，每张最多 10MB。', 'Only JPG, PNG, WEBP, up to 10MB each.'))
      const path = `${crypto.randomUUID()}.${ext}`
      const bucket = supabase.storage.from('blog-site-media')
      await checked(secureUpload('blog-site-media', path, file))
      let displayPath = path
      try {
        const preview = await createImagePreview(file)
        if (preview) {
          const previewPath = `${path}.preview.webp`
          await checked(secureUpload('blog-site-media', previewPath, preview))
          displayPath = previewPath
        }
      } catch (error) {
        console.warn('Image preview unavailable; keeping original.', error.message)
      }
      const result = bucket.getPublicUrl(displayPath)
      assign(result.data.publicUrl)
    }, t('图片已上传；保存设置后公开生效。', 'Image uploaded. Save settings to publish the change.'))
  }
  return <form className="bs-editor" onSubmit={e => { e.preventDefault(); run(async () => {
      const start = Number(content.stats_start_year), end = Number(content.stats_end_year || new Date().getFullYear())
      if (content.stats_start_year && (!Number.isInteger(start) || start < 1 || start > end)) throw new Error(t('开始年份必须小于或等于结束年份。', 'Start year must not exceed the end year.'))
      if (content.hero_link && !safePublicLink(content.hero_link)) throw new Error(t('默认首页链接必须为站内路径或 HTTP(S) 网址。', 'The introduction link must be a local path or HTTP(S) URL.'))
      if ((content.social_links || []).some(link => !link.label?.trim() || !validUrl(link.url))) throw new Error(t('请填写社媒名称和 HTTP(S) 网址。', 'Enter a social label and HTTP(S) URL.')); if (slides.some(s => s.link && !safePublicLink(s.link))) throw new Error(t('轮播链接必须为站内路径或 HTTP(S) 网址。', 'Slide links must be local paths or HTTP(S) URLs.')); const values = Object.fromEntries(['title', 'subtitle', 'intro', 'about', 'contact', 'hero_path', 'content'].map(key => [key, site[key]])); await checked(supabase.from('blog_settings').update(values).eq('id', 1).select().single()); setDirty(false); await reload() }) }}><fieldset disabled={busy}>
    <SocialEditor value={content.social_links || []} onChange={links => changeContent('social_links', links)} en={en} />
    <section className="bs-section"><h2>{t('首页简介', 'Homepage introduction')}</h2><label>{t('说明栏标题', 'Board title')}<input value={content.about_board_title || ''} onChange={e => changeContent('about_board_title', e.target.value)} /></label><label>{t('首页简短介绍（与关于我们详情分别编辑）', 'Homepage summary (separate from About page)')}<textarea rows={7} value={content.about_notes ?? site.about ?? ''} onChange={e => changeContent('about_notes', e.target.value)} /></label></section>
    <section className="bs-section"><h2>{t('网站文字', 'Site text')}</h2><div className="bs-form-grid">{[['title', '网站标题', 'Site title'], ['subtitle', '学校 / 副标题', 'School / subtitle'], ['intro', '首页短句', 'Introduction'], ['contact', '联系资料', 'Contact']].map(([key, zh, english]) => <label key={key}>{t(zh, english)}<textarea required={key === 'title'} rows={2} value={site[key] || ''} onChange={e => change(key, e.target.value)} /></label>)}</div><label>{t('关于我们页面：详细介绍', 'About page: full introduction')}<textarea rows={6} value={site.about || ''} onChange={e => change('about', e.target.value)} /></label><div className="bs-form-grid">{[['hero_title', '默认首页画面主标题', 'Introduction slide title'], ['hero_subtitle', '默认首页画面副标题', 'Introduction slide subtitle'], ['hero_cta', '探索按钮文字（轮播默认）', 'Default carousel button text'], ['hero_link', '默认首页画面链接', 'Introduction slide link'], ['latest_title', '最新内容标题', 'Latest section title'], ['featured_title', '精选内容标题', 'Featured section title'], ['albums_title', '活动影像标题', 'Moments section title'], ['about_title', '介绍区域标题', 'About section title']].map(([key, zh, english]) => <label key={key}>{t(zh, english)}<input value={content[key] || ''} onChange={e => changeContent(key, e.target.value)} /></label>)}</div></section>
    <section className="bs-section"><h2>{t('首页统计卡片', 'Homepage statistics')}</h2><div className="bs-form-grid">{[['stats_posts_label', '公开文章卡片名称', 'Public stories label'], ['stats_members_label', '团员人数卡片名称', 'Membership label'], ['stats_years_label', '记录年份卡片名称', 'Years label']].map(([key, zh, english]) => <label key={key}>{t(zh, english)}<input value={content[key] || ''} onChange={e => changeContent(key, e.target.value)} /></label>)}<label>{t('现今团员人数', 'Current member count')}<input type="number" min="0" step="1" value={content.stats_members ?? 0} onChange={e => changeContent('stats_members', e.target.value)} /></label><label>{t('记录开始年份', 'Starting year')}<input type="number" min="1" max="9999" step="1" value={content.stats_start_year || ''} onChange={e => changeContent('stats_start_year', e.target.value)} /></label><label>{t('记录结束年份（留空自动采用今年）', 'Ending year (blank uses current year)')}<input type="number" min="1" max="9999" step="1" placeholder={String(new Date().getFullYear())} value={content.stats_end_year || ''} onChange={e => changeContent('stats_end_year', e.target.value)} /></label></div></section>
    <section className="bs-section"><h2>{t('文学角落投稿提示', 'Literature submission guidance')}</h2>{[['submission_note', '中文投稿提示', 'Chinese guidance'], ['submission_note_en', '英文投稿提示', 'English guidance']].map(([key, zh, english]) => <label key={key}>{t(zh, english)}<textarea rows={3} value={content[key] ?? submissionNote(key.endsWith('_en'))} onChange={e => changeContent(key, e.target.value)} /></label>)}</section>
    <section className="bs-section"><div className="bs-section-heading"><h2>{t('首页轮播', 'Hero carousel')}</h2><button type="button" onClick={() => changeContent('hero_slides', [...slides, { path: '', title: '', subtitle: '', link: '', enabled: true }])}><Plus size={17} />{t('新增画面', 'Add slide')}</button></div><label>{t('轮播间隔（秒）', 'Slide interval (seconds)')}<input type="number" min="3" max="60" required value={content.hero_interval} onChange={e => changeContent('hero_interval', e.target.value === '' ? '' : Number(e.target.value))} /></label><label className="bs-checks"><input type="checkbox" checked={content.hero_default_enabled !== false} onChange={e => changeContent('hero_default_enabled', e.target.checked)} />{t('将默认首页介绍加入轮播第一张', 'Include the introduction as the first slide')}</label><button type="button" onClick={() => setCropping({ path: site.hero_path || '/login-group-2026.jpeg', value: content.hero_mobile_crop, save: crop => changeContent('hero_mobile_crop', crop) })}>{t('裁切默认图片（手机）', 'Crop introduction for mobile')}</button><div className="bs-slides">{slides.map((slide, index) => <div className="bs-slide" key={index}><div className="bs-slide-image">{slide.path ? <StudioImage path={slide.path} crop={slide.crop} publicAsset alt={slide.title} /> : <div className="bs-image-empty">{t('尚无图片', 'No image')}</div>}{slide.path && <button type="button" onClick={() => setCropping({ path: slide.path, value: slide.crop, save: crop => changeSlide(index, 'crop', crop) })}>{t('裁切照片', 'Crop photo')}</button>}<label>{t('上传轮播图片', 'Upload slide image')}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => { upload(e.target.files[0], value => changeSlide(index, 'path', value)); e.target.value = '' }} /></label></div><div className="bs-slide-fields">{slide.path && <button type="button" onClick={() => setCropping({ path: slide.path, value: slide.mobile_crop || slide.crop, save: crop => changeSlide(index, 'mobile_crop', crop) })}>{t('裁切手机画面', 'Crop mobile photo')}</button>}<label>{t('图片路径 / 网址', 'Image path / URL')}<input required={slide.enabled} value={slide.path} onChange={e => changeSlide(index, 'path', e.target.value)} /></label><label>{t('标题', 'Title')}<input value={slide.title} onChange={e => changeSlide(index, 'title', e.target.value)} /></label><label>{t('副标题', 'Subtitle')}<textarea rows={2} value={slide.subtitle} onChange={e => changeSlide(index, 'subtitle', e.target.value)} /></label><label>{t('按钮文字（留空沿用轮播默认）', 'Button text (blank uses carousel default)')}<input value={slide.cta || ''} onChange={e => changeSlide(index, 'cta', e.target.value)} /></label><label>{t('链接', 'Link')}<input value={slide.link} onChange={e => changeSlide(index, 'link', e.target.value)} /></label><div className="bs-checks"><label><input type="checkbox" checked={slide.enabled !== false} onChange={e => changeSlide(index, 'enabled', e.target.checked)} />{t('启用', 'Enabled')}</label><button type="button" title={t('前移', 'Move up')} disabled={busy || !index} onClick={() => changeContent('hero_slides', reorder(slides, index, -1))}><ArrowUp size={17} /></button><button type="button" title={t('后移', 'Move down')} disabled={busy || index === slides.length - 1} onClick={() => changeContent('hero_slides', reorder(slides, index, 1))}><ArrowDown size={17} /></button><button type="button" title={t('移除画面', 'Remove slide')} onClick={() => { if (window.confirm(t('移除此轮播画面？', 'Remove this slide?'))) changeContent('hero_slides', slides.filter((_, i) => i !== index)) }}><Trash2 size={17} /></button></div></div></div>)}</div></section>
    <section className="bs-section"><h2>{t('网站图片', 'Site images')}</h2><div className="bs-form-grid">{[['hero_path', '默认首页介绍图片', 'Introduction slide image'], ['about_image', '学会介绍图片', 'About image']].map(([key, zh, english]) => { const value = key === 'hero_path' ? site[key] : content[key]; const assign = v => key === 'hero_path' ? change(key, v) : changeContent(key, v); return <div className="bs-site-image" key={key}>{value && <StudioImage path={value} crop={content[`${key}_crop`]} publicAsset alt={t(zh, english)} />}{value && <button type="button" onClick={() => setCropping({ path: value, value: content[`${key}_crop`], save: crop => changeContent(`${key}_crop`, crop) })}>{t('裁切照片', 'Crop photo')}</button>}<label>{t(zh, english)}<input value={value || ''} onChange={e => assign(e.target.value)} /><input type="file" aria-label={t(zh, english)} accept="image/jpeg,image/png,image/webp" onChange={e => { upload(e.target.files[0], assign); e.target.value = '' }} /></label></div> })}</div></section><div className="bs-savebar"><button className="bs-primary"><Save size={17} />{t('保存网站设置', 'Save site settings')}</button></div>
  </fieldset>{cropping && <BlogPhotoCrop path={cropping.path} value={cropping.value} publicAsset en={en} onSave={cropping.save} onClose={() => setCropping(null)} />}</form>
}
