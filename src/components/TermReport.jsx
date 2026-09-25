import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { supabase } from '../supabaseClient'
import './TermReport.css'

const money = n => Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const cents = n => Math.round(Number(n || 0) * 100)
export default function TermReport({ lang, roleLabel }) {
  const t = (zh,en) => lang === 'zh' ? zh : en
  const [open,setOpen] = useState(false)
  const [year,setYear] = useState(new Date().getFullYear())
  const [half,setHalf] = useState(new Date().getMonth()<6 ? 1 : 2)
  const [data,setData] = useState(null)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const dialog = useRef(null)
  const version = useRef(0)
  useEffect(() => { if(open) dialog.current?.showModal() },[open])
  const close = () => {version.current++;setOpen(false);setData(null);setBusy(false)}
  const load = async () => {
    const request=++version.current
    setBusy(true);setError('');setData(null)
    try {
      const result=await supabase.rpc('club_term_report',{p_year:Number(year),p_half:Number(half)})
      if(result.error) throw result.error
      if(request===version.current) setData({...result.data,year:Number(year),half:Number(half)})
    } catch(e) { if(request===version.current) setError(e.message?.includes('REPORT_FORBIDDEN') ? t('需要学期切换及财政查看权限。','Handover and finance viewing permissions are required.') : ['PGRST202','42883'].includes(e.code) ? t('请先运行半年／年度报告 SQL。','Run the term report SQL first.') : e.message) }
    finally {if(request===version.current)setBusy(false)}
  }
  const table=(headers,rows)=><div className="term-table-scroll"><table><thead><tr>{headers.map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{rows.length ? rows.map((r,i)=><tr key={i}>{r.map((v,j)=><td key={j}>{v ?? '—'}</td>)}</tr>) : <tr><td colSpan={headers.length}>{t('无记录','No records')}</td></tr>}</tbody></table></div>
  const finance=data?.finance
  const income=(finance?.entries||[]).filter(e=>Number(e.amount)>0)
  const expenses=(finance?.entries||[]).filter(e=>Number(e.amount)<0)
  const bd=cents(finance?.opening),cd=cents(finance?.closing)
  const debit=Math.max(bd,0)+income.reduce((s,e)=>s+cents(e.amount),0)+Math.max(-cd,0)
  const credit=Math.max(-bd,0)-expenses.reduce((s,e)=>s+cents(e.amount),0)+Math.max(cd,0)
  const fmt=data?.formats?.find(f=>f.lang===lang)
  const title=fmt?.title && !['一中华文学会 · 收支账目','CLC_sys · Financial Statement'].includes(fmt.title) ? fmt.title.replaceAll('{year}',String(data?.year)) : t(`${data?.year}年社团财政报告`,`${data?.year} Club Financial Report`)
  return <>
    <button type="button" className="term-report-launch" onClick={()=>setOpen(true)}><Printer size={18}/>{t('打印半年／年度报告','Print Half-year / Annual Report')}</button>
    {open && createPortal(<dialog ref={dialog} className={`term-report-shell ${data?'term-report-ready':''}`} onCancel={e=>{e.preventDefault();close()}}>
      <div className="term-report-controls"><h2>{t('半年／年度报告','Half-year / Annual Report')}</h2><button onClick={close} aria-label={t('关闭','Close')}><X size={20}/></button>
        <label>{t('年份','Year')}<input type="number" min="2000" max="2100" value={year} onChange={e=>{version.current++;setBusy(false);setData(null);setYear(e.target.value)}}/></label>
        <label>{t('报告范围','Period')}<select value={half} onChange={e=>{version.current++;setBusy(false);setData(null);setHalf(Number(e.target.value))}}><option value="1">{t('上半年','First half')}</option><option value="2">{t('下半年','Second half')}</option><option value="0">{t('全年','Full year')}</option></select></label>
        <button disabled={busy || !Number.isInteger(Number(year)) || Number(year)<2000 || Number(year)>2100} onClick={load}>{busy?t('生成中…','Generating…'):t('生成预览','Generate preview')}</button>
        <button disabled={!data||busy} onClick={()=>window.print()}><Printer size={17}/>{t('打印 / 保存 PDF','Print / Save PDF')}</button>
        <p>{t('名单取所选学期；库存为生成时现存量；账簿始终为所选年份全年。','Rosters use the selected term; stock is current at generation; the ledger always covers the full selected year.')}</p>
        {error&&<p role="alert">{error}</p>}
      </div>
      {data&&<article className="term-report-document">
        <header><h1>{t('一中华文学会','CLC_sys')} · {data.year} {data.half===0?t('年度报告','Annual Report'):data.half===1?t('上半年报告','First-half Report'):t('下半年报告','Second-half Report')}</h1><p>{data.start} — {data.end}</p><p>{t('生成日期','Generated')}: {new Date(data.generated_at).toLocaleDateString(lang==='zh'?'zh-CN':'en-GB',{timeZone:'Asia/Kuala_Lumpur'})}</p></header>
        <section><h2>{t('会员与执委名单','Membership and Executive Rosters')}</h2>{!data.rosters.length&&<p>{t('所选期间没有学期名单，不以当前账号代替。','No roster exists for this period; current accounts are not substituted.')}</p>}{data.rosters.map((r,i)=><div key={i}><h3>{r.session}</h3>{table([t('姓名','Name'),t('职位','Position')],r.members.map(m=>[m.name,m.position||roleLabel(m,lang)]))}</div>)}</section>
        <section><h2>{t('筹委团名单','Committee Rosters')}</h2>{!data.committees.length&&<p>{t('无记录','No records')}</p>}{data.committees.map((g,i)=><div key={i}><h3>{g.name} · {g.session}</h3>{table([t('姓名','Name'),t('筹委职位','Committee position')],g.members.map(m=>[m.name,m.position]))}</div>)}</section>
        <section><h2>{t('请假记录','Leave Records')}</h2>{table([t('日期','Date'),t('姓名','Name'),t('类型','Type'),t('原因','Reason')],data.leaves.map(l=>[l.leave_date,l.applicant_name,({sick:t('病假','Sick'),official:t('公假','Official'),personal:t('事假','Personal')})[l.leave_type]||l.custom_leave_type||l.leave_type,l.reason]))}</section>
        <section><h2>{t('活动与会议时间轴','Events and Meetings Timeline')}</h2>{!data.events.length&&<p>{t('无记录','No records')}</p>}<ol className="term-timeline">{data.events.map((e,i)=><li key={i}><time>{e.date}</time><strong>{e.title}</strong><span>{e.type==='meeting'?t('会议','Meeting'):t('学会活动','Club activity')}</span>{e.notes&&<p>{e.notes}</p>}</li>)}</ol></section>
        <section><h2>{t('现存物品','Current Inventory')}</h2><p>{t('生成当天库存，不是所选期间的期末快照；不计已遗失或损坏物品。','Current stock, not a historical period-end snapshot. Lost or damaged items are excluded.')}</p>{table([t('类别','Category'),t('物品','Item'),t('可用','Available'),t('预留','Reserved'),t('借出未还','On loan'),t('单位','Unit')],data.inventory.map(i=>[i.category,i.name,i.available,i.reserved,i.on_loan,i.unit]))}</section>
        <section className="term-finance"><header><h2>{title}</h2><p>{fmt?.club_label||t('社团/学会','Club/Society')} : {fmt?.club_name||t('一中华文学会','CLC_sys')}</p><p>({data.year}-01-01 — {data.year}-12-31)</p></header>
          {table(['','','RM','RM'],[[t('收入','Income'),'b/d',bd>=0?money(bd/100):'',bd<0?money(-bd/100):''],...income.map(e=>['',e.description,money(e.amount),'']),...expenses.map((e,i)=>[i===0?t('支出','Expenses'):'',e.description,'',money(-Number(e.amount))]),['','c/d',cd<0?money(-cd/100):'',cd>=0?money(cd/100):''],[fmt?.total||t('总收入','Total'),'',money(debit/100),money(credit/100)]])}
          <footer className="term-signatures"><div>{[t('召集老师/指导老师','Convener/Advisor'),t('主席','President'),t('财政','Treasurer')].map(s=><p key={s}>____________________<br/>{s}<br/><span className="term-signature-name"><span>(</span><span>)</span></span></p>)}</div><p>{t('日期','Date')}: {new Date(data.generated_at).toLocaleDateString('en-GB',{timeZone:'Asia/Kuala_Lumpur'})}</p></footer>
        </section>
      </article>}
    </dialog>,document.body)}
  </>
}
