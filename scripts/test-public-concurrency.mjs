import process from 'node:process'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ORIGIN = 'https://chms1clc-public-preview.chms1chineselanguageclub-system.workers.dev'
const PATHS = ['/', '/literature', '/activities', '/bookroom', '/news', '/about', '/api/blog-public', '/blog/story-2026-1bcc3918']
const BUDGET = 50 * 1024 * 1024
const BODY_LIMIT = 512 * 1024
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null
const summarize = rows => ({ requests: rows.length, successful: rows.filter(row => row.status === 200 && !row.error).length,
  bytes: rows.reduce((sum, row) => sum + row.bytes, 0), p50Ms: percentile(rows.map(row => row.ms), 0.5),
  p95Ms: percentile(rows.map(row => row.ms), 0.95), maxMs: Math.max(0, ...rows.map(row => row.ms)) })

export async function testPublicConcurrency({ request = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), batches = 20, progress = () => {} } = {}) {
  if (!Number.isInteger(batches) || batches < 1 || batches > 20) throw new Error('Invalid bounded test size')
  const startedAt = new Date().toISOString()
  const controller = new AbortController()
  const rows = []
  const stages = []
  let sent = 0
  let bytes = 0
  let reserved = 0
  let active = 0
  let peakConcurrency = 0
  let slow = 0
  let stopped = null
  function stop(reason) { if (!stopped) { stopped = reason; controller.abort() } }
  async function read(concurrency) {
    if (stopped) return
    if (sent >= 480 || bytes + reserved + BODY_LIMIT > BUDGET) { stop('request-or-download-budget'); return }
    const path = PATHS[sent % PATHS.length]
    sent++
    reserved += BODY_LIMIT
    peakConcurrency = Math.max(peakConcurrency, ++active)
    const start = performance.now()
    const row = { concurrency, path, status: null, bytes: 0, ms: 0 }
    try {
      const response = await request(ORIGIN + path, { method: 'GET', redirect: 'manual', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]) })
      row.status = response.status
      if (response.status !== 200 || !response.headers.get('x-public-preview-version')) {
        await response.body?.cancel()
        stop('unexpected-response-' + response.status)
      } else if (response.body) {
        for await (const chunk of response.body) {
          if (row.bytes + chunk.byteLength > BODY_LIMIT) { stop('response-size-limit'); break }
          row.bytes += chunk.byteLength
        }
      }
    } catch (error) {
      row.error = controller.signal.aborted ? 'cancelled-after-stop' : error.name
      if (!controller.signal.aborted) stop('network-error-or-timeout')
    } finally {
      row.ms = Math.round(performance.now() - start)
      bytes += row.bytes
      reserved -= BODY_LIMIT
      active--
      rows.push(row)
      slow = row.ms > 3000 ? slow + 1 : 0
      if (slow >= 3) stop('three-slow-responses-over-3000ms')
    }
  }
  for (const concurrency of [1, 2, 5]) {
    const stageStart = rows.length
    for (let batch = 0; batch < batches && !stopped; batch++) {
      const start = performance.now()
      await Promise.all(Array.from({ length: concurrency }, () => read(concurrency)))
      if (!stopped && batch < batches - 1) await sleep(Math.max(0, 1000 - (performance.now() - start)))
    }
    const stage = { concurrency, ...summarize(rows.slice(stageStart)) }
    stages.push(stage)
    progress(stage)
    if (stopped) break
  }
  return { startedAt, finishedAt: new Date().toISOString(), origin: ORIGIN, kind: 'bounded-http-concurrency-not-browser-load',
    limits: { requests: 480, maximumConcurrency: 5, decodedBytes: BUDGET, responseBytes: BODY_LIMIT, timeoutMs: 8000 },
    stopped, peakConcurrency, ...summarize(rows), stages, rows }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length !== 4 || process.argv[2] !== '--run-approved-read-only-test') throw new Error('Use --run-approved-read-only-test NEW_REPORT_FILE')
  const report = await testPublicConcurrency({ progress: stage => console.log(JSON.stringify({ stage })) })
  await writeFile(resolve(process.argv[3]), JSON.stringify(report, null, 2), { flag: 'wx' })
  console.log(JSON.stringify({ ...report, rows: undefined }))
  if (report.stopped) process.exitCode = 1
}
