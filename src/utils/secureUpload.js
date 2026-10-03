import { supabase } from '../supabaseClient'

export async function secureUpload(bucket, path, file) {
  const result = await supabase.functions.invoke('secure-upload', {
    body: file,
    headers: { 'Content-Type': file.type, 'x-upload-bucket': bucket, 'x-upload-path': encodeURIComponent(path) },
  })
  if (result.error) {
    const status = result.error.context?.status
    const message = status === 400 ? '文件内容或格式不符合要求，请换一份图片或普通 PDF。' : status === 413 ? '文件超过大小限制。' : status === 429 ? '上传次数较多，请稍后继续。' : status === 403 ? '没有上传权限，请联系管理员。' : '上传失败，请检查网络后重试。'
    return { data: null, error: Object.assign(new Error(message), { status }) }
  }
  return result
}
