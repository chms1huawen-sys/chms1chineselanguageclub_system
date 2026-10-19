import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { renderBlogHtml } from '../server/blogSeo.js'
import { HOME_SEARCH_DESCRIPTION } from '../src/utils/siteBrand.js'

test('homepage search description is independent of visible introduction and article summaries', async () => {
  const site={title:'一中华文学会',intro:'Existing visible introduction',about:'Existing visible history',content:{},hero_path:'/logo-192.png'}
  const template='<html><head></head><body><div id="root"></div></body></html>'
  const original=structuredClone(site)
  const home=renderBlogHtml(template,site,[],[],null,'https://chms1clc.org')
  assert.ok(home.includes(`<meta name="description" content="${HOME_SEARCH_DESCRIPTION}">`))
  assert.ok(home.includes(`<meta property="og:description" content="${HOME_SEARCH_DESCRIPTION}">`))
  assert.ok(home.includes('Existing visible history'))
  assert.deepEqual(site,original)
  const article=renderBlogHtml(template,site,[{title:'Story',slug:'story',summary:'Article summary',content_type:'article'}],[],'story','https://chms1clc.org')
  assert.ok(article.includes('<meta name="description" content="Article summary">'))
  const client=await readFile(new URL('../src/pages/Blog.jsx',import.meta.url),'utf8')
  assert.ok(client.includes('<p>{settings.intro}</p>'))
  assert.ok(client.includes('<div key={key} data-nosnippet="">'))
})
