const limits = { avatars: 5, 'inventory-photos': 5, 'blog-photos': 10, 'blog-site-media': 10, 'finance-receipts': 20 }
const fail = (status = 400) => { throw Object.assign(new Error('Invalid upload.'), { status }) }

export function uploadTarget(bucket, encodedPath, mime) {
  let path
  try { path = decodeURIComponent(encodedPath || '') } catch { fail() }
  const limit = limits[bucket]
  if (!limit || !path || path.length > 500 || !/^[a-zA-Z0-9][a-zA-Z0-9/._-]*$/.test(path) || path.split('/').some(p => !p || p === '.' || p === '..')) fail()
  const types = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'] }
  if (bucket === 'finance-receipts') types['application/pdf'] = ['pdf']
  const extension = path.split('.').pop().toLowerCase()
  if (!types[mime]?.includes(extension)) fail()
  return { bucket, path, mime, maxBytes: limit * 1024 * 1024 }
}

export async function readUpload(request, maxBytes) {
  if (Number(request.headers.get('content-length')) > maxBytes) fail(413)
  const reader = request.body?.getReader()
  if (!reader) fail()
  const chunks = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > maxBytes) { await reader.cancel(); fail(413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  if (!length) fail()
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

export async function validateUpload(bytes, target, { fileTypeFromBuffer, imageSize, PDFDocument, PDFDict, PDFArray, PDFName }) {
  try {
    const detected = await fileTypeFromBuffer(bytes)
    if (detected?.mime !== target.mime) fail()
    if (target.mime !== 'application/pdf') {
      const dimensions = imageSize(bytes)
      const expected = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[target.mime]
      if (dimensions.type !== expected || !dimensions.width || !dimensions.height || dimensions.width > 20000 || dimensions.height > 20000 || dimensions.width * dimensions.height > 40000000) fail()
      return
    }
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false })
    if (pdf.getPageCount() < 1 || pdf.getPageCount() > 1000) fail()
    const seen = new Set()
    const blocked = new Set(['JS', 'JavaScript', 'OpenAction', 'AA', 'Launch', 'EmbeddedFiles', 'EmbeddedFile', 'RichMedia', 'XFA', 'SubmitForm', 'ImportData', 'GoToR'])
    let visited = 0
    function inspect(object, depth = 0) {
      if (!object || seen.has(object)) return
      if (++visited > 50000 || depth > 100) fail()
      seen.add(object)
      if (object instanceof PDFName && blocked.has(object.decodeText())) fail()
      if (object instanceof PDFDict) {
        for (const [key, value] of object.entries()) {
          if (blocked.has(key.decodeText())) fail()
          inspect(value, depth + 1)
        }
      } else if (object instanceof PDFArray) {
        for (const value of object.asArray()) inspect(value, depth + 1)
      } else if (object.dict instanceof PDFDict) inspect(object.dict, depth + 1)
    }
    for (const [, object] of pdf.context.enumerateIndirectObjects()) inspect(object)
  } catch (error) {
    if (error?.status === 413) throw error
    fail()
  }
}
