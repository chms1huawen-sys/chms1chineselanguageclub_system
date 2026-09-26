import { publicHomeUrl } from '../utils/pwaLaunch'
import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, Files, BookOpen, CalendarDays, Megaphone, Tags, Trash2, Settings, ChartColumn, Plus, Pencil, RotateCcw, Search, RefreshCw, Archive, LockKeyhole, Pin, ArrowLeft, ExternalLink } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { canManageBlog, emptyArticle } from '../utils/blog'
import { StudioPostEditor, StudioSettings } from './BlogStudioEditors'
import { CultureTaxonomy } from './BlogCultureEditors'
import StudioAnalytics from './BlogStudioAnalytics'
import './BlogStudio.css'

const currentYear = new Date().getFullYear()
const types = ['article', 'event', 'publication', 'notice']
const statuses = ['draft', 'review', 'published', 'scheduled', 'hidden']
const labels = { article: '文学作品', event: '活动', publication: '出版物', notice: '学会资讯', draft: '草稿', review: '待审核', published: '已发布', scheduled: '定时发布', hidden: '已隐藏', trash: '回收站' }
const navigation = [['dashboard', LayoutDashboard, '总览', 'Dashboard'], ['content', Files, '内容管理', 'Content'], ['literature', BookOpen, '文学角落', 'Literature'], ['activities', CalendarDays, '活动记录', 'Activities'], ['books', BookOpen, '书坊管理', 'Bookroom'], ['news', Megaphone, '学会资讯', 'Club news'], ['taxonomy', Tags, '分类与标签', 'Taxonomy'], ['analytics', ChartColumn, '访问统计', 'Analytics'], ['trash', Trash2, '回收站', 'Recycle bin'], ['settings', Settings, '网站设置', 'Site settings']]
async function checked(query) { const result = await query; if (result.error) throw result.error; return result.data }
async function allRows(table, order = 'id') {
  const rows = []
  for (let offset = 0; ; offset += 100) {
    const data = await checked(supabase.from(table).select('*').order(order).range(offset, offset + 99))
    rows.push(...data)
    if (data.length < 100) return rows
  }
}

export default function BlogManagement({ profile, lang = 'zh' }) {
  const en = lang === 'en'
  const t = (zh, english) => en ? english : zh
  const label = value => en ? value : labels[value] || value
  const [tab, setTab] = useState('dashboard')
  const [year, setYear] = useState(String(currentYear))
  const [data, setData] = useState({ posts: [], albums: [], categories: [], tags: [], years: [], site: null })
  const [editor, setEditor] = useState(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filters, setFilters] = useState({ search: '', category: '', status: '', tag: '', type: '', sort: 'updated', quick: 'all' })
  const [page, setPage] = useState(1)
  const allowed = canManageBlog(profile)
  const archived = value => data.years.some(y => y.year === Number(value) && y.is_archived)
  const canArchive = ['convener_teacher', 'advisor_teacher', 'advisor', 'chairperson'].includes(profile?.role)
  const usesYear = ['dashboard', 'content', 'literature', 'activities', 'books', 'news', 'trash'].includes(tab)
  const yearOptions = [...new Set([currentYear, Number(year) || currentYear, ...data.years.map(y => y.year), ...data.posts.map(p => p.content_year), ...data.albums.map(a => a.content_year)].filter(Boolean))].sort((a, b) => b - a)
  async function load() {
    const posts = await allRows('blog_posts')
    const albums = []
    const categories = await allRows('blog_categories')
    const tags = await allRows('blog_tags')
    const years = await allRows('blog_years', 'year')
    const site = await checked(supabase.from('blog_settings').select('*').eq('id', 1).single())
    setData({ posts, albums, categories, tags, years, site })
  }
  async function run(action, success = t('已保存。', 'Saved.')) {
    if (busyRef.current) return false
    busyRef.current = true; setBusy(true); setError(''); setMessage('')
    try { await action(); if (success) setMessage(success); return true }
    catch (err) { setError(String(err.message || err).includes('BLOG_EDIT_CONFLICT') ? t('内容已被其他人修改。请保留你的修改，重新打开内容后再保存。', 'Another editor changed this content. Preserve your changes and reopen it before saving.') : String(err.message || err)); return false }
    finally { busyRef.current = false; setBusy(false) }
  }
  useEffect(() => {
    if (!allowed) return
    const timer = setTimeout(() => run(load, '').finally(() => setLoading(false)), 0)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed])
  useEffect(() => {
    if (!dirty) return
    const warn = e => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function discard() { return !dirty || window.confirm(t('放弃尚未保存的修改？', 'Discard unsaved changes?')) }
  function navigate(next) { if (busy || !discard()) return; setEditor(null); setDirty(false); setTab(next); setFilters({ search: '', category: '', status: '', tag: '', type: ({ literature: 'article', activities: 'event', books: 'publication', news: 'notice' })[next] || '', sort: 'updated', quick: 'all' }); setPage(1); setError(''); setMessage('') }
  function filter(key, value) { setFilters(f => ({ ...f, [key]: value })); setPage(1) }
  async function open(row, kind = 'post') {
    if (!discard()) return
    await run(async () => {
      const media = row.id ? await checked(supabase.from('blog_media').select('*').eq(kind === 'post' ? 'post_id' : 'album_id', row.id).order('position').order('id')) : []
      const links = row.id && kind === 'post' ? await checked(supabase.from('blog_links').select('*').eq('post_id', row.id).order('position')) : []
      const joins = []
      setEditor({ kind, row, media, links, albumIds: joins.map(j => j.album_id) }); setDirty(false)
    }, '')
  }
  function create(kind) {
    const selectedYear = Number(year) || currentYear
    open(kind === 'album' ? { title: '', description: '', content_year: selectedYear, status: 'draft', cover_path: '', event_id: null } : { ...emptyArticle(), content_type: filters.type || 'article', content_year: selectedYear, is_sticky: false, related_ids: [], event_id: null, behind_scenes: '', video_url: '', scheduled_at: null }, kind)
  }
  async function changeState(row, kind, permanent = false) {
    const restoring = row.status === 'trash' && !permanent
    const prompt = permanent ? t(`永久删除「${row.title}」？此操作无法撤回。`, `Permanently delete "${row.title}"? This cannot be undone.`) : restoring ? t('还原为草稿？', 'Restore as a draft?') : t('将此内容移至回收站？', 'Move this content to the recycle bin?')
    if (!window.confirm(prompt)) return
    await run(async () => {
      const table = kind === 'album' ? 'blog_albums' : 'blog_posts'
      if (permanent) {
        const media = await checked(supabase.from('blog_media').select('path').eq(kind === 'album' ? 'album_id' : 'post_id', row.id))
        const deleted = await checked(supabase.from(table).delete().eq('id', row.id).select('id'))
        if (!deleted?.length) throw new Error(t('删除未生效，请刷新权限。', 'Nothing deleted. Refresh your permissions.'))
        await load()
        if (media.length) { const cleanup = await supabase.storage.from('blog-photos').remove(media.map(m => m.path)); if (cleanup.error) throw new Error(t('记录已删除；文件清理失败：', 'Record deleted; file cleanup failed: ') + cleanup.error.message) }
      } else {
        const values = { status: restoring ? 'draft' : 'trash', deleted_at: restoring ? null : new Date().toISOString() }
        if (kind === 'album') {
          const updated = await checked(supabase.from(table).update(values).eq('id', row.id).select('id'))
          if (!updated?.length) throw new Error('No record updated.')
        } else {
          const links = await checked(supabase.from('blog_links').select('*').eq('post_id', row.id).order('position'))
          const joins = []
          const media = await checked(supabase.from('blog_media').select('*').eq('post_id', row.id).order('position'))
          await checked(supabase.rpc('blog_studio_save', { p_post: { ...row, ...values }, p_links: links.map(({ id, label, url, visibility, position, type }) => ({ id, label, url, visibility, position, type })), p_album_ids: joins.map(j => j.album_id), p_media: media.map(({ id, caption, position }) => ({ id, caption, position })), p_version: row.version ?? null }))
        }
        await load()
      }
    }, restoring ? t('已还原为草稿。', 'Restored as a draft.') : t('回收站已更新。', 'Recycle bin updated.'))
  }
  const inYear = row => !year || Number(row.content_year || currentYear) === Number(year)
  const activePosts = data.posts.filter(p => inYear(p) && p.status !== 'trash' && !p.deleted_at)
  const activeAlbums = data.albums.filter(a => inYear(a) && a.status !== 'trash' && !a.deleted_at)
  let rows = tab === 'albums' ? activeAlbums.map(a => ({ ...a, kind: 'album' })) : tab === 'trash' ? [...data.posts.map(p => ({ ...p, kind: 'post' })), ...data.albums.map(a => ({ ...a, kind: 'album' }))].filter(p => inYear(p) && (p.status === 'trash' || p.deleted_at)) : activePosts.map(p => ({ ...p, kind: 'post' }))
  rows = rows.filter(row => (!filters.search || `${row.title} ${row.summary || ''} ${row.description || ''} ${row.slug || ''}`.toLowerCase().includes(filters.search.toLowerCase())) && (!filters.status || row.status === filters.status) && (!filters.category || row.category_id === filters.category) && (!filters.tag || row.tag_ids?.includes(filters.tag)) && (!filters.type || row.content_type === filters.type) && (filters.quick !== 'featured' || row.featured) && (filters.quick !== 'sticky' || row.is_sticky) && (filters.quick !== 'mine' || row.created_by === profile?.id))
  rows.sort((a, b) => filters.sort === 'title' ? a.title.localeCompare(b.title) : filters.sort === 'oldest' ? new Date(a.created_at || 0) - new Date(b.created_at || 0) : new Date(b[filters.sort === 'event' ? 'event_date' : 'updated_at'] || 0) - new Date(a[filters.sort === 'event' ? 'event_date' : 'updated_at'] || 0))
  const pages = Math.max(1, Math.ceil(rows.length / 20))
  const visiblePage = Math.min(page, pages)
  const selectedNav = navigation.find(n => n[0] === tab)
  if (!allowed) return <p>{t('没有文章后台管理权限。', 'Blog management access is restricted.')}</p>
  return <div className="bs-layout">
    <aside className="bs-sidebar"><div className="bs-sidebar-title">{t('华文学会后台', 'CLC Blog Studio')}</div><nav aria-label={t('后台导航', 'Studio navigation')}>{navigation.map(([id, Icon, zh, english]) => <button key={id} className={tab === id ? 'active' : ''} aria-current={tab === id ? 'page' : undefined} disabled={busy} onClick={() => tab !== id && navigate(id)}><Icon size={18} />{t(zh, english)}</button>)}</nav><a href={publicHomeUrl()} target="_blank" rel="noreferrer"><ExternalLink size={16} />{t('公开网站', 'Public website')}</a></aside>
    <main className="bs-workspace"><header className="bs-heading"><div><p>CLC_sys / {t('网站管理', 'Website administration')}</p><h1>{t(selectedNav[2], selectedNav[3])}</h1></div><div className="bs-actions">{usesYear && <label className="bs-year">{t('年份', 'Year')}<select aria-label={t('管理年份', 'Management year')} disabled={busy} value={year} onChange={e => { if (discard()) { setYear(e.target.value); setEditor(null); setDirty(false); setPage(1) } }}><option value="">{t('全部年份', 'All years')}</option>{yearOptions.map(y => <option key={y} value={y}>{y}{archived(y) ? t(' · 已归档', ' · Archived') : ''}</option>)}</select></label>}<button title={t('刷新', 'Refresh')} aria-label={t('刷新', 'Refresh')} disabled={busy || dirty} onClick={() => run(load, '')}><RefreshCw size={17} /></button></div></header>
      {error && <div className="bs-alert bs-error" role="alert">{error}</div>}{message && <div className="bs-alert bs-success" role="status">{message}</div>}
      {usesYear && year && archived(year) && <p className="bs-alert"><LockKeyhole size={16} />{t('此年份已归档，内容为只读。', 'This year is archived. Content is read-only.')}</p>}
      {loading ? <p className="bs-empty" role="status">{t('正在载入后台…', 'Loading studio…')}</p> : editor ? <><div className="bs-toolbar"><button disabled={busy} onClick={() => { if (discard()) { setEditor(null); setDirty(false) } }}><ArrowLeft size={17} />{t('返回列表', 'Back to list')}</button>{dirty && <span className="bs-muted">{t('尚未保存', 'Unsaved changes')}</span>}</div>{<StudioPostEditor key={editor.row.id || 'new-post'} initial={editor} data={data} busy={busy} run={run} reload={load} setDirty={setDirty} en={en} archived={archived} onSaved={row => setEditor(e => ({ ...e, row }))} />}</> : <>
        {tab === 'dashboard' && <><div className="bs-stats">{[[t('内容总数', 'Total content'), activePosts.length], [t('已发布', 'Published'), activePosts.filter(p => p.status === 'published').length], [t('待审核', 'In review'), activePosts.filter(p => p.status === 'review').length], [t('活动记录', 'Activities'), activePosts.filter(p => p.content_type === 'event').length]].map(([title, value]) => <div key={title}><span>{title}</span><strong>{value}</strong></div>)}</div><section className="bs-section"><div className="bs-section-heading"><h2>{t('最近编辑', 'Recent edits')}</h2><button onClick={() => navigate('content')}>{t('全部内容', 'All content')}</button></div><ContentTable rows={[...activePosts].sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at)).slice(0, 8).map(p => ({ ...p, kind: 'post' }))} categories={data.categories} t={t} label={label} busy={busy} archived={archived} open={open} changeState={changeState} /></section><section className="bs-section"><h2>{t('年份管理', 'Year archive')}</h2><form className="bs-inline" onSubmit={e => { e.preventDefault(); const value = Number(new FormData(e.currentTarget).get('year')); run(async () => { await checked(supabase.from('blog_years').upsert({ year: value }, { onConflict: 'year', ignoreDuplicates: true })); await load(); setYear(String(value)) }) }}><label>{t('新增年份', 'Add year')}<input name="year" type="number" min="1900" max="2200" defaultValue={currentYear + 1} required /></label><button disabled={busy}><Plus size={16} />{t('新增', 'Add')}</button></form><div className="bs-year-list">{yearOptions.map(y => <div key={y}><strong>{y}</strong><span>{archived(y) ? t('已归档', 'Archived') : t('开放编辑', 'Open')}</span><button disabled={busy || !canArchive} title={t('仅老师与会长可更改归档状态', 'Only teachers and the president can change archive status')} onClick={() => { if (window.confirm(archived(y) ? t(`重新开放 ${y} 年？`, `Reopen ${y}?`) : t(`归档 ${y} 年？内容及照片将锁定。`, `Archive ${y}? Content, albums and media will be locked.`))) run(async () => { await checked(supabase.from('blog_years').upsert({ year: y, is_archived: !archived(y) }, { onConflict: 'year' })); await load() }) }}><Archive size={16} />{archived(y) ? t('重新开放', 'Reopen') : t('归档', 'Archive')}</button></div>)}</div></section></>}
        {['content', 'literature', 'activities', 'books', 'news', 'trash'].includes(tab) && <><div className="bs-section-heading"><h2>{['content', 'literature', 'activities', 'books', 'news'].includes(tab) ? t('内容列表', 'Content library') : tab === 'albums' ? t('相册列表', 'Album library') : t('已删除的内容与相册', 'Deleted content and albums')} <span className="bs-count">{rows.length}</span></h2>{tab !== 'trash' && <button className="bs-primary" disabled={busy || (year && archived(year))} onClick={() => create(tab === 'albums' ? 'album' : 'post')}><Plus size={17} />{tab === 'albums' ? t('新增相册', 'New album') : t('新增内容', 'New content')}</button>}</div>
          {['content', 'literature', 'activities', 'books', 'news'].includes(tab) && <div className="bs-quick">{[['all', '全部', 'All'], ['featured', '首页精选', 'Featured'], ['sticky', '置顶', 'Sticky'], ['mine', '我创建的', 'Created by me']].map(([id, zh, english]) => <button key={id} aria-pressed={filters.quick === id} onClick={() => filter('quick', id)}>{t(zh, english)}</button>)}</div>}
          <div className="bs-filters"><label className="bs-search"><Search size={17} /><input aria-label={t('搜索内容', 'Search content')} placeholder={t('搜索标题、摘要…', 'Search title, summary…')} value={filters.search} onChange={e => filter('search', e.target.value)} /></label>{['content', 'literature', 'activities', 'books', 'news'].includes(tab) && <><select aria-label={t('内容类型', 'Content type')} value={filters.type} onChange={e => filter('type', e.target.value)}><option value="">{t('全部类型', 'All types')}</option>{types.map(v => <option key={v} value={v}>{label(v)}</option>)}</select><select aria-label={t('分类', 'Category')} value={filters.category} onChange={e => filter('category', e.target.value)}><option value="">{t('全部分类', 'All categories')}</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label={t('标签', 'Tag')} value={filters.tag} onChange={e => filter('tag', e.target.value)}><option value="">{t('全部标签', 'All tags')}</option>{data.tags.map(c => <option key={c.id} value={c.id}>{c.group_name ? `${c.group_name} / ` : ''}{c.name}</option>)}</select></>}{tab !== 'trash' && <select aria-label={t('状态', 'Status')} value={filters.status} onChange={e => filter('status', e.target.value)}><option value="">{t('全部状态', 'All statuses')}</option>{(tab === 'albums' ? ['draft', 'published', 'hidden'] : statuses).map(v => <option key={v} value={v}>{label(v)}</option>)}</select>}<select aria-label={t('排序', 'Sort')} value={filters.sort} onChange={e => filter('sort', e.target.value)}>{[['updated', '最近编辑', 'Recently edited'], ['title', '标题', 'Title'], ['oldest', '最早创建', 'Oldest first'], ['event', '活动日期', 'Event date']].map(([v, zh, english]) => <option key={v} value={v}>{t(zh, english)}</option>)}</select></div>
          <ContentTable rows={rows.slice((visiblePage - 1) * 20, visiblePage * 20)} categories={data.categories} t={t} label={label} busy={busy} archived={archived} open={open} changeState={changeState} trash={tab === 'trash'} /><div className="bs-pagination"><span>{rows.length} {t('条记录', 'records')}</span><button disabled={visiblePage <= 1} onClick={() => setPage(visiblePage - 1)}>{t('上一页', 'Previous')}</button><span>{visiblePage} / {pages}</span><button disabled={visiblePage >= pages} onClick={() => setPage(visiblePage + 1)}>{t('下一页', 'Next')}</button></div></>}
        {tab === 'taxonomy' && <CultureTaxonomy data={data} busy={busy} run={run} reload={load} en={en} setDirty={setDirty} />}
        {tab === 'settings' && data.site && <StudioSettings initial={data.site} busy={busy} run={run} reload={load} en={en} setDirty={setDirty} />}
        {tab === 'analytics' && <StudioAnalytics en={en} />}
      </>}
    </main>
  </div>
}

function ContentTable({ rows, categories, t, label, busy, archived, open, changeState, trash = false }) {
  return <div className="bs-table-wrap"><table className="bs-table"><thead><tr>{[t('标题', 'Title'), t('类型 / 分类', 'Type / category'), t('状态', 'Status'), t('年份', 'Year'), t('最近编辑', 'Last edited'), t('操作', 'Actions')].map(h => <th key={h}>{h}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={`${row.kind}-${row.id}`}><td><button className="bs-text-button" disabled={busy} onClick={() => open(row, row.kind)}>{row.is_sticky && <Pin size={13} />}{row.title || t('无标题', 'Untitled')}</button>{row.featured && <small>{t('首页精选', 'Featured')}</small>}</td><td>{row.kind === 'album' ? t('相册', 'Album') : label(row.content_type || 'article')}<small>{categories.find(c => c.id === row.category_id)?.name || ''}</small></td><td><span className={`bs-status bs-status-${row.status}`}>{label(row.status)}</span></td><td>{row.content_year}{archived(row.content_year) && <LockKeyhole size={13} />}</td><td>{row.updated_at ? new Date(row.updated_at).toLocaleDateString() : '-'}</td><td><div className="bs-actions">{trash ? <><button title={t('还原为草稿', 'Restore as draft')} aria-label={t('还原为草稿', 'Restore as draft')} disabled={busy || archived(row.content_year)} onClick={() => changeState(row, row.kind)}><RotateCcw size={16} /></button><button className="bs-danger" title={t('永久删除', 'Delete permanently')} aria-label={t('永久删除', 'Delete permanently')} disabled={busy || archived(row.content_year)} onClick={() => changeState(row, row.kind, true)}><Trash2 size={16} /></button></> : <><button title={t('编辑', 'Edit')} aria-label={t('编辑', 'Edit')} disabled={busy} onClick={() => open(row, row.kind)}><Pencil size={16} /></button><button title={t('移至回收站', 'Move to recycle bin')} aria-label={t('移至回收站', 'Move to recycle bin')} disabled={busy || archived(row.content_year)} onClick={() => changeState(row, row.kind)}><Trash2 size={16} /></button></>}</div></td></tr>)}</tbody></table>{!rows.length && <p className="bs-empty">{t('没有符合条件的记录。', 'No matching records.')}</p>}</div>
}
