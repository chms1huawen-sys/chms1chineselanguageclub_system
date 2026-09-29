import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { richBody, plainDocument, photoWidth, galleryPreview } from '../src/utils/blogRichText.js'
import { cropStyles } from '../src/utils/photoCrop.js'
import { publicationYear, matchesPublicSearch } from '../src/utils/blogPresentation.js'

assert.equal(renderToStaticMarkup(richBody(null, '<img onerror=evil>')), '<div><p>&lt;img onerror=evil&gt;</p></div>')
assert.equal(renderToStaticMarkup(richBody({ type: 'doc', content: [{ type: 'paragraph' }, { type: 'paragraph', content: [] }] })), '<div><p><br/></p><p><br/></p></div>')
assert.equal(renderToStaticMarkup(richBody(null, 'First\r\nSecond\r\n\r\n\r\n\r\n  Third')), '<div><p>First<br/>Second</p><p><br/></p><p>  Third</p></div>')
assert.equal(renderToStaticMarkup(richBody(null, 'First\n')), '<div><p>First<br/><br/></p></div>')
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
const book = { title: 'Book', content_year: 1999, event_date: '2000-01-01', published_at: '2026-12-31T17:00:00Z', book_details: { published_on: '1980-01-01' }, author: 'Test Writer' }
assert.equal(publicationYear(book), '2027')
assert.equal(matchesPublicSearch(book, '2027'), true)
assert.equal(matchesPublicSearch(book, '1999'), false)
assert.equal(matchesPublicSearch(book, '1980'), false)
assert.equal(matchesPublicSearch(book, 'Test Writer'), true)
assert.equal(publicationYear({ content_year: 2026 }), '')
assert.equal(cropStyles({ x: -1 }), null)
const cropped = cropStyles({ x: 10, y: 20, width: 50, height: 50, naturalWidth: 1200, naturalHeight: 800 })
assert.equal(cropped.image.width, '200%')
assert.equal(cropped.image.left, '-20%')
const photos = Array.from({ length: 37 }, (_, i) => ({ path: String(i) }))
assert.equal(galleryPreview(photos, '0').remaining, 32)
assert.deepEqual(galleryPreview(photos, '0').photos.map(p => p.index), [1, 2, 3, 4])
console.log('Safe rich-text rendering, legacy text, size limits and gallery counts passed.')
