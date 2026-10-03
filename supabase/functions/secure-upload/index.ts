import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fileTypeFromBuffer } from 'npm:file-type@22.1.1'
import { imageSize } from 'npm:image-size@2.0.4'
import { PDFDocument, PDFDict, PDFArray, PDFName } from 'npm:pdf-lib@1.17.1'
import { createUploadHandler } from './handler.js'

Deno.serve(createUploadHandler({
  createClient,
  parsers: { fileTypeFromBuffer, imageSize, PDFDocument, PDFDict, PDFArray, PDFName },
  env: name => Deno.env.get(name),
}))
