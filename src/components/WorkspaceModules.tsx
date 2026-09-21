import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Users, Settings, FileText, ShieldCheck, ClipboardList, Save, Eye, Search, Plus, History, Lock, LockOpen, SlidersHorizontal, MoreHorizontal } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application={id:string;name:string;description:string|null;status:'draft'|'published'|'screening'|'closed'|'completed';deadline:string|null;target_count:number|null;created_at:string}
type FormSummary={application:Application;version:number|null;versionStatus:'draft'|'published'|'none';questionCount:number;submissionCount:number;publicSlug:string|null;settings?:FormSettings}
async function loadFormSummaries(applications:Application[]):Promise<FormSummary[]>{
 if(!applications.length)return []
 const ids=applications.map(a=>a.id)
 const results=await Promise.all([
  supabase.from('form_versions').select('id,application_id,version_number,status').in('application_id',ids).order('version_number',{ascending:false}),
  supabase.from('submissions').select('id,application_id').in('application_id',ids),
  supabase.from('application_settings').select('application_id,public_slug').in('application_id',ids)
 ])
 const versions=results[0].data||[];if(results[0].error)throw results[0].error
 const submissions=results[1].data||[];if(results[1].error)throw results[1].error
 const settings=results[2].data||[];if(results[2].error)throw results[2].error
 const latest=new Map<string,any>();for(const v of versions){if(!latest.has(v.application_id))latest.set(v.application_id,v)}
 const latestIds=Array.from(latest.values()).map(v=>v.id);const counts=new Map<string,number>()
 if(latestIds.length){const {data,error}=await supabase.from('questions').select('id,form_version_id').in('form_version_id',latestIds);if(error)throw error;for(const q of data||[])counts.set(q.form_version_id,(counts.get(q.form_version_id)||0)+1)}
 const submissionCounts=new Map<string,number>();for(const s of submissions)submissionCounts.set(s.application_id,(submissionCounts.get(s.application_id)||0)+1)
 const slugs=new Map<string,string|null>();for(const s of settings)slugs.set(s.application_id,s.public_slug)
 return applications.map(application=>{const v=latest.get(application.id);const raw=(settings as any[]).find(s=>s.application_id===application.id);return {application,version:v?.version_number??null,versionStatus:v?.status??'none',questionCount:v?counts.get(v.id)||0:0,submissionCount:submissionCounts.get(application.id)||0,publicSlug:slugs.get(application.id)||null,settings:raw?{start_date:raw.start_date??null,submission_limit:raw.submission_limit??null,confirmation_message:raw.confirmation_message??'Thank you. Your application has been received.',applicant_instructions:raw.applicant_instructions??null}:undefined}})
}
type FormSettings={start_date:string|null;submission_limit:number|null;confirmation_message:string;applicant_instructions:string|null}
type Profile={id:string;full_name:string|null;role:string;organization_id:string|null}

function ModuleList({title,eyebrow,description,icon:Icon,applications,onOpen}:{title:string;eyebrow:string;description:string;icon:any;applications:Application[];onOpen:(a:Application)=>void}){
 return <section><div className="page-heading compact"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{description}</p></div></div><div className="card table-card"><div className="card-header"><div><h2>{title} by programme</h2><p>Choose a programme to continue.</p></div></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Deadline</th><th></th></tr></thead><tbody>{applications.length?applications.map(a=><tr key={a.id}><td><strong>{a.name}</strong><span className="table-sub">{a.description||'No description yet.'}</span></td><td><span className={'status '+(a.status==='published'?'blue':'neutral')}>{a.status}</span></td><td>{a.deadline?new Date(a.deadline).toLocaleDateString():'—'}</td><td><button className="secondary-button" onClick={()=>onOpen(a)}>Open <ArrowRight size={15}/></button></td></tr>):<tr><td colSpan={4}><div className="table-empty">Create a programme first.</div></td></tr>}</tbody></table></div></div></section>
}

type VersionRecord={id:string;version_number:number;status:'draft'|'published';title:string;created_at:string;published_at:string|null;submissionCount:number}

function formWorkspaceStatus(s:FormSummary):'draft'|'published'|'closed'|'none'{
 if(s.application.status==='closed'||s.application.status==='screening'||s.application.status==='completed')return 'closed'
 if(s.application.status==='published')return 'published'
 return s.versionStatus
}

export function FormsWorkspace({applications,onOpen,onCreate}:{applications:Application[];onOpen:(a:Application)=>void;onCreate?:()=>void}){
 const [summaries,setSummaries]=useState<FormSummary[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [query,setQuery]=useState(''); const [filter,setFilter]=useState<'all'|'draft'|'published'|'closed'|'none'>('all')
 const [versions,setVersions]=useState<VersionRecord[]>([]); const [historyFor,setHistoryFor]=useState<FormSummary|null>(null); const [historyLoading,setHistoryLoading]=useState(false); const [busyId,setBusyId]=useState(''); const [settingsFor,setSettingsFor]=useState<FormSummary|null>(null); const [settingsDraft,setSettingsDraft]=useState<FormSettings>({start_date:null,submission_limit:null,confirmation_message:'Thank you. Your application has been received.',applicant_instructions:null}); const [settingsSaving,setSettingsSaving]=useState(false)

 async function load(){setLoading(true);setError('');try{setSummaries(await loadFormSummaries(applications))}catch(e){setError(e instanceof Error?e.message:'Could not load forms.')}finally{setLoading(false)}}
 useEffect(()=>{load()},[applications])

 const filtered=useMemo(()=>summaries.filter(s=>{const q=query.trim().toLowerCase();const status=formWorkspaceStatus(s);return(!q||s.application.name.toLowerCase().includes(q))&&(filter==='all'||status===filter)}),[summaries,query,filter])
 const counts=useMemo(()=>({published:summaries.filter(s=>formWorkspaceStatus(s)==='published').length,draft:summaries.filter(s=>formWorkspaceStatus(s)==='draft').length,closed:summaries.filter(s=>formWorkspaceStatus(s)==='closed').length}),[summaries])

 async function changeStatus(summary:FormSummary,next:'published'|'closed'){
   setBusyId(summary.application.id);setError('')
   try{
     if(next==='published'&&summary.versionStatus!=='published') throw new Error('Publish the form in the Form Builder before opening applications.')
     const {error}=await supabase.from('applications').update({status:next,updated_at:new Date().toISOString()}).eq('id',summary.application.id)
     if(error)throw error
     setSummaries(current=>current.map(s=>s.application.id===summary.application.id?{...s,application:{...s.application,status:next}}:s))
   }catch(e){setError(e instanceof Error?e.message:'Could not update form status.')}finally{setBusyId('')}
 }

 function openSettings(summary:FormSummary){
   setSettingsFor(summary)
   setSettingsDraft(summary.settings||{start_date:null,submission_limit:null,confirmation_message:'Thank you. Your application has been received.',applicant_instructions:null})
 }
 async function saveSettings(){
   if(!settingsFor)return
   setSettingsSaving(true);setError('')
   try{
     const limit=settingsDraft.submission_limit===null?null:Number(settingsDraft.submission_limit)
     if(limit!==null&&(!Number.isInteger(limit)||limit<1))throw new Error('Submission limit must be a whole number greater than 0.')
     const {error}=await supabase.from('application_settings').upsert({
       application_id:settingsFor.application.id,
       public_slug:settingsFor.publicSlug||settingsFor.application.name.toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,''),
       start_date:settingsDraft.start_date||null,
       submission_limit:limit,
       confirmation_message:settingsDraft.confirmation_message.trim()||'Thank you. Your application has been received.',
       applicant_instructions:settingsDraft.applicant_instructions?.trim()||null,
       updated_at:new Date().toISOString()
     },{onConflict:'application_id'})
     if(error)throw error
     setSettingsFor(null);await load()
   }catch(e){setError(e instanceof Error?e.message:'Could not save form settings.')}finally{setSettingsSaving(false)}
 }
 
 async function openHistory(summary:FormSummary){
   setHistoryFor(summary);setHistoryLoading(true);setVersions([])
   const {data,error}=await supabase.from('form_versions').select('id,version_number,status,title,created_at,published_at').eq('application_id',summary.application.id).order('version_number',{ascending:false})
   if(error){setError(error.message);setHistoryLoading(false);return}
   const rows=(data||[]) as Omit<VersionRecord,'submissionCount'>[]
   const ids=rows.map(v=>v.id)
   const counts=new Map<string,number>()
   if(ids.length){
     const {data:subs,error:subError}=await supabase.from('submissions').select('form_version_id').in('form_version_id',ids)
     if(subError){setError(subError.message);setHistoryLoading(false);return}
     for(const sub of subs||[])counts.set(sub.form_version_id,(counts.get(sub.form_version_id)||0)+1)
   }
   setVersions(rows.map(v=>({...v,submissionCount:counts.get(v.id)||0})))
   setHistoryLoading(false)
 }

 async function duplicateVersion(versionId:string, summary:FormSummary){
   setBusyId(summary.application.id);setError('')
   try{
     const {data,error}=await supabase.rpc('duplicate_form_version',{p_form_version_id:versionId})
     if(error)throw error
     await openHistory(summary)
     await load()
     setError('') 
     return data as string
   }catch(e){setError(e instanceof Error?e.message:'Could not duplicate this version.')}finally{setBusyId('')}
 }

 function preview(s:FormSummary){if(!s.publicSlug){setError('This programme does not have a public application link yet.');return}window.open('/apply/'+s.publicSlug,'_blank','noopener,noreferrer')}

 return <section>
  <div className="page-heading compact"><div><p className="eyebrow">Application intake</p><h1>Forms</h1><p className="subtitle">Build, publish and manage the forms applicants use.</p></div><div className="detail-actions">{onCreate&&<button className="primary-button" onClick={onCreate}><Plus size={16}/> Create programme</button>}</div></div>
  {error&&<div className="form-error page-error">{error}</div>}
  <div className="stats-grid" style={{marginBottom:16}}>
   <div className="card stat-card"><div className="stat-icon"><FileText size={18}/></div><div><p className="eyebrow">Total forms</p><div className="stat-value">{summaries.length}</div><p className="muted">Programmes in this workspace</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><FileText size={18}/></div><div><p className="eyebrow">Published</p><div className="stat-value">{counts.published}</div><p className="muted">Accepting applications</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><FileText size={18}/></div><div><p className="eyebrow">Drafts</p><div className="stat-value">{counts.draft}</div><p className="muted">Still being built</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><Lock size={18}/></div><div><p className="eyebrow">Closed</p><div className="stat-value">{counts.closed}</div><p className="muted">No new applications</p></div></div>
  </div>
  <div className="card table-card"><div className="card-header"><div><h2>Application forms</h2><p>Manage publishing, access and version history from one place.</p></div></div>
   <div className="forms-toolbar">
    <div className="forms-search"><Search size={16}/><input aria-label="Search forms" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search programmes…" /></div>
    <div className="forms-filters" role="group" aria-label="Filter forms by status">{(['all','draft','published','closed','none'] as const).map(f=><button key={f} className={filter===f?'filter-button active':'filter-button'} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='none'?'Not started':f[0].toUpperCase()+f.slice(1)}<span>{f==='all'?summaries.length:f==='draft'?counts.draft:f==='published'?counts.published:f==='closed'?counts.closed:summaries.filter(s=>formWorkspaceStatus(s)==='none').length}</span></button>)}</div>
   </div>
   <div className="table-wrap"><table><thead><tr><th>Programme</th><th>Form status</th><th>Version</th><th>Questions</th><th>Submissions</th><th>Deadline</th><th></th></tr></thead><tbody>
    {loading?<tr><td colSpan={7}><div className="loading-card">Loading forms…</div></td></tr>:!filtered.length?<tr><td colSpan={7}><div className="table-empty"><div className="empty-icon"><FileText size={20}/></div><h3>{summaries.length?'No forms match your filters':'No programmes yet'}</h3><p>{summaries.length?'Try another search or filter.':'Create your first programme to start building an application form.'}</p>{!summaries.length&&onCreate&&<button className="primary-button" onClick={onCreate}><Plus size={15}/> Create programme</button>}</div></td></tr>:
    filtered.map(s=>{const status=formWorkspaceStatus(s);const busy=busyId===s.application.id;return <tr key={s.application.id}>
      <td><strong>{s.application.name}</strong><span className="table-sub">{s.application.description||'No description yet.'}</span></td>
      <td><span className={'status '+(status==='published'?'blue':status==='closed'?'neutral':status==='draft'?'amber':'neutral')}>{status==='none'?'Not started':status}</span></td>
      <td>v{s.version||'—'}</td><td>{s.questionCount}</td><td>{s.submissionCount}</td><td>{s.application.deadline?new Date(s.application.deadline).toLocaleDateString():'—'}</td>
      <td><div style={{display:'flex',gap:6,justifyContent:'flex-end',alignItems:'center'}}>
        {status==='published'&&<button className="icon-button" title="Close applications" aria-label="Close applications" disabled={busy} onClick={()=>changeStatus(s,'closed')}><Lock size={16}/></button>}
        {status==='closed'&&<button className="icon-button" title="Reopen applications" aria-label="Reopen applications" disabled={busy} onClick={()=>changeStatus(s,'published')}><LockOpen size={16}/></button>}
        <button className="icon-button" title="Version history" aria-label="Version history" onClick={()=>openHistory(s)}><History size={16}/></button>
        <button className="icon-button" title="Form settings" aria-label="Form settings" onClick={()=>openSettings(s)}><SlidersHorizontal size={16}/></button>
        <button className="icon-button" title="Preview form" aria-label="Preview form" disabled={!s.publicSlug||status!=='published'} onClick={()=>preview(s)}><Eye size={16}/></button>
        <button className="secondary-button" disabled={busy} onClick={()=>onOpen(s.application)}> {s.versionStatus==='draft'?'Open builder':'Open'} <ArrowRight size={15}/></button>
      </div></td>
    </tr>})}
   </tbody></table></div>
  </div>

  {settingsFor&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSettingsFor(null)}}>
   <div className="modal card" style={{maxWidth:720}}>
    <div className="modal-header"><div><p className="eyebrow">Form settings</p><h2>{settingsFor.application.name}</h2><p>Control when applicants can apply and what they see after submission.</p></div><button type="button" className="icon-button" onClick={()=>setSettingsFor(null)} aria-label="Close"><MoreHorizontal size={18}/></button></div>
    <div className="form-grid" style={{padding:'8px 0'}}>
      <label className="field"><span>Application start date</span><input type="date" value={settingsDraft.start_date||''} onChange={e=>setSettingsDraft(d=>({...d,start_date:e.target.value||null}))}/><small className="muted">Leave blank to allow applications immediately.</small></label>
      <label className="field"><span>Application deadline</span><input type="date" value={settingsFor.application.deadline||''} onChange={async e=>{const value=e.target.value||null;const {error}=await supabase.from('applications').update({deadline:value,updated_at:new Date().toISOString()}).eq('id',settingsFor.application.id);if(error)setError(error.message);else setSettingsFor(d=>d?{...d,application:{...d.application,deadline:value}}:d)}}/><small className="muted">Applicants cannot submit after this date.</small></label>
      <label className="field"><span>Submission limit</span><input type="number" min="1" step="1" value={settingsDraft.submission_limit??''} onChange={e=>setSettingsDraft(d=>({...d,submission_limit:e.target.value?Number(e.target.value):null}))}/><small className="muted">Optional maximum number of submitted applications.</small></label>
      <label className="field field-full"><span>Applicant instructions</span><textarea rows={5} value={settingsDraft.applicant_instructions||''} onChange={e=>setSettingsDraft(d=>({...d,applicant_instructions:e.target.value||null}))} placeholder="Tell applicants what they need before they start…"/></label>
      <label className="field field-full"><span>Confirmation message</span><textarea rows={4} value={settingsDraft.confirmation_message} onChange={e=>setSettingsDraft(d=>({...d,confirmation_message:e.target.value}))}/></label>
    </div>
    <div className="modal-footer"><button className="secondary-button" onClick={()=>setSettingsFor(null)}>Cancel</button><button className="primary-button" disabled={settingsSaving} onClick={saveSettings}>{settingsSaving?'Saving…':'Save settings'}</button></div>
   </div>
  </div>}
  {historyFor&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setHistoryFor(null)}}>
   <div className="modal card" style={{maxWidth:720}}>
    <div className="modal-header"><div><p className="eyebrow">Version history</p><h2>{historyFor.application.name}</h2><p>Published versions stay tied to the submissions that used them.</p></div><button type="button" className="icon-button" onClick={()=>setHistoryFor(null)} aria-label="Close"><MoreHorizontal size={18}/></button></div>
    {historyLoading?<div className="loading-card">Loading version history…</div>:versions.length?<div style={{display:'grid',gap:10,maxHeight:'55vh',overflowY:'auto'}}>{versions.map(v=><div key={v.id} className="card" style={{padding:16,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}><div><div style={{display:'flex',alignItems:'center',gap:8}}><strong>Version {v.version_number}</strong><span className={'status '+(v.status==='published'?'blue':'amber')}>{v.status}</span></div><div className="muted" style={{marginTop:5}}>{v.title||'Application form'} · Created {new Date(v.created_at).toLocaleDateString()} · {v.submissionCount} submission{v.submissionCount===1?'':'s'}</div></div><div style={{display:'flex',alignItems:'center',gap:12}}><div style={{textAlign:'right'}}>{v.published_at?<><strong>Published</strong><div className="muted">{new Date(v.published_at).toLocaleDateString()}</div></>:<span className="muted">Draft</span>}</div>{v.status==='draft'?<button className="secondary-button" disabled={busyId===historyFor.application.id} onClick={()=>{setHistoryFor(null);onOpen(historyFor.application)}}>Continue draft <ArrowRight size={15}/></button>:<button className="secondary-button" disabled={busyId===historyFor.application.id} onClick={()=>duplicateVersion(v.id,historyFor)}>Duplicate as draft <ArrowRight size={15}/></button>}</div></div>)}</div>:<div className="table-empty">No form versions yet.</div>}
    <div className="modal-footer"><button className="secondary-button" onClick={()=>setHistoryFor(null)}>Close</button><button className="primary-button" onClick={()=>{setHistoryFor(null);onOpen(historyFor.application)}}>Open form builder <ArrowRight size={15}/></button></div>
   </div>
  </div>}
 </section>
}
type ScreeningRow={
 submissionId:string
 applicationId:string
 applicantName:string
 email:string|null
 submittedAt:string|null
 eligibility:'eligible'|'ineligible'|'pending'
 score:number|null
 aiStatus:string
 aiRecommendation:string
}
function screeningRecommendation(ai:any):string{
 if(!ai)return 'Not screened'
 const value=String(ai.overall_assessment||'').toLowerCase()
 if(value.includes('strong match')||value.includes('recommended'))return 'Recommended'
 if(value.includes('not recommended')||value.includes('poor match'))return 'Not recommended'
 if(ai.status==='completed')return 'Reviewed'
 return ai.status==='failed'?'Failed':'In progress'
}
export function ScreeningWorkspace({applications,onOpen}:{applications:Application[];onOpen:(a:Application)=>void}){
 const [rows,setRows]=useState<ScreeningRow[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [query,setQuery]=useState('')
 const [filter,setFilter]=useState<'all'|'pending'|'screened'|'eligible'|'ineligible'|'recommended'|'review'>('all')
 const [reviewing,setReviewing]=useState<ScreeningRow|null>(null)

 async function load(){
  setLoading(true);setError('')
  try{
   if(!applications.length){setRows([]);return}
   const ids=applications.map(a=>a.id)
   const [{data:subs,error:subsError},{data:elig,error:eligError},{data:scores,error:scoresError},{data:ai,error:aiError},{data:applicants,error:applicantError}]=await Promise.all([
    supabase.from('submissions').select('id,application_id,applicant_id,submitted_at,status').in('application_id',ids).eq('status','submitted').order('submitted_at',{ascending:false}),
    supabase.from('submission_eligibility').select('submission_id,status,overridden').in('submission_id',[]),
    supabase.from('submission_scores').select('submission_id,overall_score,status').in('submission_id',[]),
    supabase.from('ai_screenings').select('submission_id,status,overall_assessment').in('submission_id',[]),
    supabase.from('applicants').select('id,full_name,email').in('application_id',ids)
   ])
   if(subsError)throw subsError
   if(applicantError)throw applicantError
   const submissionIds=(subs||[]).map(s=>s.id)
   const [eligResult,scoreResult,aiResult]=await Promise.all([
    submissionIds.length?supabase.from('submission_eligibility').select('submission_id,status,overridden').in('submission_id',submissionIds):Promise.resolve({data:[],error:null}),
    submissionIds.length?supabase.from('submission_scores').select('submission_id,overall_score,status').in('submission_id',submissionIds):Promise.resolve({data:[],error:null}),
    submissionIds.length?supabase.from('ai_screenings').select('submission_id,status,overall_assessment').in('submission_id',submissionIds):Promise.resolve({data:[],error:null})
   ])
   if(eligResult.error)throw eligResult.error
   if(scoreResult.error)throw scoreResult.error
   if(aiResult.error)throw aiResult.error
   const applicantMap=new Map((applicants||[]).map(a=>[a.id,a]))
   const eligMap=new Map((eligResult.data||[]).map(e=>[e.submission_id,e]))
   const scoreMap=new Map((scoreResult.data||[]).map(s=>[s.submission_id,s]))
   const aiMap=new Map((aiResult.data||[]).map(a=>[a.submission_id,a]))
   setRows((subs||[]).map(s=>{
    const a=applicantMap.get(s.applicant_id)
    const e=eligMap.get(s.id)
    const score=scoreMap.get(s.id)
    const ai=aiMap.get(s.id)
    return {
     submissionId:s.id,
     applicationId:s.application_id,
     applicantName:a?.full_name||'Unnamed applicant',
     email:a?.email||null,
     submittedAt:s.submitted_at||null,
     eligibility:e?.status==='eligible'?'eligible':e?.status==='ineligible'?'ineligible':'pending',
     score:score?.overall_score==null?null:Number(score.overall_score),
     aiStatus:ai?.status||'pending',
     aiRecommendation:screeningRecommendation(ai)
    }
   }))
  }catch(e){setError(e instanceof Error?e.message:'Could not load screening data.')}
  finally{setLoading(false)}
 }
 useEffect(()=>{load()},[applications])

 const counts=useMemo(()=>({
  total:rows.length,
  pending:rows.filter(r=>r.aiStatus==='pending'||r.aiStatus==='failed').length,
  screened:rows.filter(r=>['completed','failed'].includes(r.aiStatus)).length,
  eligible:rows.filter(r=>r.eligibility==='eligible').length,
  recommended:rows.filter(r=>r.aiRecommendation==='Recommended').length
 }),[rows])
 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return rows.filter(r=>{
   const matchesQuery=!q||r.applicantName.toLowerCase().includes(q)||(r.email||'').toLowerCase().includes(q)
   const matchesFilter=filter==='all'||(filter==='pending'?(r.aiStatus==='pending'||r.aiStatus==='processing'):filter==='screened'?['completed','failed'].includes(r.aiStatus):filter==='eligible'?r.eligibility==='eligible':filter==='ineligible'?r.eligibility==='ineligible':filter==='recommended'?r.aiRecommendation==='Recommended':r.aiStatus==='completed'&&r.eligibility==='pending')
   return matchesQuery&&matchesFilter
  })
 },[rows,query,filter])

 const openApplicant=(row:ScreeningRow)=>setReviewing(row)

 return <>
  <section>
  <div className="page-heading compact">
   <div><p className="eyebrow">Application screening</p><h1>Screening</h1><p className="subtitle">Review submitted applications, eligibility, scores and AI-assisted screening.</p></div>
  </div>
  {error&&<div className="form-error page-error">{error}</div>}
  <div className="stats-grid screening-stats">
   <div className="card stat-card"><div className="stat-icon"><ClipboardList size={18}/></div><div><p className="eyebrow">Total applications</p><div className="stat-value">{counts.total}</div><p className="muted">Submitted applications</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><ShieldCheck size={18}/></div><div><p className="eyebrow">Pending screening</p><div className="stat-value">{counts.pending}</div><p className="muted">Need screening attention</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><FileText size={18}/></div><div><p className="eyebrow">Screened</p><div className="stat-value">{counts.screened}</div><p className="muted">AI assessment completed</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><ShieldCheck size={18}/></div><div><p className="eyebrow">Eligible</p><div className="stat-value">{counts.eligible}</div><p className="muted">Passed eligibility</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><ArrowRight size={18}/></div><div><p className="eyebrow">AI recommended</p><div className="stat-value">{counts.recommended}</div><p className="muted">Recommended for review</p></div></div>
  </div>
  <div className="card table-card">
   <div className="card-header"><div><h2>Screening queue</h2><p>Open an application to continue screening.</p></div><button className="secondary-button" onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div>
   <div className="forms-toolbar">
    <div className="forms-search"><Search size={16}/><input aria-label="Search applications" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search applicants or email…" /></div>
    <div className="forms-filters" role="group" aria-label="Filter screening applications">
     {(['all','pending','screened','eligible','ineligible','recommended','review'] as const).map(f=><button key={f} className={filter===f?'filter-button active':'filter-button'} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='pending'?'Pending':f==='screened'?'Screened':f==='eligible'?'Eligible':f==='ineligible'?'Ineligible':f==='recommended'?'AI recommended':'Needs review'}<span>{f==='all'?counts.total:f==='pending'?counts.pending:f==='screened'?counts.screened:f==='eligible'?counts.eligible:f==='ineligible'?rows.filter(r=>r.eligibility==='ineligible').length:f==='recommended'?counts.recommended:rows.filter(r=>r.aiStatus==='completed'&&r.eligibility==='pending').length}</span></button>)}
    </div>
   </div>
   <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Eligibility</th><th>Score</th><th>AI assessment</th><th>Submitted</th><th></th></tr></thead><tbody>
    {loading?<tr><td colSpan={6}><div className="loading-card">Loading screening queue…</div></td></tr>:!filtered.length?<tr><td colSpan={6}><div className="table-empty"><div className="empty-icon"><ShieldCheck size={20}/></div><h3>{rows.length?'No applications match your filters':'No submitted applications yet'}</h3><p>{rows.length?'Try another search or filter.':'Applications will appear here after applicants submit a form.'}</p></div></td></tr>:
    filtered.map(row=><tr key={row.submissionId}>
     <td><strong>{row.applicantName}</strong><span className="table-sub">{row.email||'No email provided'}</span></td>
     <td><span className={'status '+(row.eligibility==='eligible'?'blue':row.eligibility==='ineligible'?'neutral':'amber')}>{row.eligibility}</span></td>
     <td>{row.score==null?'—':row.score.toFixed(1)}</td>
     <td><span className={'status '+(row.aiRecommendation==='Recommended'?'blue':row.aiRecommendation==='Not recommended'?'neutral':'amber')}>{row.aiRecommendation}</span></td>
     <td>{row.submittedAt?new Date(row.submittedAt).toLocaleDateString():'—'}</td>
     <td><button className="secondary-button" onClick={()=>openApplicant(row)}>Review <ArrowRight size={15}/></button></td>
    </tr>)}
   </tbody></table></div>
  </div>
 </section>
 {reviewing&&<ScreeningReviewModal row={reviewing} onClose={()=>setReviewing(null)}/>} 
 </>
}

type ScreeningReviewData={submission:any;applicant:any;answers:any[];questions:any[];eligibility:any;score:any;criteria:any[];ai:any}
function ScreeningReviewModal({row,onClose}:{row:ScreeningRow;onClose:()=>void}){
 const [data,setData]=useState<ScreeningReviewData|null>(null);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [aiRunning,setAiRunning]=useState(false);const [aiError,setAiError]=useState('');const [review,setReview]=useState<any>(null);const [reviewers,setReviewers]=useState<any[]>([]);const [reviewerId,setReviewerId]=useState('');const [reviewDecision,setReviewDecision]=useState('');const [reviewStatus,setReviewStatus]=useState('assigned');const [reviewScore,setReviewScore]=useState('');const [reviewNotes,setReviewNotes]=useState('');const [reviewSaving,setReviewSaving]=useState(false);const [reviewError,setReviewError]=useState('');const [reviewNotice,setReviewNotice]=useState('');
 useEffect(()=>{(async()=>{try{const [{data:s,error:se},{data:a,error:ae},{data:ans,error:ane},{data:e,error:ee},{data:sc,error:sce},{data:cr,error:cre},{data:ai,error:aie}]=await Promise.all([
  supabase.from('submissions').select('id,application_id,form_version_id,applicant_id,status,submitted_at').eq('id',row.submissionId).maybeSingle(),
  supabase.from('applicants').select('id,full_name,email').eq('id',row.submissionId).limit(0),
  supabase.from('answers').select('id,question_id,value').eq('submission_id',row.submissionId),
  supabase.from('submission_eligibility').select('*').eq('submission_id',row.submissionId).maybeSingle(),
  supabase.from('submission_scores').select('*').eq('submission_id',row.submissionId).maybeSingle(),
  supabase.from('scoring_criteria').select('id,name,description,weight,max_score,position,enabled').eq('application_id',row.applicationId).eq('enabled',true).order('position'),
  supabase.from('ai_screenings').select('*').eq('submission_id',row.submissionId).maybeSingle()
 ]);if(se)throw se;if(ane)throw ane;if(ee)throw ee;if(sce)throw sce;if(cre)throw cre;if(aie)throw aie;
  const {data:applicant,error:appErr}=await supabase.from('applicants').select('id,full_name,email').eq('id',s?.applicant_id||'').maybeSingle();if(appErr)throw appErr;
  const {data:questions,error:qErr}=await supabase.from('questions').select('id,label,description,type,position').eq('form_version_id',s?.form_version_id||'').order('position');if(qErr)throw qErr;
  setData({submission:s,applicant,answers:ans||[],questions:questions||[],eligibility:e,score:sc,criteria:cr||[],ai});
 }catch(e){setError(e instanceof Error?e.message:'Could not load this application.')}finally{setLoading(false)}})()},[row.submissionId,row.applicationId]);
 const loadReview=async()=>{const {data:r,error:re}=await supabase.from('review_assignments').select('id,submission_id,reviewer_id,status,score,notes,decision,created_at,updated_at').eq('submission_id',row.submissionId).order('created_at',{ascending:false}).limit(1).maybeSingle();if(re)setReviewError(re.message);setReview(r||null);if(r){setReviewerId(r.reviewer_id);setReviewStatus(r.status);setReviewDecision(r.decision||'');setReviewScore(r.score==null?'':String(r.score));setReviewNotes(r.notes||'')}};
 useEffect(()=>{(async()=>{const {data:ps}=await supabase.from('profiles').select('id,full_name,role').order('full_name');setReviewers(ps||[]);loadReview()})()},[row.submissionId]);
 const assignReviewer=async()=>{if(!reviewerId){setReviewError('Select a reviewer first.');return}setReviewSaving(true);setReviewError('');setReviewNotice('');const {data:r,error:e}=await supabase.rpc('assign_review_submission',{p_submission_id:row.submissionId,p_reviewer_id:reviewerId});if(e)setReviewError(e.message);else{setReview(r);setReviewStatus(r.status);setReviewNotice('Reviewer assigned.')}setReviewSaving(false)};
 const saveReview=async()=>{if(!review){setReviewError('Assign a reviewer before saving the screening decision.');return}if(!reviewDecision){setReviewError('Choose eligible or ineligible.');return}setReviewSaving(true);setReviewError('');setReviewNotice('');const {data:r,error:e}=await supabase.rpc('update_review_assignment',{p_assignment_id:review.id,p_status:'completed',p_score:reviewScore===''?null:Number(reviewScore),p_notes:reviewNotes||null,p_decision:reviewDecision});if(e)setReviewError(e.message);else{setReview(r);setReviewStatus(r.status);setReviewNotice('Screening decision saved.')}setReviewSaving(false)};
 const answerMap=new Map((data?.answers||[]).map(a=>[a.question_id,a.value]));
 const runAiScreening=async()=>{
  setAiRunning(true);setAiError('');
  try{const {data:result,error:invokeError}=await supabase.functions.invoke('run-ai-screening',{body:{submission_id:row.submissionId}});if(invokeError)throw invokeError;if(result?.error)throw new Error(result.error);const {data:ai,error:aiError}=await supabase.from('ai_screenings').select('*').eq('submission_id',row.submissionId).maybeSingle();if(aiError)throw aiError;setData(prev=>prev?{...prev,ai}:prev)}catch(e){setAiError(e instanceof Error?e.message:'AI screening failed.')}finally{setAiRunning(false)}};
 const formatValue=(v:any)=>{if(v===null||v===undefined||v==='')return 'Not provided';if(Array.isArray(v))return v.join(', ');if(typeof v==='object')return Object.values(v).join(', ');return String(v)};
 return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Screen application"><div className="modal-card screening-review-modal">
  <div className="modal-header"><div><p className="eyebrow">Screening review</p><h2>{row.applicantName}</h2><p className="muted">{row.email||'No email provided'} · Submitted {row.submittedAt?new Date(row.submittedAt).toLocaleString():'—'}</p></div><button className="icon-button" onClick={onClose} aria-label="Close review">×</button></div>
  {loading?<div className="loading-card">Loading full application…</div>:error?<div className="form-error">{error}</div>:data&&<div className="screening-review-body">
   <div className="screening-review-grid"><div className="card screening-section"><div className="card-header"><div><h3>Eligibility</h3><p>Deterministic eligibility result.</p></div><span className={'status '+(data.eligibility?.status==='eligible'?'blue':data.eligibility?.status==='ineligible'?'neutral':'amber')}>{data.eligibility?.status||'pending'}</span></div>{data.eligibility?.reasons?.length?<ul className="screening-list">{data.eligibility.reasons.map((r:any,i:number)=><li key={i}>{typeof r==='string'?r:JSON.stringify(r)}</li>)}</ul>:<p className="muted">No eligibility reasons recorded.</p>}</div>
   <div className="card screening-section"><div className="card-header"><div><h3>Score</h3><p>Current recorded score.</p></div><strong className="screening-score">{data.score?.overall_score==null?'—':Number(data.score.overall_score).toFixed(1)}</strong></div>{data.criteria.length?<div className="screening-criteria">{data.criteria.map((c:any)=><div key={c.id}><div><strong>{c.name}</strong><span>{c.weight}%</span></div><p>{c.description||'No description.'}</p></div>)}</div>:<p className="muted">No scoring criteria configured.</p>}</div></div>
   <div className="card screening-section"><div className="card-header"><div><h3>Application responses</h3><p>The complete submitted form, in the applicant's original structure.</p></div></div><div className="screening-answers">{data.questions.map(q=><div className="answer-item" key={q.id}><div className="eyebrow">{q.label}</div><div className="answer-value">{formatValue(answerMap.get(q.id))}</div>{q.description&&<p className="muted">{q.description}</p>}</div>)}</div></div>
   <div className="card screening-section"><div className="card-header"><div><h3>AI assessment</h3><p>AI reviews the complete application against the configured criteria. Advisory only.</p></div><div className="detail-actions"><span className={'status '+(data.ai?.status==='completed'?'blue':data.ai?.status==='failed'?'neutral':'amber')}>{data.ai?.status||'Not screened'}</span><button className="primary-button" onClick={runAiScreening} disabled={aiRunning}>{aiRunning?'Running AI…':data.ai?.status==='completed'?'Run again':'Run AI screening'}</button></div></div>{aiError&&<div className="form-error">{aiError}</div>}{data.ai?<><p>{data.ai.overall_assessment||'No overall assessment yet.'}</p>{data.ai.strengths?.length>0&&<><h4>Strengths</h4><ul className="screening-list">{data.ai.strengths.map((x:any,i:number)=><li key={i}>{typeof x==='string'?x:JSON.stringify(x)}</li>)}</ul></>}{data.ai.concerns?.length>0&&<><h4>Concerns</h4><ul className="screening-list">{data.ai.concerns.map((x:any,i:number)=><li key={i}>{typeof x==='string'?x:JSON.stringify(x)}</li>)}</ul></>} </>:<p className="muted">AI screening has not been run for this application yet.</p>}</div>
   <div className="card screening-section"><div className="card-header"><div><h3>Human screening</h3><p>Assign a reviewer, record the human decision, score and notes. Human review remains final.</p></div>{review&&<span className={'status '+(review.status==='completed'?'blue':'amber')}>{review.status}</span>}</div>{reviewError&&<div className="form-error">{reviewError}</div>}{reviewNotice&&<div className="form-message">{reviewNotice}</div>}<div className="detail-form"><label>Reviewer<select value={reviewerId} onChange={e=>setReviewerId(e.target.value)}><option value="">Select reviewer</option>{reviewers.map(p=><option key={p.id} value={p.id}>{p.full_name||'Unnamed member'} · {p.role}</option>)}</select></label><div className="detail-actions"><button className="secondary-button" onClick={assignReviewer} disabled={reviewSaving||!reviewerId}>{reviewSaving?'Saving…':review?'Reassign reviewer':'Assign reviewer'}</button></div><label>Decision<select value={reviewDecision} onChange={e=>setReviewDecision(e.target.value)}><option value="">Select decision</option><option value="eligible">Eligible</option><option value="ineligible">Ineligible</option></select></label><label>Reviewer score<input type="number" min="0" max="100" step="0.1" value={reviewScore} onChange={e=>setReviewScore(e.target.value)} placeholder="Optional score"/></label><label>Notes<textarea value={reviewNotes} onChange={e=>setReviewNotes(e.target.value)} placeholder="Add your screening notes…" rows={4}/></label><div className="detail-form-footer"><button className="primary-button" onClick={saveReview} disabled={reviewSaving||!review}>{reviewSaving?'Saving…':'Save screening decision'}</button></div></div></div>
  </div>}
 </div></div>
}
export function ReviewsWorkspace({applications,onOpen}:{applications:Application[];onOpen:(a:Application)=>void}){return <ModuleList title="Reviews" eyebrow="Human review" description="Assign reviewers and manage structured application reviews." icon={ClipboardList} applications={applications} onOpen={onOpen}/>}

export function TeamWorkspace({organizationId}:{organizationId:string}){
 const [people,setPeople]=useState<Profile[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState('')
 useEffect(()=>{(async()=>{const {data,error}=await supabase.from('profiles').select('id,full_name,role,organization_id').eq('organization_id',organizationId).order('full_name');if(error)setError(error.message);setPeople(data||[]);setLoading(false)})()},[organizationId])
 return <section><div className="page-heading compact"><div><p className="eyebrow">Manage</p><h1>Team</h1><p className="subtitle">People with access to this ApplyFlow workspace.</p></div></div>{error&&<div className="form-error page-error">{error}</div>}<div className="card table-card"><div className="card-header"><div><h2>Workspace members</h2><p>Roles control what each person can access.</p></div><Users size={20}/></div>{loading?<div className="loading-card">Loading team…</div>:<div className="table-wrap"><table><thead><tr><th>Member</th><th>Role</th><th>Access</th></tr></thead><tbody>{people.map(p=><tr key={p.id}><td><strong>{p.full_name||'Unnamed member'}</strong></td><td><span className="status blue">{p.role}</span></td><td>Workspace access</td></tr>)}</tbody></table></div>}</div></section>
}

export function SettingsWorkspace({organization,onSaved}:{organization:{id:string;name:string;slug:string}|null;onSaved:(name:string)=>void}){
 const [name,setName]=useState(organization?.name||''); const [slug,setSlug]=useState(organization?.slug||''); const [saving,setSaving]=useState(false); const [notice,setNotice]=useState(''); const [error,setError]=useState('')
 useEffect(()=>{setName(organization?.name||'');setSlug(organization?.slug||'')},[organization])
 async function save(){if(!organization||!name.trim())return;setSaving(true);setError('');setNotice('');const {error}=await supabase.from('organizations').update({name:name.trim(),slug:slug.trim()||organization.slug}).eq('id',organization.id);if(error)setError(error.message);else{setNotice('Workspace settings saved.');onSaved(name.trim())}setSaving(false)}
 return <section><div className="page-heading compact"><div><p className="eyebrow">Manage</p><h1>Settings</h1><p className="subtitle">Configure your ApplyFlow workspace.</p></div></div>{error&&<div className="form-error page-error">{error}</div>}{notice&&<div className="form-message page-message">{notice}</div>}<div className="card detail-card"><div className="card-header"><div><h2>Workspace</h2><p>Basic organisation settings.</p></div><Settings size={20}/></div><div className="detail-form"><label>Organisation name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Workspace slug<input value={slug} onChange={e=>setSlug(e.target.value)}/></label><div className="detail-form-footer"><button className="primary-button" onClick={save} disabled={saving}><Save size={16}/>{saving?'Saving…':'Save settings'}</button></div></div></div></section>
}
