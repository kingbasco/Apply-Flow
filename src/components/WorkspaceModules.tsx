import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowRight, Users, Settings, FileText, ShieldCheck, ClipboardList, Save, Eye, Search, Plus, History, Lock, LockOpen, SlidersHorizontal, MoreHorizontal, Download, X, CheckCircle2, UserRoundPlus, UserCheck, Clock3, Link2, Copy, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'
import TablePagination from './TablePagination'

function ActionFeedback({message,type='success',onDismiss}:{message:string;type?:'success'|'error';onDismiss?:()=>void}){useEffect(()=>{const timer=window.setTimeout(()=>onDismiss?.(),5000);return()=>window.clearTimeout(timer)},[message,onDismiss]);return createPortal(<div className={'action-feedback-toast '+(type==='error'?'is-error':'is-success')} role={type==='error'?'alert':'status'} aria-live="polite"><div className="action-feedback-icon">{type==='error'?<X size={18}/>:<CheckCircle2 size={18}/>}</div><div className="action-feedback-copy"><strong>{type==='error'?'Action failed':'Success'}</strong><span>{message}</span></div>{onDismiss&&<button type="button" className="action-feedback-close" aria-label="Dismiss notification" onClick={onDismiss}><X size={16}/></button>}<span className="action-feedback-timer" aria-hidden="true"/></div>,document.body)}

async function persistSubmissionDecision(submissionId:string,decision:'approved'|'rejected'){
 const {data,error}=await supabase.rpc('set_submission_decision',{p_submission_id:submissionId,p_decision:decision})
 if(error)throw error
 const saved=Array.isArray(data)?data[0]:data
 if(!saved||saved.decision!==decision)throw new Error('The application decision was not confirmed by the server.')
 return saved
}

type Application={id:string;name:string;description:string|null;status:'draft'|'published'|'screening'|'closed'|'completed';deadline:string|null;target_count:number|null;participant_id_prefix:string;created_at:string}
type FormSummary={application:Application;version:number|null;versionStatus:'draft'|'published'|'none';hasPublishedVersion:boolean;questionCount:number;submissionCount:number;publicSlug:string|null;settings?:FormSettings}
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
 const latest=new Map<string,any>();const published=new Set<string>();for(const v of versions){if(!latest.has(v.application_id))latest.set(v.application_id,v);if(v.status==='published')published.add(v.application_id)}
 const latestIds=Array.from(latest.values()).map(v=>v.id);const counts=new Map<string,number>()
 if(latestIds.length){const {data,error}=await supabase.from('questions').select('id,form_version_id').in('form_version_id',latestIds);if(error)throw error;for(const q of data||[])counts.set(q.form_version_id,(counts.get(q.form_version_id)||0)+1)}
 const submissionCounts=new Map<string,number>();for(const s of submissions)submissionCounts.set(s.application_id,(submissionCounts.get(s.application_id)||0)+1)
 const slugs=new Map<string,string|null>();for(const s of settings)slugs.set(s.application_id,s.public_slug)
 return applications.map(application=>{const v=latest.get(application.id);const raw=(settings as any[]).find(s=>s.application_id===application.id);return {application,version:v?.version_number??null,versionStatus:v?.status??'none',hasPublishedVersion:published.has(application.id),questionCount:v?counts.get(v.id)||0:0,submissionCount:submissionCounts.get(application.id)||0,publicSlug:slugs.get(application.id)||null,settings:raw?{start_date:raw.start_date??null,deadline:application.deadline??null,submission_limit:raw.submission_limit??null,confirmation_message:raw.confirmation_message??'Thank you. Your application has been received.',applicant_instructions:raw.applicant_instructions??null}:undefined}})
}
type FormSettings={start_date:string|null;deadline:string|null;submission_limit:number|null;confirmation_message:string;applicant_instructions:string|null}
type Profile={id:string;full_name:string|null;role:string;organization_id:string|null;email?:string|null;invitation_status?:'pending'|'active'}

async function functionErrorMessage(error:unknown,fallback:string){
 const context=(error as any)?.context
 if(context&&typeof context.json==='function'){
  try{
   const body=await context.json()
   if(body?.error)return String(body.error)
   if(body?.message)return String(body.message)
  }catch{}
 }
 return error instanceof Error&&error.message?error.message:fallback
}

function ModuleList({title,eyebrow,description,icon:Icon,applications,onOpen}:{title:string;eyebrow:string;description:string;icon:any;applications:Application[];onOpen:(a:Application)=>void}){
 return <section><div className="page-heading compact"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{description}</p></div></div><div className="card table-card"><div className="card-header"><div><h2>{title} by programme</h2><p>Choose a programme to continue.</p></div></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Deadline</th><th></th></tr></thead><tbody>{applications.length?applications.map(a=><tr key={a.id}><td><strong>{a.name}</strong><span className="table-sub">{a.description||'No description yet.'}</span></td><td><span className={'status '+(a.status==='published'?'blue':'neutral')}>{a.status}</span></td><td>{a.deadline?new Date(a.deadline).toLocaleDateString():'—'}</td><td><button className="secondary-button" onClick={()=>onOpen(a)}>Open <ArrowRight size={15}/></button></td></tr>):<tr><td colSpan={4}><div className="table-empty">Create a form first.</div></td></tr>}</tbody></table></div></div></section>
}

type VersionRecord={id:string;version_number:number;status:'draft'|'published';title:string;created_at:string;published_at:string|null;submissionCount:number}

function formWorkspaceStatus(s:FormSummary):'draft'|'published'|'closed'|'none'{
 if(s.application.status==='closed'||s.application.status==='screening'||s.application.status==='completed')return 'closed'
 if(s.application.status==='published')return 'published'
 return s.versionStatus
}

export function FormsWorkspace({applications,onOpen,onCreate}:{applications:Application[];onOpen:(a:Application)=>void;onCreate?:()=>void}){
 const [summaries,setSummaries]=useState<FormSummary[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [query,setQuery]=useState(''); const [filter,setFilter]=useState<'all'|'draft'|'published'|'closed'|'none'>('all')
 const [versions,setVersions]=useState<VersionRecord[]>([]); const [historyFor,setHistoryFor]=useState<FormSummary|null>(null); const [historyLoading,setHistoryLoading]=useState(false); const [busyId,setBusyId]=useState(''); const [settingsFor,setSettingsFor]=useState<FormSummary|null>(null); const [settingsDraft,setSettingsDraft]=useState<FormSettings>({start_date:null,deadline:null,submission_limit:null,confirmation_message:'Thank you. Your application has been received.',applicant_instructions:null}); const [settingsSaving,setSettingsSaving]=useState(false)

 async function load(){setLoading(true);setError('');try{setSummaries(await loadFormSummaries(applications))}catch(e){setError(friendlyErrorMessage(e,'Could not load forms.'))}finally{setLoading(false)}}
 useEffect(()=>{load()},[applications])

 const filtered=useMemo(()=>summaries.filter(s=>{const q=query.trim().toLowerCase();const status=formWorkspaceStatus(s);return(!q||s.application.name.toLowerCase().includes(q))&&(filter==='all'||status===filter)}),[summaries,query,filter])
 const counts=useMemo(()=>({published:summaries.filter(s=>formWorkspaceStatus(s)==='published').length,draft:summaries.filter(s=>formWorkspaceStatus(s)==='draft').length,closed:summaries.filter(s=>formWorkspaceStatus(s)==='closed').length}),[summaries])

 async function changeStatus(summary:FormSummary,next:'published'|'closed'){
   setBusyId(summary.application.id);setError('')
   try{
     if(next==='published'&&!summary.hasPublishedVersion) throw new Error('Publish the form in the Form Builder before opening applications.')
     const {error}=await supabase.from('applications').update({status:next,updated_at:new Date().toISOString()}).eq('id',summary.application.id)
     if(error)throw error
     setSummaries(current=>current.map(s=>s.application.id===summary.application.id?{...s,application:{...s.application,status:next}}:s))
   }catch(e){setError(friendlyErrorMessage(e,'Could not update form status.'))}finally{setBusyId('')}
 }

 function openSettings(summary:FormSummary){
   setSettingsFor(summary)
   setSettingsDraft(summary.settings||{start_date:null,deadline:summary.application.deadline??null,submission_limit:null,confirmation_message:'Thank you. Your application has been received.',applicant_instructions:null})
 }
 async function saveSettings(){
   if(!settingsFor)return
   setSettingsSaving(true);setError('')
   try{
     const limit=settingsDraft.submission_limit===null?null:Number(settingsDraft.submission_limit)
     if(limit!==null&&(!Number.isInteger(limit)||limit<1))throw new Error('Submission limit must be a whole number greater than 0.')
     const {error:applicationError}=await supabase.from('applications').update({
       deadline:settingsDraft.deadline||null,
       updated_at:new Date().toISOString()
     }).eq('id',settingsFor.application.id)
     if(applicationError)throw applicationError
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
   }catch(e){setError(friendlyErrorMessage(e,'Could not save form settings.'))}finally{setSettingsSaving(false)}
 }
 
 async function openHistory(summary:FormSummary){
   setHistoryFor(summary);setHistoryLoading(true);setVersions([])
   const {data,error}=await supabase.from('form_versions').select('id,version_number,status,title,created_at,published_at').eq('application_id',summary.application.id).order('version_number',{ascending:false})
   if(error){setError(friendlyErrorMessage(error));setHistoryLoading(false);return}
   const rows=(data||[]) as Omit<VersionRecord,'submissionCount'>[]
   const ids=rows.map(v=>v.id)
   const counts=new Map<string,number>()
   if(ids.length){
     const {data:subs,error:subError}=await supabase.from('submissions').select('form_version_id').in('form_version_id',ids)
     if(subError){setError(friendlyErrorMessage(subError));setHistoryLoading(false);return}
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
   }catch(e){setError(friendlyErrorMessage(e,'Could not duplicate this version.'))}finally{setBusyId('')}
 }

 function preview(s:FormSummary){if(!s.publicSlug){setError('This programme does not have a public application link yet.');return}window.open('/apply/'+s.publicSlug,'_blank','noopener,noreferrer')}

 return <section>
  <div className="page-heading compact"><div><p className="eyebrow">Application intake</p><h1>Forms</h1><p className="subtitle">Build and manage the questionnaires applicants complete.</p></div><div className="detail-actions">{onCreate&&<button className="primary-button" onClick={onCreate}><Plus size={16}/> Create form</button>}</div></div>
  {error&&<ActionFeedback message={error} type="error" onDismiss={()=>setError('')}/>}
  <div className="stats-grid" style={{marginBottom:16}}>
   <div className="card stat-card"><div className="stat-icon"><FileText size={18}/></div><div><p className="eyebrow">Total forms</p><div className="stat-value">{summaries.length}</div><p className="muted">Forms in this workspace</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><FileText size={18}/></div><div><p className="eyebrow">Published</p><div className="stat-value">{counts.published}</div><p className="muted">Accepting applications</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><FileText size={18}/></div><div><p className="eyebrow">Drafts</p><div className="stat-value">{counts.draft}</div><p className="muted">Still being built</p></div></div>
   <div className="card stat-card"><div className="stat-icon"><Lock size={18}/></div><div><p className="eyebrow">Closed</p><div className="stat-value">{counts.closed}</div><p className="muted">No new applications</p></div></div>
  </div>
  <div className="card table-card"><div className="card-header"><div><h2>Application forms</h2><p>Each form belongs to a programme and defines the questions applicants complete.</p></div></div>
   <div className="forms-toolbar">
    
    <div className="forms-search"><Search size={16}/><input aria-label="Search forms" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search programmes…" /></div>
    <div className="forms-filters" role="group" aria-label="Filter forms by status">{(['all','draft','published','closed','none'] as const).map(f=><button key={f} className={filter===f?'filter-button active':'filter-button'} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='none'?'Not started':f[0].toUpperCase()+f.slice(1)}<span>{f==='all'?summaries.length:f==='draft'?counts.draft:f==='published'?counts.published:f==='closed'?counts.closed:summaries.filter(s=>formWorkspaceStatus(s)==='none').length}</span></button>)}</div>
   </div>
   <div className="table-wrap"><table><thead><tr><th>Form</th><th>Form status</th><th>Version</th><th>Questions</th><th>Submissions</th><th>Deadline</th><th></th></tr></thead><tbody>
    {loading?<tr><td colSpan={7}><div className="loading-card">Loading forms…</div></td></tr>:!filtered.length?<tr><td colSpan={7}><div className="table-empty"><div className="empty-icon"><FileText size={20}/></div><h3>{summaries.length?'No forms match your filters':'No forms yet'}</h3><p>{summaries.length?'Try another search or filter.':'Create your first form to start collecting applications.'}</p>{!summaries.length&&onCreate&&<button className="primary-button" onClick={onCreate}><Plus size={15}/> Create form</button>}</div></td></tr>:
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

  {settingsFor&&<div className="form-settings-overlay" role="dialog" aria-modal="true" aria-label="Form settings">
   <div className="form-settings-page">
    <header className="form-settings-header">
      <div className="form-settings-heading">
        <button type="button" className="back-link" onClick={()=>setSettingsFor(null)}>← Back to forms</button>
        <div className="form-settings-heading-copy">
          <div className="form-settings-icon"><SlidersHorizontal size={20}/></div>
          <div>
            <p className="eyebrow">Form settings</p>
            <h2>{settingsFor.application.name}</h2>
            <p>Control when this form is available and what applicants see after submitting it.</p>
          </div>
        </div>
      </div>
      <button type="button" className="icon-button" onClick={()=>setSettingsFor(null)} aria-label="Close settings"><X size={18}/></button>
    </header>

    <div className="form-settings-layout">
      <aside className="form-settings-nav">
        <div className="settings-nav-label">FORM SETTINGS</div>
        <a href="#form-availability" className="settings-nav-link"><span>1</span><div><strong>Availability</strong><small>Opening, deadline and limit</small></div></a>
        <a href="#form-applicant-experience" className="settings-nav-link"><span>2</span><div><strong>Applicant experience</strong><small>Instructions and confirmation</small></div></a>
        <div className="form-settings-help"><FileText size={17}/><div><strong>Form vs programme</strong><p>A programme is the application campaign. The form is the questionnaire applicants complete.</p></div></div>
      </aside>

      <main className="form-settings-content">
        <section id="form-availability" className="settings-card">
          <div className="settings-card-heading">
            <div>
              <p className="eyebrow">Availability</p>
              <h3>When can applicants submit?</h3>
              <p>Set the window for this form. Leave a field empty when you do not need that restriction.</p>
            </div>
          </div>
          <div className="settings-fields">
            <label className="field settings-field-card">
              <span>Form opens</span>
              <input type="date" className="date-picker-input" onClick={e=>{try{e.currentTarget.showPicker?.()}catch{}}} value={settingsDraft.start_date||''} onChange={e=>setSettingsDraft(d=>({...d,start_date:e.target.value||null}))}/>
              <small className="muted">Applicants cannot submit before this date.</small>
            </label>
            <label className="field settings-field-card">
              <span>Application deadline</span>
              <input type="date" className="date-picker-input" onClick={e=>{try{e.currentTarget.showPicker?.()}catch{}}} value={settingsDraft.deadline||''} onChange={e=>setSettingsDraft(d=>({...d,deadline:e.target.value||null}))}/>
              <small className="muted">Applicants cannot submit after this date.</small>
            </label>
            <label className="field settings-field-card">
              <span>Submission limit <span className="optional">Optional</span></span>
              <input type="number" min="1" step="1" value={settingsDraft.submission_limit??''} onChange={e=>setSettingsDraft(d=>({...d,submission_limit:e.target.value?Number(e.target.value):null}))} placeholder="e.g. 500"/>
              <small className="muted">Maximum number of submitted applications.</small>
            </label>
          </div>
        </section>

        <section id="form-applicant-experience" className="settings-card">
          <div className="settings-card-heading">
            <div>
              <p className="eyebrow">Applicant experience</p>
              <h3>What applicants see</h3>
              <p>Give applicants clear instructions before they start and a useful message after they submit.</p>
            </div>
          </div>
          <div className="settings-fields single">
            <label className="field">
              <span>Applicant instructions <span className="optional">Optional</span></span>
              <textarea rows={7} value={settingsDraft.applicant_instructions||''} onChange={e=>setSettingsDraft(d=>({...d,applicant_instructions:e.target.value||null}))} placeholder="Tell applicants what they need before they start…"/>
              <small className="muted">Shown above the form before applicants begin.</small>
            </label>
            <label className="field">
              <span>Confirmation message</span>
              <textarea rows={6} value={settingsDraft.confirmation_message} onChange={e=>setSettingsDraft(d=>({...d,confirmation_message:e.target.value}))} placeholder="Thank you. Your application has been received."/>
              <small className="muted">Shown after a successful submission, together with the applicant's Participant ID.</small>
            </label>
          </div>
          <div className="settings-preview-note">
            <CheckCircle2 size={17}/>
            <div><strong>Participant ID</strong><p>ApplyFlow automatically gives every submitted application a Participant ID and shows it on the success screen.</p></div>
          </div>
        </section>
      </main>
    </div>

    <footer className="form-settings-footer">
      <div><span className="settings-save-state">Unsaved changes are only applied when you save.</span></div>
      <div className="form-settings-footer-actions">
        <button className="secondary-button" onClick={()=>setSettingsFor(null)}>Cancel</button>
        <button className="primary-button" disabled={settingsSaving} onClick={saveSettings}>{settingsSaving?'Saving…':'Save settings'}</button>
      </div>
    </footer>
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
export interface ScreeningRow {
 submissionId:string
 applicationId:string
 assignmentId?:string
 participantId:string
 applicantName:string
 email:string|null
 submittedAt:string|null
 eligibility:'eligible'|'ineligible'|'pending'
 aiStatus:string
 aiRecommendation:string
 decision:ScreeningDecision
}

function screeningRecommendation(ai:any):string{
 if(!ai)return 'Not screened'
 if(ai.status==='completed')return 'Screened'
 return ai.status==='failed'?'Failed':'In progress'
}

type ApplicationDecisionNotice={decision:'approved'|'rejected';applicantName:string;participantId:string}

function ApplicationDecisionResultModal({notice,onContinue,onBack,backLabel}:{notice:ApplicationDecisionNotice;onContinue:()=>void;onBack:()=>void;backLabel:string}){
 return createPortal(<div className="modal-backdrop screening-decision-result" role="dialog" aria-modal="true" aria-labelledby="decision-result-title">
  <div className="modal card" style={{maxWidth:460,textAlign:'center',padding:32}}>
   <div style={{width:58,height:58,borderRadius:'50%',margin:'0 auto 16px',display:'grid',placeItems:'center',fontSize:28,fontWeight:700,background:notice.decision==='approved'?'#ecfdf3':'#fef2f2',color:notice.decision==='approved'?'#15803d':'#b91c1c'}}>
    {notice.decision==='approved'?'✓':'×'}
   </div>
   <p className="eyebrow">{notice.decision==='approved'?'Approval successful':'Rejection successful'}</p>
   <h2 id="decision-result-title" style={{margin:'6px 0 8px'}}>{notice.decision==='approved'?'Applicant approved':'Applicant rejected'}</h2>
   <p style={{fontWeight:600,margin:'0 0 4px'}}>{notice.applicantName}</p>
   <p className="muted" style={{margin:'0 0 18px'}}>Participant ID: {notice.participantId}</p>
   <p className="muted" style={{margin:'0 0 22px'}}>{notice.decision==='approved'?'The applicant has been approved and the decision has been saved.':'The applicant has been rejected and the decision has been saved.'}</p>
   <div style={{display:'flex',justifyContent:'center',gap:10}}>
    <button className="secondary-button" onClick={onContinue}>Continue reviewing</button>
    <button className="primary-button" onClick={onBack}>{backLabel}</button>
   </div>
  </div>
 </div>,document.body)
}

export function ScreeningWorkspace({applications,onOpen,role}:{applications:Application[];onOpen:(a:Application)=>void;role?:Profile['role']}){
 const [rows,setRows]=useState<ScreeningRow[]>([])
 const [selectedApplicationId,setSelectedApplicationId]=useState('')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [query,setQuery]=useState('')
 const [filter,setFilter]=useState<'all'|'pending'|'approved'|'rejected'|'screened'>('all')
 const [reviewing,setReviewing]=useState<ScreeningRow|null>(null)
 const [aiBulkRunning,setAiBulkRunning]=useState(false)
 const [decisionNotice,setDecisionNotice]=useState<ApplicationDecisionNotice|null>(null)
 const [selectedSubmissionIds,setSelectedSubmissionIds]=useState<string[]>([])
 const [screeningPage,setScreeningPage]=useState(1)
 const [screeningPageSize,setScreeningPageSize]=useState(50)

 async function load(){
  setLoading(true);setError('')
  try{
   if(!applications.length){setRows([]);return}
   const selectedApplication=applications.find(a=>a.id===selectedApplicationId)
   if(!selectedApplication){setRows([]);return}
   const ids=[selectedApplication.id]
   const {data:subs,error:subsError}=await supabase.from('submissions').select('id,application_id,applicant_id,submitted_at,decision').in('application_id',ids).eq('status','submitted').order('submitted_at',{ascending:false})
   if(subsError)throw subsError
   const {data:authData}=await supabase.auth.getUser()
   const reviewerId=role==='reviewer'?authData.user?.id:null
   let visibleSubs=subs||[]
   let assignmentRows:any[]=[]
   if(reviewerId){
    const {data:assignments,error:assignmentError}=await supabase.from('review_assignments').select('id,submission_id,reviewer_id,status,notes,decision').in('submission_id',(subs||[]).map(s=>s.id)).eq('reviewer_id',reviewerId)
    if(assignmentError)throw assignmentError
    assignmentRows=assignments||[]
    const assignedIds=new Set(assignmentRows.map(x=>x.submission_id))
    visibleSubs=visibleSubs.filter(s=>assignedIds.has(s.id))
   }
   const submissionIds=visibleSubs.map(s=>s.id)
   if(!submissionIds.length){setRows([]);return}
   const [eligResult,aiResult,applicantResult]=await Promise.all([
    supabase.from('submission_eligibility').select('submission_id,status').in('submission_id',submissionIds),
    supabase.from('ai_screenings').select('submission_id,status,overall_assessment').in('submission_id',submissionIds),
    supabase.from('applicants').select('id,full_name,email,participant_id').in('id',visibleSubs.map(s=>s.applicant_id))
   ])
   if(eligResult.error)throw eligResult.error
   if(aiResult.error)throw aiResult.error
   if(applicantResult.error)throw applicantResult.error
   const eligMap=new Map((eligResult.data||[]).map(e=>[e.submission_id,e]))
   const aiMap=new Map((aiResult.data||[]).map(a=>[a.submission_id,a]))
   const applicantMap=new Map((applicantResult.data||[]).map(a=>[a.id,a]))
   const assignmentMap=new Map(assignmentRows.map(a=>[a.submission_id,a]))
   setRows(visibleSubs.map(s=>{
    const applicant=applicantMap.get(s.applicant_id)
    const ai=aiMap.get(s.id)
    const eligibility=eligMap.get(s.id)
    return {
     submissionId:s.id,
     applicationId:s.application_id,
     assignmentId:assignmentMap.get(s.id)?.id,
     participantId:applicant?.participant_id||'—',
     applicantName:applicant?.full_name||'Unnamed applicant',
     email:applicant?.email||null,
     submittedAt:s.submitted_at||null,
     eligibility:eligibility?.status==='eligible'?'eligible':eligibility?.status==='ineligible'?'ineligible':'pending',
     aiStatus:ai?.status||'pending',
     aiRecommendation:screeningRecommendation(ai),
     decision:s.decision==='approved'||s.decision==='rejected'?s.decision:'pending'
    }
   }))
  }catch(e){setError(friendlyErrorMessage(e,'Could not load screening data.'))}
  finally{setLoading(false)}
 }

 useEffect(()=>{
  if(!applications.length){setSelectedApplicationId('');setRows([]);return}
  setSelectedApplicationId(current=>applications.some(a=>a.id===current)?current:applications[0].id)
 },[applications])
 useEffect(()=>{setSelectedSubmissionIds([]);load()},[applications,role,selectedApplicationId])

 const counts=useMemo(()=>({
  total:rows.length,
  pending:rows.filter(r=>r.decision==='pending').length,
  approved:rows.filter(r=>r.decision==='approved').length,
  rejected:rows.filter(r=>r.decision==='rejected').length,
  screened:rows.filter(r=>r.aiRecommendation==='Screened').length
 }),[rows])

 const filtered=useMemo(()=>{
  const q=query.trim().toLowerCase()
  return rows.filter(r=>{
   const matchesQuery=!q||r.applicantName.toLowerCase().includes(q)||(r.email||'').toLowerCase().includes(q)||r.participantId.toLowerCase().includes(q)
   const matchesFilter=filter==='all'||(filter==='pending'&&r.decision==='pending')||(filter==='approved'&&r.decision==='approved')||(filter==='rejected'&&r.decision==='rejected')||(filter==='screened'&&r.aiRecommendation==='Screened')
   return matchesQuery&&matchesFilter
  })
 },[rows,query,filter])
 const screeningPageCount=Math.max(1,Math.ceil(filtered.length/screeningPageSize))
 const currentScreeningPage=Math.min(screeningPage,screeningPageCount)
 const pagedScreeningRows=useMemo(()=>filtered.slice((currentScreeningPage-1)*screeningPageSize,currentScreeningPage*screeningPageSize),[filtered,currentScreeningPage,screeningPageSize])
 useEffect(()=>{setScreeningPage(1)},[query,filter,selectedApplicationId])
 useEffect(()=>{if(screeningPage>screeningPageCount)setScreeningPage(screeningPageCount)},[screeningPage,screeningPageCount])

 const exportApplicants=()=>{
  const application=applications.find(a=>a.id===selectedApplicationId)
  const selectedRows=rows.filter(row=>selectedSubmissionIds.includes(row.submissionId))
  if(!application||!selectedRows.length)return
  const escapeCsv=(value:string)=>'"'+value.replace(/"/g,'""')+'"'
  const csv=[
   ['Applicant ID','Full Name','Email Address'],
   ...selectedRows.map(row=>[row.participantId,row.applicantName,row.email||''])
  ].map(row=>row.map(value=>escapeCsv(String(value??''))).join(',')).join('\n')
  const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=url
  link.download=(application.name.trim().replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'applicants')+'-applicants.csv'
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  setSelectedSubmissionIds([])
 }

 const toggleApplicant=(submissionId:string)=>setSelectedSubmissionIds(current=>current.includes(submissionId)?current.filter(id=>id!==submissionId):[...current,submissionId])
 const allFilteredSelected=pagedScreeningRows.length>0&&pagedScreeningRows.every(row=>selectedSubmissionIds.includes(row.submissionId))
 const toggleAllFiltered=()=>setSelectedSubmissionIds(current=>allFilteredSelected?current.filter(id=>!pagedScreeningRows.some(row=>row.submissionId===id)):Array.from(new Set([...current,...pagedScreeningRows.map(row=>row.submissionId)])))

 const setDecision=async(row:ScreeningRow,decision:'approved'|'rejected')=>{
  setError('')
  try{
   await persistSubmissionDecision(row.submissionId,decision)
   setRows(current=>current.map(r=>r.submissionId===row.submissionId?{...r,decision}:r))
   setReviewing(current=>current?.submissionId===row.submissionId?{...current,decision}:current)
   setDecisionNotice({decision,applicantName:row.applicantName,participantId:row.participantId})
  }catch(e:any){setError(e.message||'Could not save the application decision.')}
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
  }catch(e){setError(await functionErrorMessage(e,'AI screening failed.'))}
  finally{setAiBulkRunning(false)}
 }

 return <>
  <section>
   <div className="page-heading compact">
    <div><p className="eyebrow">Application screening</p><h1>Screening</h1><p className="subtitle">Quickly surface Age, Residential Address and Trade, then make the final decision yourself.</p></div>
    <div className="detail-actions">{role!=='reviewer'&&<button className="primary-button" onClick={screenWithAI} disabled={aiBulkRunning||loading||!rows.length}>{aiBulkRunning?'Screening…':'Screen all with AI'}</button>}<button className="secondary-button" onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button></div>
   </div>
   {error&&<ActionFeedback message={error} type="error" onDismiss={()=>setError('')}/>}
   <div className="card screening-application-picker">
    <div className="screening-application-picker-header">
     <div><p className="eyebrow">Choose application</p><h2>Screen one programme at a time</h2><p>Select a programme to view only its applicants, screening results and decisions.</p></div>
    </div>
    <div className="screening-application-list">
     {applications.map(application=><button key={application.id} type="button" className={selectedApplicationId===application.id?'screening-application-option active':'screening-application-option'} onClick={()=>setSelectedApplicationId(application.id)}>
      <span className="screening-application-option-copy"><strong>{application.name}</strong><small>{application.description||'No description yet.'}</small></span>
      <span className="screening-application-option-meta"><span className={'status '+(application.status==='published'?'blue':'neutral')}>{application.status}</span><ArrowRight size={16}/></span>
     </button>)}
    </div>
   </div>
   <div className="screening-current-application">
    <div><p className="eyebrow">Current application</p><h2>{applications.find(a=>a.id===selectedApplicationId)?.name||'Select an application'}</h2></div>
    <span className="status blue">Screening workspace</span>
   </div>
   <div className="stats-grid screening-stats">
    <div className="card stat-card"><div className="stat-icon"><ClipboardList size={18}/></div><div><p className="eyebrow">Total applicants</p><div className="stat-value">{counts.total}</div><p className="muted">Submitted applications</p></div></div>
    <div className="card stat-card"><div className="stat-icon"><ClipboardList size={18}/></div><div><p className="eyebrow">Pending</p><div className="stat-value">{counts.pending}</div><p className="muted">Awaiting a decision</p></div></div>
    <div className="card stat-card"><div className="stat-icon"><ShieldCheck size={18}/></div><div className="stat-content"><p className="eyebrow">Approved</p><div className="stat-value">{counts.approved}</div></div></div>
    <div className="card stat-card"><div className="stat-icon"><FileText size={18}/></div><div className="stat-content"><p className="eyebrow">Rejected</p><div className="stat-value">{counts.rejected}</div></div></div>
    <div className="card stat-card"><div className="stat-icon"><ArrowRight size={18}/></div><div className="stat-content"><p className="eyebrow">AI screened</p><div className="stat-value">{counts.screened}</div></div></div>
   </div>
   <div className="card table-card screening-applicants-card">
    <div className="card-header"><div><h2>Applicants</h2><p>Review the application, then approve or reject.</p></div><div className="detail-actions"><span className="muted">{selectedSubmissionIds.length} selected</span><button className="secondary-button" onClick={exportApplicants} disabled={loading||selectedSubmissionIds.length===0}><Download size={16}/> Export selected</button></div></div>
    <div className="forms-toolbar">
     <div className="forms-search"><Search size={16}/><input aria-label="Search applicants" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email or Participant ID…" /></div>
     <div className="forms-filters" role="group" aria-label="Filter applicants">{(['all','pending','approved','rejected','screened'] as const).map(f=><button key={f} className={filter===f?'filter-button active':'filter-button'} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='pending'?'Pending':f==='approved'?'Approved':f==='rejected'?'Rejected':'AI screened'}<span>{f==='all'?counts.total:f==='pending'?counts.pending:f==='approved'?counts.approved:f==='rejected'?counts.rejected:counts.screened}</span></button>)}</div>
    </div>
    <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label={allFilteredSelected?"Deselect all applicants on this page":"Select all applicants on this page"} checked={allFilteredSelected} onChange={toggleAllFiltered} disabled={!pagedScreeningRows.length}/></th><th>Applicant</th><th>Participant ID</th><th>Eligibility</th><th>AI</th><th>Status</th><th></th></tr></thead><tbody>
     {loading?<tr><td colSpan={7}><div className="loading-card">Loading applicants…</div></td></tr>:!filtered.length?<tr><td colSpan={8}><div className="table-empty"><h3>{rows.length?'No applicants match your filters':'No submitted applications yet'}</h3><p>{rows.length?'Try another filter or search.':'Applications will appear here after applicants submit a form.'}</p></div></td></tr>:
     pagedScreeningRows.map(row=><tr key={row.submissionId}>
      <td><input type="checkbox" aria-label={`Select ${row.applicantName}`} checked={selectedSubmissionIds.includes(row.submissionId)} onChange={()=>toggleApplicant(row.submissionId)}/></td>
      <td><strong>{row.applicantName}</strong><span className="table-sub">{row.email||'No email'}</span></td>
      <td><strong>{row.participantId}</strong></td>
      <td><span className={'status '+(row.eligibility==='eligible'?'blue':row.eligibility==='ineligible'?'neutral':'amber')}>{row.eligibility}</span></td>
      <td><span className={'status '+(row.aiRecommendation==='Screened'?'blue':row.aiRecommendation==='Failed'?'neutral':'amber')}>{row.aiRecommendation}</span></td>
      <td><span className={'status '+(row.decision==='approved'?'blue':row.decision==='rejected'?'neutral':'amber')}>{row.decision}</span></td>
      <td><button className="secondary-button" onClick={()=>setReviewing(row)}>Review <ArrowRight size={15}/></button></td>
     </tr>)}
    </tbody></table></div>
    <TablePagination
     total={filtered.length}
     page={currentScreeningPage}
     pageSize={screeningPageSize}
     onPageChange={setScreeningPage}
     onPageSizeChange={size=>{setScreeningPageSize(size);setScreeningPage(1)}}
    />
   </div>
  </section>
  {reviewing&&<ScreeningReviewModal row={reviewing} role={role} onClose={()=>setReviewing(null)} onDecision={setDecision}/>}
  {decisionNotice&&<ApplicationDecisionResultModal notice={decisionNotice} onContinue={()=>setDecisionNotice(null)} onBack={()=>{setDecisionNotice(null);setReviewing(null)}} backLabel="Back to screening"/>}
 </>
}

type ScreeningReviewData={submission:any;applicant:any;answers:any[];questions:any[];eligibility:any;ai:any;documents:any[];options:any[]}
export function ScreeningReviewModal({row,role,onClose,onDecision}:{row:ScreeningRow;role?:Profile['role'];onClose:()=>void;onDecision:(row:ScreeningRow,decision:'approved'|'rejected')=>Promise<void>}) {
 const [data,setData]=useState<ScreeningReviewData|null>(null)
 const [extractingId,setExtractingId]=useState('')
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 const [aiRunning,setAiRunning]=useState(false)
 const [aiError,setAiError]=useState('')
 const [quickScreenVisible,setQuickScreenVisible]=useState(false)
 const [manualNotes,setManualNotes]=useState('')
 const [reviewSaving,setReviewSaving]=useState(false)
 const [reviewNotice,setReviewNotice]=useState('')
 const [decisionToConfirm,setDecisionToConfirm]=useState<'approved'|'rejected'|null>(null)
 const reviewScrollRef=useRef<HTMLDivElement>(null)

 useEffect(()=>{
  const previousBodyOverflow=document.body.style.overflow
  const previousHtmlOverflow=document.documentElement.style.overflow
  const previousBodyOverscroll=document.body.style.overscrollBehavior
  const previousHtmlOverscroll=document.documentElement.style.overscrollBehavior
  document.body.style.overflow='hidden'
  document.documentElement.style.overflow='hidden'
  document.body.style.overscrollBehavior='none'
  document.documentElement.style.overscrollBehavior='none'
  const frame=window.requestAnimationFrame(()=>{
   if(reviewScrollRef.current){reviewScrollRef.current.scrollTop=0;reviewScrollRef.current.scrollLeft=0}
  })
  return()=>{
   window.cancelAnimationFrame(frame)
   document.body.style.overflow=previousBodyOverflow
   document.documentElement.style.overflow=previousHtmlOverflow
   document.body.style.overscrollBehavior=previousBodyOverscroll
   document.documentElement.style.overscrollBehavior=previousHtmlOverscroll
  }
 },[row.submissionId])

 useEffect(()=>{
  let active=true
  ;(async()=>{
   try{
    const [
     {data:s,error:se},
     {data:ans,error:ane},
     {data:e,error:ee},
     {data:ai,error:aie},
     {data:documents,error:de}
    ]=await Promise.all([
     supabase.from('submissions').select('id,application_id,form_version_id,applicant_id,status,submitted_at,decision').eq('id',row.submissionId).maybeSingle(),
     supabase.from('answers').select('id,question_id,value').eq('submission_id',row.submissionId),
     supabase.from('submission_eligibility').select('*').eq('submission_id',row.submissionId).maybeSingle(),
     supabase.from('ai_screenings').select('*').eq('submission_id',row.submissionId).maybeSingle(),
     supabase.from('uploaded_documents').select('id,question_id,storage_bucket,storage_path,original_name,mime_type,file_size,status,extraction_status,extracted_text,created_at').eq('submission_id',row.submissionId).order('created_at')
    ])
    if(se)throw se
    if(ane)throw ane
    if(ee)throw ee
    if(aie)throw aie
    if(de)throw de

    const {data:applicant,error:appErr}=await supabase.from('applicants').select('id,full_name,email,participant_id').eq('id',s?.applicant_id||'').maybeSingle()
    if(appErr)throw appErr

    const {data:questions,error:qErr}=await supabase.from('questions').select('id,label,description,type,position').eq('form_version_id',s?.form_version_id||'').order('position')
    if(qErr)throw qErr

    const questionIds=(questions||[]).map(question=>question.id)
    const {data:options,error:optionsError}=questionIds.length
      ? await supabase.from('question_options').select('id,question_id,label,value,position').in('question_id',questionIds).order('position')
      : {data:[],error:null}
    if(optionsError)throw optionsError

    if(active){
      setData({submission:s,applicant,answers:ans||[],questions:questions||[],eligibility:e,ai,documents:documents||[],options:options||[]})
      const assignmentForReviewer=role==='reviewer'
        ? (await supabase.from('review_assignments').select('id,notes,status').eq('id',row.assignmentId||'').maybeSingle()).data
        : null
      if(role==='reviewer') setManualNotes(assignmentForReviewer?.notes||'')
    }
   }catch(e){
    if(active)setError(friendlyErrorMessage(e,'Could not load this application.'))
   }finally{
    if(active)setLoading(false)
   }
  })()
  return ()=>{active=false}
 },[row.submissionId,row.applicationId,row.assignmentId,role])

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
  }catch(e){setAiError(friendlyErrorMessage(e,'Document extraction failed.'))}
  finally{setExtractingId('')}
 }

 const runAiScreening=async()=>{
  setQuickScreenVisible(true)
  setAiRunning(true);setAiError('')
  try{
   const {data:result,error:invokeError}=await supabase.functions.invoke('run-ai-screening',{body:{submission_id:row.submissionId}})
   if(invokeError)throw invokeError
   if(result?.error)throw new Error(result.error)
   const {data:ai,error:aiLoadError}=await supabase.from('ai_screenings').select('*').eq('submission_id',row.submissionId).maybeSingle()
   if(aiLoadError)throw aiLoadError
   setData(prev=>prev?{...prev,ai}:prev)
  }catch(e){setAiError(await functionErrorMessage(e,'AI screening failed.'))}
  finally{setAiRunning(false)}
 }

 const saveReviewNotes=async()=>{
  if(role!=='reviewer'||!row.assignmentId)return
  setReviewSaving(true);setReviewNotice('')
  try{
   const {error:assignmentError}=await supabase.rpc('update_review_assignment',{
     p_assignment_id:row.assignmentId,p_status:'completed',p_score:null,p_notes:manualNotes.trim()||null,p_decision:null
   })
   if(assignmentError)throw assignmentError
   setReviewNotice('Review notes saved.')
  }catch(e){
   setReviewNotice(friendlyErrorMessage(e,'Could not save review notes.'))
  }finally{setReviewSaving(false)}
 }

 const optionLabelMap=new Map<string,string>((data?.options||[]).flatMap((option:any)=>[
  [`${option.question_id}:${String(option.value)}`,option.label],
  [`${option.question_id}:${String(option.id)}`,option.label]
 ]))
 const formatValue=(value:any,questionId:string)=>{
  const formatItem=(item:any):string=>{
   if(item===null||item===undefined||item==='')return 'Not provided'
   if(typeof item==='object'){
    const raw=item.value??item.id??item.label
    if(raw!==undefined&&optionLabelMap.has(`${questionId}:${String(raw)}`))return optionLabelMap.get(`${questionId}:${String(raw)}`)||String(raw)
    return Object.entries(item).map(([key,val])=>`${key}: ${typeof val==='object'?JSON.stringify(val):String(val)}`).join(' · ')
   }
   return optionLabelMap.get(`${questionId}:${String(item)}`)||String(item)
  }
  if(value===null||value===undefined||value==='')return 'Not provided'
  if(Array.isArray(value))return value.length?value.map(formatItem).join(', '):'Not provided'
  return formatItem(value)
 }

 const answerMap=new Map((data?.answers||[]).map(answer=>[answer.question_id,answer.value]))
 const normalizedQuestionLabel=(value:any)=>String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()
 const quickValue=(matcher:(label:string)=>boolean)=>{
  const question=(data?.questions||[]).find((item:any)=>matcher(normalizedQuestionLabel(item.label)))
  return question?formatValue(answerMap.get(question.id),question.id):'Not provided'
 }
 const quickScreenProfile={
  age:quickValue(label=>label==='age'||label==='your age'||label.startsWith('age ')),
  residentialAddress:quickValue(label=>label.includes('residential address')||label==='home address'||label==='address'),
  trade:quickValue(label=>label==='what is your trade'||label==='your trade'||label==='trade'||label.startsWith('what is your trade '))
 }
 const currentDecision=row.decision
 const eligibilityStatus=data?.eligibility?.status||'pending'
 const aiScreened=data?.ai?.status==='completed'

 return createPortal((
  <div ref={reviewScrollRef} className="screening-review-backdrop" role="dialog" aria-modal="true" aria-label="Review application">
   <div className="screening-review-modal">
    <header className="screening-review-header">
     <div className="screening-review-heading">
      <div className="screening-review-heading-copy">
       <p className="eyebrow">Application review</p>
       <h2>{row.applicantName}</h2>
       <div className="screening-review-meta">
        <span className="screening-id">{data?.applicant?.participant_id||row.participantId}</span>
        <span>{row.email||'No email provided'}</span>
        <span>{row.submittedAt?new Date(row.submittedAt).toLocaleString():'Submitted date unavailable'}</span>
       </div>
      </div>
      <button type="button" className="secondary-button screening-back-button" onClick={onClose} aria-label={role==='reviewer'?'Back to reviews':'Back to screening'}>← Back to {role==='reviewer'?'reviews':'screening'}</button>
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
        <div className="screening-summary-card"><span className="screening-summary-label">Participant ID</span><strong className="screening-summary-value">{data.applicant?.participant_id||row.participantId}</strong></div>
        <div className="screening-summary-card"><span className="screening-summary-label">Eligibility</span><strong className="screening-summary-value">{eligibilityStatus}</strong></div>
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
            <div className="screening-answer-value">{formatValue(answerMap.get(question.id),question.id)}</div>
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
            {role!=='reviewer'&&<button className="secondary-button" onClick={()=>extractDocument(document.id)} disabled={extractingId===document.id||document.extraction_status==='processing'}>{extractingId===document.id?'Extracting…':document.extraction_status==='completed'?'Re-extract':'Extract text'}</button>}
           </div>
          ))}
         </div>
        </section>
       )}

       <section className="screening-review-section screening-review-overview">
        <div className="screening-section-heading">
         <div><span className="screening-section-kicker">Review summary</span><h3>Make the decision from the evidence</h3><p>Review the applicant's answers, eligibility result and AI recommendation before deciding.</p></div>
        </div>
        <div className="screening-review-status-grid">
         <div className="screening-review-status-card"><span>Eligibility</span><strong className={eligibilityStatus==='eligible'?'is-positive':eligibilityStatus==='ineligible'?'is-negative':''}>{eligibilityStatus==='eligible'?'Eligible':eligibilityStatus==='ineligible'?'Not eligible':'Pending'}</strong><small>{eligibilityStatus==='eligible'?'Meets the configured eligibility rules.':eligibilityStatus==='ineligible'?'Does not meet the configured eligibility rules.':'Eligibility has not been resolved yet.'}</small></div>
         <div className="screening-review-status-card"><span>AI screening</span><strong className={aiScreened?'is-positive':''}>{aiScreened?'Screened':'Not screened'}</strong><small>Quick profile only — Age, Residential Address and Trade.</small></div>
        </div>
       </section>

       {role==='reviewer'&&<section className="screening-review-section">
        <div className="screening-section-heading">
         <div><span className="screening-section-kicker">Human review</span><h3>Review notes</h3><p>Add optional notes for the programme team. No numeric score is required.</p></div>
        </div>
        <div className="screening-score-editor">
         <label className="screening-score-notes"><span>Review notes</span><textarea rows={4} value={manualNotes} onChange={e=>{setManualNotes(e.target.value);setReviewNotice('')}} placeholder="Add your review notes for the programme team…"/></label>
         <button className="primary-button" onClick={saveReviewNotes} disabled={reviewSaving}>{reviewSaving?'Saving…':'Save review notes'}</button>
         {reviewNotice&&<span className={reviewNotice==='Review notes saved.'?'screening-score-success':'screening-score-error'}>{reviewNotice}</span>}
        </div>
       </section>}

       <section className="screening-review-section screening-ai-section">
        <div className="screening-section-heading">
         <div><span className="screening-section-kicker">Quick screen</span><h3>Applicant essentials</h3><p>Screen only the three details you need — no long AI analysis.</p></div>
         <button className="secondary-button screening-ai-button" onClick={runAiScreening} disabled={aiRunning}>{aiRunning?'Screening…':(quickScreenVisible||aiScreened)?'Refresh screen':'Screen with AI'}</button>
        </div>
        {aiError&&<div className="form-error screening-inline-error">{aiError}</div>}
        {(quickScreenVisible||aiScreened)?(
         <div className="screening-quick-profile">
          <article><span>Age</span><strong>{quickScreenProfile.age}</strong></article>
          <article><span>Residential Address</span><strong>{quickScreenProfile.residentialAddress}</strong></article>
          <article><span>Trade</span><strong>{quickScreenProfile.trade}</strong></article>
         </div>
        ):<div className="screening-ai-empty"><p className="muted">Click <strong>Screen with AI</strong> to pull out Age, Residential Address and Trade immediately.</p></div>}
       </section>
      </main>

      <footer className="screening-review-footer">
       <div className="screening-decision-copy"><span className="screening-summary-label">Final decision</span><strong>{currentDecision==='pending'?'Ready to decide?':currentDecision==='approved'?'Applicant approved — participant enrolment is active':'Applicant rejected'}</strong><span>{currentDecision==='pending'?'Approve to enrol the applicant as a participant, or reject the application.':'This decision has been saved.'}</span></div>
       {decisionToConfirm ? <div className="screening-decision-confirm"><strong>{decisionToConfirm==='approved'?'Approve this applicant?':'Reject this application?'}</strong><span>{decisionToConfirm==='approved'?'They will be approved and moved into Participants automatically.':'This application will be marked rejected.'}</span><div><button className="secondary-button" onClick={()=>setDecisionToConfirm(null)}>Cancel</button><button className={decisionToConfirm==='approved'?'primary-button screening-approve-button':'secondary-button screening-reject-button'} onClick={async()=>{const d=decisionToConfirm;setDecisionToConfirm(null);await onDecision(row,d)}}>{decisionToConfirm==='approved'?'Confirm approval':'Confirm rejection'}</button></div></div> : <div className="screening-decision-actions"><button className="secondary-button screening-reject-button" onClick={()=>setDecisionToConfirm('rejected')} disabled={currentDecision==='rejected'}>Reject application</button><button className="primary-button screening-approve-button" onClick={()=>setDecisionToConfirm('approved')} disabled={currentDecision==='approved'}>Approve & enrol participant</button></div>}
      </footer>
     </>
    ) : null}
   </div>
  </div>
 ),document.body)
}
export function ReviewsWorkspace({applications,organizationId,onOpen,role}:{applications:Application[];organizationId:string;onOpen:(a:Application)=>void;role?:Profile['role']}){
 const [rows,setRows]=useState<any[]>([]),[reviewers,setReviewers]=useState<Profile[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState('all'),[selectedIds,setSelectedIds]=useState<string[]>([]),[assignmentReviewer,setAssignmentReviewer]=useState(''),[assigning,setAssigning]=useState(false),[assignmentNotice,setAssignmentNotice]=useState(''),[reviewing,setReviewing]=useState<any|null>(null),[decisionNotice,setDecisionNotice]=useState<ApplicationDecisionNotice|null>(null);
 const [currentUserId,setCurrentUserId]=useState('')
 const [myReviewsPage,setMyReviewsPage]=useState(1)
 const [myReviewsPageSize,setMyReviewsPageSize]=useState(50)
 const [reviewsPage,setReviewsPage]=useState(1)
 const [reviewsPageSize,setReviewsPageSize]=useState(50)

 async function load(){
  setLoading(true);setError('');
  try{
   const ids=applications.map(a=>a.id);
   if(!ids.length){setRows([]);setReviewers([]);setLoading(false);return}
   const {data:subs,error:se}=await supabase.from('submissions').select('id,application_id,applicant_id,created_at,submitted_at,decision').in('application_id',ids).eq('status','submitted').order('created_at',{ascending:false});
   if(se)throw se;
   let visibleSubs=subs||[];
   const submissionIds=(subs||[]).map(s=>s.id);
   if(!submissionIds.length){setRows([]);setReviewers([]);setLoading(false);return}
   let assignmentQuery=supabase.from('review_assignments').select('id,submission_id,reviewer_id,status,updated_at').in('submission_id',submissionIds);
   if(role==='reviewer'){
    const {data:authData}=await supabase.auth.getUser();
    const reviewerId=authData.user?.id;
    if(reviewerId){
     const {data:mine,error:mineError}=await supabase.from('review_assignments').select('submission_id').in('submission_id',submissionIds).eq('reviewer_id',reviewerId);
     if(mineError)throw mineError;
     const assignedIds=new Set((mine||[]).map(x=>x.submission_id));
     visibleSubs=visibleSubs.filter(s=>assignedIds.has(s.id));
    }else visibleSubs=[];
   }
   const visibleIds=visibleSubs.map(s=>s.id);
   const [{data:assignments,error:ae},{data:people,error:pe},{data:applicants,error:apE}]=await Promise.all([
    role==='reviewer'
     ? supabase.from('review_assignments').select('id,submission_id,reviewer_id,status,updated_at').in('submission_id',visibleIds)
     : assignmentQuery,
    supabase.from('profiles').select('id,full_name,role,organization_id').eq('organization_id',organizationId).in('role',['reviewer','admin','owner']).order('full_name'),
    supabase.from('applicants').select('id,full_name,email,participant_id').in('id',(subs||[]).map(s=>s.applicant_id).filter(Boolean))
   ]);
   if(ae)throw ae;if(pe)throw pe;if(apE)throw apE;
   setReviewers(people||[]);
   const applicantMap=new Map((applicants||[]).map(x=>[x.id,x])),appMap=new Map(applications.map(x=>[x.id,x])),reviewerMap=new Map((people||[]).map(x=>[x.id,x]));
   const grouped=new Map<string,any[]>();
   for(const a of assignments||[])grouped.set(a.submission_id,[...(grouped.get(a.submission_id)||[]),a]);
   setRows(visibleSubs.map(s=>{
    const as=grouped.get(s.id)||[],p=applicantMap.get(s.applicant_id),app=appMap.get(s.application_id),reviewerList=as.map(x=>reviewerMap.get(x.reviewer_id)).filter(Boolean);
    const workflowStatus=as.length===0?'unassigned':as.some(x=>x.status==='in_progress')?'in_progress':as.every(x=>x.status==='completed')?'reviewed':'assigned';
    const displayStatus=s.decision==='approved'?'approved':s.decision==='rejected'?'rejected':workflowStatus;
    return{submissionId:s.id,applicationId:s.application_id,assignmentId:role==='reviewer'?as[0]?.id:undefined,participantId:p?.participant_id||'—',applicantName:p?.full_name||'Unnamed applicant',email:p?.email||null,submittedAt:s.submitted_at||null,programmeName:app?.name||'Programme',reviewers:reviewerList,status:displayStatus,decision:s.decision==='approved'||s.decision==='rejected'?s.decision:'pending',updatedAt:as.reduce((latest,x)=>!latest||x.updated_at>latest?x.updated_at:latest,s.created_at)}
   }))
   setSelectedIds([]);
  }catch(e:any){setError(e.message||'Unable to load reviews.')}finally{setLoading(false)}
 }
 useEffect(()=>{load()},[applications.map(a=>a.id).join(','),role])
 useEffect(()=>{let active=true;supabase.auth.getUser().then(({data})=>{if(active)setCurrentUserId(data.user?.id||'')});return()=>{active=false}},[])

 const myAssignedRows=useMemo(()=>currentUserId?rows.filter(r=>r.reviewers.some((reviewer:any)=>reviewer?.id===currentUserId)):[],[rows,currentUserId])
 const myReviewsPageCount=Math.max(1,Math.ceil(myAssignedRows.length/myReviewsPageSize))
 const currentMyReviewsPage=Math.min(myReviewsPage,myReviewsPageCount)
 const pagedMyAssignedRows=useMemo(()=>myAssignedRows.slice((currentMyReviewsPage-1)*myReviewsPageSize,currentMyReviewsPage*myReviewsPageSize),[myAssignedRows,currentMyReviewsPage,myReviewsPageSize])
 useEffect(()=>{if(myReviewsPage>myReviewsPageCount)setMyReviewsPage(myReviewsPageCount)},[myReviewsPage,myReviewsPageCount])

 const filtered=useMemo(()=>rows.filter(r=>(status==='all'||r.status===status)&&(!query||r.applicantName.toLowerCase().includes(query.toLowerCase())||r.email?.toLowerCase().includes(query.toLowerCase())||r.programmeName.toLowerCase().includes(query.toLowerCase()))),[rows,status,query])
 const reviewsPageCount=Math.max(1,Math.ceil(filtered.length/reviewsPageSize))
 const currentReviewsPage=Math.min(reviewsPage,reviewsPageCount)
 const pagedReviewRows=useMemo(()=>filtered.slice((currentReviewsPage-1)*reviewsPageSize,currentReviewsPage*reviewsPageSize),[filtered,currentReviewsPage,reviewsPageSize])
 useEffect(()=>{setReviewsPage(1)},[query,status])
 useEffect(()=>{if(reviewsPage>reviewsPageCount)setReviewsPage(reviewsPageCount)},[reviewsPage,reviewsPageCount])
 const statusLabel=(value:string)=>({unassigned:'Unassigned',assigned:'Assigned',in_progress:'In review',reviewed:'Reviewed',approved:'Approved',rejected:'Rejected'}[value]||value)
 const statusClass=(value:string)=>value==='approved'||value==='reviewed'?'green':value==='rejected'?'red':value==='in_progress'?'amber':value==='assigned'?'blue':'neutral'
 const setReviewDecision=async(row:any,decision:'approved'|'rejected')=>{
  setError('');
  try{
   await persistSubmissionDecision(row.submissionId,decision)
   setRows(current=>current.map(r=>r.submissionId===row.submissionId?{...r,decision,status:decision}:r));
   setReviewing((current:any)=>current?.submissionId===row.submissionId?{...current,decision}:current);
   setDecisionNotice({decision,applicantName:row.applicantName,participantId:row.participantId});
  }catch(e:any){setError(e.message||'Could not save the application decision.')}
 }
 const allFilteredSelected=pagedReviewRows.length>0&&pagedReviewRows.every(r=>selectedIds.includes(r.submissionId))
 const toggleSelected=(id:string)=>setSelectedIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id])
 const toggleAll=()=>{
  const pageIds=pagedReviewRows.map(r=>r.submissionId)
  setSelectedIds(current=>allFilteredSelected?current.filter(id=>!pageIds.includes(id)):Array.from(new Set([...current,...pageIds])))
 }
 const assignSelected=async()=>{
  if(!assignmentReviewer||!selectedIds.length)return;
  setAssigning(true);setAssignmentNotice('');setError('');
  try{
   for(const submissionId of selectedIds){
    const {error}=await supabase.rpc('assign_review_submission',{p_submission_id:submissionId,p_reviewer_id:assignmentReviewer});
    if(error)throw error;
   }
   const name=reviewers.find(x=>x.id===assignmentReviewer)?.full_name||'team member';
   setAssignmentNotice(selectedIds.length===1?'Applicant assigned to '+name+'.':selectedIds.length+' applicants assigned to '+name+'.');
   setSelectedIds([]);setAssignmentReviewer('');await load();
  }catch(e:any){setError(e.message||'Could not assign the selected applicants.')}finally{setAssigning(false)}
 }

 return <>
 <section>
  <div className="page-heading compact">
   <div><p className="eyebrow">Human review</p><h1>{role==='reviewer'?'My reviews':'Reviews'}</h1><p className="subtitle">{role==='reviewer'?'Review the applications assigned to you.':'Assign submitted applications to team members and track their review status.'}</p></div>
   <div className="detail-actions"><button className="secondary-button" onClick={load}>Refresh</button></div>
  </div>
  {error&&<ActionFeedback message={error} type="error" onDismiss={()=>setError('')}/>}{assignmentNotice&&<ActionFeedback message={assignmentNotice} onDismiss={()=>setAssignmentNotice('')}/>}
  {(role==='owner'||role==='admin')&&<div className="card table-card my-review-queue">
   <div className="card-header"><div><p className="eyebrow">Personal queue</p><h2>Assigned to me</h2><p>Only applications specifically assigned to you appear here. The full review management list remains below.</p></div><div className="my-review-count"><UserCheck size={16}/><strong>{myAssignedRows.length}</strong><span>assigned</span></div></div>
   <div className="table-wrap"><table><thead><tr><th>Applicant</th><th>Programme</th><th>Submitted</th><th>Status</th><th></th></tr></thead><tbody>
    {loading?<tr><td colSpan={5}><div className="loading-card">Loading your assigned reviews…</div></td></tr>:pagedMyAssignedRows.length===0?<tr><td colSpan={5}><div className="table-empty">No applications are assigned to you right now.</div></td></tr>:pagedMyAssignedRows.map(r=><tr key={'mine-'+r.submissionId}><td><strong>{r.applicantName}</strong><span className="table-sub">{r.email||'No email'}</span></td><td>{r.programmeName}</td><td>{r.submittedAt?new Date(r.submittedAt).toLocaleDateString():'—'}</td><td><span className={'status '+statusClass(r.status)}>{statusLabel(r.status)}</span></td><td><button className="primary-button" onClick={()=>setReviewing({...r,eligibility:'pending',aiStatus:'pending',aiRecommendation:'Not screened'})}>Review <ArrowRight size={15}/></button></td></tr>)}
   </tbody></table></div>
   <TablePagination total={myAssignedRows.length} page={currentMyReviewsPage} pageSize={myReviewsPageSize} onPageChange={setMyReviewsPage} onPageSizeChange={size=>{setMyReviewsPageSize(size);setMyReviewsPage(1)}}/>
  </div>}
  <div className="card table-card">
   <div className="card-header"><div><h2>{role==='reviewer'?'Assigned applications':'Assign applications'}</h2><p>{role==='reviewer'?'Only applications assigned to you are shown here.':'Select applications and assign them to a team member.'}</p></div><Users size={20}/></div>
   {role!=='reviewer'&&<div className="review-assignment-toolbar">
    <label className="review-assignee-field"><span>Assign selected to</span><div className="review-select-wrap"><Users size={15}/><select value={assignmentReviewer} onChange={e=>setAssignmentReviewer(e.target.value)}><option value="">Choose a team member…</option>{reviewers.map(p=><option key={p.id} value={p.id}>{p.full_name||'Unnamed member'} · {p.role}</option>)}</select><ArrowRight size={14} className="review-select-chevron"/></div></label>
    <div className="review-selection-meta"><strong>{selectedIds.length}</strong><span>selected</span></div>
    <button className="primary-button review-assign-button" onClick={assignSelected} disabled={!assignmentReviewer||!selectedIds.length||assigning}>{assigning?'Assigning…':'Assign '+(selectedIds.length||'')+' applicant'+(selectedIds.length===1?'':'s')}</button>
   </div>}
   <div className="forms-toolbar review-filter-toolbar">
    <div className="forms-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search applicant, programme or email…"/></div>
    <label className="review-status-filter"><span>Status</span><div className="review-select-wrap"><span className="status-dot"/><select aria-label="Filter reviews by status" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">All statuses</option><option value="unassigned">Unassigned</option><option value="assigned">Assigned</option><option value="in_progress">In review</option><option value="reviewed">Reviewed</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select><ArrowRight size={14} className="review-select-chevron"/></div></label>
   </div>
   <div className="table-wrap"><table><thead><tr><th><input type="checkbox" aria-label="Select all applicants on this page" checked={allFilteredSelected} onChange={toggleAll} disabled={!pagedReviewRows.length}/></th><th>Applicant</th><th>Programme</th><th>Assigned to</th><th>Status</th><th></th></tr></thead><tbody>
    {loading?<tr><td colSpan={6}><div className="loading-card">Loading reviews…</div></td></tr>:filtered.length===0?<tr><td colSpan={6}><div className="table-empty">No applications match your filters.</div></td></tr>:pagedReviewRows.map(r=><tr key={r.submissionId}><td><input type="checkbox" aria-label={'Select '+r.applicantName} checked={selectedIds.includes(r.submissionId)} onChange={()=>toggleSelected(r.submissionId)}/></td><td><strong>{r.applicantName}</strong><span className="table-sub">{r.email||'No email'}</span></td><td>{r.programmeName}</td><td>{r.reviewers.length?r.reviewers.map((x:any)=>x.full_name||'Unnamed').join(', '):<span className="muted">Unassigned</span>}</td><td><span className={'status '+statusClass(r.status)}>{statusLabel(r.status)}</span></td><td><button className="text-button" onClick={()=>setReviewing({...r,eligibility:'pending',aiStatus:'pending',aiRecommendation:'Not screened'})}>Review</button></td></tr>)}
   </tbody></table></div>
   <TablePagination
    total={filtered.length}
    page={currentReviewsPage}
    pageSize={reviewsPageSize}
    onPageChange={setReviewsPage}
    onPageSizeChange={size=>{setReviewsPageSize(size);setReviewsPage(1)}}
   />
  </div>
  {reviewing&&<ScreeningReviewModal row={reviewing} role={role} onClose={()=>setReviewing(null)} onDecision={setReviewDecision}/>}
 </section>
 {decisionNotice&&<ApplicationDecisionResultModal notice={decisionNotice} onContinue={()=>setDecisionNotice(null)} onBack={()=>{setDecisionNotice(null);setReviewing(null)}} backLabel="Back to reviews"/>}
 </>
}
export function TeamWorkspace({organizationId,role:workspaceRole}:{organizationId:string;role?:'owner'|'admin'|'reviewer'}){
 const canManageTeam=workspaceRole==='owner'||workspaceRole==='admin';
 const [people,setPeople]=useState<Profile[]>([]),[inviteLinks,setInviteLinks]=useState<any[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[showInvite,setShowInvite]=useState(false),[showLinkInvite,setShowLinkInvite]=useState(false),[email,setEmail]=useState(''),[name,setName]=useState(''),[memberRole,setMemberRole]=useState<'reviewer'|'admin'>('reviewer'),[linkRole,setLinkRole]=useState<'reviewer'|'admin'>('reviewer'),[linkExpiry,setLinkExpiry]=useState('168'),[generatedLink,setGeneratedLink]=useState(''),[inviting,setInviting]=useState(false),[linkBusy,setLinkBusy]=useState(false),[busyId,setBusyId]=useState(''),[notice,setNotice]=useState('');
 async function load(){
  setLoading(true);setError('');
  const requests:any[]=[supabase.from('profiles').select('id,full_name,role,organization_id,email,invitation_status').eq('organization_id',organizationId).order('full_name')]
  if(canManageTeam)requests.push(supabase.from('team_invite_links').select('id,token,role,created_at,expires_at,used_at,revoked_at').eq('organization_id',organizationId).order('created_at',{ascending:false}).limit(12))
  const results=await Promise.all(requests)
  const members=results[0];if(members.error)setError(members.error.message);setPeople(members.data||[])
  if(canManageTeam){const links=results[1];if(links?.error)setError(links.error.message);setInviteLinks(links?.data||[])}else setInviteLinks([])
  setLoading(false)
 }
 useEffect(()=>{load()},[organizationId]);
 async function invite(){if(!email.trim())return;setInviting(true);setError('');setNotice('');try{const redirectTo=window.location.origin+'/login?invite=1';const {data,error}=await supabase.functions.invoke('invite-team-member',{body:{organization_id:organizationId,email:email.trim(),full_name:name.trim()||null,role:memberRole,redirect_to:redirectTo}});if(error)throw new Error(await functionErrorMessage(error,'Could not send the invitation.'));if(data?.error)throw new Error(data.error);setNotice('Invitation sent to '+email.trim()+'.');setEmail('');setName('');setMemberRole('reviewer');setShowInvite(false);await load()}catch(e:any){setError(e.message||'Could not send the invitation.')}finally{setInviting(false)}}
 async function manageMember(member:Profile,action:'resend'|'delete'){if(!canManageTeam)return;if(member.role==='admin'&&workspaceRole!=='owner'){setError('Only the workspace Owner can manage or remove an Admin.');return}if(action==='delete'&&!window.confirm('Remove '+(member.full_name||member.email||'this team member')+' from the workspace? This will also remove their ApplyFlow account access.'))return;setBusyId(member.id);setError('');setNotice('');try{const {data,error}=await supabase.functions.invoke('manage-team-member',{body:{organization_id:organizationId,member_id:member.id,action}});if(error)throw new Error(await functionErrorMessage(error,'Could not update this team member.'));if(data?.error)throw new Error(data.error);setNotice(action==='resend'?'A new invitation has been sent to '+(member.email||'the team member')+'.':'Team member removed.');await load()}catch(e:any){setError(e.message||'Could not update this team member.')}finally{setBusyId('')}}
 async function createInviteLink(){
  if(!canManageTeam)return;setLinkBusy(true);setError('');setNotice('');
  try{
   const {data,error}=await supabase.rpc('create_team_invite_link',{p_organization_id:organizationId,p_role:linkRole,p_expires_hours:Number(linkExpiry)})
   if(error)throw error
   const row=Array.isArray(data)?data[0]:data
   if(!row?.token)throw new Error('Invitation link could not be created.')
   const url=window.location.origin+'/join?token='+encodeURIComponent(row.token)
   setGeneratedLink(url);setNotice('Invitation link created.');await load()
  }catch(e:any){setError(e.message||'Could not create invitation link.')}finally{setLinkBusy(false)}
 }
 async function copyInviteLink(token:string){
  const url=window.location.origin+'/join?token='+encodeURIComponent(token)
  try{await navigator.clipboard.writeText(url);setNotice('Invitation link copied.')}catch{setError('Could not copy the invitation link.')}
 }
 async function revokeInviteLink(id:string){
  if(!canManageTeam||!window.confirm('Revoke this invitation link? It will stop working immediately.'))return
  setBusyId(id);setError('');setNotice('');
  try{const {error}=await supabase.rpc('revoke_team_invite_link',{p_link_id:id});if(error)throw error;setNotice('Invitation link revoked.');await load()}catch(e:any){setError(e.message||'Could not revoke invitation link.')}finally{setBusyId('')}
 }
 return <section><div className="page-heading compact"><div><p className="eyebrow">Manage</p><h1>Team</h1><p className="subtitle">Invite people into this workspace to review applicants and support participant programme operations.</p></div><div className="detail-actions">{canManageTeam&&<><button className="secondary-button" onClick={()=>{setGeneratedLink('');setShowLinkInvite(true)}}><Link2 size={16}/> Create invite link</button><button className="primary-button" onClick={()=>setShowInvite(true)}><Plus size={16}/> Invite member</button></>}</div></div>{error&&<ActionFeedback message={error} type="error" onDismiss={()=>setError('')}/>}{notice&&<ActionFeedback message={notice} onDismiss={()=>setNotice('')}/>}<div className="card table-card"><div className="card-header"><div><h2>Workspace members</h2><p>Programme Staff can review assigned applicants and work with participants and assignments. Admins can manage the full workspace.</p></div><Users size={20}/></div>{loading?<div className="loading-card">Loading team…</div>:<div className="table-wrap"><table><thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Status</th>{canManageTeam&&<th></th>}</tr></thead><tbody>{people.map(p=>{const busy=busyId===p.id;return <tr key={p.id}><td><strong>{p.full_name||'Unnamed member'}</strong></td><td>{p.email||'—'}</td><td><span className="status blue">{p.role==='reviewer'?'Programme Staff':p.role}</span></td><td><span className={'status '+(p.invitation_status==='pending'?'amber':'green')}>{p.invitation_status==='pending'?'Invitation pending':'Active'}</span></td>{canManageTeam&&<td><div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>{p.invitation_status==='pending'&&<button className="secondary-button" disabled={busy} onClick={()=>manageMember(p,'resend')}>{busy?'Working…':'Resend invitation'}</button>}{((workspaceRole==='owner'&&p.role!=='owner')||(workspaceRole==='admin'&&p.role==='reviewer'))&&<button className="icon-button" title={p.role==='admin'?'Remove admin':'Remove team member'} aria-label={'Remove '+(p.full_name||p.email||'team member')} disabled={busy} onClick={()=>manageMember(p,'delete')}><X size={16}/></button>}</div></td>}</tr>})}</tbody></table></div>}</div>{canManageTeam&&<div className="card team-links-card"><div className="card-header team-links-header"><div><h2>Invitation links</h2><p>Create a single-use link when you want to share workspace access without sending an invitation email.</p></div><Link2 size={20}/></div>{inviteLinks.length?<div className="team-link-list">{inviteLinks.map(link=>{const expired=new Date(link.expires_at).getTime()<=Date.now();const status=link.revoked_at?'Revoked':link.used_at?'Used':expired?'Expired':'Active';const roleLabel=link.role==='admin'?'Admin':'Programme Staff';return <article key={link.id} className="team-link-row"><div className="team-link-main"><div className="team-link-title"><div><span className="team-link-kicker">Access role</span><strong>{roleLabel}</strong></div><span className={'status '+(status==='Active'?'green':status==='Used'?'blue':'neutral')}>{status}</span></div><div className="team-link-meta"><span><Clock3 size={13}/><span><small>Expires</small>{new Date(link.expires_at).toLocaleString()}</span></span><span><Link2 size={13}/><span><small>Usage</small>Single use</span></span></div></div><div className="team-link-actions">{status==='Active'?<><button className="secondary-button" onClick={()=>copyInviteLink(link.token)}><Copy size={14}/> Copy invitation link</button><button className="icon-button team-link-revoke" title="Revoke invitation link" aria-label="Revoke invitation link" onClick={()=>revokeInviteLink(link.id)} disabled={busyId===link.id}><Trash2 size={15}/></button></>:<span className="team-link-inactive-copy">{status==='Used'?'This link has already been used.':status==='Expired'?'This link has expired.':'This link was revoked.'}</span>}</div></article>})}</div>:<div className="table-empty team-links-empty">No invitation links yet.</div>}</div>}{showInvite&&<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Invite team member"><div className="modal card team-invite-modal"><div className="card-header"><div><p className="eyebrow">Workspace access</p><h2>Invite a team member</h2><p>They will receive an email invitation and be added to this workspace.</p></div><button className="icon-button" onClick={()=>setShowInvite(false)} aria-label="Close invite"><X size={18}/></button></div><div className="detail-form"><label>Full name <span className="optional">Optional</span><input value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Doe"/></label><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="jane@organisation.com"/></label><label className="team-role-field"><span>Role</span><select value={memberRole} onChange={e=>setMemberRole(e.target.value as 'reviewer'|'admin')}><option value="reviewer">Programme Staff</option><option value="admin">Admin</option></select><small className="team-role-help">{memberRole==='reviewer'?'Can review assigned applicants and access participants, attendance and assignments.':'Can manage the workspace and assignments.'}</small></label><div className="detail-form-footer team-invite-footer"><button className="secondary-button" type="button" onClick={()=>setShowInvite(false)}>Cancel</button><button className="primary-button" type="button" onClick={invite} disabled={inviting||!email.trim()}>{inviting?'Sending…':'Send invitation'}</button></div></div></div></div>}{showLinkInvite&&<div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Create invitation link"><div className="modal card team-invite-modal"><div className="card-header"><div><p className="eyebrow">Shareable access</p><h2>Create invitation link</h2><p>Create a single-use link for one staff member. The link stops working after it is used, revoked, or expires.</p></div><button className="icon-button" onClick={()=>setShowLinkInvite(false)} aria-label="Close"><X size={18}/></button></div><div className="detail-form"><label className="team-role-field"><span>Role</span><select value={linkRole} onChange={e=>setLinkRole(e.target.value as 'reviewer'|'admin')}><option value="reviewer">Programme Staff</option><option value="admin">Admin</option></select><small className="team-role-help">{linkRole==='reviewer'?'Can review assigned applicants and work with participants.':'Receives full workspace Admin access.'}</small></label><label className="team-role-field"><span>Link expires</span><select value={linkExpiry} onChange={e=>setLinkExpiry(e.target.value)}><option value="24">In 24 hours</option><option value="168">In 7 days</option><option value="720">In 30 days</option></select></label>{generatedLink&&<div className="team-generated-link"><span>Invitation link</span><div><input readOnly value={generatedLink}/><button className="secondary-button" type="button" onClick={()=>navigator.clipboard.writeText(generatedLink).then(()=>setNotice('Invitation link copied.')).catch(()=>setError('Could not copy the invitation link.'))}><Copy size={14}/> Copy</button></div></div>}<div className="detail-form-footer team-invite-footer"><button className="secondary-button" type="button" onClick={()=>setShowLinkInvite(false)}>Close</button><button className="primary-button" type="button" onClick={createInviteLink} disabled={linkBusy}>{linkBusy?'Creating…':generatedLink?'Create another link':'Create link'}</button></div></div></div></div>}</section>
}
export function SettingsWorkspace({organization,profile,onSaved,onOrganizationSaved,onProfileSaved}:{organization:{id:string;name:string;slug:string;avatar_url:string|null}|null;profile:{id:string;full_name:string|null;username:string|null;birth_month:number|null;birth_day:number|null;avatar_url:string|null;role:string;organization_id:string|null}|null;onSaved:(name:string)=>void;onOrganizationSaved:(organization:{name:string;slug:string;avatar_url:string|null})=>void;onProfileSaved:(profile:{full_name:string|null;username:string|null;birth_month:number|null;birth_day:number|null;avatar_url:string|null})=>void}){
 const [name,setName]=useState(organization?.name||''); const [slug,setSlug]=useState(organization?.slug||'')
 const [profileName,setProfileName]=useState(profile?.full_name||''); const [username,setUsername]=useState(profile?.username||''); const [birthMonth,setBirthMonth]=useState(profile?.birth_month?String(profile.birth_month):''); const [birthDay,setBirthDay]=useState(profile?.birth_day?String(profile.birth_day):''); const [email,setEmail]=useState(''); const [avatarUrl,setAvatarUrl]=useState(profile?.avatar_url||'')
 const [currentPassword,setCurrentPassword]=useState(''); const [newPassword,setNewPassword]=useState(''); const [confirmPassword,setConfirmPassword]=useState(''); const [emailPassword,setEmailPassword]=useState('')
 const [saving,setSaving]=useState(false); const [organizationImageSaving,setOrganizationImageSaving]=useState(false); const [profileSaving,setProfileSaving]=useState(false); const [passwordSaving,setPasswordSaving]=useState(false); const [emailSaving,setEmailSaving]=useState(false); const [signingOut,setSigningOut]=useState(false)
 const [notice,setNotice]=useState(''); const [error,setError]=useState(''); const [emailNotice,setEmailNotice]=useState('')
 useEffect(()=>{setName(organization?.name||'');setSlug(organization?.slug||'')},[organization])
 useEffect(()=>{setProfileName(profile?.full_name||'');setUsername(profile?.username||'');setBirthMonth(profile?.birth_month?String(profile.birth_month):'');setBirthDay(profile?.birth_day?String(profile.birth_day):'');setAvatarUrl(profile?.avatar_url||'')},[profile])
 useEffect(()=>{(async()=>{const {data}=await supabase.auth.getUser();setEmail(data.user?.email||'')})()},[])
 function flash(message:string){setNotice(message);setError('')}
 async function saveWorkspace(){
   if(!organization||!name.trim())return
   setSaving(true);setError('');setNotice('')
   const nextName=name.trim(), nextSlug=slug.trim()||organization.slug
   const {error}=await supabase.from('organizations').update({name:nextName,slug:nextSlug,updated_at:new Date().toISOString()}).eq('id',organization.id)
   if(error)setError(friendlyErrorMessage(error));else{flash('Workspace settings saved.');onSaved(nextName);onOrganizationSaved({name:nextName,slug:nextSlug,avatar_url:organization.avatar_url})}
   setSaving(false)
 }
 async function uploadOrganizationImage(file:File){
   if(!organization)return
   setError('');setNotice('')
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Please choose a JPG, PNG, or WebP image.');return}
   if(file.size>5*1024*1024){setError('Organisation images must be 5 MB or smaller.');return}
   setOrganizationImageSaving(true)
   try{
     const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'
     const path=organization.id+'/avatar.'+extension
     const {error:uploadError}=await supabase.storage.from('organization-avatars').upload(path,file,{contentType:file.type,upsert:true,cacheControl:'3600'})
     if(uploadError)throw new Error('Storage upload failed: '+uploadError.message)
     const {data}=supabase.storage.from('organization-avatars').getPublicUrl(path)
     const publicUrl=data.publicUrl+'?v='+Date.now()
     const {error:organizationError}=await supabase.from('organizations').update({avatar_url:publicUrl,updated_at:new Date().toISOString()}).eq('id',organization.id)
     if(organizationError)throw new Error('Organisation update failed: '+organizationError.message)
     onOrganizationSaved({name:organization.name,slug:organization.slug,avatar_url:publicUrl})
     flash('Organisation profile image updated.')
   }catch(e){setError(friendlyErrorMessage(e,'Could not upload your organisation image.'))}
   finally{setOrganizationImageSaving(false)}
 }
 async function saveProfile(){
   if(!profile)return
   setProfileSaving(true);setError('');setNotice('')
   try{
    const normalizedUsername=username.trim().toLowerCase()
    if(!/^[a-z0-9_]{3,30}$/.test(normalizedUsername))throw new Error('Username must be 3–30 characters and use only letters, numbers, or underscores.')
    if(!birthMonth||!birthDay)throw new Error('Please select your date of birth.')
    const {error}=await supabase.from('profiles').update({full_name:profileName.trim()||null,username:normalizedUsername,birth_month:Number(birthMonth),birth_day:Number(birthDay),updated_at:new Date().toISOString()}).eq('id',profile.id)
    if(error)throw error
    onProfileSaved({full_name:profileName.trim()||null,username:normalizedUsername,birth_month:Number(birthMonth),birth_day:Number(birthDay),avatar_url:avatarUrl||null});flash('Profile updated.')
   }catch(e){setError(friendlyErrorMessage(e,'Could not update your profile.'))}
   finally{setProfileSaving(false)}
 }
 async function uploadAvatar(file:File){
   if(!profile)return
   setError('');setNotice('')
   if(!['image/jpeg','image/png','image/webp'].includes(file.type)){setError('Please choose a JPG, PNG, or WebP image.');return}
   if(file.size>5*1024*1024){setError('Profile images must be 5 MB or smaller.');return}
   setProfileSaving(true)
   try{
     const extension=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg'
     const path=`${profile.id}/avatar.${extension}`
     const {error:uploadError}=await supabase.storage.from('avatars').upload(path,file,{contentType:file.type,upsert:true,cacheControl:'3600'})
     if(uploadError)throw new Error(`Storage upload failed: ${uploadError.message}`)
     const {data}=supabase.storage.from('avatars').getPublicUrl(path)
     const publicUrl=`${data.publicUrl}?v=${Date.now()}`
     const {error:profileError}=await supabase.from('profiles').update({avatar_url:publicUrl,updated_at:new Date().toISOString()}).eq('id',profile.id)
     if(profileError)throw new Error(`Profile update failed: ${profileError.message}`)
     setAvatarUrl(publicUrl);onProfileSaved({full_name:profileName.trim()||null,username:username.trim().toLowerCase()||null,birth_month:birthMonth?Number(birthMonth):null,birth_day:birthDay?Number(birthDay):null,avatar_url:publicUrl});flash('Profile photo updated.')
   }catch(e){setError(friendlyErrorMessage(e,'Could not upload your profile image.'))}
   finally{setProfileSaving(false)}
 }
 async function changePassword(){
   setPasswordSaving(true);setError('');setNotice('')
   try{
     if(newPassword.length<10)throw new Error('New password must be at least 10 characters.')
     if(newPassword!==confirmPassword)throw new Error('New passwords do not match.')
     const {data:{user}}=await supabase.auth.getUser()
     if(!user?.email)throw new Error('Your account email could not be verified.')
     const providers=Array.isArray(user.app_metadata?.providers)?user.app_metadata.providers.map(String):[]
     if(!providers.includes('email'))throw new Error('This account uses OAuth sign-in. Use password recovery from the sign-in page to create or reset a password securely.')
     if(!currentPassword)throw new Error('Enter your current password before changing it.')
     const {error:reauthError}=await supabase.auth.signInWithPassword({email:user.email,password:currentPassword})
     if(reauthError)throw new Error('Current password is incorrect.')
     const {error:updateError}=await supabase.auth.updateUser({password:newPassword})
     if(updateError)throw updateError
     const {error:otherSessionError}=await supabase.auth.signOut({scope:'others'})
     setCurrentPassword('');setNewPassword('');setConfirmPassword('')
     if(otherSessionError){setError('Password changed, but ApplyFlow could not sign out your other sessions. Use “Sign out everywhere” below.');return}
     flash('Password changed. Your other sessions have been signed out.')
   }catch(e){setError(friendlyErrorMessage(e,'Could not change your password.'))}
   finally{setPasswordSaving(false)}
 }
 async function changeEmail(){
   setEmailSaving(true);setEmailNotice('');setError('')
   try{
     const {data:{user}}=await supabase.auth.getUser()
     if(!user?.email)throw new Error('Your account email could not be verified.')
     if(!email.trim()||email.trim()===user.email){setEmailNotice('Enter a different email address.');return}
     const providers=Array.isArray(user.app_metadata?.providers)?user.app_metadata.providers.map(String):[]
     if(!providers.includes('email'))throw new Error('Email changes for OAuth-only accounts must be managed through the connected identity provider.')
     if(!emailPassword)throw new Error('Enter your current password before changing your email.')
     const {error:reauthError}=await supabase.auth.signInWithPassword({email:user.email,password:emailPassword})
     if(reauthError)throw new Error('Current password is incorrect.')
     const {error:updateError}=await supabase.auth.updateUser({email:email.trim()})
     if(updateError)throw updateError
     await supabase.auth.signOut({scope:'others'})
     setEmailPassword('')
     setEmailNotice('A confirmation link has been sent to your new email address. Other sessions have been signed out; your current email remains active until you confirm the change.')
   }catch(e){setEmailNotice(friendlyErrorMessage(e,'Could not update your email address.'))}
   finally{setEmailSaving(false)}
 }
 async function signOutEverywhere(){
   setSigningOut(true);setError('')
   try{const {error}=await supabase.auth.signOut({scope:'global'});if(error)throw error}catch(e){setError(friendlyErrorMessage(e,'Could not sign out all sessions.'))}finally{setSigningOut(false)}
 }
 const initials=(profileName||username||email||'U').split(/\\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'U'
 return <section>
  <div className="settings-page-header">
    <div className="settings-page-heading">
      <p className="eyebrow">Manage</p>
      <h1>Settings</h1>
      <p>{profile?.role==='reviewer'?'Manage your personal profile and account security.':'Manage your personal account, security, and workspace details.'}</p>
    </div>
    <div className="settings-page-status"><span></span> Account settings</div>
  </div>
  {error&&<ActionFeedback message={error} type="error" onDismiss={()=>setError('')}/>}{notice&&<ActionFeedback message={notice} onDismiss={()=>setNotice('')}/>}
  <div className="settings-account-grid">
   <div className="card detail-card settings-profile-card">
    <div className="card-header"><div><p className="eyebrow">Your account</p><h2>Profile</h2><p>Update the details other workspace members see.</p></div><div className="settings-profile-avatar">{avatarUrl?<img src={avatarUrl} alt="" />:<span>{initials}</span>}</div></div>
    <div className="detail-form">
      <div className="settings-avatar-row"><div className="settings-avatar-large">{avatarUrl?<img src={avatarUrl} alt="Profile" />:<span>{initials}</span>}</div><div><label className="settings-upload-label"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={profileSaving} onChange={e=>{const file=e.target.files?.[0];if(file)uploadAvatar(file);e.currentTarget.value=''}}/><span>{profileSaving?'Uploading…':'Upload profile image'}</span></label><small className="field-help">JPG, PNG or WebP · maximum 5 MB</small></div></div>
      <label>Full name<input value={profileName} onChange={e=>setProfileName(e.target.value)} placeholder="Your full name"/></label>
      <label>Username<input value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} placeholder="yourusername" minLength={3} maxLength={30} autoComplete="username"/><small className="field-help">Used to sign in · 3–30 characters · letters, numbers and underscores</small></label>
      <label className="settings-dob-field"><span>Date of birth <span className="optional">Month and day only</span></span><div className="settings-dob-fields"><select aria-label="Birth month" value={birthMonth} onChange={e=>setBirthMonth(e.target.value)}><option value="">Month</option>{['January','February','March','April','May','June','July','August','September','October','November','December'].map((month,index)=><option key={month} value={index+1}>{month}</option>)}</select><select aria-label="Birth day" value={birthDay} onChange={e=>setBirthDay(e.target.value)}><option value="">Day</option>{Array.from({length:31},(_,i)=>i+1).map(day=><option key={day} value={day}>{day}</option>)}</select></div><small className="field-help">Only the month and day are stored. Your birth year is not required.</small></label>
      <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} /><small className="field-help">Changing your email requires confirmation.</small></label>
      <label>Current password<input type="password" autoComplete="current-password" value={emailPassword} onChange={e=>setEmailPassword(e.target.value)} placeholder="Required to change email"/><small className="field-help">Required for password-based accounts before changing the login email.</small></label>
      {emailNotice&&<div className="form-message">{emailNotice}</div>}
      <div className="detail-form-footer"><button className="secondary-button" onClick={changeEmail} disabled={emailSaving}>{emailSaving?'Updating…':'Change email'}</button><button className="primary-button" onClick={saveProfile} disabled={profileSaving}>Save profile</button></div>
    </div>
   </div>
   <div className="card detail-card">
    <div className="card-header"><div><p className="eyebrow">Security</p><h2>Password</h2><p>Keep your account protected with a strong password.</p></div><Settings size={20}/></div>
    <div className="detail-form">
      <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} placeholder="Required to change password"/></label>
      <label>New password<input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={e=>setNewPassword(e.target.value)} placeholder="At least 10 characters"/></label>
      <label>Confirm new password<input type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Repeat your new password"/></label>
      <div className="detail-form-footer"><button className="primary-button" onClick={changePassword} disabled={passwordSaving}>{passwordSaving?'Changing…':'Change password'}</button></div>
      <div className="security-danger-zone"><div><strong>Sign out all sessions</strong><p>Use this if you think someone else may have access to your account.</p></div><button className="secondary-button" onClick={signOutEverywhere} disabled={signingOut}>{signingOut?'Signing out…':'Sign out everywhere'}</button></div>
    </div>
   </div>
  </div>
  {profile?.role!=='reviewer'&&<div className="card detail-card settings-workspace-card">
   <div className="card-header"><div><p className="eyebrow">Workspace</p><h2>Organisation</h2><p>Basic organisation settings for this ApplyFlow workspace.</p></div><Settings size={20}/></div>
   <div className="detail-form"><div className="settings-avatar-row"><div className="settings-avatar-large">{organization?.avatar_url?<img src={organization.avatar_url} alt="Organisation logo" />:<span>{(name||'O').charAt(0).toUpperCase()}</span>}</div><div><label className="settings-upload-label"><input type="file" accept="image/jpeg,image/png,image/webp" disabled={organizationImageSaving||!organization} onChange={e=>{const file=e.target.files?.[0];if(file)uploadOrganizationImage(file);e.currentTarget.value=''}}/><span>{organizationImageSaving?'Uploading…':organization?.avatar_url?'Change organisation logo':'Upload organisation logo'}</span></label><small className="field-help">JPG, PNG or WebP · maximum 5 MB</small><small className="field-help">This logo appears in your workspace switcher.</small></div></div><label>Organisation name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Workspace slug<input value={slug} onChange={e=>setSlug(e.target.value)}/></label><div className="detail-form-footer"><button className="primary-button" onClick={saveWorkspace} disabled={saving}><Save size={16}/>{saving?'Saving…':'Save workspace settings'}</button></div></div>
  </div>}
 </section>
}