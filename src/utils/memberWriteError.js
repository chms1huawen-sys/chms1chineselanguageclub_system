export function memberWriteError(error, lang = 'zh') {
  if (error?.code !== 'PT429' || !error?.message?.includes('MEMBER_WRITE_RATE_LIMIT')) return null
  let seconds = 60
  try {
    const value = JSON.parse(error.details).retry_after
    if (Number.isInteger(value) && value >= 1 && value <= 3600) seconds = value
  } catch { /* Older responses may not include the retry window. */ }
  return lang === 'zh'
    ? `操作过于频繁，请在 ${seconds} 秒后重试。本次操作未保存，之前已保存的数据不受影响。`
    : `Too many changes. Try again in ${seconds} seconds. This change was not saved; earlier saved data is unaffected.`
}
