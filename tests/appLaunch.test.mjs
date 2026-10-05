import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const script = read('public/app-launch.js')

function launch(path, installed = false) {
  const attributes = new Map()
  runInNewContext(script, {
    URL,
    window: { location: { href: 'https://club.example' + path }, history: { replaceState() {} }, navigator: {}, matchMedia: () => ({ matches: installed }) },
    document: { documentElement: { setAttribute: (name, value) => attributes.set(name, value) } },
  })
  return attributes.has('data-member-launch')
}

test('member deep links hide public SSR before application startup', () => {
  for (const path of ['/#/login', '/#/members', '/#/login?return=%2Fliterature', '/blog/story#/login']) assert.equal(launch(path), true)
})

test('public SEO pages stay visible and explicit blog installs stay public', () => {
  for (const path of ['/', '/literature', '/blog/story', '/?view=blog', '/?app=blog']) assert.equal(launch(path), false)
  assert.equal(launch('/', true), true)
  assert.equal(launch('/?app=blog', true), false)
  assert.equal(launch('/literature', true), false)
})

test('launch guard precedes server-rendered root and loading uses a light surface', () => {
  const template = read('index.html')
  assert.ok(template.indexOf('src="/app-launch.js"') < template.indexOf('<body>'))
  assert.ok(template.includes('html[data-member-launch] #root > .club-blog { display: none; }'))
  assert.ok(!template.includes('bg-[#0b0f19]'))
  const app = read('src/App.jsx')
  assert.ok(app.includes("document.documentElement.removeAttribute('data-member-launch')"))
  assert.ok(app.includes('fallback={<PageLoading lang={lang} fullPage />}'))
  const css = read('src/index.css')
  assert.ok(css.includes('background-color: #f0f7ff;'))
  assert.ok(css.includes('.page-loading-full { min-height: 100svh; }'))
  assert.ok(css.includes('.page-loading-icon { animation: none; }'))
})
