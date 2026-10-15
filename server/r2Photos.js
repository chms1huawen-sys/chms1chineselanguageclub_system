import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

export const PHOTO_URL_SECONDS = 300
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
const mimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
export const photoKey = (bucket, path) => `photos-v1/${bucket}/${path}`

export function validPhotoTarget(bucket, path) {
  return ['blog-photos', 'blog-site-media'].includes(bucket) && typeof path === 'string' && path.length <= 500 &&
    /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_./-]+\.(?:jpe?g|png|webp|avif)$/i.test(path) &&
    !path.split('/').some(part => !part || part === '.' || part === '..')
}

export function r2PhotoConfig(env) {
  if (env.R2_PHOTOS_DISABLED === 'true') return null
  const { R2_ENDPOINT: endpoint, R2_BUCKET_NAME: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = env
  if (![endpoint, bucket, accessKeyId, secretAccessKey].every(value => typeof value === 'string' && value.trim())) return null
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || !/^[a-f0-9]{32}(?:\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/.test(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Invalid R2 photo configuration')
  return { endpoint: url.origin, bucket, accessKeyId, secretAccessKey }
}

async function boundedBytes(response, max = MAX_PHOTO_BYTES) {
  if (!response.ok || !response.body || Number(response.headers.get('content-length')) > max) {
    await response.body?.cancel()
    throw new Error('Source image unavailable or too large')
  }
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > max) { await reader.cancel(); throw new Error('Image limit exceeded') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  if (!size) throw new Error('Empty image')
  return Buffer.concat(chunks, size)
}

// The caller must authorize the source before consulting R2, even on a cache hit.
export function createPhotoMirror({ head, get, put, verified, markVerified, sign, fetchSource = fetch }) {
  const pending = new Map()
  return async ({ bucket, path, sourceUrl, headOnly = false }) => {
    if (!validPhotoTarget(bucket, path)) throw new Error('Invalid image target')
    const key = photoKey(bucket, path)
    async function prepare() {
      let existing
      try { existing = await head(key) }
      catch (error) { if (error?.$metadata?.httpStatusCode !== 404 && error?.name !== 'NotFound' && error?.name !== 'NoSuchKey') throw error }
      if (existing) {
        if (!/^[a-f0-9]{64}$/.test(existing.Metadata?.sha256 || '') || !mimeTypes.has(existing.ContentType) ||
            !Number.isSafeInteger(existing.ContentLength) || existing.ContentLength <= 0 || existing.ContentLength > MAX_PHOTO_BYTES) throw new Error('Unverified destination; refusing overwrite')
        if (await verified(key, existing.Metadata.sha256)) return { sha256: existing.Metadata.sha256, bytes: existing.ContentLength, contentType: existing.ContentType }
      }
      if (headOnly) throw new Error('Destination not yet copied')
      const response = await fetchSource(sourceUrl, { signal: AbortSignal.timeout(12000), redirect: 'error' })
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      if (!mimeTypes.has(contentType)) { await response.body?.cancel(); throw new Error('Unsupported source image') }
      const bytes = await boundedBytes(response)
      const sha256 = digest(bytes)
      if (existing) {
        if (existing.Metadata.sha256 !== sha256 || existing.ContentLength !== bytes.length || existing.ContentType !== contentType) throw new Error('Destination differs from source; refusing overwrite')
      } else {
        try {
          await put(key, bytes, contentType, sha256)
        } catch (error) {
          // Another instance may have won the conditional write. Verify it below.
          if (error?.$metadata?.httpStatusCode !== 412) throw error
        }
      }
      const destination = await get(key)
      const copy = await boundedBytes(destination)
      if (copy.length !== bytes.length || digest(copy) !== sha256 ||
          (destination.headers.get('content-type') || '').split(';')[0] !== contentType) throw new Error('Destination checksum mismatch')
      await markVerified(key, sha256)
      if (!await verified(key, sha256)) throw new Error('Verification marker mismatch')
      return { sha256, bytes: bytes.length, contentType }
    }
    // HEAD must not create an in-flight entry that prevents a concurrent GET copy.
    let verification
    if (headOnly) verification = await prepare()
    else {
      if (!pending.has(key)) {
        const task = prepare().finally(() => pending.delete(key))
        pending.set(key, task)
      }
      verification = await pending.get(key)
    }
    return { signedUrl: await sign(key), ...verification }
  }
}

export function s3PhotoMirror(config) {
  const client = new S3Client({
    region: 'auto', endpoint: config.endpoint,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    maxAttempts: 1, requestHandler: { connectionTimeout: 1000, requestTimeout: 2500 },
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
  })
  const target = key => ({ Bucket: config.bucket, Key: key })
  return createPhotoMirror({
    head: key => client.send(new HeadObjectCommand(target(key))),
    get: async key => {
      const object = await client.send(new GetObjectCommand(target(key)))
      return new Response(object.Body.transformToWebStream(), { headers: { 'content-type': object.ContentType, 'content-length': String(object.ContentLength) } })
    },
    put: (key, bytes, contentType, sha256) => client.send(new PutObjectCommand({
      ...target(key), Body: bytes, ContentLength: bytes.length, ContentType: contentType,
      CacheControl: 'private, max-age=240', Metadata: { sha256 }, IfNoneMatch: '*',
    })),
    verified: async (key, sha256) => {
      try {
        const marker = await client.send(new HeadObjectCommand(target(`${key}.verified`)))
        return marker.ContentLength === 0 && marker.Metadata?.sha256 === sha256
      } catch (error) {
        if (error?.$metadata?.httpStatusCode === 404 || error?.name === 'NotFound') return false
        throw error
      }
    },
    markVerified: async (key, sha256) => {
      try {
        await client.send(new PutObjectCommand({ ...target(`${key}.verified`), Body: new Uint8Array(), ContentLength: 0, Metadata: { sha256 }, IfNoneMatch: '*' }))
      } catch (error) { if (error?.$metadata?.httpStatusCode !== 412) throw error }
    },
    sign: key => getSignedUrl(client, new GetObjectCommand(target(key)), { expiresIn: PHOTO_URL_SECONDS }),
  })
}
