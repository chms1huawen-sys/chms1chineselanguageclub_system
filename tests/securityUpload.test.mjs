import test from 'node:test'
import assert from 'node:assert/strict'
import { fileTypeFromBuffer } from 'file-type'
import { imageSize } from 'image-size'
import { PDFDocument, PDFDict, PDFArray, PDFName, PDFString } from 'pdf-lib'
import { readFile } from 'node:fs/promises'
import { uploadTarget, readUpload, validateUpload } from '../supabase/functions/secure-upload/validation.js'
const parsers = { fileTypeFromBuffer, imageSize, PDFDocument, PDFDict, PDFArray, PDFName }

test('upload path and streaming limits reject bypasses', async () => {
  const target = uploadTarget('avatars','member/a.jpg','image/jpeg')
  assert.equal(target.maxBytes,5*1024*1024)
  for (const path of ['../a.jpg','a//b.jpg','a/%2e%2e/b.jpg','a/b.svg','a/b.jpg%00']) {
    assert.throws(()=>uploadTarget('avatars',path,'image/jpeg'))
  }
  assert.throws(()=>uploadTarget('avatars','a/b.pdf','application/pdf'))
  assert.throws(()=>uploadTarget('unknown','a/b.jpg','image/jpeg'))
  await assert.rejects(readUpload(new Request('https://example.invalid',{method:'POST',body:new Uint8Array(20)}),10),e=>e.status===413)
  await assert.rejects(readUpload(new Request('https://example.invalid',{method:'POST',body:''}),10))
})

test('actual file bytes, dimensions and PDF content are checked', async () => {
  const image = await readFile(new URL('../public/login-group-2026.jpeg',import.meta.url))
  await validateUpload(image,uploadTarget('avatars','a/b.jpg','image/jpeg'),parsers)
  await assert.rejects(validateUpload(image,uploadTarget('avatars','a/b.png','image/png'),parsers))
  await assert.rejects(validateUpload(new TextEncoder().encode('<svg onload="alert(1)"></svg>'),uploadTarget('avatars','a/b.jpg','image/jpeg'),parsers))
  const pdf = await PDFDocument.create()
  pdf.addPage()
  const target = uploadTarget('finance-receipts','a/b.pdf','application/pdf')
  await validateUpload(await pdf.save(),target,parsers)
  pdf.catalog.set(PDFName.of('OpenAction'),pdf.context.obj({ S:PDFName.of('JavaScript'), JS:PDFString.of('app.alert(1)') }))
  await assert.rejects(validateUpload(await pdf.save(),target,parsers))
  await assert.rejects(validateUpload(new TextEncoder().encode('%PDF-1.7 broken'),target,parsers))
})
