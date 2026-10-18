import { CMS_TABLES, cmsOperation, cmsRecordKey, publicCmsSnapshot, validateCms, cmsError } from '../../server/cmsModel.js'
import { canManageBlog } from '../../src/utils/blogAccess.js'
import { PUBLIC_ORIGIN, SOURCE_ORIGIN } from '../../src/utils/siteOrigins.js'
import { fileTypeFromBuffer } from 'file-type'
import { imageSize } from 'image-size'
import { readUpload, validateUpload } from '../../supabase/functions/secure-upload/validation.js'
import { isDirectR2Photo, r2SitePath, r2SiteUrl } from '../../src/utils/r2Asset.js'
import { loginPresentation } from '../../src/utils/loginPresentation.js'

const json = (value, status = 200, headers = {}) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff', ...headers } })
const fail = (message, status) => { throw cmsError(message, status) }
export async function loadCms(db) {
  const state = await db.prepare('SELECT * FROM cms_state WHERE id=1').first()
  const records = await db.prepare('SELECT collection,id,data FROM cms_records LIMIT 10001').all()
  if (records.results.length > 10000) fail('CMS_ROW_LIMIT', 503)
  const data = Object.fromEntries(CMS_TABLES.map(table => [table, []]))
  for (const row of records.results) if (data[row.collection]) data[row.collection].push(JSON.parse(row.data))
  return { state, data }
}
export async function commitCms(db, previous, next, timestamp) {
  const before = new Map(CMS_TABLES.flatMap(table => previous.data[table].map(row => [`${table}:${cmsRecordKey(table,row)}`, JSON.stringify(row)])))
  const after = new Map()
  const changed = []
  for (const table of CMS_TABLES) for (const row of next[table]) {
    const id = cmsRecordKey(table, row), data = JSON.stringify(row), key = `${table}:${id}`
    after.set(key, true)
    if (before.get(key) !== data) changed.push({ collection: table, id, data })
  }
  const deleted = [...before.keys()].filter(key => !after.has(key)).map(key => { const colon = key.indexOf(':'); return { collection: key.slice(0,colon), id: key.slice(colon+1) } })
  const revision = previous.state.revision
  // D1 batches are atomic; every write is conditional on the same revision.
  const result = await db.batch([
    db.prepare('DELETE FROM cms_records WHERE (collection,id) IN (SELECT json_extract(value,\'$.collection\'),json_extract(value,\'$.id\') FROM json_each(?)) AND (SELECT revision FROM cms_state WHERE id=1)=?').bind(JSON.stringify(deleted), revision),
    db.prepare('INSERT INTO cms_records(collection,id,data) SELECT json_extract(value,\'$.collection\'),json_extract(value,\'$.id\'),json_extract(value,\'$.data\') FROM json_each(?) WHERE (SELECT revision FROM cms_state WHERE id=1)=? ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data').bind(JSON.stringify(changed), revision),
    db.prepare('UPDATE cms_state SET revision=revision+1,updated_at=? WHERE id=1 AND revision=? AND active=1').bind(timestamp,revision),
  ])
  if (result[2].meta.changes !== 1) fail('BLOG_EDIT_CONFLICT', 409)
}
export async function cmsProfile(request, env, requestOrigin = fetch, managerRequired = true) {
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) fail('LOGIN_REQUIRED', 401)
  const project = new URL(env.CMS_AUTH_URL)
  if (project.protocol !== 'https:' || !project.hostname.endsWith('.supabase.co')) fail('AUTH_UNAVAILABLE',503)
  const options = { headers: { apikey: env.CMS_AUTH_ANON_KEY, Authorization: authorization }, redirect: 'error', signal: AbortSignal.timeout(10000) }
  const userResponse = await requestOrigin(project.origin + '/auth/v1/user', options)
  if (!userResponse.ok) fail('LOGIN_REQUIRED',401)
  const user = await userResponse.json()
  if (!/^[a-f0-9-]{36}$/.test(user.id || '')) fail('LOGIN_REQUIRED',401)
  const profileResponse = await requestOrigin(project.origin + '/rest/v1/users?' + new URLSearchParams({ id: `eq.${user.id}`, select: 'id,role,is_active,can_manage_blog' }), options)
  if (!profileResponse.ok) fail('BLOG_FORBIDDEN',403)
  const rows = await profileResponse.json()
  if (rows.length !== 1 || rows[0].is_active !== true || (managerRequired && !canManageBlog(rows[0]))) fail('BLOG_FORBIDDEN',403)
  return rows[0]
}
export function createCmsHandler({ authenticate = cmsProfile } = {}) {
  return async (request, env) => {
    const url = new URL(request.url)
    if (!['/api/blog-admin','/api/blog-admin/upload','/api/blog-source','/api/blog-site-image','/api/blog-login-settings','/api/blog-member'].includes(url.pathname)) return null
    const origin = request.headers.get('Origin')
    const cors = [SOURCE_ORIGIN,PUBLIC_ORIGIN].includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, content-type, x-upload-bucket, x-upload-owner', 'Access-Control-Allow-Methods': 'POST, OPTIONS' } : {}
    if (request.method === 'OPTIONS') return origin && cors.Vary ? new Response(null,{status:204,headers:cors}) : json({error:'ORIGIN_NOT_ALLOWED'},403)
    try {
      if (!env.CMS) fail('CMS_NOT_CONFIGURED',503)
      if (['/api/blog-site-image','/api/blog-login-settings'].includes(url.pathname)) {
        if (!['GET','HEAD'].includes(request.method)) fail('METHOD_NOT_ALLOWED',405)
        const current = await loadCms(env.CMS)
        if (!current.state?.active) fail('CMS_MIGRATION_PENDING',503)
        const content = current.data.blog_settings[0]?.content || {}
        if (url.pathname === '/api/blog-login-settings') return json({ data: loginPresentation(content.member_login) },200,cors)
        const path = r2SitePath(url.href)
        if (!path || !JSON.stringify(current.data.blog_settings).includes(JSON.stringify(r2SiteUrl(path)))) fail('IMAGE_NOT_PUBLISHED',404)
        return await imageResponse(env,'blog-site-media',path,request.method === 'HEAD')
      }
      if (url.pathname === '/api/blog-source') {
        if (!['GET','HEAD'].includes(request.method)) fail('METHOD_NOT_ALLOWED',405)
        const current = await loadCms(env.CMS)
        if (!current.state?.active) return json({ active: false }, 200)
        const snapshot = publicCmsSnapshot(current.data, Date.parse(current.state.updated_at))
        return request.method === 'HEAD' ? new Response(null,{headers:{'Cache-Control':'no-store','X-CMS-Revision':String(current.state.revision)}}) : json({ active: true, revision: current.state.revision, snapshot })
      }
      if (request.method !== 'POST') fail('METHOD_NOT_ALLOWED',405)
      if (origin && !cors.Vary) fail('ORIGIN_NOT_ALLOWED',403)
      const profile = url.pathname === '/api/blog-member' ? await cmsProfile(request,env,fetch,false) : await authenticate(request,env)
      await consumeRate(env.CMS,profile.id,'requests',120,60)
      if (url.pathname === '/api/blog-admin/upload') {
        const current = await loadCms(env.CMS)
        if (!current.state?.active) fail('CMS_MIGRATION_PENDING',503)
        const bucket = request.headers.get('x-upload-bucket'), owner = request.headers.get('x-upload-owner')
        if (!['blog-photos','blog-site-media'].includes(bucket)) fail('INVALID_BUCKET',400)
        if (bucket === 'blog-photos') {
          const post = current.data.blog_posts.find(row => row.id === owner)
          if (!post || post.status === 'trash' || current.data.blog_years.some(year => year.year === post.content_year && year.is_archived)) fail('IMAGE_OWNER_NOT_EDITABLE',403)
        }
        const mime = request.headers.get('content-type')
        const extension = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' }[mime]
        if (!extension) fail('INVALID_IMAGE',400)
        const bytes = await readUpload(request,10*1024*1024)
        await validateUpload(bytes,{ mime },{ fileTypeFromBuffer,imageSize })
        await consumeRate(env.CMS,profile.id,'uploads',30,60)
        await consumeRate(env.CMS,profile.id,'uploadBytes',200*1024*1024,86400,bytes.byteLength)
        const path = `${bucket === 'blog-photos' ? owner : 'site'}/r2-${crypto.randomUUID()}.${extension}`
        const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), b=>b.toString(16).padStart(2,'0')).join('')
        const key = `photos-v1/${bucket}/${path}`
        const stored = await env.PUBLIC_SITE.put(key,bytes,{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:mime},customMetadata:{sha256}})
        if (!stored) fail('IMAGE_CONFLICT',409)
        await env.PUBLIC_SITE.put(key+'.verified',new Uint8Array(),{customMetadata:{sha256}})
        return json({ data:{path},provider:'cloudflare-r2' },200,cors)
      }
      if (!request.headers.get('content-type')?.startsWith('application/json')) fail('JSON_REQUIRED',400)
      const body = new TextDecoder().decode(await readUpload(request,1000000))
      const command = JSON.parse(body)
      const current = await loadCms(env.CMS)
      if (url.pathname === '/api/blog-member') {
        if (!current.state?.active) return json({active:false},200,cors)
        const post = current.data.blog_posts.find(row => row.id === command.postId && row.status === 'published' && !row.deleted_at)
        if (!post) fail('POST_NOT_FOUND',404)
        return json({active:true,links:current.data.blog_links.filter(row=>row.post_id===post.id && row.visibility==='member'),drive_url:current.data.blog_downloads.find(row=>row.post_id===post.id)?.drive_url || null},200,cors)
      }
      if (command.action === 'status') return json({ active: !!current.state?.active, revision: current.state?.revision || 0 },200,cors)
      if (!current.state?.active) fail('CMS_MIGRATION_PENDING',503)
      if (command.action === 'image') {
        if (command.bucket === 'blog-photos' ? !isDirectR2Photo(command.path) : command.bucket !== 'blog-site-media' || !r2SitePath(r2SiteUrl(command.path))) fail('INVALID_IMAGE_PATH',400)
        return await imageResponse(env,command.bucket,command.path,false,cors)
      }
      if (command.action === 'removeImages') {
        if (!Array.isArray(command.paths) || command.paths.length > 600 || command.paths.some(path=>!isDirectR2Photo(path))) fail('INVALID_IMAGE_PATH',400)
        for (const path of command.paths) {
          if (current.data.blog_media.some(row=>[row.path,row.original_path,row.display_path].includes(path)) || current.data.blog_posts.some(row=>row.cover_path===path || JSON.stringify(row.body_document || {}).includes(path))) fail('IMAGE_STILL_REFERENCED',409)
          // Only unreferenced article assets can be removed, never backups or configuration.
          const key = `photos-v1/blog-photos/${path}`
          await env.PUBLIC_SITE.delete([key,key+'.verified'])
        }
        return json({data:{removed:command.paths.length}},200,cors)
      }
      if (command.action === 'sync') return json({ data: { synced: true, revision: current.state.revision } },200,cors)
      if (command.table === 'blog_media' && command.action === 'insert') {
        for (const path of [command.values?.path,command.values?.original_path].filter(Boolean)) {
          if (!isDirectR2Photo(path)) fail('NEW_IMAGES_REQUIRE_R2',400)
          const key='photos-v1/blog-photos/'+path
          const object=await env.PUBLIC_SITE.head(key), marker=await env.PUBLIC_SITE.head(key+'.verified')
          if (!object || !marker || marker.customMetadata?.sha256 !== object.customMetadata?.sha256) fail('IMAGE_NOT_VERIFIED',400)
        }
      }
      const outcome = cmsOperation(current.data,command,profile)
      if (outcome.write) await commitCms(env.CMS,current,validateCms(outcome.data),new Date().toISOString())
      return json({ data: outcome.result, provider: 'cloudflare-d1' },200,cors)
    } catch (error) {
      const status = [400,401,403,404,409,413,429,503].includes(error?.status) ? error.status : 503
      return json({ error: status === 503 ? 'CMS_UNAVAILABLE' : error.message },status,cors)
    }
  }
}

export async function publishDueCms(env) {
  if (!env.CMS) return
  const current = await loadCms(env.CMS)
  await env.CMS.prepare('DELETE FROM cms_rate WHERE expires<?').bind(Math.floor(Date.now()/1000)).run()
  if (!current.state?.active) return
  const timestamp = new Date().toISOString()
  let changed = false
  for (const post of current.data.blog_posts) {
    if (post.status === 'scheduled' && Date.parse(post.scheduled_at) <= Date.now() && !current.data.blog_years.some(year=>year.year===post.content_year && year.is_archived)) {
      Object.assign(post,{status:'published',published_at:post.scheduled_at,updated_at:timestamp,version:(post.version||0)+1})
      changed=true
    }
  }
  if (changed) {
    const before = await loadCms(env.CMS)
    if (before.state.revision !== current.state.revision) fail('BLOG_EDIT_CONFLICT',409)
    await commitCms(env.CMS,before,validateCms(current.data),timestamp)
  }
}

async function imageResponse(env,bucket,path,headOnly=false,extra={}) {
  const key = `photos-v1/${bucket}/${path}`
  const object = headOnly ? await env.PUBLIC_SITE.head(key) : await env.PUBLIC_SITE.get(key)
  const marker = object && await env.PUBLIC_SITE.head(key+'.verified')
  if (!object || !marker || marker.customMetadata?.sha256 !== object.customMetadata?.sha256 || !/^[a-f0-9]{64}$/.test(object.customMetadata?.sha256 || '') || object.size>10*1024*1024 || !/^image\/(jpeg|png|webp)$/.test(object.httpMetadata?.contentType || '')) fail('IMAGE_UNAVAILABLE',404)
  return new Response(headOnly ? null : object.body,{headers:{'Content-Type':object.httpMetadata.contentType,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex, nofollow',...extra}})
}

async function consumeRate(db,actor,kind,limit,seconds,amount=1) {
  const window = Math.floor(Date.now()/1000/seconds)
  const key = `${actor}:${kind}:${window}`
  const row = await db.prepare('INSERT INTO cms_rate(bucket,amount,expires) VALUES(?,?,?) ON CONFLICT(bucket) DO UPDATE SET amount=amount+excluded.amount WHERE amount+excluded.amount<=? RETURNING amount').bind(key,amount,(window+1)*seconds,limit).first()
  if (!row || row.amount>limit) fail('CMS_RATE_LIMIT',429)
}
