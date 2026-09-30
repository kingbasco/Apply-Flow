import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Mail, Search, Send, Settings2, Users, X, FileText, Link2, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'
import TablePagination from './TablePagination'

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
type StaffMember = { id:string; full_name:string|null; role:'admin'|'reviewer' }
type ParticipantStaffAssignment = { participant_id:string; staff_id:string }
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
type CommunicationLog = {
  id:string
  application_id:string
  recipient_count:number
  status:'draft'|'queued'|'sent'|'failed'
  sent_at:string|null
  created_at:string
  metadata:Record<string,any>
}
type DeliveryRecipient = {
  participant_id:string
  email:string|null
  status:'sent'|'failed'|'skipped'
  error?:string
  request_id?:string|null
}
type DeliveryReport = {
  id:string
  application_id:string
  programme_name:string
  subject:string
  provider:string
  transport:string
  created_at:string
  requested:number
  sent:number
  failed:number
  skipped:number
  first_failure_error:string|null
  failure_code:string|null
  results:DeliveryRecipient[]
  batches:number
}
type View = 'compose'|'templates'|'reports'|'connection'

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
  const [staffMembers,setStaffMembers]=useState<StaffMember[]>([])
  const [participantStaffAssignments,setParticipantStaffAssignments]=useState<ParticipantStaffAssignment[]>([])
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [applicationId,setApplicationId]=useState(applications[0]?.id||'')
  const [audience,setAudience]=useState<'all'|'active'|'completed'|'withdrawn'>('active')
  const [staffFilter,setStaffFilter]=useState('all')
  const [recipientQuery,setRecipientQuery]=useState('')
  const [recipientPage,setRecipientPage]=useState(1)
  const [recipientPageSize,setRecipientPageSize]=useState(50)
  const [selectedRecipientIds,setSelectedRecipientIds]=useState<string[]>([])
  const [subject,setSubject]=useState('')
  const [body,setBody]=useState('')
  const [templateName,setTemplateName]=useState('')
  const [bodyFocused,setBodyFocused]=useState(true)
  const [whatsappGroupLink,setWhatsappGroupLink]=useState('')
  const [sending,setSending]=useState(false)
  const [sendProgress,setSendProgress]=useState('')
  const [zohoStatus,setZohoStatus]=useState<{provider:'zoho'|'zeptomail';transport:'smtp'|'api';configured:boolean;validated:boolean;from_address:string|null;missing:string[];validation_error:string|null;validation_note:string|null;usage_blocked:boolean}>({provider:'zoho',transport:'smtp',configured:false,validated:false,from_address:null,missing:[],validation_error:null,validation_note:null,usage_blocked:false})
  const [checkingZoho,setCheckingZoho]=useState(false)
  const [communicationLogs,setCommunicationLogs]=useState<CommunicationLog[]>([])
  const [reportApplication,setReportApplication]=useState('all')
  const [reportStatus,setReportStatus]=useState<'all'|'sent'|'failed'>('all')
  const [reportsLoading,setReportsLoading]=useState(false)

  useEffect(()=>{
    setApplicationId(current=>applications.some(a=>a.id===current)?current:(applications[0]?.id||''))
  },[applications])

  useEffect(()=>{
    if(!notice&&!error)return
    const timer=window.setTimeout(()=>{setNotice('');setError('')},5000)
    return()=>window.clearTimeout(timer)
  },[notice,error])


  async function refreshZohoStatus(validate=false){
    if(!canManage)return
    setCheckingZoho(true)
    try{
      const {data,error}=await supabase.functions.invoke('zoho-mail-status',{body:{organization_id:organizationId,validate}})
      if(error)throw error
      setZohoStatus({
        provider:data?.provider==='zeptomail'?'zeptomail':'zoho',
        transport:data?.transport==='api'?'api':'smtp',
        configured:Boolean(data?.configured),
        validated:Boolean(data?.validated),
        from_address:data?.from_address||null,
        missing:Array.isArray(data?.missing)?data.missing:[],
        validation_error:data?.validation_error||null,
        validation_note:data?.validation_note||null,
        usage_blocked:false,
      })
      if(validate){
        if(data?.validated)setNotice('Zoho Mail connection validated.')
        else if(data?.provider==='zeptomail'&&data?.configured)setNotice('ZeptoMail API is configured. The token and sender domain will be confirmed on the first send.')
        else if(data?.configured&&data?.validation_error)setError(data.validation_error)
      }
    }catch(e){
      setZohoStatus(current=>({...current,configured:false,validated:false}))
      if(validate)setError(friendlyErrorMessage(e,'Could not validate Zoho Mail.'))
    }finally{
      setCheckingZoho(false)
    }
  }

  async function refreshDeliveryReports(){
    if(!canManage)return
    setReportsLoading(true)
    try{
      const {data,error}=await supabase.from('communication_logs')
        .select('id,application_id,recipient_count,status,sent_at,created_at,metadata')
        .order('created_at',{ascending:false})
        .limit(500)
      if(error)throw error
      setCommunicationLogs((data||[]) as CommunicationLog[])
    }catch(e){
      setError(friendlyErrorMessage(e,'Could not load email delivery reports.'))
    }finally{
      setReportsLoading(false)
    }
  }

  useEffect(()=>{void refreshZohoStatus(false);void refreshDeliveryReports()},[organizationId,role])

  useEffect(()=>{
    let cancelled=false
    ;(async()=>{
      setLoading(true);setError('')
      try{
        const [participantResult,templateResult,staffResult,staffAssignmentResult]=await Promise.all([
          supabase.from('participants')
            .select('id,participant_id,application_id,status,applicants(full_name,email)')
            .eq('organization_id',organizationId)
            .order('participant_id'),
          supabase.from('communication_templates')
            .select('id,application_id,name,audience_status,subject,body,status,created_at')
            .order('created_at',{ascending:false}),
          supabase.from('profiles')
            .select('id,full_name,role')
            .eq('organization_id',organizationId)
            .in('role',['admin','reviewer'])
            .order('full_name'),
          supabase.from('participant_staff_assignments')
            .select('participant_id,staff_id')
            .eq('organization_id',organizationId),
        ])
        if(participantResult.error)throw participantResult.error
        if(templateResult.error)throw templateResult.error
        if(staffResult.error)throw staffResult.error
        if(staffAssignmentResult.error)throw staffAssignmentResult.error
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
        setStaffMembers((staffResult.data||[]) as StaffMember[])
        setParticipantStaffAssignments((staffAssignmentResult.data||[]) as ParticipantStaffAssignment[])
      }catch(e){
        if(!cancelled)setError(friendlyErrorMessage(e,'Could not load the email workspace.'))
      }finally{
        if(!cancelled)setLoading(false)
      }
    })()
    return()=>{cancelled=true}
  },[organizationId])

  const programmeName=applications.find(a=>a.id===applicationId)?.name||'Programme'
  const deliveryReports=useMemo<DeliveryReport[]>(()=>{
    const grouped=new Map<string,DeliveryReport>()
    for(const log of communicationLogs){
      const metadata=log.metadata||{}
      const id=String(metadata.delivery_id||log.id)
      const existing=grouped.get(id)
      const results=Array.isArray(metadata.results)?metadata.results as DeliveryRecipient[]:[]
      const next:DeliveryReport=existing||{
        id,
        application_id:log.application_id,
        programme_name:String(metadata.application_name||applications.find(a=>a.id===log.application_id)?.name||'Programme'),
        subject:String(metadata.subject||'Participant email'),
        provider:String(metadata.provider||'unknown'),
        transport:String(metadata.transport||''),
        created_at:log.sent_at||log.created_at,
        requested:0,
        sent:0,
        failed:0,
        skipped:0,
        first_failure_error:null,
        failure_code:null,
        results:[],
        batches:0,
      }
      next.requested+=Number(metadata.requested??log.recipient_count??0)
      next.sent+=Number(metadata.sent_count||0)
      next.failed+=Number(metadata.failed_count||0)
      next.skipped+=Number(metadata.skipped_count||0)
      next.batches+=1
      next.results.push(...results)
      if(!next.first_failure_error&&metadata.first_failure_error)next.first_failure_error=String(metadata.first_failure_error)
      if(!next.failure_code&&metadata.failure_code)next.failure_code=String(metadata.failure_code)
      if((log.sent_at||log.created_at)>next.created_at)next.created_at=log.sent_at||log.created_at
      grouped.set(id,next)
    }
    return [...grouped.values()].sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())
  },[communicationLogs,applications])
  const filteredDeliveryReports=useMemo(()=>deliveryReports.filter(report=>{
    const matchesApplication=reportApplication==='all'||report.application_id===reportApplication
    const reportOutcome=report.failed>0?'failed':'sent'
    const matchesStatus=reportStatus==='all'||reportOutcome===reportStatus
    return matchesApplication&&matchesStatus
  }),[deliveryReports,reportApplication,reportStatus])
  const reportTotals=useMemo(()=>deliveryReports.reduce((totals,report)=>({
    requested:totals.requested+report.requested,
    sent:totals.sent+report.sent,
    failed:totals.failed+report.failed,
    skipped:totals.skipped+report.skipped,
  }),{requested:0,sent:0,failed:0,skipped:0}),[deliveryReports])
  const reportSuccessRate=(reportTotals.sent+reportTotals.failed)>0
    ? Math.round((reportTotals.sent/(reportTotals.sent+reportTotals.failed))*100)
    : 0
  const programmeParticipants=useMemo(()=>participants.filter(p=>p.application_id===applicationId),[participants,applicationId])
  const staffIdsByParticipant=useMemo(()=>{
    const map=new Map<string,string[]>()
    for(const assignment of participantStaffAssignments){
      const current=map.get(assignment.participant_id)||[]
      if(!current.includes(assignment.staff_id))current.push(assignment.staff_id)
      map.set(assignment.participant_id,current)
    }
    return map
  },[participantStaffAssignments])
  const audienceParticipants=useMemo(()=>programmeParticipants.filter(p=>audience==='all'||p.status===audience),[programmeParticipants,audience])
  const staffAssignmentCounts=useMemo(()=>{
    const counts=new Map<string,number>()
    let unassigned=0
    for(const participant of audienceParticipants){
      const staffIds=staffIdsByParticipant.get(participant.id)||[]
      if(!staffIds.length)unassigned+=1
      for(const staffId of staffIds)counts.set(staffId,(counts.get(staffId)||0)+1)
    }
    return {counts,unassigned}
  },[audienceParticipants,staffIdsByParticipant])
  const selectedStaff=staffMembers.find(staff=>staff.id===staffFilter)||null
  const visibleRecipients=useMemo(()=>{
    const term=recipientQuery.trim().toLowerCase()
    return audienceParticipants.filter(p=>{
      const assignedStaffIds=staffIdsByParticipant.get(p.id)||[]
      const matchesStaff=staffFilter==='all'
        ||(staffFilter==='unassigned'&&assignedStaffIds.length===0)
        ||assignedStaffIds.includes(staffFilter)
      const haystack=[p.participant_id,p.full_name,p.email].filter(Boolean).join(' ').toLowerCase()
      return matchesStaff&&(!term||haystack.includes(term))
    })
  },[audienceParticipants,staffIdsByParticipant,staffFilter,recipientQuery])
  const recipientPageCount=Math.max(1,Math.ceil(visibleRecipients.length/recipientPageSize))
  const pagedRecipients=useMemo(()=>{
    const start=(recipientPage-1)*recipientPageSize
    return visibleRecipients.slice(start,start+recipientPageSize)
  },[visibleRecipients,recipientPage,recipientPageSize])
  const recipientPageSizes=useMemo(()=>{
    const roundedTotal=Math.ceil(visibleRecipients.length/50)*50
    const maxSize=Math.max(50,recipientPageSize,roundedTotal)
    return Array.from({length:maxSize/50},(_,index)=>(index+1)*50)
  },[visibleRecipients.length,recipientPageSize])
  const validSelected=useMemo(()=>selectedRecipientIds.filter(id=>programmeParticipants.some(p=>p.id===id)),[selectedRecipientIds,programmeParticipants])
  const programmeTemplates=templates.filter(t=>t.application_id===applicationId&&t.status!=='archived')

  useEffect(()=>{setRecipientPage(1)},[applicationId,audience,staffFilter,recipientQuery])
  useEffect(()=>{setRecipientPage(current=>Math.min(current,recipientPageCount))},[recipientPageCount])

  function toggleRecipient(id:string,checked:boolean){
    setSelectedRecipientIds(current=>checked?[...new Set([...current,id])]:current.filter(x=>x!==id))
  }
  function toggleVisible(checked:boolean){
    const ids=pagedRecipients.map(p=>p.id)
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


  async function sendSelectedEmail(){
    if(!canManage||!zohoStatus.configured||!applicationId||!validSelected.length||!subject.trim()||!body.trim())return
    setSending(true);setError('');setNotice('');setSendProgress('')
    let sent=0,failed=0,skipped=0,processed=0
    let firstFailure=''
    const deliveryId=crypto.randomUUID()
    const batches=Array.from({length:Math.ceil(validSelected.length/10)},(_,index)=>validSelected.slice(index*10,(index+1)*10))
    try{
      for(let index=0;index<batches.length;index++){
        const participantIds=batches[index]
        setSendProgress('Sending batch '+(index+1)+' of '+batches.length+'…')
        const {data,error}=await supabase.functions.invoke('send-zoho-email',{body:{
          organization_id:organizationId,
          application_id:applicationId,
          participant_ids:participantIds,
          subject:subject.trim(),
          body:body.trim(),
          whatsapp_group_link:whatsappGroupLink.trim(),
          delivery_id:deliveryId,
          batch_number:index+1,
          batch_count:batches.length,
        }})
        if(error){
          throw new Error('Batch '+(index+1)+' of '+batches.length+' could not be confirmed after '+processed+' recipient'+(processed===1?'':'s')+' were processed. Sending stopped to avoid duplicate emails. '+friendlyErrorMessage(error,'Zoho Mail request failed.'))
        }
        if(data?.error){
          if(data?.error_code==='ZOHO_USAGE_BLOCK'){
            setZohoStatus(current=>({...current,usage_blocked:true}))
          }
          throw new Error('Batch '+(index+1)+' of '+batches.length+' failed after '+processed+' recipient'+(processed===1?'':'s')+' were processed. '+String(data.error))
        }
        const batchSent=Number(data?.sent_count||0)
        const batchFailed=Number(data?.failed_count||0)
        const batchSkipped=Number(data?.skipped_count||0)
        const batchRequested=Number(data?.requested||participantIds.length)
        sent+=batchSent
        failed+=batchFailed
        skipped+=batchSkipped
        processed+=batchRequested
        if(!firstFailure&&data?.first_failure_error)firstFailure=String(data.first_failure_error)
        if(batchSent===0&&batchFailed===batchRequested&&batchRequested>0){
          throw new Error('Zoho rejected every recipient in batch '+(index+1)+'.'+(firstFailure?' '+firstFailure:''))
        }
      }

      const summary=sent+' sent'+(failed?', '+failed+' failed':'')+(skipped?', '+skipped+' skipped':'')
      if(failed>0)setError(summary+'.'+(firstFailure?' First failure: '+firstFailure:''))
      else setNotice(summary+' through '+(zohoStatus.provider==='zeptomail'?'ZeptoMail':'Zoho Mail')+'.')
    }catch(e){
      const partial=(sent||failed||skipped)?' Current confirmed totals: '+sent+' sent, '+failed+' failed, '+skipped+' skipped.':''
      setError(friendlyErrorMessage(e,'Could not send through Zoho Mail.')+partial)
    }finally{
      setSendProgress('')
      setSending(false)
      void refreshDeliveryReports()
    }
  }

  if(loading)return <div className="loading-card card">Loading Email Center…</div>

  return <section className="email-workspace">
    <div className="page-heading compact email-page-heading">
      <div><p className="eyebrow">Communications</p><h1>Email Center</h1><p className="subtitle">Compose participant emails, reuse programme templates and deliver through your organisation's configured Zoho provider.</p></div>
      <div className={'email-provider-pill '+(zohoStatus.configured&&!zohoStatus.usage_blocked?'is-connected':'')}><span className="email-provider-dot"></span><div><strong>{zohoStatus.provider==='zeptomail'?'Zoho ZeptoMail':'Zoho Mail'}</strong><small>{zohoStatus.usage_blocked?'Outgoing mail blocked':zohoStatus.configured?(zohoStatus.from_address||'Configured'):'Not connected'}</small></div></div>
    </div>

    {(error||notice)&&<div className={'email-inline-notice '+(error?'is-error':'is-success')}><div>{error?<X size={16}/>:<CheckCircle2 size={16}/>}</div><span>{error||notice}</span></div>}

    <div className="email-tabs">
      <button className={view==='compose'?'secondary-button':'text-button'} onClick={()=>setView('compose')}><Mail size={16}/> Compose</button>
      <button className={view==='templates'?'secondary-button':'text-button'} onClick={()=>setView('templates')}><FileText size={16}/> Templates</button>
      <button className={view==='reports'?'secondary-button':'text-button'} onClick={()=>{setView('reports');void refreshDeliveryReports()}}><BarChart3 size={16}/> Delivery reports</button>
      <button className={view==='connection'?'secondary-button':'text-button'} onClick={()=>setView('connection')}><Settings2 size={16}/> Email connection</button>
    </div>

    {view==='compose'&&<div className="email-compose-layout">
      <div className="email-compose-main">
        <div className="card email-composer-card">
          <div className="card-header"><div><p className="eyebrow">New email</p><h2>Compose message</h2><p>Personalize one message and ApplyFlow will eventually send it individually to every selected participant.</p></div><Mail size={20}/></div>
          <div className="email-composer-form">
            <div className="email-composer-grid">
              <label>Programme<div className="participant-select-wrap"><select value={applicationId} onChange={e=>{setApplicationId(e.target.value);setSelectedRecipientIds([])}}>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div></label>
              <label>Audience<div className="participant-select-wrap"><select value={audience} onChange={e=>setAudience(e.target.value as typeof audience)}><option value="all">All participants</option><option value="active">Active / Enrolled</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></select><ChevronDown size={16}/></div></label>
              <label>Assigned to<div className="participant-select-wrap"><select value={staffFilter} onChange={e=>{setStaffFilter(e.target.value);setSelectedRecipientIds([])}}><option value="all">All participants</option>{staffMembers.map(staff=><option key={staff.id} value={staff.id}>{staff.full_name||'Staff member'} — {staff.role==='reviewer'?'Programme Staff':'Admin'} ({staffAssignmentCounts.counts.get(staff.id)||0})</option>)}<option value="unassigned">Unassigned ({staffAssignmentCounts.unassigned})</option></select><ChevronDown size={16}/></div></label>
            </div>
            <label>Subject<input value={subject} onFocus={()=>setBodyFocused(false)} onChange={e=>setSubject(e.target.value)} placeholder="Welcome to {{programme_name}}, {{name}}"/></label>
            <label>Email body<textarea rows={12} value={body} onFocus={()=>setBodyFocused(true)} onChange={e=>setBody(e.target.value)} placeholder={'Hi {{name}},\n\nCongratulations. Your Participant ID is {{participant_id}}.\n\nJoin the programme WhatsApp group here: {{whatsapp_group_link}}'}/></label>
            <label>WhatsApp group link <span className="optional">Optional</span><input value={whatsappGroupLink} onChange={e=>setWhatsappGroupLink(e.target.value)} placeholder="https://chat.whatsapp.com/…"/><small className="field-help">{selectedStaff?'This link will be used for the '+(selectedStaff.full_name||'selected staff')+' participant group in this send. ':'Used when your message contains {{whatsapp_group_link}}. '}Choose the assigned staff group above before sending a group-specific WhatsApp link.</small></label>
            <div className="email-merge-fields"><div><strong>Merge fields</strong><span>Click to insert into the {bodyFocused?'email body':'subject'}.</span></div><div className="email-merge-chip-list">{mergeFields.map(field=><button type="button" key={field.tag} onClick={()=>insertMergeField(field.tag)}>{field.tag}<small>{field.label}</small></button>)}</div></div>
            <div className="email-template-save"><div><label>Template name<input value={templateName} onChange={e=>setTemplateName(e.target.value)} placeholder="Acceptance email"/></label></div><button type="button" className="secondary-button" disabled={saving||!canManage||!templateName.trim()||!subject.trim()||!body.trim()} onClick={saveTemplate}>{saving?'Saving…':'Save as template'}</button></div>
          </div>
          <div className="email-send-bar"><div><strong>{validSelected.length} recipient{validSelected.length===1?'':'s'} selected</strong><span>{sending&&sendProgress?sendProgress:zohoStatus.usage_blocked?'Zoho Mail has blocked outgoing SMTP. Unblock the mailbox or configure ZeptoMail before retrying.':zohoStatus.configured?'Messages are sent individually in confirmed batches of 10 through '+(zohoStatus.from_address||(zohoStatus.provider==='zeptomail'?'ZeptoMail':'Zoho Mail'))+'.':'Email delivery unlocks after a server-side provider is configured.'}</span></div><button type="button" className="primary-button" onClick={sendSelectedEmail} disabled={sending||!zohoStatus.configured||zohoStatus.usage_blocked||!validSelected.length||!subject.trim()||!body.trim()} title={zohoStatus.usage_blocked?'Zoho Mail is temporarily blocked':zohoStatus.configured?'Send selected participant emails':'Configure an email provider before sending'}><Send size={16}/>{sending?(sendProgress||'Sending…'):'Send email'}</button></div>
        </div>
      </div>

      <aside className="card email-recipient-card">
        <div className="card-header"><div><p className="eyebrow">Recipients</p><h2>Select participants</h2><p>{programmeName} · {selectedStaff?(selectedStaff.full_name||'Staff member')+' group · ':staffFilter==='unassigned'?'Unassigned · ':''}{visibleRecipients.length} matching</p></div><Users size={20}/></div>
        <div className="email-recipient-tools">
          <div className="search"><Search size={15}/><input value={recipientQuery} onChange={e=>setRecipientQuery(e.target.value)} placeholder="Search participant…"/></div>
          <label className="email-select-all"><input type="checkbox" checked={pagedRecipients.length>0&&pagedRecipients.every(p=>selectedRecipientIds.includes(p.id))} onChange={e=>toggleVisible(e.target.checked)}/><span>Select all {pagedRecipients.length} on this page</span></label>
        </div>
        <div className="email-recipient-list">
          {pagedRecipients.length?pagedRecipients.map(p=><label key={p.id} className="email-recipient-row"><input type="checkbox" checked={selectedRecipientIds.includes(p.id)} onChange={e=>toggleRecipient(p.id,e.target.checked)}/><span><strong>{p.full_name||'Unnamed participant'}</strong><small>{p.email||'No email'} · {p.participant_id}</small></span><i>{statusLabel(p.status)}</i></label>):<div className="table-empty">No participants match this audience.</div>}
        </div>
        <TablePagination
          total={visibleRecipients.length}
          page={recipientPage}
          pageSize={recipientPageSize}
          pageSizes={recipientPageSizes}
          onPageChange={setRecipientPage}
          onPageSizeChange={size=>{setRecipientPageSize(size);setRecipientPage(1)}}
        />
      </aside>
    </div>}

    {view==='templates'&&<div className="card table-card email-templates-card">
      <div className="card-header"><div><p className="eyebrow">Saved messages</p><h2>Email templates</h2><p>Reuse programme communication without rewriting every message.</p></div><FileText size={20}/></div>
      <div className="email-template-filter"><label>Programme<div className="participant-select-wrap"><select value={applicationId} onChange={e=>setApplicationId(e.target.value)}>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div></label></div>
      {programmeTemplates.length?<div className="email-template-grid">{programmeTemplates.map(template=><button key={template.id} className="email-template-card" onClick={()=>applyTemplate(template)}><div><span className="status neutral">{template.status}</span><small>{new Date(template.created_at).toLocaleDateString()}</small></div><h3>{template.name}</h3><strong>{template.subject}</strong><p>{template.body}</p><footer><span>Audience: {template.audience_status}</span><span>Use template →</span></footer></button>)}</div>:<div className="table-empty">No email templates for this programme yet. Compose a message and save it as a template.</div>}
    </div>}

    {view==='reports'&&<div className="email-report-workspace">
      <div className="stats-grid email-report-stats">
        <div className="card stat-card"><div className="stat-icon"><Mail size={16}/></div><div><p className="eyebrow">Attempted</p><div className="stat-value">{reportTotals.requested}</div><p className="muted">{deliveryReports.length} delivery{deliveryReports.length===1?'':'ies'}</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><CheckCircle2 size={16}/></div><div><p className="eyebrow">Sent</p><div className="stat-value">{reportTotals.sent}</div><p className="muted">Confirmed accepted by provider</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><AlertTriangle size={16}/></div><div><p className="eyebrow">Failed</p><div className="stat-value">{reportTotals.failed}</div><p className="muted">{reportTotals.skipped} skipped</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><BarChart3 size={16}/></div><div><p className="eyebrow">Success rate</p><div className="stat-value">{reportSuccessRate}%</div><p className="muted">Sent ÷ sent + failed</p></div></div>
      </div>

      <div className="card table-card email-report-card">
        <div className="card-header">
          <div><p className="eyebrow">Delivery history</p><h2>Email delivery reports</h2><p>Every recorded batch is grouped into one delivery, with recipient-level outcomes and provider errors.</p></div>
          <button type="button" className="secondary-button" onClick={()=>void refreshDeliveryReports()} disabled={reportsLoading}>{reportsLoading?'Refreshing…':'Refresh'}</button>
        </div>
        <div className="email-report-filters">
          <label>Programme<select value={reportApplication} onChange={e=>setReportApplication(e.target.value)}><option value="all">All programmes</option>{applications.map(application=><option key={application.id} value={application.id}>{application.name}</option>)}</select></label>
          <label>Status<select value={reportStatus} onChange={e=>setReportStatus(e.target.value as 'all'|'sent'|'failed')}><option value="all">All outcomes</option><option value="sent">Sent</option><option value="failed">Failed / partial</option></select></label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Delivery</th><th>Provider</th><th>Attempted</th><th>Sent</th><th>Failed</th><th>Status</th><th>Date</th></tr></thead>
            <tbody>
              {filteredDeliveryReports.map(report=><tr key={report.id}>
                <td>
                  <strong>{report.subject}</strong>
                  <span className="table-sub">{report.programme_name} · {report.batches} batch{report.batches===1?'':'es'}</span>
                  <details className="email-report-details">
                    <summary>View recipient report</summary>
                    <div className="email-report-recipient-list">
                      {report.results.length?report.results.map((recipient,index)=><div key={report.id+'-'+index} className={'email-report-recipient '+recipient.status}>
                        <span><strong>{recipient.participant_id||'Participant'}</strong><small>{recipient.email||'No email address'}</small></span>
                        <span className={'status '+(recipient.status==='sent'?'green':recipient.status==='failed'?'amber':'neutral')}>{recipient.status}</span>
                        {recipient.error&&<p>{recipient.error}</p>}
                      </div>):<p className="email-report-empty-detail">Recipient-level details were not recorded for this delivery.</p>}
                      {report.first_failure_error&&<div className="email-report-error"><strong>Failure reason</strong><p>{report.first_failure_error}</p></div>}
                    </div>
                  </details>
                </td>
                <td>{report.provider==='zeptomail'?'ZeptoMail':report.provider==='zoho'?'Zoho Mail':report.provider}<span className="table-sub">{report.transport||'—'}</span></td>
                <td>{report.requested}</td>
                <td>{report.sent}</td>
                <td>{report.failed}{report.skipped>0&&<span className="table-sub">{report.skipped} skipped</span>}</td>
                <td><span className={'status '+(report.failed>0?'amber':'green')}>{report.failure_code==='ZOHO_USAGE_BLOCK'?'Provider blocked':report.failed>0?'Failed / partial':'Sent'}</span></td>
                <td>{new Date(report.created_at).toLocaleString()}</td>
              </tr>):<tr><td colSpan={7}><div className="table-empty">{reportsLoading?'Loading delivery reports…':'No recorded email deliveries yet. New sends will appear here automatically.'}</div></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>}

    {view==='connection'&&<div className="email-connection-layout">
      <div className="card email-connection-card">
        <div className="email-connection-logo"><Mail size={24}/></div>
        <div className="email-connection-copy"><p className="eyebrow">Delivery provider</p><h2>{zohoStatus.provider==='zeptomail'?'Zoho ZeptoMail':'Zoho Mail'}</h2><p>{zohoStatus.provider==='zeptomail'?'ApplyFlow uses ZeptoMail’s transactional email API. The Send Mail token stays only in Supabase Edge Function Secrets.':'Zoho Mail SMTP is available for normal mailbox delivery, but automated participant email should use ZeptoMail to avoid provider usage blocks.'}</p><div className={'email-connection-status '+(zohoStatus.configured&&!zohoStatus.usage_blocked?'is-connected':'')}><span></span><strong>{zohoStatus.usage_blocked?'Outgoing mail blocked':zohoStatus.configured?(zohoStatus.validated?'Connected & validated':'Configured'):'Not configured'}</strong>{zohoStatus.from_address&&<small>{zohoStatus.from_address}</small>}</div>{!zohoStatus.configured&&zohoStatus.missing.length>0&&<p className="email-missing-config">Missing server secrets: {zohoStatus.missing.join(', ')}</p>}{zohoStatus.validation_error&&<p className="email-missing-config">{zohoStatus.validation_error}</p>}{zohoStatus.validation_note&&<p className="field-help">{zohoStatus.validation_note}</p>}</div>
        <button className="primary-button" onClick={()=>refreshZohoStatus(true)} disabled={checkingZoho||!zohoStatus.configured||zohoStatus.provider==='zeptomail'}><Link2 size={16}/>{checkingZoho?'Checking…':zohoStatus.provider==='zeptomail'?'ZeptoMail configured':'Validate Zoho Mail'}</button>
      </div>
      <div className="card email-security-card">
        <div className="card-header"><div><p className="eyebrow">Secure setup</p><h2>What happens next</h2></div><ShieldCheck size={20}/></div>
        <div className="email-setup-list"><div><span>1</span><div><strong>Create a ZeptoMail Mail Agent</strong><p>Use Zoho’s transactional email product for automated participant messages.</p></div></div><div><span>2</span><div><strong>Verify your sender domain</strong><p>Complete ZeptoMail’s DKIM/CNAME verification for the address ApplyFlow sends from.</p></div></div><div><span>3</span><div><strong>Store the Send Mail token server-side</strong><p>Add ZEPTOMAIL_SEND_TOKEN and ZEPTOMAIL_FROM_ADDRESS to Supabase Edge Function Secrets. Never put the token in React.</p></div></div><div><span>4</span><div><strong>Send participant email</strong><p>ApplyFlow will automatically prefer ZeptoMail API over the legacy Zoho Mail SMTP transport.</p></div></div></div>
      </div>
    </div>}
  </section>
}
