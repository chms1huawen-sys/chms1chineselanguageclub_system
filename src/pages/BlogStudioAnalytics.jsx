import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../supabaseClient'

const dateString = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`
export default function StudioAnalytics({ en }) {
  const today = new Date()
  const [start,setStart] = useState(dateString(new Date(today.getFullYear(),today.getMonth(),1)))
  const [end,setEnd] = useState(dateString(today))
  const [data,setData] = useState(null)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const t = (zh,english) => en ? english : zh
  async function load(from,to) {
    setBusy(true);setError('')
    try {
      const exclusive = new Date(`${to}T12:00:00`);exclusive.setDate(exclusive.getDate()+1)
      const result = await supabase.rpc('blog_analytics_report',{p_start:from,p_end:dateString(exclusive)})
      if(result.error) throw result.error
      setData(result.data)
    } catch(err){setError(err.message)} finally{setBusy(false)}
  }
  useEffect(()=>{const now=new Date();const timer=setTimeout(()=>load(dateString(new Date(now.getFullYear(),now.getMonth(),1)),dateString(now)),0);return()=>clearTimeout(timer)},[])
  const max = Math.max(1,...(data?.daily||[]).map(d=>Number(d.views)))
  return <section><form className="bs-inline" onSubmit={e=>{e.preventDefault();load(start,end)}}><label>{t('开始日期','Start date')}<input required type="date" value={start} max={end} onChange={e=>setStart(e.target.value)}/></label><label>{t('结束日期','End date')}<input required type="date" min={start} value={end} onChange={e=>setEnd(e.target.value)}/></label><button disabled={busy}><RefreshCw size={16}/>{t('查询','Apply')}</button></form>
    <p className="bs-muted">{t('仅统计同意统计的公开网页访问；访客数按浏览器估算，并非真实人数。重复的一分钟内同页访问会合并。管理员与本地预览不计入。日期以马来西亚时间为准，最多查询366天。','Consenting public-page visits only. Visitors are estimated browsers, not people. Same-page visits within a minute are merged. Editors and local previews are excluded. Malaysia dates; up to 366 days.')}</p>
    {error&&<p className="bs-alert bs-error" role="alert">{error}</p>}{busy&&<p role="status">{t('载入中…','Loading…')}</p>}
    {data&&<><div className="bs-stats">{[[t('浏览次数','Page views'),data.views],[t('访客浏览器（估算）','Estimated browsers'),data.visitors],[t('浏览会话','Sessions'),data.sessions]].map(([name,value])=><div key={name}><span>{name}</span><strong>{value||0}</strong></div>)}</div>
    <h2>{t('每日访问','Daily visits')}</h2><div className="bs-chart">{(data.daily||[]).map(d=><div className="bs-chart-row" key={d.date}><span>{d.date}</span><meter min="0" max={max} value={d.views}/><strong>{d.views}</strong></div>)}</div>
    <h2>{t('热门页面','Popular pages')}</h2><div className="bs-table-wrap"><table className="bs-table"><thead><tr><th>{t('页面','Page')}</th><th>{t('浏览次数','Views')}</th><th>{t('访客浏览器','Browsers')}</th></tr></thead><tbody>{(data.pages||[]).map(p=><tr key={p.path}><td>{p.path}</td><td>{p.views}</td><td>{p.visitors}</td></tr>)}</tbody></table></div>
    <h2>{t('访问来源','Referring sites')}</h2><div className="bs-table-wrap"><table className="bs-table"><tbody>{(data.sources||[]).map(s=><tr key={s.source}><td>{s.source==='(direct)'?t('直接访问／未知','Direct / unknown'):s.source}</td><td>{s.views}</td></tr>)}</tbody></table></div>
    <h2>{t('最近访问（最多100条）','Recent visits (up to 100)')}</h2><div className="bs-table-wrap"><table className="bs-table"><thead><tr>{[t('时间','Time'),t('页面','Page'),t('来源','Source'),t('设备尺寸','Device size')].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>{(data.recent||[]).map((r,i)=><tr key={i}><td>{new Date(r.visited_at).toLocaleString(en?'en-MY':'zh-CN',{timeZone:'Asia/Kuala_Lumpur'})}</td><td>{r.path}</td><td>{r.source}</td><td>{en?r.device:({mobile:'手机',tablet:'平板',desktop:'电脑'}[r.device]||r.device)}</td></tr>)}</tbody></table></div>{!data.views&&<p className="bs-empty">{t('此期间尚无访问记录。','No visits recorded in this period.')}</p>}</>}
  </section>
}
