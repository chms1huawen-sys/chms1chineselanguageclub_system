// supabase/functions/task-deadline-reminder/index.ts
// 部署方式：supabase functions deploy task-deadline-reminder
// 定时触发：在 Supabase Dashboard > Edge Functions > Schedules 设置 cron: "0 8 * * *"（每天早上8点）

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)

  const todayStr = today.toISOString().split('T')[0]
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // 拉取今天 & 明天截止、尚未完成的任务
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, title, due_date, assigned_to')
    .in('status', ['pending', 'in_progress'])
    .or(`due_date.eq.${todayStr},due_date.eq.${tomorrowStr}`)

  if (error || !tasks?.length) {
    return new Response(JSON.stringify({ message: '没有即将截止的任务' }), { status: 200 })
  }

  const notifications = []

  for (const task of tasks) {
    const dueDate = task.due_date
    const isToday = dueDate === todayStr
    const assignedUsers: string[] = Array.isArray(task.assigned_to)
      ? task.assigned_to
      : [task.assigned_to]

    for (const userId of assignedUsers) {
      if (!userId) continue

      // 检查今天是否已经发过同类提醒，避免重复
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('related_id', task.id)
        .eq('type', isToday ? 'deadline_today' : 'deadline_tomorrow')
        .gte('created_at', new Date().toISOString().split('T')[0])
        .maybeSingle()

      if (existing) continue // 今天已发过，跳过

      notifications.push({
        user_id: userId,
        type: isToday ? 'deadline_today' : 'deadline_tomorrow',
        title: isToday ? '⚠️ 任务今天截止！' : '📅 任务明天截止',
        body: `「${task.title}」${isToday ? '今天' : '明天'}到期，请尽快完成。`,
        related_id: task.id,
        is_read: false,
      })
    }
  }

  if (notifications.length === 0) {
    return new Response(JSON.stringify({ message: '无需发送新提醒' }), { status: 200 })
  }

  const { error: insertError } = await supabase
    .from('notifications')
    .insert(notifications)

  if (insertError) {
    return new Response(JSON.stringify({ error: insertError.message }), { status: 500 })
  }

  return new Response(
    JSON.stringify({ message: `成功发送 ${notifications.length} 条截止提醒` }),
    { status: 200 }
  )
})
