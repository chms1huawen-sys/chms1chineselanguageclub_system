# 物品与借用上线步骤

本文说明物品模块的安装与提醒排程。财政模块和最新发布指令见 FINANCE_INVENTORY_SETUP.md，不清理原有资料。

## 1. Supabase 数据库

在 SQL Editor 完整执行 `supabase_migration_2026_09_23_inventory.sql`。
这是增量迁移，可重复运行。不要执行 `schema.sql` 或任何 cleanup 文件。
依赖现有的 users、notifications 和 current_user_has_permission（之前的自定义权限迁移）。

会新增物品分类、物品、申请、明细、库存流水、重复请求保护表及私有 inventory-photos 存储桶。
没有预置测试物品或分类。进入「物品与借用」，点击右上角「物品管理」，再到分类管理中自行建立「文具」「电器」等分类。有权限者也能从执委层管理页面进入。

默认管理及审批：召集老师、指导老师、主席、正总务、副总务。
账号管理新增「可管理物品、库存及借还」「可审批物品申请」两个独立勾选。
其他人可以查看物品目录、提出申请、查看及取消自己的未领取申请。
会员在目录中将物品加入借用清单，调整数量后统一提交一张申请；同种物品自动合并，每次最多 30 种。清单尚未提交时不占库存，成功后清空，失败时保留。切换目录和申请记录会保留当前清单，刷新页面后需重新选择。
物品照片使用完整显示的边框相框，每张卡片显示自定义类别标签。
老师可审批自己的申请，其他审批人不可以。

## 2. 本地检查

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
npm run dev
```

打开终端显示的网址并登录，进入「物品与借用」。
先新增分类，再新增物品。新申请在批准前不占库存，批准后预留；确认领取后出库。
借还物品支持分次归还，损坏及遗失必须填写备注。消耗品领用后完成，可退回未使用数量。
逐件编号物品只能是借还制，总数最多一件。盘点用正负变动数调整，必须填写原因。
有预留或借出数量不能停用；有历史申请不能改变管理方式或编号。

## 3. 归还提醒（每天马来西亚时间上午 9 点）

申请、审批、领取、归还会直接建立站内通知并调用现有 send-push-notification。
自动到期提醒还需以下单独部署及排程；不会修改原来的任务或活动排程。

1. 在 Supabase Edge Functions Secrets 新增 `INVENTORY_CRON_SECRET`，填写一串自己生成的随机长字符串。
2. 在 Supabase Vault 新增同一字符串，名称为 `inventory_cron_secret`。不要把实际字符串提交 Git。
3. 执行：

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
npx supabase functions deploy inventory-reminder --project-ref xvzxewqeadppzsbczfak
```

4. 在 SQL Editor 执行下面的排程（需已启用 pg_cron、pg_net 及 Vault）：

```sql
do $$
declare job record;
begin
  for job in select jobid from cron.job where jobname = 'inventory-daily-reminder' loop
    perform cron.unschedule(job.jobid);
  end loop;
end $$;

select cron.schedule('inventory-daily-reminder', '0 1 * * *', $$
  select net.http_post(
    url := 'https://xvzxewqeadppzsbczfak.supabase.co/functions/v1/inventory-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name='inventory_cron_secret' limit 1)
    ),
    body := '{}'::jsonb
  );
$$);
```

到期当天及逾期每天提醒借用者与库存管理员；同一申请、同一接收人、同一天只建立一条提醒。
领取前的预留不发归还提醒；已归还的申请停止提醒。
手机推送依赖已有推送功能、设备登记及系统权限，不保证每台设备都会弹出。
如果推送服务失败，站内记录仍保留；函数日志会报告失败，当天重跑不重复建立通知。

## 4. 发布前验证

- 普通会员提交借用，不能审批，不能读取他人申请。
- 主席或总务批准申请，库存转入预留；再次领取不得重复出库。
- 老师可以批准自己的申请，主席与总务不能批准自己的申请。
- 归还部分物品，剩余数量仍显示借用中；损坏、遗失分别记账。
- 消耗品领取后完成，退库后可用数量回升。
- 同时申请库存不足时，审批失败并保留原库存。
- 中英文及手机页面正常，照片可显示；操作失败提示可见。

数据库隔离测试使用 PGlite，不连接线上数据库。可在项目外安装测试依赖后运行：

```powershell
npm install --prefix "$env:TEMP\clc-inventory-tests" @electric-sql/pglite
$env:PGLITE_MODULE = ([System.Uri]::new("$env:TEMP\clc-inventory-tests\node_modules\@electric-sql\pglite\dist\index.js")).AbsoluteUri
node --test tests/inventory.database.test.mjs
npm run build
```

`tests/inventory.ui.test.mjs` 使用 Playwright、已安装的 Edge 和正在运行的本地开发服务器。
它只访问 `tests/fixtures/inventory.html` 并拦截 Supabase 请求使用模拟数据，不写入真实账号或库存。
测试照片保存在 `node_modules/.cache/inventory-screenshots`，不需要提交 Git。

## 5. GitHub

```powershell
cd C:\Users\Owner\Downloads\chms1chineselanguageclub_system
git add src/App.jsx src/pages/Inventory.jsx src/pages/Inventory.css src/pages/Members.jsx src/utils/permissions.js src/utils/pushNotifications.js supabase_migration_2026_09_23_inventory.sql supabase/functions/inventory-reminder/index.ts supabase/config.toml tests/inventory.database.test.mjs tests/inventory.ui.test.mjs tests/fixtures/inventory.html INVENTORY_SETUP.md
git diff --cached --stat
git commit -m "Add inventory and borrowing management"
git push
```

请逐项添加上列文件，不使用 `git add .`，避免把本地凭据及无关文件加入 Git。
