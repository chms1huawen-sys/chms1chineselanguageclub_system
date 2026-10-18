import { supabase } from '../supabaseClient'
import { PUBLIC_ORIGIN } from './siteOrigins.js'
import { secureUpload } from './secureUpload'
import { isDirectR2Photo } from './r2Asset.js'

let provider
export async function cmsRequest(command, { file, bucket, owner } = {}) {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error('LOGIN_REQUIRED')
  const response = await fetch(PUBLIC_ORIGIN + '/api/blog-admin' + (file ? '/upload' : ''), {
    method: 'POST', cache: 'no-store',
    headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': file?.type || 'application/json', ...(file ? { 'x-upload-bucket': bucket, 'x-upload-owner': owner } : {}) },
    body: file || JSON.stringify(command),
  })
  if (!response.ok) {
    const result = await response.json().catch(() => ({}))
    const message = response.status === 429 ? '操作或上传较多，请稍后再试。 / Too many requests or uploads. Please retry later.' : result.error || 'CMS_UNAVAILABLE'
    throw Object.assign(new Error(message), { status: response.status })
  }
  return response
}
export async function cmsIsActive() {
  provider ||= cmsRequest({ action: 'status' }).then(response => response.json()).then(data => data.active).catch(error => { provider = undefined; throw error })
  const active = await provider
  if (!active) provider = undefined
  return active
}
class CmsQuery {
  constructor(table) { this.command = { table, action: 'select', filters: [], orders: [] }; this.calls = [] }
  call(name, ...args) { this.calls.push([name,args]); return this }
  select(columns='*') { this.command.columns = columns; return this.call('select',columns) }
  eq(column,value) { this.command.filters.push({column,value}); return this.call('eq',column,value) }
  order(column,options={}) { this.command.orders.push({column,ascending:options.ascending!==false}); return this.call('order',column,options) }
  range(start,end) { Object.assign(this.command,{start,end}); return this.call('range',start,end) }
  single() { this.command.single='one'; return this.call('single') }
  maybeSingle() { this.command.single='maybe'; return this.call('maybeSingle') }
  insert(values) { Object.assign(this.command,{action:'insert',values}); return this.call('insert',values) }
  update(values) { Object.assign(this.command,{action:'update',values}); return this.call('update',values) }
  upsert(values,options={}) { Object.assign(this.command,{action:'upsert',values,ignoreDuplicates:!!options.ignoreDuplicates}); return this.call('upsert',values,options) }
  delete() { this.command.action='delete'; return this.call('delete') }
  then(resolve,reject) {
    this.pending ||= (async () => {
      if (!await cmsIsActive()) {
        let query = supabase.from(this.command.table)
        for (const [name,args] of this.calls) query = query[name](...args)
        return await query
      }
      return await (await cmsRequest(this.command)).json()
    })().catch(error => ({data:null,error}))
    return this.pending.then(resolve,reject)
  }
}
export const blogData = {
  from: table => new CmsQuery(table),
  async rpc(rpc,args) {
    try {
      if (!await cmsIsActive()) return await supabase.rpc(rpc,args)
      return await (await cmsRequest({rpc,args})).json()
    } catch(error) { return {data:null,error} }
  },
}
export async function uploadBlogAsset(bucket,path,file) {
  try {
    if (!await cmsIsActive()) return await secureUpload(bucket,path,file)
    const response = await cmsRequest(null,{file,bucket,owner:path.split('/')[0]})
    return await response.json()
  } catch(error) { return {data:null,error} }
}
export async function privateR2Image(bucket,path) {
  const response = await cmsRequest({action:'image',bucket,path})
  return {data:{signedUrl:URL.createObjectURL(await response.blob())}}
}
export async function memberBlogExtras(postId) {
  const {data,error} = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error('LOGIN_REQUIRED')
  const response = await fetch(PUBLIC_ORIGIN+'/api/blog-member',{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({postId})})
  if (!response.ok) throw new Error('MEMBER_CONTENT_UNAVAILABLE')
  const result = await response.json()
  if (result.active) return result
  const [links,download] = await Promise.all([
    supabase.from('blog_links').select('*').eq('post_id',postId).eq('visibility','member').order('position'),
    supabase.from('blog_downloads').select('drive_url').eq('post_id',postId).maybeSingle(),
  ])
  if (links.error || download.error) throw new Error('MEMBER_CONTENT_UNAVAILABLE')
  return {links:links.data||[],drive_url:download.data?.drive_url||null}
}
export async function removeBlogFiles(paths) {
  const unique = [...new Set(paths.filter(Boolean))]
  const direct = unique.filter(isDirectR2Photo), legacy = unique.filter(path => !isDirectR2Photo(path))
  if (direct.length) await cmsRequest({action:'removeImages',paths:direct})
  if (legacy.length) {
    const result = await supabase.storage.from('blog-photos').remove(legacy)
    if (result.error) throw result.error
  }
}
