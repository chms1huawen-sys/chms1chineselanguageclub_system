# Blog display update (2026-09-26)

This update uses the existing `blog_settings.content` JSON settings. It needs no new SQL migration and does not alter member data or permissions.

## Editing

Open Blog administration > 网站设置 (Site settings).

- 首页简介: brief homepage story. 关于我们页面：详细介绍: independent full About page text.
- 首页统计卡片: editable labels for all three cards. Public story count remains automatic. Membership is entered manually.
- 记录开始年份 / 记录结束年份: elapsed years = end minus start, with the range shown below. A blank end follows the current year; for example 1975 to 2026 gives 51. An unset start displays a dash.
- 默认首页画面主标题 / 副标题 / 链接 and 默认首页介绍图片: the original introduction is now the first carousel slide, even when custom slides exist.
- 将默认首页介绍加入轮播第一张: can disable the introduction when custom slides exist. With no custom slides the introduction remains as a fallback.
- 探索按钮文字: carousel default button text. Each additional slide can override its button, title, subtitle and destination.
- 文学角落投稿提示: separate editable Chinese and English text. An empty value hides that language's guidance. This is guidance only, not automatic word-count validation.
- Save site settings after editing or uploading.

## Display and search

Photos are shown completely, without upscaling beyond intrinsic dimensions or zoom animation. Low-resolution originals cannot gain detail; uploading a larger original remains the way to improve source quality. Slides crossfade together over 0.65 seconds. Previous/next, direct selectors, pause, keyboard focus pause and reduced-motion support are retained.

Only the navigation contains search. Searches use all published content, including books, and match title, body, summary, author, ISBN and tags. Member-only links and private records are not searched. Search results are marked noindex by the production page handler.

The public document background is light, including overscroll; member-system background styling is untouched. Footer spacing is reduced.

## Deployment

Push the scoped code commit to GitHub. The connected Vercel project must finish deploying before the live site changes. No Edge Function deployment is required for this update.

Previously required Blog migrations still need to have been applied; see `CULTURAL_SITE_UPDATE.md` for that earlier migration sequence. Do not rerun `schema.sql` or cleanup scripts.
