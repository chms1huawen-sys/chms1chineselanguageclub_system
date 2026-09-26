# Blog 上线与使用

## 这次新增了什么

- `/` 是公开 Blog；`/blog/文章网址名称` 是公开文章。
- `/#/login` 保持原有登入页面，`/#/` 保持会员仪表盘。
- Blog 右上角有会员登入／会员系统入口；会员系统侧栏有学会网站首页入口。
- 老师（召集、指导）、主席、正摄影、副摄影及媒体可使用 `/blog-admin`，入口只在 Blog，后台不使用会员系统侧栏。
- 副主席、文书及普通会员不会因此自动获得文章发布权限。
- 管理者可以新增、编辑、预览、公开、隐藏或删除文章，设置封面与精选文章，整理照片、说明、顺序及自定义分类。
- 可编辑标题、网址名称、摘要、正文、日期、地点、署名、标签、原图链接，以及网站标题、学校名称、介绍、联系资料。
- 正文按段落显示，保留换行；不会执行粘贴进来的 HTML 或脚本。文章内容不会自动翻译，界面控件支持中英文。

## 1. Supabase：依序运行四份 Blog SQL

打开 Supabase → SQL Editor → New query，运行项目根目录文件的完整内容：

1. `supabase_migration_2026_09_25_blog.sql`（之前已经执行过这份基础文件，就跳过第一份。）
2. `supabase_migration_2026_09_25_blog_permissions.sql`
3. `supabase_migration_2026_09_25_blog_studio.sql`
4. `supabase_migration_2026_09_25_blog_analytics.sql`

这些 SQL 新建或扩充 Blog 专用资料表、照片储存桶及权限。后三份可重复执行；不要在后三份完成后单独重跑第一份，否则基础定义会覆盖扩充版本。
不清空会员、任务、筹委、请假、财政、库存或其他现有资料。
**不要重新运行 schema.sql，也不要运行旧 cleanup 文件。**

没有新的 Supabase Edge Function 需要部署。SEO 的 `api/` 文件由 Vercel 部署。

## 2. 先本地检查

### 新后台操作

- 四个公开菜单：首页、活动记录、书坊、关于我们。书坊展示出版物类型的内容。
- 后台按年份筛选。内容可选择文章、活动、出版物、公告；支持分类、标签、搜索、置顶、精选和手动相关内容。
- 相关链接可以是社媒、视频、报名或下载网址；每一项分别选择公开或会员专用。没有会员专属文章，只有链接权限。
- 照片相册可独立建立，再关联至活动或文章；不用重复上传。
- 网站设置可更改首页标题、分区标题、介绍、关于页面、轮播照片及切换间隔。上传到 `blog-site-media` 的装饰图为公开资源，不适合私密照片。
- 删除先进入回收站；还原后为草稿。永久删除需要确认。封存年份后不能编辑，老师或主席可重新开放年份。
- 管理权限在会员系统的账号管理中授予或取消；自定义职位也可获得权限。未覆盖时继承老师、主席及媒体等原有默认设置；明确取消会覆盖默认权限。
- 定时发布由公开网页或 sitemap 请求触发：到达时间后的首次访问会发布，不是独立精确到秒的后台定时任务。已封存年份不会自动发布。
- 文字内容、分类名称不会自动翻译；中英文界面共用编辑者录入的内容。

### 访问统计的含义

后台“访问统计”可选择日期，查看浏览次数、估算访客浏览器数、会话数、每日趋势、热门页面、来源域名和最近 100 条访问。

访客同意后才开始记录。浏览器隐私拒绝信号、管理员本人、本地开发、会员系统页面均不计入。相同会话一分钟内重复打开同一页只计一次。
访客数是随机浏览器标识的去重值，不等于真实人数；更换设备、清除储存会影响估算。不会收集账号、姓名、邮箱、IP 或完整来源网址，也不能恢复安装前的访问记录。
匿名接口有去重和基本频率限制，但不能阻止所有伪造流量，不应作为安全审计或精确人数证明。取消同意会停止后续记录，并清除该浏览器的统计标识。

已有本地服务器时直接打开：

- Blog：http://127.0.0.1:5173/
- 原登录页：http://127.0.0.1:5173/#/login
- 文章后台：http://127.0.0.1:5173/blog-admin

未开启本地服务器时：

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
npm run dev -- --host 127.0.0.1
```

在文章后台先创建分类，再新增文章并保存草稿，随后上传照片、设置封面并保存。准备好后将状态改为公开发布并保存。
照片支持 JPG、PNG、WEBP，每张最多 10MB，每篇最多 60 张；大批原图请放在 Google Drive。
独立相册最多 300 张。上传和删除立即生效；排序、文字、封面、照片说明及相关链接在保存内容或相册时生效。
已公开文章若需要私下修改照片，先隐藏文章，完成后再发布。
已发布的网址名称不要随意修改，旧网址会变成 404。

## 3. Vercel 环境变量

确认项目环境中原有这两项可供生产和预览部署使用：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

再新增（不是密码）：

```text
BLOG_SITE_URL=https://chms1chineselanguageclubsystem.vercel.app
```

**这里使用匿名公开 key，不要填 service_role key 或 Firebase 私钥。**
`vercel.json` 会把公开文章转交 Vercel Function 输出完整正文和搜索元资料，同时保留 Vite 资源及原会员 hash 路由。
本地 Vite 仅预览界面；正式 SSR、404 状态、robots 和 sitemap 需在 Vercel 部署后再检查。

## 4. 本次 GitHub 上传指令

先查看是否有先前暂存的无关文件或私钥，尤其不要将 Firebase admin JSON 上传。

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
git status
git diff --cached --stat
git add -- .gitignore src/App.jsx src/pages/Blog.jsx src/pages/Blog.css src/pages/BlogManagement.jsx src/utils/blog.js
git add -- src/pages/BlogAdminShell.jsx src/pages/BlogStudio.css src/pages/BlogStudioAnalytics.jsx src/pages/BlogStudioEditors.jsx src/pages/BlogStudioMedia.jsx
git add -- src/pages/Members.jsx src/utils/permissions.js src/components/BlogAnalyticsConsent.jsx src/components/BlogAnalyticsConsent.css
git add -- public/manifest.json public/firebase-messaging-sw.js public/robots.txt vercel.json
git add -- api/blog.js api/blog-media.js api/sitemap.js server/blogSeo.js
git add -- supabase_migration_2026_09_25_blog.sql supabase_migration_2026_09_25_blog_permissions.sql supabase_migration_2026_09_25_blog_studio.sql supabase_migration_2026_09_25_blog_analytics.sql docs/BLOG_SETUP.md
git add -- tests/blog.database.test.mjs tests/blog.unit.test.mjs tests/blog.api.test.mjs tests/blog.ui.test.mjs tests/blog.navigation.test.mjs tests/fixtures/blog.html
git add -- tests/blog.permissions.test.mjs tests/blog.studio.database.test.mjs tests/blog.analytics.ui.test.mjs tests/fixtures/blog-consent.html tests/public-journal.ui.test.mjs tests/fixtures/public-journal.html
git diff --cached --stat
git commit -m "Add public blog, annual content studio and visit analytics"
git push origin main
```

不要使用 `git add .`；本次没有新增 npm 依赖，也无需上传 node_modules、dist 或测试截图。

## 5. 上线验收

1. 用无痕窗口打开首页和已发布文章：可阅读文章与照片、公开相关链接，不能取得设置为会员专用的链接。
2. 登录普通会员：能取得原图相册，能进入会员系统，不能进入文章后台。
3. 使用老师、主席或媒体账号：可管理分类、发布、隐藏及删除文章。
4. 隐藏文章后，用无痕窗口直接输入其网址：应返回 404，sitemap 也不再列出它。
5. 检查原登录画面、任务通知点击跳转、会员系统返回 Blog 的按钮。
6. 查看页面源代码，应能看见文章标题及正文，而不只有空白 React 容器。
7. 打开 `/sitemap.xml`，应只列出公开网址。
8. 在 Google Search Console 验证网站后提交 `sitemap.xml`，并请求检查首页和公开文章网址。能被抓取不代表立即收录，也不能保证关键词排名。

## 下载与隐私边界

公开展示的照片本身可以被浏览器保存或截图。仅会员可从本站取得 Google Drive 原图链接，该链接单独储存并有数据库权限限制。
如果 Drive 设置为“知道链接的任何人”，会员仍可把链接转发给访客；需要严格限制原图访问时，还必须在 Google Drive 内限制文件夹分享权限。
照片储存桶是私有的，只有已发布文章的照片能被访客取得。已签发的照片临时链接在有效期结束前仍可能可用；已被保存的公开照片无法收回。
请勿将个人电话、身份证资料、私人账号或未经同意公开的内容写入文章正文、照片说明或公开联系资料。

## 技术说明

SEO 采用 Vercel Function 读取匿名可见数据并输出 HTML，不使用 service_role 绕过权限。
参考：[Vercel 文件打包](https://vercel.com/kb/guide/how-can-i-use-files-in-serverless-functions)、[Supabase 私有储存桶](https://supabase.com/docs/guides/storage/buckets/fundamentals)。
