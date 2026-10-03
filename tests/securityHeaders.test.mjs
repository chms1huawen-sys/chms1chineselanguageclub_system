import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('security headers apply before all routes without intercepting assets', () => {
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url)))
  const rule = config.routes[0]
  assert.equal(rule.continue, true)
  for (const path of ['/', '/blog-admin', '/api/blog', '/assets/test.js', '/firebase-messaging-sw.js']) assert.ok(new RegExp(rule.src).test(path))
  assert.equal(rule.headers['X-Frame-Options'], 'DENY')
  assert.equal(rule.headers['X-Content-Type-Options'], 'nosniff')
  const csp = rule.headers['Content-Security-Policy']
  assert.ok(csp.includes("frame-ancestors 'none'"))
  assert.ok(csp.includes("object-src 'none'"))
  assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"))
  assert.ok(!csp.includes('unsafe-eval'))
  assert.ok(csp.includes('https://www.gstatic.com'))
  assert.ok(csp.includes('wss://*.supabase.co'))
})
