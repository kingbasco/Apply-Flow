import { useEffect, useMemo, useState } from 'react'
import { BadgeCheck, CalendarCheck2, Gift, Upload, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application = { id:string; name:string }
type Participant = { id:string; participant_code:string; full_name:string|null; email:string|null; application_id:string; status:string; joined_at:string }
type Session = { id:string; application_id:string; title:string; session_date:string }
type Benefit = { id:string; application_id:string; name:string; description:string|null; distribution_date:string|null; status:string }

export default function ParticipantsPanel({organizationId,applications}:{organizationId:string;applications:Application[]}) {
  const [tab,setTab]=useState<'participants'|'attendance'|'benefits'>('participants')
  const [participants,setParticipants]=useState<Participant[]>([])
  const [sessions,setSessions]=useState<Session[]>([])
  const [benefits,setBenefits]=useState<Benefit[]>([])
  const [selectedSession,setSelectedSession]=useState<Session|null>(null)
  const [query,setQuery]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [sessionForm,setSessionForm]=useState({application_id:'',title:'',session_date:new Date().toISOString().slice(0,10)})
  const [benefitForm,setBenefitForm]=useState({application_id:'',name:'',description:'',distribution_date:''})
  const [ids,setIds]=useState('')
  const [saving,setSaving]=useState(false)

  async function load(){
    setLoading(true);setError('')
    try{
      const [p,s,b]=await Promise.all([
        supabase.from('participants').select('id,participant_code,full_name,email,application_id,status,joined_at').eq('organization_id',organizationId).order('participant_code'),
        supabase.from('attendance_sessions').select('id,application_id,title,session_date').eq('organization_id',organizationId).order('session_date',{ascending:false}),
        supabase.from('benefit_distributions').select('id,application_id,name,description,distribution_date,status').eq('organization_id',organizationId).order('created_at',{ascending:false})
      ])
      if(p.error)throw p.error;if(s.error)throw s.error;if(b.error)throw b.error
      setParticipants(p.data||[]);setSessions(s.data||[]);setBenefits(b.data||[])
    }catch(e){setError(e instanceof Error?e.message:'Could not load programme participants.')}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[organizationId])

  const appName=(id:string)=>applications.find(a=>a.id===id)?.name||'Programme'
  const filtered=useMemo(()=>participants.filter(p=>[p.participant_code,p.full_name,p.email,appName(p.application_id)].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase())),[participants,query,applications])

  async function createSession(e:React.FormEvent){
    e.preventDefault();if(!sessionForm.application_id||!sessionForm.title.trim())return
    setSaving(true);setError('');setNotice('')
    try{
      const user=(await supabase.auth.getUser()).data.user
      const {data,error}=await supabase.from('attendance_sessions').insert({organization_id:organizationId,application_id:sessionForm.application_id,title:sessionForm.title.trim(),session_date:sessionForm.session_date,created_by:user?.id}).select('id,application_id,title,session_date').single()
      if(error)throw error
      setSessions(x=>[data,...x]);setSelectedSession(data);setIds('');setNotice('Attendance session created.')
    }catch(e){setError(e instanceof Error?e.message:'Could not create session.')}finally{setSaving(false)}
  }

  async function importAttendance(){
    if(!selectedSession)return
    const codes=[...new Set(ids.split(/[\\s,;]+/).map(x=>x.trim().toUpperCase()).filter(Boolean))]
    if(!codes.length){setError('Paste at least one participant ID.');return}
    setSaving(true);setError('');setNotice('')
    try{
      const matches=participants.filter(p=>codes.includes(p.participant_code.toUpperCase()))
      const unknown=codes.filter(code=>!matches.some(p=>p.participant_code.toUpperCase()===code))
      if(matches.length){
        const {error}=await supabase.from('attendance_records').upsert(matches.map(p=>({attendance_session_id:selectedSession.id,participant_id:p.id,status:'present',source:'google_meet_import',marked_at:new Date().toISOString()})),{onConflict:'attendance_session_id,participant_id'})
        if(error)throw error
      }
      setNotice('Marked '+matches.length+' present.'+(unknown.length?' '+unknown.length+' ID(s) not found.':''))
      setIds('')
    }catch(e){setError(e instanceof Error?e.message:'Could not import attendance.')}finally{setSaving(false)}
  }

  async function createBenefit(e:React.FormEvent){
    e.preventDefault();if(!benefitForm.application_id||!benefitForm.name.trim())return
    setSaving(true);setError('');setNotice('')
    try{
      const {data,error}=await supabase.from('benefit_distributions').insert({
        organization_id:organizationId,application_id:benefitForm.application_id,name:benefitForm.name.trim(),
        description:benefitForm.description.trim()||null,distribution_date:benefitForm.distribution_date||null,
        eligibility_rule:{type:'attendance',rule:'last_2_sessions'}
      }).select('id,application_id,name,description,distribution_date,status').single()
      if(error)throw error
      setBenefits(x=>[data,...x]);setBenefitForm({application_id:'',name:'',description:'',distribution_date:''});setNotice('Benefit distribution created.')
    }catch(e){setError(e instanceof Error?e.message:'Could not create distribution.')}finally{setSaving(false)}
  }

  if(loading)return <div className="loading-card card">Loading participants…</div>

  return <section>
    <div className="page-heading compact"><div><p className="eyebrow">Programme management</p><h1>Participants</h1><p className="subtitle">Permanent IDs, attendance and programme benefits.</p></div><div className="status green"><BadgeCheck size={15}/> HC2 IDs active</div></div>
    {error&&<div className="form-error page-error">{error}</div>}
    {notice&&<div className="form-message page-message">{notice}</div>}
    <div className="tabs" style={{display:'flex',gap:8,marginBottom:18}}>{[['participants','Participants'],['attendance','Attendance'],['benefits','Benefits']].map(([key,label])=><button key={key} className={tab===key?'secondary-button':'text-button'} onClick={()=>setTab(key as any)}>{label}</button>)}</div>

    {tab==='participants'&&<div className="card table-card">
      <div className="card-header"><div><h2>Participant directory</h2><p>Each selected participant receives a permanent HC2 ID.</p></div><div className="search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search ID, name or programme…"/></div></div>
      <div className="table-wrap"><table><thead><tr><th>Participant ID</th><th>Participant</th><th>Programme</th><th>Status</th><th>Joined</th></tr></thead><tbody>{filtered.length?filtered.map(p=><tr key={p.id}><td><strong>{p.participant_code}</strong></td><td><strong>{p.full_name||'Unnamed participant'}</strong><span className="table-sub">{p.email||'No email'}</span></td><td>{appName(p.application_id)}</td><td><span className="status green">{p.status}</span></td><td>{new Date(p.joined_at).toLocaleDateString()}</td></tr>):<tr><td colSpan={5}><div className="table-empty">No participants yet. Select an applicant to generate their HC2 ID.</div></td></tr>}</tbody></table></div>
    </div>}

    {tab==='attendance'&&<div className="dashboard-grid">
      <div className="card table-card"><div className="card-header"><div><h2>Attendance sessions</h2><p>Create a class, then paste IDs copied from Google Meet.</p></div></div>
        <form className="modal-form" onSubmit={createSession}><label>Programme<select value={sessionForm.application_id} onChange={e=>setSessionForm(x=>({...x,application_id:e.target.value}))} required><option value="">Select programme</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Session title<input value={sessionForm.title} onChange={e=>setSessionForm(x=>({...x,title:e.target.value}))} placeholder="Class 1 — Introduction" required/></label><label>Date<input type="date" value={sessionForm.session_date} onChange={e=>setSessionForm(x=>({...x,session_date:e.target.value}))} required/></label><button className="primary-button" disabled={saving}><Plus size={16}/> Create session</button></form>
        <div className="table-wrap" style={{marginTop:18}}><table><thead><tr><th>Session</th><th>Programme</th><th>Date</th></tr></thead><tbody>{sessions.map(s=><tr key={s.id} className="clickable-row" onClick={()=>setSelectedSession(s)}><td><strong>{s.title}</strong></td><td>{appName(s.application_id)}</td><td>{new Date(s.session_date).toLocaleDateString()}</td></tr>)}</tbody></table></div>
      </div>
      <div className="card funnel-card"><div className="card-header"><div><h2>Import attendance</h2><p>{selectedSession?selectedSession.title:'Select a session first.'}</p></div><CalendarCheck2 size={20}/></div><textarea rows={10} value={ids} onChange={e=>setIds(e.target.value)} placeholder={'HC2-2026-0001\\nHC2-2026-0007\\nHC2-2026-0012'} disabled={!selectedSession}/><button className="primary-button" style={{marginTop:12}} onClick={importAttendance} disabled={!selectedSession||saving}><Upload size={16}/> {saving?'Importing…':'Import IDs'}</button><p className="muted" style={{marginTop:10}}>Paste one ID per line or paste the full Google Meet chat list. ApplyFlow matches valid HC2 IDs and ignores unknown IDs.</p></div>
    </div>}

    {tab==='benefits'&&<div className="dashboard-grid">
      <div className="card table-card"><div className="card-header"><div><h2>Benefit distributions</h2><p>Track data, stipends, devices or other programme benefits.</p></div><Gift size={20}/></div><form className="modal-form" onSubmit={createBenefit}><label>Programme<select value={benefitForm.application_id} onChange={e=>setBenefitForm(x=>({...x,application_id:e.target.value}))} required><option value="">Select programme</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Benefit name<input value={benefitForm.name} onChange={e=>setBenefitForm(x=>({...x,name:e.target.value}))} placeholder="September data distribution" required/></label><label>Description<textarea rows={3} value={benefitForm.description} onChange={e=>setBenefitForm(x=>({...x,description:e.target.value}))} placeholder="What participants will receive."/></label><label>Distribution date<input type="date" value={benefitForm.distribution_date} onChange={e=>setBenefitForm(x=>({...x,distribution_date:e.target.value}))}/></label><button className="primary-button" disabled={saving}><Plus size={16}/> Create distribution</button></form></div>
      <div className="card table-card"><div className="card-header"><div><h2>Upcoming / recent</h2><p>Attendance eligibility can be applied before distribution.</p></div></div><div className="table-wrap"><table><thead><tr><th>Benefit</th><th>Programme</th><th>Date</th><th>Status</th></tr></thead><tbody>{benefits.length?benefits.map(b=><tr key={b.id}><td><strong>{b.name}</strong><span className="table-sub">{b.description||'—'}</span></td><td>{appName(b.application_id)}</td><td>{b.distribution_date?new Date(b.distribution_date).toLocaleDateString():'—'}</td><td><span className="status neutral">{b.status}</span></td></tr>):<tr><td colSpan={4}><div className="table-empty">No benefit distributions yet.</div></td></tr>}</tbody></table></div></div>
    </div>}
  </section>
}
