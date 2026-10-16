import { renderBlogHtml } from './blogSeo.js'
import { matchesPublicSearch } from '../src/utils/blogPresentation.js'
import { postTags } from '../src/utils/blogContent.js'
import { snapshotArticle, snapshotMoments } from '../src/utils/publicSnapshot.js'

export function renderSnapshotPage(template, snapshot, request, origin) {
  const { slug, view, search } = request
  const article = snapshotArticle(snapshot, slug)
  const types = { literature: 'article', activities: 'event', bookroom: 'publication', news: 'notice' }
  let posts = slug ? article ? [article.post] : [] : snapshot.posts.filter(post => !types[view] || post.content_type === types[view])
  if (search) posts = posts.filter(post => matchesPublicSearch(post, search, postTags(post, snapshot.tags).map(tag => tag.name)))
  return {
    status: slug && !article ? 404 : 200,
    html: renderBlogHtml(template, snapshot.settings, posts, article?.media || [], slug, origin, view, article?.links || [], search, request.browseAll || false, { featured: snapshot.posts.filter(post => post.featured), moments: snapshotMoments(snapshot) }),
  }
}
