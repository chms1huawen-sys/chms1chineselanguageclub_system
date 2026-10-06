import { readFile } from 'node:fs/promises'

export async function installMemberWriteLimits(db) {
  // Other module tables are placeholders only inside isolated single-module tests.
  for (const table of ['tasks', 'task_repeat_plans', 'finance_operations', 'inventory_operations', 'finance_report_format']) {
    await db.exec(`create table if not exists public.${table}(id uuid primary key default gen_random_uuid())`)
  }
  await db.exec(await readFile(new URL('../supabase_migration_2026_10_06_member_write_limits.sql', import.meta.url), 'utf8'))
}
