import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BadgeCheck, CalendarCheck2, Gift, Upload, Plus, Search, X, Users, CheckCircle2, ChevronDown, Mail, Hash, ClipboardList, Link2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application = { id:string; name:string }
type Participant = {
  id:string; participant_id:string; full_name:string|null; email:string|null
  application_id:string; status:'active'|'completed'|'withdrawn'; joined_at:string
  attendance_count?:number
}
type Session = { id:string; application_id:string; title:string; session_date:string }
type Benefit = {
  id:string; application_id:string; name:string; description:string|null
  distribution_date:string|null; status:'draft'|'ready'|'distributed'; recipient_count?:number
}
type AttendanceRow = {
  participant_id:string; status:'present'|'absent'; marked_at:string
  participants?:{participant_id:string;application_id:string;applicants?:{full_name:string|null;email:string|null}|{full_name:string|null;email:string|null}[]}
}
type Assignment = { id:string; application_id:string; title:string; description:string|null; instructions:string|null; deadline:string|null; max_score:number; status:'draft'|'published'|'closed'; public_slug:string; created_at:string }
type AssignmentQuestion = { id:string; assignment_id:string; type:'short_text'|'long_text'|'number'|'single_choice'|'multiple_choice'|'file'|'url'; label:string; description:string|null; required:boolean; position:number; config:any }
type AssignmentSubmission = { id:string; assignment_id:string; participant_id:string; status:'submitted'|'graded'; submitted_at:string; score:number|null; feedback:string|null; graded_at:string|null; participants?:{participant_id:string;full_name:string|null;email:string|null}|null }
type AssignmentAnswer = { id:string; question_id:string; value:any; assignment_questions?:{label:string;type:string;position:number}|null }
type AssignmentDocument = { id:string; question_id:string; storage_bucket:string; storage_path:string; original_name:string; mime_type:string|null; file_size:number|null }
type ParticipantAttendance = {
  id:string; status:'present'|'absent'; marked_at:string
  attendance_sessions?:{title:string;session_date:string;application_id:string}|{title:string;session_date:string;application_id:string}[]
}

export default function ParticipantsPanel({organizationId,applications}:{organizationId:string;applications:Application[]}) {
  const [tab,setTab]=useState<'participants'|'attendance'|'assignments'|'benefits'>('participants')
  const [participants,setParticipants]=useState<Participant[]>([])
  const [sessions,setSessions]=useState<Session[]>([])
  const [benefits,setBenefits]=useState<Benefit[]>([])
  const [assignments,setAssignments]=useState<Assignment[]>([])
  const [assignmentQuestions,setAssignmentQuestions]=useState<Record<string,AssignmentQuestion[]>>({})
  const [assignmentForm,setAssignmentForm]=useState({title:'',description:'',instructions:'',deadline:'',max_score:'100'})
  const [questionForm,setQuestionForm]=useState({label:'',type:'long_text' as AssignmentQuestion['type'],required:true})
  const [selectedAssignment,setSelectedAssignment]=useState<Assignment|null>(null)
  const [assignmentSubmissions,setAssignmentSubmissions]=useState<AssignmentSubmission[]>([])
  const [selectedSubmission,setSelectedSubmission]=useState<AssignmentSubmission|null>(null)
  const [submissionAnswers,setSubmissionAnswers]=useState<AssignmentAnswer[]>([])
  const [submissionDocuments,setSubmissionDocuments]=useState<AssignmentDocument[]>([])
  const [gradeForm,setGradeForm]=useState({score:'',feedback:''})
  const [selectedParticipant,setSelectedParticipant]=useState<Participant|null>(null)
  const [participantAttendance,setParticipantAttendance]=useState<ParticipantAttendance[]>([])
  const [participantAttendanceLoading,setParticipantAttendanceLoading]=useState(false)
  const [selectedSession,setSelectedSession]=useState<Session|null>(null)
  const [sessionAttendance,setSessionAttendance]=useState<AttendanceRow[]>([])
  const [attendanceLoading,setAttendanceLoading]=useState(false)
  const [query,setQuery]=useState('')
  const [applicationFilter,setApplicationFilter]=useState(applications[0]?.id||'')
  const [statusFilter,setStatusFilter]=useState<'all'|'active'|'completed'|'withdrawn'>('all')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [sessionForm,setSessionForm]=useState({application_id:'',title:'',session_date:new Date().toISOString().slice(0,10)})
  const [benefitForm,setBenefitForm]=useState({application_id:'',name:'',description:'',distribution_date:''})
  const [ids,setIds]=useState('')
  const [saving,setSaving]=useState(false)

  const appName=(id:string)=>applications.find(a=>a.id===id)?.name||'Programme'

  useEffect(()=>{
    setApplicationFilter(current=>applications.some(a=>a.id===current)?current:(applications[0]?.id||''))
  },[applications])

  useEffect(()=>{
    if(applicationFilter){
      setSessionForm(current=>({...current,application_id:current.application_id||applicationFilter}))
      setBenefitForm(current=>({...current,application_id:current.application_id||applicationFilter}))
    }
  },[applicationFilter])

  async function load(){
    setLoading(true);setError('')
    try{
      const [p,s,b,recipients,a]=await Promise.all([
        supabase.from('participants').select('id,participant_id,application_id,status,joined_at,applicants(full_name,email)').eq('organization_id',organizationId).order('participant_id'),
        supabase.from('attendance_sessions').select('id,application_id,title,session_date').eq('organization_id',organizationId).order('session_date',{ascending:false}),
        supabase.from('benefit_distributions').select('id,application_id,name,description,distribution_date,status').eq('organization_id',organizationId).order('created_at',{ascending:false}),
        supabase.from('benefit_recipients').select('distribution_id,participant_id'),
        supabase.from('assignments').select('id,application_id,title,description,instructions,deadline,max_score,status,public_slug,created_at').eq('organization_id',organizationId).order('created_at',{ascending:false})
      ])
      if(p.error)throw p.error;if(s.error)throw s.error;if(b.error)throw b.error;if(a.error)throw a.error
      // Load attendance/recipient aggregates separately so an empty organisation does not
      // create an invalid IN () query in PostgREST.
      const participantRows=(p.data||[]).map((row:any)=>({
        id:row.id,participant_id:row.participant_id,application_id:row.application_id,status:row.status,joined_at:row.joined_at,
        full_name:row.applicants?.full_name||null,email:row.applicants?.email||null
      })) as Participant[]
      const sessionRows=(s.data||[]) as Session[]
      const benefitRows=(b.data||[]) as Benefit[]

      if(participantRows.length){
        const {data:records,error:recordError}=await supabase.from('attendance_records').select('participant_id,status').in('participant_id',participantRows.map(x=>x.id))
        if(recordError)throw recordError
        const counts=new Map<string,number>()
        for(const row of records||[]) if(row.status==='present') counts.set(row.participant_id,(counts.get(row.participant_id)||0)+1)
        for(const row of participantRows) row.attendance_count=counts.get(row.id)||0
      }
      if((recipients.data||[]).length){
        const counts=new Map<string,number>()
        for(const row of recipients.data||[]) counts.set(row.distribution_id,(counts.get(row.distribution_id)||0)+1)
        for(const row of benefitRows) row.recipient_count=counts.get(row.id)||0
      }
      setParticipants(participantRows);setSessions(sessionRows);setBenefits(benefitRows);setAssignments((a.data||[]) as Assignment[])
    }catch(e){setError(e instanceof Error?e.message:'Could not load programme participants.')}finally{setLoading(false)}
  }

  useEffect(()=>{load()},[organizationId])

  const filtered=useMemo(()=>participants.filter(p=>{
    const text=[p.participant_id,p.full_name,p.email,appName(p.application_id)].filter(Boolean).join(' ').toLowerCase()
    return (!query.trim()||text.includes(query.trim().toLowerCase()))
      && (applicationFilter==='all'||p.application_id===applicationFilter)
      && (statusFilter==='all'||p.status===statusFilter)
  }),[participants,query,applicationFilter,statusFilter,applications])

  const scopedParticipants=useMemo(()=>participants.filter(p=>!applicationFilter||p.application_id===applicationFilter),[participants,applicationFilter])
  const scopedSessions=useMemo(()=>sessions.filter(s=>!applicationFilter||s.application_id===applicationFilter),[sessions,applicationFilter])
  const scopedBenefits=useMemo(()=>benefits.filter(b=>!applicationFilter||b.application_id===applicationFilter),[benefits,applicationFilter])
  const scopedAssignments=useMemo(()=>assignments.filter(a=>!applicationFilter||a.application_id===applicationFilter),[assignments,applicationFilter])
  const stats=useMemo(()=>({
    total:scopedParticipants.length,
    active:scopedParticipants.filter(p=>p.status==='active').length,
    completed:scopedParticipants.filter(p=>p.status==='completed').length,
    withdrawn:scopedParticipants.filter(p=>p.status==='withdrawn').length
  }),[scopedParticipants])

  async function openParticipant(participant:Participant){
    setSelectedParticipant(participant);setParticipantAttendance([]);setParticipantAttendanceLoading(true);setError('')
    try{
      const {data,error}=await supabase.from('attendance_records')
        .select('id,status,marked_at,attendance_sessions!inner(title,session_date,application_id)')
        .eq('participant_id',participant.id)
        .eq('attendance_sessions.application_id',participant.application_id)
        .order('marked_at',{ascending:false})
      if(error)throw error
      setParticipantAttendance((data||[]) as ParticipantAttendance[])
    }catch(e){setError(e instanceof Error?e.message:'Could not load participant attendance history.')}finally{setParticipantAttendanceLoading(false)}
  }

  async function updateParticipantStatus(participantId:string,status:Participant['status']){
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('participants').update({status,updated_at:new Date().toISOString()}).eq('id',participantId).select('id,participant_id,application_id,status,joined_at').single()
      if(error)throw error
      setParticipants(current=>current.map(p=>p.id===participantId?{...p,...data}:p))
      setSelectedParticipant(current=>current?.id===participantId?{...current,...data}:current)
      setNotice(status==='active'?'Participant enrolled.':status==='completed'?'Participant marked completed.':'Participant withdrawn.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update participant status.')}finally{setSaving(false)}
  }

  async function openSession(session:Session){
    setSelectedSession(session);setAttendanceLoading(true);setError('')
    try{
      const {data,error}=await supabase.from('attendance_records')
        .select('participant_id,status,marked_at,participants!inner(participant_id,application_id,applicants(full_name,email))')
        .eq('attendance_session_id',session.id)
      if(error)throw error
      setSessionAttendance((data||[]).map((row:any)=>({
        ...row,
        participants:Array.isArray(row.participants)?{...row.participants[0],applicants:row.participants[0]?.applicants}:row.participants
      })) as AttendanceRow[])
    }catch(e){setError(e instanceof Error?e.message:'Could not load session attendance.')}finally{setAttendanceLoading(false)}
  }

  async function createSession(e:FormEvent){
    e.preventDefault();if(!sessionForm.application_id||!sessionForm.title.trim())return
    setSaving(true);setError('');setNotice('')
    try{
      const user=(await supabase.auth.getUser()).data.user
      const {data,error}=await supabase.from('attendance_sessions').insert({
        organization_id:organizationId,application_id:sessionForm.application_id,
        title:sessionForm.title.trim(),session_date:sessionForm.session_date,created_by:user?.id
      }).select('id,application_id,title,session_date').single()
      if(error)throw error
      setSessions(x=>[data,...x]);setSelectedSession(data);setSessionAttendance([])
      setIds('');setNotice('Attendance session created.')
    }catch(e){setError(e instanceof Error?e.message:'Could not create session.')}finally{setSaving(false)}
  }

  async function importAttendance(){
    if(!selectedSession)return
    const codes=[...new Set(ids.split(/[\s,;]+/).map(x=>x.trim().toUpperCase()).filter(Boolean))]
    if(!codes.length){setError('Paste at least one participant ID.');return}
    setSaving(true);setError('');setNotice('')
    try{
      const matches=participants.filter(p=>p.application_id===selectedSession.application_id&&codes.includes(p.participant_id.toUpperCase()))
      const unknown=codes.filter(code=>!matches.some(p=>p.participant_id.toUpperCase()===code))
      if(matches.length){
        const {error}=await supabase.from('attendance_records').upsert(
          matches.map(p=>({attendance_session_id:selectedSession.id,participant_id:p.id,status:'present',source:'google_meet_import',marked_at:new Date().toISOString()})),
          {onConflict:'attendance_session_id,participant_id'}
        )
        if(error)throw error
        await openSession(selectedSession)
        await load()
      }
      setNotice('Marked '+matches.length+' present.'+(unknown.length?' '+unknown.length+' ID(s) not found or from another programme.':''))
      setIds('')
    }catch(e){setError(e instanceof Error?e.message:'Could not import attendance.')}finally{setSaving(false)}
  }

  async function markAbsent(participantId:string){
    if(!selectedSession)return
    setSaving(true);setError('');setNotice('')
    try{
      const {error}=await supabase.from('attendance_records').upsert({
        attendance_session_id:selectedSession.id,participant_id:participantId,status:'absent',
        source:'manual',marked_at:new Date().toISOString()
      },{onConflict:'attendance_session_id,participant_id'})
      if(error)throw error
      await openSession(selectedSession);setNotice('Attendance updated.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update attendance.')}finally{setSaving(false)}
  }

  async function createBenefit(e:FormEvent){
    e.preventDefault();if(!benefitForm.application_id||!benefitForm.name.trim())return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('benefit_distributions').insert({
        organization_id:organizationId,application_id:benefitForm.application_id,name:benefitForm.name.trim(),
        description:benefitForm.description.trim()||null,distribution_date:benefitForm.distribution_date||null,
        eligibility_rule:{type:'attendance',rule:'last_2_sessions'}
      }).select('id,application_id,name,description,distribution_date,status').single()
      if(error)throw error
      setBenefits(x=>[{...data,recipient_count:0},...x])
      setBenefitForm({application_id:'',name:'',description:'',distribution_date:''})
      setNotice('Benefit distribution created.')
    }catch(e){setError(e instanceof Error?e.message:'Could not create distribution.')}finally{setSaving(false)}
  }

  async function createAssignment(e:FormEvent){
    e.preventDefault();if(!applicationFilter||!assignmentForm.title.trim())return
    setSaving(true);setError('');setNotice('')
    try{
      const user=(await supabase.auth.getUser()).data.user
      if(!user)throw new Error('Sign in again to create an assignment.')
      const slug=(assignmentForm.title.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')||'assignment')+'-'+Math.random().toString(36).slice(2,8)
      const {data,error}=await supabase.from('assignments').insert({
        organization_id:organizationId,application_id:applicationFilter,created_by:user.id,title:assignmentForm.title.trim(),
        description:assignmentForm.description.trim()||null,instructions:assignmentForm.instructions.trim()||null,
        deadline:assignmentForm.deadline||null,max_score:Number(assignmentForm.max_score)||100,public_slug:slug
      }).select('id,application_id,title,description,instructions,deadline,max_score,status,public_slug,created_at').single()
      if(error)throw error
      setAssignments(x=>[data as Assignment,...x]);setSelectedAssignment(data as Assignment);setAssignmentQuestions(x=>({...x,[data.id]:[]}))
      setAssignmentForm({title:'',description:'',instructions:'',deadline:'',max_score:'100'});setNotice('Assignment draft created.')
    }catch(e){setError(e instanceof Error?e.message:'Could not create assignment.')}finally{setSaving(false)}
  }
  async function openAssignment(assignment:Assignment){
    setSelectedAssignment(assignment);setSelectedSubmission(null);setError('')
    const [questions,submissions]=await Promise.all([
      supabase.from('assignment_questions').select('id,assignment_id,type,label,description,required,position,config').eq('assignment_id',assignment.id).order('position'),
      supabase.from('assignment_submissions').select('id,assignment_id,participant_id,status,submitted_at,score,feedback,graded_at,participants(participant_id,full_name,email)').eq('assignment_id',assignment.id).order('submitted_at',{ascending:false})
    ])
    if(questions.error){setError(questions.error.message);return}
    if(submissions.error){setError(submissions.error.message);return}
    setAssignmentQuestions(x=>({...x,[assignment.id]:(questions.data||[]) as AssignmentQuestion[]}))
    setAssignmentSubmissions((submissions.data||[]) as unknown as AssignmentSubmission[])
  }
  async function openAssignmentSubmission(submission:AssignmentSubmission){
    setSelectedSubmission(submission);setGradeForm({score:submission.score===null?'':String(submission.score),feedback:submission.feedback||''});setError('')
    const [answers,documents]=await Promise.all([
      supabase.from('assignment_answers').select('id,question_id,value,assignment_questions(label,type,position)').eq('submission_id',submission.id),
      supabase.from('assignment_documents').select('id,question_id,storage_bucket,storage_path,original_name,mime_type,file_size').eq('submission_id',submission.id)
    ])
    if(answers.error){setError(answers.error.message);return}
    if(documents.error){setError(documents.error.message);return}
    setSubmissionAnswers((answers.data||[]) as unknown as AssignmentAnswer[]);setSubmissionDocuments((documents.data||[]) as AssignmentDocument[])
  }
  async function gradeSubmission(e:FormEvent){
    e.preventDefault();if(!selectedSubmission||!selectedAssignment)return
    setSaving(true);setError('');setNotice('')
    try{
      const score=Number(gradeForm.score)
      if(!Number.isFinite(score)||score<0||score>selectedAssignment.max_score)throw new Error('Score must be between 0 and '+selectedAssignment.max_score+'.')
      const {data,error}=await supabase.rpc('grade_assignment_submission',{p_submission_id:selectedSubmission.id,p_score:score,p_feedback:gradeForm.feedback})
      if(error)throw error
      const updated={...selectedSubmission,score,status:'graded' as const,feedback:gradeForm.feedback||null,graded_at:data.graded_at}
      setSelectedSubmission(updated);setAssignmentSubmissions(x=>x.map(s=>s.id===updated.id?updated:s));setNotice('Grade saved.')
    }catch(e){setError(e instanceof Error?e.message:'Could not save grade.')}finally{setSaving(false)}
  }
  async function openAssignmentDocument(doc:AssignmentDocument){
    const {data,error}=await supabase.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path,300)
    if(error||!data?.signedUrl){setError(error?.message||'Could not open file.');return}
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }
  async function addAssignmentQuestion(e:FormEvent){
    e.preventDefault();if(!selectedAssignment||!questionForm.label.trim()||selectedAssignment.status!=='draft')return
    setSaving(true);setError('')
    try{
      const position=(assignmentQuestions[selectedAssignment.id]||[]).length
      const {data,error}=await supabase.from('assignment_questions').insert({assignment_id:selectedAssignment.id,type:questionForm.type,label:questionForm.label.trim(),required:questionForm.required,position}).select('id,assignment_id,type,label,description,required,position,config').single()
      if(error)throw error
      setAssignmentQuestions(x=>({...x,[selectedAssignment.id]:[...(x[selectedAssignment.id]||[]),data as AssignmentQuestion]}));setQuestionForm({label:'',type:'long_text',required:true})
    }catch(e){setError(e instanceof Error?e.message:'Could not add question.')}finally{setSaving(false)}
  }
  async function setAssignmentStatus(status:Assignment['status']){
    if(!selectedAssignment)return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('assignments').update({status,published_at:status==='published'?new Date().toISOString():undefined,updated_at:new Date().toISOString()}).eq('id',selectedAssignment.id).select('id,application_id,title,description,instructions,deadline,max_score,status,public_slug,created_at').single()
      if(error)throw error
      setAssignments(x=>x.map(a=>a.id===data.id?data as Assignment:a));setSelectedAssignment(data as Assignment);setNotice(status==='published'?'Assignment published. The participant link will be activated in Phase 2.':status==='closed'?'Assignment closed.':'Assignment returned to draft.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update assignment.')}finally{setSaving(false)}
  }

  const selectedAttendance=selectedSession?sessionAttendance:[]

  if(loading)return <div className="loading-card card">Loading participants…</div>

  return <section>
    <div className="page-heading compact">
      <div><p className="eyebrow">Programme management</p><h1>Participants</h1><p className="subtitle">Manage approved participants: permanent IDs, attendance and programme benefits.</p></div>
      <div className="status green"><BadgeCheck size={15}/> Participant IDs active</div>
    </div>

    {error&&<div className="form-error page-error">{error}</div>}
    {notice&&<div className="form-message page-message">{notice}</div>}

    <div className="card" style={{padding:16,marginBottom:18}}>
      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
        <div className="stat-icon"><CheckCircle2 size={18}/></div>
        <div><strong>How participants are created</strong><p className="muted" style={{margin:'4px 0 0'}}>Applicants become participants automatically when their application is <strong>Approved</strong> during screening. ApplyFlow records them as <strong>Active / Enrolled</strong> and assigns a participant ID immediately.</p></div>
      </div>
    </div>

    <div className="participant-application-picker card">
      <div className="participant-picker-icon"><Users size={19}/></div>
      <div className="participant-picker-copy"><p className="eyebrow">Current application</p><strong>{appName(applicationFilter)}</strong><p>Choose an application to view its participants, attendance, assignments and benefits.</p></div>
      <label className="participant-select-field"><span>Select application</span><div className="participant-select-wrap"><select aria-label="Select application" value={applicationFilter} onChange={e=>setApplicationFilter(e.target.value)}>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div></label>
    </div>

    <div className="tabs" style={{display:'flex',gap:8,marginBottom:18}}>
      {[
        ['participants','Participants'],
        ['attendance','Attendance'],
        ['assignments','Assignments'],
        ['benefits','Benefits']
      ].map(([key,label])=><button key={key} className={tab===key?'secondary-button':'text-button'} onClick={()=>setTab(key as any)}>{label}</button>)}
    </div>

    {tab==='participants'&&<>
      <div className="participant-stats-grid">
        <div className="card stat-card"><div className="stat-icon"><Users size={18}/></div><div><p className="eyebrow">Total</p><div className="stat-value">{stats.total}</div><p className="muted">Total participants</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><BadgeCheck size={18}/></div><div><p className="eyebrow">Active</p><div className="stat-value">{stats.active}</div><p className="muted">Currently enrolled</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><CheckCircle2 size={18}/></div><div><p className="eyebrow">Completed</p><div className="stat-value">{stats.completed}</div><p className="muted">Finished programme</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><X size={18}/></div><div><p className="eyebrow">Withdrawn</p><div className="stat-value">{stats.withdrawn}</div><p className="muted">No longer participating</p></div></div>
      </div>

      <div className="card table-card">
        <div className="card-header">
          <div><h2>Participant directory</h2><p>Showing approved participants for the current application.</p></div>
          <div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search participants…"/></div>
        </div>
        <div className="participant-directory-filters">
          <label className="participant-select-field"><span>Filter by status</span><div className="participant-select-wrap"><select aria-label="Filter participants by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)}><option value="all">All statuses</option><option value="active">Active / Enrolled</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></select><ChevronDown size={16}/></div></label>
          <span className="participant-filter-count">{filtered.length} participant{filtered.length===1?'':'s'}</span>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Participant ID</th><th>Participant</th><th>Programme</th><th>Attendance</th><th>Status</th><th>Joined</th></tr></thead><tbody>
          {filtered.length?filtered.map(p=><tr key={p.id} className="clickable-row" onClick={()=>openParticipant(p)}>
            <td><strong>{p.participant_id}</strong></td>
            <td><strong>{p.full_name||'Unnamed participant'}</strong><span className="table-sub">{p.email||'No email'}</span></td>
            <td>{appName(p.application_id)}</td>
            <td>{p.attendance_count||0} present</td>
            <td><span className={'status '+(p.status==='active'?'green':p.status==='completed'?'blue':'neutral')}>{p.status==='active'?'Active / Enrolled':p.status}</span></td>
            <td>{new Date(p.joined_at).toLocaleDateString()}</td>
          </tr>):<tr><td colSpan={6}><div className="table-empty">{participants.length?'No participants match these filters.':'No approved participants yet. Approved applicants appear here automatically.'}</div></td></tr>}
        </tbody></table></div>
      </div>
    </>}

    {tab==='attendance'&&<div className="attendance-layout">
      <div className="attendance-column">
        <div className="card table-card attendance-session-card">
          <div className="card-header"><div><p className="eyebrow">Attendance setup</p><h2>Attendance sessions</h2><p>Create a class, then select it to manage attendance.</p></div></div>
          <form className="modal-form attendance-session-form" onSubmit={createSession}>
            <label className="attendance-field">Programme<div className="participant-select-wrap"><select value={sessionForm.application_id} onChange={e=>setSessionForm(x=>({...x,application_id:e.target.value}))} required><option value="">Select programme</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div></label>
            <label>Session title<input value={sessionForm.title} onChange={e=>setSessionForm(x=>({...x,title:e.target.value}))} placeholder="Class 1 — Introduction" required/></label>
            <label>Date<input type="date" value={sessionForm.session_date} onChange={e=>setSessionForm(x=>({...x,session_date:e.target.value}))} required/></label>
            <button className="primary-button" disabled={saving}><Plus size={16}/> Create session</button>
          </form>
          <div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Session</th><th>Programme</th><th>Date</th></tr></thead><tbody>
            {scopedSessions.length?scopedSessions.map(s=><tr key={s.id} className={selectedSession?.id===s.id?'clickable-row selected-row':'clickable-row'} onClick={()=>openSession(s)}><td><strong>{s.title}</strong></td><td>{appName(s.application_id)}</td><td>{new Date(s.session_date).toLocaleDateString()}</td></tr>):<tr><td colSpan={3}><div className="table-empty">No attendance sessions for this application yet.</div></td></tr>}
          </tbody></table></div>
        </div>
      </div>
      <div className="attendance-column">
        <div className="card table-card attendance-record-card">
          <div className="card-header"><div><p className="eyebrow">Selected session</p><h2>{selectedSession?selectedSession.title:'Session attendance'}</h2><p>{selectedSession?appName(selectedSession.application_id):'Select a session from the list.'}</p></div><CalendarCheck2 size={20}/></div>
          {!selectedSession?<div className="table-empty">Select an attendance session to see participants.</div>:attendanceLoading?<div className="loading-card">Loading attendance…</div>:<>
            <div className="table-wrap"><table><thead><tr><th>Participant</th><th>ID</th><th>Status</th><th></th></tr></thead><tbody>
              {selectedAttendance.length?selectedAttendance.map(r=><tr key={r.participant_id}><td><strong>{Array.isArray(r.participants?.applicants)?r.participants?.applicants[0]?.full_name:r.participants?.applicants?.full_name||'Unnamed participant'}</strong><span className="table-sub">{Array.isArray(r.participants?.applicants)?r.participants?.applicants[0]?.email:r.participants?.applicants?.email||''}</span></td><td>{r.participants?.participant_id}</td><td><span className={'status '+(r.status==='present'?'green':'neutral')}>{r.status}</span></td><td>{r.status==='present'?<button className="text-button" disabled={saving} onClick={()=>markAbsent(r.participant_id)}>Mark absent</button>:null}</td></tr>):<tr><td colSpan={4}><div className="table-empty">No attendance recorded for this session.</div></td></tr>}
            </tbody></table></div>
            <div className="attendance-import-box">
              <div className="attendance-import-heading"><div><p className="eyebrow">Import attendance</p><h3>Participant IDs</h3><p>Paste participant IDs from Google Meet, one per line or separated by commas.</p></div><Upload size={19}/></div>
              <textarea rows={7} value={ids} onChange={e=>setIds(e.target.value)} placeholder={'HC2-2026-0001\nHC2-2026-0007'} />
              <button className="primary-button" onClick={importAttendance} disabled={saving}>{saving?'Importing…':'Import attendance IDs'}</button>
              <p className="muted">Only IDs belonging to this session’s programme are accepted.</p>
            </div>
          </>}
        </div>
      </div>
    </div>}{tab==='assignments'&&<div className="assignment-layout">
      <div className="assignment-column">
        <div className="card table-card">
          <div className="card-header"><div><p className="eyebrow">Assignment setup</p><h2>Create assignment</h2><p>Create programme coursework now; participant submission opens in Phase 2.</p></div><ClipboardList size={20}/></div>
          <form className="modal-form assignment-form" onSubmit={createAssignment}>
            <label>Title<input value={assignmentForm.title} onChange={e=>setAssignmentForm(x=>({...x,title:e.target.value}))} placeholder="Week 1 — Business model" required/></label>
            <label>Description<textarea rows={3} value={assignmentForm.description} onChange={e=>setAssignmentForm(x=>({...x,description:e.target.value}))} placeholder="Short assignment summary."/></label>
            <label>Instructions<textarea rows={5} value={assignmentForm.instructions} onChange={e=>setAssignmentForm(x=>({...x,instructions:e.target.value}))} placeholder="Explain what participants should complete."/></label>
            <div className="assignment-form-grid"><label>Deadline<input type="datetime-local" value={assignmentForm.deadline} onChange={e=>setAssignmentForm(x=>({...x,deadline:e.target.value}))}/></label><label>Maximum score<input type="number" min="1" max="1000" value={assignmentForm.max_score} onChange={e=>setAssignmentForm(x=>({...x,max_score:e.target.value}))}/></label></div>
            <button className="primary-button" disabled={saving||!applicationFilter}><Plus size={16}/> Create draft</button>
          </form>
          <div className="table-wrap"><table><thead><tr><th>Assignment</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{scopedAssignments.length?scopedAssignments.map(a=><tr key={a.id} className={selectedAssignment?.id===a.id?'clickable-row selected-row':'clickable-row'} onClick={()=>openAssignment(a)}><td><strong>{a.title}</strong><span className="table-sub">{a.max_score} points</span></td><td>{a.deadline?new Date(a.deadline).toLocaleString():'No deadline'}</td><td><span className={'status '+(a.status==='published'?'green':a.status==='closed'?'neutral':'blue')}>{a.status}</span></td></tr>):<tr><td colSpan={3}><div className="table-empty">No assignments for this programme yet.</div></td></tr>}</tbody></table></div>
        </div>
      </div>
      <div className="assignment-column">
        <div className="card table-card">
          <div className="card-header"><div><p className="eyebrow">Assignment builder</p><h2>{selectedAssignment?.title||'Select an assignment'}</h2><p>{selectedAssignment?'Add the questions participants will answer.':'Choose an assignment from the list to build it.'}</p></div><Link2 size={20}/></div>
          {!selectedAssignment?<div className="table-empty">Select or create an assignment to continue.</div>:<>
            <div className="assignment-meta"><div><span>Status</span><strong>{selectedAssignment.status}</strong></div><div><span>Maximum score</span><strong>{selectedAssignment.max_score}</strong></div><div><span>Assignment link</span><strong>/a/{selectedAssignment.public_slug}</strong><button type="button" className="text-button" onClick={()=>navigator.clipboard.writeText(window.location.origin+'/a/'+selectedAssignment.public_slug).then(()=>setNotice('Assignment link copied.')).catch(()=>setError('Could not copy the assignment link.'))}>Copy link</button></div></div>
            {selectedAssignment.status==='draft'&&<form className="modal-form assignment-question-form" onSubmit={addAssignmentQuestion}><label>Question<input value={questionForm.label} onChange={e=>setQuestionForm(x=>({...x,label:e.target.value}))} placeholder="What did you learn this week?" required/></label><div className="assignment-form-grid"><label>Answer type<select value={questionForm.type} onChange={e=>setQuestionForm(x=>({...x,type:e.target.value as AssignmentQuestion['type']}))}><option value="short_text">Short answer</option><option value="long_text">Long answer</option><option value="number">Number</option><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option><option value="file">File upload</option><option value="url">Link / URL</option></select></label><label className="assignment-checkbox"><input type="checkbox" checked={questionForm.required} onChange={e=>setQuestionForm(x=>({...x,required:e.target.checked}))}/> Required</label></div><button className="secondary-button" disabled={saving}><Plus size={16}/> Add question</button></form>}
            <div className="assignment-question-list">{(assignmentQuestions[selectedAssignment.id]||[]).length?(assignmentQuestions[selectedAssignment.id]||[]).map((q,i)=><div key={q.id} className="assignment-question-row"><span>{i+1}</span><div><strong>{q.label}</strong><small>{q.type.replaceAll('_',' ')} · {q.required?'Required':'Optional'}</small></div></div>):<div className="table-empty">No questions yet.</div>}</div>
            <div className="assignment-actions">{selectedAssignment.status==='draft'?<button className="primary-button" onClick={()=>setAssignmentStatus('published')} disabled={saving||!(assignmentQuestions[selectedAssignment.id]||[]).length}>Publish assignment</button>:selectedAssignment.status==='published'?<button className="secondary-button" onClick={()=>setAssignmentStatus('closed')} disabled={saving}>Close assignment</button>:null}</div>
          </>}
        </div>
      </div>
    </div>}{tab==='benefits'&&<div className="benefits-layout">
      <div className="benefits-column">
        <div className="card table-card benefits-setup-card">
          <div className="card-header"><div><p className="eyebrow">Benefits setup</p><h2>Create a benefit</h2><p>Set up a data, stipend, device or other programme benefit.</p></div><Gift size={20}/></div>
          <form className="modal-form benefits-form" onSubmit={createBenefit}>
            <label className="attendance-field">Programme<div className="participant-select-wrap"><select value={benefitForm.application_id} onChange={e=>setBenefitForm(x=>({...x,application_id:e.target.value}))} required><option value="">Select programme</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div></label>
            <label>Benefit name<input value={benefitForm.name} onChange={e=>setBenefitForm(x=>({...x,name:e.target.value}))} placeholder="September data distribution" required/></label>
            <label>Description<textarea rows={5} value={benefitForm.description} onChange={e=>setBenefitForm(x=>({...x,description:e.target.value}))} placeholder="What participants will receive."/></label>
            <label>Distribution date<input type="date" value={benefitForm.distribution_date} onChange={e=>setBenefitForm(x=>({...x,distribution_date:e.target.value}))}/></label>
            <button className="primary-button" disabled={saving}><Plus size={16}/> Create distribution</button>
          </form>
        </div>
      </div>
      <div className="benefits-column">
        <div className="card table-card benefits-list-card">
          <div className="card-header"><div><p className="eyebrow">Distribution history</p><h2>Upcoming / recent</h2><p>Review benefits already created for this application.</p></div><Gift size={20}/></div>
          <div className="table-wrap"><table><thead><tr><th>Benefit</th><th>Programme</th><th>Date</th><th>Recipients</th><th>Status</th></tr></thead><tbody>
            {scopedBenefits.length?scopedBenefits.map(b=><tr key={b.id}><td><strong>{b.name}</strong><span className="table-sub">{b.description||'—'}</span></td><td>{appName(b.application_id)}</td><td>{b.distribution_date?new Date(b.distribution_date).toLocaleDateString():'—'}</td><td>{b.recipient_count||0}</td><td><span className="status neutral">{b.status}</span></td></tr>):<tr><td colSpan={5}><div className="table-empty">No benefit distributions for this application yet.</div></td></tr>}
          </tbody></table></div>
        </div>
      </div>
    </div>}

    {selectedParticipant&&<div className="preview-backdrop participant-profile-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedParticipant(null)}}>
      <div className="participant-profile-modal">
        <div className="participant-profile-header">
          <div className="participant-profile-identity">
            <div className="participant-avatar">{(selectedParticipant.full_name||'P').trim().charAt(0).toUpperCase()}</div>
            <div><p className="eyebrow">Participant profile</p><h2>{selectedParticipant.full_name||'Unnamed participant'}</h2><div className="participant-profile-meta"><span><Hash size={13}/>{selectedParticipant.participant_id}</span><span>{appName(selectedParticipant.application_id)}</span></div></div>
          </div>
          <button className="icon-button" onClick={()=>setSelectedParticipant(null)} aria-label="Close"><X size={18}/></button>
        </div>
        <div className="participant-profile-body">
          <div className="participant-profile-statusbar">
            <div><span className="eyebrow">Participation status</span><strong>{selectedParticipant.status==='active'?'Active / Enrolled':selectedParticipant.status==='completed'?'Completed':'Withdrawn'}</strong><small>Update the participant's current programme status.</small></div>
            <label className="participant-status-select"><span>Change status</span><div className="participant-select-wrap"><select value={selectedParticipant.status} disabled={saving} onChange={e=>updateParticipantStatus(selectedParticipant.id,e.target.value as Participant['status'])}><option value="active">Active / Enrolled</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></select><ChevronDown size={16}/></div></label>
          </div>
          <div className="participant-profile-stats">
            <div><span>Attendance</span><strong>{selectedParticipant.attendance_count||0}</strong><small>sessions present</small></div>
            <div><span>Joined</span><strong>{new Date(selectedParticipant.joined_at).toLocaleDateString()}</strong><small>programme start</small></div>
            <div><span>Programme</span><strong>{appName(selectedParticipant.application_id)}</strong><small>current application</small></div>
          </div>
          <section className="participant-profile-section">
            <div className="participant-section-heading"><div><p className="eyebrow">Attendance</p><h3>Attendance history</h3><p>Attendance records for this participant in this application.</p></div><CalendarCheck2 size={19}/></div>
            {participantAttendanceLoading?<div className="loading-card">Loading attendance history…</div>:participantAttendance.length?<div className="table-wrap participant-profile-table"><table><thead><tr><th>Session</th><th>Date</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{participantAttendance.map(r=><tr key={r.id}><td><strong>{Array.isArray(r.attendance_sessions)?r.attendance_sessions[0]?.title||'Session':r.attendance_sessions?.title||'Session'}</strong></td><td>{(Array.isArray(r.attendance_sessions)?r.attendance_sessions[0]?.session_date:r.attendance_sessions?.session_date)?new Date((Array.isArray(r.attendance_sessions)?r.attendance_sessions[0]?.session_date:r.attendance_sessions?.session_date) as string).toLocaleDateString():'—'}</td><td><span className={'status '+(r.status==='present'?'green':'neutral')}>{r.status}</span></td><td>{new Date(r.marked_at).toLocaleString()}</td></tr>)}</tbody></table></div>:<div className="table-empty">No attendance history yet.</div>}
          </section>
          <section className="participant-profile-section participant-contact-section">
            <div className="participant-section-heading"><div><p className="eyebrow">Contact details</p><h3>Participant information</h3></div><Mail size={18}/></div>
            <div className="participant-contact-grid"><div><span>Name</span><strong>{selectedParticipant.full_name||'Unnamed participant'}</strong></div><div><span>Email</span><strong>{selectedParticipant.email||'No email available'}</strong></div></div>
          </section>
        </div>
        <div className="participant-profile-footer"><button className="secondary-button" onClick={()=>setSelectedParticipant(null)}>Close profile</button></div>
      </div>
    </div>}
  </section>
}
