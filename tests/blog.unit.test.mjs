import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { canManageBlog, validDriveLink, safeBlogReturn, defaultBlogSettings } from '../src/utils/blog.js'
import { renderBlogHtml } from '../server/blogSeo.js'
assert.equal(canManageBlog({ role: 'ordinary_member', is_active: true }), false)
assert.equal(canManageBlog({ role: 'media_lead', is_active: true }), true)
assert.equal(canManageBlog({ role: 'chairperson', is_active: false }), false)
assert.equal(validDriveLink('https://drive.google.com.evil.com/drive/folders/a'), false)
assert.equal(validDriveLink('https://drive.google.com/drive/folders/abc?usp=sharing'), true)
assert.equal(safeBlogReturn('//evil.com'), '/')
assert.equal(safeBlogReturn('/blog/abc?x=1'), '/blog/abc?x=1')
assert.equal(safeBlogReturn('/blog-admin'), '/blog-admin')
assert.equal(safeBlogReturn('/#/tasks'), '/')
const template = await readFile(new URL('../index.html', import.meta.url), 'utf8')
const result = renderBlogHtml(template, defaultBlogSettings, [{ slug: 'hello', title: '<script>alert(1)</script>', summary: 'Description', body: 'Hello\n\nWorld', tags: [], drive_url: 'SECRET' }], [], 'hello', 'https://example.com')
assert.ok(result.includes('<p>Hello</p><p>World</p>'))
assert.ok(result.includes('https://example.com/blog/hello'))
assert.ok(result.includes('application/ld+json'))
assert.ok(!result.includes('<script>alert(1)</script>'))
assert.ok(!result.includes('SECRET'))
assert.ok(result.includes('&lt;script&gt;'))
console.log('Blog roles, safe redirects, Drive validation, SSR content, canonical URL and escaping passed.')
