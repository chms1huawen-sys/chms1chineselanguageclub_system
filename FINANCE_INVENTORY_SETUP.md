# 物品与财政发布步骤

## 报表文字、半年度与主席收入权限

在之前三份迁移后，执行 `supabase_migration_2026_09_24_finance_format.sql`。
财政账簿的「编辑报表文字」只修改当前语言的标题、类别列标题、项目列标题及合计标签，保存后全系统与打印使用相同文字；不修改交易项目、金额、日期或自动入账。
报表增加「半年度」与「上半年（1–6月）」「下半年（7–12月）」选择，年度仍为默认，并保留月度。下半年的 b/d 自动承接上半年 c/d。
主席与财政、老师可以登记收入及编辑报表文字。主席没有因此获得财政审核或确认付款的权限。

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
Get-Content .\supabase_migration_2026_09_24_finance_format.sql -Raw -Encoding UTF8 | Set-Clipboard
```

SQL Editor 新建查询，粘贴并 Run。若之前未执行，请按 inventory、finance、finance_reports、finance_format 四份迁移的顺序执行。

## 9 月 24 日更新：年度与月度报表

财政报表默认显示当年全年，年份选项来自实际账目的记账日期并加上马来西亚时间的当前年份，不再预先列出 2000 年起的空年份。可切换月度后选择月份。
执委层管理新增岗位管理工作台：财政进入财政管理、文书进入请假申请、总务进入物品管理；主席与老师看到全部三个入口，其他额外授权者看到对应入口。
打印使用 A4 排版，只输出账簿，长表分页重复表头；已验证 PDF 导出和五页长表，实体打印机需在浏览器打印窗口自行选择。
完成下方 9 月 23 日两份迁移后，还需运行 `supabase_migration_2026_09_24_finance_reports.sql`。

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
Get-Content .\supabase_migration_2026_09_24_finance_reports.sql -Raw -Encoding UTF8 | Set-Clipboard
```

在 Supabase SQL Editor 新建查询，粘贴后 Run。仅新增报表查询函数，不清除资料。

收入从财政管理右上角「登记收入」录入项目说明、金额、记账日期，确认后自动进入账簿；收入登记分页用于查阅及冲销。
按钮灰色表示只有查看与审批权限，需要由老师在账号管理授予「可管理账簿、审核报销及登记付款」。
老师、正财政、副财政默认拥有录入权限。报销入口名称为「报销申请」。

## 页面与权限

导航栏保留「物品与借用」和「我的报销」。管理按钮在对应页面右上角，同时出现在有权限用户的「执委层管理」页面。管理页有返回个人页面的入口。

- 物品管理：库存管理、申请处理、出入库记录、分类管理。
- 财政管理：财政账簿、报销审批、付款记录，三个独立分页。
- 普通会员：物品目录、自己的借用及报销记录。不能读取他人的申请与收据。
- 财政及副财政：录入收入、初始余额、财政审核、确认付款。
- 主席：查看账簿及报销、主席阶段批准。
- 召集老师及指导老师：全部财政管理权限，可以处理自己的申请。
- 自定义岗位：账号管理勾选财政管理或主席阶段审批权限。最终老师批准只限老师。
- 非老师不能审批或确认支付自己的报销，由其他有权限的人处理。

流程：申请 -> 财政审核 -> 主席批准 -> 任一老师批准 -> 待付款 -> 财政确认付款。
老师可自行处理自己的申请，各阶段保留操作记录。
退回必须填写原因，申请人可以修改后重新提交，从财政审核阶段重新开始。
收据支持 JPG、PNG、WEBP、PDF，1 至 5 份，每份最大 20MB；存储桶为私有。
审批成功时只更新申请状态，确认付款才在账簿建立支出。
新申请、审批、退回和付款会创建站内通知，并调用已有 send-push-notification 发送手机推送。

## 1. Supabase SQL

在项目根目录开启 PowerShell。先复制物品迁移：

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
Get-Content .\supabase_migration_2026_09_23_inventory.sql -Raw -Encoding UTF8 | Set-Clipboard
```

到项目 xvzxewqeadppzsbczfak 的 SQL Editor，新建查询，Ctrl+V，Run。
成功后再复制财政迁移，另建查询并运行：

```powershell
Get-Content .\supabase_migration_2026_09_23_finance.sql -Raw -Encoding UTF8 | Set-Clipboard
```

两份均可重复执行，新增数据库表、权限和存储桶，不清空原有资料。
不要运行 schema.sql 或任何 cleanup 文件。
迁移依赖系统之前已有的 users、notifications、current_user_has_permission。

## 2. 第一次使用

1. 老师进入物品与借用，右上角进入物品管理，建立分类并录入物品。
2. 财政进入我的报销，右上角进入财政管理。
3. 在账簿录入一次「初始承前余额」，日期应为开始使用账簿的日期，并早于或等于第一笔收支。若初始余额为零，无需录入。
4. 按实际收到款项的日期登记收入。
5. 会员上传收据提出报销，按流程审批后，到付款记录中登记实际付款日期、方式和凭证编号。
6. 账簿选择月份即可看到承前、收入、支出、结存及左右合计，支持打印或在浏览器打印窗口存为 PDF。

账簿自动承接此前全部流水的结存；结存不当作实际支出。误录收入可填写原因进行冲销，原始记录保留。已付款报销不提供直接删除按钮。

## 3. 手机通知与自动提醒

财政沿用现有 send-push-notification；本次不新增财政 Edge Function，不新增财政定时任务。
设备必须已登记推送且系统权限允许。站内通知保存成功，不等于每台手机必定弹出推送；发送失败时页面会提示，不必重复提交申请。

物品自动到期提醒若尚未启用，按照 INVENTORY_SETUP.md 第 3 节设置密钥、Vault 和每天排程，再部署：

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
npx supabase login
npx supabase functions deploy inventory-reminder --project-ref xvzxewqeadppzsbczfak
```

原来的任务提醒、活动提醒排程保留。

## 4. GitHub 上传

下面包含本次财政、管理入口修改，以及物品模块所需的文件。只加入指定文件，不会加入根目录的 Firebase 私钥 JSON。

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
git add src/App.jsx src/pages/ExecutiveManagement.jsx src/pages/Inventory.jsx src/pages/Inventory.css src/pages/Finance.jsx src/pages/Finance.css src/pages/Members.jsx src/utils/permissions.js src/utils/pushNotifications.js
git add supabase_migration_2026_09_23_inventory.sql supabase_migration_2026_09_23_finance.sql supabase_migration_2026_09_24_finance_reports.sql supabase_migration_2026_09_24_finance_format.sql supabase/functions/inventory-reminder/index.ts supabase/config.toml
git add tests/inventory.database.test.mjs tests/inventory.ui.test.mjs tests/fixtures/inventory.html tests/finance.database.test.mjs tests/finance.ui.test.mjs tests/fixtures/finance.html INVENTORY_SETUP.md FINANCE_INVENTORY_SETUP.md
git diff --cached --stat
git commit -m "Add finance claims and ledger with separate management pages"
git push origin main
```

等待 Vercel 部署完成后重新打开线上网页。GitHub 推送不会替你运行 Supabase SQL。

## 5. 发布验证

依次使用会员、财政、主席、老师账号测试一笔小额报销，确保自己的记录可见、其他会员的记录不可见，且批准不会提前计入支出。确认付款后检查对应月份账簿。先用明确标为测试的资料验证，不把测试付款当作真实款项。

开发验证已经使用模拟接口及隔离数据库，不曾向生产数据库录入测试账目。
本地检查入口：http://127.0.0.1:5173/#/finance 。
