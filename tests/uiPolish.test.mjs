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
