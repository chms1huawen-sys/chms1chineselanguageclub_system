import test from 'node:test'
import assert from 'node:assert/strict'
import { publicBlogArticle } from '../src/utils/blogBootstrap.js'

test('article bootstrap keeps readable public content but excludes member links and internal fields', () => {
  const data = publicBlogArticle({ status: 'published', slug: 'story', title: 'Story', body: 'Poem\n\nNext stanza', created_by: 'private-account', internal_notes: 'private' },
    [{ id: 'photo', path: 'public-photo', caption: 'Caption', internal_notes: 'private' }],
    [{ label: 'Public', url: 'https://example.com', visibility: 'public' }, { label: 'Originals', url: 'https://private.example.com', visibility: 'member' }])
  assert.equal(data.post.body, 'Poem\n\nNext stanza')
  assert.equal(data.media[0].caption, 'Caption')
  assert.equal(data.links.length, 1)
  assert.equal(JSON.stringify(data).includes('private'), false)
  assert.equal(publicBlogArticle({ status: 'draft', body: 'secret' }), null)
})
