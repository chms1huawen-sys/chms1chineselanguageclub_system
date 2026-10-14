const teachers = ['convener_teacher', 'advisor_teacher', 'advisor']

export function canReviewFinanceStage(profile, stage) {
  if (!profile || profile.is_active === false) return false
  const teacher = teachers.includes(profile.role)
  if (stage === 'teacher') return teacher
  if (teacher) return false
  if (stage === 'treasury') return profile.role !== 'chairperson' &&
    (['treasurer', 'vice_treasurer'].includes(profile.role) || profile.can_manage_finance === true)
  if (stage === 'president') return profile.role === 'chairperson' || profile.can_approve_finance === true
  return false
}
