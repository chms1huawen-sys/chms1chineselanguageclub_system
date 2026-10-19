import { writeFile } from 'node:fs/promises'
import { PUBLIC_ORIGIN } from '../src/utils/siteOrigins.js'

const routes=['/','/literature','/activities','/bookroom','/news','/about','/api/blog-public','/logo-192.png']
const queue=Array.from({length:3},()=>routes).flat()
const maximumBytes=4*1024*1024
const results=[]
const controller=new AbortController()
let bytes=0
async function worker(){
  while(queue.length && !controller.signal.aborted){
    const path=queue.shift(),start=performance.now()
    try{
      const response=await fetch(PUBLIC_ORIGIN+path,{redirect:'manual',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(15000)])})
      let size=0
      for await(const chunk of response.body||[]){
        size+=chunk.byteLength;bytes+=chunk.byteLength
        if(bytes>maximumBytes)throw new Error('Download budget exceeded')
      }
      const item={path,status:response.status,milliseconds:Math.round(performance.now()-start),bytes:size,cacheControl:response.headers.get('cache-control'),cacheStatus:response.headers.get('cf-cache-status')}
      results.push(item)
      if(response.status!==200)throw new Error('Unexpected response')
    }catch(error){
      results.push({path,error:error.name})
      controller.abort()
    }
  }
}
await Promise.all(Array.from({length:4},worker))
const timings=results.filter(x=>x.status===200).map(x=>x.milliseconds).sort((a,b)=>a-b)
const report={checkedAt:new Date().toISOString(),kind:'small-single-client-http-burst-not-capacity-certification',origin:PUBLIC_ORIGIN,limits:{requests:24,concurrency:4,decodedBytes:maximumBytes},requestsCompleted:timings.length,decodedBytes:bytes,p50ms:timings[Math.ceil(timings.length*.5)-1]??null,p95ms:timings[Math.ceil(timings.length*.95)-1]??null,passed:timings.length===24&&results.length===24,results}
await writeFile('test-results/public-burst-20261019.json',JSON.stringify(report,null,2))
console.log(JSON.stringify(report))
if(!report.passed)process.exitCode=1
