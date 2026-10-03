# 网站运行与流量检查

## 只读检查

在项目目录运行：

```powershell
npx supabase db query --linked --project-ref xvzxewqeadppzsbczfak --file scripts/operations-health.sql
```

也可以在 Supabase SQL Editor 运行该文件。它只查询，不发通知、不归档、不删除资料；不会显示会员姓名、邮箱、通知内容或定时任务中的凭证。

- 五项定时任务应启用，最近执行状态通常为 `succeeded`。
- `late_repeat_publications`：超过计划发布时间三分钟仍未发布的任务。
- `late_task_notifications`、`late_push_retries`：超过下次处理时间十五分钟仍积压的通知。
- `unarchived_expired_tasks`：截止超过三十天零五分钟仍未归档的任务。
- `archive_snapshots_missing`：已归档任务缺少表现快照。
- `missing_originals`、`missing_previews`：缺少照片文件。

上述异常计数通常应为零。短暂异常可稍后复查；持续异常需要查对应函数日志。定时任务成功只代表调度成功，不代表手机已展示通知。

## 流量怎么判断

打开 https://supabase.com/dashboard/org/wsnsqugbeckcqdjjhiwr/usage ，先看账单周期和当前额度，不把旧账单周期的额度当成永远不变。

1. 分别查看 Uncached Egress 与 Cached Egress，不能把两者当成一个缓存容量。
2. 查看每天的流量柱，并展开来源。Storage 是文件下载，PostgREST 是数据库响应。
3. 同时记录正常访问量。测试、后台预览和同一个人多次浏览也会下载文件，因此访问人数不等于下载次数。
4. 优化部署后记录至少三天正常使用数据。粗略月估算为平均每日流量乘以账单周期天数；留出活动日高峰余量。
5. 额度约用到 70% 时开始关注，85% 时优先排查；这是本站建议的人工预警阈值，不是 Supabase 官方限制，也不是已经设置的自动通知。

删除文件不会退回本期已经产生的下载流量。读取测试和照片优化也会产生少量流量；旧图优化首次下载了约 127 MB。

## 当前照片优化

2026-10-03：36 张原图完整保留，其中 32 张新增展示副本，4 张无明显压缩收益，沿用原图。全组展示体积约从 127.22 MB 降至 5.19 MB。不等于全站流量必然降低 96%，因为头像、收据、其他文件与访问次数仍会影响总量。

数据库映射已应用；前端及 API 必须部署相应代码，才会优先使用副本。重新打开旧文章，检查封面、正文图、四图预览及放大查看。图片网址缓存、延迟加载与签名请求合并可减少重复请求，但不能保证每次浏览都不下载。

旧图转换脚本默认只列出数量；加 `--apply` 才写入展示副本。需要本机已登录 Supabase CLI 和 Sharp。没有错误时不需要重复运行；不要为了降流量执行 cleanup 文件。

## 尚未执行

安全清单、个别 Android 手机排查、正式域名、Google Search Console 注册、备份恢复方案及后端迁移仍按此前要求暂缓。没有付费升级，也没有设置自动流量监测通知。
