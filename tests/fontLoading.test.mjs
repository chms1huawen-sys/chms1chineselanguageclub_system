import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('remote font styles cannot block the application stylesheet', () => {
  assert.doesNotMatch(read('src/index.css'), /@import\s+url\(/)
  assert.match(read('index.html'), /<script src="\/font-loader\.js" defer><\/script>/)
  let appended
  let loaded
  vm.runInNewContext(read('public/font-loader.js'), {
    document: {
      createElement: () => ({ addEventListener: (event, callback) => {
        assert.equal(event, 'load')
        loaded = callback
      } }),
      head: { appendChild: link => { appended = link } },
    },
  })
  assert.equal(appended.media, 'print')
  assert.equal(appended.rel, 'stylesheet')
  assert.match(appended.href, /display=swap/)
  loaded()
  assert.equal(appended.media, 'all')
})
