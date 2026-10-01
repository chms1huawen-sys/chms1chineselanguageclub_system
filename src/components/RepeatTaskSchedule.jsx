import { weeklyTaskPreview, taskScheduleDate } from '../utils/taskSchedule'
import './RepeatTaskSchedule.css'

export default function RepeatTaskSchedule({ value, onChange, lang }) {
  const t = (zh, en) => lang === 'zh' ? zh : en
  const update = patch => onChange({ ...value, ...patch })
  const preview = weeklyTaskPreview({ first: value.repeat_first, immediate: value.repeat_immediate, weekday: value.repeat_weekday, time: value.repeat_time, count: value.repeat_count })
  const weekdays = lang === 'zh' ? ['星期日','星期一','星期二','星期三','星期四','星期五','星期六'] : ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  return <section className="repeat-schedule">
    <label className="repeat-enable"><input type="checkbox" checked={value.repeat_enabled} onChange={e => update({ repeat_enabled: e.target.checked })}/>{t('每周重复发布','Publish weekly')}</label>
    {value.repeat_enabled && <>
      <fieldset><legend>{t('首次发布','First publication')}</legend>
        <label><input type="radio" name="repeat-first" checked={value.repeat_immediate} onChange={() => update({ repeat_immediate: true })}/>{t('现在发布第一期','Publish the first task now')}</label>
        <label><input type="radio" name="repeat-first" checked={!value.repeat_immediate} onChange={() => update({ repeat_immediate: false })}/>{t('指定首次发布时间','Schedule the first task')}</label>
        {!value.repeat_immediate && <input aria-label={t('首次发布时间（马来西亚）','First publication (Malaysia)')} type="datetime-local" required value={value.repeat_first || ''} onChange={e => update({ repeat_first: e.target.value })}/>}
      </fieldset>
      <div className="repeat-fields">
        <label>{t('每次截止星期','Weekly deadline day')}<select value={value.repeat_weekday} onChange={e => update({ repeat_weekday: e.target.value })}>{weekdays.map((day, i) => <option key={i} value={i}>{day}</option>)}</select></label>
        <label>{t('每次截止时间','Weekly deadline time')}<input type="time" required value={value.repeat_time} onChange={e => update({ repeat_time: e.target.value })}/></label>
        <label>{t('发布次数','Number of tasks')}<input type="number" required min="1" max="12" value={value.repeat_count} onChange={e => update({ repeat_count: e.target.value })}/></label>
      </div>
      <p className="repeat-zone">{t('马来西亚时间 · 每周在首次发布的同一星期、同一时间发布','Malaysia time · Repeats at the first publication’s weekday and time')}</p>
      {preview.length > 0 && <ol className="repeat-preview">{preview.map((item, i) => <li key={item.publish}><strong>{t(`第 ${i+1} 期`,`Task ${i+1}`)}</strong><span>{t('发布：','Publish: ')}{taskScheduleDate(item.publish,lang)}</span><span>{t('截止：','Due: ')}{taskScheduleDate(item.due,lang)}</span></li>)}</ol>}
    </>}
  </section>
}
