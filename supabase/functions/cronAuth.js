export function authorizeCronRequest(request, serviceKey, cronSecret) {
  if (request.method !== 'POST') return 405
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (serviceKey && bearer === serviceKey) return 200
  if (cronSecret && request.headers.get('x-cron-secret') === cronSecret) return 200
  return 401
}
