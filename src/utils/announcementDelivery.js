export async function announcementDelivery(send, lang = 'zh', editing = false) {
  const zh = lang === 'zh'
  try {
    const result = await send()
    if (editing) return { type: 'success', message: zh ? '公告及站内通知已更新；不会再次推送手机通知。' : 'Announcement and in-app notifications updated; no new phone push was sent.' }
    const sent = Number(result?.push_sent || 0)
    const failed = Number(result?.push_failed || 0)
    const skipped = Number(result?.push_skipped || 0)
    return {
      type: failed ? 'error' : 'success',
      message: zh
        ? `公告已发布。推送服务接受 ${sent} 次设备发送，失败 ${failed} 次，跳过 ${skipped} 位接收人。接受发送不代表手机已显示；请勿重复发布。`
        : `Announcement published. Push service accepted ${sent} device sends; ${failed} failed; ${skipped} recipients skipped. Acceptance does not confirm display on a phone. Do not republish.`,
    }
  } catch {
    return {
      type: 'error',
      message: zh
        ? '公告已保存，但通知同步或推送未能确认成功。请勿重复发布；请检查通知服务记录。'
        : 'Announcement saved, but notification sync or delivery could not be confirmed. Do not republish; check notification service logs.',
    }
  }
}
