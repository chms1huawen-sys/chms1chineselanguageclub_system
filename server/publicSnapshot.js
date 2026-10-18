import process from 'node:process'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { waitUntil } from '@vercel/functions'
import { r2PhotoConfig } from './r2Photos.js'
import { makePublicSnapshot, validPublicSnapshot } from '../src/utils/publicSnapshot.js'
import { publishedPreview } from './publicPreview.js'
import { PUBLIC_ORIGIN } from '../src/utils/siteOrigins.js'
import { createD1SourceReader } from './publicD1Source.js'

export const SNAPSHOT_KEY = 'public-site/v1/current.json'
export const MAX_SNAPSHOT_BYTES = 3 * 1024 * 1024
const CHECK_MS = 60000
const REBUILD_MS = 60 * 60000
const missing = error => error?.$metadata?.httpStatusCode === 404 || error?.name === 'NoSuchKey'

export function snapshotStore(config, preview = snapshot => publishedPreview(snapshot, process.env), transport) {
  const client = transport || new S3Client({ region: 'auto', endpoint: config.endpoint, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey }, maxAttempts: 1, requestHandler: { connectionTimeout: 1000, requestTimeout: 5000 }, requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED' })
  const target = { Bucket: config.bucket, Key: SNAPSHOT_KEY }
  return {
    async read() {
      try {
        const object = await client.send(new GetObjectCommand(target))
        if (!object.ContentLength || object.ContentLength > MAX_SNAPSHOT_BYTES) { object.Body.destroy?.(); throw new Error('Invalid public snapshot size') }
        const text = await object.Body.transformToString()
        if (Buffer.byteLength(text) > MAX_SNAPSHOT_BYTES || createHash('sha256').update(text).digest('hex') !== object.Metadata?.sha256) throw new Error('Public snapshot checksum failed')
        const snapshot = JSON.parse(text)
        delete snapshot.publicPreview
        if (!validPublicSnapshot(snapshot)) throw new Error('Invalid public snapshot')
        return { snapshot, etag: object.ETag }
      } catch (error) { if (missing(error)) return null; throw error }
    },
    async write(snapshot, etag) {
      if (!validPublicSnapshot(snapshot)) throw new Error('Refusing invalid public snapshot')
      const body = JSON.stringify({ ...snapshot, publicPreview: await preview(snapshot) })
      if (Buffer.byteLength(body) > MAX_SNAPSHOT_BYTES) throw new Error('Public snapshot too large; split the export before publishing')
      await client.send(new PutObjectCommand({ ...target, Body: body, ContentType: 'application/json', CacheControl: 'no-store', Metadata: { sha256: createHash('sha256').update(body).digest('hex') }, ...(etag ? { IfMatch: etag } : { IfNoneMatch: '*' }) }))
    },
  }
}

async function rows(makeQuery) {
  const output = []
  for (let start = 0; start < 10000; start += 500) {
    const result = await makeQuery().range(start, start + 499)
    if (result.error) throw new Error('Public export source unavailable')
    output.push(...result.data)
    if (result.data.length < 500) return output
  }
  throw new Error('Public export row limit exceeded')
}

export function snapshotSource(env, client = createClient, request = fetch) {
  const db = client(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const d1 = createD1SourceReader(env.BLOG_CMS_SOURCE_URL || PUBLIC_ORIGIN + '/api/blog-source',request)
  return {
    async checkDue(current) {
      const migrated = await d1.read()
      if (migrated.active) return migrated.revision !== current.cmsRevision
      const result = await db.rpc('blog_publish_due')
      if (result.error) throw new Error('Scheduled publishing unavailable')
      if (Number(result.data) > 0) return true
      if (!current) return false
      // A previous publish may have committed in Postgres before its R2 write failed.
      const revision = await db.from('blog_posts').select('updated_at,published_at', { count: 'exact' }).eq('status', 'published').is('deleted_at', null).order('updated_at', { ascending: false }).limit(1)
      if (revision.error || !Number.isSafeInteger(revision.count)) throw new Error('Public revision unavailable')
      return revision.count !== current.posts.length || (revision.data || []).some(row => Math.max(Date.parse(row.updated_at) || 0, Date.parse(row.published_at) || 0) > Date.parse(current.generatedAt))
    },
    async build(now) {
      const migrated = await d1.read({force:true})
      if (migrated.active) return { ...migrated.snapshot, cmsRevision:migrated.revision, generatedAt: new Date(now).toISOString(), checkedAt: new Date(now).toISOString() }
      const [site, posts, media, links, categories, tags] = await Promise.all([
        db.from('blog_settings').select('*').eq('id', 1).single(),
        rows(() => db.from('blog_posts').select('*').eq('status', 'published').order('published_at', { ascending: false }).order('id')),
        rows(() => db.from('blog_media').select('id,post_id,path,display_path,caption,crop,width_percent,position').order('id')),
        rows(() => db.from('blog_links').select('post_id,label,url,type,visibility,position').eq('visibility', 'public').order('id')),
        rows(() => db.from('blog_categories').select('*').order('id')),
        rows(() => db.from('blog_tags').select('*').order('id')),
      ])
      if (site.error) throw new Error('Public settings unavailable')
      return makePublicSnapshot({ settings: site.data, posts, media, links, categories, tags }, now)
    },
  }
}

export function createSnapshotService({ store, source, now = Date.now, defer = task => { task.catch(() => {}) } }) {
  let cached
  let pending
  let retryAfter = 0
  let cacheUntil = 0
  async function update(force) {
    let current
    try {
      current = await store.read()
      if (!force && current && now() - Date.parse(current.snapshot.checkedAt) < CHECK_MS) return current.snapshot
      for (let attempt = 0; attempt < 2; attempt++) {
        const changed = !force && current ? await source.checkDue(current.snapshot) : false
        const snapshot = force || !current || changed || now() - Date.parse(current.snapshot.generatedAt) >= REBUILD_MS
          ? await source.build(now()) : { ...current.snapshot, checkedAt: new Date(now()).toISOString() }
        try {
          await store.write(snapshot, current?.etag)
          return snapshot
        } catch (error) {
          if (error?.$metadata?.httpStatusCode !== 412) throw error
          current = await store.read()
          if (!force && current) return current.snapshot
        }
      }
      throw new Error('Concurrent public publishing; retry synchronization')
    } catch (error) {
      retryAfter = now() + CHECK_MS
      if (!force && (current?.snapshot || cached)) return current?.snapshot || cached
      throw error
    }
  }
  return {
    async get({ force = false, refresh = false } = {}) {
      if (!force && !refresh && cached && now() < cacheUntil) return cached
      if (!force && !refresh && !cached) {
        const current = await store.read()
        if (current) { cached = current.snapshot; cacheUntil = now() + 30000 }
      }
      if (!force && !refresh && cached) {
        cacheUntil = now() + 30000
        if (!pending && now() >= retryAfter) {
          const task = update(false).then(value => { cached = value; return value }).finally(() => { if (pending === task) pending = null })
          pending = task
          defer(task.catch(() => {}))
        }
        return cached
      }
      if (pending && !force) return pending
      const task = update(force).then(value => { cached = value; return value }).finally(() => { if (pending === task) pending = null })
      pending = task
      return task
    },
  }
}

let service
export function getPublicSnapshot(options) {
  if (process.env.PUBLIC_SITE_DISABLED === 'true') return Promise.reject(new Error('Public snapshots disabled'))
  if (!service) {
    const config = r2PhotoConfig(process.env)
    if (!config) return Promise.reject(new Error('Public snapshot storage not configured'))
    service = createSnapshotService({ store: snapshotStore(config), source: snapshotSource(process.env), defer: waitUntil })
  }
  return service.get(options)
}
