import assert from 'node:assert/strict'
import { clubStatistics, heroSlides, matchesPublicSearch, heroImageLayout } from '../src/utils/blogPresentation.js'
import { renderBlogHtml } from '../server/blogSeo.js'

const site = { title: 'Club', intro: 'Short introduction', about: 'Full history', hero_path: '/original.jpeg', content: {
  hero_title: 'Original introduction', hero_subtitle: 'Original subtitle', hero_cta: 'Explore', hero_link: '/about',
  about_notes: 'Brief story', hero_slides: [{ path: '/second.jpeg', title: 'Second', link: '/news' }],
  stats_start_year: '1975', stats_members: '42', stats_posts_label: 'Stories',
} }
assert.equal(heroSlides(site).length, 2)
assert.equal(heroSlides(site)[0].path, '/original.jpeg')
assert.equal(heroSlides(site)[0].title, 'Original introduction')
assert.equal(heroSlides(site)[1].cta, 'Explore')
const mobileCrop = { x: 10, y: 0, width: 70, height: 100 }
const configured = { ...site, content: { ...site.content, hero_position: 'right', hero_tone: 'dark', hero_mobile_crop: mobileCrop } }
assert.equal(heroSlides(configured)[0].position, 'right')
assert.equal(heroSlides(configured)[0].tone, 'dark')
assert.deepEqual(heroSlides(configured)[0].mobile_crop, mobileCrop)
assert.equal(heroSlides(site)[0].position, 'left')
assert.equal(heroSlides(site)[0].tone, 'light')
assert.ok(renderBlogHtml('<head></head><div id="root"></div>', configured, [], [], '', 'https://example.com').includes('data-position="right" data-tone="dark"'))
assert.equal(heroSlides({ ...site, content: { ...site.content, hero_default_enabled: false } }).length, 1)
assert.equal(heroSlides({ ...site, content: { hero_default_enabled: false } }).length, 1)
const stats = clubStatistics(site.content, 12, false, 2026)
assert.equal(stats[0].value, 12)
assert.equal(stats[0].label, 'Stories')
assert.equal(stats[1].value, 42)
assert.equal(stats[2].value, 51)
assert.equal(stats[2].range, '1975–2026')
assert.equal(clubStatistics(site.content, 12, false, 2027)[2].value, 52)
assert.equal(clubStatistics({ stats_start_year: 2027, stats_end_year: 2026 }, 0)[2].value, '—')
assert.equal(matchesPublicSearch({ title: 'Book', book_details: { author: 'Writer', isbn: '123' } }, 'writer 123'), true)
assert.equal(matchesPublicSearch({ body: 'Special story' }, 'special'), true)
assert.equal(matchesPublicSearch({ title: 'Other' }, 'special'), false)
for (const [w,h,bw,bh] of [[1280,960,1100,480], [1800,900,1100,480], [600,1200,1100,480], [192,192,1100,480], [600,1200,358,370]]) {
  const result = heroImageLayout(w,h,bw,bh)
  assert.ok(result.scale <= 1.1)
  assert.equal(result.width / result.height, w / h)
  if (result.mode === 'contain') assert.ok(result.width <= bw + .01 && result.height <= bh + .01)
}
assert.equal(heroImageLayout(1800,900,1100,480).mode, 'cover')
assert.equal(heroImageLayout(1280,960,1100,480).mode, 'contain')
assert.equal(heroImageLayout(1800,900,1100,480,'contain').mode, 'contain')
assert.equal(heroImageLayout(0,0,1100,480), null)
const html = '<head><title>Old</title></head><div id="root"></div>'
const home = renderBlogHtml(html, site, [], [], '', 'https://example.com')
const allContent = renderBlogHtml(html, site, [], [], '', 'https://example.com', 'home', [], '', true)
assert.ok(allContent.includes('全部内容'))
assert.ok(allContent.includes('noindex,follow'))
assert.ok(!allContent.includes('class="blog-showcase"'))
const dangerous = renderBlogHtml(html, { ...site, title: '</script><script>alert(1)</script>', private_key: 'must-not-be-injected' }, [], [], '', 'https://example.com')
const embedded = dangerous.match(/<script id="blog-site-settings" type="application\/json">([\s\S]*?)<\/script>/)[1]
assert.equal(JSON.parse(embedded).title, '</script><script>alert(1)</script>')
assert.ok(!embedded.includes('<script>'))
assert.ok(!embedded.includes('must-not-be-injected'))
assert.ok(home.includes('Original introduction'))
assert.ok(home.includes('Brief story'))
assert.ok(!home.replace(/<script id="blog-site-settings"[\s\S]*?<\/script>/, '').includes('Full history'))
const about = renderBlogHtml(html, site, [], [], '', 'https://example.com', 'about')
assert.ok(about.includes('Full history'))
const search = renderBlogHtml(html, site, [], [], '', 'https://example.com', 'home', [], '<script>')
assert.ok(search.includes('noindex,follow'))
assert.ok(search.includes('&lt;script&gt;'))
assert.ok(!search.includes('class="blog-showcase"'))
const story = renderBlogHtml(html, site, [{ title:'Story', cover_path:'/cover.jpg' }], [{ path:'/cover.jpg', caption:'独立图片说明' }], 'story', 'https://example.com')
assert.ok(story.includes('<figcaption>独立图片说明</figcaption>'))
console.log('Presentation settings, year arithmetic, restored default hero, global search matching and SSR passed.')
