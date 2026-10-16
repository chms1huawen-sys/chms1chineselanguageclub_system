import { validPublicSnapshot } from './publicSnapshot.js'

export function createPublicSnapshotReader(request = fetch, now = Date.now) {
  let cached
  let expires = 0
  let pending
  return async () => {
    if (cached && now() < expires) return cached
    if (!pending) pending = request('/api/blog-public', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Public snapshot unavailable')
      const data = await response.json()
      if (!validPublicSnapshot(data)) throw new Error('Invalid public snapshot')
      cached = data
      expires = now() + 30000
      return data
    }).finally(() => { pending = null })
    return pending
  }
}

export const readPublicSnapshot = createPublicSnapshotReader()

export async function syncPublicSnapshot(db, request = fetch) {
  const result = await db.auth.getSession()
  const token = result.data?.session?.access_token
  if (!token) throw new Error('PUBLIC_SYNC_LOGIN_REQUIRED')
  const response = await request('/api/blog-public', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new Error('PUBLIC_SYNC_FAILED')
}
