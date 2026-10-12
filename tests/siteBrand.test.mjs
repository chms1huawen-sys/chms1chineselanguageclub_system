import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderBlogHtml } from '../server/blogSeo.js'
import { publicBlogSettings } from '../src/utils/blogBootstrap.js'
import { SITE_NAME, SITE_SHORT_NAME, MEMBER_NAME } from '../src/utils/siteBrand.js'
import { safeSocialLink } from '../src/utils/socialLink.js'

const template = '<head><title>Old</title></head><div id="root"></div>'
const site = { title: '华文学会', subtitle: '古晋中华第一中学', intro: 'Our stories', content: {} }
const origin = 'https://example.com'

test('edited branding and email reach server-rendered public metadata and footer', () => {
  const edited = { ...site, title: '导航简称', content: { site_name: '完整名称', social_links: [{ platform: 'email', label: 'Gmail', url: 'test@example.com' }] } }
  const html = renderBlogHtml(template, edited, [], [], '', origin)
  assert.ok(html.includes('<title>首页｜完整名称</title>'))
  assert.ok(html.includes('"name":"完整名称","alternateName":"导航简称"'))
  assert.ok(html.includes('href="mailto:test@example.com"'))
  assert.ok(!html.includes('href="mailto:test@example.com" target'))
  assert.equal(publicBlogSettings(edited).content.site_name, '完整名称')
})

test('social email accepts plain addresses and rejects schemes and header injection', () => {
  assert.equal(safeSocialLink('mailto:test@gmail.com', 'email'), 'mailto:test@gmail.com')
  for (const value of ['javascript:alert(1)', 'test@gmail.com?bcc=other@example.com', 'test@gmail.com\r\nBcc:other@example.com', 'not-an-email', 'test@-invalid.com']) assert.equal(safeSocialLink(value, 'email'), '')
  assert.equal(safeSocialLink('test@gmail.com', 'website'), '')
  assert.equal(safeSocialLink('https://example.com', 'website'), 'https://example.com/')
})
test('public pages use canonical titles and sharing name; homepage declares one WebSite', () => {
  for (const [view, label] of Object.entries({ home: '首页', literature: '文学角落', activities: '活动记录', bookroom: '书坊', news: '学会资讯', about: '关于我们' })) {
    const html = renderBlogHtml(template, site, [], [], '', origin, view)
    assert.ok(html.includes(`<title>${label}｜${SITE_NAME}</title>`))
    assert.ok(html.includes(`<meta property="og:site_name" content="${SITE_NAME}">`))
    const nodes = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]))
    const websites = nodes.filter(node => node['@type'] === 'WebSite')
    assert.equal(websites.length, view === 'home' ? 1 : 0)
    if (view === 'home') assert.deepEqual(websites[0], { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE_NAME, alternateName: SITE_SHORT_NAME, url: origin + '/' })
    assert.ok(!html.includes('<title>Old</title>'))
  }
  const html = renderBlogHtml(template, site, [{ title: '作品<&', status: 'published', content_type: 'article', author: 'Writer' }], [], 'story', origin)
  assert.ok(html.includes(`<title>作品&lt;&amp;｜${SITE_NAME}</title>`))
  assert.ok(html.includes('"name":"Writer"'))
  assert.equal(publicBlogSettings(site).title, SITE_SHORT_NAME)
})
test('PWA display names change without changing installation identity or launch routes', () => {
  const read = path => JSON.parse(readFileSync(new URL('../public/' + path, import.meta.url), 'utf8'))
  const member = read('manifest.json')
  assert.equal(member.name, MEMBER_NAME)
  assert.equal(member.short_name, SITE_SHORT_NAME)
  assert.equal(member.id, '/')
  assert.equal(member.start_url, '/member#/')
  assert.equal(member.scope, '/')
  const blog = read('manifest-blog.json')
  assert.equal(blog.name, SITE_NAME)
  assert.equal(blog.start_url, '/?app=blog')
  assert.equal(blog.id, '/?app=blog')
})
