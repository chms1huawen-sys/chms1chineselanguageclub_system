// Missing historical timestamps must not count as on-time completions.
export function taskPerformance(tasks, now = Date.now()) {
  const completed = tasks.filter(task => task.status === 'completed')
  const validDate = value => value && Number.isFinite(Date.parse(value))
  const timed = completed.filter(task => validDate(task.due_date) && validDate(task.completed_at))
  const completedLate = timed.filter(task => Date.parse(task.completed_at) > Date.parse(task.due_date)).length
  const activeOverdue = tasks.filter(task => task.status !== 'completed' && validDate(task.due_date) && Date.parse(task.due_date) < now).length
  const needHelp = tasks.filter(task => task.status === 'need_help').length
  const unknownTiming = completed.length - timed.length
  return {
    total: tasks.length, completed: completed.length,
    pending: tasks.filter(task => task.status === 'pending').length,
    inProgress: tasks.filter(task => task.status === 'in_progress').length,
    needHelp, activeOverdue, completedLate, unknownTiming,
    onTime: timed.length - completedLate, timedCompleted: timed.length,
    onTimeRate: timed.length ? Math.round((timed.length - completedLate) / timed.length * 100) : null,
    overdue: activeOverdue + completedLate,
    completionRate: tasks.length ? Math.round(completed.length / tasks.length * 100) : 0,
    assessment: !tasks.length ? 'none' : activeOverdue ? 'overdue' : needHelp ? 'help' : completedLate ? 'late' : unknownTiming ? 'unknown' : completed.length === tasks.length ? 'done' : 'open',
  }
}
