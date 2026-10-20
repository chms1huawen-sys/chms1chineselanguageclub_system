export const canEditOwnLeave = (profile, application) => profile?.is_active === true && !!profile.id && application?.user_id === profile.id

export function leaveEditValues(form) {
  return {
    leave_type: form.leave_type,
    custom_leave_type: form.leave_type === 'custom' ? form.custom_leave_type.trim() : null,
    leave_date: form.leave_date,
    reason: form.reason.trim(),
    drive_file_url: form.drive_file_url.trim() || null,
    attachment_uploaded: form.attachment_uploaded === true,
  }
}
