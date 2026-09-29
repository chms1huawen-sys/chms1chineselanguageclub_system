import assert from 'node:assert/strict'
import { test } from 'node:test'
import { compareStories, featuredStories, HOME_STORY_COUNT, STORY_PAGE_SIZE } from '../src/utils/blogFeed.js'
import { renderBlogHtml } from '../server/blogSeo.js'
import { defaultBlogSettings } from '../src/utils/blog.js'

const posts = Array.from({ length: 15 }, (_, index) => ({
  id: String(index).padStart(2, '0'), slug: `story-${index}`, title: `Story ${index}`,
  content_type: index % 2 ? 'publication' : 'article', content_year: 2040 - index,
  published_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
  featured: true, is_sticky: index === 0,
}))
const template = '<html><head></head><body><div id="root"></div></body></html>'
const render = (items, slug = '', view = 'home', browseAll = false) => renderBlogHtml(template, defaultBlogSettings, items, [], slug, 'https://example.test', view, [], '', browseAll)

test('feed follows publication date, pinned priority and stable ties, not archive/book year', () => {
  assert.deepEqual([...posts].sort(compareStories).slice(0, 3).map(p => p.id), ['00', '14', '13'])
  assert.equal([...posts].sort((a, b) => compareStories(a, b, 'asc'))[1].id, '01')
  assert.deepEqual(featuredStories(posts).map(p => p.id), ['14', '13', '12', '11', '10', '09'])
  const ties = [{ id: 'b', published_at: posts[0].published_at }, { id: 'a', published_at: posts[0].published_at }]
  assert.equal(ties.sort(compareStories)[0].id, 'a')
})

test('server homepage uses six latest and six featured; browse/search initially uses eight', () => {
  const html = render(posts)
  const latest = html.match(/id="articles">([\s\S]*?)<\/section>/)[1]
  assert.equal((latest.match(/class="blog-post"/g) || []).length, HOME_STORY_COUNT)
  assert.ok(latest.indexOf('/blog/story-0') < latest.indexOf('/blog/story-14'))
  assert.equal((html.match(/class="blog-post"/g) || []).length, 12)
  assert.equal((render(posts, '', 'home', true).match(/class="blog-post"/g) || []).length, STORY_PAGE_SIZE)
})

test('server article keeps author, dates, summary, book purchase and prose in client order', () => {
  const html = render([{ ...posts[1], author: 'Writer', summary: 'A summary', body: 'Book text',
    book_details: { author: 'Writer', published_on: '1999-01-01', purchase_links: [{ label: 'Instagram', url: 'https://example.test/contact' }] },
  }], posts[1].slug)
  const positions = ['blog-article-author', 'blog-article-dates', 'blog-article-summary', 'blog-book-details', 'blog-purchase-button', 'blog-prose'].map(value => html.indexOf(value))
  assert.ok(positions.every(value => value >= 0))
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b))
  assert.ok(html.includes('发布于：'))
  assert.ok(html.includes('1999-01-01'))
})
