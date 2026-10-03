import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fileTypeFromBuffer } from 'npm:file-type@22.1.1'
import { imageSize } from 'npm:image-size@2.0.4'
import { PDFDocument, PDFDict, PDFArray, PDFName } from 'npm:pdf-lib@1.17.1'
import { pushCors } from '../send-push-notification/input.js'
import { uploadTarget, readUpload, validateUpload } from './validation.js'

Deno.serve(async request => {
  const cors = pushCors(request.headers.get('origin'), Deno.env.get('ALLOWED_ORIGINS') || '')
  const headers = { ...cors, 'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type, x-upload-bucket, x-upload-path' }
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers })
  if (!cors) return Response.json({ error: 'Origin not allowed.' }, { status: 403 })
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized.' }, 401)
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const user = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
    const { data: session, error: authError } = await user.auth.getUser(authorization.slice(7))
    if (authError || !session.user) return json({ error: 'Unauthorized.' }, 401)
    const target = uploadTarget(request.headers.get('x-upload-bucket'), request.headers.get('x-upload-path'), request.headers.get('content-type')?.split(';')[0].trim().toLowerCase())
    const permission = await user.rpc('can_upload_validated_file', { p_bucket: target.bucket, p_path: target.path })
    if (permission.error || permission.data !== true) return json({ error: 'Upload not permitted.' }, 403)
    const service = createClient(url, Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
    const rate = await service.rpc('consume_upload_rate_limit', { p_actor: session.user.id })
    if (rate.error) return json({ error: 'Upload service unavailable.' }, 503)
    if (!rate.data) return json({ error: 'Too many uploads. Please retry later.' }, 429)
    const bytes = await readUpload(request, target.maxBytes)
    await validateUpload(bytes, target, { fileTypeFromBuffer, imageSize, PDFDocument, PDFDict, PDFArray, PDFName })
    const result = await service.storage.from(target.bucket).upload(target.path, bytes, { contentType: target.mime, cacheControl: '86400', upsert: false })
    if (result.error) {
      console.error('Validated upload storage failure', result.error.message)
      return json({ error: 'Unable to store file.' }, 503)
    }
    return json({ path: result.data.path })
  } catch (error) {
    const status = [400, 413].includes(error?.status) ? error.status : 500
    if (status === 500) console.error('Validated upload failed', String(error))
    return json({ error: status === 413 ? 'File too large.' : status === 400 ? 'File content or format is invalid or unsupported.' : 'Upload service unavailable.' }, status)
  }
})
