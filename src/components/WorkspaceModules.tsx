import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Users, Settings, FileText, ShieldCheck, ClipboardList, Save, Eye, Search, Plus, History, Lock, LockOpen, SlidersHorizontal, MoreHorizontal, Download } from 'lucide-react'
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
    {loading?<tr><td colSpan={7}><div className="loading-card">Loading forms…</div></td></tr>:!filtered.length?<tr><td colSpan={8}><div className="table-empty"><div className="empty-icon"><FileText size={20}/></div><h3>{summaries.length?'No forms match your filters':'No programmes yet'}</h3><p>{summaries.length?'Try another search or filter.':'Create your first programme to start building an application form.'}</p>{!summaries.length&&onCreate&&<button className="primary-button" onClick={onCreate}><Plus size={15}/> Create programme</button>}</div></td></tr>:
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
type ScreeningDecision='pending'|'approved'|'rejected'
type ScreeningRow={
 submissionId:string
 applicationId:string
 uniqueId:string
 applicantName:string
 email:string|null
 submittedAt:string|null
 eligibility:'eligible'|'ineligible'|'pending'
 score:number|null
 aiStatus:string
 aiRecommendation:string
 decision:ScreeningDecision
}

function screeningRecommendation(ai:any):string{
 if(!ai)return 'Not screened'
 const value=String(ai.overall_assessment||'').toLowerCase()
 if(value.includes('not recommended')||value.includes('poor match'))return 'Not recommended'
 if(value.includes('strong match')||value.includes('recommended'))return 'Recommended'
 if(ai.status==='completed')return 'Reviewed'
 return ai.status==='failed'?'Failed':'In progress'
}

export function ScreeningWorkspace({applications,onOpen}:{applications:Application[];onOpen:(a:Application)=>void}){
 const [rows,setRows]=useState<ScreeningRow[]>([])
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [query,setQuery]=useState('')
 const [filter,setFilter]=useState<'all'|'pending'|'approved'|'rejected'|'recommended'>('all')
 const [reviewing,setReviewing]=useState<ScreeningRow|null>(null)
 const [aiBulkRunning,setAiBulkRunning]=useState(false)

 async function load(){
  setLoading(true);setError('')
  try{
   if(!applications.length){setRows([]);return}
   const ids=applications.map(a=>a.id)
   const {data:subs,error:subsError}=await supabase.from('submissions').select('id,application_id,applicant_id,submitted_at,decision').in('application_id',ids).eq('status','submitted').order('submitted_at',{ascending:false})
   if(subsError)throw subsError
   const submissionIds=(subs||[]).map(s=>s.id)
   if(!submissionIds.length){setRows([]);return}
   const [eligResult,scoreResult,aiResult,applicantResult]=await Promise.all([
    supabase.from('submission_eligibility').select('submission_id,status').in('submission_id',submissionIds),
    supabase.from('submission_scores').select('submission_id,overall_score').in('submission_id',submissionIds),
    supabase.from('ai_screenings').select('submission_id,status,overall_assessment').in('submission_id',submissionIds),
    supabase.from('applicants').select('id,full_name,email,unique_id').in('id',(subs||[]).map(s=>s.applicant_id))
   ])
   if(eligResult.error)throw eligResult.error
   if(scoreResult.error)throw scoreResult.error
   if(aiResult.error)throw aiResult.error
   if(applicantResult.error)throw applicantResult.error
   const eligMap=new Map((eligResult.data||[]).map(e=>[e.submission_id,e]))
   const scoreMap=new Map((scoreResult.data||[]).map(s=>[s.submission_id,s]))
   const aiMap=new Map((aiResult.data||[]).map(a=>[a.submission_id,a]))
   const applicantMap=new Map((applicantResult.data||[]).map(a=>[a.id,a]))
   setRows((subs||[]).map(s=>{
    const applicant=applicantMap.get(s.applicant_id)
    const ai=aiMap.get(s.id)
    const score=scoreMap.get(s.id)
    const eligibility=eligMap.get(s.id)
    return {
     submissionId:s.id,
     applicationId:s.application_id,
     uniqueId:applicant?.unique_id||'—',
     applicantName:applicant?.full_name||'Unnamed applicant',
     email:applicant?.email||null,
     submittedAt:s.submitted_at||null,
     eligibility:eligibility?.status==='eligible'?'eligible':eligibility?.status==='ineligible'?'ineligible':'pending',
     score:score?.overall_score==null?null:Number(score.overall_score),
     aiStatus:ai?.status||'pending',
     aiRecommendation:screeningRecommendation(ai),
     decision:s.decision==='approved'||s.decision==='rejected'?s.decision:'pending'
    }
   }))
  }catch(e){setError(e instanceof Error?e.message:'Could not load screening data.')}
  finally{setLoading(false)}
 }

 useEffect(()=>{load()},[applications])

 const counts=useMemo(()=>({
  total:rows.length,
  pending:rows.filter(r=>r.decision==='pending').length,
  approved:rows.filter(r=>r.decision==='approved').length,
  rejected:rows.filter(r=>r.decision==='rejected').length,
  recommended:rows.filter(r=>r.aiRecommendation==='Recommended').length
 }),[rows])

 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return rows.filter(r=>{
   const matchesQuery=!q||r.applicantName.toLowerCase().includes(q)||(r.email||'').toLowerCase().includes(q)||r.uniqueId.toLowerCase().includes(q)
   const matchesFilter=filter==='all'||(filter==='pending'&&r.decision==='pending')||(filter==='approved'&&r.decision==='approved')||(filter==='rejected'&&r.decision==='rejected')||(filter==='recommended'&&r.aiRecommendation==='Recommended')
   return matchesQuery&&matchesFilter
  })
 },[rows,query,filter])

 const setDecision=async(row:ScreeningRow,decision:'approved'|'rejected')=>{
  setError('')
  const {error}=await supabase.from('submissions').update({decision}).eq('id',row.submissionId)
  if(error){setError(error.message);return}
  setRows(current=>current.map(r=>r.submissionId===row.submissionId?{...r,decision}:r))
  setReviewing(current=>current?.submissionId===row.submissionId?{...current,decision}:current)
 }

 const screenWithAI=async()=>{
  if(!rows.length)return
  setAiBulkRunning(true);setError('')
  try{
   for(const row of rows.filter(r=>r.decision==='pending')){
    const {error}=await supabase.functions.invoke('run-ai-screening',{body:{submission_id:row.submissionId}})
    if(error)throw error
   }
   await load()
  }catch(e){setError(e instanceof Error?e.message:'AI screening failed.')}
  finally{setAiBulkRunning(false)}
 }

 return <>
  <section>
   <div className="page-heading compact">
    <div><p className="eyebrow">Application screening</p><h1>Screening</h1><p className="subtitle">Review applications and approve or reject them.</p></div>
    <div className="detail-actions"><button className="primary-button" onClick={screenWithAI} disabled={aiBulkRunning||loading||!rows.length}>{aiBulkRunning?'Screening with AI…':'Screen with AI'}</button><button className="secondary-button" onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div>
   </div>
   {error&&<div className="form-error page-error">{error}</div>}
   <div className="stats-grid screening-stats">
    <div className="card stat-card"><div className="stat-icon"><ClipboardList size={18}/></div><div><p className="eyebrow">Total applicants</p><div className="stat-value">{counts.total}</div><p className="muted">Submitted applications</p></div></div>
    <div className="card stat-card"><div className="stat-icon"><ClipboardList size={18}/></div><div><p className="eyebrow">Pending</p><div className="stat-value">{counts.pending}</div><p className="muted">Awaiting a decision</p></div></div>
    <div className="card stat-card"><div className="stat-icon"><ShieldCheck size={18}/><p className="eyebrow">Approved</p></div><div className="stat-value">{counts.approved}</div></div>
    <div className="card stat-card"><div className="stat-icon"><FileText size={18}/><p className="eyebrow">Rejected</p></div><div className="stat-value">{counts.rejected}</div></div>
    <div className="card stat-card"><div className="stat-icon"><ArrowRight size={18}/><p className="eyebrow">AI recommended</p></div><div className="stat-value">{counts.recommended}</div></div>
   </div>
   <div className="card table-card">
    <div className="card-header"><div><h2>Applicants</h2><p>Review the application, then approve or reject.</p></div></div>
    <div className="forms-toolbar">
     <div className="forms-search"><Search size={16}/><input aria-label="Search applicants" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email or unique ID…" /></div>
     <div className="forms-filters" role="group" aria-label="Filter applicants">{(['all','pending','approved','rejected','recommended'] as const).map(f=><button key={f} className={filter===f?'filter-button active':'filter-button'} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='pending'?'Pending':f==='approved'?'Approved':f==='rejected'?'Rejected':'AI recommended'}<span>{f==='all'?counts.total:f==='pending'?counts.pending:f==='approved'?counts.approved:f==='rejected'?counts.rejected:counts.recommended}</span></button>)}</div>
    </div>
    <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Unique ID</th><th>Score</th><th>Eligibility</th><th>AI</th><th>Status</th><th></th></tr></thead><tbody>
     {loading?<tr><td colSpan={7}><div className="loading-card">Loading applicants…</div></td></tr>:!filtered.length?<tr><td colSpan={7}><div className="table-empty"><h3>{rows.length?'No applicants match your filters':'No submitted applications yet'}</h3><p>{rows.length?'Try another filter or search.':'Applications will appear here after applicants submit a form.'}</p></div></td></tr>:
     filtered.map(row=><tr key={row.submissionId}>
      <td><strong>{row.applicantName}</strong><span className="table-sub">{row.email||'No email'}</span></td>
      <td><strong>{row.uniqueId}</strong></td><td>{row.score==null?'—':row.score.toFixed(1)}</td>
      <td><span className={'status '+(row.eligibility==='eligible'?'blue':row.eligibility==='ineligible'?'neutral':'amber')}>{row.eligibility}</span></td>
      <td><span className={'status '+(row.aiRecommendation==='Recommended'?'blue':row.aiRecommendation==='Not recommended'?'neutral':'amber')}>{row.aiRecommendation}</span></td>
      <td><span className={'status '+(row.decision==='approved'?'blue':row.decision==='rejected'?'neutral':'amber')}>{row.decision}</span></td>
      <td><button className="secondary-button" onClick={()=>setReviewing(row)}>Review <ArrowRight size={15}/></button></td>
     </tr>)}
    </tbody></table></div>
   </div>
  </section>
  {reviewing&&<ScreeningReviewModal row={reviewing} onClose={()=>setReviewing(null)} onDecision={setDecision}/>}
 </>
}

type ScreeningReviewData={submission:any;applicant:any;answers:any[];questions:any[];eligibility:any;score:any;criteria:any[];ai:any;documents:any[]}
function ScreeningReviewModal({row,onClose,onDecision}:{row:ScreeningRow;onClose:()=>void;onDecision:(row:ScreeningRow,decision:'approved'|'rejected')=>Promise<void>}) {
 const [data,setData]=useState<ScreeningReviewData|null>(null)
 const [extractingId,setExtractingId]=useState('')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [aiRunning,setAiRunning]=useState(false)
 const [aiError,setAiError]=useState('')
 const [manualScore,setManualScore]=useState('')
 const [scoreSaving,setScoreSaving]=useState(false)
 const [scoreNotice,setScoreNotice]=useState('')

 useEffect(()=>{
  let active=true
  ;(async()=>{
   try{
    const [
     {data:s,error:se},
     {data:ans,error:ane},
     {data:e,error:ee},
     {data:sc,error:sce},
     {data:cr,error:cre},
     {data:ai,error:aie},
     {data:documents,error:de}
    ]=await Promise.all([
     supabase.from('submissions').select('id,application_id,form_version_id,applicant_id,status,submitted_at,decision').eq('id',row.submissionId).maybeSingle(),
     supabase.from('answers').select('id,question_id,value').eq('submission_id',row.submissionId),
     supabase.from('submission_eligibility').select('*').eq('submission_id',row.submissionId).maybeSingle(),
     supabase.from('submission_scores').select('*').eq('submission_id',row.submissionId).maybeSingle(),
     supabase.from('scoring_criteria').select('id,name,description,weight,max_score,position,enabled').eq('application_id',row.applicationId).eq('enabled',true).order('position'),
     supabase.from('ai_screenings').select('*').eq('submission_id',row.submissionId).maybeSingle(),
     supabase.from('uploaded_documents').select('id,question_id,storage_bucket,storage_path,original_name,mime_type,file_size,status,extraction_status,extracted_text,created_at').eq('submission_id',row.submissionId).order('created_at')
    ])
    if(se)throw se
    if(ane)throw ane
    if(ee)throw ee
    if(sce)throw sce
    if(cre)throw cre
    if(aie)throw aie
    if(de)throw de

    const {data:applicant,error:appErr}=await supabase.from('applicants').select('id,full_name,email,unique_id').eq('id',s?.applicant_id||'').maybeSingle()
    if(appErr)throw appErr

    const {data:questions,error:qErr}=await supabase.from('questions').select('id,label,description,type,position').eq('form_version_id',s?.form_version_id||'').order('position')
    if(qErr)throw qErr

    if(active){
      setData({submission:s,applicant,answers:ans||[],questions:questions||[],eligibility:e,score:sc,criteria:cr||[],ai,documents:documents||[]})
      setManualScore(sc?.overall_score==null?'':String(sc.overall_score))
    }
   }catch(e){
    if(active)setError(e instanceof Error?e.message:'Could not load this application.')
   }finally{
    if(active)setLoading(false)
   }
  })()
  return ()=>{active=false}
 },[row.submissionId,row.applicationId])

 const refreshDocuments=async()=>{
  const {data:documents,error}=await supabase.from('uploaded_documents')
   .select('id,question_id,storage_bucket,storage_path,original_name,mime_type,file_size,status,extraction_status,extracted_text,created_at')
   .eq('submission_id',row.submissionId).order('created_at')
  if(error)throw error
  setData(prev=>prev?{...prev,documents:documents||[]}:prev)
 }

 const extractDocument=async(documentId:string)=>{
  setExtractingId(documentId);setAiError('')
  try{
   const {data:result,error:invokeError}=await supabase.functions.invoke('extract-application-document',{body:{document_id:documentId}})
   if(invokeError)throw invokeError
   if(result?.error)throw new Error(result.error)
   await refreshDocuments()
  }catch(e){setAiError(e instanceof Error?e.message:'Document extraction failed.')}
  finally{setExtractingId('')}
 }

 const runAiScreening=async()=>{
  setAiRunning(true);setAiError('')
  try{
   const {data:result,error:invokeError}=await supabase.functions.invoke('run-ai-screening',{body:{submission_id:row.submissionId}})
   if(invokeError)throw invokeError
   if(result?.error)throw new Error(result.error)
   const {data:ai,error:aiLoadError}=await supabase.from('ai_screenings').select('*').eq('submission_id',row.submissionId).maybeSingle()
   if(aiLoadError)throw aiLoadError
   setData(prev=>prev?{...prev,ai}:prev)
  }catch(e){setAiError(e instanceof Error?e.message:'AI screening failed.')}
  finally{setAiRunning(false)}
 }

 const saveScore=async()=>{
  const value=manualScore.trim()===''?null:Number(manualScore)
  if(value!==null&&(!Number.isFinite(value)||value<0||value>100)){
   setScoreNotice('Enter a score from 0 to 100.')
   return
  }
  setScoreSaving(true);setScoreNotice('')
  try{
   const existingCriteria=data?.score?.criteria_scores||[]
   const {data:score,error}=await supabase.from('submission_scores').upsert({
    submission_id:row.submissionId,
    overall_score:value,
    criteria_scores:existingCriteria,
    status:value===null?'pending':'scored',
    scored_at:value===null?null:new Date().toISOString(),
    updated_at:new Date().toISOString()
   },{onConflict:'submission_id'}).select('*').single()
   if(error)throw error
   setData(prev=>prev?{...prev,score}:prev)
   setScoreNotice('Score saved.')
  }catch(e){
   setScoreNotice(e instanceof Error?e.message:'Could not save score.')
  }finally{setScoreSaving(false)}
 }

 const formatValue=(value:any)=>{
  if(value===null||value===undefined||value==='')return 'Not provided'
  if(Array.isArray(value))return value.length?value.map(item=>typeof item==='object'?JSON.stringify(item):String(item)).join(', '):'Not provided'
  if(typeof value==='object')return Object.entries(value).map(([key,val])=>`${key}: ${typeof val==='object'?JSON.stringify(val):String(val)}`).join(' · ')
  return String(value)
 }

 const answerMap=new Map((data?.answers||[]).map(answer=>[answer.question_id,answer.value]))
 const currentDecision=row.decision
 const eligibilityStatus=data?.eligibility?.status||'pending'
 const score=data?.score?.overall_score
 const aiRecommendation=data?.ai?.recommendation||data?.ai?.decision||null

 return (
  <div className="screening-review-page" role="dialog" aria-modal="true" aria-label="Review application">
   <div className="screening-review-shell">
    <header className="screening-review-header">
     <div className="screening-review-heading">
      <div className="screening-review-heading-copy">
       <p className="eyebrow">Application review</p>
       <h2>{row.applicantName}</h2>
       <div className="screening-review-meta">
        <span className="screening-id">{data?.applicant?.unique_id||row.uniqueId}</span>
        <span>{row.email||'No email provided'}</span>
        <span>{row.submittedAt?new Date(row.submittedAt).toLocaleString():'Submitted date unavailable'}</span>
       </div>
      </div>
      <button type="button" className="secondary-button screening-back-button" onClick={onClose} aria-label="Back to screening">← Back to screening</button>
     </div>
    </header>

    {loading ? (
     <div className="screening-review-loading"><div className="loading-card">Loading application…</div></div>
    ) : error ? (
     <div className="screening-review-loading"><div className="form-error">{error}</div></div>
    ) : data ? (
     <>
      <main className="screening-review-content">
       <section className="screening-summary-grid">
        <div className="screening-summary-card"><span className="screening-summary-label">Unique ID</span><strong className="screening-summary-value">{data.applicant?.unique_id||row.uniqueId}</strong></div>
        <div className="screening-summary-card"><span className="screening-summary-label">Eligibility</span><strong className="screening-summary-value">{eligibilityStatus}</strong></div>
        <div className="screening-summary-card"><span className="screening-summary-label">Current score</span><strong className="screening-summary-value">{score==null?'Not scored':Number(score).toFixed(1)+' / 100'}</strong></div>
       </section>

       <section className="screening-review-section">
        <div className="screening-section-heading">
         <div><span className="screening-section-kicker">Submitted application</span><h3>All form answers</h3><p>Go through every answer exactly as the applicant submitted it.</p></div>
         <span className="screening-count">{data.questions.length}</span>
        </div>
        <div className="screening-answer-list">
         {data.questions.length ? data.questions.map((question,index)=>(
          <article className="screening-answer" key={question.id}>
           <div className="screening-answer-number">{index+1}</div>
           <div className="screening-answer-content">
            <div className="screening-answer-question">{question.label}{question.description&&<span className="screening-answer-description">{question.description}</span>}</div>
            <div className="screening-answer-value">{formatValue(answerMap.get(question.id))}</div>
           </div>
          </article>
         )) : <p className="muted screening-empty-answer">No answers were found for this submission.</p>}
        </div>
       </section>

       {data.documents.length>0&&(
        <section className="screening-review-section">
         <div className="screening-section-heading"><div><span className="screening-section-kicker">Submitted files</span><h3>Documents</h3><p>Files included with the application.</p></div><span className="screening-count">{data.documents.length}</span></div>
         <div className="screening-document-list">
          {data.documents.map((document:any)=>(
           <div className="screening-document" key={document.id}>
            <div className="screening-document-copy"><strong>{document.original_name}</strong><p>{document.mime_type||'File'} · {document.file_size?Math.round(document.file_size/1024)+' KB':'Size unavailable'} · {document.extraction_status||'pending'}</p>{document.extracted_text&&<div className="screening-document-text">{document.extracted_text}</div>}</div>
            <button className="secondary-button" onClick={()=>extractDocument(document.id)} disabled={extractingId===document.id||document.extraction_status==='processing'}>{extractingId===document.id?'Extracting…':document.extraction_status==='completed'?'Re-extract':'Extract text'}</button>
           </div>
          ))}
         </div>
        </section>
       )}

       <section className="screening-review-section">
        <div className="screening-section-heading">
         <div><span className="screening-section-kicker">Human review</span><h3>Your score</h3><p>Give this applicant a score out of 100 based on your review.</p></div>
        </div>
        <div className="screening-score-editor">
         <label className="screening-score-field">
          <span>Score</span>
          <div className="screening-score-input-wrap"><input type="number" min="0" max="100" step="1" value={manualScore} onChange={e=>{setManualScore(e.target.value);setScoreNotice('')}} placeholder="80"/><span>/ 100</span></div>
         </label>
         <button className="primary-button" onClick={saveScore} disabled={scoreSaving}>{scoreSaving?'Saving…':'Save score'}</button>
         {scoreNotice&&<span className={scoreNotice==='Score saved.'?'screening-score-success':'screening-score-error'}>{scoreNotice}</span>}
        </div>
       </section>

       <section className="screening-review-section screening-ai-section">
        <div className="screening-section-heading">
         <div><span className="screening-section-kicker">Optional</span><h3>AI recommendation</h3><p>AI reviews the complete application and gives you a recommendation.</p></div>
         <button className="secondary-button" onClick={runAiScreening} disabled={aiRunning}>{aiRunning?'Screening…':data.ai?'Run again':'Screen with AI'}</button>
        </div>
        {aiError&&<div className="form-error screening-inline-error">{aiError}</div>}
        {data.ai ? (
         <div className="screening-ai-result">
          <div className="screening-ai-topline"><span className="screening-summary-label">Recommendation</span><strong>{aiRecommendation||'Review recommended'}</strong></div>
          <p>{data.ai.overall_assessment||'No overall assessment recorded.'}</p>
          {data.ai.strengths?.length>0&&<div><span className="screening-summary-label">Strengths</span><ul className="screening-simple-list">{data.ai.strengths.map((item:any,index:number)=><li key={index}>{typeof item==='string'?item:JSON.stringify(item)}</li>)}</ul></div>}
          {data.ai.concerns?.length>0&&<div><span className="screening-summary-label">Concerns</span><ul className="screening-simple-list">{data.ai.concerns.map((item:any,index:number)=><li key={index}>{typeof item==='string'?item:JSON.stringify(item)}</li>)}</ul></div>}
         </div>
        ) : <div className="screening-ai-empty"><p className="muted">AI has not screened this application yet.</p></div>}
       </section>
      </main>

      <footer className="screening-review-footer">
       <div className="screening-decision-copy"><span className="screening-summary-label">Final decision</span><strong>{currentDecision==='pending'?'Choose approve or reject after reviewing the application.':currentDecision==='approved'?'Applicant approved':'Applicant rejected'}</strong></div>
       <div className="screening-decision-actions">
        <button className="secondary-button screening-reject-button" onClick={()=>onDecision(row,'rejected')} disabled={currentDecision==='rejected'}>Reject</button>
        <button className="primary-button screening-approve-button" onClick={()=>onDecision(row,'approved')} disabled={currentDecision==='approved'}>Approve</button>
       </div>
      </footer>
     </>
    ) : null}
   </div>
  </div>
 )
}
export function ReviewsWorkspace({applications,organizationId,onOpen}:{applications:Application[];organizationId:string;onOpen:(a:Application)=>void}){
 const [rows,setRows]=useState<any[]>([]),[reviewers,setReviewers]=useState<Profile[]>([]),[audit,setAudit]=useState<any[]>([]),[loading,setLoading]=useState(true),[auditLoading,setAuditLoading]=useState(true),[error,setError]=useState(''),[auditError,setAuditError]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState('all')
 async function load(){setLoading(true);setError('');try{const ids=applications.map(a=>a.id);if(!ids.length){setRows([]);setLoading(false);return}const {data:subs,error:se}=await supabase.from('submissions').select('id,application_id,applicant_id,created_at').in('application_id',ids).order('created_at',{ascending:false});if(se)throw se;const submissionIds=(subs||[]).map(s=>s.id);if(!submissionIds.length){setRows([]);setLoading(false);return}const [{data:assignments,error:ae},{data:people,error:pe},{data:applicants,error:apE}]=await Promise.all([supabase.from('review_assignments').select('id,submission_id,reviewer_id,status,score,decision,updated_at').in('submission_id',submissionIds),supabase.from('profiles').select('id,full_name,role,organization_id').eq('organization_id',organizationId).in('role',['reviewer','admin','owner']).order('full_name'),supabase.from('applicants').select('id,full_name,email').in('id',(subs||[]).map(s=>s.applicant_id).filter(Boolean))]);if(ae)throw ae;if(pe)throw pe;if(apE)throw apE;setReviewers(people||[]);const applicantMap=new Map((applicants||[]).map(x=>[x.id,x])),appMap=new Map(applications.map(x=>[x.id,x])),reviewerMap=new Map((people||[]).map(x=>[x.id,x]));setRows((subs||[]).map(s=>{const x=assignments?.find(a=>a.submission_id===s.id),p=applicantMap.get(s.applicant_id),app=appMap.get(s.application_id),r=x?reviewerMap.get(x.reviewer_id):null;return{submissionId:s.id,applicationId:s.application_id,applicantName:p?.full_name||'Unnamed applicant',email:p?.email||null,programmeName:app?.name||'Programme',reviewerName:r?.full_name||null,status:x?.status||'unassigned',decision:x?.decision||null,score:x?.score??null,updatedAt:x?.updated_at||s.created_at}}))}catch(e:any){setError(e.message||'Unable to load review operations.')}finally{setLoading(false)}}
 async function loadAudit(){setAuditLoading(true);setAuditError('');try{const ids=applications.map(a=>a.id);if(!ids.length){setAudit([]);return}const {data:subs,error:se}=await supabase.from('submissions').select('id,application_id,applicant_id').in('application_id',ids);if(se)throw se;const sids=(subs||[]).map(s=>s.id);if(!sids.length){setAudit([]);return}const {data:assignments,error:ae}=await supabase.from('review_assignments').select('id,submission_id').in('submission_id',sids);if(ae)throw ae;const aids=(assignments||[]).map(x=>x.id);if(!aids.length){setAudit([]);return}const {data:logs,error:le}=await supabase.from('review_audit_logs').select('id,review_assignment_id,action,from_status,to_status,previous_score,new_score,actor_id,metadata,created_at,organization_id').eq('organization_id',organizationId).in('review_assignment_id',aids).order('created_at',{ascending:false}).limit(500);if(le)throw le;const actorIds=[...new Set((logs||[]).map(x=>x.actor_id).filter(Boolean))];const applicantIds=[...new Set((subs||[]).map(x=>x.applicant_id).filter(Boolean))];const [{data:people,error:pe},{data:applicants,error:apE}]=await Promise.all([actorIds.length?supabase.from('profiles').select('id,full_name,organization_id').eq('organization_id',organizationId).in('id',actorIds):Promise.resolve({data:[],error:null}),applicantIds.length?supabase.from('applicants').select('id,full_name,email').in('id',applicantIds):Promise.resolve({data:[],error:null})]);if(pe)throw pe;if(apE)throw apE;const subMap=new Map((subs||[]).map(x=>[x.id,x])),assignMap=new Map((assignments||[]).map(x=>[x.id,x])),actorMap=new Map((people||[]).map(x=>[x.id,x])),applicantMap=new Map((applicants||[]).map(x=>[x.id,x])),appMap=new Map(applications.map(x=>[x.id,x]));setAudit((logs||[]).map(x=>{const s=subMap.get(assignMap.get(x.review_assignment_id)?.submission_id),p=s?applicantMap.get(s.applicant_id):null;return{...x,applicantName:p?.full_name||'Unknown applicant',programmeName:s?appMap.get(s.application_id)?.name||'Programme':'Programme',actorName:actorMap.get(x.actor_id)?.full_name||'System'}}))}catch(e:any){setAuditError(e.message||'Unable to load audit history.')}finally{setAuditLoading(false)}}
 useEffect(()=>{load();loadAudit()},[applications.map(a=>a.id).join(',')])
 const filtered=useMemo(()=>rows.filter(r=>(status==='all'||r.status===status)&&(!query||r.applicantName.toLowerCase().includes(query.toLowerCase())||r.email?.toLowerCase().includes(query.toLowerCase())||r.programmeName.toLowerCase().includes(query.toLowerCase()))),[rows,status,query])
 const filteredAudit=useMemo(()=>audit.filter(r=>!query||r.applicantName.toLowerCase().includes(query.toLowerCase())||r.actorName.toLowerCase().includes(query.toLowerCase())||r.action.toLowerCase().includes(query.toLowerCase())||r.programmeName.toLowerCase().includes(query.toLowerCase())),[audit,query])
 const stats=useMemo(()=>({total:rows.length,unassigned:rows.filter(r=>r.status==='unassigned').length,assigned:rows.filter(r=>r.status==='assigned').length,inProgress:rows.filter(r=>r.status==='in_progress').length,completed:rows.filter(r=>r.status==='completed').length}),[rows])
 const reviewerCounts=useMemo(()=>reviewers.map(p=>({name:p.full_name||'Unnamed reviewer',count:rows.filter(r=>r.reviewerName===(p.full_name||'Unnamed reviewer')).length})).filter(x=>x.count>0),[reviewers,rows])
 const exportAudit=()=>{const header=['Date','Action','Applicant','Programme','Actor','From status','To status','Previous score','New score'];const body=filteredAudit.map(r=>[r.created_at,r.action,r.applicantName,r.programmeName,r.actorName,r.from_status||'',r.to_status||'',r.previous_score??'',r.new_score??'']);const csv=[header,...body].map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='applyflow-review-audit.csv';a.click();URL.revokeObjectURL(url)}
 return <section><div className="page-heading compact"><div><p className="eyebrow">Human review</p><h1>Reviews & audit</h1><p className="subtitle">Manage reviewer workload and trace screening decisions.</p></div><div className="detail-actions"><button className="secondary-button" onClick={load}>Refresh reviews</button><button className="secondary-button" onClick={loadAudit}>Refresh audit</button><button className="secondary-button" onClick={exportAudit} disabled={!filteredAudit.length}><Download size={15}/> Export CSV</button></div></div>{(error||auditError)&&<div className="form-error page-error">{error||auditError}</div>}<div className="stats-grid"><div className="stat-card"><span>Total reviews</span><strong>{stats.total}</strong></div><div className="stat-card"><span>Unassigned</span><strong>{stats.unassigned}</strong></div><div className="stat-card"><span>Assigned</span><strong>{stats.assigned}</strong></div><div className="stat-card"><span>In progress</span><strong>{stats.inProgress}</strong></div><div className="stat-card"><span>Completed</span><strong>{stats.completed}</strong></div></div>{reviewerCounts.length>0&&<div className="card table-card"><div className="card-header"><div><h2>Reviewer workload</h2><p>Current review assignments by reviewer.</p></div><Users size={20}/></div><div className="table-wrap"><table><thead><tr><th>Reviewer</th><th>Assigned</th></tr></thead><tbody>{reviewerCounts.map(r=><tr key={r.name}><td><strong>{r.name}</strong></td><td>{r.count}</td></tr>)}</tbody></table></div></div>}<div className="card table-card"><div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search applicant, programme or actor…"/></div><select aria-label="Filter reviews by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></div><div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Programme</th><th>Reviewer</th><th>Status</th><th>Decision</th><th>Score</th><th>Updated</th><th></th></tr></thead><tbody>{loading?<tr><td colSpan={8}><div className="loading-card">Loading review operations…</div></td></tr>:filtered.length===0?<tr><td colSpan={8}><div className="table-empty">No review records match your filters.</div></td></tr>:filtered.map(r=><tr key={r.submissionId}><td><strong>{r.applicantName}</strong><span className="table-sub">{r.email||'No email'}</span></td><td>{r.programmeName}</td><td>{r.reviewerName||'Unassigned'}</td><td><span className={'status '+(r.status==='completed'?'green':r.status==='in_progress'?'amber':r.status==='assigned'?'blue':'neutral')}>{r.status.replace('_',' ')}</span></td><td>{r.decision||'—'}</td><td>{r.score==null?'—':r.score}</td><td>{r.updatedAt?new Date(r.updatedAt).toLocaleDateString():'—'}</td><td><button className="text-button" onClick={()=>{const a=applications.find(x=>x.id===r.applicationId);if(a)onOpen(a)}}>Review</button></td></tr>)}</tbody></table></div></div><div className="card table-card" style={{marginTop:16}}><div className="card-header"><div><h2>Decision & override history</h2><p>Audit trail of reviewer status and score changes.</p></div><ClipboardList size={20}/></div><div className="table-wrap"><table><thead><tr><th>Date</th><th>Action</th><th>Applicant</th><th>Actor</th><th>Status change</th><th>Score change</th></tr></thead><tbody>{auditLoading?<tr><td colSpan={6}><div className="loading-card">Loading audit history…</div></td></tr>:filteredAudit.length===0?<tr><td colSpan={6}><div className="table-empty">No audit events found.</div></td></tr>:filteredAudit.map(r=><tr key={r.id}><td>{r.created_at?new Date(r.created_at).toLocaleString(): '—'}</td><td>{r.action}</td><td><strong>{r.applicantName}</strong><span className="table-sub">{r.programmeName}</span></td><td>{r.actorName}</td><td>{r.from_status||'—'} {r.to_status?'→ '+r.to_status:''}</td><td>{r.previous_score==null&&r.new_score==null?'—':String(r.previous_score??'—')+' → '+String(r.new_score??'—')}</td></tr>)}</tbody></table></div></div></section>
}
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