import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, Users, Settings, FileText, ShieldCheck, ClipboardList, Save, Eye, Search, Plus, History, Lock, LockOpen, SlidersHorizontal, MoreHorizontal } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application={id:string;name:string;description:string|null;status:'draft'|'published'|'screening'|'closed'|'completed';deadline:string|null;target_count:number|null;created_at:string}
type FormSummary={application:Application;version:number|null;versionStatus:'draft'|'published'|'none';questionCount:number;submissionCount:number;publicSlug:string|null}
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
 return applications.map(application=>{const v=latest.get(application.id);return {application,version:v?.version_number??null,versionStatus:v?.status??'none',questionCount:v?counts.get(v.id)||0:0,submissionCount:submissionCounts.get(application.id)||0,publicSlug:slugs.get(application.id)||null}})
}
type Profile={id:string;full_name:string|null;role:string;organization_id:string|null}

function ModuleList({title,eyebrow,description,icon:Icon,applications,onOpen}:{title:string;eyebrow:string;description:string;icon:any;applications:Application[];onOpen:(a:Application)=>void}){
 return <section><div className="page-heading compact"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p className="subtitle">{description}</p></div></div><div className="card table-card"><div className="card-header"><div><h2>{title} by programme</h2><p>Choose a programme to continue.</p></div></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Deadline</th><th></th></tr></thead><tbody>{applications.length?applications.map(a=><tr key={a.id}><td><strong>{a.name}</strong><span className="table-sub">{a.description||'No description yet.'}</span></td><td><span className={'status '+(a.status==='published'?'blue':'neutral')}>{a.status}</span></td><td>{a.deadline?new Date(a.deadline).toLocaleDateString():'—'}</td><td><button className="secondary-button" onClick={()=>onOpen(a)}>Open <ArrowRight size={15}/></button></td></tr>):<tr><td colSpan={4}><div className="table-empty">Create a programme first.</div></td></tr>}</tbody></table></div></div></section>
}

type VersionRecord={id:string;version_number:number;status:'draft'|'published';title:string;created_at:string;published_at:string|null}

function formWorkspaceStatus(s:FormSummary):'draft'|'published'|'closed'|'none'{
 if(s.application.status==='closed'||s.application.status==='screening'||s.application.status==='completed')return 'closed'
 if(s.application.status==='published')return 'published'
 return s.versionStatus
}

export function FormsWorkspace({applications,onOpen,onCreate}:{applications:Application[];onOpen:(a:Application)=>void;onCreate?:()=>void}){
 const [summaries,setSummaries]=useState<FormSummary[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState(''); const [query,setQuery]=useState(''); const [filter,setFilter]=useState<'all'|'draft'|'published'|'closed'|'none'>('all')
 const [versions,setVersions]=useState<VersionRecord[]>([]); const [historyFor,setHistoryFor]=useState<FormSummary|null>(null); const [historyLoading,setHistoryLoading]=useState(false); const [busyId,setBusyId]=useState('')

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

 async function openHistory(summary:FormSummary){
   setHistoryFor(summary);setHistoryLoading(true);setVersions([])
   const {data,error}=await supabase.from('form_versions').select('id,version_number,status,title,created_at,published_at').eq('application_id',summary.application.id).order('version_number',{ascending:false})
   if(error)setError(error.message);else setVersions((data||[]) as VersionRecord[])
   setHistoryLoading(false)
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
   <div style={{display:'flex',gap:10,alignItems:'center',padding:'0 20px 16px',flexWrap:'wrap'}}>
    <div style={{position:'relative',flex:'1 1 260px'}}><Search size={16} style={{position:'absolute',left:12,top:12,opacity:.5}}/><input aria-label="Search forms" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search programmes…" style={{paddingLeft:36,width:'100%'}}/></div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>{(['all','draft','published','closed','none'] as const).map(f=><button key={f} className={filter===f?'secondary-button':'icon-button'} onClick={()=>setFilter(f)}>{f==='all'?'All':f==='none'?'Not started':f[0].toUpperCase()+f.slice(1)}</button>)}</div>
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
        <button className="icon-button" title="Form settings" aria-label="Form settings" onClick={()=>onOpen(s.application)}><SlidersHorizontal size={16}/></button>
        <button className="icon-button" title="Preview form" aria-label="Preview form" disabled={!s.publicSlug||status!=='published'} onClick={()=>preview(s)}><Eye size={16}/></button>
        <button className="secondary-button" disabled={busy} onClick={()=>onOpen(s.application)}> {s.versionStatus==='draft'?'Open builder':'Open'} <ArrowRight size={15}/></button>
      </div></td>
    </tr>})}
   </tbody></table></div>
  </div>

  {historyFor&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setHistoryFor(null)}}>
   <div className="modal card" style={{maxWidth:720}}>
    <div className="modal-header"><div><p className="eyebrow">Version history</p><h2>{historyFor.application.name}</h2><p>Published versions stay tied to the submissions that used them.</p></div><button type="button" className="icon-button" onClick={()=>setHistoryFor(null)} aria-label="Close"><MoreHorizontal size={18}/></button></div>
    {historyLoading?<div className="loading-card">Loading version history…</div>:versions.length?<div style={{display:'grid',gap:10,maxHeight:'55vh',overflowY:'auto'}}>{versions.map(v=><div key={v.id} className="card" style={{padding:16,display:'flex',alignItems:'center',justifyContent:'space-between',gap:16}}><div><div style={{display:'flex',alignItems:'center',gap:8}}><strong>Version {v.version_number}</strong><span className={'status '+(v.status==='published'?'blue':'amber')}>{v.status}</span></div><div className="muted" style={{marginTop:5}}>{v.title||'Application form'} · Created {new Date(v.created_at).toLocaleDateString()}</div></div><div style={{textAlign:'right'}}>{v.published_at?<><strong>Published</strong><div className="muted">{new Date(v.published_at).toLocaleDateString()}</div></>:<span className="muted">Draft</span>}</div></div>)}</div>:<div className="table-empty">No form versions yet.</div>}
    <div className="modal-footer"><button className="secondary-button" onClick={()=>setHistoryFor(null)}>Close</button><button className="primary-button" onClick={()=>{setHistoryFor(null);onOpen(historyFor.application)}}>Open form builder <ArrowRight size={15}/></button></div>
   </div>
  </div>}
 </section>
}
export function ScreeningWorkspace({applications,onOpen}:{applications:Application[];onOpen:(a:Application)=>void}){return <ModuleList title="Screening" eyebrow="Application screening" description="Review eligibility, scores and AI-assisted assessments." icon={ShieldCheck} applications={applications} onOpen={onOpen}/>}
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
