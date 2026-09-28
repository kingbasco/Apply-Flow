import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, CalendarCheck2, Gift, Upload, Plus, Search, X, Users, CheckCircle2, ChevronDown, Mail, Hash, ClipboardList, Link2, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application = { id:string; name:string }
type Participant = {
  id:string; participant_id:string; full_name:string|null; email:string|null
  application_id:string; status:'active'|'completed'|'withdrawn'; joined_at:string
  attendance_count?:number
}
type Session = { id:string; application_id:string; title:string; session_date:string; check_in_slug:string; check_in_open:boolean; check_in_opened_at:string|null }
type Benefit = {
  id:string; application_id:string; name:string; description:string|null
  distribution_date:string|null; status:'draft'|'ready'|'distributed'; recipient_count?:number
}
type AttendanceRow = {
  participant_id:string; status:'present'|'absent'; marked_at:string
  participants?:{participant_id:string;application_id:string;applicants?:{full_name:string|null;email:string|null}|{full_name:string|null;email:string|null}[]}
}
type Assignment = { id:string; application_id:string; title:string; description:string|null; instructions:string|null; deadline:string|null; max_score:number; pass_mark:number; status:'draft'|'published'|'closed'; public_slug:string; results_released:boolean; results_released_at:string|null; created_at:string }
type AssignmentQuestion = { id:string; assignment_id:string; type:'short_text'|'long_text'|'number'|'single_choice'|'multiple_choice'|'file'|'url'; label:string; description:string|null; required:boolean; position:number; config:any }
type AssignmentSubmission = { id:string; assignment_id:string; participant_id:string; status:'submitted'|'graded'; submitted_at:string; score:number|null; feedback:string|null; graded_at:string|null; participants?:{participant_id:string;applicants?:{full_name:string|null;email:string|null}|null}|null }
type AssignmentAnswer = { id:string; question_id:string; value:any; assignment_questions?:{label:string;type:string;position:number}|null }
type AssignmentDocument = { id:string; question_id:string; storage_bucket:string; storage_path:string; original_name:string; mime_type:string|null; file_size:number|null }
type LeaderboardRow = { participant_record_id:string; participant_id:string; full_name:string|null; graded_assignments:number; submitted_assignments:number; total_assignments:number; average_percentage:number|null; completion_percentage:number; rank:number|null }
type ParticipantAttendance = {
  id:string; status:'present'|'absent'; marked_at:string
  attendance_sessions?:{title:string;session_date:string;application_id:string}|{title:string;session_date:string;application_id:string}[]
}

export default function ParticipantsPanel({organizationId,applications,role}:{organizationId:string;applications:Application[];role?:'owner'|'admin'|'reviewer'}) {
  const [tab,setTab]=useState<'participants'|'attendance'|'assignments'|'benefits'>('participants')
  const isAdmin=role==='owner'||role==='admin'
  const isProgrammeStaff=role==='reviewer'
  const [participants,setParticipants]=useState<Participant[]>([])
  const [programmeStaff,setProgrammeStaff]=useState<{id:string;full_name:string|null}[]>([])
  const [participantStaff,setParticipantStaff]=useState<{participant_id:string;staff_id:string}[]>([])
  const [sessions,setSessions]=useState<Session[]>([])
  const [benefits,setBenefits]=useState<Benefit[]>([])
  const [assignments,setAssignments]=useState<Assignment[]>([])
  const [assignmentQuestions,setAssignmentQuestions]=useState<Record<string,AssignmentQuestion[]>>({})
  const [assignmentForm,setAssignmentForm]=useState({title:'',description:'',instructions:'',deadline:'',max_score:'100',pass_mark:'50'})
  const [questionForm,setQuestionForm]=useState({label:'',type:'long_text' as AssignmentQuestion['type'],required:true,options:['','']})
  const [editingQuestionId,setEditingQuestionId]=useState<string|null>(null)
  const [editQuestionForm,setEditQuestionForm]=useState({label:'',type:'long_text' as AssignmentQuestion['type'],required:true,options:['','']})
  const [selectedAssignment,setSelectedAssignment]=useState<Assignment|null>(null)
  const [editingAssignment,setEditingAssignment]=useState(false)
  const [editAssignmentForm,setEditAssignmentForm]=useState({title:'',description:'',instructions:'',deadline:'',max_score:'100',pass_mark:'50'})
  const [assignmentSubmissions,setAssignmentSubmissions]=useState<AssignmentSubmission[]>([])
  const [selectedSubmission,setSelectedSubmission]=useState<AssignmentSubmission|null>(null)
  const [submissionAnswers,setSubmissionAnswers]=useState<AssignmentAnswer[]>([])
  const [submissionDocuments,setSubmissionDocuments]=useState<AssignmentDocument[]>([])
  const [gradeForm,setGradeForm]=useState({score:'',feedback:''})
  const [leaderboard,setLeaderboard]=useState<LeaderboardRow[]>([])
  const [leaderboardLoading,setLeaderboardLoading]=useState(false)
  const [selectedParticipant,setSelectedParticipant]=useState<Participant|null>(null)
  const participantProfileScrollRef=useRef<HTMLDivElement>(null)
  const [participantAttendance,setParticipantAttendance]=useState<ParticipantAttendance[]>([])
  const [participantAttendanceLoading,setParticipantAttendanceLoading]=useState(false)
  const [selectedSession,setSelectedSession]=useState<Session|null>(null)
  const [sessionAttendance,setSessionAttendance]=useState<AttendanceRow[]>([])
  const [attendanceLoading,setAttendanceLoading]=useState(false)
  const [query,setQuery]=useState('')
  const [selectedParticipantIds,setSelectedParticipantIds]=useState<string[]>([])
  const [bulkStaffId,setBulkStaffId]=useState('')
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
    if(!notice&&!error)return
    const timer=window.setTimeout(()=>{setNotice('');setError('')},5000)
    return ()=>window.clearTimeout(timer)
  },[notice,error])


  useEffect(()=>{
    if(!selectedParticipant)return
    const previousBodyOverflow=document.body.style.overflow
    const previousHtmlOverflow=document.documentElement.style.overflow
    const previousBodyOverscroll=document.body.style.overscrollBehavior
    const previousHtmlOverscroll=document.documentElement.style.overscrollBehavior
    document.body.style.overflow='hidden'
    document.documentElement.style.overflow='hidden'
    document.body.style.overscrollBehavior='none'
    document.documentElement.style.overscrollBehavior='none'
    const frame=window.requestAnimationFrame(()=>{
      participantProfileScrollRef.current?.scrollTo({top:0,left:0,behavior:'auto'})
    })
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelectedParticipant(null)}
    window.addEventListener('keydown',onKeyDown)
    return()=>{
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown',onKeyDown)
      document.body.style.overflow=previousBodyOverflow
      document.documentElement.style.overflow=previousHtmlOverflow
      document.body.style.overscrollBehavior=previousBodyOverscroll
      document.documentElement.style.overscrollBehavior=previousHtmlOverscroll
    }
  },[selectedParticipant?.id])

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
      const [p,s,b,recipients,a,staff,staffAssignments]=await Promise.all([
        supabase.from('participants').select('id,participant_id,application_id,status,joined_at,applicants(full_name,email)').eq('organization_id',organizationId).order('participant_id'),
        supabase.from('attendance_sessions').select('id,application_id,title,session_date,check_in_slug,check_in_open,check_in_opened_at').eq('organization_id',organizationId).order('session_date',{ascending:false}),
        supabase.from('benefit_distributions').select('id,application_id,name,description,distribution_date,status').eq('organization_id',organizationId).order('created_at',{ascending:false}),
        supabase.from('benefit_recipients').select('distribution_id,participant_id'),
        supabase.from('assignments').select('id,application_id,title,description,instructions,deadline,max_score,pass_mark,status,public_slug,results_released,results_released_at,created_at').eq('organization_id',organizationId).order('created_at',{ascending:false}),
        supabase.from('profiles').select('id,full_name').eq('organization_id',organizationId).in('role',['admin','reviewer']).order('full_name'),
        supabase.from('participant_staff_assignments').select('participant_id,staff_id').eq('organization_id',organizationId)
      ])
      if(p.error)throw p.error;if(s.error)throw s.error;if(b.error)throw b.error;if(a.error)throw a.error;if(staff.error)throw staff.error;if(staffAssignments.error)throw staffAssignments.error
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
      setParticipants(participantRows);setSessions(sessionRows);setBenefits(benefitRows);setAssignments((a.data||[]) as Assignment[]);setProgrammeStaff(staff.data||[]);setParticipantStaff(staffAssignments.data||[])
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

  async function loadLeaderboard(applicationId:string){
    if(!applicationId||applicationId==='all'){setLeaderboard([]);return}
    setLeaderboardLoading(true)
    const {data,error}=await supabase.rpc('get_assignment_leaderboard',{p_application_id:applicationId})
    if(error)setError(error.message);else setLeaderboard((data||[]) as LeaderboardRow[])
    setLeaderboardLoading(false)
  }

  function toggleParticipantSelection(participantId:string,checked:boolean){
    setSelectedParticipantIds(current=>checked?[...new Set([...current,participantId])]:current.filter(id=>id!==participantId))
  }
  function toggleAllVisibleParticipants(checked:boolean){
    const visibleIds=filtered.map(p=>p.id)
    setSelectedParticipantIds(current=>checked?[...new Set([...current,...visibleIds])]:current.filter(id=>!visibleIds.includes(id)))
  }
  async function bulkAssignProgrammeStaff(){
    if(!isAdmin||!bulkStaffId||!selectedParticipantIds.length)return
    setSaving(true);setError('');setNotice('')
    try{
      const {error}=await supabase.rpc('bulk_set_participant_staff_assignment',{p_participant_ids:selectedParticipantIds,p_staff_id:bulkStaffId,p_assigned:true})
      if(error)throw error
      setParticipantStaff(current=>{
        const keep=current.filter(x=>!(x.staff_id===bulkStaffId&&selectedParticipantIds.includes(x.participant_id)))
        return [...keep,...selectedParticipantIds.map(participant_id=>({participant_id,staff_id:bulkStaffId}))]
      })
      const count=selectedParticipantIds.length
      setSelectedParticipantIds([]);setBulkStaffId('')
      setNotice(count+' participant'+(count===1?'':'s')+' assigned to staff.')
    }catch(e){setError(e instanceof Error?e.message:'Could not assign selected participants.')}finally{setSaving(false)}
  }

  async function updateParticipantStaffAssignment(participantId:string,staffId:string,assigned:boolean){
    if(!isAdmin)return
    setSaving(true);setError('');setNotice('')
    try{
      const {error}=await supabase.rpc('set_participant_staff_assignment',{p_participant_id:participantId,p_staff_id:staffId,p_assigned:assigned})
      if(error)throw error
      setParticipantStaff(current=>assigned?[...current.filter(x=>!(x.participant_id===participantId&&x.staff_id===staffId)),{participant_id:participantId,staff_id:staffId}]:current.filter(x=>!(x.participant_id===participantId&&x.staff_id===staffId)))
      setNotice(assigned?'Staff member assigned to participant.':'Staff assignment removed.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update staff assignment.')}finally{setSaving(false)}
  }

  async function openParticipant(participant:Participant){
    setSelectedParticipant(participant);setParticipantAttendance([]);setParticipantAttendanceLoading(true);setError('');loadLeaderboard(participant.application_id)
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
      }).select('id,application_id,title,session_date,check_in_slug,check_in_open,check_in_opened_at').single()
      if(error)throw error
      setSessions(x=>[data,...x]);setSelectedSession(data);setSessionAttendance([])
      setIds('');setNotice('Attendance session created.')
    }catch(e){setError(e instanceof Error?e.message:'Could not create session.')}finally{setSaving(false)}
  }

  async function setCheckInOpen(open:boolean){
    if(!selectedSession)return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('attendance_sessions').update({check_in_open:open,check_in_opened_at:open?new Date().toISOString():null}).eq('id',selectedSession.id).select('id,application_id,title,session_date,check_in_slug,check_in_open,check_in_opened_at').single()
      if(error)throw error
      setSessions(x=>x.map(s=>s.id===data.id?data as Session:s));setSelectedSession(data as Session)
      setNotice(open?'Self check-in is open. Share the check-in link with participants.':'Self check-in closed. Manual attendance remains available.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update self check-in.')}finally{setSaving(false)}
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
        deadline:assignmentForm.deadline||null,max_score:Number(assignmentForm.max_score)||100,pass_mark:Number(assignmentForm.pass_mark)||50,public_slug:slug
      }).select('id,application_id,title,description,instructions,deadline,max_score,pass_mark,status,public_slug,results_released,results_released_at,created_at').single()
      if(error)throw error
      setAssignments(x=>[data as Assignment,...x]);setSelectedAssignment(data as Assignment);setAssignmentQuestions(x=>({...x,[data.id]:[]}))
      setAssignmentForm({title:'',description:'',instructions:'',deadline:'',max_score:'100',pass_mark:'50'});setNotice('Assignment draft created.')
    }catch(e){setError(e instanceof Error?e.message:'Could not create assignment.')}finally{setSaving(false)}
  }
  async function openAssignment(assignment:Assignment){
    setSelectedAssignment(assignment);setSelectedSubmission(null);setEditingAssignment(false);setEditAssignmentForm({title:assignment.title,description:assignment.description||'',instructions:assignment.instructions||'',deadline:assignment.deadline?new Date(assignment.deadline).toISOString().slice(0,16):'',max_score:String(assignment.max_score),pass_mark:String(assignment.pass_mark)});setError('')
    const [questions,submissions]=await Promise.all([
      supabase.from('assignment_questions').select('id,assignment_id,type,label,description,required,position,config').eq('assignment_id',assignment.id).order('position'),
      supabase.from('assignment_submissions').select('id,assignment_id,participant_id,status,submitted_at,score,feedback,graded_at,participants(participant_id,applicants(full_name,email))').eq('assignment_id',assignment.id).order('submitted_at',{ascending:false})
    ])
    if(questions.error){setError(questions.error.message);return}
    if(submissions.error){setError(submissions.error.message);return}
    setAssignmentQuestions(x=>({...x,[assignment.id]:(questions.data||[]) as AssignmentQuestion[]}))
    setAssignmentSubmissions((submissions.data||[]) as unknown as AssignmentSubmission[]);loadLeaderboard(assignment.application_id)
  }
  async function updateAssignment(e:FormEvent){
    e.preventDefault();if(!selectedAssignment||!editAssignmentForm.title.trim())return
    setSaving(true);setError('');setNotice('')
    try{
      const maxScore=Number(editAssignmentForm.max_score)
      if(!Number.isFinite(maxScore)||maxScore<=0)throw new Error('Maximum score must be greater than zero.')
      const passMark=Number(editAssignmentForm.pass_mark);if(!Number.isFinite(passMark)||passMark<0||passMark>maxScore)throw new Error('Pass mark must be between 0 and the maximum score.');const patch={title:editAssignmentForm.title.trim(),description:editAssignmentForm.description.trim()||null,instructions:editAssignmentForm.instructions.trim()||null,deadline:editAssignmentForm.deadline||null,max_score:maxScore,pass_mark:passMark,updated_at:new Date().toISOString()}
      const {data,error}=await supabase.from('assignments').update(patch).eq('id',selectedAssignment.id).select('id,application_id,title,description,instructions,deadline,max_score,pass_mark,status,public_slug,results_released,results_released_at,created_at').single()
      if(error)throw error
      setSelectedAssignment(data as Assignment);setAssignments(x=>x.map(a=>a.id===data.id?data as Assignment:a));setEditingAssignment(false);setNotice('Assignment updated.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update assignment.')}finally{setSaving(false)}
  }
  async function deleteAssignment(){
    if(!selectedAssignment||!window.confirm('Delete "'+selectedAssignment.title+'"? This permanently removes its questions, submissions, grades and uploaded files.'))return
    setSaving(true);setError('');setNotice('')
    try{
      const submissionIds=assignmentSubmissions.map(s=>s.id);const docsResult=submissionIds.length?await supabase.from('assignment_documents').select('storage_bucket,storage_path').in('submission_id',submissionIds):{data:[],error:null};const {data:docs,error:docsError}=docsResult
      if(docsError)throw docsError
      const byBucket=new Map<string,string[]>()
      for(const doc of docs||[])byBucket.set(doc.storage_bucket,[...(byBucket.get(doc.storage_bucket)||[]),doc.storage_path])
      for(const [bucket,paths] of byBucket){if(paths.length){const {error}=await supabase.storage.from(bucket).remove(paths);if(error)throw error}}
      const {error}=await supabase.from('assignments').delete().eq('id',selectedAssignment.id)
      if(error)throw error
      setAssignments(x=>x.filter(a=>a.id!==selectedAssignment.id));setSelectedAssignment(null);setAssignmentSubmissions([]);setLeaderboard([]);setNotice('Assignment deleted.')
    }catch(e){setError(e instanceof Error?e.message:'Could not delete assignment.')}finally{setSaving(false)}
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
      setSelectedSubmission(updated);setAssignmentSubmissions(x=>x.map(s=>s.id===updated.id?updated:s));await loadLeaderboard(selectedAssignment.application_id);setNotice('Grade saved.')
    }catch(e){setError(e instanceof Error?e.message:'Could not save grade.')}finally{setSaving(false)}
  }
  async function openAssignmentDocument(doc:AssignmentDocument){
    const {data,error}=await supabase.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path,300)
    if(error||!data?.signedUrl){setError(error?.message||'Could not open file.');return}
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }
  async function addAssignmentQuestion(e:FormEvent){
    e.preventDefault();if(!selectedAssignment||!questionForm.label.trim()||(selectedAssignment.status!=='draft'&&!(editingAssignment&&assignmentSubmissions.length===0)))return
    setSaving(true);setError('')
    try{
      const position=(assignmentQuestions[selectedAssignment.id]||[]).length
      const choiceType=questionForm.type==='single_choice'||questionForm.type==='multiple_choice'
      const options=questionForm.options.map(option=>option.trim()).filter(Boolean)
      if(choiceType&&options.length<2)throw new Error('Add at least two answer options for a choice question.')
      const {data,error}=await supabase.from('assignment_questions').insert({assignment_id:selectedAssignment.id,type:questionForm.type,label:questionForm.label.trim(),required:questionForm.required,position,config:choiceType?{options}:{}}).select('id,assignment_id,type,label,description,required,position,config').single()
      if(error)throw error
      setAssignmentQuestions(x=>({...x,[selectedAssignment.id]:[...(x[selectedAssignment.id]||[]),data as AssignmentQuestion]}));setQuestionForm({label:'',type:'long_text',required:true,options:['','']})
    }catch(e){setError(e instanceof Error?e.message:'Could not add question.')}finally{setSaving(false)}
  }
  function startEditQuestion(q:AssignmentQuestion){
    setEditingQuestionId(q.id)
    setEditQuestionForm({label:q.label,type:q.type,required:q.required,options:Array.isArray(q.config?.options)&&q.config.options.length?q.config.options:['','']})
  }
  async function saveAssignmentQuestion(e:FormEvent){
    e.preventDefault();if(!selectedAssignment||!editingQuestionId||!editQuestionForm.label.trim())return
    setSaving(true);setError('');setNotice('')
    try{
      const choiceType=editQuestionForm.type==='single_choice'||editQuestionForm.type==='multiple_choice'
      const options=editQuestionForm.options.map(option=>option.trim()).filter(Boolean)
      if(choiceType&&options.length<2)throw new Error('Add at least two answer options for a choice question.')
      const {data,error}=await supabase.from('assignment_questions').update({label:editQuestionForm.label.trim(),type:editQuestionForm.type,required:editQuestionForm.required,config:choiceType?{options}:{},updated_at:new Date().toISOString()}).eq('id',editingQuestionId).select('id,assignment_id,type,label,description,required,position,config').single()
      if(error)throw error
      setAssignmentQuestions(x=>({...x,[selectedAssignment.id]:(x[selectedAssignment.id]||[]).map(q=>q.id===data.id?data as AssignmentQuestion:q)}));setEditingQuestionId(null);setNotice('Question updated.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update question.')}finally{setSaving(false)}
  }
  async function deleteAssignmentQuestion(q:AssignmentQuestion){
    if(!selectedAssignment||!window.confirm('Delete this question?'))return
    setSaving(true);setError('');setNotice('')
    try{
      const {error}=await supabase.from('assignment_questions').delete().eq('id',q.id)
      if(error)throw error
      setAssignmentQuestions(x=>({...x,[selectedAssignment.id]:(x[selectedAssignment.id]||[]).filter(item=>item.id!==q.id)}));if(editingQuestionId===q.id)setEditingQuestionId(null);setNotice('Question deleted.')
    }catch(e){setError(e instanceof Error?e.message:'Could not delete question.')}finally{setSaving(false)}
  }

  async function setResultsReleased(released:boolean){
    if(!selectedAssignment)return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('assignments').update({results_released:released,results_released_at:released?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',selectedAssignment.id).select('id,application_id,title,description,instructions,deadline,max_score,pass_mark,status,public_slug,results_released,results_released_at,created_at').single()
      if(error)throw error
      setAssignments(x=>x.map(a=>a.id===data.id?data as Assignment:a));setSelectedAssignment(data as Assignment);setNotice(released?'Results released. Participants can now check their results.':'Results hidden from participants.')
    }catch(e){setError(e instanceof Error?e.message:'Could not update results visibility.')}finally{setSaving(false)}
  }

  async function setAssignmentStatus(status:Assignment['status']){
    if(!selectedAssignment)return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('assignments').update({status,published_at:status==='published'?new Date().toISOString():undefined,updated_at:new Date().toISOString()}).eq('id',selectedAssignment.id).select('id,application_id,title,description,instructions,deadline,max_score,pass_mark,status,public_slug,results_released,results_released_at,created_at').single()
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

    {(error||notice)&&createPortal(<div className={'action-feedback-toast '+(error?'is-error':'is-success')} role={error?'alert':'status'} aria-live="polite">
      <div className="action-feedback-icon">{error?<X size={18}/>:<CheckCircle2 size={18}/>}</div>
      <div className="action-feedback-copy"><strong>{error?'Action failed':'Success'}</strong><span>{error||notice}</span></div>
      <button type="button" className="action-feedback-close" aria-label="Dismiss notification" onClick={()=>{setError('');setNotice('')}}><X size={16}/></button>
      <span className="action-feedback-timer" aria-hidden="true"/>
    </div>,document.body)}

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
        ...(isAdmin?[['benefits','Benefits'] as const]:[])
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
        {isAdmin&&<div className="participant-bulk-bar">
          <div className="participant-bulk-summary"><strong>{selectedParticipantIds.length} selected</strong><span>Select participants below, then assign them to a staff member.</span></div>
          <div className="participant-bulk-actions"><div className="participant-select-wrap"><select aria-label="Choose staff member" value={bulkStaffId} onChange={e=>setBulkStaffId(e.target.value)}><option value="">Choose staff member</option>{programmeStaff.map(staff=><option key={staff.id} value={staff.id}>{staff.full_name||'Staff member'}</option>)}</select><ChevronDown size={16}/></div><button type="button" className="primary-button" disabled={saving||!bulkStaffId||!selectedParticipantIds.length} onClick={bulkAssignProgrammeStaff}>Assign selected</button>{selectedParticipantIds.length>0&&<button type="button" className="text-button" onClick={()=>setSelectedParticipantIds([])}>Clear</button>}</div>
        </div>}
        <div className="table-wrap"><table><thead><tr>{isAdmin&&<th className="participant-select-cell"><input type="checkbox" aria-label="Select all visible participants" checked={filtered.length>0&&filtered.every(p=>selectedParticipantIds.includes(p.id))} onChange={e=>toggleAllVisibleParticipants(e.target.checked)}/></th>}<th>Participant ID</th><th>Participant</th><th>Programme</th><th>Attendance</th><th>Status</th><th>Joined</th></tr></thead><tbody>
          {filtered.length?filtered.map(p=><tr key={p.id} className="clickable-row" onClick={()=>openParticipant(p)}>
            {isAdmin&&<td className="participant-select-cell" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={'Select '+(p.full_name||p.participant_id)} checked={selectedParticipantIds.includes(p.id)} onChange={e=>toggleParticipantSelection(p.id,e.target.checked)}/></td>}
            <td><strong>{p.participant_id}</strong></td>
            <td><strong>{p.full_name||'Unnamed participant'}</strong><span className="table-sub">{p.email||'No email'}</span></td>
            <td>{appName(p.application_id)}</td>
            <td>{p.attendance_count||0} present</td>
            <td><span className={'status '+(p.status==='active'?'green':p.status==='completed'?'blue':'neutral')}>{p.status==='active'?'Active / Enrolled':p.status}</span></td>
            <td>{new Date(p.joined_at).toLocaleDateString()}</td>
          </tr>):<tr><td colSpan={isAdmin?7:6}><div className="table-empty">{participants.length?'No participants match these filters.':'No approved participants yet. Approved applicants appear here automatically.'}</div></td></tr>}
        </tbody></table></div>
      </div>
    </>}

    {tab==='attendance'&&<div className="attendance-layout">
      <div className="attendance-column">
        <div className="card table-card attendance-session-card">
          <div className="card-header"><div><p className="eyebrow">{isAdmin?'Attendance setup':'Attendance history'}</p><h2>Attendance sessions</h2><p>{isAdmin?'Create a class, then select it to manage attendance.':'Select a session to view attendance for participants assigned to you.'}</p></div></div>
          {isAdmin&&<form className="modal-form attendance-session-form" onSubmit={createSession}>
            <label className="attendance-field">Programme<div className="participant-select-wrap"><select value={sessionForm.application_id} onChange={e=>setSessionForm(x=>({...x,application_id:e.target.value}))} required><option value="">Select programme</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div></label>
            <label>Session title<input value={sessionForm.title} onChange={e=>setSessionForm(x=>({...x,title:e.target.value}))} placeholder="Class 1 — Introduction" required/></label>
            <label>Date<input type="date" value={sessionForm.session_date} onChange={e=>setSessionForm(x=>({...x,session_date:e.target.value}))} required/></label>
            <button className="primary-button" disabled={saving}><Plus size={16}/> Create session</button>
          </form>}
          <div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Session</th><th>Programme</th><th>Date</th></tr></thead><tbody>
            {scopedSessions.length?scopedSessions.map(s=><tr key={s.id} className={selectedSession?.id===s.id?'clickable-row selected-row':'clickable-row'} onClick={()=>openSession(s)}><td><strong>{s.title}</strong></td><td>{appName(s.application_id)}</td><td>{new Date(s.session_date).toLocaleDateString()}</td></tr>):<tr><td colSpan={3}><div className="table-empty">No attendance sessions for this application yet.</div></td></tr>}
          </tbody></table></div>
        </div>
      </div>
      <div className="attendance-column">
        <div className="card table-card attendance-record-card">
          <div className="card-header"><div><p className="eyebrow">Selected session</p><h2>{selectedSession?selectedSession.title:'Session attendance'}</h2><p>{selectedSession?appName(selectedSession.application_id):'Select a session from the list.'}</p></div><CalendarCheck2 size={20}/></div>
          {!selectedSession?<div className="table-empty">Select an attendance session to see participants.</div>:attendanceLoading?<div className="loading-card">Loading attendance…</div>:<>{isAdmin&&<div className="attendance-checkin-card"><div><p className="eyebrow">Participant self check-in</p><h3>{selectedSession.check_in_open?'Check-in is open':'Check-in is closed'}</h3><p>{selectedSession.check_in_open?'Participants can use the shared link and their Participant ID to mark themselves present.':'Open check-in when you are ready for participants to record their attendance.'}</p></div><div className="attendance-checkin-actions"><button type="button" className={selectedSession.check_in_open?'secondary-button':'primary-button'} onClick={()=>setCheckInOpen(!selectedSession.check_in_open)} disabled={saving}>{selectedSession.check_in_open?'Close check-in':'Open check-in'}</button><button type="button" className="secondary-button" onClick={()=>navigator.clipboard.writeText(window.location.origin+'/attendance/'+selectedSession.check_in_slug).then(()=>setNotice('Attendance check-in link copied.')).catch(()=>setError('Could not copy the attendance link.'))}><Link2 size={15}/> Copy check-in link</button></div></div>}
            <div className="table-wrap"><table><thead><tr><th>Participant</th><th>ID</th><th>Status</th><th></th></tr></thead><tbody>
              {selectedAttendance.length?selectedAttendance.map(r=><tr key={r.participant_id}><td><strong>{Array.isArray(r.participants?.applicants)?r.participants?.applicants[0]?.full_name:r.participants?.applicants?.full_name||'Unnamed participant'}</strong><span className="table-sub">{Array.isArray(r.participants?.applicants)?r.participants?.applicants[0]?.email:r.participants?.applicants?.email||''}</span></td><td>{r.participants?.participant_id}</td><td><span className={'status '+(r.status==='present'?'green':'neutral')}>{r.status}</span></td><td>{isAdmin&&r.status==='present'?<button className="text-button" disabled={saving} onClick={()=>markAbsent(r.participant_id)}>Mark absent</button>:null}</td></tr>):<tr><td colSpan={4}><div className="table-empty">No attendance recorded for this session.</div></td></tr>}
            </tbody></table></div>
            {isAdmin&&<div className="attendance-import-box">
              <div className="attendance-import-heading"><div><p className="eyebrow">Import attendance</p><h3>Participant IDs</h3><p>Paste participant IDs from Google Meet, one per line or separated by commas.</p></div><Upload size={19}/></div>
              <textarea rows={7} value={ids} onChange={e=>setIds(e.target.value)} placeholder={'HC2-2026-0001\\nHC2-2026-0007'} />
              <button className="primary-button" onClick={importAttendance} disabled={saving}>{saving?'Importing…':'Import attendance IDs'}</button>
              <p className="muted">Only IDs belonging to this session’s programme are accepted.</p>
            </div>}
          </>}
        </div>
      </div>
    </div>}{tab==='assignments'&&<div className="assignment-layout">
      <div className="assignment-column">
        <div className="card table-card">
          {isAdmin?<><div className="card-header"><div><p className="eyebrow">Assignment setup</p><h2>Create assignment</h2><p>Create programme coursework now; participant submission opens in Phase 2.</p></div><ClipboardList size={20}/></div>
          <form className="modal-form assignment-form" onSubmit={createAssignment}>
            <label>Title<input value={assignmentForm.title} onChange={e=>setAssignmentForm(x=>({...x,title:e.target.value}))} placeholder="Week 1 — Business model" required/></label>
            <label>Description<textarea rows={3} value={assignmentForm.description} onChange={e=>setAssignmentForm(x=>({...x,description:e.target.value}))} placeholder="Short assignment summary."/></label>
            <label>Instructions<textarea rows={5} value={assignmentForm.instructions} onChange={e=>setAssignmentForm(x=>({...x,instructions:e.target.value}))} placeholder="Explain what participants should complete."/></label>
            <div className="assignment-form-grid"><label>Deadline<input type="datetime-local" value={assignmentForm.deadline} onChange={e=>setAssignmentForm(x=>({...x,deadline:e.target.value}))}/></label><label>Maximum score<input type="number" min="1" max="1000" value={assignmentForm.max_score} onChange={e=>setAssignmentForm(x=>({...x,max_score:e.target.value}))}/></label><label>Pass mark<input type="number" min="0" max={assignmentForm.max_score||undefined} value={assignmentForm.pass_mark} onChange={e=>setAssignmentForm(x=>({...x,pass_mark:e.target.value}))}/></label></div>
            <button className="primary-button" disabled={saving||!applicationFilter}><Plus size={16}/> Create draft</button>
          </form>
          </>:<div className="card-header"><div><p className="eyebrow">Assignments</p><h2>Programme assignments</h2><p>Open an assignment to review work submitted by participants assigned to you.</p></div><ClipboardList size={20}/></div>}<div className="table-wrap"><table><thead><tr><th>Assignment</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{scopedAssignments.length?scopedAssignments.map(a=><tr key={a.id} className={selectedAssignment?.id===a.id?'clickable-row selected-row':'clickable-row'} onClick={()=>openAssignment(a)}><td><strong>{a.title}</strong><span className="table-sub">{a.max_score} points</span></td><td>{a.deadline?new Date(a.deadline).toLocaleString():'No deadline'}</td><td><span className={'status '+(a.status==='published'?'green':a.status==='closed'?'neutral':'blue')}>{a.status}</span></td></tr>):<tr><td colSpan={3}><div className="table-empty">No assignments for this programme yet.</div></td></tr>}</tbody></table></div>
        </div>
      </div>
      <div className="assignment-column">
        <div className="card table-card">
          <div className="card-header"><div><p className="eyebrow">Assignment builder</p><h2>{selectedAssignment?.title||'Select an assignment'}</h2><p>{selectedAssignment?'Add the questions participants will answer.':'Choose an assignment from the list to build it.'}</p></div>{selectedAssignment&&isAdmin?<div className="assignment-header-actions"><button type="button" className="icon-button" aria-label="Edit assignment" onClick={()=>setEditingAssignment(v=>!v)}><Pencil size={17}/></button><button type="button" className="icon-button danger-icon-button" aria-label="Delete assignment" onClick={deleteAssignment} disabled={saving}><Trash2 size={17}/></button></div>:<Link2 size={20}/>}</div>
          {!selectedAssignment?<div className="table-empty">Select or create an assignment to continue.</div>:<>
            {isAdmin&&editingAssignment&&<form className="modal-form assignment-edit-form" onSubmit={updateAssignment}><div className="assignment-form-grid"><label>Title<input value={editAssignmentForm.title} onChange={e=>setEditAssignmentForm(x=>({...x,title:e.target.value}))} required/></label><label>Maximum score<input type="number" min="1" step="0.01" value={editAssignmentForm.max_score} onChange={e=>setEditAssignmentForm(x=>({...x,max_score:e.target.value}))} required/></label><label>Pass mark<input type="number" min="0" step="0.01" max={editAssignmentForm.max_score||undefined} value={editAssignmentForm.pass_mark} onChange={e=>setEditAssignmentForm(x=>({...x,pass_mark:e.target.value}))} required/></label></div><label>Description<textarea rows={3} value={editAssignmentForm.description} onChange={e=>setEditAssignmentForm(x=>({...x,description:e.target.value}))}/></label><label>Instructions<textarea rows={4} value={editAssignmentForm.instructions} onChange={e=>setEditAssignmentForm(x=>({...x,instructions:e.target.value}))}/></label><label>Deadline<input type="datetime-local" value={editAssignmentForm.deadline} onChange={e=>setEditAssignmentForm(x=>({...x,deadline:e.target.value}))}/></label><div className="assignment-edit-actions"><button type="button" className="secondary-button" onClick={()=>setEditingAssignment(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?'Saving…':'Save changes'}</button></div></form>}<div className="assignment-meta"><div><span>Status</span><strong>{selectedAssignment.status}</strong></div><div><span>Maximum score</span><strong>{selectedAssignment.max_score}</strong></div><div><span>Pass mark</span><strong>{selectedAssignment.pass_mark}</strong></div><div><span>Assignment link</span><strong>/a/{selectedAssignment.public_slug}</strong><button type="button" className="text-button" onClick={()=>navigator.clipboard.writeText(window.location.origin+'/a/'+selectedAssignment.public_slug).then(()=>setNotice('Assignment link copied.')).catch(()=>setError('Could not copy the assignment link.'))}>Copy link</button></div><div className="assignment-results-meta"><span>Participant results</span><strong>{selectedAssignment.results_released?'Released':'Hidden'}</strong><div className="assignment-results-actions">{isAdmin&&<button type="button" className="text-button" onClick={()=>setResultsReleased(!selectedAssignment.results_released)} disabled={saving}>{selectedAssignment.results_released?'Hide results':'Release results'}</button>}<button type="button" className="text-button" onClick={()=>navigator.clipboard.writeText(window.location.origin+'/results/'+selectedAssignment.public_slug).then(()=>setNotice('Results link copied.')).catch(()=>setError('Could not copy the results link.'))}>Copy results link</button></div></div></div>
            {isAdmin&&(selectedAssignment.status==='draft'||(editingAssignment&&assignmentSubmissions.length===0))&&<form className="modal-form assignment-question-form" onSubmit={addAssignmentQuestion}><label>Question<input value={questionForm.label} onChange={e=>setQuestionForm(x=>({...x,label:e.target.value}))} placeholder="What did you learn this week?" required/></label><div className="assignment-form-grid"><label>Answer type<select value={questionForm.type} onChange={e=>setQuestionForm(x=>({...x,type:e.target.value as AssignmentQuestion['type'],options:(e.target.value==='single_choice'||e.target.value==='multiple_choice')?(x.options.length>=2?x.options:['','']):x.options}))}><option value="short_text">Short answer</option><option value="long_text">Long answer</option><option value="number">Number</option><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option><option value="file">File upload</option><option value="url">Link / URL</option></select></label><label className="assignment-checkbox"><input type="checkbox" checked={questionForm.required} onChange={e=>setQuestionForm(x=>({...x,required:e.target.checked}))}/> Required</label></div>{(questionForm.type==='single_choice'||questionForm.type==='multiple_choice')&&<div className="assignment-options-editor"><div className="assignment-options-heading"><div><strong>Answer options</strong><small>{questionForm.type==='single_choice'?'Participants can select one option.':'Participants can select more than one option.'}</small></div><button type="button" className="text-button" onClick={()=>setQuestionForm(x=>({...x,options:[...x.options,'']}))}><Plus size={15}/> Add option</button></div><div className="assignment-option-list">{questionForm.options.map((option,index)=><div className="assignment-option-row" key={index}><span>{index+1}</span><input value={option} onChange={e=>setQuestionForm(x=>({...x,options:x.options.map((item,i)=>i===index?e.target.value:item)}))} placeholder={'Option '+(index+1)} required/><button type="button" className="icon-button" aria-label={'Remove option '+(index+1)} disabled={questionForm.options.length<=2} onClick={()=>setQuestionForm(x=>({...x,options:x.options.filter((_,i)=>i!==index)}))}><X size={15}/></button></div>)}</div></div>}<button className="secondary-button" disabled={saving}><Plus size={16}/> Add question</button></form>}
            <div className="assignment-question-list">{(assignmentQuestions[selectedAssignment.id]||[]).length?(assignmentQuestions[selectedAssignment.id]||[]).map((q,i)=><div key={q.id} className="assignment-question-item">{editingQuestionId===q.id?<form className="assignment-inline-question-edit" onSubmit={saveAssignmentQuestion}><label>Question<input value={editQuestionForm.label} onChange={e=>setEditQuestionForm(x=>({...x,label:e.target.value}))} required/></label><div className="assignment-form-grid"><label>Answer type<select value={editQuestionForm.type} onChange={e=>setEditQuestionForm(x=>({...x,type:e.target.value as AssignmentQuestion['type']}))}><option value="short_text">Short answer</option><option value="long_text">Long answer</option><option value="number">Number</option><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option><option value="file">File upload</option><option value="url">Link / URL</option></select></label><label className="assignment-checkbox"><input type="checkbox" checked={editQuestionForm.required} onChange={e=>setEditQuestionForm(x=>({...x,required:e.target.checked}))}/> Required</label></div>{(editQuestionForm.type==='single_choice'||editQuestionForm.type==='multiple_choice')&&<div className="assignment-options-editor"><div className="assignment-options-heading"><strong>Answer options</strong><button type="button" className="text-button" onClick={()=>setEditQuestionForm(x=>({...x,options:[...x.options,'']}))}><Plus size={15}/> Add option</button></div><div className="assignment-option-list">{editQuestionForm.options.map((option,index)=><div className="assignment-option-row" key={index}><span>{index+1}</span><input value={option} onChange={e=>setEditQuestionForm(x=>({...x,options:x.options.map((item,j)=>j===index?e.target.value:item)}))} required/><button type="button" className="icon-button" disabled={editQuestionForm.options.length<=2} onClick={()=>setEditQuestionForm(x=>({...x,options:x.options.filter((_,j)=>j!==index)}))}><X size={15}/></button></div>)}</div></div>}<div className="assignment-edit-actions"><button type="button" className="secondary-button" onClick={()=>setEditingQuestionId(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?'Saving…':'Save question'}</button></div></form>:<div className="assignment-question-row"><span>{i+1}</span><div><strong>{q.label}</strong><small>{q.type.replaceAll('_',' ')} · {q.required?'Required':'Optional'}</small></div>{isAdmin&&editingAssignment&&<div className="assignment-question-actions"><button type="button" className="icon-button" aria-label="Edit question" onClick={()=>startEditQuestion(q)}><Pencil size={15}/></button><button type="button" className="icon-button danger-icon-button" aria-label="Delete question" onClick={()=>deleteAssignmentQuestion(q)} disabled={saving}><Trash2 size={15}/></button></div>}</div>}</div>):<div className="table-empty">No questions yet.</div>}</div>
            {isAdmin&&<div className="assignment-actions">{selectedAssignment.status==='draft'?<button className="primary-button" onClick={()=>setAssignmentStatus('published')} disabled={saving||!(assignmentQuestions[selectedAssignment.id]||[]).length}>Publish assignment</button>:selectedAssignment.status==='published'?<button className="secondary-button" onClick={()=>setAssignmentStatus('closed')} disabled={saving}>Close assignment</button>:null}</div>}
            <div className="assignment-submissions-section">
              <div className="card-header"><div><p className="eyebrow">Submissions</p><h3>Participant work</h3><p>{assignmentSubmissions.length} submission{assignmentSubmissions.length===1?'':'s'} received.</p></div></div>
              <div className="table-wrap"><table><thead><tr><th>Participant</th><th>Submitted</th><th>Score</th><th>Status</th></tr></thead><tbody>{assignmentSubmissions.length?assignmentSubmissions.map(s=><tr key={s.id} className={selectedSubmission?.id===s.id?'clickable-row selected-row':'clickable-row'} onClick={()=>openAssignmentSubmission(s)}><td><strong>{s.participants?.applicants?.full_name||s.participants?.participant_id||'Participant'}</strong><span className="table-sub">{s.participants?.participant_id||''}</span></td><td>{new Date(s.submitted_at).toLocaleString()}</td><td>{s.score===null?'—':s.score+'/'+selectedAssignment.max_score}</td><td><span className={'status '+(s.status==='graded'?'green':'blue')}>{s.status}</span></td></tr>):<tr><td colSpan={4}><div className="table-empty">No submissions yet.</div></td></tr>}</tbody></table></div>
            </div>
            <div className="assignment-leaderboard">
              <div className="card-header"><div><p className="eyebrow">Performance</p><h3>Leaderboard</h3><p>Ranked by average percentage across graded assignments. Completion is shown separately.</p></div></div>
              {leaderboardLoading?<div className="loading-card">Loading leaderboard…</div>:<div className="table-wrap"><table><thead><tr><th>Rank</th><th>Participant</th><th>Graded</th><th>Average</th><th>Completion</th></tr></thead><tbody>{leaderboard.length?leaderboard.map(row=><tr key={row.participant_record_id}><td><strong>{row.rank?('#'+row.rank):'—'}</strong></td><td><strong>{row.full_name||row.participant_id}</strong><span className="table-sub">{row.participant_id}</span></td><td>{row.graded_assignments}/{row.total_assignments}</td><td>{row.average_percentage===null?'—':Number(row.average_percentage).toFixed(1)+'%'}</td><td>{Number(row.completion_percentage).toFixed(0)}%</td></tr>):<tr><td colSpan={5}><div className="table-empty">No participant performance data yet.</div></td></tr>}</tbody></table></div>}
            </div>
            {selectedSubmission&&<div className="assignment-review">
              <div className="card-header"><div><p className="eyebrow">Review submission</p><h3>{selectedSubmission.participants?.applicants?.full_name||selectedSubmission.participants?.participant_id||'Participant'}</h3><p>{selectedSubmission.participants?.participant_id} · {new Date(selectedSubmission.submitted_at).toLocaleString()}</p></div><button className="icon-button" onClick={()=>setSelectedSubmission(null)} aria-label="Close review"><X size={17}/></button></div>
              <div className="assignment-answer-list">{submissionAnswers.sort((a,b)=>(a.assignment_questions?.position||0)-(b.assignment_questions?.position||0)).map((a,i)=>{const doc=submissionDocuments.find(d=>d.question_id===a.question_id);return <div className="assignment-answer-row" key={a.id}><span>{i+1}</span><div><strong>{a.assignment_questions?.label||'Question'}</strong>{doc?<button type="button" className="text-button" onClick={()=>openAssignmentDocument(doc)}>{doc.original_name}</button>:<p>{Array.isArray(a.value)?a.value.join(', '):typeof a.value==='object'?JSON.stringify(a.value):String(a.value??'—')}</p>}</div></div>})}</div>
              <form className="modal-form assignment-grade-form" onSubmit={gradeSubmission}><div className="assignment-form-grid"><label>Score<input type="number" min="0" max={selectedAssignment.max_score} step="0.01" value={gradeForm.score} onChange={e=>setGradeForm(x=>({...x,score:e.target.value}))} required/><small className="field-help">Maximum {selectedAssignment.max_score}</small></label><label>Status<input value={selectedSubmission.status==='graded'?'Graded':'Awaiting grade'} disabled/></label></div><label>Feedback<textarea rows={5} value={gradeForm.feedback} onChange={e=>setGradeForm(x=>({...x,feedback:e.target.value}))} placeholder="Give the participant clear feedback."/></label><button className="primary-button" disabled={saving}>{saving?'Saving…':selectedSubmission.status==='graded'?'Update grade':'Save grade'}</button></form>
            </div>}
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

    {selectedParticipant&&createPortal(<div ref={participantProfileScrollRef} className="participant-profile-backdrop" role="dialog" aria-modal="true" aria-label="Participant profile">
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
            {isAdmin&&<label className="participant-status-select"><span>Change status</span><div className="participant-select-wrap"><select value={selectedParticipant.status} disabled={saving} onChange={e=>updateParticipantStatus(selectedParticipant.id,e.target.value as Participant['status'])}><option value="active">Active / Enrolled</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></select><ChevronDown size={16}/></div></label>}
          </div>
          {isAdmin&&<section className="participant-profile-section participant-staff-section"><div className="participant-section-heading"><div><p className="eyebrow">Staff assignment</p><h3>Assigned follow-up staff</h3><p>Assign staff who can follow attendance, submissions and grade this participant.</p></div><Users size={19}/></div>{programmeStaff.length?<div className="participant-staff-list">{programmeStaff.map(staff=>{const assigned=participantStaff.some(x=>x.participant_id===selectedParticipant.id&&x.staff_id===staff.id);return <label key={staff.id} className="participant-staff-option"><input type="checkbox" checked={assigned} disabled={saving} onChange={e=>updateParticipantStaffAssignment(selectedParticipant.id,staff.id,e.target.checked)}/><span><strong>{staff.full_name||'Staff member'}</strong><small>{assigned?'Assigned to this participant':'Not assigned'}</small></span></label>})}</div>:<div className="table-empty">No Admin or Programme Staff members are available yet.</div>}</section>}
          <div className="participant-profile-stats">
            <div><span>Attendance</span><strong>{selectedParticipant.attendance_count||0}</strong><small>sessions present</small></div>
            <div><span>Joined</span><strong>{new Date(selectedParticipant.joined_at).toLocaleDateString()}</strong><small>programme start</small></div>
            <div><span>Programme</span><strong>{appName(selectedParticipant.application_id)}</strong><small>current application</small></div>
          </div>
          <section className="participant-profile-section">
            <div className="participant-section-heading"><div><p className="eyebrow">Assignments</p><h3>Performance</h3><p>Graded assignment performance for this participant.</p></div><ClipboardList size={19}/></div>
            {leaderboardLoading?<div className="loading-card">Loading performance…</div>:(()=>{const performance=leaderboard.find(row=>row.participant_record_id===selectedParticipant.id);return performance?<div className="participant-profile-stats"><div><span>Average score</span><strong>{performance.average_percentage===null?'—':Number(performance.average_percentage).toFixed(1)+'%'}</strong><small>{performance.graded_assignments} graded</small></div><div><span>Completion</span><strong>{Number(performance.completion_percentage).toFixed(0)}%</strong><small>{performance.submitted_assignments}/{performance.total_assignments} submitted</small></div><div><span>Leaderboard</span><strong>{performance.rank?'#'+performance.rank:'Unranked'}</strong><small>programme position</small></div></div>:<div className="table-empty">No assignment performance yet.</div>})()}
          </section>
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
    </div>,document.body)}
  </section>
}
