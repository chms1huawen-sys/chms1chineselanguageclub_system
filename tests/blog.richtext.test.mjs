import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { richBody, plainDocument, photoWidth, galleryPreview } from '../src/utils/blogRichText.js'
import { cropStyles } from '../src/utils/photoCrop.js'

assert.equal(renderToStaticMarkup(richBody(null, '<img onerror=evil>')), '<div><p>&lt;img onerror=evil&gt;</p></div>')
const doc = plainDocument('Sample')
doc.content[0].attrs = { textAlign: 'center', onclick: 'evil()' }
doc.content[0].content[0].marks = [{ type: 'bold' }, { type: 'link', attrs: { href: 'javascript:alert(1)' } }, { type: 'textStyle', attrs: { color: 'red;display:none' } }]
const html = renderToStaticMarkup(richBody(doc))
assert.ok(html.includes('<strong>Sample</strong>'))
assert.ok(html.includes('text-align:center'))
assert.ok(!/javascript|onclick|display:none/.test(html))
assert.equal(renderToStaticMarkup(richBody({ type: 'doc', content: [{ type: 'script', content: [{ type: 'text', text: 'evil' }] }] })), '<div></div>')
assert.equal(photoWidth(999), 100)
assert.equal(photoWidth(-9), 25)
assert.equal(cropStyles({ x: -1 }), null)
const cropped = cropStyles({ x: 10, y: 20, width: 50, height: 50, naturalWidth: 1200, naturalHeight: 800 })
assert.equal(cropped.image.width, '200%')
assert.equal(cropped.image.left, '-20%')
const photos = Array.from({ length: 37 }, (_, i) => ({ path: String(i) }))
assert.equal(galleryPreview(photos, '0').remaining, 31)
assert.deepEqual(galleryPreview(photos, '0').photos.map(p => p.index), [1, 2, 3, 4, 5])
console.log('Safe rich-text rendering, legacy text, size limits and gallery counts passed.')
