import { readFile } from 'node:fs/promises'

export async function boundedRpcSQL(names) {
  const sql = await readFile(new URL('../supabase_migration_2026_10_06_rpc_input_bounds.sql', import.meta.url), 'utf8')
  return names.map(name => {
    const marker = `-- RPC: ${name}\n`
    const start = sql.indexOf(marker)
    if (start < 0) throw new Error(`Missing RPC fixture: ${name}`)
    const next = sql.indexOf('-- RPC:', start + marker.length)
    return sql.slice(start + marker.length, next < 0 ? sql.indexOf("notify pgrst", start) : next)
  }).join('\n')
}
