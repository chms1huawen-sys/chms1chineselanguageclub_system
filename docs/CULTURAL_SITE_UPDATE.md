# 2026-09-26 公开网站栏目更新

## 已实现

- 导航：首页、文学角落、活动记录、书坊、学会资讯、关于我们、会员入口。
- 文学和活动菜单支持分类下拉、子分类、手机点击、键盘及减少动画设置。
- 首页最新内容包含活动及学会资讯；精选区限定为活动。
- Hero 保留后台自定义图片、文字和链接，点击画面或按钮前往设置的页面。
- 首页活动影像使用公开活动的照片或封面，点击进入对应文章。编辑活动可取消“显示于首页活动影像”。
- 文学短篇只有 10–450 字的投稿提醒，不计字、不阻止保存，由编辑人工审核。
- 书坊仅展示出版物；后台可填写作者、价格、出版日期、页数、ISBN、作者介绍及社媒购买联系，不新增电商功能。
- 分类支持栏目、父分类、显示开关、排序、Emoji、颜色；标签以稳定 ID 关联，改名不丢失关联。
- 网站设置可添加、编辑、隐藏、排序、删除页脚社媒链接。书籍可单独设置购买联系。
- 不新增时间轴或历届执委；保留原关于我们设计。
- 会员系统、Blog 后台继续分组，公开资讯不读取内部公告。

## SQL 执行顺序

先备份数据库。Supabase → SQL Editor → New query，粘贴所需文件的完整内容执行。

如果之前四份 Blog 迁移都已成功执行，这次只运行：

`supabase_migration_2026_09_26_cultural_site.sql`

如果之前从未执行 Blog 迁移，依次执行：

1. `supabase_migration_2026_09_25_blog.sql`
2. `supabase_migration_2026_09_25_blog_permissions.sql`
3. `supabase_migration_2026_09_25_blog_studio.sql`
4. `supabase_migration_2026_09_25_blog_analytics.sql`
5. `supabase_migration_2026_09_26_cultural_site.sql`

部分执行过则从未完成的步骤继续。新迁移完成后，不要单独重跑旧版本迁移；旧定义会覆盖新版函数及权限。
不要执行 `schema.sql` 或任何 cleanup 文件。无需部署新的 Edge Function。
本次开发没有连接真实数据库执行迁移。

## 旧相册如何保留

每个旧相册转换成一篇活动记录，沿用原相册 ID、图片路径、说明、年份及公开/隐藏/回收站状态。照片不重复上传，也不删除。
旧相册与原文章的关联转换为相关内容关联，因此旧文章可找到转换后的活动记录；不是把多人共用相册的照片强行合并进某一篇文章。
原相册表保留为只读备份，前后台不再提供独立相册入口或查询。归档年份保持锁定。
迁移可重复执行，不重复建立活动。若检测到 ID 冲突则整个事务停止，需要检查后处理。

## 后台在哪里操作

- Blog 右上角 → 文章后台 → 文学角落 / 活动记录 / 书坊管理 / 学会资讯。
- 分类与标签：选择所属栏目、上级分类，再填写名称、图标、颜色、排序和显示状态。共用分类会出现在不同栏目。
- 网站设置：编辑轮播内容及目的网址；社交媒体链接在页脚公开显示。
- 发布资料先保存草稿，再上传照片。每篇最多 300 张，每张最多 10MB（JPG / PNG / WEBP）。大量原图仍可使用会员专用外部下载链接。
- 分类关联其他类型内容时，不能直接把该分类改到不相容栏目；先调整文章分类。
- 公开页面已有的正文、分类名称不会自动翻译。

## GitHub 指令（本次改动）

先运行前两条查看暂存内容，确认没有 Firebase 私钥、`.env` 或无关文件，然后继续。不要用 `git add .`。

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
git status
git diff --cached --stat

git add -- src/pages/Blog.jsx src/pages/Blog.css src/pages/BlogManagement.jsx src/pages/BlogStudioEditors.jsx src/pages/BlogStudioMedia.jsx src/pages/BlogCultureEditors.jsx
git add -- src/components/BlogNavigation.jsx src/components/BlogAnalyticsConsent.jsx src/utils/blog.js src/utils/blogContent.js
git add -- api/blog.js api/sitemap.js server/blogSeo.js
git add -- supabase_migration_2026_09_26_cultural_site.sql docs/BLOG_SETUP.md docs/CULTURAL_SITE_UPDATE.md
git add -- tests/blog.culture.database.test.mjs tests/blog.culture.ui.test.mjs tests/blog.api.test.mjs tests/blog.ui.test.mjs tests/public-journal.ui.test.mjs
git diff --cached --stat
git commit -m "Expand public cultural website and migrate activity photos"
git push origin main
```

这不会替你上传尚未提交的其他历史工作。GitHub push 成功后，还需要等待 Vercel 部署成功；先应用新 SQL，再发布前端。

## 上线检查

1. 无痕窗口：六个公开栏目可访问；会员资料和后台不可读取。
2. 首页：资讯出现、Hero 跳转正确、照片点击进入活动，关于我们没有新增时间轴。
3. 后台：修改分类名称、颜色、排序；给标签改名后旧文章仍能筛选到。
4. 书籍：价格和作者显示，社媒购买链接正确；无购物车。
5. 旧数据：核对转换后的活动数量、隐藏照片权限和归档年份。
6. 手机：分类下拉、照片、页脚不溢出；已安装会员应用仍进入会员系统。
7. Vercel：`/literature`、`/news`、文章和 sitemap 正常返回，后台保持 noindex。

数据库迁移已在隔离测试库验证；不等同于已检查真实 Supabase 的全部历史策略。
依赖扫描仍有现有依赖警告（包括高危/严重），这次没有执行可能影响会员系统的批量升级；发布前应单独评估和更新。
