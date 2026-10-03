import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileTypeFromBuffer } from 'file-type'
import { imageSize } from 'image-size'
import { PDFDocument, PDFDict, PDFArray, PDFName } from 'pdf-lib'
import { createUploadHandler } from '../supabase/functions/secure-upload/handler.js'

const parsers = { fileTypeFromBuffer, imageSize, PDFDocument, PDFDict, PDFArray, PDFName }
const actor = '10000000-0000-0000-0000-000000000001'
const request = (body, headers = {}, method = 'POST') => new Request('https://example.invalid', {
  method, body: ['GET','OPTIONS'].includes(method) ? undefined : body,
  headers: { authorization:'Bearer fixture-session',origin:'https://chms1chineselanguageclubsystem.vercel.app','content-type':'image/jpeg','x-upload-bucket':'avatars','x-upload-path':`${actor}/photo.jpg`, ...headers },
})
function setup(overrides = {}) {
  const calls = []
  const state = { authorized:true,permission:true,rate:true,storageError:null, ...overrides }
  const user = {
    auth: { getUser:async () => ({data:{user:state.authorized?{id:actor}:null},error:state.authorized?null:new Error('fixture')}) },
    rpc:async (name,args) => { calls.push({name,args}); return {data:state.permission,error:null} },
  }
  const service = {
    rpc:async (name,args) => {calls.push({name,args}); return {data:state.rate,error:null}},
    storage: {from:bucket => ({upload:async (path,bytes,options) => {calls.push({stored:true,bucket,path,bytes,options}); return {data:{path},error:state.storageError} }})},
  }
  const handler = createUploadHandler({createClient:(_url,_key,options) => options.global?user:service,parsers,env:()=> 'fixture-config',log:()=>{}})
  return {handler,calls}
}

test('all five bucket payloads go through authorization and validation before a non-overwriting storage call', async () => {
  const photo = await readFile(new URL('../public/login-group-2026.jpeg',import.meta.url))
  const pdf = await PDFDocument.create(); pdf.addPage()
  for (const bucket of ['avatars','inventory-photos','blog-photos','blog-site-media','finance-receipts']) {
    const {handler,calls} = setup()
    const isPdf = bucket==='finance-receipts'
    const path = `${actor}/photo.${isPdf?'pdf':'jpg'}`
    const response = await handler(request(isPdf?await pdf.save():photo,{'x-upload-bucket':bucket,'x-upload-path':path,'content-type':isPdf?'application/pdf':'image/jpeg'}))
    assert.equal(response.status,200)
    assert.deepEqual(await response.json(),{path})
    assert.equal(calls[0].name,'can_upload_validated_file')
    assert.equal(calls[1].name,'consume_upload_rate_limit')
    assert.equal(calls[2].bucket,bucket)
    assert.equal(calls[2].options.upsert,false)
    assert.equal(calls.filter(c=>c.stored).length,1)
  }
})

test('rejected uploads cannot create storage objects, and storage failure details stay private', async () => {
  const photo = await readFile(new URL('../public/login-group-2026.jpeg',import.meta.url))
  for (const [state,body,headers,status] of [
    [{authorized:false},photo,{},401],
    [{permission:false},photo,{},403],
    [{rate:false},photo,{},429],
    [{},'not a JPEG',{},400],
    [{},photo,{'content-length':String(6*1024*1024)},413],
    [{},photo,{origin:'https://evil.example'},403],
  ]) {
    const {handler,calls}=setup(state)
    assert.equal((await handler(request(body,headers))).status,status)
    assert.equal(calls.filter(c=>c.stored).length,0)
  }
  const {handler}=setup({storageError:{message:'private server credential detail'}})
  const response=await handler(request(photo))
  assert.equal(response.status,503)
  assert.doesNotMatch(await response.text(),/credential|detail/)
  assert.equal((await handler(request(null,{},'GET'))).status,405)
  assert.equal((await handler(request(null,{},'OPTIONS'))).status,204)
})
