import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { BadgeCheck, CalendarCheck2, Gift, Upload, Plus, Search, X, Users, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application = { id:string; name:string }
type Participant = {
  id:string; participant_code:string; full_name:string|null; email:string|null
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
  participants?:{participant_code:string;full_name:string|null;email:string|null;application_id:string}
}

export default function ParticipantsPanel({organizationId,applications}:{organizationId:string;applications:Application[]}) {
  const [tab,setTab]=useState<'participants'|'attendance'|'benefits'>('participants')
  const [participants,setParticipants]=useState<Participant[]>([])
  const [sessions,setSessions]=useState<Session[]>([])
  const [benefits,setBenefits]=useState<Benefit[]>([])
  const [selectedParticipant,setSelectedParticipant]=useState<Participant|null>(null)
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
      const [p,s,b,recipients]=await Promise.all([
        supabase.from('participants').select('id,participant_code,application_id,status,joined_at,applicants(full_name,email)').eq('organization_id',organizationId).order('participant_code'),
        supabase.from('attendance_sessions').select('id,application_id,title,session_date').eq('organization_id',organizationId).order('session_date',{ascending:false}),
        supabase.from('benefit_distributions').select('id,application_id,name,description,distribution_date,status').eq('organization_id',organizationId).order('created_at',{ascending:false}),
        supabase.from('benefit_recipients').select('distribution_id,participant_id')
      ])
      if(p.error)throw p.error;if(s.error)throw s.error;if(b.error)throw b.error
      // Load attendance/recipient aggregates separately so an empty organisation does not
      // create an invalid IN () query in PostgREST.
      const participantRows=(p.data||[]).map((row:any)=>({\n        id:row.id,participant_code:row.participant_code,application_id:row.application_id,status:row.status,joined_at:row.joined_at,\n        full_name:row.applicants?.full_name||null,email:row.applicants?.email||null\n      })) as Participant[]
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
      setParticipants(participantRows);setSessions(sessionRows);setBenefits(benefitRows)
    }catch(e){setError(e instanceof Error?e.message:'Could not load programme participants.')}finally{setLoading(false)}
  }

  useEffect(()=>{load()},[organizationId])

  const filtered=useMemo(()=>participants.filter(p=>{
    const text=[p.participant_code,p.full_name,p.email,appName(p.application_id)].filter(Boolean).join(' ').toLowerCase()
    return (!query.trim()||text.includes(query.trim().toLowerCase()))
      && (applicationFilter==='all'||p.application_id===applicationFilter)
      && (statusFilter==='all'||p.status===statusFilter)
  }),[participants,query,applicationFilter,statusFilter,applications])

  const scopedParticipants=useMemo(()=>participants.filter(p=>!applicationFilter||p.application_id===applicationFilter),[participants,applicationFilter])
  const scopedSessions=useMemo(()=>sessions.filter(s=>!applicationFilter||s.application_id===applicationFilter),[sessions,applicationFilter])
  const scopedBenefits=useMemo(()=>benefits.filter(b=>!applicationFilter||b.application_id===applicationFilter),[benefits,applicationFilter])
  const stats=useMemo(()=>({
    total:scopedParticipants.length,
    active:scopedParticipants.filter(p=>p.status==='active').length,
    completed:scopedParticipants.filter(p=>p.status==='completed').length,
    withdrawn:scopedParticipants.filter(p=>p.status==='withdrawn').length
  }),[scopedParticipants])

  async function updateParticipantStatus(participantId:string,status:Participant['status']){
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('participants').update({status,updated_at:new Date().toISOString()}).eq('id',participantId).select('id,participant_code,full_name,email,application_id,status,joined_at').single()
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
        .select('participant_id,status,marked_at,participants!inner(participant_code,full_name,email,application_id)')
        .eq('attendance_session_id',session.id)
      if(error)throw error
      setSessionAttendance((data||[]).map((row:any)=>({
        ...row,
        participants:Array.isArray(row.participants)?row.participants[0]:row.participants
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
    if(!codes.length){setError('Paste at least one applicant ID.');return}
    setSaving(true);setError('');setNotice('')
    try{
      const matches=participants.filter(p=>p.application_id===selectedSession.application_id&&codes.includes(p.participant_code.toUpperCase()))
      const unknown=codes.filter(code=>!matches.some(p=>p.participant_code.toUpperCase()===code))
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

  const selectedAttendance=selectedSession?sessionAttendance:[]

  if(loading)return <div className="loading-card card">Loading participants…</div>

  return <section>
    <div className="page-heading compact">
      <div><p className="eyebrow">Programme management</p><h1>Participants</h1><p className="subtitle">Manage selected applicants after selection: permanent IDs, attendance and programme benefits.</p></div>
      <div className="status green"><BadgeCheck size={15}/> Applicant IDs active</div>
    </div>

    {error&&<div className="form-error page-error">{error}</div>}
    {notice&&<div className="form-message page-message">{notice}</div>}

    <div className="card" style={{padding:16,marginBottom:18}}>
      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
        <div className="stat-icon"><CheckCircle2 size={18}/></div>
        <div><strong>How participants are created</strong><p className="muted" style={{margin:'4px 0 0'}}>Applicants become participants automatically when their application is <strong>Approved</strong> during screening. ApplyFlow records them as <strong>Selected</strong> and assigns a permanent participant ID immediately.</p></div>
      </div>
    </div>

    <div className="card" style={{padding:14,marginBottom:18,display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}>
      <div><p className="eyebrow" style={{marginBottom:3}}>Current application</p><strong>{appName(applicationFilter)}</strong><p className="muted" style={{margin:0}}>Participants, attendance and benefits below are scoped to this application.</p></div>
      <select aria-label="Select application" value={applicationFilter} onChange={e=>setApplicationFilter(e.target.value)} style={{marginLeft:'auto',minWidth:240}}>
        {applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>

    <div className="tabs" style={{display:'flex',gap:8,marginBottom:18}}>
      {[
        ['participants','Participants'],
        ['attendance','Attendance'],
        ['benefits','Benefits']
      ].map(([key,label])=><button key={key} className={tab===key?'secondary-button':'text-button'} onClick={()=>setTab(key as any)}>{label}</button>)}
    </div>

    {tab==='participants'&&<>
      <div className="dashboard-grid" style={{gridTemplateColumns:'repeat(4,minmax(0,1fr))',marginBottom:16}}>
        <div className="card stat-card"><div className="stat-icon"><Users size={18}/></div><div><p className="eyebrow">Total</p><div className="stat-value">{stats.total}</div><p className="muted">Selected participants</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><BadgeCheck size={18}/></div><div><p className="eyebrow">Active</p><div className="stat-value">{stats.active}</div><p className="muted">Currently enrolled</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><CheckCircle2 size={18}/></div><div><p className="eyebrow">Completed</p><div className="stat-value">{stats.completed}</div><p className="muted">Finished programme</p></div></div>
        <div className="card stat-card"><div className="stat-icon"><X size={18}/></div><div><p className="eyebrow">Withdrawn</p><div className="stat-value">{stats.withdrawn}</div><p className="muted">No longer participating</p></div></div>
      </div>

      <div className="card table-card">
        <div className="card-header">
          <div><h2>Participant directory</h2><p>Showing participants selected and enrolled for the current application.</p></div>
          <div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search participants…"/></div>
        </div>
        <div style={{display:'flex',gap:10,padding:'0 18px 16px',flexWrap:'wrap'}}>
                    <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value as any)}><option value="all">All statuses</option><option value="active">Active</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></select>
        </div>
        <div className="table-wrap"><table><thead><tr><th>Applicant ID</th><th>Participant</th><th>Programme</th><th>Attendance</th><th>Status</th><th>Joined</th></tr></thead><tbody>
          {filtered.length?filtered.map(p=><tr key={p.id} className="clickable-row" onClick={()=>setSelectedParticipant(p)}>
            <td><strong>{p.participant_code}</strong></td>
            <td><strong>{p.full_name||'Unnamed participant'}</strong><span className="table-sub">{p.email||'No email'}</span></td>
            <td>{appName(p.application_id)}</td>
            <td>{p.attendance_count||0} present</td>
            <td><span className={'status '+(p.status==='active'?'green':p.status==='completed'?'blue':'neutral')}>{p.status}</span></td>
            <td>{new Date(p.joined_at).toLocaleDateString()}</td>
          </tr>):<tr><td colSpan={6}><div className="table-empty">{participants.length?'No participants match these filters.':'No participants yet. Select an applicant in Selection to create their participant record.'}</div></td></tr>}
        </tbody></table></div>
      </div>
    </>}

    {tab==='attendance'&&<div className="dashboard-grid">
      <div className="card table-card">
        <div className="card-header"><div><h2>Attendance sessions</h2><p>Create a class, then select it to manage attendance.</p></div></div>
        <form className="modal-form" onSubmit={createSession}>
          <label>Programme<select value={sessionForm.application_id} onChange={e=>setSessionForm(x=>({...x,application_id:e.target.value}))} required><option value="">Select programme</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Session title<input value={sessionForm.title} onChange={e=>setSessionForm(x=>({...x,title:e.target.value}))} placeholder="Class 1 — Introduction" required/></label>
          <label>Date<input type="date" value={sessionForm.session_date} onChange={e=>setSessionForm(x=>({...x,session_date:e.target.value}))} required/></label>
          <button className="primary-button" disabled={saving}><Plus size={16}/> Create session</button>
        </form>
        <div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Session</th><th>Programme</th><th>Date</th></tr></thead><tbody>
          {scopedSessions.length?scopedSessions.map(s=><tr key={s.id} className={selectedSession?.id===s.id?'clickable-row selected-row':'clickable-row'} onClick={()=>openSession(s)}><td><strong>{s.title}</strong></td><td>{appName(s.application_id)}</td><td>{new Date(s.session_date).toLocaleDateString()}</td></tr>):<tr><td colSpan={3}><div className="table-empty">No attendance sessions for this application yet.</div></td></tr>}
        </tbody></table></div>
      </div>
      <div className="card table-card">
        <div className="card-header"><div><h2>{selectedSession?selectedSession.title:'Session attendance'}</h2><p>{selectedSession?appName(selectedSession.application_id):'Select a session from the list.'}</p></div><CalendarCheck2 size={20}/></div>
        {!selectedSession?<div className="table-empty">Select an attendance session to see participants.</div>:attendanceLoading?<div className="loading-card">Loading attendance…</div>:<>
          <div className="table-wrap"><table><thead><tr><th>Participant</th><th>ID</th><th>Status</th><th></th></tr></thead><tbody>
            {selectedAttendance.length?selectedAttendance.map(r=><tr key={r.participant_id}><td><strong>{r.participants?.full_name||'Unnamed participant'}</strong><span className="table-sub">{r.participants?.email||''}</span></td><td>{r.participants?.participant_code}</td><td><span className={'status '+(r.status==='present'?'green':'neutral')}>{r.status}</span></td><td>{r.status==='present'?<button className="text-button" disabled={saving} onClick={()=>markAbsent(r.participant_id)}>Mark absent</button>:null}</td></tr>):<tr><td colSpan={4}><div className="table-empty">No attendance recorded for this session.</div></td></tr>}
          </tbody></table></div>
          <div style={{padding:16,borderTop:'1px solid var(--border,#e8e8e8)'}}>
            <textarea rows={5} value={ids} onChange={e=>setIds(e.target.value)} placeholder={'Paste participant IDs from Google Meet\nHC2-2026-0001\nHC2-2026-0007'} />
            <button className="primary-button" style={{marginTop:10}} onClick={importAttendance} disabled={saving}>{saving?'Importing…':'Import attendance IDs'}</button>
            <p className="muted" style={{marginTop:8}}>Only IDs belonging to this session’s programme are accepted.</p>
          </div>
        </>}
      </div>
    </div>}

    {tab==='benefits'&&<div className="dashboard-grid">
      <div className="card table-card">
        <div className="card-header"><div><h2>Benefit distributions</h2><p>Create and track data, stipends, devices or other programme benefits.</p></div><Gift size={20}/></div>
        <form className="modal-form" onSubmit={createBenefit}>
          <label>Programme<select value={benefitForm.application_id} onChange={e=>setBenefitForm(x=>({...x,application_id:e.target.value}))} required><option value="">Select programme</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <label>Benefit name<input value={benefitForm.name} onChange={e=>setBenefitForm(x=>({...x,name:e.target.value}))} placeholder="September data distribution" required/></label>
          <label>Description<textarea rows={3} value={benefitForm.description} onChange={e=>setBenefitForm(x=>({...x,description:e.target.value}))} placeholder="What participants will receive."/></label>
          <label>Distribution date<input type="date" value={benefitForm.distribution_date} onChange={e=>setBenefitForm(x=>({...x,distribution_date:e.target.value}))}/></label>
          <button className="primary-button" disabled={saving}><Plus size={16}/> Create distribution</button>
        </form>
      </div>
      <div className="card table-card">
        <div className="card-header"><div><h2>Upcoming / recent</h2><p>Recipient preparation can be added after the distribution is created.</p></div></div>
        <div className="table-wrap"><table><thead><tr><th>Benefit</th><th>Programme</th><th>Date</th><th>Recipients</th><th>Status</th></tr></thead><tbody>
          {scopedBenefits.length?scopedBenefits.map(b=><tr key={b.id}><td><strong>{b.name}</strong><span className="table-sub">{b.description||'—'}</span></td><td>{appName(b.application_id)}</td><td>{b.distribution_date?new Date(b.distribution_date).toLocaleDateString():'—'}</td><td>{b.recipient_count||0}</td><td><span className="status neutral">{b.status}</span></td></tr>):<tr><td colSpan={5}><div className="table-empty">No benefit distributions for this application yet.</div></td></tr>}
        </tbody></table></div>
      </div>
    </div>}

    {selectedParticipant&&<div className="preview-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedParticipant(null)}}>
      <div className="preview-panel card" style={{maxWidth:720}}>
        <div className="preview-header"><div><p className="eyebrow">Participant profile</p><h2>{selectedParticipant.participant_code}</h2><p>{selectedParticipant.full_name||'Unnamed participant'} · {appName(selectedParticipant.application_id)}</p></div><button className="icon-button" onClick={()=>setSelectedParticipant(null)} aria-label="Close"><X size={18}/></button></div>
        <div className="dashboard-grid" style={{marginBottom:16}}>
          <div className="card"><p className="eyebrow">Status</p><select value={selectedParticipant.status} disabled={saving} onChange={e=>updateParticipantStatus(selectedParticipant.id,e.target.value as Participant['status'])}><option value="active">Active — enrolled</option><option value="completed">Completed</option><option value="withdrawn">Withdrawn</option></select></div>
          <div className="card"><p className="eyebrow">Attendance</p><strong>{selectedParticipant.attendance_count||0} present</strong></div>
          <div className="card"><p className="eyebrow">Joined</p><strong>{new Date(selectedParticipant.joined_at).toLocaleDateString()}</strong></div>
        </div>
        <div className="card" style={{padding:16}}>
          <p className="eyebrow">Contact</p><p style={{margin:'4px 0'}}><strong>{selectedParticipant.full_name||'Unnamed participant'}</strong></p><p className="muted" style={{margin:0}}>{selectedParticipant.email||'No email available'}</p>
        </div>
        <div className="preview-footer"><button className="secondary-button" onClick={()=>setSelectedParticipant(null)}>Close</button></div>
      </div>
    </div>}
  </section>
}
