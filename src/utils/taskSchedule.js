const zone = 'Asia/Kuala_Lumpur'
export function weeklyTaskPreview({ first, immediate, weekday, time, count }, now = new Date()) {
  const start = immediate ? new Date(now) : new Date(`${first}:00+08:00`)
  const number = Number(count)
  const day = Number(weekday)
  if (!Number.isFinite(start.getTime()) || number < 1 || number > 12 || !Number.isInteger(number) || !Number.isInteger(day) || day < 0 || day > 6 || !/^\d{2}:\d{2}$/.test(time)) return []
  const [hour, minute] = time.split(':').map(Number)
  if (hour > 23 || minute > 59) return []
  return Array.from({ length: number }, (_, index) => {
    const publish = new Date(start.getTime() + index * 7 * 86400000)
    const local = new Date(publish.getTime() + 8 * 3600000)
    const due = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour - 8, minute))
    due.setUTCDate(due.getUTCDate() + (day - local.getUTCDay() + 7) % 7)
    if (due <= publish) due.setUTCDate(due.getUTCDate() + 7)
    return { publish: publish.toISOString(), due: due.toISOString() }
  })
}
export function taskScheduleDate(value, lang) {
  return new Date(value).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-GB', { timeZone: zone, month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
}
