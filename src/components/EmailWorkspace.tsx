import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, Mail, Search, Send, Settings2, Users, X, FileText, Link2, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'

type Application = { id:string; name:string }
type Role = 'owner'|'admin'|'reviewer'
type Participant = {
  id:string
  participant_id:string
  application_id:string
  status:'active'|'completed'|'withdrawn'
  full_name:string|null
  email:string|null
}
type Template = {
  id:string
  application_id:string
  name:string
  audience_status:string
  subject:string
  body:string
  status:'draft'|'ready'|'archived'
  created_at:string
}
type View = 'compose'|'templates'|'connection'

const mergeFields = [
  {tag:'{{name}}',label:'Name'},
  {tag:'{{participant_id}}',label:'Participant ID'},
  {tag:'{{email}}',label:'Email'},
  {tag:'{{programme_name}}',label:'Programme'},
  {tag:'{{whatsapp_group_link}}',label:'WhatsApp group link'},
]

function statusLabel(status:Participant['status']){
  return status==='active'?'Active / Enrolled':status.charAt(0).toUpperCase()+status.slice(1)
}

export default function EmailWorkspace({
  organizationId,
  applications,
  role,
}:{
  organizationId:string
  applications:Application[]
  role?:Role
}){
  const canManage=role==='owner'||role==='admin'
  const [view,setView]=useState<View>('compose')
  const [participants,setParticipants]=useState<Participant[]>([])
  const [templates,setTemplates]=useState<Template[]>([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [applicationId,setApplicationId]=useState(applications[0]?.id||'')
  const [audience,setAudience]=useState<'all'|'active'|'completed'|'withdrawn'>('active')
  const [recipientQuery,setRecipientQuery]=useState('')
  const [selectedRecipientIds,setSelectedRecipientIds]=useState<string[]>([])
  const [subject,setSubject]=useState('')
  const [body,setBody]=useState('')
  const [templateName,setTemplateName]=useState('')
  const [bodyFocused,setBodyFocused]=useState(true)

  useEffect(()=>{
    setApplicationId(current=>applications.some(a=>a.id===current)?current:(applications[0]?.id||''))
  },[applications])

  useEffect(()=>{
    if(!notice&&!error)return
    const timer=window.setTimeout(()=>{setNotice('');setError('')},5000)
    return()=>window.clearTimeout(timer)
  },[notice,error])

  useEffect(()=>{
    let cancelled=false
    ;(async()=>{
      setLoading(true);setError('')
      try{
        const [participantResult,templateResult]=await Promise.all([
          supabase.from('participants')
            .select('id,participant_id,application_id,status,applicants(full_name,email)')
            .eq('organization_id',organizationId)
            .order('participant_id'),
          supabase.from('communication_templates')
            .select('id,application_id,name,audience_status,subject,body,status,created_at')
            .order('created_at',{ascending:false}),
        ])
        if(participantResult.error)throw participantResult.error
        if(templateResult.error)throw templateResult.error
        if(cancelled)return
        setParticipants((participantResult.data||[]).map((row:any)=>({
          id:row.id,
          participant_id:row.participant_id,
          application_id:row.application_id,
          status:row.status,
          full_name:row.applicants?.full_name||null,
          email:row.applicants?.email||null,
        })))
        setTemplates((templateResult.data||[]) as Template[])
      }catch(e){
        if(!cancelled)setError(friendlyErrorMessage(e,'Could not load the email workspace.'))
      }finally{
        if(!cancelled)setLoading(false)
      }
    })()
    return()=>{cancelled=true}
  },[organizationId])

  const programmeName=applications.find(a=>a.id===applicationId)?.name||'Programme'
  const programmeParticipants=useMemo(()=>participants.filter(p=>p.application_id===applicationId),[participants,applicationId])
  const visibleRecipients=useMemo(()=>{
    const term=recipientQuery.trim().toLowerCase()
    return programmeParticipants.filter(p=>{
      const matchesAudience=audience==='all'||p.status===audience
      const haystack=[p.participant_id,p.full_name,p.email].filter(Boolean).join(' ').toLowerCase()
      return matchesAudience&&(!term||haystack.includes(term))
    })
  },[programmeParticipants,audience,recipientQuery])
  const validSelected=useMemo(()=>selectedRecipientIds.filter(id=>programmeParticipants.some(p=>p.id===id)),[selectedRecipientIds,programmeParticipants])
  const programmeTemplates=templates.filter(t=>t.application_id===applicationId&&t.status!=='archived')

  function toggleRecipient(id:string,checked:boolean){
    setSelectedRecipientIds(current=>checked?[...new Set([...current,id])]:current.filter(x=>x!==id))
  }
  function toggleVisible(checked:boolean){
    const ids=visibleRecipients.map(p=>p.id)
    setSelectedRecipientIds(current=>checked?[...new Set([...current,...ids])]:current.filter(id=>!ids.includes(id)))
  }
  function insertMergeField(tag:string){
    if(bodyFocused)setBody(current=>current+(current&&!current.endsWith(' ')?' ':'')+tag+' ')
    else setSubject(current=>current+(current&&!current.endsWith(' ')?' ':'')+tag+' ')
  }
  function applyTemplate(template:Template){
    setApplicationId(template.application_id)
    setAudience((['all','active','completed','withdrawn'].includes(template.audience_status)?template.audience_status:'active') as typeof audience)
    setSubject(template.subject)
    setBody(template.body)
    setTemplateName(template.name)
    setView('compose')
    setNotice('Template loaded into composer.')
  }
  async function saveTemplate(){
    if(!canManage||!applicationId||!templateName.trim()||!subject.trim()||!body.trim())return
    setSaving(true);setError('');setNotice('')
    try{
      const {data:userData,error:userError}=await supabase.auth.getUser()
      if(userError)throw userError
      if(!userData.user)throw new Error('Your session has expired.')
      const {data,error}=await supabase.from('communication_templates').insert({
        application_id:applicationId,
        name:templateName.trim(),
        audience_status:audience,
        subject:subject.trim(),
        body:body.trim(),
        status:'draft',
        created_by:userData.user.id,
      }).select('id,application_id,name,audience_status,subject,body,status,created_at').single()
      if(error)throw error
      setTemplates(current=>[data as Template,...current])
      setNotice('Email template saved.')
    }catch(e){
      setError(friendlyErrorMessage(e,'Could not save this email template.'))
    }finally{
      setSaving(false)
    }
  }

  if(loading)return <div className="loading-card card">Loading Email Center…</div>

  return <section className="email-workspace">
    <div className="page-heading compact email-page-heading">
      <div><p className="eyebrow">Communications</p><h1>Email Center</h1><p className="subtitle">Compose participant emails, reuse programme templates and deliver through your organisation's Zoho Mail account.</p></div>
      <div className="email-provider-pill"><span className="email-provider-dot"></span><div><strong>Zoho Mail</strong><small>Not connected</small></div></div>
    </div>

    {(error||notice)&&<div className={'email-inline-notice '+(error?'is-error':'is-success')}><div>{error?<X size={16}/>:<CheckCircle2 size={16}/>}</div><span>{error||notice}</span></div>}

    <div className="email-tabs">
      <button className={view==='compose'?'secondary-button':'text-button'} onClick={()=>setView('compose')}><Mail size={16}/> Compose</button>
      <button className={view==='templates'?'secondary-button':'text-button'} onClick={()=>setView('templates')}><FileText size={16}/> Templates</button>
      <button className={view==='connection'?'secondary-button':'text-button'} onClick={()=>setView('connection')}><Settings2 size={16}/> Zoho connection</button>
    </div>

    {view==='compose'&&<div className="email-compose-layout">
      <div className="email-compose-main">
        <div className="card email-composer-card">
          <div className="card-header"><div><p className="eyebrow">New email</p><h2>Compose message</h2><p>Personalize one message and ApplyFlow will eventually send it individually to every selected participant.</p></div><Mail size={20}/></div>
          <div className="email-composer-form">
            <div className="email-composer-grid">
              <label>Programme<div className="participant-select-wrap"><select value={applicationId} onChange={e=>{setApplicationId(e.target.value);setSelectedRecipientIds([])}}>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div></label>
              <label>Audience<div className="participant-select-wrap"><select value={audience} onChange={e=>setAudience(e.target.value as typeof audience)}><option value="all">All participants</option><option value="active">Active / Enrolled</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></select><ChevronDown size={16}/></div></label>
            </div>
            <label>Subject<input value={subject} onFocus={()=>setBodyFocused(false)} onChange={e=>setSubject(e.target.value)} placeholder="Welcome to {{programme_name}}, {{name}}"/></label>
            <label>Email body<textarea rows={12} value={body} onFocus={()=>setBodyFocused(true)} onChange={e=>setBody(e.target.value)} placeholder={'Hi {{name}},\n\nCongratulations. Your Participant ID is {{participant_id}}.\n\nJoin the programme WhatsApp group here: {{whatsapp_group_link}}'}/></label>
            <div className="email-merge-fields"><div><strong>Merge fields</strong><span>Click to insert into the {bodyFocused?'email body':'subject'}.</span></div><div className="email-merge-chip-list">{mergeFields.map(field=><button type="button" key={field.tag} onClick={()=>insertMergeField(field.tag)}>{field.tag}<small>{field.label}</small></button>)}</div></div>
            <div className="email-template-save"><div><label>Template name<input value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="Acceptance email"/></label></div><button type="button" className="secondary-button" disabled={saving||!canManage||!templateName.trim()||!subject.trim()||!body.trim()} onClick={saveTemplate}>{saving?'Saving…':'Save as template'}</button></div>
          </div>
          <div className="email-send-bar"><div><strong>{validSelected.length} recipient{validSelected.length===1?'':'s'} selected</strong><span>Zoho delivery will unlock after the organisation mailbox is connected.</span></div><button type="button" className="primary-button" disabled title="Connect Zoho Mail before sending"><Send size={16}/> Send email</button></div>
        </div>
      </div>

      <aside className="card email-recipient-card">
        <div className="card-header"><div><p className="eyebrow">Recipients</p><h2>Select participants</h2><p>{programmeName} · {visibleRecipients.length} matching</p></div><Users size={20}/></div>
        <div className="email-recipient-tools">
          <div className="search"><Search size={15}/><input value={recipientQuery} onChange={e=>setRecipientQuery(e.target.value)} placeholder="Search participant…"/></div>
          <label className="email-select-all"><input type="checkbox" checked={visibleRecipients.length>0&&visibleRecipients.every(p=>selectedRecipientIds.includes(p.id))} onChange={e=>toggleVisible(e.target.checked)}/><span>Select all visible</span></label>
        </div>
        <div className="email-recipient-list">
          {visibleRecipients.length?visibleRecipients.map(p=><label key={p.id} className="email-recipient-row"><input type="checkbox" checked={selectedRecipientIds.includes(p.id)} onChange={e=>toggleRecipient(p.id,e.target.checked)}/><span><strong>{p.full_name||'Unnamed participant'}</strong><small>{p.email||'No email'} · {p.participant_id}</small></span><i>{statusLabel(p.status)}</i></label>):<div className="table-empty">No participants match this audience.</div>}
        </div>
      </aside>
    </div>}

    {view==='templates'&&<div className="card table-card email-templates-card">
      <div className="card-header"><div><p className="eyebrow">Saved messages</p><h2>Email templates</h2><p>Reuse programme communication without rewriting every message.</p></div><FileText size={20}/></div>
      <div className="email-template-filter"><label>Programme<div className="participant-select-wrap"><select value={applicationId} onChange={e=>setApplicationId(e.target.value)}>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div></label></div>
      {programmeTemplates.length?<div className="email-template-grid">{programmeTemplates.map(template=><button key={template.id} className="email-template-card" onClick={()=>applyTemplate(template)}><div><span className="status neutral">{template.status}</span><small>{new Date(template.created_at).toLocaleDateString()}</small></div><h3>{template.name}</h3><strong>{template.subject}</strong><p>{template.body}</p><footer><span>Audience: {template.audience_status}</span><span>Use template →</span></footer></button>)}</div>:<div className="table-empty">No email templates for this programme yet. Compose a message and save it as a template.</div>}
    </div>}

    {view==='connection'&&<div className="email-connection-layout">
      <div className="card email-connection-card">
        <div className="email-connection-logo"><Mail size={24}/></div>
        <div className="email-connection-copy"><p className="eyebrow">Delivery provider</p><h2>Connect Zoho Mail</h2><p>ApplyFlow will use OAuth to send from your organisation mailbox. Your Zoho password will never be stored in ApplyFlow.</p><div className="email-connection-status"><span></span><strong>Not connected</strong></div></div>
        <button className="primary-button" disabled title="OAuth backend configuration is the next implementation step"><Link2 size={16}/> Connect Zoho Mail</button>
      </div>
      <div className="card email-security-card">
        <div className="card-header"><div><p className="eyebrow">Secure setup</p><h2>What happens next</h2></div><ShieldCheck size={20}/></div>
        <div className="email-setup-list"><div><span>1</span><div><strong>Register ApplyFlow in Zoho API Console</strong><p>Create the OAuth client and approved callback URL.</p></div></div><div><span>2</span><div><strong>Store OAuth secrets server-side</strong><p>The client secret and refresh token stay in Supabase Edge Functions/private storage, never in React.</p></div></div><div><span>3</span><div><strong>Authorize your organisation mailbox</strong><p>An owner connects the Zoho account and ApplyFlow records the sender identity.</p></div></div><div><span>4</span><div><strong>Enable queued delivery</strong><p>Participant emails are personalized and sent individually with rate limiting and logs.</p></div></div></div>
      </div>
    </div>}
  </section>
}
