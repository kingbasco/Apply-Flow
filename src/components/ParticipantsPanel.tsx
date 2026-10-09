import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { BadgeCheck, CalendarCheck2, Gift, Upload, Download, Plus, Search, X, Users, CheckCircle2, ChevronDown, Mail, Phone, Hash, ClipboardList, Link2, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'
import { assignmentDeadlineForInput, assignmentDeadlineToISO, formatAssignmentDeadline } from '../lib/assignmentDeadline'
import TablePagination from './TablePagination'

type Application = { id:string; name:string }
type Participant = {
  id:string; applicant_id:string; participant_id:string; full_name:string|null; email:string|null; whatsapp_phone:string|null; submission_id:string|null
  application_id:string; status:'active'|'completed'|'withdrawn'; joined_at:string
  attendance_count?:number; trade?:string|null
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
type AssignmentQuestion = { id:string; assignment_id:string; type:'short_text'|'long_text'|'number'|'single_choice'|'multiple_choice'|'file'|'url'|'instruction'; label:string; description:string|null; required:boolean; position:number; config:any }
const isInstructionBlock = (question:AssignmentQuestion):boolean => question.config?.display_only===true

type AssignmentSubmission = { id:string; assignment_id:string; participant_id:string; status:'submitted'|'graded'; submitted_at:string; score:number|null; feedback:string|null; graded_at:string|null; participants?:{participant_id:string;applicants?:{full_name:string|null;email:string|null}|null}|null }
type AssignmentAnswer = { id:string; question_id:string; value:any; assignment_questions?:{label:string;type:string;position:number}|null }
type AssignmentDocument = { id:string; question_id:string; storage_bucket:string; storage_path:string; original_name:string; mime_type:string|null; file_size:number|null }
type LeaderboardRow = { participant_record_id:string; participant_id:string; full_name:string|null; graded_assignments:number; submitted_assignments:number; total_assignments:number; average_percentage:number|null; completion_percentage:number; assignment_points:number; attendance_points:number; bonus_points:number; total_points:number; rank:number|null }
type LeaderboardGroup = {staff_id:string;staff_name:string;group_number:number;group_label:string;participant_count:number}
type BulkPointRow = { code:string; participant:Participant|null; group:LeaderboardGroup|null; problem:string|null }
type PointAward = { id:string; points:number; category:string; reason:string; note:string|null; awarded_by:string; awarded_by_name:string; created_at:string; revoked_at:string|null; revoked_by?:string|null; revoked_reason?:string|null }

function LeaderboardRankBadge({rank}:{rank:number|null|undefined}){
  if(!rank)return <strong>—</strong>
  const tier=rank===1?'gold':rank===2?'silver':rank===3?'bronze':''
  if(!tier)return <strong>#{rank}</strong>
  const label=rank===1?'Gold':rank===2?'Silver':'Bronze'
  return <span className={'leaderboard-rank-badge '+tier} title={label+' position'}><span className="leaderboard-medal-mark" aria-hidden="true">◆</span><strong>#{rank}</strong><small>{label}</small></span>
}
type ParticipantAttendance = {
  id:string; status:'present'|'absent'; marked_at:string
  attendance_sessions?:{title:string;session_date:string;application_id:string}|{title:string;session_date:string;application_id:string}[]
}
type ExportField = {
  key:string; label:string; group:'participant'|'form'; position:number
  core?:'participant_id'|'full_name'|'email'|'whatsapp_phone'|'programme'|'status'|'joined_at'
  questionIds?:string[]
}

export default function ParticipantsPanel({organizationId,applications,role}:{organizationId:string;applications:Application[];role?:'owner'|'admin'|'reviewer'}) {
  const [tab,setTab]=useState<'participants'|'loan_interest'|'attendance'|'assignments'|'benefits'|'bonus_points'>('participants')
  const isAdmin=role==='owner'||role==='admin'
  const participantTabs:{key:'participants'|'loan_interest'|'attendance'|'assignments'|'benefits'|'bonus_points';label:string;adminOnly?:boolean}[]=[
    {key:'participants',label:'Participants'},
    {key:'loan_interest',label:'Loan Interest',adminOnly:true},
    {key:'attendance',label:'Attendance'},
    {key:'assignments',label:'Assignments'},
    {key:'bonus_points',label:'Award Bonus Points',adminOnly:true},
    {key:'benefits',label:'Benefits',adminOnly:true}
  ]
  const isProgrammeStaff=role==='reviewer'
  const canManagePoints=isAdmin
  const [participants,setParticipants]=useState<Participant[]>([])
  const [programmeStaff,setProgrammeStaff]=useState<{id:string;full_name:string|null}[]>([])
  const [participantStaff,setParticipantStaff]=useState<{participant_id:string;staff_id:string}[]>([])
  const [sessions,setSessions]=useState<Session[]>([])
  const [benefits,setBenefits]=useState<Benefit[]>([])
  const [assignments,setAssignments]=useState<Assignment[]>([])
  const [assignmentQuestions,setAssignmentQuestions]=useState<Record<string,AssignmentQuestion[]>>({})
  const [assignmentForm,setAssignmentForm]=useState({title:'',description:'',instructions:'',deadline:'',max_score:'100',pass_mark:'50'})
  const [questionForm,setQuestionForm]=useState({label:'',description:'',type:'long_text' as AssignmentQuestion['type'],required:true,options:['','']})
  const [editingQuestionId,setEditingQuestionId]=useState<string|null>(null)
  const [editQuestionForm,setEditQuestionForm]=useState({label:'',description:'',type:'long_text' as AssignmentQuestion['type'],required:true,options:['','']})
  const [selectedAssignment,setSelectedAssignment]=useState<Assignment|null>(null)
  const [editingAssignment,setEditingAssignment]=useState(false)
  const [editAssignmentForm,setEditAssignmentForm]=useState({title:'',description:'',instructions:'',deadline:'',max_score:'100',pass_mark:'50'})
  const [assignmentSubmissions,setAssignmentSubmissions]=useState<AssignmentSubmission[]>([])
  const [selectedSubmission,setSelectedSubmission]=useState<AssignmentSubmission|null>(null)
  const [submissionAnswers,setSubmissionAnswers]=useState<AssignmentAnswer[]>([])
  const [submissionDocuments,setSubmissionDocuments]=useState<AssignmentDocument[]>([])
  const [recoveredAssignmentFiles,setRecoveredAssignmentFiles]=useState<{storage_bucket:string;storage_path:string}[]>([])
  const [submissionReviewLoading,setSubmissionReviewLoading]=useState(false)
  const assignmentReviewScrollRef=useRef<HTMLDivElement>(null)
  const [gradeForm,setGradeForm]=useState({score:'',feedback:''})
  const [leaderboard,setLeaderboard]=useState<LeaderboardRow[]>([])
  const [leaderboardLoading,setLeaderboardLoading]=useState(false)
  const [assignmentSubmissionPage,setAssignmentSubmissionPage]=useState(1)
  const [assignmentSubmissionPageSize,setAssignmentSubmissionPageSize]=useState(20)
  const [selectedParticipant,setSelectedParticipant]=useState<Participant|null>(null)
  const participantProfileScrollRef=useRef<HTMLDivElement>(null)
  const [participantAttendance,setParticipantAttendance]=useState<ParticipantAttendance[]>([])
  const [participantAttendanceLoading,setParticipantAttendanceLoading]=useState(false)
  const [pointAwards,setPointAwards]=useState<PointAward[]>([])
  const [pointAwardsLoading,setPointAwardsLoading]=useState(false)
  const [pointAwardSaving,setPointAwardSaving]=useState(false)
  const [pointAwardForm,setPointAwardForm]=useState({points:'',category:'class_activity',reason:'Most active in class',note:''})
  const [bulkAwardIds,setBulkAwardIds]=useState('')
  const [bulkAwardForm,setBulkAwardForm]=useState({points:'',category:'first_on_call',reason:'First people on the call',note:''})
  const [bulkGroups,setBulkGroups]=useState<LeaderboardGroup[]>([])
  const [bulkGroupsLoading,setBulkGroupsLoading]=useState(false)
  const [bulkPreviewOpen,setBulkPreviewOpen]=useState(false)
  const [bulkAwardSaving,setBulkAwardSaving]=useState(false)
  const [bulkAwardReceipt,setBulkAwardReceipt]=useState<{count:number;total:number;points:number;category:string;reason:string}|null>(null)
  const [selectedSession,setSelectedSession]=useState<Session|null>(null)
  const [checkInSlugDraft,setCheckInSlugDraft]=useState('')
  const [editingCheckInSlug,setEditingCheckInSlug]=useState(false)
  const [sessionAttendance,setSessionAttendance]=useState<AttendanceRow[]>([])
  const [attendanceLoading,setAttendanceLoading]=useState(false)
  const [query,setQuery]=useState('')
  const [selectedParticipantIds,setSelectedParticipantIds]=useState<string[]>([])
  const [bulkStaffId,setBulkStaffId]=useState('')
  const [applicationFilter,setApplicationFilter]=useState(applications[0]?.id||'')
  const [statusFilter,setStatusFilter]=useState<'all'|'active'|'completed'>('active')
  const [staffFilter,setStaffFilter]=useState('all')
  const [participantPage,setParticipantPage]=useState(1)
  const [participantPageSize,setParticipantPageSize]=useState(50)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [sessionForm,setSessionForm]=useState({application_id:'',title:'',session_date:new Date().toISOString().slice(0,10)})
  const [benefitForm,setBenefitForm]=useState({application_id:'',name:'',description:'',distribution_date:''})
  const [ids,setIds]=useState('')
  const [saving,setSaving]=useState(false)
  const [exporting,setExporting]=useState(false)
  const [exportOpen,setExportOpen]=useState(false)
  const [exportLoadingFields,setExportLoadingFields]=useState(false)
  const [exportFieldQuery,setExportFieldQuery]=useState('')
  const [exportFields,setExportFields]=useState<ExportField[]>([])
  const [selectedExportFieldKeys,setSelectedExportFieldKeys]=useState<string[]>([])
  const [loanInterestParticipantIds,setLoanInterestParticipantIds]=useState<string[]>([])
  const [loanInterestLoading,setLoanInterestLoading]=useState(false)
  const [loanInterestQuery,setLoanInterestQuery]=useState('')
  const [loanInterestPage,setLoanInterestPage]=useState(1)
  const [loanInterestPageSize,setLoanInterestPageSize]=useState(50)

  const appName=(id:string)=>applications.find(a=>a.id===id)?.name||'Programme'
  const whatsappUrl=(value:string|null|undefined)=>{
    let digits=String(value||'').replace(/\D/g,'')
    if(!digits)return ''
    if(digits.startsWith('0'))digits='234'+digits.slice(1)
    return digits.length>=7?'https://wa.me/'+digits:''
  }
  const participantIdWhatsappUrl=(participant:Participant)=>{
    const base=whatsappUrl(participant.whatsapp_phone)
    if(!base)return ''
    const participantName=(participant.full_name||'Participant').trim()||'Participant'
    const registeredEmail=(participant.email||'').trim()
    const message=[
      'Hello '+participantName+',',
      '',
      'Your Participant ID for '+appName(participant.application_id)+' is: *'+participant.participant_id+'*',
      registeredEmail?'Registered email: *'+registeredEmail+'*':null,
      '',
      'Please keep these details safe. You will need them for programme activities, attendance, assignments and results.',
      '',
      'Thank you.'
    ].filter((line):line is string=>line!==null).join('\n')
    return base+'?text='+encodeURIComponent(message)
  }

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
    if(!selectedSubmission)return
    const previousBodyOverflow=document.body.style.overflow
    const previousHtmlOverflow=document.documentElement.style.overflow
    document.body.style.overflow='hidden'
    document.documentElement.style.overflow='hidden'
    const frame=window.requestAnimationFrame(()=>assignmentReviewScrollRef.current?.scrollTo({top:0,left:0,behavior:'auto'}))
    const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelectedSubmission(null)}
    window.addEventListener('keydown',onKeyDown)
    return()=>{
      window.cancelAnimationFrame(frame)
      window.removeEventListener('keydown',onKeyDown)
      document.body.style.overflow=previousBodyOverflow
      document.documentElement.style.overflow=previousHtmlOverflow
    }
  },[selectedSubmission?.id])

  useEffect(()=>{
    setApplicationFilter(current=>applications.some(a=>a.id===current)?current:(applications[0]?.id||''))
  },[applications])

  useEffect(()=>{
    setCheckInSlugDraft(selectedSession?.check_in_slug||'')
    setEditingCheckInSlug(false)
  },[selectedSession?.id,selectedSession?.check_in_slug])

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
        supabase.from('participants').select('id,applicant_id,participant_id,submission_id,application_id,status,joined_at,applicants(full_name,email,whatsapp_phone)').eq('organization_id',organizationId).in('status',['active','completed']).order('participant_id'),
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
        id:row.id,applicant_id:row.applicant_id,participant_id:row.participant_id,submission_id:row.submission_id||null,application_id:row.application_id,status:row.status,joined_at:row.joined_at,
        full_name:row.applicants?.full_name||null,email:row.applicants?.email||null,whatsapp_phone:row.applicants?.whatsapp_phone||null
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
    }catch(e){setError(friendlyErrorMessage(e,'Could not load programme participants.'))}finally{setLoading(false)}
  }

  useEffect(()=>{load()},[organizationId])

  async function loadLoanInterest(){
    if(!isAdmin||!applicationFilter){setLoanInterestParticipantIds([]);return}
    setLoanInterestLoading(true);setError('')
    try{
      const {data,error}=await supabase.rpc('get_loan_interest_participant_ids',{p_application_id:applicationFilter})
      if(error)throw error
      const rows=(Array.isArray(data)?data:[]) as Array<{participant_id:string}>
      setLoanInterestParticipantIds(rows.map(row=>row.participant_id))
    }catch(e){
      setLoanInterestParticipantIds([])
      setError(friendlyErrorMessage(e,'Could not load participants interested in a business loan.'))
    }finally{
      setLoanInterestLoading(false)
    }
  }

  useEffect(()=>{
    if(tab==='loan_interest'&&isAdmin)loadLoanInterest()
  },[tab,isAdmin,applicationFilter,participants])

  const staffById=useMemo(()=>new Map(programmeStaff.map(staff=>[staff.id,staff])),[programmeStaff])
  const staffByParticipant=useMemo(()=>{
    const map=new Map<string,{id:string;full_name:string|null}[]>()
    for(const assignment of participantStaff){
      const staff=staffById.get(assignment.staff_id)
      if(!staff)continue
      map.set(assignment.participant_id,[...(map.get(assignment.participant_id)||[]),staff])
    }
    for(const assigned of map.values())assigned.sort((a,b)=>(a.full_name||'').localeCompare(b.full_name||''))
    return map
  },[participantStaff,staffById])

  const filtered=useMemo(()=>participants.filter(p=>{
    if(p.status==='withdrawn')return false
    const assignedStaff=staffByParticipant.get(p.id)||[]
    const assignedNames=assignedStaff.map(staff=>staff.full_name||'Staff member')
    const text=[p.participant_id,p.full_name,p.email,appName(p.application_id),...assignedNames].filter(Boolean).join(' ').toLowerCase()
    const matchesStaff=staffFilter==='all'
      ||(staffFilter==='assigned'&&assignedStaff.length>0)
      ||(staffFilter==='unassigned'&&assignedStaff.length===0)
      ||assignedStaff.some(staff=>staff.id===staffFilter)
    return (!query.trim()||text.includes(query.trim().toLowerCase()))
      && (applicationFilter==='all'||p.application_id===applicationFilter)
      && (statusFilter==='all'||p.status===statusFilter)
      && matchesStaff
  }),[participants,query,applicationFilter,statusFilter,staffFilter,applications,staffByParticipant])

  const participantPageCount=Math.max(1,Math.ceil(filtered.length/participantPageSize))
  const currentParticipantPage=Math.min(participantPage,participantPageCount)
  const pagedParticipants=useMemo(()=>filtered.slice((currentParticipantPage-1)*participantPageSize,currentParticipantPage*participantPageSize),[filtered,currentParticipantPage,participantPageSize])

  const loanInterestedParticipants=useMemo<Participant[]>(()=>{
    const interestedIds=new Set<string>(loanInterestParticipantIds)
    return participants.filter(p=>p.status!=='withdrawn'&&p.application_id===applicationFilter&&interestedIds.has(p.id))
  },[participants,loanInterestParticipantIds,applicationFilter])
  const loanFiltered=useMemo<Participant[]>(()=>{
    const term=loanInterestQuery.trim().toLowerCase()
    if(!term)return loanInterestedParticipants
    return loanInterestedParticipants.filter(p=>{
      const text=[p.participant_id,p.full_name||'',p.email||'',p.whatsapp_phone||'',appName(p.application_id)].join(' ').toLowerCase()
      return text.includes(term)
    })
  },[loanInterestedParticipants,loanInterestQuery,applications])
  const loanInterestPageCount=Math.max(1,Math.ceil(loanFiltered.length/loanInterestPageSize))
  const currentLoanInterestPage=Math.min(loanInterestPage,loanInterestPageCount)
  const pagedLoanParticipants=useMemo<Participant[]>(()=>loanFiltered.slice((currentLoanInterestPage-1)*loanInterestPageSize,currentLoanInterestPage*loanInterestPageSize),[loanFiltered,currentLoanInterestPage,loanInterestPageSize])

  useEffect(()=>{setParticipantPage(1)},[query,applicationFilter,statusFilter,staffFilter])
  useEffect(()=>{if(participantPage>participantPageCount)setParticipantPage(participantPageCount)},[participantPage,participantPageCount])
  useEffect(()=>{setLoanInterestPage(1)},[loanInterestQuery,applicationFilter])
  useEffect(()=>{setSelectedParticipantIds([])},[applicationFilter])
  useEffect(()=>{setBulkPreviewOpen(false);setBulkAwardReceipt(null)},[applicationFilter])
  useEffect(()=>{
    if(tab!=='bonus_points'||!isAdmin||!applicationFilter)return
    let cancelled=false
    setBulkGroupsLoading(true);setBulkGroups([])
    void (async()=>{
      const {data,error}=await supabase.rpc('get_leaderboard_groups',{p_application_id:applicationFilter})
      if(cancelled)return
      if(error){setError(friendlyErrorMessage(error,'Could not load group assignments.'));setBulkGroups([])}
      else setBulkGroups((data||[]) as LeaderboardGroup[])
      setBulkGroupsLoading(false)
    })()
    return()=>{cancelled=true}
  },[tab,isAdmin,applicationFilter])
  useEffect(()=>{if(loanInterestPage>loanInterestPageCount)setLoanInterestPage(loanInterestPageCount)},[loanInterestPage,loanInterestPageCount])

  const scopedParticipants=useMemo(()=>participants.filter(p=>p.status!=='withdrawn'&&(!applicationFilter||p.application_id===applicationFilter)),[participants,applicationFilter])
  const scopedSessions=useMemo(()=>sessions.filter(s=>!applicationFilter||s.application_id===applicationFilter),[sessions,applicationFilter])
  const scopedBenefits=useMemo(()=>benefits.filter(b=>!applicationFilter||b.application_id===applicationFilter),[benefits,applicationFilter])
  const scopedAssignments=useMemo(()=>assignments.filter(a=>!applicationFilter||a.application_id===applicationFilter),[assignments,applicationFilter])
  const stats=useMemo(()=>({
    total:scopedParticipants.length,
    active:scopedParticipants.filter(p=>p.status==='active').length,
    completed:scopedParticipants.filter(p=>p.status==='completed').length
  }),[scopedParticipants])

  async function loadLeaderboard(applicationId:string){
    if(!applicationId||applicationId==='all'){setLeaderboard([]);return}
    setLeaderboardLoading(true)
    const {data,error}=await supabase.rpc('get_assignment_leaderboard',{p_application_id:applicationId})
    if(error)setError(friendlyErrorMessage(error));else setLeaderboard((data||[]) as LeaderboardRow[])
    setLeaderboardLoading(false)
  }

  function toggleParticipantSelection(participantId:string,checked:boolean){
    setSelectedParticipantIds(current=>checked?[...new Set([...current,participantId])]:current.filter(id=>id!==participantId))
  }
  function toggleAllVisibleParticipants(checked:boolean){
    const visibleIds=pagedParticipants.map(p=>p.id)
    setSelectedParticipantIds(current=>checked?[...new Set([...current,...visibleIds])]:current.filter(id=>!visibleIds.includes(id)))
  }
  function toggleAllVisibleLoanParticipants(checked:boolean){
    const visibleIds=pagedLoanParticipants.map(p=>p.id)
    setSelectedParticipantIds(current=>checked?[...new Set([...current,...visibleIds])]:current.filter(id=>!visibleIds.includes(id)))
  }
  function csvCell(value:unknown){
    const text=value===null||value===undefined?'':String(value)
    return '"'+text.replace(/"/g,'""')+'"'
  }

  function answerText(value:unknown):string{
    if(value===null||value===undefined)return ''
    if(Array.isArray(value))return value.map(answerText).filter(Boolean).join(', ')
    if(typeof value==='object'){
      try{return JSON.stringify(value)}
      catch{return String(value)}
    }
    return String(value)
  }

  function cleanExportLabel(value:unknown){
    return String(value||'Question').replace(/\s+/g,' ').trim()
  }

  function coreExportFields():ExportField[]{
    return [
      {key:'core:participant_id',label:'Participant ID',group:'participant',core:'participant_id',position:0},
      {key:'core:full_name',label:'Name',group:'participant',core:'full_name',position:1},
      {key:'core:email',label:'Email',group:'participant',core:'email',position:2},
      {key:'core:whatsapp_phone',label:'Phone / WhatsApp',group:'participant',core:'whatsapp_phone',position:3},
      {key:'core:programme',label:'Programme',group:'participant',core:'programme',position:4},
      {key:'core:status',label:'Status',group:'participant',core:'status',position:5},
      {key:'core:joined_at',label:'Joined Date',group:'participant',core:'joined_at',position:6}
    ]
  }

  async function openParticipantExport(){
    if(!isAdmin||!selectedParticipantIds.length)return
    setExportOpen(true);setExportLoadingFields(true);setExportFieldQuery('');setError('')
    const coreFields=coreExportFields()
    setExportFields(coreFields)
    setSelectedExportFieldKeys(['core:participant_id','core:full_name','core:email','core:whatsapp_phone'])
    try{
      const selectedRows=participants.filter(p=>selectedParticipantIds.includes(p.id))
      const submissionIds=selectedRows.map(p=>p.submission_id).filter((id):id is string=>Boolean(id))
      if(!submissionIds.length)return
      const formVersionIds:string[]=[]
      for(let i=0;i<submissionIds.length;i+=200){
        const {data,error}=await supabase.from('submissions').select('id,form_version_id').in('id',submissionIds.slice(i,i+200))
        if(error)throw error
        for(const row of data||[])if(row.form_version_id)formVersionIds.push(row.form_version_id)
      }
      const uniqueVersionIds=[...new Set(formVersionIds)]
      const questionRows:{id:string;label:string;type:string;position:number;form_version_id:string}[]=[]
      for(let i=0;i<uniqueVersionIds.length;i+=100){
        const {data,error}=await supabase.from('questions').select('id,label,type,position,form_version_id').in('form_version_id',uniqueVersionIds.slice(i,i+100)).order('position')
        if(error)throw error
        questionRows.push(...((data||[]) as {id:string;label:string;type:string;position:number;form_version_id:string}[]))
      }
      const grouped=new Map<string,ExportField>()
      for(const question of questionRows){
        const label=cleanExportLabel(question.label)
        const normalized=label.toLowerCase()
        const existing=grouped.get(normalized)
        if(existing){
          existing.questionIds=[...new Set([...(existing.questionIds||[]),question.id])]
          existing.position=Math.min(existing.position,Number(question.position)||0)
        }else{
          grouped.set(normalized,{
            key:'question:'+question.id,
            label,
            group:'form',
            position:Number(question.position)||0,
            questionIds:[question.id]
          })
        }
      }
      const formFields=[...grouped.values()].sort((a,b)=>a.position-b.position||a.label.localeCompare(b.label))
      setExportFields([...coreFields,...formFields])
    }catch(e){
      setError(friendlyErrorMessage(e,'Could not load export fields from the selected form.'))
    }finally{
      setExportLoadingFields(false)
    }
  }

  function toggleExportField(key:string,checked:boolean){
    setSelectedExportFieldKeys(current=>checked?[...new Set([...current,key])]:current.filter(item=>item!==key))
  }

  function participantCoreExportValue(participant:Participant,field:ExportField){
    if(field.core==='participant_id')return participant.participant_id
    if(field.core==='full_name')return participant.full_name||''
    if(field.core==='email')return participant.email||''
    if(field.core==='whatsapp_phone')return participant.whatsapp_phone||''
    if(field.core==='programme')return appName(participant.application_id)
    if(field.core==='status')return participant.status==='active'?'Active / Enrolled':participant.status
    if(field.core==='joined_at')return participant.joined_at?new Date(participant.joined_at).toLocaleDateString():''
    return ''
  }

  async function exportSelectedParticipants(){
    if(!isAdmin||!selectedParticipantIds.length||!selectedExportFieldKeys.length)return
    setExporting(true);setError('');setNotice('')
    try{
      const selectedRows=participants
        .filter(p=>selectedParticipantIds.includes(p.id))
        .sort((a,b)=>a.participant_id.localeCompare(b.participant_id))
      const chosenFields=exportFields.filter(field=>selectedExportFieldKeys.includes(field.key))
      const formFields=chosenFields.filter(field=>field.group==='form')
      const chosenQuestionIds=[...new Set(formFields.flatMap(field=>field.questionIds||[]))]
      const questionFieldById=new Map<string,string>()
      for(const field of formFields)for(const questionId of field.questionIds||[])questionFieldById.set(questionId,field.key)
      const submissionIds=selectedRows.map(p=>p.submission_id).filter((id):id is string=>Boolean(id))
      const answerBySubmission=new Map<string,Map<string,string>>()
      if(submissionIds.length&&chosenQuestionIds.length){
        for(let si=0;si<submissionIds.length;si+=200){
          for(let qi=0;qi<chosenQuestionIds.length;qi+=200){
            const {data,error}=await supabase.from('answers')
              .select('submission_id,question_id,value')
              .in('submission_id',submissionIds.slice(si,si+200))
              .in('question_id',chosenQuestionIds.slice(qi,qi+200))
            if(error)throw error
            for(const answer of data||[]){
              const fieldKey=questionFieldById.get(answer.question_id)
              if(!fieldKey)continue
              const submissionMap=answerBySubmission.get(answer.submission_id)||new Map<string,string>()
              if(!submissionMap.has(fieldKey))submissionMap.set(fieldKey,answerText(answer.value))
              answerBySubmission.set(answer.submission_id,submissionMap)
            }
          }
        }
      }
      const csv=[
        chosenFields.map(field=>csvCell(field.label)).join(','),
        ...selectedRows.map(participant=>chosenFields.map(field=>{
          if(field.group==='participant')return csvCell(participantCoreExportValue(participant,field))
          if(!participant.submission_id)return csvCell('')
          return csvCell(answerBySubmission.get(participant.submission_id)?.get(field.key)||'')
        }).join(','))
      ].join('\r\n')
      const blob=new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})
      const url=URL.createObjectURL(blob)
      const link=document.createElement('a')
      const selectedApplicationIds=[...new Set(selectedRows.map(row=>row.application_id))]
      const programme=selectedApplicationIds.length===1?(applications.find(a=>a.id===selectedApplicationIds[0])?.name||'participants'):'selected-participants'
      const safeName=programme.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||'participants'
      link.href=url
      link.download=safeName+'-export-'+new Date().toISOString().slice(0,10)+'.csv'
      document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)
      const count=selectedRows.length
      setExportOpen(false)
      setNotice(count+' selected participant'+(count===1?'':'s')+' exported with '+chosenFields.length+' field'+(chosenFields.length===1?'':'s')+'.')
    }catch(e){
      setError(friendlyErrorMessage(e,'Could not export the selected participant data.'))
    }finally{
      setExporting(false)
    }
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
    }catch(e){setError(friendlyErrorMessage(e,'Could not assign selected participants.'))}finally{setSaving(false)}
  }

  async function bulkUnassignProgrammeStaff(){
    if(!isAdmin||!bulkStaffId||!selectedParticipantIds.length)return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.rpc('bulk_set_participant_staff_assignment',{p_participant_ids:selectedParticipantIds,p_staff_id:bulkStaffId,p_assigned:false})
      if(error)throw error
      setParticipantStaff(current=>current.filter(x=>!(x.staff_id===bulkStaffId&&selectedParticipantIds.includes(x.participant_id))))
      const removed=typeof data==='number'?data:0
      const selectedCount=selectedParticipantIds.length
      setSelectedParticipantIds([]);setBulkStaffId('')
      setNotice(removed>0
        ? removed+' staff assignment'+(removed===1?'':'s')+' removed.'
        : 'No matching staff assignments were found among the '+selectedCount+' selected participant'+(selectedCount===1?'':'s')+'.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not unassign selected participants.'))}finally{setSaving(false)}
  }

  async function updateParticipantStaffAssignment(participantId:string,staffId:string,assigned:boolean){
    if(!isAdmin)return
    setSaving(true);setError('');setNotice('')
    try{
      const {error}=await supabase.rpc('set_participant_staff_assignment',{p_participant_id:participantId,p_staff_id:staffId,p_assigned:assigned})
      if(error)throw error
      setParticipantStaff(current=>assigned?[...current.filter(x=>!(x.participant_id===participantId&&x.staff_id===staffId)),{participant_id:participantId,staff_id:staffId}]:current.filter(x=>!(x.participant_id===participantId&&x.staff_id===staffId)))
      setNotice(assigned?'Staff member assigned to participant.':'Staff assignment removed.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not update staff assignment.'))}finally{setSaving(false)}
  }

  async function openParticipant(participant:Participant){
    setSelectedParticipant({...participant,trade:undefined});setParticipantAttendance([]);setPointAwards([]);setParticipantAttendanceLoading(true);setPointAwardsLoading(canManagePoints);setError('');loadLeaderboard(participant.application_id)
    try{
      const attendancePromise=supabase.from('attendance_records')
        .select('id,status,marked_at,attendance_sessions!inner(title,session_date,application_id)')
        .eq('participant_id',participant.id)
        .eq('attendance_sessions.application_id',participant.application_id)
        .order('marked_at',{ascending:false})

      const tradePromise=participant.submission_id
        ? supabase.from('answers')
          .select('value,questions!inner(label)')
          .eq('submission_id',participant.submission_id)
          .eq('questions.label','What is your trade?')
          .limit(1)
        : Promise.resolve({data:[],error:null})

      const awardsPromise=canManagePoints
        ? supabase.from('participant_point_awards')
          .select('id,points,category,reason,note,awarded_by,awarded_by_name,created_at,revoked_at,revoked_by,revoked_reason')
          .eq('participant_id',participant.id)
          .order('created_at',{ascending:false})
        : Promise.resolve({data:[],error:null})

      const [attendanceResult,tradeResult,awardsResult]=await Promise.all([attendancePromise,tradePromise,awardsPromise])
      if(attendanceResult.error)throw attendanceResult.error
      if(tradeResult.error)throw tradeResult.error
      if(awardsResult.error)throw awardsResult.error

      setParticipantAttendance((attendanceResult.data||[]) as ParticipantAttendance[])
      setPointAwards((awardsResult.data||[]) as PointAward[])
      const tradeValue=answerText((tradeResult.data?.[0] as {value?:unknown}|undefined)?.value).trim()
      setSelectedParticipant(current=>current?.id===participant.id?{...current,trade:tradeValue||null}:current)
    }catch(e){
      setSelectedParticipant(current=>current?.id===participant.id?{...current,trade:null}:current)
      setError(friendlyErrorMessage(e,'Could not load participant profile details.'))
    }finally{setParticipantAttendanceLoading(false);setPointAwardsLoading(false)}
  }

  const pointCategoryLabel=(value:string)=>({
    class_activity:'Most active in class',
    group_activity:'Most active in group',
    participation:'Participation',
    leadership:'Leadership',
    helpfulness:'Helpfulness / support',
    first_on_call:'First people on the call',
    other:'Other'
  } as Record<string,string>)[value]||'Bonus'

  const bulkPointRows=useMemo<BulkPointRow[]>(()=>{
    const tokens=bulkAwardIds.split(/[\s,;]+/).map(token=>token.trim().toUpperCase()).filter(Boolean)
    const participantIndex=new Map(participants.filter(p=>p.application_id===applicationFilter).map(p=>[p.participant_id.trim().toUpperCase(),p]))
    const seen=new Set<string>()
    return tokens.map(code=>{
      const participant=participantIndex.get(code)||null
      const matches=participant?bulkGroups.filter(group=>group.group_number>=1&&group.group_number<=5&&participantStaff.some(assignment=>assignment.participant_id===participant.id&&assignment.staff_id===group.staff_id)):[]
      const group=matches.length===1?matches[0]:null
      let problem:string|null=null
      if(seen.has(code))problem='Duplicate Participant ID'
      else if(!participant)problem='Not found in the selected programme'
      else if(participant.status!=='active')problem='Participant is not active'
      else if(bulkAwardForm.category==='first_on_call'&&matches.length!==1)problem='Must belong to exactly one of Groups 1–5'
      seen.add(code)
      return {code,participant,group,problem}
    })
  },[bulkAwardIds,participants,applicationFilter,participantStaff,bulkGroups,bulkAwardForm.category])

  const bulkGroupCounts=useMemo(()=>bulkGroups.filter(group=>group.group_number>=1&&group.group_number<=5)
    .sort((a,b)=>a.group_number-b.group_number)
    .map(group=>({...group,selected:bulkPointRows.filter(row=>row.group?.staff_id===group.staff_id&&!row.problem).length})),[bulkGroups,bulkPointRows])
  const bulkLimitProblem=bulkAwardForm.category==='first_on_call'
    ? bulkGroupCounts.find(group=>group.selected>0&&group.selected!==5)
    :undefined
  const bulkInvalidCount=bulkPointRows.filter(row=>row.problem).length
  const bulkPoints=Number(bulkAwardForm.points)
  const bulkCanAward=isAdmin&&!bulkGroupsLoading&&bulkPointRows.length>0&&bulkPointRows.length<=100
    &&(bulkAwardForm.category!=='first_on_call'||bulkPointRows.length<=25)
    &&bulkInvalidCount===0&&!bulkLimitProblem
    &&Number.isFinite(bulkPoints)&&bulkPoints>0&&bulkPoints<=10000
    &&bulkAwardForm.reason.trim().length>=2&&bulkAwardForm.reason.trim().length<=200
    &&bulkAwardForm.note.trim().length<=1000

  async function awardBulkParticipantPoints(){
    if(!bulkCanAward||bulkAwardSaving||!bulkPreviewOpen||!applicationFilter)return
    const selectedCodes=bulkPointRows.map(row=>row.code)
    const requestId=crypto.randomUUID()
    setBulkAwardSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.rpc('award_participant_points_bulk',{
        p_application_id:applicationFilter,p_participant_codes:selectedCodes,
        p_points:Number(bulkAwardForm.points),p_category:bulkAwardForm.category,
        p_reason:bulkAwardForm.reason.trim(),p_note:bulkAwardForm.note.trim()||null,
        p_request_id:requestId
      })
      if(error)throw error
      const result=data as {awarded:number;total_points:number;points_each:number}
      if(result.awarded!==selectedCodes.length)throw new Error('Bulk award receipt did not match the selected participants. Check award history before retrying.')
      setBulkAwardReceipt({count:result.awarded,total:result.total_points,points:result.points_each,category:bulkAwardForm.category,reason:bulkAwardForm.reason.trim()})
      setBulkAwardIds('');setBulkPreviewOpen(false)
      await loadLeaderboard(applicationFilter)
      setNotice('Successfully awarded bonus points to '+result.awarded+' participants.')
    }catch(e){setBulkPreviewOpen(false);setError(friendlyErrorMessage(e,'Could not award points. No partial batch should be saved.'))}
    finally{setBulkAwardSaving(false)}
  }

  async function awardParticipantPoints(e:FormEvent){
    e.preventDefault()
    if(!canManagePoints||!selectedParticipant||pointAwardSaving)return
    const points=Number(pointAwardForm.points)
    const reason=pointAwardForm.reason.trim()
    if(!Number.isFinite(points)||points<=0){setError('Enter bonus points greater than 0.');return}
    if(!reason){setError('Add a reason for this bonus award.');return}
    setPointAwardSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.rpc('award_participant_points',{
        p_participant_id:selectedParticipant.id,
        p_points:points,
        p_category:pointAwardForm.category,
        p_reason:reason,
        p_note:pointAwardForm.note.trim()||null
      })
      if(error)throw error
      const award=data as PointAward
      setPointAwards(current=>[award,...current])
      setPointAwardForm({points:'',category:'class_activity',reason:'Most active in class',note:''})
      await loadLeaderboard(selectedParticipant.application_id)
      setNotice(points+' bonus point'+(points===1?'':'s')+' awarded to '+(selectedParticipant.full_name||selectedParticipant.participant_id)+'.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not award bonus points.'))}
    finally{setPointAwardSaving(false)}
  }

  async function revokePointAward(award:PointAward){
    if(!canManagePoints||award.revoked_at||pointAwardSaving)return
    if(!window.confirm('Revoke this '+Number(award.points).toFixed(0)+' point award? The history will remain visible.'))return
    setPointAwardSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.rpc('revoke_participant_point_award',{p_award_id:award.id,p_reason:'Revoked from participant profile'})
      if(error)throw error
      const result=data as {revoked_at?:string;revoked_by?:string;revoked_reason?:string}
      setPointAwards(current=>current.map(item=>item.id===award.id?{...item,revoked_at:result.revoked_at||new Date().toISOString(),revoked_by:result.revoked_by||null,revoked_reason:result.revoked_reason||null}:item))
      if(selectedParticipant)await loadLeaderboard(selectedParticipant.application_id)
      setNotice('Bonus point award revoked.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not revoke bonus points.'))}
    finally{setPointAwardSaving(false)}
  }

  async function updateParticipantStatus(participantId:string,status:'active'|'completed'){
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('participants').update({status,updated_at:new Date().toISOString()}).eq('id',participantId).select('id,participant_id,application_id,status,joined_at').single()
      if(error)throw error
      setParticipants(current=>current.map(p=>p.id===participantId?{...p,...data}:p))
      setSelectedParticipant(current=>current?.id===participantId?{...current,...data}:current)
      setNotice(status==='active'?'Participant enrolled.':'Participant marked completed.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not update participant status.'))}finally{setSaving(false)}
  }

  async function withdrawParticipant(participant:Participant){
    if(!isAdmin||!participant.submission_id||saving)return
    const confirmed=window.confirm(
      'Withdraw '+(participant.full_name||participant.participant_id)+'? They will be removed from Participants and their application will return to Screening/Review as Rejected. Attendance and assignment history will be preserved.'
    )
    if(!confirmed)return
    setSaving(true);setError('');setNotice('')
    try{
      const {error}=await supabase.rpc('set_submission_decision',{
        p_submission_id:participant.submission_id,
        p_decision:'rejected'
      })
      if(error)throw error
      setParticipants(current=>current.map(p=>p.id===participant.id?{...p,status:'withdrawn'}:p))
      setSelectedParticipantIds(current=>current.filter(id=>id!==participant.id))
      setSelectedParticipant(current=>current?.id===participant.id?null:current)
      setNotice('Participant withdrawn and returned to Screening/Review as Rejected. Their participant history was preserved.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not withdraw this participant.'))}finally{setSaving(false)}
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
    }catch(e){setError(friendlyErrorMessage(e,'Could not load session attendance.'))}finally{setAttendanceLoading(false)}
  }

  async function createSession(e:FormEvent){
    e.preventDefault();if(!sessionForm.application_id||!sessionForm.title.trim()||!sessionForm.session_date)return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.rpc('create_attendance_session',{
        p_application_id:sessionForm.application_id,
        p_title:sessionForm.title.trim(),
        p_session_date:sessionForm.session_date
      })
      if(error)throw error
      const row=(Array.isArray(data)?data[0]:data) as Session|null
      if(!row?.id)throw new Error('Attendance session was not returned by the server.')
      setSessions(x=>[row,...x]);setSelectedSession(row);setSessionAttendance([])
      setSessionForm(current=>({...current,title:''}))
      setIds('');setNotice('Attendance session created.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not create session.'))}finally{setSaving(false)}
  }

  async function saveCheckInSlug(){
    if(!selectedSession)return
    const normalized=checkInSlugDraft.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
    if(normalized.length<3){setError('Attendance link name must be at least 3 characters.');return}
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.rpc('update_attendance_checkin_slug',{
        p_session_id:selectedSession.id,
        p_slug:normalized
      })
      if(error)throw error
      const row=(Array.isArray(data)?data[0]:data) as Session|null
      if(!row?.id)throw new Error('Attendance link was not returned by the server.')
      setSelectedSession(row)
      setSessions(current=>current.map(session=>session.id===row.id?row:session))
      setCheckInSlugDraft(row.check_in_slug)
      setEditingCheckInSlug(false)
      setNotice('Attendance link updated.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not update attendance link.'))}finally{setSaving(false)}
  }

  async function setCheckInOpen(open:boolean){
    if(!selectedSession)return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('attendance_sessions').update({check_in_open:open,check_in_opened_at:open?new Date().toISOString():null}).eq('id',selectedSession.id).select('id,application_id,title,session_date,check_in_slug,check_in_open,check_in_opened_at').single()
      if(error)throw error
      setSessions(x=>x.map(s=>s.id===data.id?data as Session:s));setSelectedSession(data as Session)
      setNotice(open?'Self check-in is open. Share the check-in link with participants.':'Self check-in closed. Manual attendance remains available.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not update self check-in.'))}finally{setSaving(false)}
  }

  async function deleteAttendanceSession(){
    if(!isAdmin||!selectedSession||saving)return
    const session=selectedSession
    const confirmed=window.confirm(
      'Delete "'+session.title+'"? This permanently removes this attendance session and all attendance records linked to it. Any attendance points from this session will also be removed from the leaderboard.'
    )
    if(!confirmed)return
    setSaving(true);setError('');setNotice('')
    try{
      const {error}=await supabase.from('attendance_sessions').delete().eq('id',session.id)
      if(error)throw error
      setSessions(current=>current.filter(item=>item.id!==session.id))
      setSelectedSession(null)
      setSessionAttendance([])
      await load()
      if(selectedAssignment)await loadLeaderboard(selectedAssignment.application_id)
      setNotice('Attendance session deleted.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not delete the attendance session.'))}
    finally{setSaving(false)}
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
    }catch(e){setError(friendlyErrorMessage(e,'Could not import attendance.'))}finally{setSaving(false)}
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
    }catch(e){setError(friendlyErrorMessage(e,'Could not update attendance.'))}finally{setSaving(false)}
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
    }catch(e){setError(friendlyErrorMessage(e,'Could not create distribution.'))}finally{setSaving(false)}
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
        deadline:assignmentDeadlineToISO(assignmentForm.deadline),max_score:Number(assignmentForm.max_score)||100,pass_mark:Number(assignmentForm.pass_mark)||50,public_slug:slug
      }).select('id,application_id,title,description,instructions,deadline,max_score,pass_mark,status,public_slug,results_released,results_released_at,created_at').single()
      if(error)throw error
      setAssignments(x=>[data as Assignment,...x]);setSelectedAssignment(data as Assignment);setAssignmentQuestions(x=>({...x,[data.id]:[]}))
      setAssignmentForm({title:'',description:'',instructions:'',deadline:'',max_score:'100',pass_mark:'50'});setNotice('Assignment draft created.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not create assignment.'))}finally{setSaving(false)}
  }
  async function openAssignment(assignment:Assignment){
    setSelectedAssignment(assignment);setSelectedSubmission(null);setRecoveredAssignmentFiles([]);setAssignmentSubmissionPage(1);setEditingAssignment(false);setEditAssignmentForm({title:assignment.title,description:assignment.description||'',instructions:assignment.instructions||'',deadline:assignmentDeadlineForInput(assignment.deadline),max_score:String(assignment.max_score),pass_mark:String(assignment.pass_mark)});setError('')
    const [questions,submissions]=await Promise.all([
      supabase.from('assignment_questions').select('id,assignment_id,type,label,description,required,position,config').eq('assignment_id',assignment.id).order('position'),
      supabase.from('assignment_submissions').select('id,assignment_id,participant_id,status,submitted_at,score,feedback,graded_at,participants(participant_id,applicants(full_name,email))').eq('assignment_id',assignment.id).order('submitted_at',{ascending:false})
    ])
    if(questions.error){setError(questions.error.message);return}
    if(submissions.error){setError(submissions.error.message);return}
    setAssignmentQuestions(x=>({...x,[assignment.id]:(questions.data||[]) as AssignmentQuestion[]}))
    setAssignmentSubmissions((submissions.data||[]) as unknown as AssignmentSubmission[])
    if(isAdmin&&assignment.title.startsWith('[Recovered]')){
      const {data:recoveredFiles,error:recoveredFilesError}=await supabase.rpc('list_assignment_storage_paths',{p_assignment_id:assignment.id})
      if(recoveredFilesError){setError(recoveredFilesError.message);return}
      setRecoveredAssignmentFiles((recoveredFiles||[]).map((row:any)=>({storage_bucket:String(row.storage_bucket||''),storage_path:String(row.storage_path||'')})).filter((row:any)=>row.storage_bucket&&row.storage_path))
    }
  }
  async function updateAssignment(e:FormEvent){
    e.preventDefault();if(!selectedAssignment||!editAssignmentForm.title.trim())return
    setSaving(true);setError('');setNotice('')
    try{
      const maxScore=Number(editAssignmentForm.max_score)
      if(!Number.isFinite(maxScore)||maxScore<=0)throw new Error('Maximum score must be greater than zero.')
      const passMark=Number(editAssignmentForm.pass_mark);if(!Number.isFinite(passMark)||passMark<0||passMark>maxScore)throw new Error('Pass mark must be between 0 and the maximum score.');const patch={title:editAssignmentForm.title.trim(),description:editAssignmentForm.description.trim()||null,instructions:editAssignmentForm.instructions.trim()||null,deadline:assignmentDeadlineToISO(editAssignmentForm.deadline),max_score:maxScore,pass_mark:passMark,updated_at:new Date().toISOString()}
      const {data,error}=await supabase.from('assignments').update(patch).eq('id',selectedAssignment.id).select('id,application_id,title,description,instructions,deadline,max_score,pass_mark,status,public_slug,results_released,results_released_at,created_at').single()
      if(error)throw error
      setSelectedAssignment(data as Assignment);setAssignments(x=>x.map(a=>a.id===data.id?data as Assignment:a));setEditingAssignment(false);setNotice('Assignment updated.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not update assignment.'))}finally{setSaving(false)}
  }
  async function deleteAssignment(){
    if(!selectedAssignment||!window.confirm('Delete "'+selectedAssignment.title+'"? This permanently removes its questions, submissions, grades and uploaded files.'))return
    setSaving(true);setError('');setNotice('')
    try{
      const {data:storageRows,error:storageListError}=await supabase.rpc('list_assignment_storage_paths',{p_assignment_id:selectedAssignment.id})
      if(storageListError)throw storageListError
      const byBucket=new Map<string,string[]>()
      for(const row of storageRows||[]){
        const bucket=String(row.storage_bucket||'')
        const path=String(row.storage_path||'')
        if(!bucket||!path)continue
        byBucket.set(bucket,[...(byBucket.get(bucket)||[]),path])
      }
      for(const [bucket,paths] of byBucket){
        for(let i=0;i<paths.length;i+=100){
          const {error:removeError}=await supabase.storage.from(bucket).remove(paths.slice(i,i+100))
          if(removeError)throw new Error('Private file cleanup failed. Assignment data was not deleted. '+removeError.message)
        }
      }
      const {data:deleteResult,error}=await supabase.rpc('delete_assignment',{p_assignment_id:selectedAssignment.id})
      if(error)throw error
      if(!deleteResult?.deleted)throw new Error('Assignment deletion was not confirmed by the server.')
      setAssignments(x=>x.filter(a=>a.id!==selectedAssignment.id));setSelectedAssignment(null);setAssignmentSubmissions([]);setLeaderboard([]);setNotice('Assignment deleted.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not delete assignment.'))}finally{setSaving(false)}
  }

  async function openAssignmentSubmission(submission:AssignmentSubmission){
    setSelectedSubmission(submission);setSubmissionAnswers([]);setSubmissionDocuments([]);setSubmissionReviewLoading(true);setGradeForm({score:submission.score===null?'':String(submission.score),feedback:submission.feedback||''});setError('')
    try{
      const [answers,documents]=await Promise.all([
        supabase.from('assignment_answers').select('id,question_id,value,assignment_questions(label,type,position)').eq('submission_id',submission.id),
        supabase.from('assignment_documents').select('id,question_id,storage_bucket,storage_path,original_name,mime_type,file_size').eq('submission_id',submission.id)
      ])
      if(answers.error)throw answers.error
      if(documents.error)throw documents.error
      setSubmissionAnswers((answers.data||[]) as unknown as AssignmentAnswer[]);setSubmissionDocuments((documents.data||[]) as AssignmentDocument[])
    }catch(e){setError(friendlyErrorMessage(e,'Could not load this submission.'))}finally{setSubmissionReviewLoading(false)}
  }
  async function gradeSubmission(e:FormEvent){
    e.preventDefault();if(isProgrammeStaff||!selectedSubmission||!selectedAssignment)return
    setSaving(true);setError('');setNotice('')
    try{
      const score=Number(gradeForm.score)
      if(!Number.isFinite(score)||score<0||score>selectedAssignment.max_score)throw new Error('Score must be between 0 and '+selectedAssignment.max_score+'.')
      const {data,error}=await supabase.rpc('grade_assignment_submission',{p_submission_id:selectedSubmission.id,p_score:score,p_feedback:gradeForm.feedback})
      if(error)throw error
      const updated={...selectedSubmission,score,status:'graded' as const,feedback:gradeForm.feedback||null,graded_at:data.graded_at}
      setSelectedSubmission(updated);setAssignmentSubmissions(x=>x.map(s=>s.id===updated.id?updated:s));setNotice('Grade saved.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not save grade.'))}finally{setSaving(false)}
  }
  async function openAssignmentDocument(doc:AssignmentDocument){
    const {data,error}=await supabase.storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path,300)
    if(error||!data?.signedUrl){setError(error?.message||'Could not open file.');return}
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }
  async function openRecoveredAssignmentFile(file:{storage_bucket:string;storage_path:string}){
    const {data,error}=await supabase.storage.from(file.storage_bucket).createSignedUrl(file.storage_path,300)
    if(error||!data?.signedUrl){setError(error?.message||'Could not open recovered file.');return}
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }
  function recoveredAssignmentFileName(path:string){
    const encoded=path.split('/').pop()||'Recovered file'
    const decoded=decodeURIComponent(encoded)
    return decoded.replace(/^[0-9a-f-]{36}-[0-9a-f-]{36}-/i,'')||decoded
  }
  async function addAssignmentQuestion(e:FormEvent){
    e.preventDefault();if(!selectedAssignment||(!questionForm.label.trim()&&questionForm.type!=='instruction')||(selectedAssignment.status!=='draft'&&!(editingAssignment&&assignmentSubmissions.length===0)))return
    setSaving(true);setError('')
    try{
      if(questionForm.type==='instruction'&&!questionForm.description.trim())throw new Error('Enter the reading passage or instructions.')
      const position=(assignmentQuestions[selectedAssignment.id]||[]).length
      const choiceType=questionForm.type==='single_choice'||questionForm.type==='multiple_choice'
      const options=questionForm.options.map(option=>option.trim()).filter(Boolean)
      if(choiceType&&options.length<2)throw new Error('Add at least two answer options for a choice question.')
      const {data,error}=await supabase.from('assignment_questions').insert({assignment_id:selectedAssignment.id,type:questionForm.type==='instruction'?'long_text':questionForm.type,label:questionForm.label.trim()||'Reading passage',description:questionForm.type==='instruction'?questionForm.description.trim():null,required:questionForm.type==='instruction'?false:questionForm.required,position,config:questionForm.type==='instruction'?{display_only:true}:choiceType?{options}:{}}).select('id,assignment_id,type,label,description,required,position,config').single()
      if(error)throw error
      setAssignmentQuestions(x=>({...x,[selectedAssignment.id]:[...(x[selectedAssignment.id]||[]),data as AssignmentQuestion]}));setQuestionForm({label:'',description:'',type:'long_text',required:true,options:['','']})
    }catch(e){setError(friendlyErrorMessage(e,'Could not add question.'))}finally{setSaving(false)}
  }
  function startEditQuestion(q:AssignmentQuestion){
    setEditingQuestionId(q.id)
    setEditQuestionForm({label:q.label,description:q.description||'',type:isInstructionBlock(q)?'instruction':q.type,required:q.required,options:Array.isArray(q.config?.options)&&q.config.options.length?q.config.options:['','']})
  }
  async function saveAssignmentQuestion(e:FormEvent){
    e.preventDefault();if(!selectedAssignment||!editingQuestionId||(!editQuestionForm.label.trim()&&editQuestionForm.type!=='instruction'))return
    setSaving(true);setError('');setNotice('')
    try{
      const currentQuestion=(assignmentQuestions[selectedAssignment.id]||[]).find(q=>q.id===editingQuestionId)
      if(assignmentSubmissions.length>0&&currentQuestion&&isInstructionBlock(currentQuestion)!==(editQuestionForm.type==='instruction'))throw new Error('Cannot change a question to or from an instruction after participants have submitted.')
      if(editQuestionForm.type==='instruction'&&!editQuestionForm.description.trim())throw new Error('Enter the reading passage or instructions.')
      const choiceType=editQuestionForm.type==='single_choice'||editQuestionForm.type==='multiple_choice'
      const options=editQuestionForm.options.map(option=>option.trim()).filter(Boolean)
      if(choiceType&&options.length<2)throw new Error('Add at least two answer options for a choice question.')
      const {data,error}=await supabase.from('assignment_questions').update({label:editQuestionForm.label.trim()||'Reading passage',description:editQuestionForm.type==='instruction'?editQuestionForm.description.trim():null,type:editQuestionForm.type==='instruction'?'long_text':editQuestionForm.type,required:editQuestionForm.type==='instruction'?false:editQuestionForm.required,config:editQuestionForm.type==='instruction'?{display_only:true}:choiceType?{options}:{},updated_at:new Date().toISOString()}).eq('id',editingQuestionId).select('id,assignment_id,type,label,description,required,position,config').single()
      if(error)throw error
      setAssignmentQuestions(x=>({...x,[selectedAssignment.id]:(x[selectedAssignment.id]||[]).map(q=>q.id===data.id?data as AssignmentQuestion:q)}));setEditingQuestionId(null);setNotice('Question updated.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not update question.'))}finally{setSaving(false)}
  }
  async function deleteAssignmentQuestion(q:AssignmentQuestion){
    if(!selectedAssignment||!window.confirm('Delete this question?'))return
    setSaving(true);setError('');setNotice('')
    try{
      const {error}=await supabase.from('assignment_questions').delete().eq('id',q.id)
      if(error)throw error
      setAssignmentQuestions(x=>({...x,[selectedAssignment.id]:(x[selectedAssignment.id]||[]).filter(item=>item.id!==q.id)}));if(editingQuestionId===q.id)setEditingQuestionId(null);setNotice('Question deleted.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not delete question.'))}finally{setSaving(false)}
  }

  async function setResultsReleased(released:boolean){
    if(!selectedAssignment)return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('assignments').update({results_released:released,results_released_at:released?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq('id',selectedAssignment.id).select('id,application_id,title,description,instructions,deadline,max_score,pass_mark,status,public_slug,results_released,results_released_at,created_at').single()
      if(error)throw error
      setAssignments(x=>x.map(a=>a.id===data.id?data as Assignment:a));setSelectedAssignment(data as Assignment);setNotice(released?'Results released. Participants can now check their results.':'Results hidden from participants.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not update results visibility.'))}finally{setSaving(false)}
  }

  async function setAssignmentStatus(status:Assignment['status']){
    if(!selectedAssignment)return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('assignments').update({status,published_at:status==='published'?new Date().toISOString():undefined,updated_at:new Date().toISOString()}).eq('id',selectedAssignment.id).select('id,application_id,title,description,instructions,deadline,max_score,pass_mark,status,public_slug,results_released,results_released_at,created_at').single()
      if(error)throw error
      setAssignments(x=>x.map(a=>a.id===data.id?data as Assignment:a));setSelectedAssignment(data as Assignment);setNotice(status==='published'?'Assignment published. The participant link will be activated in Phase 2.':status==='closed'?'Assignment closed.':'Assignment returned to draft.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not update assignment.'))}finally{setSaving(false)}
  }

  const attendanceRoster=useMemo(()=>{
    if(!selectedSession)return []
    const recordsByParticipant=new Map(sessionAttendance.map(record=>[record.participant_id,record]))
    const statusOrder:Record<'present'|'absent'|'not_marked',number>={present:0,absent:1,not_marked:2}
    return participants
      .filter(participant=>participant.application_id===selectedSession.application_id&&participant.status!=='withdrawn')
      .map(participant=>{
        const record=recordsByParticipant.get(participant.id)||null
        const status=(record?.status||'not_marked') as 'present'|'absent'|'not_marked'
        return {participant,record,status}
      })
      .sort((a,b)=>statusOrder[a.status]-statusOrder[b.status]||(a.participant.full_name||a.participant.participant_id).localeCompare(b.participant.full_name||b.participant.participant_id))
  },[selectedSession,sessionAttendance,participants])

  const attendanceSummary=useMemo(()=>{
    const total=attendanceRoster.length
    const present=attendanceRoster.filter(row=>row.status==='present').length
    const absent=attendanceRoster.filter(row=>row.status==='absent').length
    const notMarked=attendanceRoster.filter(row=>row.status==='not_marked').length
    const rate=total?Math.round((present/total)*100):0
    return {total,present,absent,notMarked,rate}
  },[attendanceRoster])

  const assignmentRoster=useMemo(()=>{
    if(!selectedAssignment)return []
    const submissionsByParticipant=new Map(assignmentSubmissions.map(submission=>[submission.participant_id,submission]))
    const statusOrder:Record<'submitted'|'graded'|'not_submitted',number>={submitted:0,graded:1,not_submitted:2}
    return participants
      .filter(participant=>participant.application_id===selectedAssignment.application_id&&participant.status!=='withdrawn')
      .map(participant=>{
        const submission=submissionsByParticipant.get(participant.id)||null
        const status=(submission?.status||'not_submitted') as 'submitted'|'graded'|'not_submitted'
        return {participant,submission,status}
      })
      .sort((a,b)=>statusOrder[a.status]-statusOrder[b.status]||(a.participant.full_name||a.participant.participant_id).localeCompare(b.participant.full_name||b.participant.participant_id))
  },[selectedAssignment,assignmentSubmissions,participants])

  const assignmentSummary=useMemo(()=>{
    const total=assignmentRoster.length
    const submitted=assignmentRoster.filter(row=>row.submission!==null).length
    const graded=assignmentRoster.filter(row=>row.status==='graded').length
    const awaitingGrade=assignmentRoster.filter(row=>row.status==='submitted').length
    const notSubmitted=assignmentRoster.filter(row=>row.status==='not_submitted').length
    const rate=total?Math.round((submitted/total)*100):0
    return {total,submitted,graded,awaitingGrade,notSubmitted,rate}
  },[assignmentRoster])

  const assignmentSubmissionPageCount=assignmentSubmissionPageSize===0?1:Math.max(1,Math.ceil(assignmentRoster.length/assignmentSubmissionPageSize))
  const currentAssignmentSubmissionPage=Math.min(assignmentSubmissionPage,assignmentSubmissionPageCount)
  const pagedAssignmentRoster=useMemo(
    ()=>assignmentSubmissionPageSize===0?assignmentRoster:assignmentRoster.slice((currentAssignmentSubmissionPage-1)*assignmentSubmissionPageSize,currentAssignmentSubmissionPage*assignmentSubmissionPageSize),
    [assignmentRoster,currentAssignmentSubmissionPage,assignmentSubmissionPageSize]
  )
  useEffect(()=>{if(assignmentSubmissionPage>assignmentSubmissionPageCount)setAssignmentSubmissionPage(assignmentSubmissionPageCount)},[assignmentSubmissionPage,assignmentSubmissionPageCount])

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

    <div className="tabs" style={{display:'flex',gap:8,marginBottom:18,flexWrap:'wrap'}}>
      {participantTabs.filter(item=>!item.adminOnly||isAdmin).map(item=><button key={item.key} className={tab===item.key?'secondary-button':'text-button'} onClick={()=>{if(tab!==item.key)setSelectedParticipantIds([]);setTab(item.key)}}>{item.label}</button>)}
    </div>


    {tab==='bonus_points'&&isAdmin&&<div className="bulk-awards-workspace">
      <div className="bulk-awards-intro">
        <div className="bulk-awards-intro-icon"><Gift size={23}/></div>
        <div className="bulk-awards-intro-copy">
          <p className="eyebrow">Participant rewards</p>
          <h2>Bulk award bonus points</h2>
          <p>Recognise participants in a few steps. Add their IDs, set the award details, then review everything before confirming.</p>
        </div>
        <div className="bulk-awards-access"><BadgeCheck size={15}/> Owner &amp; Admin</div>
      </div>

      <div className="bulk-awards-form-grid">
        <section className="card bulk-awards-panel">
          <div className="bulk-awards-panel-heading">
            <span className="bulk-awards-step-number">01</span>
            <div><h3>Add participants</h3><p>Paste their unique IDs to select recipients.</p></div>
            <span className="bulk-awards-heading-count">{bulkPointRows.length} entered</span>
          </div>
          <div className="bulk-awards-panel-body">
            <div className="bulk-awards-field-head">
              <label htmlFor="bulk-awards-id-list">Participant IDs <span className="bulk-awards-required">*</span></label>
              {bulkAwardIds.trim()&&<button className="bulk-awards-clear" type="button" onClick={()=>{setBulkAwardIds('');setBulkPreviewOpen(false);setBulkAwardReceipt(null)}} disabled={bulkAwardSaving}>Clear all</button>}
            </div>
            <p className="bulk-awards-helper" id="bulk-awards-id-hint">Enter one ID per line, or separate IDs with commas or spaces.</p>
            <textarea
              id="bulk-awards-id-list"
              className="bulk-awards-id-textarea"
              aria-describedby="bulk-awards-id-hint"
              rows={8}
              value={bulkAwardIds}
              onChange={e=>{setBulkAwardIds(e.target.value);setBulkPreviewOpen(false);setBulkAwardReceipt(null)}}
              placeholder={'ECA-2026-00001\nECA-2026-00002\nECA-2026-00003'}
              spellCheck={false}
              autoCapitalize="characters"
              disabled={bulkAwardSaving}
            />
            <div className="bulk-awards-input-footer">
              <span><Users size={15}/> IDs are matched against the selected programme.</span>
              <span>{bulkAwardForm.category==='first_on_call'?'Max 25 for this category':'Up to 100 at once'}</span>
            </div>
          </div>
        </section>

        <section className="card bulk-awards-panel">
          <div className="bulk-awards-panel-heading">
            <span className="bulk-awards-step-number">02</span>
            <div><h3>Set award details</h3><p>Choose the amount and why it is being awarded.</p></div>
          </div>
          <div className="bulk-awards-panel-body">
            <div className="bulk-awards-detail-grid">
              <div className="bulk-awards-field">
                <label htmlFor="bulk-awards-points">Points per participant <span className="bulk-awards-required">*</span></label>
                <input id="bulk-awards-points" type="number" min="0.01" max="10000" step="0.01" value={bulkAwardForm.points} onChange={e=>{setBulkAwardForm(x=>({...x,points:e.target.value}));setBulkPreviewOpen(false)}} placeholder="e.g. 5" disabled={bulkAwardSaving}/>
              </div>
              <div className="bulk-awards-field">
                <label htmlFor="bulk-awards-category">Category <span className="bulk-awards-required">*</span></label>
                <div className="bulk-awards-select"><select id="bulk-awards-category" value={bulkAwardForm.category} onChange={e=>{const category=e.target.value;setBulkAwardForm(x=>({...x,category,reason:pointCategoryLabel(category)}));setBulkPreviewOpen(false)}} disabled={bulkAwardSaving}>
                  <option value="first_on_call">First people on the call</option><option value="class_activity">Most active in class</option><option value="group_activity">Most active in group</option><option value="participation">Participation</option><option value="leadership">Leadership</option><option value="helpfulness">Helpfulness / support</option><option value="other">Other</option>
                </select><ChevronDown size={17}/></div>
              </div>
            </div>
            <div className="bulk-awards-field">
              <label htmlFor="bulk-awards-reason">Reason <span className="bulk-awards-required">*</span></label>
              <input id="bulk-awards-reason" type="text" maxLength={200} value={bulkAwardForm.reason} onChange={e=>{setBulkAwardForm(x=>({...x,reason:e.target.value}));setBulkPreviewOpen(false)}} placeholder="Why are you awarding these points?" disabled={bulkAwardSaving}/>
            </div>
            <div className="bulk-awards-field">
              <label htmlFor="bulk-awards-note">Additional note <span className="bulk-awards-optional">Optional</span></label>
              <textarea id="bulk-awards-note" rows={3} maxLength={1000} value={bulkAwardForm.note} onChange={e=>{setBulkAwardForm(x=>({...x,note:e.target.value}));setBulkPreviewOpen(false)}} placeholder="Add session details or any other context…" disabled={bulkAwardSaving}/>
            </div>
            {bulkAwardForm.category==='first_on_call'&&<div className="bulk-awards-rule"><CheckCircle2 size={18}/><p>For this reward, choose <strong>exactly 5 participants per included group</strong> (Groups 1–5). You can include one or multiple groups. The Test group is excluded.</p></div>}
          </div>
        </section>
      </div>

      <section className="card bulk-awards-panel bulk-awards-review-panel">
        <div className="bulk-awards-panel-heading">
          <span className="bulk-awards-step-number">03</span>
          <div><h3>Review &amp; confirm</h3><p>Verify the recipients and group counts. No points are added until you confirm.</p></div>
          <span className="bulk-awards-check-status">{bulkGroupsLoading?'Checking groups…':bulkPointRows.length===0?'Waiting for IDs':bulkCanAward?'Ready to review':'Needs attention'}</span>
        </div>
        <div className="bulk-awards-panel-body">
          <div className="bulk-awards-overview">
            <div className="bulk-awards-metric"><span>IDs entered</span><strong>{bulkPointRows.length}</strong></div>
            <div className="bulk-awards-metric"><span>Valid participants</span><strong>{bulkPointRows.length-bulkInvalidCount}</strong></div>
            <div className="bulk-awards-metric"><span>Issues to resolve</span><strong>{bulkInvalidCount+(bulkLimitProblem?1:0)}</strong></div>
            <div className="bulk-awards-metric"><span>Total points</span><strong>{bulkPointRows.length&&Number.isFinite(bulkPoints)&&bulkPoints>0?(bulkPointRows.length*bulkPoints).toLocaleString():'—'}</strong></div>
          </div>
          {bulkAwardForm.category==='first_on_call'&&<div className="bulk-awards-groups-area">
            <div className="bulk-awards-subheading"><h4>Group allocation</h4><span>5 recipients per selected group</span></div>
            <div className="bulk-awards-groups">
              {bulkGroupCounts.map(group=><div key={group.staff_id} className={'bulk-awards-group '+(group.selected===5?'is-complete':group.selected>5?'has-error':'')}>
                <div className="bulk-awards-group-top"><strong>{group.group_label}</strong><span>{group.selected} / 5</span></div>
                <div className="bulk-awards-group-track" aria-hidden="true"><span style={{width:Math.min(100,group.selected/5*100)+'%'}}/></div>
              </div>)}
            </div>
          </div>}
          <div className="bulk-awards-subheading bulk-awards-recipient-heading"><h4>Recipient preview</h4><span>{bulkPointRows.length} IDs</span></div>
          {bulkGroupsLoading?<div className="bulk-awards-empty"><Users size={23}/><p>Verifying participant groups…</p></div>:bulkPointRows.length?<div className="bulk-awards-table-scroll"><table className="bulk-awards-recipients-table"><thead><tr><th>Participant ID</th><th>Participant</th><th>Group</th><th>Verification</th></tr></thead><tbody>{bulkPointRows.map((row,i)=><tr key={row.code+'-'+i}><td><strong>{row.code}</strong></td><td>{row.participant?.full_name||'—'}</td><td>{row.group?.group_label||'—'}</td><td>{row.problem?<span className="bulk-awards-invalid">{row.problem}</span>:<span className="bulk-awards-valid"><CheckCircle2 size={13}/> Matched</span>}</td></tr>)}</tbody></table></div>:<div className="bulk-awards-empty"><Users size={23}/><strong>No recipients added yet</strong><p>Paste Participant IDs in step 1 to see matching participants here.</p></div>}
          {bulkLimitProblem&&<p className="bulk-awards-error">{bulkLimitProblem.group_label} needs exactly five participants; {bulkLimitProblem.selected} selected.</p>}
          {bulkPointRows.length>100&&<p className="bulk-awards-error">Maximum 100 Participant IDs per batch.</p>}
          {bulkAwardForm.category==='first_on_call'&&bulkPointRows.length>25&&<p className="bulk-awards-error">First people on the call allows up to 25 participants across Groups 1–5.</p>}
          {bulkAwardReceipt&&<div className="bulk-awards-receipt" role="status"><CheckCircle2 size={20}/><div><strong>Award complete: {bulkAwardReceipt.count} participants</strong><span>+{bulkAwardReceipt.points} each · +{bulkAwardReceipt.total} total · {pointCategoryLabel(bulkAwardReceipt.category)} · {bulkAwardReceipt.reason}</span></div></div>}
          <div className="bulk-awards-review-footer">
            <div><strong>Confirm only after checking every participant.</strong><p>Bonus points will appear in participant history and the leaderboard.</p></div>
            {!bulkPreviewOpen?<button type="button" className="primary-button bulk-awards-action" disabled={!bulkCanAward||bulkAwardSaving} onClick={()=>setBulkPreviewOpen(true)}><CheckCircle2 size={17}/> Review award</button>:<div className="bulk-awards-confirm">
              <p>Give <strong>{bulkAwardForm.points} points each</strong> to <strong>{bulkPointRows.length} participants</strong> ({(bulkPointRows.length*bulkPoints).toLocaleString()} total)?</p>
              <div><button type="button" className="secondary-button" disabled={bulkAwardSaving} onClick={()=>setBulkPreviewOpen(false)}>Cancel</button><button type="button" className="primary-button bulk-awards-action" disabled={!bulkCanAward||bulkAwardSaving} onClick={awardBulkParticipantPoints}>{bulkAwardSaving?'Awarding…':'Confirm & award points'}</button></div>
            </div>}
          </div>
        </div>
      </section>
    </div>}

    {tab==='participants'&&<>
      <div className="participant-stats-grid">
        <div className="card stat-card"><div className="stat-icon"><Users size={18}/></div><div><p className="eyebrow">Total</p><div className="stat-value">{stats.total}</div><p className="muted">Total participants</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><BadgeCheck size={18}/></div><div><p className="eyebrow">Active</p><div className="stat-value">{stats.active}</div><p className="muted">Currently enrolled</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><CheckCircle2 size={18}/></div><div><p className="eyebrow">Completed</p><div className="stat-value">{stats.completed}</div><p className="muted">Finished programme</p></div></div>
      </div>

      <div className="card table-card">
        <div className="card-header">
          <div><h2>Participant directory</h2><p>Showing active/enrolled and completed participants. Withdrawn participants return to Screening/Review as Rejected.</p></div>
          <div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search participants…"/></div>
        </div>
        <div className="participant-directory-filters">
          <label className="participant-select-field"><span>Filter by status</span><div className="participant-select-wrap"><select aria-label="Filter participants by status" value={statusFilter} onChange={e=>setStatusFilter(e.target.value as 'all'|'active'|'completed')}><option value="active">Active / Enrolled</option><option value="completed">Completed</option><option value="all">Active + Completed</option></select><ChevronDown size={16}/></div></label>
          {isAdmin&&<label className="participant-select-field participant-staff-filter"><span>Filter by assigned staff</span><div className="participant-select-wrap"><select aria-label="Filter participants by assigned staff" value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="all">All staff assignments</option><option value="assigned">Assigned to anyone</option><option value="unassigned">Unassigned</option>{programmeStaff.map(staff=><option key={staff.id} value={staff.id}>{staff.full_name||'Staff member'}</option>)}</select><ChevronDown size={16}/></div></label>}
          <span className="participant-filter-count">{filtered.length} participant{filtered.length===1?'':'s'}</span>
        </div>
        {isAdmin&&<div className="participant-bulk-bar">
          <div className="participant-bulk-summary"><strong>{selectedParticipantIds.length} selected</strong><span>Select participants below, then assign them to staff or choose exactly which participant/form fields to export.</span></div>
          <div className="participant-bulk-actions"><button type="button" className="secondary-button" disabled={exporting||!selectedParticipantIds.length} onClick={openParticipantExport}><Download size={16}/>Export selected</button><div className="participant-select-wrap"><select aria-label="Choose staff member" value={bulkStaffId} onChange={e=>setBulkStaffId(e.target.value)}><option value="">Choose staff member</option>{programmeStaff.map(staff=><option key={staff.id} value={staff.id}>{staff.full_name||'Staff member'}</option>)}</select><ChevronDown size={16}/></div><button type="button" className="primary-button" disabled={saving||!bulkStaffId||!selectedParticipantIds.length} onClick={bulkAssignProgrammeStaff}>Assign selected</button><button type="button" className="secondary-button" disabled={saving||!bulkStaffId||!selectedParticipantIds.length} onClick={bulkUnassignProgrammeStaff}>Unassign selected</button>{selectedParticipantIds.length>0&&<button type="button" className="text-button" onClick={()=>setSelectedParticipantIds([])}>Clear</button>}</div>
        </div>}
        <div className="table-wrap"><table><thead><tr>{isAdmin&&<th className="participant-select-cell"><input type="checkbox" aria-label="Select all participants on this page" checked={pagedParticipants.length>0&&pagedParticipants.every(p=>selectedParticipantIds.includes(p.id))} onChange={e=>toggleAllVisibleParticipants(e.target.checked)}/></th>}<th>Participant ID</th><th>Participant</th><th>Programme</th>{isAdmin&&<th>Assigned to</th>}<th>Attendance</th><th>Status</th><th>Joined</th></tr></thead><tbody>
          {filtered.length?pagedParticipants.map(p=>{const assignedStaff=staffByParticipant.get(p.id)||[];return <tr key={p.id} className="clickable-row" onClick={()=>openParticipant(p)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openParticipant(p)}}} tabIndex={0} role="button" aria-label={'Open participant '+(p.full_name||p.participant_id)}>
            {isAdmin&&<td className="participant-select-cell" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={'Select '+(p.full_name||p.participant_id)} checked={selectedParticipantIds.includes(p.id)} onChange={e=>toggleParticipantSelection(p.id,e.target.checked)}/></td>}
            <td><strong>{p.participant_id}</strong></td>
            <td><strong>{p.full_name||'Unnamed participant'}</strong><span className="table-sub">{p.email||'No email'}</span></td>
            <td>{appName(p.application_id)}</td>
            {isAdmin&&<td className="participant-assigned-cell">{assignedStaff.length?<div className="participant-assignee-list">{assignedStaff.map(staff=><span key={staff.id} className="participant-assignee-chip"><Users size={12}/>{staff.full_name||'Staff member'}</span>)}</div>:<span className="participant-unassigned-label">Unassigned</span>}</td>}
            <td>{p.attendance_count||0} present</td>
            <td><span className={'status '+(p.status==='active'?'green':p.status==='completed'?'blue':'neutral')}>{p.status==='active'?'Active / Enrolled':p.status}</span></td>
            <td>{new Date(p.joined_at).toLocaleDateString()}</td>
          </tr>}):<tr><td colSpan={isAdmin?8:6}><div className="table-empty">{participants.length?'No participants match these filters.':'No approved participants yet. Approved applicants appear here automatically.'}</div></td></tr>}
        </tbody></table></div>
        <TablePagination
          total={filtered.length}
          page={currentParticipantPage}
          pageSize={participantPageSize}
          onPageChange={setParticipantPage}
          onPageSizeChange={size=>{setParticipantPageSize(size);setParticipantPage(1)}}
        />
      </div>
    </>}

    {tab==='loan_interest'&&isAdmin&&<>
      <div className="participant-stats-grid">
        <div className="card stat-card"><div className="stat-icon"><Users size={18}/></div><div><p className="eyebrow">Interested</p><div className="stat-value">{loanInterestedParticipants.length}</div><p className="muted">Answered “Yes” to business loan interest</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><Phone size={18}/></div><div><p className="eyebrow">Phone available</p><div className="stat-value">{loanInterestedParticipants.filter(p=>p.whatsapp_phone).length}</div><p className="muted">Participants with a saved phone number</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><CheckCircle2 size={18}/></div><div><p className="eyebrow">Selected</p><div className="stat-value">{selectedParticipantIds.filter(id=>loanInterestParticipantIds.includes(id)).length}</div><p className="muted">Ready for export</p></div></div>
      </div>
      <div className="card table-card">
        <div className="card-header">
          <div><h2>Loan interest participants</h2><p>Enrolled or completed participants who answered “Yes” to “Are you interested in getting a business loan?”</p></div>
          <div className="search"><Search size={16}/><input value={loanInterestQuery} onChange={e=>setLoanInterestQuery(e.target.value)} placeholder="Search name, email, phone or ID…"/></div>
        </div>
        <div className="participant-directory-filters">
          <span className="participant-filter-count">{loanFiltered.length} interested participant{loanFiltered.length===1?'':'s'}</span>
        </div>
        <div className="participant-bulk-bar">
          <div className="participant-bulk-summary"><strong>{selectedParticipantIds.length} selected</strong><span>Select the interested participants you need, then choose exactly which participant details or form answers to export.</span></div>
          <div className="participant-bulk-actions"><button type="button" className="primary-button" disabled={exporting||!selectedParticipantIds.length} onClick={openParticipantExport}><Download size={16}/>{exporting?'Exporting…':'Export selected'}</button>{selectedParticipantIds.length>0&&<button type="button" className="text-button" onClick={()=>setSelectedParticipantIds([])}>Clear</button>}</div>
        </div>
        {loanInterestLoading?<div className="loading-card">Loading loan interest responses…</div>:<div className="table-wrap"><table><thead><tr><th className="participant-select-cell"><input type="checkbox" aria-label="Select all loan-interest participants on this page" checked={pagedLoanParticipants.length>0&&pagedLoanParticipants.every(p=>selectedParticipantIds.includes(p.id))} onChange={e=>toggleAllVisibleLoanParticipants(e.target.checked)}/></th><th>Participant ID</th><th>Participant</th><th>Phone / WhatsApp</th><th>Programme</th><th>Status</th></tr></thead><tbody>
          {loanFiltered.length?pagedLoanParticipants.map(p=><tr key={p.id} className="clickable-row" onClick={()=>openParticipant(p)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openParticipant(p)}}} tabIndex={0} role="button" aria-label={'Open participant '+(p.full_name||p.participant_id)}>
            <td className="participant-select-cell" onClick={e=>e.stopPropagation()}><input type="checkbox" aria-label={'Select '+(p.full_name||p.participant_id)} checked={selectedParticipantIds.includes(p.id)} onChange={e=>toggleParticipantSelection(p.id,e.target.checked)}/></td>
            <td><strong>{p.participant_id}</strong></td>
            <td><strong>{p.full_name||'Unnamed participant'}</strong><span className="table-sub">{p.email||'No email'}</span></td>
            <td>{p.whatsapp_phone||'No phone'}</td>
            <td>{appName(p.application_id)}</td>
            <td><span className={'status '+(p.status==='active'?'green':'blue')}>{p.status==='active'?'Active / Enrolled':'Completed'}</span></td>
          </tr>):<tr><td colSpan={6}><div className="table-empty">No enrolled participants in this programme answered “Yes” to the business loan interest question.</div></td></tr>}
        </tbody></table></div>}
        {!loanInterestLoading&&<TablePagination
          total={loanFiltered.length}
          page={currentLoanInterestPage}
          pageSize={loanInterestPageSize}
          onPageChange={setLoanInterestPage}
          onPageSizeChange={size=>{setLoanInterestPageSize(size);setLoanInterestPage(1)}}
        />}
      </div>
    </>}

    {tab==='attendance'&&<div className="attendance-layout">
      <div className="attendance-column">
        <div className="card table-card attendance-session-card">
          <div className="card-header"><div><p className="eyebrow">{isAdmin?'Attendance setup':'Attendance history'}</p><h2>Attendance sessions</h2><p>{isAdmin?'Create a class, then select it to manage attendance.':'Select a session to view attendance for participants assigned to you.'}</p></div></div>
          {isAdmin&&<form className="modal-form attendance-session-form" onSubmit={createSession}>
            <label className="attendance-field">Programme<div className="participant-select-wrap"><select value={sessionForm.application_id} onChange={e=>setSessionForm(x=>({...x,application_id:e.target.value}))} required><option value="">Select programme</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select><ChevronDown size={16}/></div></label>
            <label>Session title<input value={sessionForm.title} onChange={e=>setSessionForm(x=>({...x,title:e.target.value}))} placeholder="Class 1 — Introduction" required/></label>
            <label>Date<input type="date" className="date-picker-input" onClick={e=>{try{e.currentTarget.showPicker?.()}catch{}}} onFocus={e=>{try{e.currentTarget.showPicker?.()}catch{}}} value={sessionForm.session_date} onChange={e=>setSessionForm(x=>({...x,session_date:e.target.value}))} required/></label>
            <button className="primary-button" disabled={saving}><Plus size={16}/> Create session</button>
          </form>}
          <div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Session</th><th>Programme</th><th>Date</th></tr></thead><tbody>
            {scopedSessions.length?scopedSessions.map(s=><tr key={s.id} className={selectedSession?.id===s.id?'clickable-row selected-row':'clickable-row'} onClick={()=>openSession(s)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openSession(s)}}} tabIndex={0} role="button" aria-label={'Open attendance session '+s.title}><td><strong>{s.title}</strong></td><td>{appName(s.application_id)}</td><td>{new Date(s.session_date).toLocaleDateString()}</td></tr>):<tr><td colSpan={3}><div className="table-empty">No attendance sessions for this application yet.</div></td></tr>}
          </tbody></table></div>
        </div>
      </div>
      <div className="attendance-column">
        <div className="card table-card attendance-record-card">
          <div className="card-header"><div><p className="eyebrow">Selected session</p><h2>{selectedSession?selectedSession.title:'Session attendance'}</h2><p>{selectedSession?appName(selectedSession.application_id):'Select a session from the list.'}</p></div>{selectedSession&&isAdmin?<div className="assignment-header-actions"><button type="button" className="icon-button danger-icon-button" aria-label="Delete attendance session" title="Delete attendance session" onClick={deleteAttendanceSession} disabled={saving}><Trash2 size={17}/></button></div>:<CalendarCheck2 size={20}/>}</div>
          {!selectedSession?<div className="table-empty">Select an attendance session to see participants.</div>:attendanceLoading?<div className="loading-card">Loading attendance…</div>:<>{isAdmin&&<div className="attendance-checkin-card">
              <div className="attendance-checkin-summary">
                <div className="attendance-checkin-state"><span className={'attendance-checkin-dot '+(selectedSession.check_in_open?'is-open':'')}></span><div><p className="eyebrow">Participant self check-in</p><h3>{selectedSession.check_in_open?'Check-in is open':'Check-in is closed'}</h3><p>{selectedSession.check_in_open?'Participants can use this link and their Participant ID to mark themselves present.':'Open check-in when you are ready for participants to record their attendance.'}</p></div></div>
                <button type="button" className={selectedSession.check_in_open?'secondary-button':'primary-button'} onClick={()=>setCheckInOpen(!selectedSession.check_in_open)} disabled={saving}>{selectedSession.check_in_open?'Close check-in':'Open check-in'}</button>
              </div>
              <div className="attendance-link-panel">
                <div className="attendance-link-copy"><span className="screening-summary-label">Attendance link</span><strong>Share a short, memorable check-in URL</strong><small>Each link is unique across ApplyFlow. You can edit the part after /attendance/.</small></div>
                {editingCheckInSlug?<div className="attendance-link-editor">
                  <div className="attendance-link-input"><span>{window.location.origin}/attendance/</span><input value={checkInSlugDraft} maxLength={48} onChange={e=>setCheckInSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,''))} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void saveCheckInSlug()}if(e.key==='Escape'){setCheckInSlugDraft(selectedSession.check_in_slug);setEditingCheckInSlug(false)}}} autoFocus /></div>
                  <div className="attendance-link-editor-actions"><button type="button" className="secondary-button" onClick={()=>{setCheckInSlugDraft(selectedSession.check_in_slug);setEditingCheckInSlug(false)}} disabled={saving}>Cancel</button><button type="button" className="primary-button" onClick={saveCheckInSlug} disabled={saving}>{saving?'Saving…':'Save link'}</button></div>
                </div>:<div className="attendance-link-display">
                  <div className="attendance-link-url"><Link2 size={16}/><span>{window.location.origin}/attendance/</span><strong>{selectedSession.check_in_slug}</strong></div>
                  <div className="attendance-link-actions"><button type="button" className="secondary-button" onClick={()=>setEditingCheckInSlug(true)}><Pencil size={14}/> Edit link</button><button type="button" className="primary-button" onClick={()=>navigator.clipboard.writeText(window.location.origin+'/attendance/'+selectedSession.check_in_slug).then(()=>setNotice('Attendance check-in link copied.')).catch(()=>setError('Could not copy the attendance link.'))}><Link2 size={14}/> Copy link</button></div>
                </div>}
              </div>
            </div>}
            <div className="attendance-analytics-panel">
              <div className="attendance-analytics-heading">
                <div><p className="eyebrow">Attendance analytics</p><h3>Session summary</h3><p>See who checked in, who was marked absent, and who has not recorded attendance yet.</p></div>
                <div className="attendance-rate-badge"><strong>{attendanceSummary.rate}%</strong><span>attendance rate</span></div>
              </div>
              <div className="attendance-analytics-grid">
                <div className="attendance-metric"><span>Participants</span><strong>{attendanceSummary.total}</strong><small>in this programme</small></div>
                <div className="attendance-metric is-present"><span>Present</span><strong>{attendanceSummary.present}</strong><small>marked attendance</small></div>
                <div className="attendance-metric is-absent"><span>Absent</span><strong>{attendanceSummary.absent}</strong><small>explicitly marked absent</small></div>
                <div className="attendance-metric is-pending"><span>Not marked</span><strong>{attendanceSummary.notMarked}</strong><small>no record yet</small></div>
              </div>
              <div className="attendance-rate-track" aria-label={'Attendance rate '+attendanceSummary.rate+' percent'}><span style={{width:attendanceSummary.rate+'%'}}/></div>
            </div>
            <div className="attendance-roster-heading"><div><p className="eyebrow">Attendance roster</p><h3>Participant status</h3></div><span>{attendanceSummary.present} of {attendanceSummary.total} present</span></div>
            <div className="table-wrap"><table><thead><tr><th>Participant</th><th>ID</th><th>Status</th><th>Recorded</th><th></th></tr></thead><tbody>
              {attendanceRoster.length?attendanceRoster.map(({participant,record,status})=><tr key={participant.id}><td><strong>{participant.full_name||'Unnamed participant'}</strong><span className="table-sub">{participant.email||''}</span></td><td>{participant.participant_id}</td><td><span className={'status '+(status==='present'?'green':status==='absent'?'neutral':'amber')}>{status==='not_marked'?'Not marked':status}</span></td><td>{record?new Date(record.marked_at).toLocaleString():'—'}</td><td>{isAdmin&&status==='present'?<button className="text-button" disabled={saving} onClick={()=>markAbsent(participant.id)}>Mark absent</button>:null}</td></tr>):<tr><td colSpan={5}><div className="table-empty">No participants are available for this session’s programme.</div></td></tr>}
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
            <div className="assignment-form-grid"><label>Deadline (Nigeria time · WAT)<input type="datetime-local" value={assignmentForm.deadline} onChange={e=>setAssignmentForm(x=>({...x,deadline:e.target.value}))}/></label><label>Maximum score<input type="number" min="1" max="1000" value={assignmentForm.max_score} onChange={e=>setAssignmentForm(x=>({...x,max_score:e.target.value}))}/></label><label>Pass mark<input type="number" min="0" max={assignmentForm.max_score||undefined} value={assignmentForm.pass_mark} onChange={e=>setAssignmentForm(x=>({...x,pass_mark:e.target.value}))}/></label></div>
            <button className="primary-button" disabled={saving||!applicationFilter}><Plus size={16}/> Create draft</button>
          </form>
          </>:<div className="card-header"><div><p className="eyebrow">Assignments</p><h2>Programme assignments</h2><p>Track submissions from your own participant group here. Grade work in Assignment Review.</p></div><ClipboardList size={20}/></div>}<div className="table-wrap"><table><thead><tr><th>Assignment</th><th>Deadline</th><th>Status</th></tr></thead><tbody>{scopedAssignments.length?scopedAssignments.map(a=><tr key={a.id} className={selectedAssignment?.id===a.id?'clickable-row selected-row':'clickable-row'} onClick={()=>openAssignment(a)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openAssignment(a)}}} tabIndex={0} role="button" aria-label={'Open assignment '+a.title}><td><strong>{a.title}</strong><span className="table-sub">{a.max_score} points</span></td><td>{formatAssignmentDeadline(a.deadline)}</td><td><span className={'status '+(a.status==='published'?'green':a.status==='closed'?'neutral':'blue')}>{a.status}</span></td></tr>):<tr><td colSpan={3}><div className="table-empty">No assignments for this programme yet.</div></td></tr>}</tbody></table></div>
        </div>
      </div>
      <div className="assignment-column">
        <div className="card table-card">
          <div className="card-header"><div><p className="eyebrow">Assignment builder</p><h2>{selectedAssignment?.title||'Select an assignment'}</h2><p>{selectedAssignment?'Add the questions participants will answer.':'Choose an assignment from the list to build it.'}</p></div>{selectedAssignment&&isAdmin?<div className="assignment-header-actions"><button type="button" className="icon-button" aria-label="Edit assignment" onClick={()=>setEditingAssignment(v=>!v)}><Pencil size={17}/></button><button type="button" className="icon-button danger-icon-button" aria-label="Delete assignment" onClick={deleteAssignment} disabled={saving}><Trash2 size={17}/></button></div>:<Link2 size={20}/>}</div>
          {!selectedAssignment?<div className="table-empty">Select or create an assignment to continue.</div>:<>
            {isAdmin&&editingAssignment&&<form className="modal-form assignment-edit-form" onSubmit={updateAssignment}><div className="assignment-form-grid"><label>Title<input value={editAssignmentForm.title} onChange={e=>setEditAssignmentForm(x=>({...x,title:e.target.value}))} required/></label><label>Maximum score<input type="number" min="1" step="0.01" value={editAssignmentForm.max_score} onChange={e=>setEditAssignmentForm(x=>({...x,max_score:e.target.value}))} required/></label><label>Pass mark<input type="number" min="0" step="0.01" max={editAssignmentForm.max_score||undefined} value={editAssignmentForm.pass_mark} onChange={e=>setEditAssignmentForm(x=>({...x,pass_mark:e.target.value}))} required/></label></div><label>Description<textarea rows={3} value={editAssignmentForm.description} onChange={e=>setEditAssignmentForm(x=>({...x,description:e.target.value}))}/></label><label>Instructions<textarea rows={4} value={editAssignmentForm.instructions} onChange={e=>setEditAssignmentForm(x=>({...x,instructions:e.target.value}))}/></label><label>Deadline (Nigeria time · WAT)<input type="datetime-local" value={editAssignmentForm.deadline} onChange={e=>setEditAssignmentForm(x=>({...x,deadline:e.target.value}))}/></label><div className="assignment-edit-actions"><button type="button" className="secondary-button" onClick={()=>setEditingAssignment(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?'Saving…':'Save changes'}</button></div></form>}<div className="assignment-meta"><div><span>Status</span><strong>{selectedAssignment.status}</strong></div><div><span>Maximum score</span><strong>{selectedAssignment.max_score}</strong></div><div><span>Pass mark</span><strong>{selectedAssignment.pass_mark}</strong></div><div><span>Assignment link</span><strong>/a/{selectedAssignment.public_slug}</strong><button type="button" className="text-button" onClick={()=>navigator.clipboard.writeText(window.location.origin+'/a/'+selectedAssignment.public_slug).then(()=>setNotice('Assignment link copied.')).catch(()=>setError('Could not copy the assignment link.'))}>Copy link</button></div><div className="assignment-results-meta"><span>Participant results</span><strong>{selectedAssignment.results_released?'Released':'Hidden'}</strong><div className="assignment-results-actions">{isAdmin&&<button type="button" className="text-button" onClick={()=>setResultsReleased(!selectedAssignment.results_released)} disabled={saving}>{selectedAssignment.results_released?'Hide results':'Release results'}</button>}<button type="button" className="text-button" onClick={()=>navigator.clipboard.writeText(window.location.origin+'/results/'+selectedAssignment.public_slug).then(()=>setNotice('Results link copied.')).catch(()=>setError('Could not copy the results link.'))}>Copy results link</button></div></div></div>
            {isAdmin&&selectedAssignment.title.startsWith('[Recovered]')&&<section className="assignment-attachments-panel recovered-assignment-panel"><div className="assignment-attachments-heading"><div><p className="eyebrow">Recovery</p><h4>Recovered uploaded files</h4><p>{recoveredAssignmentFiles.length?recoveredAssignmentFiles.length+' surviving file'+(recoveredAssignmentFiles.length===1?'':'s')+' recovered from Storage.':'No surviving Storage files were found.'} Original participant/submission links were deleted with the assignment, so these files are shown without invented participant names.</p></div>{recoveredAssignmentFiles.length>0&&<span className="status blue">{recoveredAssignmentFiles.length} file{recoveredAssignmentFiles.length===1?'':'s'}</span>}</div>{recoveredAssignmentFiles.length>0&&<div className="assignment-attachments-list">{recoveredAssignmentFiles.map((file,index)=><button type="button" className="assignment-attachment-card" key={file.storage_path} onClick={()=>openRecoveredAssignmentFile(file)}><span className="assignment-attachment-icon"><Download size={16}/></span><span className="assignment-attachment-copy"><strong>{recoveredAssignmentFileName(file.storage_path)}</strong><small>Recovered file {index+1} · original participant mapping unavailable</small></span><span className="assignment-attachment-action">Open</span></button>)}</div>}</section>}
            {isAdmin&&(selectedAssignment.status==='draft'||(editingAssignment&&assignmentSubmissions.length===0))&&<form className="modal-form assignment-question-form" onSubmit={addAssignmentQuestion}><label>{questionForm.type==='instruction'?'Heading (optional)':'Question'}<input value={questionForm.label} onChange={e=>setQuestionForm(x=>({...x,label:e.target.value}))} placeholder={questionForm.type==='instruction'?'Reading passage':'What did you learn this week?'} required={questionForm.type!=='instruction'}/></label><div className="assignment-form-grid"><label>Answer type<select value={questionForm.type} onChange={e=>setQuestionForm(x=>({...x,type:e.target.value as AssignmentQuestion['type'],options:(e.target.value==='single_choice'||e.target.value==='multiple_choice')?(x.options.length>=2?x.options:['','']):x.options}))}><option value="instruction">Instruction / reading passage (no answer)</option><option value="short_text">Short answer</option><option value="long_text">Long answer</option><option value="number">Number</option><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option><option value="file">File upload</option><option value="url">Link / URL</option></select></label>{questionForm.type!=='instruction'&&<label className="assignment-checkbox"><input type="checkbox" checked={questionForm.required} onChange={e=>setQuestionForm(x=>({...x,required:e.target.checked}))}/> Required</label>}</div>{questionForm.type==='instruction'&&<label>Passage / instructions<textarea rows={8} value={questionForm.description} onChange={e=>setQuestionForm(x=>({...x,description:e.target.value}))} placeholder="Paste the article, case study, scenario, or exam passage participants should read before answering the next questions." required/></label>}{(questionForm.type==='single_choice'||questionForm.type==='multiple_choice')&&<div className="assignment-options-editor"><div className="assignment-options-heading"><div><strong>Answer options</strong><small>{questionForm.type==='single_choice'?'Participants can select one option.':'Participants can select more than one option.'}</small></div><button type="button" className="text-button" onClick={()=>setQuestionForm(x=>({...x,options:[...x.options,'']}))}><Plus size={15}/> Add option</button></div><div className="assignment-option-list">{questionForm.options.map((option,index)=><div className="assignment-option-row" key={index}><span>{index+1}</span><input value={option} onChange={e=>setQuestionForm(x=>({...x,options:x.options.map((item,i)=>i===index?e.target.value:item)}))} placeholder={'Option '+(index+1)} required/><button type="button" className="icon-button" aria-label={'Remove option '+(index+1)} disabled={questionForm.options.length<=2} onClick={()=>setQuestionForm(x=>({...x,options:x.options.filter((_,i)=>i!==index)}))}><X size={15}/></button></div>)}</div></div>}<button className="secondary-button" disabled={saving}><Plus size={16}/> {questionForm.type==='instruction'?'Add reading passage':'Add question'}</button></form>}
            <div className="assignment-question-list">{(assignmentQuestions[selectedAssignment.id]||[]).length?(assignmentQuestions[selectedAssignment.id]||[]).map((q,i)=><div key={q.id} className="assignment-question-item">{editingQuestionId===q.id?<form className="assignment-inline-question-edit" onSubmit={saveAssignmentQuestion}><label>{editQuestionForm.type==='instruction'?'Heading (optional)':'Question'}<input value={editQuestionForm.label} onChange={e=>setEditQuestionForm(x=>({...x,label:e.target.value}))} required={editQuestionForm.type!=='instruction'}/></label><div className="assignment-form-grid"><label>Answer type<select value={editQuestionForm.type} onChange={e=>setEditQuestionForm(x=>({...x,type:e.target.value as AssignmentQuestion['type']}))}><option value="instruction">Instruction / reading passage (no answer)</option><option value="short_text">Short answer</option><option value="long_text">Long answer</option><option value="number">Number</option><option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option><option value="file">File upload</option><option value="url">Link / URL</option></select></label>{editQuestionForm.type!=='instruction'&&<label className="assignment-checkbox"><input type="checkbox" checked={editQuestionForm.required} onChange={e=>setEditQuestionForm(x=>({...x,required:e.target.checked}))}/> Required</label>}</div>{editQuestionForm.type==='instruction'&&<label>Passage / instructions<textarea rows={8} value={editQuestionForm.description} onChange={e=>setEditQuestionForm(x=>({...x,description:e.target.value}))} required/></label>}{(editQuestionForm.type==='single_choice'||editQuestionForm.type==='multiple_choice')&&<div className="assignment-options-editor"><div className="assignment-options-heading"><strong>Answer options</strong><button type="button" className="text-button" onClick={()=>setEditQuestionForm(x=>({...x,options:[...x.options,'']}))}><Plus size={15}/> Add option</button></div><div className="assignment-option-list">{editQuestionForm.options.map((option,index)=><div className="assignment-option-row" key={index}><span>{index+1}</span><input value={option} onChange={e=>setEditQuestionForm(x=>({...x,options:x.options.map((item,j)=>j===index?e.target.value:item)}))} required/><button type="button" className="icon-button" disabled={editQuestionForm.options.length<=2} onClick={()=>setEditQuestionForm(x=>({...x,options:x.options.filter((_,j)=>j!==index)}))}><X size={15}/></button></div>)}</div></div>}<div className="assignment-edit-actions"><button type="button" className="secondary-button" onClick={()=>setEditingQuestionId(null)}>Cancel</button><button className="primary-button" disabled={saving}>{saving?'Saving…':'Save question'}</button></div></form>:<div className={'assignment-question-row'+(isInstructionBlock(q)?' assignment-reading-row':'')}><span>{isInstructionBlock(q)?'Read':(assignmentQuestions[selectedAssignment.id]||[]).slice(0,i).filter(item=>!isInstructionBlock(item)).length+1}</span><div><strong>{q.label}</strong>{isInstructionBlock(q)&&<p className="assignment-instruction-preview">{q.description}</p>}<small>{isInstructionBlock(q)?'Reading passage · No response required':q.type.replaceAll('_',' ')+' · '+(q.required?'Required':'Optional')}</small></div>{isAdmin&&editingAssignment&&<div className="assignment-question-actions"><button type="button" className="icon-button" aria-label="Edit question" onClick={()=>startEditQuestion(q)}><Pencil size={15}/></button><button type="button" className="icon-button danger-icon-button" aria-label="Delete question" onClick={()=>deleteAssignmentQuestion(q)} disabled={saving}><Trash2 size={15}/></button></div>}</div>}</div>):<div className="table-empty">No questions yet.</div>}</div>
            {isAdmin&&<div className="assignment-actions">{selectedAssignment.status==='draft'?<button className="primary-button" onClick={()=>setAssignmentStatus('published')} disabled={saving||!(assignmentQuestions[selectedAssignment.id]||[]).some(q=>!isInstructionBlock(q))}>Publish assignment</button>:selectedAssignment.status==='published'?<button className="secondary-button" onClick={()=>setAssignmentStatus('closed')} disabled={saving}>Close assignment</button>:null}</div>}
            {selectedAssignment.title.startsWith('[Recovered]')?<section className="assignment-attachments-panel recovered-assignment-history"><div className="assignment-attachments-heading"><div><p className="eyebrow">Recovery record</p><h4>Historical submissions</h4><p>{selectedAssignment.description||'This recovered assignment no longer has its original submission rows.'}</p></div><span className="status neutral">Recovered</span></div><p className="muted">The original participant mappings, answer text, scores and grading records were deleted with the assignment, so ApplyFlow will not show a misleading zero-submission roster here.</p></section>:<div className="assignment-submissions-section">
              <div className="card-header"><div><p className="eyebrow">Submissions</p><h3>Participant work</h3><p>Track submission progress for your assigned participants. Grading is managed separately in Assignment Review.</p></div></div>
              <div className="attendance-analytics-panel assignment-analytics-panel">
                <div className="attendance-analytics-heading">
                  <div><p className="eyebrow">Assignment analytics</p><h3>Submission summary</h3><p>See who submitted, what still needs grading, and who has not submitted yet.</p></div>
                  <div className="attendance-rate-badge"><strong>{assignmentSummary.rate}%</strong><span>submission rate</span></div>
                </div>
                <div className="attendance-analytics-grid">
                  <div className="attendance-metric"><span>Participants</span><strong>{assignmentSummary.total}</strong><small>in this programme</small></div>
                  <div className="attendance-metric is-present"><span>Submitted</span><strong>{assignmentSummary.submitted}</strong><small>{assignmentSummary.awaitingGrade} awaiting grade</small></div>
                  <div className="attendance-metric"><span>Graded</span><strong>{assignmentSummary.graded}</strong><small>review completed</small></div>
                  <div className="attendance-metric is-pending"><span>Not submitted</span><strong>{assignmentSummary.notSubmitted}</strong><small>no submission yet</small></div>
                </div>
                <div className="attendance-rate-track" aria-label={'Submission rate '+assignmentSummary.rate+' percent'}><span style={{width:assignmentSummary.rate+'%'}}/></div>
              </div>
              <div className="attendance-roster-heading"><div><p className="eyebrow">Assignment roster</p><h3>Participant submission status</h3></div><span>{assignmentSummary.submitted} of {assignmentSummary.total} submitted</span></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Participant</th><th>Assigned to</th><th>Submitted</th><th>Score</th><th>Grading</th></tr></thead>
                  <tbody>
                    {assignmentRoster.length?pagedAssignmentRoster.map(({participant,submission,status})=>{
                      const assignedStaff=staffByParticipant.get(participant.id)||[]
                      const assigneeCell=<td className="participant-assigned-cell">{assignedStaff.length?<div className="participant-assignee-list">{assignedStaff.map(staff=><span key={staff.id} className="participant-assignee-chip"><Users size={12}/>{staff.full_name||'Staff member'}</span>)}</div>:<span className="participant-unassigned-label">Unassigned</span>}</td>
                      return submission?<tr key={participant.id} className="clickable-row" onClick={()=>openAssignmentSubmission(submission)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openAssignmentSubmission(submission)}}} tabIndex={0} role="button" aria-label={'Open assignment submission for '+(participant.full_name||participant.participant_id)}>
                        <td><strong>{participant.full_name||participant.participant_id}</strong><span className="table-sub">{participant.participant_id}</span></td>
                        {assigneeCell}
                        <td>{new Date(submission.submitted_at).toLocaleString()}</td>
                        <td>{submission.score===null?'—':submission.score+'/'+selectedAssignment.max_score}</td>
                        <td><span className={'status '+(status==='graded'?'green':'blue')}>{status==='graded'?'Graded':'Awaiting grade'}</span></td>
                      </tr>:<tr key={participant.id}>
                        <td><strong>{participant.full_name||participant.participant_id}</strong><span className="table-sub">{participant.participant_id}</span></td>
                        {assigneeCell}
                        <td>—</td>
                        <td>—</td>
                        <td><span className="status amber">Not submitted</span></td>
                      </tr>
                    }):<tr><td colSpan={5}><div className="table-empty">No participants are available for this assignment’s programme.</div></td></tr>}
                  </tbody>
                </table>
              </div>
              <TablePagination total={assignmentRoster.length} page={currentAssignmentSubmissionPage} pageSize={assignmentSubmissionPageSize} pageSizes={[20,50,100,200,0]} onPageChange={setAssignmentSubmissionPage} onPageSizeChange={size=>{setAssignmentSubmissionPageSize(size);setAssignmentSubmissionPage(1)}}/>
            </div>}
            {selectedSubmission&&createPortal(<div className="modal-backdrop assignment-review-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget)setSelectedSubmission(null)}}><div className="assignment-review-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-review-title"><div className="assignment-review-modal-header"><div><p className="eyebrow">Review submission</p><h2 id="assignment-review-title">{selectedSubmission.participants?.applicants?.full_name||selectedSubmission.participants?.participant_id||'Participant'}</h2><p>{selectedSubmission.participants?.participant_id} · {new Date(selectedSubmission.submitted_at).toLocaleString()}</p></div><button className="icon-button" onClick={()=>setSelectedSubmission(null)} aria-label="Close review"><X size={18}/></button></div><div className="assignment-review-modal-body" ref={assignmentReviewScrollRef}>{submissionReviewLoading?<div className="loading-card">Loading submission…</div>:<>{submissionDocuments.length>0&&<section className="assignment-attachments-panel"><div className="assignment-attachments-heading"><div><p className="eyebrow">Attachments</p><h4>Uploaded files</h4><p>All files attached to this submission are shown here.</p></div><span className="status blue">{submissionDocuments.length} file{submissionDocuments.length===1?'':'s'}</span></div><div className="assignment-attachments-list">{submissionDocuments.map(doc=>{const answer=submissionAnswers.find(a=>a.question_id===doc.question_id);return <button type="button" className="assignment-attachment-card" key={doc.id} onClick={()=>openAssignmentDocument(doc)}><span className="assignment-attachment-icon"><Download size={16}/></span><span className="assignment-attachment-copy"><strong>{doc.original_name}</strong><small>{answer?.assignment_questions?.label||'Assignment attachment'}{doc.file_size?' · '+Math.max(1,Math.round(doc.file_size/1024))+' KB':''}</small></span><span className="assignment-attachment-action">Open</span></button>})}</div></section>}<div className="assignment-answer-list">{submissionAnswers.sort((a,b)=>(a.assignment_questions?.position||0)-(b.assignment_questions?.position||0)).map((a,i)=>{const docs=submissionDocuments.filter(d=>d.question_id===a.question_id);return <div className="assignment-answer-row" key={a.id}><span>{i+1}</span><div><strong>{a.assignment_questions?.label||'Question'}</strong>{docs.length?<div className="assignment-document-list">{docs.map((doc,index)=><button type="button" className="text-button" key={doc.id} onClick={()=>openAssignmentDocument(doc)}><Download size={14}/><span>Attachment {index+1}: {doc.original_name}</span></button>)}</div>:<p>{Array.isArray(a.value)?a.value.map((value:any)=>typeof value==='object'?(value?.name||'Uploaded file'):String(value)).join(', '):typeof a.value==='object'?JSON.stringify(a.value):String(a.value??'—')}</p>}</div></div>})}</div>{isAdmin?<form className="modal-form assignment-grade-form assignment-grade-modal-form" onSubmit={gradeSubmission}><div className="assignment-form-grid"><label>Score<input type="number" min="0" max={selectedAssignment.max_score} step="0.01" value={gradeForm.score} onChange={e=>setGradeForm(x=>({...x,score:e.target.value}))} required/><small className="field-help">Maximum {selectedAssignment.max_score}</small></label><label>Status<input value={selectedSubmission.status==='graded'?'Graded':'Awaiting grade'} disabled/></label></div><label>Feedback<textarea rows={5} value={gradeForm.feedback} onChange={e=>setGradeForm(x=>({...x,feedback:e.target.value}))} placeholder="Give the participant clear feedback."/></label><button className="primary-button" disabled={saving}>{saving?'Saving…':selectedSubmission.status==='graded'?'Update grade':'Save grade'}</button></form>:<div className="assignment-grade-form"><p>This is a read-only group submission view. Open <strong>Assignment Review</strong> in the sidebar to grade your allocated work.</p></div>}</>}</div></div></div>,document.body)}
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
            <label>Distribution date<input type="date" className="date-picker-input" onClick={e=>{try{e.currentTarget.showPicker?.()}catch{}}} value={benefitForm.distribution_date} onChange={e=>setBenefitForm(x=>({...x,distribution_date:e.target.value}))}/></label>
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

    {exportOpen&&createPortal(<div className="modal-backdrop participant-export-backdrop" role="dialog" aria-modal="true" aria-label="Choose participant export fields" onMouseDown={e=>{if(e.target===e.currentTarget&&!exporting)setExportOpen(false)}}>
      <div className="modal card participant-export-modal">
        <div className="modal-header participant-export-header">
          <div><p className="eyebrow">Export selected participants</p><h2>Choose what to export</h2><p>Select participant details and any questions from the form used by the selected participants. Empty answers are exported as blank cells.</p></div>
          <button type="button" className="icon-button" aria-label="Close export" onClick={()=>setExportOpen(false)} disabled={exporting}><X size={18}/></button>
        </div>
        <div className="participant-export-body">
          <div className="participant-export-toolbar">
            <div className="search participant-export-search"><Search size={16}/><input value={exportFieldQuery} onChange={e=>setExportFieldQuery(e.target.value)} placeholder="Search fields or form questions…"/></div>
            <div className="participant-export-toolbar-actions"><button type="button" className="text-button" onClick={()=>setSelectedExportFieldKeys(exportFields.map(field=>field.key))} disabled={exportLoadingFields}>Select all</button><button type="button" className="text-button" onClick={()=>setSelectedExportFieldKeys([])}>Clear</button></div>
          </div>
          <div className="participant-export-summary"><strong>{selectedExportFieldKeys.length} field{selectedExportFieldKeys.length===1?'':'s'} selected</strong><span>{selectedParticipantIds.length} participant{selectedParticipantIds.length===1?'':'s'} will be exported.</span></div>
          {exportLoadingFields?<div className="loading-card participant-export-loading">Loading fields from the selected form…</div>:(()=>{
            const term=exportFieldQuery.trim().toLowerCase()
            const visible=exportFields.filter(field=>!term||field.label.toLowerCase().includes(term))
            const participantFields=visible.filter(field=>field.group==='participant')
            const formFields=visible.filter(field=>field.group==='form')
            return <div className="participant-export-groups">
              {participantFields.length>0&&<section className="participant-export-group"><div className="participant-export-group-heading"><div><p className="eyebrow">Participant fields</p><h3>ApplyFlow participant data</h3></div><span>{participantFields.length}</span></div><div className="participant-export-field-list">{participantFields.map(field=><label className="participant-export-field" key={field.key}><input type="checkbox" checked={selectedExportFieldKeys.includes(field.key)} onChange={e=>toggleExportField(field.key,e.target.checked)}/><span><strong>{field.label}</strong><small>Participant record</small></span></label>)}</div></section>}
              {formFields.length>0&&<section className="participant-export-group"><div className="participant-export-group-heading"><div><p className="eyebrow">Form questions</p><h3>Fields from the submitted form</h3></div><span>{formFields.length}</span></div><div className="participant-export-field-list form-fields">{formFields.map(field=><label className="participant-export-field" key={field.key}><input type="checkbox" checked={selectedExportFieldKeys.includes(field.key)} onChange={e=>toggleExportField(field.key,e.target.checked)}/><span><strong>{field.label}</strong><small>Form response</small></span></label>)}</div></section>}
              {!visible.length&&<div className="table-empty">No export fields match your search.</div>}
            </div>
          })()}
        </div>
        <div className="modal-footer participant-export-footer"><div className="participant-export-footer-copy"><strong>{selectedExportFieldKeys.length} columns</strong><span>CSV export</span></div><div className="participant-export-footer-actions"><button type="button" className="secondary-button" onClick={()=>setExportOpen(false)} disabled={exporting}>Cancel</button><button type="button" className="primary-button" onClick={exportSelectedParticipants} disabled={exporting||exportLoadingFields||!selectedExportFieldKeys.length}><Download size={16}/>{exporting?'Exporting…':'Export CSV'}</button></div></div>
      </div>
    </div>,document.body)}

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
            {isAdmin&&<div className="participant-status-actions"><label className="participant-status-select"><span>Change status</span><div className="participant-select-wrap"><select value={selectedParticipant.status==='withdrawn'?'active':selectedParticipant.status} disabled={saving} onChange={e=>updateParticipantStatus(selectedParticipant.id,e.target.value as 'active'|'completed')}><option value="active">Active / Enrolled</option><option value="completed">Completed</option></select><ChevronDown size={16}/></div></label><button type="button" className="secondary-button" disabled={saving||!selectedParticipant.submission_id} onClick={()=>withdrawParticipant(selectedParticipant)}><X size={15}/> Withdraw & return to Review</button></div>}
          </div>
          {isAdmin&&<section className="participant-profile-section participant-staff-section"><div className="participant-section-heading"><div><p className="eyebrow">Staff assignment</p><h3>Assigned follow-up staff</h3><p>Assign staff responsible for participant follow-up, attendance and submission tracking. Grading is allocated independently.</p></div><Users size={19}/></div>{programmeStaff.length?<div className="participant-staff-list">{programmeStaff.map(staff=>{const assigned=participantStaff.some(x=>x.participant_id===selectedParticipant.id&&x.staff_id===staff.id);return <label key={staff.id} className="participant-staff-option"><input type="checkbox" checked={assigned} disabled={saving} onChange={e=>updateParticipantStaffAssignment(selectedParticipant.id,staff.id,e.target.checked)}/><span><strong>{staff.full_name||'Staff member'}</strong><small>{assigned?'Assigned to this participant':'Not assigned'}</small></span></label>})}</div>:<div className="table-empty">No Admin or Programme Staff members are available yet.</div>}</section>}
          <div className="participant-profile-stats">
            <div><span>Attendance</span><strong>{selectedParticipant.attendance_count||0}</strong><small>sessions present</small></div>
            <div><span>Joined</span><strong>{new Date(selectedParticipant.joined_at).toLocaleDateString()}</strong><small>programme start</small></div>
            <div><span>Programme</span><strong>{appName(selectedParticipant.application_id)}</strong><small>current application</small></div>
          </div>
          <section className="participant-profile-section">
            <div className="participant-section-heading"><div><p className="eyebrow">Assignments</p><h3>Performance</h3><p>Graded assignment performance for this participant.</p></div><ClipboardList size={19}/></div>
            {leaderboardLoading?<div className="loading-card">Loading performance…</div>:(()=>{const performance=leaderboard.find(row=>row.participant_record_id===selectedParticipant.id);return performance?<div className="participant-profile-stats"><div><span>Total points</span><strong>{Number(performance.total_points||0).toFixed(0)}</strong><small>{Number(performance.assignment_points||0).toFixed(0)} assignment + {Number(performance.attendance_points||0).toFixed(0)} attendance + {Number(performance.bonus_points||0).toFixed(0)} bonus</small></div><div><span>Average score</span><strong>{performance.average_percentage===null?'—':Number(performance.average_percentage).toFixed(1)+'%'}</strong><small>{performance.graded_assignments}/{performance.total_assignments} released assignments</small></div><div><span>Programme leaderboard</span><div className="participant-profile-rank"><LeaderboardRankBadge rank={performance.rank}/></div><small>running position across the full programme</small></div></div>:<div className="table-empty">No assignment performance yet.</div>})()}
          </section>
          {canManagePoints&&<section className="participant-profile-section">
            <div className="participant-section-heading"><div><p className="eyebrow">Bonus points</p><h3>Award extra points</h3><p>Recognise activity, participation, leadership or other contributions. Bonus awards are added to the running leaderboard.</p></div><Gift size={19}/></div>
            <form className="modal-form" onSubmit={awardParticipantPoints}>
              <div className="assignment-form-grid">
                <label>Points<input type="number" min="0.01" max="10000" step="0.01" value={pointAwardForm.points} onChange={e=>setPointAwardForm(x=>({...x,points:e.target.value}))} placeholder="5" required/></label>
                <label>Category<div className="participant-select-wrap"><select value={pointAwardForm.category} onChange={e=>{const category=e.target.value;setPointAwardForm(x=>({...x,category,reason:pointCategoryLabel(category)}))}}><option value="class_activity">Most active in class</option><option value="group_activity">Most active in group</option><option value="participation">Participation</option><option value="leadership">Leadership</option><option value="helpfulness">Helpfulness / support</option><option value="first_on_call">First people on the call</option><option value="other">Other</option></select><ChevronDown size={16}/></div></label>
              </div>
              <label>Reason<input value={pointAwardForm.reason} onChange={e=>setPointAwardForm(x=>({...x,reason:e.target.value}))} maxLength={200} placeholder="e.g. Most active participant during Week 3" required/></label>
              <label>Note <span className="optional">Optional</span><textarea rows={3} value={pointAwardForm.note} onChange={e=>setPointAwardForm(x=>({...x,note:e.target.value}))} maxLength={1000} placeholder="Add context for the award."/></label>
              <button className="primary-button" disabled={pointAwardSaving}>{pointAwardSaving?'Saving…':'Award bonus points'}</button>
            </form>
            <div className="table-wrap participant-profile-table" style={{marginTop:16}}><table><thead><tr><th>Date</th><th>Reason</th><th>Awarded by</th><th>Points</th><th>Status</th></tr></thead><tbody>
              {pointAwardsLoading?<tr><td colSpan={5}><div className="loading-card">Loading bonus point history…</div></td></tr>:pointAwards.length?pointAwards.map(award=><tr key={award.id}><td>{new Date(award.created_at).toLocaleDateString()}</td><td><strong>{award.reason}</strong><span className="table-sub">{pointCategoryLabel(award.category)}{award.note?' · '+award.note:''}</span></td><td>{award.awarded_by_name}</td><td><strong>+{Number(award.points).toFixed(0)}</strong></td><td>{award.revoked_at?<span className="status neutral">Revoked</span>:<button type="button" className="text-button" disabled={pointAwardSaving} onClick={()=>revokePointAward(award)}>Revoke</button>}</td></tr>):<tr><td colSpan={5}><div className="table-empty">No bonus points awarded yet.</div></td></tr>}
            </tbody></table></div>
          </section>}
          <section className="participant-profile-section">
            <div className="participant-section-heading"><div><p className="eyebrow">Attendance</p><h3>Attendance history</h3><p>Attendance records for this participant in this application.</p></div><CalendarCheck2 size={19}/></div>
            {participantAttendanceLoading?<div className="loading-card">Loading attendance history…</div>:participantAttendance.length?<div className="table-wrap participant-profile-table"><table><thead><tr><th>Session</th><th>Date</th><th>Status</th><th>Recorded</th></tr></thead><tbody>{participantAttendance.map(r=><tr key={r.id}><td><strong>{Array.isArray(r.attendance_sessions)?r.attendance_sessions[0]?.title||'Session':r.attendance_sessions?.title||'Session'}</strong></td><td>{(Array.isArray(r.attendance_sessions)?r.attendance_sessions[0]?.session_date:r.attendance_sessions?.session_date)?new Date((Array.isArray(r.attendance_sessions)?r.attendance_sessions[0]?.session_date:r.attendance_sessions?.session_date) as string).toLocaleDateString():'—'}</td><td><span className={'status '+(r.status==='present'?'green':'neutral')}>{r.status}</span></td><td>{new Date(r.marked_at).toLocaleString()}</td></tr>)}</tbody></table></div>:<div className="table-empty">No attendance history yet.</div>}
          </section>
          <section className="participant-profile-section participant-contact-section">
            <div className="participant-section-heading"><div><p className="eyebrow">Contact details</p><h3>Participant information</h3></div><Mail size={18}/></div>
            <div className="participant-contact-grid"><div><span>Name</span><strong>{selectedParticipant.full_name||'Unnamed participant'}</strong></div><div><span>Email</span><strong>{selectedParticipant.email||'No email available'}</strong></div><div><span>WhatsApp phone number</span><strong>{selectedParticipant.whatsapp_phone||'No WhatsApp number available'}</strong>{selectedParticipant.whatsapp_phone&&whatsappUrl(selectedParticipant.whatsapp_phone)&&<a className="participant-whatsapp-link" href={whatsappUrl(selectedParticipant.whatsapp_phone)} target="_blank" rel="noopener noreferrer"><Phone size={12}/>Open WhatsApp</a>}</div><div><span>Trade</span><strong>{selectedParticipant.trade===undefined?'Loading trade…':selectedParticipant.trade||'No trade provided'}</strong></div></div>
          </section>
        </div>
        <div className="participant-profile-footer">
          <button className="secondary-button" onClick={()=>setSelectedParticipant(null)}>Close profile</button>
          {participantIdWhatsappUrl(selectedParticipant)?<a className="primary-button" href={participantIdWhatsappUrl(selectedParticipant)} target="_blank" rel="noopener noreferrer"><Phone size={15}/> Send ID via WhatsApp</a>:<button type="button" className="primary-button" disabled title="Add a WhatsApp phone number to this participant first"><Phone size={15}/> No WhatsApp number</button>}
        </div>
      </div>
    </div>,document.body)}
  </section>
}
