import { validPublicSnapshot } from '../src/utils/publicSnapshot.js'

export function createD1SourceReader(url, request = fetch, now = Date.now) {
  let current, expires = 0
  return {
    async read({force=false} = {}) {
      if (!force && current && now() < expires) return current
      const response = await request(url,{redirect:'error',signal:AbortSignal.timeout(10000)})
      if (!response.ok) throw new Error('D1 publication source unavailable')
      const data = await response.json()
      if (typeof data.active !== 'boolean' || (data.active && !validPublicSnapshot(data.snapshot))) throw new Error('Invalid D1 publication source')
      current = data; expires = now() + 30000
      return data
    },
  }
}
