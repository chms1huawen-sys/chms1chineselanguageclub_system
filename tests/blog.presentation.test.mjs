import assert from 'node:assert/strict'
import { clubStatistics, heroSlides, matchesPublicSearch } from '../src/utils/blogPresentation.js'
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
const html = '<head><title>Old</title></head><div id="root"></div>'
const home = renderBlogHtml(html, site, [], [], '', 'https://example.com')
assert.ok(home.includes('Original introduction'))
assert.ok(home.includes('Brief story'))
assert.ok(!home.includes('Full history'))
const about = renderBlogHtml(html, site, [], [], '', 'https://example.com', 'about')
assert.ok(about.includes('Full history'))
const search = renderBlogHtml(html, site, [], [], '', 'https://example.com', 'home', [], '<script>')
assert.ok(search.includes('noindex,follow'))
assert.ok(search.includes('&lt;script&gt;'))
assert.ok(!search.includes('class="blog-showcase"'))
console.log('Presentation settings, year arithmetic, restored default hero, global search matching and SSR passed.')
