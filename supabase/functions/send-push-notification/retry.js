export async function fetchWithRetry(url, options, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; ; attempt++) {
    // A network timeout may happen after acceptance. Do not automatically resend ambiguous requests.
    const response = await fetcher(url, options)
    if (attempt >= 2 || ![429, 500, 502, 503, 504].includes(response.status)) return response
    const retryAfter = response.headers.get('retry-after')
    const requestedDelay = retryAfter == null ? 0 : /^\d+$/.test(retryAfter)
      ? Number(retryAfter) * 1000 : Math.max(0, Date.parse(retryAfter) - Date.now())
    const delay = Math.max(1000 * 2 ** attempt, requestedDelay || 0)
    if (delay > 5000) return response
    await response.body?.cancel()
    await sleep(delay)
  }
}
