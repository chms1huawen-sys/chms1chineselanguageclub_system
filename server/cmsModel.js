import { canManageBlog } from '../src/utils/blogAccess.js'
import { makePublicSnapshot } from '../src/utils/publicSnapshot.js'

export const CMS_TABLES = ['blog_posts', 'blog_albums', 'blog_media', 'blog_links', 'blog_downloads', 'blog_post_albums', 'blog_settings', 'blog_categories', 'blog_tags', 'blog_years']
export const cmsError = (message, status = 400) => Object.assign(new Error(message), { status })
const teacher = profile => ['convener_teacher', 'advisor_teacher', 'advisor'].includes(profile?.role)
const keyOf = (table, row) => String(table === 'blog_years' ? row.year : table === 'blog_downloads' ? row.post_id : table === 'blog_post_albums' ? `${row.post_id}/${row.album_id}` : row.id)
const equal = (a, b) => String(a) === String(b)
const uuid = value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value)
const array = value => Array.isArray(value) ? value : []
const fail = (message, status) => { throw cmsError(message, status) }

export function validateCms(data) {
  if (!data || CMS_TABLES.some(table => !Array.isArray(data[table]) || data[table].length > 10000)) fail('CMS_INVALID_IMPORT')
  if (data.blog_settings.length !== 1 || data.blog_settings[0].id !== 1) fail('CMS_SETTINGS_REQUIRED')
  for (const table of CMS_TABLES) {
    const ids = new Set()
    for (const row of data[table]) {
      const id = keyOf(table, row)
      if (!id || id === 'undefined' || ids.has(id) || JSON.stringify(row).length > 1000000) fail('CMS_INVALID_RECORD')
      ids.add(id)
    }
  }
  const posts = new Set(data.blog_posts.map(row => row.id))
  const originals = new Set(data.blog_media.map(row=>row.original_path).filter(Boolean))
  const albums = new Set(data.blog_albums.map(row => row.id))
  const slugs = new Set()
  for (const post of data.blog_posts) {
    if (!uuid(post.id) || !post.title?.trim() || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) || slugs.has(post.slug)) fail('CMS_INVALID_POST')
    if (!['draft', 'review', 'published', 'scheduled', 'hidden', 'trash'].includes(post.status) || !['article', 'event', 'publication', 'notice'].includes(post.content_type)) fail('CMS_INVALID_POST')
    const document = JSON.stringify(post.body_document || {})
    if (originals.has(post.cover_path) || [...originals].some(path=>document.includes(path))) fail('CMS_PRIVATE_ORIGINAL_REFERENCE')
    slugs.add(post.slug)
  }
  for (const row of data.blog_media) if ((!posts.has(row.post_id) && !albums.has(row.album_id)) || (row.post_id && row.album_id)) fail('CMS_ORPHAN_MEDIA')
  for (const row of [...data.blog_links, ...data.blog_downloads]) if (!posts.has(row.post_id)) fail('CMS_ORPHAN_LINK')
  return data
}

function matches(row, filters = []) {
  if (filters.length > 10) fail('CMS_INVALID_FILTER')
  return filters.every(({ column, value }) => /^[a-z_]+$/.test(column) && equal(row[column], value))
}
function locked(data, row) {
  return row && data.blog_years.some(year => year.is_archived && equal(year.year, row.content_year))
}
function editable(data, table, row) {
  const owner = table === 'blog_media' ? data.blog_posts.find(p => p.id === row.post_id) || data.blog_albums.find(a => a.id === row.album_id) : row
  if (locked(data, owner)) fail('BLOG_YEAR_ARCHIVED', 403)
}
function limited(values, keys) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail('CMS_INVALID_VALUES')
  return Object.fromEntries(Object.entries(values).filter(([key]) => keys.includes(key)))
}
const postFields = ['title','slug','summary','body','body_document','author','category_id','event_date','location','tags','tag_ids','credit','cover_path','featured','status','content_type','content_year','is_sticky','related_ids','event_id','behind_scenes','video_url','scheduled_at','book_details','show_in_moments','deleted_at']
const editableFields = {
  blog_settings: ['title','subtitle','intro','about','contact','hero_path','content'],
  blog_categories: ['name','name_en','parent_id','section','position','is_visible','icon','color'],
  blog_tags: ['name','name_en','group_name','position','is_visible','icon','color'],
  blog_years: ['year','is_archived'],
  blog_media: ['post_id','album_id','path','original_path','display_path','caption','position','crop','width_percent'],
}

export function cmsOperation(source, command, profile, now = new Date().toISOString(), randomId = () => crypto.randomUUID()) {
  if (!canManageBlog(profile)) fail('BLOG_FORBIDDEN', 403)
  const data = command.action === 'select' ? source : structuredClone(source)
  if (command.rpc === 'blog_studio_save') {
    const args = command.args || {}
    const supplied = args.p_post || {}
    const old = data.blog_posts.find(row => row.id === supplied.id)
    if (supplied.id && !old) fail('BLOG_EDIT_CONFLICT',409)
    if (old && old.version !== args.p_version) fail('BLOG_EDIT_CONFLICT', 409)
    editable(data, 'blog_posts', old)
    const post = { ...(old || { id: randomId(), created_by: profile.id, created_at: now, status: 'draft', content_type: 'article', published_at: null }), ...limited(supplied, postFields), version: (old?.version || 0) + 1, updated_at: now, updated_by: profile.id }
    post.title = post.title?.trim()
    if (!Number.isInteger(post.content_year) || post.content_year < 1900 || post.content_year > 2200) fail('CMS_INVALID_YEAR')
    editable(data, 'blog_posts', post)
    if (post.status === 'published' && !post.published_at) post.published_at = now
    if (post.status === 'scheduled' && (!Number.isFinite(Date.parse(post.scheduled_at)) || Date.parse(post.scheduled_at) <= Date.parse(now))) fail('CMS_INVALID_SCHEDULE')
    const links = array(args.p_links)
    if (links.length > 30 || array(args.p_media).length > 300) fail('CMS_TOO_MANY_ITEMS')
    for (const link of links) {
      let url
      try { url = new URL(link.url) } catch { fail('CMS_INVALID_LINK') }
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || !link.label?.trim() || !['public','member'].includes(link.visibility)) fail('CMS_INVALID_LINK')
    }
    data.blog_posts = [...data.blog_posts.filter(row => row.id !== post.id), post]
    data.blog_links = [...data.blog_links.filter(row => row.post_id !== post.id), ...links.map((row, position) => ({ ...limited(row, ['label','url','visibility','type']), id: randomId(), post_id: post.id, position }))]
    for (const media of array(args.p_media)) {
      const row = data.blog_media.find(item => item.id === media.id && item.post_id === post.id)
      if (!row) fail('CMS_MEDIA_OWNER_MISMATCH', 403)
      Object.assign(row, limited(media, ['caption','position','crop','width_percent']))
    }
    validateCms(data)
    return { data, result: post, write: true }
  }
  if (command.rpc) fail('CMS_UNKNOWN_OPERATION')
  const table = command.table
  if (!CMS_TABLES.includes(table)) fail('CMS_UNKNOWN_TABLE')
  const selected = data[table].filter(row => matches(row, command.filters))
  let result
  if (command.action === 'select') {
    result = [...selected]
    for (const order of [...array(command.orders)].reverse()) {
      if (!/^[a-z_]+$/.test(order.column)) fail('CMS_INVALID_ORDER')
      result.sort((a,b) => (a[order.column] > b[order.column] ? 1 : a[order.column] < b[order.column] ? -1 : 0) * (order.ascending === false ? -1 : 1))
    }
    const start = Number(command.start || 0), end = Number(command.end ?? start + 9999)
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start || end - start > 10000) fail('CMS_INVALID_RANGE')
    result = result.slice(start, end + 1)
    if (command.columns && command.columns !== '*') {
      const columns = command.columns.split(',')
      if (columns.some(column => !/^[a-z_]+$/.test(column))) fail('CMS_INVALID_COLUMNS')
      result = result.map(row => Object.fromEntries(columns.map(column => [column, row[column]])))
    }
  } else {
    if (!['insert','update','upsert','delete'].includes(command.action)) fail('CMS_INVALID_ACTION')
    if (command.action !== 'insert' && command.action !== 'upsert' && !array(command.filters).length) fail('CMS_FILTER_REQUIRED')
    if (table === 'blog_posts' && command.action !== 'delete') fail('CMS_USE_STUDIO_SAVE')
    if (['blog_albums','blog_links','blog_downloads','blog_post_albums'].includes(table)) fail('CMS_USE_STUDIO_SAVE')
    for (const row of selected) editable(data, table, row)
    if (command.action === 'delete') {
      if (table === 'blog_settings' || table === 'blog_years') fail('CMS_PROTECTED_RECORD', 403)
      const ids = new Set(selected.map(row => keyOf(table, row)))
      data[table] = data[table].filter(row => !ids.has(keyOf(table, row)))
      if (table === 'blog_posts') {
        for (const child of ['blog_media','blog_links','blog_downloads','blog_post_albums']) data[child] = data[child].filter(row => !ids.has(row.post_id))
      }
      if (table === 'blog_categories') {
        for (const row of data.blog_posts) if (ids.has(row.category_id)) { editable(data,'blog_posts',row); row.category_id = null }
        for (const row of data.blog_categories) if (ids.has(row.parent_id)) row.parent_id = null
      }
      if (table === 'blog_tags') for (const row of data.blog_posts) row.tag_ids = array(row.tag_ids).filter(id => !ids.has(id))
      if (table === 'blog_tags') {
        const names = new Set(selected.map(row=>row.name))
        for (const row of data.blog_posts) {
          if (array(row.tags).some(name=>names.has(name))) { editable(data,'blog_posts',row); row.tags=array(row.tags).filter(name=>!names.has(name)) }
        }
      }
      result = selected
    } else {
      const values = limited(command.values, editableFields[table] || [])
      if (table === 'blog_years' && (!Number.isInteger(values.year) || values.year < 1900 || values.year > 2200)) fail('CMS_INVALID_YEAR')
      if (table === 'blog_years' && (values.is_archived !== undefined || command.action === 'update') && !teacher(profile)) fail('BLOG_ARCHIVE_FORBIDDEN', 403)
      if (['blog_categories','blog_tags'].includes(table) && !values.name?.trim()) fail('CMS_NAME_REQUIRED')
      if (table === 'blog_media' && command.action === 'insert') {
        if (!uuid(values.post_id) || values.album_id || !data.blog_posts.some(row => row.id === values.post_id)) fail('CMS_MEDIA_OWNER_MISMATCH')
        editable(data, table, values)
        if (typeof values.path !== 'string' || !values.path.startsWith(`${values.post_id}/`)) fail('CMS_INVALID_MEDIA_PATH')
      }
      if (command.action === 'update') {
        if (table === 'blog_media') fail('CMS_USE_STUDIO_SAVE')
        if (table === 'blog_tags') for (const tag of selected) for (const row of data.blog_posts) {
          if (array(row.tag_ids).includes(tag.id) || array(row.tags).includes(tag.name)) {
            editable(data,'blog_posts',row)
            row.tags=array(row.tags).map(name=>name===tag.name ? values.name : name)
          }
        }
        for (const row of selected) Object.assign(row, values, { updated_at: now })
        result = selected
      } else {
        const existing = command.action === 'upsert' && table === 'blog_years' ? data[table].find(row => row.year === values.year) : null
        if (existing) {
          if (!command.ignoreDuplicates) Object.assign(existing, values)
          result = [existing]
        } else {
          const row = { id: randomId(), created_at: now, created_by: profile.id, ...values }
          data[table].push(row)
          result = [row]
        }
      }
    }
    validateCms(data)
  }
  if (command.single) {
    if (result.length !== 1 && !(command.single === 'maybe' && result.length === 0)) fail('CMS_EXPECTED_SINGLE_ROW')
    result = result[0] || null
  }
  return { data, result, write: command.action !== 'select' }
}

export function publicCmsSnapshot(data, now = Date.now()) {
  return makePublicSnapshot({ settings: data.blog_settings[0], posts: data.blog_posts, media: data.blog_media, links: data.blog_links, categories: data.blog_categories, tags: data.blog_tags }, now)
}

export function cmsRecordKey(table, row) { return keyOf(table, row) }
