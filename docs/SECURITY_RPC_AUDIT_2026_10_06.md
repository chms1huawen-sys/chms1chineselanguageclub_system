# RPC 与公开限流审查（2026-10-06）

## 范围与证据

正式库只读获取 public schema 的 53 个普通函数定义及 anon/authenticated EXECUTE 权限，其中 47 个为 SECURITY DEFINER、6 个为 SECURITY INVOKER。没有读取或导出会员业务记录。审查入口是 `scripts/rpc-definition-audit.sql`。

本轮是函数定义、身份边界与主要输入边界审查，结合隔离数据库回归；不是所有角色组合、并发、网络故障及所有正式数据的穷尽证明。

## 分类结果

| 函数组 | 身份与数据边界 |
| --- | --- |
| active_member、current_user_has_permission、blog_manager、blog_member、blog_archive_manager | 根据 auth.uid() 查询当前账号；公开策略使用的匿名辅助函数不能因此授予匿名会员身份。 |
| can_view_committee、can_manage_committee | 有效会员及委员会身份／老师权限；已撤销匿名执行，停用会员不能凭旧职务放行。 |
| finance_access、finance_can_record_income、inventory_access | 财务／物品角色权限；目标 UUID 是内部收件人权限检查所需，不可一律改为只允许当前用户，否则会破坏通知。辅助函数不直接返回业务记录。 |
| get_active_member_count | 匿名不可调用，停用账号被拒绝；有效会员和服务器保留统计。 |
| finance_mutate、finance_record_income、inventory_mutate | 有效账号、行动权限与业务归属检查；事务、库存约束、审批状态及重复操作保护保留。新增 JSON object 与 256 KiB 输入上限。 |
| finance_report、finance_report_years、finance_statement、finance_save_format、finance_save_report_headings | 函数内财务权限检查；格式配置不因此开放给普通会员。 |
| club_term_report、task_performance_records | 报告访问边界，归档记录保留但普通任务列表隐藏；不是可传任意 UUID 读取全部表现资料。 |
| create_task_repeat_plan、cancel_task_repeat_plan | 建立权限、有效名单／团队、取消归属检查；新增标题 300 字符、描述 20,000 字符、人数 1–500、次数 1–12、星期／时间／有限日期检查。 |
| blog_save_post、blog_studio_save | INVOKER + blog_manager + RLS；版本冲突、分类范围、归档规则保留。新增文章 JSON 2 MiB、媒体条目最多 1,000、链接最多 30 条以及输入类型检查。 |
| blog_asset_editable、can_upload_validated_file | 校验路径及对应文章／上传业务权限，不能用路径访问任意私人资源。 |
| blog_analytics_report | 后台管理权限；不向匿名返回访问明细。 |
| blog_year_locked、blog_publish_due、blog_record_visit | 公开功能所需；发布只处理到期且符合公开状态的文章。访问统计校验路径、设备、来源及访客每分钟上限，本轮提前拒绝空设备／空路径。 |
| update_my_avatar_url、update_my_notification_settings | 当前有效账号绑定及参数检查，不能指定其他会员修改令牌。 |
| consume_push_rate_limit、consume_upload_rate_limit、claim_push_retry_jobs、claim_task_notification_outbox | 服务器专用，浏览器角色无 EXECUTE；既有原子领取／限流逻辑保留。 |
| archive_expired_tasks、publish_due_task_plans、inventory_due_reminders、create_notification_for_user | 服务器／排程专用，浏览器不可直接调用；不会因本轮改动自动删除记录。 |
| capture_notification_push_actor、finance_permission_guard、inventory_permission_guard、validate_task_roster_scope、task_update_guard、handle_new_user、blog_guard_year、blog_permission_guard | 触发器，浏览器直接执行已限制；保留原有触发时机。 |
| blog_content_guard、blog_post_stamp、blog_taxonomy_guard、set_updated_at | INVOKER 触发器，不能作为普通 RPC 直接返回业务资料；依赖调用写入的 RLS 与触发器约束。 |

## 本轮正式部署

- `supabase_migration_2026_10_06_rpc_input_bounds.sql` 已执行成功。再次只读比对 53 个函数，只有上述预期 7 个定义改变，anon/authenticated EXECUTE 权限变化为零。
- 本机 PGlite 测试覆盖财务、库存、文章、重复任务输入拒绝及原有正常流程；不在正式库写测试业务记录。
- Vercel 项目 `chms1chineselanguageclub_system` 已发布并启用 `public-endpoint-burst-limit`。规则在刷新后仍启用；配置页确认固定窗口 60 秒、600 请求、IP Address、超限 429。
- 匹配首页、literature、activities、news、bookroom、about、blog 详情、api/blog、api/blog-media、api/sitemap、sitemap.xml。静态资源、会员和后台入口不在此规则范围。
- 没有付费升级、删除业务资料、重置凭证或迁移服务器。
- 验证结果：27 项基本安全测试、4 项业务输入回归、2 项 RPC 权限测试通过；lint、build、diff 检查通过。密钥扫描检查 725 个历史文本对象及工作区／前端环境，未发现凭证泄露匹配。
- 正常生产五项检查通过：member、blog-admin、literature、robots.txt、sitemap.xml；无安全响应头／索引／canonical 检查错误。这不是手机完整启动时间或洪泛防护实测。

## 防护边界与未完成事项

- Vercel 限流计数按区域，不是全世界统一的严格计数。未向正式网站发送洪泛／压力测试；已验证配置发布和正常生产访问。
- 直连 Supabase REST/RPC/Storage 不经过 Vercel WAF。RLS、函数权限、输入上限继续有效，但不能宣称每个直接接口都已有 IP 级洪泛防护。
- blog_record_visit 的 visitor UUID 由客户端提供；攻击者可轮换 UUID 绕过每访客上限。不能把它当作防伪统计或可靠匿名反滥用机制。本轮没有擅自关掉统计或改写访问数据。
- 同一学校网络多人共用公网 IP，可能共用 600 次额度；应按真实 429 事件决定是否调整，不能据此保证永不误限。
- 真实备份仍按用户要求跳过；流量／费用监控、正式网址／公开内容确认及 Search Console 由用户处理。未完成不等于已通过。

## 复核命令

```powershell
npm run security:rpc-input-test
npm run security:rpc-test
npm run security:test
npm run lint
npm run build
node scripts/check-production.mjs
```

这些检查不是对未来安全、通知必达或账单不超额的保证。

## 匿名统计后续修复

- 新增并部署 `blog-visit` Supabase Edge Function，前端改为调用服务器入口；保留用户同意、隐私信号、本地不统计和管理员不统计的行为。
- 服务器校验 JSON、2 KiB 请求上限、公开路径、UUID、设备、来源域名；拒绝完整 referrer、私人页面、异常类型。CORS 复用现有明确来源名单，不视 CORS 为机器人验证。
- 部署 `supabase_migration_2026_10_06_blog_visit_gateway.sql`：匿名／会员角色不能再直接调用原统计写入和新网关 RPC，只有服务器角色可以。
- 数据库事务锁统一控制写入：每分钟 600 条、马来西亚自然日 20,000 条；更换访客 ID 不能绕过总额度。去重／被拒绝的访问不占统计额度。两个计数行原位更新，不新增 IP 或历史限流行，不删除既有访问记录。
- 达限仅让统计入口返回 429，不阻止文章阅读、搜索、会员操作或推送。大流量日统计可能因此少计，应根据真实需要调整；不保证统计防伪、匿名接口零成本或整体账单不超额。攻击者仍可能耗尽统计额度，造成统计少计。
- 此修复解决上文的直接匿名写入与轮换 UUID 无限写入风险，不代表其他 Supabase 接口已有全局防洪泛保护。
- 部署检查脚本使用不存在的公开文章路径和禁止的私人路径，验证服务但不新增访问记录；本机测试使用隔离 PGlite。
