import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
function luminance(hex) {
  const values = hex.match(/\w\w/g).map(value => parseInt(value, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return values[0] * .2126 + values[1] * .7152 + values[2] * .0722
}
test('club text contrasts with the retained pastel action colors', () => {
  for (const background of ['95cbff', 'ffb3c6', 'f0f7ff']) {
    assert.ok((luminance(background) + .05) / (luminance('244c67') + .05) >= 4.5)
  }
})
test('shared UI targets and reduced-motion rules remain present', () => {
  const member = read('src/pages/MemberUi.css')
  const publicCss = read('src/pages/BlogUi.css')
  const studio = read('src/pages/BlogStudio.css')
  assert.match(member, /button \{ min-height: 44px; min-width: 44px/)
  assert.match(member, /:focus-visible/)
  assert.match(member, /prefers-reduced-motion/)
  assert.match(publicCss, /blog-showcase-dots button:last-child \{ width: 44px; height: 44px/)
  assert.match(studio, /blog-editor-toolbar button\{width:44px/)
})
test('calendar and committee navigation support keyboard input', () => {
  assert.match(read('src/pages/CalendarPage.jsx'), /<button\s+type="button"\s+key=\{`day-/)
  const committees = read('src/pages/Committees.jsx')
  assert.match(committees, /role="button"\s+tabIndex=\{0\}/)
  assert.match(committees, /event.key === 'Enter' \|\| event.key === ' '/)
})
test('Hero retains hover, waits for requested photos and uses a bounded preload', () => {
  const hero = read('src/components/BlogHero.jsx')
  assert.match(hero, /ready.current.has\(photoKey/)
  assert.match(hero, /i === \(active \+ 1\) % slides.length/)
  assert.match(read('src/pages/BlogHeroReference.css'), /hover: hover/)
  assert.match(read('src/pages/BlogHeroReference.css'), /focus-within/)
})

test('remaining small text and selected states use readable foregrounds', () => {
  const tokens = read('src/uiTokens.css')
  const color = name => tokens.match(new RegExp(`--club-${name}:\\s*#([0-9a-f]{6})`, 'i'))[1]
  const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
  for (const background of ['ffffff', 'f0f7ff', 'fff7fb']) {
    assert.ok(contrast(color('focus'), background) >= 4.5)
    assert.ok(contrast(color('muted'), background) >= 4.5)
  }
  assert.ok(contrast('70243e', 'ffb3c6') >= 4.5)
  assert.ok(contrast('166534', 'dcfce7') >= 4.5)
  const dashboard = read('src/pages/Dashboard.jsx')
  assert.doesNotMatch(dashboard, /color: '#(?:6db8ff|9ca3af)'/)
  assert.match(read('src/pages/Tasks.jsx'), /aria-pressed=\{isChecked\}/)
  assert.match(read('src/pages/Tasks.jsx'), /color: isChecked \? 'var\(--club-ink\)'/)
  assert.match(read('src/pages/MemberShell.jsx'), /background: '#FFB3C6', color: '#70243e'/)
})

test('admin actions and download links retain touch targets and success stays still', () => {
  assert.match(read('src/pages/BlogStudio.css'), /\.bs-layout button\{[^}]*min-height:44px;min-width:44px/)
  const publicCss = read('src/pages/BlogUi.css')
  assert.match(publicCss, /\.blog-public \.blog-download a \{ min-height: 44px/)
  assert.match(publicCss, /\.blog-home \.blog-showcase-dots \{ max-width: calc\(100% - 16px\)/)
  const success = read('src/pages/Settings.jsx').split('{pwSuccess && (')[1].split('{pwError && (')[0]
  assert.match(success, /role="status"/)
  assert.doesNotMatch(success, /animate-pulse/)
})
