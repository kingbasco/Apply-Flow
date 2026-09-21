import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3, Bell, ChevronDown, ClipboardList, FileCheck2, FileText,
  FolderKanban, LayoutDashboard, LogOut, Menu, Plus, Search, Settings,
  ShieldCheck, Sparkles, Users, X,
} from 'lucide-react'
import { supabase } from './lib/supabase'

type AppStatus = 'draft' | 'published' | 'screening' | 'closed' | 'completed'
type Application = {
  id: string; name: string; description: string | null; status: AppStatus
  deadline: string | null; target_count: number | null; created_at: string
}
type Profile = { id: string; full_name: string | null; organization_id: string | null; role: 'owner'|'admin'|'reviewer' }
type Organization = { id: string; name: string; slug: string }

const nav = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'Applications', icon: FolderKanban },
  { label: 'Forms', icon: FileText }, { label: 'Screening', icon: ShieldCheck },
  { label: 'Reviews', icon: ClipboardList }, { label: 'Analytics', icon: BarChart3 },
]
const bottomNav = [{ label: 'Team', icon: Users }, { label: 'Settings', icon: Settings }]

function statusLabel(status: AppStatus) { return status.charAt(0).toUpperCase() + status.slice(1) }
function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value))
}

function AuthScreen({ onSignedIn }: { onSignedIn: () => void }) {
  const [mode, setMode] = useState<'signin'|'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onSignedIn()
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (!data.user) throw new Error('Account could not be created.')
        if (!data.session) {
          setMessage('Account created. Check your email to confirm your address, then sign in.')
          return
        }
        const slug = orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'organisation'
        const { data: org, error: orgError } = await supabase.from('organizations').insert({ name: orgName.trim(), slug, created_by: data.user.id }).select('id,name,slug').single()
        if (orgError) throw orgError
        const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, full_name: name.trim() || null, organization_id: org.id, role: 'owner' })
        if (profileError) throw profileError
        onSignedIn()
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') }
    finally { setBusy(false) }
  }

  return <div className="auth-shell">
    <div className="auth-panel">
      <div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application OS</span></div></div>
      <div className="auth-copy"><p className="eyebrow">Workspace access</p><h1>{mode === 'signin' ? 'Welcome back.' : 'Create your workspace.'}</h1><p>{mode === 'signin' ? 'Sign in to manage applications, screening and selections.' : 'Set up your organisation and start managing applications.'}</p></div>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && <><label>Full name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Cyril Adesegha" required /></label><label>Organisation name<input value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="Emerging Communities" required /></label></>}
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@organisation.com" required /></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" minLength={6} required /></label>
        {error && <div className="form-error">{error}</div>}{message && <div className="form-message">{message}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create workspace'}</button>
      </form>
      <button className="auth-switch" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('');setMessage('')}}>{mode==='signin' ? 'Need an account? Create a workspace' : 'Already have an account? Sign in'}</button>
    </div>
    <div className="auth-aside"><div><span className="aside-kicker">APPLYFLOW</span><h2>From applications to decisions, in one workspace.</h2><p>Collect applications, evaluate eligibility, screen candidates and move the right people through your programme.</p></div><div className="aside-stat"><strong>One source of truth</strong><span>Forms · Eligibility · Screening · Reviews · Selection</span></div></div>
  </div>
}

function PublicApplication({slug}:{slug:string}) {
  const [loading,setLoading]=useState(true), [error,setError]=useState(''), [submitted,setSubmitted]=useState(false)
  const [app,setApp]=useState<{id:string;name:string;description:string|null;deadline:string|null} | null>(null)
  const [settings,setSettings]=useState<{confirmation_message:string}|null>(null)
  const [questions,setQuestions]=useState<BuilderQuestion[]>([]), [answers,setAnswers]=useState<Record<string,string|string[]>>({})
  useEffect(()=>{(async()=>{try{
    const {data:s,error:se}=await supabase.from('application_settings').select('application_id,confirmation_message').eq('public_slug',slug).single(); if(se)throw se
    const {data:a,error:ae}=await supabase.from('applications').select('id,name,description,deadline').eq('id',s.application_id).eq('status','published').single(); if(ae)throw ae
    const {data:v,error:ve}=await supabase.from('form_versions').select('id').eq('application_id',a.id).eq('status','published').order('version_number',{ascending:false}).limit(1).single(); if(ve)throw ve
    const {data:qs,error:qe}=await supabase.from('questions').select('id,type,label,description,required,placeholder,position,config,conditional_rules').eq('form_version_id',v.id).order('position'); if(qe)throw qe
    const full=await Promise.all((qs||[]).map(async q=>{const {data:o,error:oe}=await supabase.from('question_options').select('id,label,value,position').eq('question_id',q.id).order('position');if(oe)throw oe;return {...q,options:o||[]}}))
    setApp(a);setSettings(s);setQuestions(full as BuilderQuestion[])
  }catch(e){setError(e instanceof Error?e.message:'This application is unavailable.')}finally{setLoading(false)}})()},[slug])
  const visible=(q:BuilderQuestion)=>{const r=q.conditional_rules?.[0];if(!r)return true;return answers[r.question_id]===r.value}
  function setAnswer(id:string,value:string|string[]){setAnswers(x=>({...x,[id]:value}))}
  async function submit(e:React.FormEvent){e.preventDefault();setError('');for(const q of questions){if(visible(q)&&q.required&&!answers[q.id]){setError(`Please answer: ${q.label}`);return}}setLoading(true);try{
    const emailQ=questions.find(q=>q.type==='email'), nameQ=questions.find(q=>q.label.toLowerCase().includes('full name')||q.label.toLowerCase()==='name')
    const {data:applicant,error:ae}=await supabase.from('applicants').insert({application_id:app!.id,email:emailQ?String(answers[emailQ.id]||''):null,full_name:nameQ?String(answers[nameQ.id]||''):null}).select('id').single();if(ae)throw ae
    const {data:v}=await supabase.from('form_versions').select('id').eq('application_id',app!.id).eq('status','published').order('version_number',{ascending:false}).limit(1).single()
    const {data:sub,error:se}=await supabase.from('submissions').insert({application_id:app!.id,form_version_id:v.id,applicant_id:applicant.id,status:'submitted',submitted_at:new Date().toISOString()}).select('id').single();if(se)throw se
    const rows=questions.filter(q=>visible(q)&&answers[q.id]!==undefined).map(q=>({submission_id:sub.id,question_id:q.id,value:answers[q.id]}))
    const {error:ansError}=await supabase.from('answers').insert(rows);if(ansError)throw ansError
    const {error:eligibilityError}=await supabase.rpc('evaluate_submission_eligibility',{p_submission_id:sub.id});if(eligibilityError)throw eligibilityError
    setSubmitted(true)
  }catch(e){setError(e instanceof Error?e.message:'Could not submit application.')}finally{setLoading(false)}}
  if(loading&&!app)return <div className="public-shell"><div className="public-card card">Loading application…</div></div>
  if(error&&!app)return <div className="public-shell"><div className="public-card card"><div className="empty-icon"><FileText size={22}/></div><h1>Application unavailable</h1><p>{error}</p></div></div>
  if(submitted)return <div className="public-shell"><div className="public-card card public-success"><div className="success-mark">✓</div><p className="eyebrow">Application submitted</p><h1>Thank you.</h1><p>{settings?.confirmation_message}</p></div></div>
  return <div className="public-shell"><form className="public-card card public-form" onSubmit={submit}><div className="public-header"><p className="eyebrow">Application</p><h1>{app?.name}</h1><p>{app?.description||'Complete the form below to apply.'}</p>{app?.deadline&&<span className="public-deadline">Deadline: {formatDate(app.deadline)}</span>}</div>{questions.map((q,i)=>visible(q)&&<div className="public-question" key={q.id}><label><span>{i+1}. {q.label}{q.required&&<span className="required-star">*</span>}</span>{q.description&&<small>{q.description}</small>}</label>{q.type==='long_text'?<textarea value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='date'?<input type="date" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)}/>:q.type==='number'?<input type="number" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='email'?<input type="email" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='phone'?<input type="tel" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='dropdown'?<select value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)}><option value="">Select an option</option>{q.options.map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select>:q.type==='single_choice'||q.type==='yes_no'?<div className="public-options">{q.options.map(o=><label key={o.id}><input type="radio" name={q.id} checked={answers[q.id]===o.value} onChange={()=>setAnswer(q.id,o.value)}/><span>{o.label}</span></label>)}</div>:q.type==='multiple_choice'?<div className="public-options">{q.options.map(o=><label key={o.id}><input type="checkbox" checked={Array.isArray(answers[q.id])&&answers[q.id].includes(o.value)} onChange={e=>{const current=Array.isArray(answers[q.id])?answers[q.id]:[];setAnswer(q.id,e.target.checked?[...current,o.value]:current.filter(v=>v!==o.value))}}/><span>{o.label}</span></label>)}</div>:q.type==='rating'?<div className="rating-options">{[1,2,3,4,5].map(n=><button type="button" key={n} className={answers[q.id]===String(n)?'rating-active':''} onClick={()=>setAnswer(q.id,String(n))}>{n}</button>)}</div>:q.type==='file'||q.type==='image'?<input type="file" onChange={e=>setAnswer(q.id,e.target.files?.[0]?.name||'')}/>:<input value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>}</div>)}{error&&<div className="form-error">{error}</div>}<button className="primary-button public-submit" disabled={loading}>{loading?'Submitting…':'Submit application'}</button></form></div>
}

function App() {
  const [sessionReady, setSessionReady] = useState(false)
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [active, setActive] = useState('Dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [detailTab, setDetailTab] = useState<'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants'>('Overview')
  const [applicationSettings, setApplicationSettings] = useState<{ public_slug: string; confirmation_message: string } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [newTarget, setNewTarget] = useState('')

  async function loadWorkspace(currentSession = session) {
    if (!currentSession?.user) return
    setLoading(true); setError('')
    const { data: p, error: pError } = await supabase.from('profiles').select('id,full_name,organization_id,role').eq('id', currentSession.user.id).single()
    if (pError) { setError(pError.message); setLoading(false); return }
    setProfile(p)
    if (p.organization_id) {
      const [{ data: org, error: oError }, { data: apps, error: aError }] = await Promise.all([
        supabase.from('organizations').select('id,name,slug').eq('id', p.organization_id).single(),
        supabase.from('applications').select('id,name,description,status,deadline,target_count,created_at').eq('organization_id', p.organization_id).order('created_at', { ascending: false }),
      ])
      if (oError) setError(oError.message); else setOrganization(org)
      if (aError) setError(aError.message); else setApplications(apps ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionReady(true); if (data.session) loadWorkspace(data.session) })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { setSession(next); if (next) loadWorkspace(next) })
    return () => listener.subscription.unsubscribe()
  }, [])

  const filtered = useMemo(() => applications.filter(a => a.name.toLowerCase().includes(query.toLowerCase())), [applications, query])
  const totalTarget = applications.reduce((sum,a)=>sum+(a.target_count ?? 0),0)
  const profileName = profile?.full_name || session?.user.email?.split('@')[0] || 'there'
  const firstName = profileName.split(' ')[0]

  if (window.location.pathname.startsWith('/apply/')) return <PublicApplication slug={decodeURIComponent(window.location.pathname.split('/')[2] || '')} />
  if (!sessionReady) return <div className="loading-screen"><div className="brand-mark">A</div><span>Loading ApplyFlow…</span></div>
  if (!session) return <AuthScreen onSignedIn={()=>setSessionReady(true)} />

  async function signOut() { await supabase.auth.signOut(); setSession(null); setProfile(null); setOrganization(null); setApplications([]) }

  async function openApplication(application: Application) {
    setSelectedApplication(application)
    setDetailTab('Overview')
    setDetailLoading(true)
    setDetailError('')
    const { data, error: settingsError } = await supabase.from('application_settings').select('public_slug,confirmation_message').eq('application_id', application.id).single()
    if (settingsError) setDetailError(settingsError.message)
    setApplicationSettings(data)
    setDetailLoading(false)
  }

  function closeApplication() {
    setSelectedApplication(null)
    setApplicationSettings(null)
    setDetailError('')
  }

  async function saveApplicationDetails(patch: Partial<Application>, settingsPatch?: Partial<{public_slug:string;confirmation_message:string}>) {
    if (!selectedApplication) return
    setDetailSaving(true); setDetailError('')
    try {
      const { data, error: updateError } = await supabase.from('applications')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', selectedApplication.id)
        .select('id,name,description,status,deadline,target_count,created_at')
        .single()
      if (updateError) throw updateError
      let nextSettings = applicationSettings
      if (settingsPatch) {
        const { data: s, error: sError } = await supabase.from('application_settings').update(settingsPatch).eq('application_id', selectedApplication.id).select('public_slug,confirmation_message').single()
        if (sError) throw sError
        nextSettings = s
      }
      setSelectedApplication(data)
      setApplicationSettings(nextSettings)
      setApplications(current => current.map(item => item.id === data.id ? data : item))
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : 'Could not save changes.')
    } finally { setDetailSaving(false) }
  }

  function openCreate() { setCreateError(''); setNewName(''); setNewDescription(''); setNewDeadline(''); setNewTarget(''); setCreateOpen(true) }

  async function createApplication(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.user || !profile?.organization_id) return
    if (!newName.trim()) { setCreateError('Programme name is required.'); return }
    setCreating(true); setCreateError('')
    try {
      const { data: application, error: applicationError } = await supabase.from('applications')
        .insert({
          organization_id: profile.organization_id,
          created_by: session.user.id,
          name: newName.trim(),
          description: newDescription.trim() || null,
          deadline: newDeadline || null,
          target_count: newTarget ? Number(newTarget) : null,
          status: 'draft',
        })
        .select('id,name,description,status,deadline,target_count,created_at')
        .single()
      if (applicationError) throw applicationError

      const slugBase = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'application'
      const publicSlug = `${slugBase}-${application.id.slice(0, 8)}`
      const { error: settingsError } = await supabase.from('application_settings').insert({
        application_id: application.id,
        public_slug: publicSlug,
      })
      if (settingsError) throw settingsError

      setApplications(current => [application, ...current])
      setCreateOpen(false)
      setActive('Applications')
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Could not create the application.')
    } finally {
      setCreating(false)
    }
  }

  return <div className="app-shell">
    <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application OS</span></div><button className="mobile-close" onClick={()=>setSidebarOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="workspace-switcher"><div className="workspace-avatar">{(organization?.name || 'A').charAt(0).toUpperCase()}</div><div className="workspace-copy"><strong>{organization?.name || 'Your organisation'}</strong><span>Organisation</span></div><ChevronDown size={16} className="muted-icon"/></div>
      <nav className="nav-group"><p className="nav-label">Workspace</p>{nav.map(({label,icon:Icon})=><button key={label} className={active===label?'nav-item active':'nav-item'} onClick={()=>{setActive(label);setSidebarOpen(false)}}><Icon size={18}/><span>{label}</span>{label==='Screening'&&<span className="nav-count">0</span>}</button>)}</nav>
      <nav className="nav-group bottom"><p className="nav-label">Manage</p>{bottomNav.map(({label,icon:Icon})=><button key={label} className={active===label?'nav-item active':'nav-item'} onClick={()=>{setActive(label);setSidebarOpen(false)}}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-footer"><div className="help-card"><Sparkles size={17}/><div><strong>AI screening</strong><span>Coming in the next phase</span></div></div><div className="profile-row"><div className="profile-avatar">{profileName.slice(0,2).toUpperCase()}</div><div><strong>{profileName}</strong><span>{profile?.role || 'Owner'}</span></div><button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={15}/></button></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setSidebarOpen(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{active}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={18}/></button><div className="top-avatar">{profileName.slice(0,2).toUpperCase()}</div></div></header>
      <div className="content">
        {selectedApplication ? <ApplicationDetails application={selectedApplication} settings={applicationSettings} tab={detailTab} setTab={setDetailTab} loading={detailLoading} saving={detailSaving} error={detailError} onBack={closeApplication} onSave={saveApplicationDetails} /> : loading ? <div className="loading-card card">Loading your workspace…</div> : error ? <div className="form-error page-error">{error}</div> : active==='Dashboard' ? <>
          <section className="page-heading"><div><p className="eyebrow">Your workspace</p><h1>Good evening, {firstName}.</h1><p className="subtitle">Here’s what is happening across your programmes.</p></div><button className="primary-button" onClick={openCreate}><Plus size={17}/> New application</button></section>
          <section className="stats-grid"><StatCard label="Programmes" value={applications.length.toLocaleString()} note="In your workspace" icon={FolderKanban}/><StatCard label="Targets" value={totalTarget.toLocaleString()} note="Across programmes" icon={FileCheck2}/><StatCard label="Published" value={applications.filter(a=>a.status==='published').length.toLocaleString()} note="Currently accepting" icon={ShieldCheck}/><StatCard label="Screening" value={applications.filter(a=>a.status==='screening').length.toLocaleString()} note="In review" icon={Users}/></section>
          <section className="dashboard-grid"><div className="card table-card"><div className="card-header"><div><h2>Programmes</h2><p>Your application programmes from Supabase.</p></div><button className="text-button" onClick={()=>setActive('Applications')}>View all</button></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Target</th><th>Deadline</th></tr></thead><tbody>{applications.length===0?<tr><td colSpan={4}><div className="table-empty">No programmes yet. Create your first application programme.</div></td></tr>:applications.map(item=><tr key={item.id}><td><strong>{item.name}</strong><span className="table-sub">{item.description || 'No description yet.'}</span></td><td><span className={'status '+(item.status==='published'?'blue':item.status==='screening'?'amber':item.status==='completed'?'green':'neutral')}>{statusLabel(item.status)}</span></td><td>{(item.target_count??0).toLocaleString()}</td><td>{formatDate(item.deadline)}</td></tr>)}</tbody></table></div></div><div className="card funnel-card"><div className="card-header"><div><h2>Workspace health</h2><p>Live database connection</p></div><span className="status green">Connected</span></div><div className="connection-list"><div><span>Organisation</span><strong>{organization?.name || '—'}</strong></div><div><span>Role</span><strong>{profile?.role || '—'}</strong></div><div><span>Programmes</span><strong>{applications.length}</strong></div></div></div></section>
        </> : <section><div className="page-heading compact"><div><p className="eyebrow">Workspace</p><h1>{active}</h1><p className="subtitle">{active==='Applications'?'Manage your application programmes.':'This module is scaffolded and ready for the next implementation phase.'}</p></div>{active==='Applications'&&<button className="primary-button" onClick={openCreate}><Plus size={17}/> New application</button>}</div>{active==='Applications'?<div className="card table-card"><div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search applications…"/></div><button className="secondary-button">All status <ChevronDown size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Target</th><th>Deadline</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id} onClick={()=>openApplication(item)} className="clickable-row"><td><strong>{item.name}</strong><span className="table-sub">{item.description || 'No description yet.'}</span></td><td><span className={'status '+(item.status==='published'?'blue':item.status==='screening'?'amber':item.status==='completed'?'green':'neutral')}>{statusLabel(item.status)}</span></td><td>{(item.target_count??0).toLocaleString()}</td><td>{formatDate(item.deadline)}</td></tr>)}</tbody></table></div></div>:<div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>{active} is coming next</h2><p>The shared workspace is now connected to Supabase. We’ll build this module on top of the live architecture.</p></div>}</section>}
      </div>
    </main>
    {createOpen && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCreateOpen(false)}}>
      <form className="modal card" onSubmit={createApplication}>
        <div className="modal-header"><div><p className="eyebrow">New programme</p><h2>Create an application programme</h2><p>Start with the basic programme details. You can build the form after this.</p></div><button type="button" className="icon-button" onClick={()=>setCreateOpen(false)} aria-label="Close"><X size={18}/></button></div>
        <div className="modal-form">
          <label>Programme name<input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Hertisan Women Artisans — Cohort 3" required /></label>
          <label>Description <span className="optional">Optional</span><textarea value={newDescription} onChange={e=>setNewDescription(e.target.value)} placeholder="Briefly describe who this programme is for and what it offers." rows={4}/></label>
          <div className="form-grid"><label>Application deadline <span className="optional">Optional</span><input type="date" value={newDeadline} onChange={e=>setNewDeadline(e.target.value)} /></label><label>Target number <span className="optional">Optional</span><input type="number" min="0" value={newTarget} onChange={e=>setNewTarget(e.target.value)} placeholder="150" /></label></div>
          {createError && <div className="form-error">{createError}</div>}
        </div>
        <div className="modal-footer"><button type="button" className="secondary-button" onClick={()=>setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={creating}>{creating?'Creating…':'Create programme'}</button></div>
      </form>
    </div>}
  </div>
}


function ApplicantsPanel({applicationId}:{applicationId:string}) {
  type Row={id:string;applicant_id:string;full_name:string|null;email:string|null;status:string;submitted_at:string|null;created_at:string}
  const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[selected,setSelected]=useState<Row|null>(null)
  const [answerRows,setAnswerRows]=useState<{label:string;value:string}[]>([])
  useEffect(()=>{(async()=>{try{
    const {data,error}=await supabase.from('submissions').select('id,applicant_id,status,submitted_at,created_at,applicants!inner(full_name,email)').eq('application_id',applicationId).order('submitted_at',{ascending:false})
    if(error)throw error
    setRows((data||[]).map((r:any)=>({id:r.id,applicant_id:r.applicant_id,status:r.status,submitted_at:r.submitted_at,created_at:r.created_at,full_name:r.applicants?.full_name||null,email:r.applicants?.email||null})))
  }catch(e){setError(e instanceof Error?e.message:'Could not load applicants.')}finally{setLoading(false)}})()},[applicationId])
  const filtered=useMemo(()=>rows.filter(r=>[r.full_name,r.email,r.status].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase())),[rows,query])
  async function open(row:Row){
    setSelected(row);setAnswerRows([])
    const {data,error}=await supabase.from('answers').select('question_id,value').eq('submission_id',row.id)
    if(error){setError(error.message);return}
    if(data?.length){const ids=data.map(x=>x.question_id);const {data:qs}=await supabase.from('questions').select('id,label').in('id',ids);const labels=new Map((qs||[]).map(q=>[q.id,q.label]));setAnswerRows(data.map(x=>({label:labels.get(x.question_id)||'Question',value:Array.isArray(x.value)?x.value.join(', '):String(x.value??'')})))}
  }
  if(loading)return <div className="loading-card card">Loading applicants…</div>
  if(error)return <div className="form-error page-error">{error}</div>
  return <div className="applicants-panel">
    <div className="applicants-toolbar"><div><p className="eyebrow">Applications received</p><h2>{rows.length} applicant{rows.length===1?'':'s'}</h2></div><div className="applicant-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name or email"/></div></div>
    {!filtered.length?<div className="empty-state card"><div className="empty-icon"><Users size={22}/></div><h2>No applicants yet</h2><p>Submitted applications will appear here.</p></div>:<div className="card applicants-table-wrap"><table className="applicants-table"><thead><tr><th>Applicant</th><th>Email</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.id} onClick={()=>open(r)}><td><strong>{r.full_name||'Unnamed applicant'}</strong><span>#{r.applicant_id.slice(0,8)}</span></td><td>{r.email||'—'}</td><td><span className="status blue">{statusLabel(r.status as AppStatus)}</span></td><td>{r.submitted_at?formatDate(r.submitted_at):'—'}</td><td><button className="text-button" onClick={e=>{e.stopPropagation();open(r)}}>View</button></td></tr>)}</tbody></table></div>}
    {selected&&<div className="applicant-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="applicant-drawer"><div className="drawer-header"><div><p className="eyebrow">Applicant</p><h2>{selected.full_name||'Unnamed applicant'}</h2><p>{selected.email||'No email provided'}</p></div><button className="icon-button" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="drawer-meta"><div><span>Status</span><strong>{statusLabel(selected.status as AppStatus)}</strong></div><div><span>Submitted</span><strong>{selected.submitted_at?formatDate(selected.submitted_at):'—'}</strong></div></div><div className="drawer-section"><p className="eyebrow">Application answers</p>{answerRows.length?answerRows.map((a,i)=><div className="answer-item" key={i}><strong>{a.label}</strong><span>{a.value||'Not provided'}</span></div>):<p className="muted">No answers recorded.</p>}</div></aside></div>}
  </div>
}

function ApplicationDetails({ application, settings, tab, setTab, loading, saving, error, onBack, onSave }:{
  application: Application
  settings: {public_slug:string; confirmation_message:string} | null
  tab: 'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants'
  setTab: (tab:'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants') => void
  loading: boolean; saving: boolean; error: string; onBack:()=>void
  onSave:(patch:Partial<Application>, settingsPatch?:Partial<{public_slug:string;confirmation_message:string}>)=>Promise<void>
}) {
  const [name,setName]=useState(application.name), [description,setDescription]=useState(application.description||'')
  const [deadline,setDeadline]=useState(application.deadline||''), [target,setTarget]=useState(application.target_count?.toString()||'')
  const [slug,setSlug]=useState(settings?.public_slug||''), [message,setMessage]=useState(settings?.confirmation_message||'')
  useEffect(()=>{setName(application.name);setDescription(application.description||'');setDeadline(application.deadline||'');setTarget(application.target_count?.toString()||'')},[application])
  useEffect(()=>{setSlug(settings?.public_slug||'');setMessage(settings?.confirmation_message||'')},[settings])
  const tabs=['Overview','Form','Eligibility','Scoring','Screening','Applicants'] as const
  return <section className="application-detail">
    <button className="back-link" onClick={onBack}>← Back to applications</button>
    <div className="detail-header"><div><p className="eyebrow">Application programme</p><div className="detail-title-row"><h1>{application.name}</h1><span className={'status '+(application.status==='published'?'blue':application.status==='screening'?'amber':'neutral')}>{statusLabel(application.status)}</span></div><p className="subtitle">{application.description||'No description yet.'}</p></div><div className="detail-actions">{application.status==='draft'&&<button className="primary-button" disabled={saving} onClick={()=>onSave({status:'published'})}>Publish</button>}{application.status==='published'&&<button className="secondary-button" disabled={saving} onClick={()=>onSave({status:'closed'})}>Close applications</button>}</div></div>
    <div className="detail-meta"><div><span>Deadline</span><strong>{formatDate(application.deadline)}</strong></div><div><span>Target</span><strong>{application.target_count?.toLocaleString()||'Not set'}</strong></div><div><span>Public URL</span><strong>/apply/{settings?.public_slug||'not-configured'}</strong></div></div>
    <div className="detail-tabs">{tabs.map(t=><button key={t} className={tab===t?'detail-tab active':'detail-tab'} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {loading?<div className="loading-card card">Loading programme settings…</div>:error?<div className="form-error page-error">{error}</div>:tab==='Overview'?<div className="detail-grid">
      <div className="card detail-card"><div className="card-header"><div><h2>Programme details</h2><p>Update the basic information for this programme.</p></div></div><div className="detail-form"><label>Programme name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Description<textarea rows={5} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="form-grid"><label>Application deadline<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>Target number<input type="number" min="0" value={target} onChange={e=>setTarget(e.target.value)}/></label></div><div className="detail-form-footer"><button className="primary-button" disabled={saving} onClick={()=>onSave({name:name.trim(),description:description.trim()||null,deadline:deadline||null,target_count:target?Number(target):null})}>{saving?'Saving…':'Save changes'}</button></div></div></div>
      <div className="card detail-card"><div className="card-header"><div><h2>Public application</h2><p>Settings applicants will see.</p></div></div><div className="detail-form"><label>Public slug<input value={slug} onChange={e=>setSlug(e.target.value)}/></label><label>Confirmation message<textarea rows={5} value={message} onChange={e=>setMessage(e.target.value)}/></label><div className="detail-form-footer"><button className="secondary-button" disabled={saving} onClick={()=>onSave({}, {public_slug:slug.trim(),confirmation_message:message.trim()||'Thank you. Your application has been received.'})}>Save public settings</button></div></div></div>
    </div>:tab==='Form'?<FormBuilder applicationId={application.id}/>:tab==='Applicants'?<ApplicantsPanel applicationId={application.id}/>:tab==='Eligibility'?<EligibilityBuilder applicationId={application.id}/>:tab==='Scoring'?<ScoringBuilder applicationId={application.id}/>:<div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>{tab} is next</h2><p>This section is connected to the programme workspace and will be built on the live data model.</p></div>}
  </section>
}

type QuestionType='short_text'|'long_text'|'email'|'phone'|'number'|'date'|'dropdown'|'single_choice'|'multiple_choice'|'yes_no'|'file'|'image'|'rating'
type BuilderOption={id:string;label:string;value:string;position:number}
type BuilderQuestion={id:string;type:QuestionType;label:string;description:string|null;required:boolean;placeholder:string|null;position:number;config:Record<string,unknown>;conditional_rules:ConditionRule[]|null;options:BuilderOption[]}
type ConditionRule={question_id:string;operator:'equals'|'not_equals';value:string}
const questionTypes:{type:QuestionType;label:string;icon:string}[]=[
 {type:'short_text',label:'Short text',icon:'Aa'},{type:'long_text',label:'Long text',icon:'¶'},{type:'email',label:'Email',icon:'@'},{type:'phone',label:'Phone',icon:'☎'},
 {type:'number',label:'Number',icon:'#'},{type:'date',label:'Date',icon:'◫'},{type:'dropdown',label:'Dropdown',icon:'⌄'},{type:'single_choice',label:'Single choice',icon:'○'},
 {type:'multiple_choice',label:'Multiple choice',icon:'☑'},{type:'yes_no',label:'Yes / No',icon:'Y/N'},{type:'file',label:'File upload',icon:'↑'},{type:'image',label:'Image upload',icon:'▧'},{type:'rating',label:'Rating',icon:'★'}
]


type EligibilityOperator='='|'!='|'>'|'<'|'>='|'<='|'IN'|'NOT IN'
type EligibilityRule={id:string;application_id:string;question_id:string;operator:EligibilityOperator;value:unknown;logic:'AND'|'OR';position:number;enabled:boolean}

function EligibilityBuilder({applicationId}:{applicationId:string}) {
  const [questions,setQuestions]=useState<BuilderQuestion[]>([])
  const [rules,setRules]=useState<EligibilityRule[]>([])
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')

  async function load(){
    setLoading(true);setNotice('')
    try{
      const {data:versions,error:ve}=await supabase.from('form_versions').select('id,status,version_number').eq('application_id',applicationId).order('version_number',{ascending:false}).limit(10)
      if(ve)throw ve
      const version=(versions||[]).find(v=>v.status==='draft')||(versions||[]).find(v=>v.status==='published')
      if(version){
        const {data:qs,error:qe}=await supabase.from('questions').select('id,type,label,description,required,placeholder,position,config,conditional_rules').eq('form_version_id',version.id).order('position')
        if(qe)throw qe
        const full=await Promise.all((qs||[]).map(async q=>{const {data:o,error:oe}=await supabase.from('question_options').select('id,label,value,position').eq('question_id',q.id).order('position');if(oe)throw oe;return {...q,options:o||[]}}))
        setQuestions(full as BuilderQuestion[])
      } else setQuestions([])
      const {data:rs,error:re}=await supabase.from('eligibility_rules').select('id,application_id,question_id,operator,value,logic,position,enabled').eq('application_id',applicationId).order('position')
      if(re)throw re
      setRules((rs||[]) as EligibilityRule[])
    }catch(e){setNotice(e instanceof Error?e.message:'Could not load eligibility rules.')}finally{setLoading(false)}
  }

  useEffect(()=>{load()},[applicationId])

  function defaultValue(q:BuilderQuestion){return q.type==='multiple_choice'?[]:q.type==='number'||q.type==='rating'?'':q.options[0]?.value||''}
  function displayValue(rule:EligibilityRule){
    const q=questions.find(x=>x.id===rule.question_id)
    if(!q)return ''
    if(Array.isArray(rule.value))return rule.value.join(', ')
    const option=q.options.find(o=>o.value===String(rule.value))
    return option?.label||String(rule.value??'')
  }

  async function addRule(){
    if(!questions.length){setNotice('Add questions to the form before creating eligibility rules.');return}
    setBusy(true);setNotice('')
    const q=questions[0]
    const {data,error}=await supabase.from('eligibility_rules').insert({
      application_id:applicationId,question_id:q.id,operator:'=',value:defaultValue(q),logic:'AND',position:rules.length,enabled:true
    }).select('id,application_id,question_id,operator,value,logic,position,enabled').single()
    if(error)setNotice(error.message);else setRules(x=>[...x,data as EligibilityRule])
    setBusy(false)
  }

  async function updateRule(id:string,patch:Partial<EligibilityRule>){
    setBusy(true);setNotice('')
    const clean={...patch,updated_at:new Date().toISOString()}
    const {data,error}=await supabase.from('eligibility_rules').update(clean).eq('id',id).select('id,application_id,question_id,operator,value,logic,position,enabled').single()
    if(error)setNotice(error.message);else setRules(x=>x.map(r=>r.id===id?data as EligibilityRule:r))
    setBusy(false)
  }

  async function removeRule(id:string){
    setBusy(true);setNotice('')
    const {error}=await supabase.from('eligibility_rules').delete().eq('id',id)
    if(error)setNotice(error.message);else setRules(x=>x.filter(r=>r.id!==id))
    setBusy(false)
  }

  function valueEditor(rule:EligibilityRule,q:BuilderQuestion){
    const value=rule.value
    const isMulti=rule.operator==='IN'||rule.operator==='NOT IN'
    if(q.options.length){
      if(isMulti)return <div className="public-options">{q.options.map(o=>{const values=Array.isArray(value)?value.map(String):[];const checked=values.includes(o.value);return <label key={o.id}><input type="checkbox" checked={checked} onChange={e=>{const current=Array.isArray(value)?value.map(String):[];updateRule(rule.id,{value:e.target.checked?[...current,o.value]:current.filter(v=>v!==o.value)})}}/><span>{o.label}</span></label>})}</div>
      return <select value={String(value??'')} onChange={e=>updateRule(rule.id,{value:e.target.value})}><option value="">Choose answer…</option>{q.options.map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select>
    }
    return <input type={q.type==='number'||q.type==='rating'?'number':q.type==='date'?'date':'text'} value={Array.isArray(value)?value.join(', '):String(value??'')} placeholder={isMulti?'Comma-separated values':''} onChange={e=>updateRule(rule.id,{value:isMulti?e.target.value.split(',').map(v=>v.trim()).filter(Boolean):e.target.value})}/>
  }

  if(loading)return <div className="loading-card card">Loading eligibility rules…</div>

  return <div className="eligibility-builder">
    <div className="builder-top"><div><p className="eyebrow">Eligibility</p><h2>Eligibility rules</h2><p>Set deterministic rules that are evaluated automatically when an application is submitted.</p></div><div className="builder-actions">{notice&&<span className="builder-notice">{notice}</span>}<button className="primary-button" disabled={busy||!questions.length} onClick={addRule}><Plus size={14}/> Add rule</button></div></div>
    <div className="card" style={{padding:20}}>
      {!rules.length?<div className="builder-empty"><ShieldCheck size={24}/><h3>No eligibility rules yet</h3><p>For example: Age ≥ 18, Location = Kaduna, or Business type = Artisan.</p><button className="secondary-button" disabled={!questions.length||busy} onClick={addRule}>Create first rule</button></div>:
      <div className="eligibility-list">{rules.map((rule,index)=>{const q=questions.find(x=>x.id===rule.question_id);return <div className="eligibility-rule" key={rule.id}>
        <div className="question-card-top"><span className="question-number">{index+1}</span><span className="question-kind">{rule.logic} condition</span><button className="icon-button question-delete" onClick={()=>removeRule(rule.id)}><X size={15}/></button></div>
        <div className="form-grid">
          <label>Question<select value={rule.question_id} onChange={e=>{const next=questions.find(x=>x.id===e.target.value);updateRule(rule.id,{question_id:e.target.value,value:next?defaultValue(next):''})}}>{questions.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
          <label>Operator<select value={rule.operator} onChange={e=>updateRule(rule.id,{operator:e.target.value as EligibilityOperator,value:(e.target.value==='IN'||e.target.value==='NOT IN')?[]:rule.value})}><option value="=">= Equals</option><option value="!=">≠ Does not equal</option><option value=">">&gt; Greater than</option><option value="<">&lt; Less than</option><option value=">=">≥ At least</option><option value="<=">≤ At most</option><option value="IN">In any of</option><option value="NOT IN">Not in</option></select></label>
        </div>
        {q&&<label>Expected answer{valueEditor(rule,q)}</label>}
        <div className="detail-form-footer"><label className="toggle-row"><span>Enabled</span><input type="checkbox" checked={rule.enabled} onChange={e=>updateRule(rule.id,{enabled:e.target.checked})}/></label><label>Next rule logic<select value={rule.logic} onChange={e=>updateRule(rule.id,{logic:e.target.value as 'AND'|'OR'})}><option value="AND">AND — this must also pass</option><option value="OR">OR — this can satisfy the alternative</option></select></label><span className="muted">Current: {displayValue(rule)||'No value set'}</span></div>
      </div>})}</div>}
    </div>
    <div className="card" style={{padding:18,marginTop:14}}><p className="eyebrow">How it works</p><p className="muted" style={{margin:0}}>Eligibility is deterministic: ApplyFlow checks the applicant's submitted answers against these rules and records Eligible, Ineligible, or Pending. Missing information is not inferred.</p></div>
  </div>
}


type ScoringCriterion={id:string;application_id:string;name:string;description:string|null;weight:number;max_score:number;source:'manual'|'automatic'|'ai';position:number;enabled:boolean}
function ScoringBuilder({applicationId}:{applicationId:string}){
 const [criteria,setCriteria]=useState<ScoringCriterion[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const total=useMemo(()=>criteria.filter(c=>c.enabled).reduce((s,c)=>s+Number(c.weight||0),0),[criteria])
 async function load(){setLoading(true);const {data,error}=await supabase.from('scoring_criteria').select('id,application_id,name,description,weight,max_score,source,position,enabled').eq('application_id',applicationId).order('position');if(error)setNotice(error.message);else setCriteria((data||[]) as ScoringCriterion[]);setLoading(false)}
 useEffect(()=>{load()},[applicationId])
 async function add(){setBusy(true);setNotice('');const {data,error}=await supabase.from('scoring_criteria').insert({application_id:applicationId,name:'New scoring criterion',description:'',weight:0,max_score:10,source:'manual',position:criteria.length,enabled:true}).select('id,application_id,name,description,weight,max_score,source,position,enabled').single();if(error)setNotice(error.message);else setCriteria(x=>[...x,data as ScoringCriterion]);setBusy(false)}
 async function update(id:string,patch:Partial<ScoringCriterion>){setBusy(true);setNotice('');const {data,error}=await supabase.from('scoring_criteria').update({...patch,updated_at:new Date().toISOString()}).eq('id',id).select('id,application_id,name,description,weight,max_score,source,position,enabled').single();if(error)setNotice(error.message);else setCriteria(x=>x.map(c=>c.id===id?data as ScoringCriterion:c));setBusy(false)}
 async function remove(id:string){setBusy(true);const {error}=await supabase.from('scoring_criteria').delete().eq('id',id);if(error)setNotice(error.message);else setCriteria(x=>x.filter(c=>c.id!==id));setBusy(false)}
 if(loading)return <div className="loading-card card">Loading scoring criteria…</div>
 const valid=Math.abs(total-100)<0.001
 return <div className="scoring-builder">
  <div className="builder-top"><div><p className="eyebrow">Scoring</p><h2>Scoring criteria</h2><p>Define what reviewers score and how much each criterion contributes to the final score.</p></div><div className="builder-actions">{notice&&<span className="builder-notice">{notice}</span>}<button className="primary-button" disabled={busy} onClick={add}><Plus size={14}/> Add criterion</button></div></div>
  <div className={valid?'score-total valid':'score-total'}><div><span>Total weight</span><strong>{total.toFixed(1)}%</strong></div><div><span>{valid?'Ready to score':'Weights must total 100%'}</span><div className="score-bar"><i style={{width:Math.min(total,100)+'%'}}/></div></div></div>
  {!criteria.length?<div className="card builder-empty"><ShieldCheck size={24}/><h3>No scoring criteria yet</h3><p>Add criteria such as business experience, programme fit, need, or application quality.</p><button className="secondary-button" onClick={add}>Create first criterion</button></div>:
  <div className="scoring-list">{criteria.map((c,i)=><div className="card scoring-item" key={c.id}>
   <div className="question-card-top"><span className="question-number">{i+1}</span><span className="question-kind">{c.source}</span><button className="icon-button question-delete" onClick={()=>remove(c.id)}><X size={15}/></button></div>
   <div className="form-grid">
    <label>Criterion name<input value={c.name} onChange={e=>update(c.id,{name:e.target.value})}/></label>
    <label>Weight (%)<input type="number" min="0" max="100" step="0.1" value={c.weight} onChange={e=>update(c.id,{weight:Number(e.target.value)})}/></label>
   </div>
   <div className="form-grid">
    <label>Description<textarea value={c.description||''} onChange={e=>update(c.id,{description:e.target.value})} placeholder="What should the reviewer consider?"/></label>
    <div className="form-grid">
      <label>Max score<input type="number" min="1" step="1" value={c.max_score} onChange={e=>update(c.id,{max_score:Number(e.target.value)})}/></label>
      <label>Source<select value={c.source} onChange={e=>update(c.id,{source:e.target.value as ScoringCriterion['source']})}><option value="manual">Manual</option><option value="automatic">Automatic</option><option value="ai">AI-assisted</option></select></label>
    </div>
   </div>
   <div className="detail-form-footer"><label className="toggle-row"><span>Enabled</span><input type="checkbox" checked={c.enabled} onChange={e=>update(c.id,{enabled:e.target.checked})}/></label><span className="muted">Criterion {i+1} · {Number(c.weight||0).toFixed(1)}% of final score</span></div>
  </div>)}</div>}
  <div className="card" style={{padding:18,marginTop:14}}><p className="eyebrow">Scoring model</p><p className="muted" style={{margin:0}}>Each criterion gets a score up to its max score. ApplyFlow will use the weights to calculate an overall score once scoring is completed. AI-assisted scoring remains reviewable by a human.</p></div>
 </div>
}
function FormBuilder({applicationId}:{applicationId:string}) {
  const [versionId,setVersionId]=useState<string|null>(null), [version,setVersion]=useState(1)
  const [questions,setQuestions]=useState<BuilderQuestion[]>([]), [selectedId,setSelectedId]=useState<string|null>(null)
  const [busy,setBusy]=useState(false), [notice,setNotice]=useState('')
  const selected=questions.find(q=>q.id===selectedId)||null
  const optionTypes:QuestionType[]=['dropdown','single_choice','multiple_choice','yes_no']

  async function loadQuestions(versionId:string){
    const {data:qs,error}=await supabase.from('questions').select('id,type,label,description,required,placeholder,position,config,conditional_rules').eq('form_version_id',versionId).order('position')
    if(error) throw error
    const rows=(qs||[]) as Omit<BuilderQuestion,'options'>[]
    const full=await Promise.all(rows.map(async q=>{const {data:opts,error:o}=await supabase.from('question_options').select('id,label,value,position').eq('question_id',q.id).order('position'); if(o) throw o; return {...q,options:(opts||[]) as BuilderOption[]}}))
    setQuestions(full); if(full[0]) setSelectedId(full[0].id)
  }
  useEffect(()=>{(async()=>{try{const {data}=await supabase.from('form_versions').select('id,version_number').eq('application_id',applicationId).eq('status','draft').order('version_number',{ascending:false}).limit(1).maybeSingle(); if(data){setVersionId(data.id);setVersion(data.version_number);await loadQuestions(data.id)}}catch(e){setNotice(e instanceof Error?e.message:'Could not load form.')}})()},[applicationId])

  async function ensureVersion(){
    if(versionId)return versionId
    const {data:latest}=await supabase.from('form_versions').select('version_number').eq('application_id',applicationId).order('version_number',{ascending:false}).limit(1).maybeSingle()
    const next=(latest?.version_number||0)+1
    const {data,error}=await supabase.from('form_versions').insert({application_id:applicationId,version_number:next,created_by:(await supabase.auth.getUser()).data.user?.id,title:'Application form',status:'draft'}).select('id').single()
    if(error)throw error
    setVersionId(data.id);setVersion(next);return data.id
  }
  async function addQuestion(type:QuestionType){
    setBusy(true);setNotice('')
    try{
      const v=await ensureVersion()
      const {data,error}=await supabase.from('questions').insert({form_version_id:v,type,label:questionTypes.find(x=>x.type===type)?.label||'Question',required:false,position:questions.length,config:{}}).select('id,type,label,description,required,placeholder,position,config,conditional_rules').single()
      if(error)throw error
      let item={...(data as Omit<BuilderQuestion,'options'>),options:[]} as BuilderQuestion
      if(type==='yes_no'){const {data:opts,error:o}=await supabase.from('question_options').insert([{question_id:item.id,label:'Yes',value:'yes',position:0},{question_id:item.id,label:'No',value:'no',position:1}]).select('id,label,value,position');if(o)throw o;item.options=(opts||[]) as BuilderOption[]}
      setQuestions(x=>[...x,item]);setSelectedId(item.id)
    }catch(e){setNotice(e instanceof Error?e.message:'Could not add question.')}finally{setBusy(false)}
  }
  function conditionValue(q:BuilderQuestion){return q.conditional_rules?.[0]?.value||''}
  function conditionQuestionId(q:BuilderQuestion){return q.conditional_rules?.[0]?.question_id||''}
  function conditionOptions(questionId:string){return questions.find(q=>q.id===questionId)?.options||[]}
  async function updateCondition(questionId:string,value:string){
    if(!selected)return
    const rules=questionId&&value?[{question_id:questionId,operator:'equals' as const,value}]:null
    await updateQuestion({conditional_rules:rules})
  }
  async function updateQuestion(patch:Partial<BuilderQuestion>){
    if(!selected)return;setBusy(true)
    const clean:any={...patch,updated_at:new Date().toISOString()};delete clean.options
    const {data,error}=await supabase.from('questions').update(clean).eq('id',selected.id).select('id,type,label,description,required,placeholder,position,config,conditional_rules').single()
    if(!error&&data)setQuestions(x=>x.map(q=>q.id===selected.id?{...q,...data,options:q.options}:q))
    if(error)setNotice(error.message);setBusy(false)
  }
  async function addOption(){
    if(!selected)return;setBusy(true)
    const n=selected.options.length+1, value=`option-${n}`
    const {data,error}=await supabase.from('question_options').insert({question_id:selected.id,label:`Option ${n}`,value,position:n-1}).select('id,label,value,position').single()
    if(!error&&data)setQuestions(x=>x.map(q=>q.id===selected.id?{...q,options:[...q.options,data as BuilderOption]}:q))
    if(error)setNotice(error.message);setBusy(false)
  }
  async function updateOption(id:string,patch:Partial<BuilderOption>){
    setBusy(true);const {data,error}=await supabase.from('question_options').update(patch).eq('id',id).select('id,label,value,position').single()
    if(!error&&data)setQuestions(x=>x.map(q=>q.id===selected?.id?{...q,options:q.options.map(o=>o.id===id?data as BuilderOption:o)}:q))
    if(error)setNotice(error.message);setBusy(false)
  }
  async function removeOption(id:string){
    setBusy(true);const {error}=await supabase.from('question_options').delete().eq('id',id)
    if(!error&&selected)setQuestions(x=>x.map(q=>q.id===selected.id?{...q,options:q.options.filter(o=>o.id!==id)}:q))
    if(error)setNotice(error.message);setBusy(false)
  }
  async function moveQuestion(index:number,direction:number){
    const next=index+direction;if(next<0||next>=questions.length)return
    const copy=[...questions];[copy[index],copy[next]]=[copy[next],copy[index]]
    setBusy(true)
    try{for(let i=0;i<copy.length;i++){const {error}=await supabase.from('questions').update({position:i}).eq('id',copy[i].id);if(error)throw error}setQuestions(copy.map((q,i)=>({...q,position:i})))}catch(e){setNotice(e instanceof Error?e.message:'Could not reorder questions.')}finally{setBusy(false)}
  }
  async function removeQuestion(){if(!selected)return;setBusy(true);const {error}=await supabase.from('questions').delete().eq('id',selected.id);if(!error){const left=questions.filter(q=>q.id!==selected.id).map((q,i)=>({...q,position:i}));for(const q of left)await supabase.from('questions').update({position:q.position}).eq('id',q.id);setQuestions(left);setSelectedId(left[0]?.id||null)}else setNotice(error.message);setBusy(false)}
  async function publish(){if(!versionId)return;setBusy(true);setNotice('');const {error}=await supabase.from('form_versions').update({status:'published',published_at:new Date().toISOString()}).eq('id',versionId);if(error)setNotice(error.message);else{setNotice('Form published successfully.');setVersionId(null);setQuestions([]);setSelectedId(null)}setBusy(false)}

  return <div className="form-builder">
    <div className="builder-top"><div><p className="eyebrow">Form builder · Version {version}</p><h2>Application form</h2><p>Build the questions applicants will answer.</p></div><div className="builder-actions">{notice&&<span className="builder-notice">{notice}</span>}<button className="secondary-button" disabled={busy||!questions.length} onClick={()=>setNotice('Draft saved.')}>Save draft</button><button className="secondary-button" disabled={!questions.length} onClick={()=>setPreview(true)}>Preview</button><button className="primary-button" disabled={busy||!questions.length} onClick={publish}>Publish form</button></div></div>
    <div className="builder-layout"><aside className="builder-palette card"><div className="builder-section-title">Question types</div>{questionTypes.map(q=><button key={q.type} className="question-type" disabled={busy} onClick={()=>addQuestion(q.type)}><span className="type-icon">{q.icon}</span><span>{q.label}</span></button>)}</aside>
      <main className="builder-canvas"><div className="canvas-label">FORM CANVAS</div>{!questions.length?<div className="builder-empty card"><FileText size={24}/><h3>Start building your form</h3><p>Select a question type from the left to add your first question.</p></div>:questions.map((q,i)=><div key={q.id} className={selectedId===q.id?'question-card card selected':'question-card card'} onClick={()=>setSelectedId(q.id)}><div className="question-card-top"><span className="drag-handle">⋮⋮</span><span className="question-number">{i+1}</span><span className="question-kind">{questionTypes.find(x=>x.type===q.type)?.label}</span><button className="icon-button question-delete" onClick={e=>{e.stopPropagation();setSelectedId(q.id);removeQuestion()}}><X size={15}/></button></div><h3>{q.label}{q.required&&<span className="required-star">*</span>}</h3>{q.description&&<p>{q.description}</p>}{optionTypes.includes(q.type)&&q.options.length?<div className="choice-preview">{q.options.map(o=><span key={o.id}>○ {o.label}</span>)}</div>:<div className="fake-input">{q.type==='long_text'?'Applicant response…':q.type==='dropdown'?'Select an option…':q.type==='rating'?'☆ ☆ ☆ ☆ ☆':'Applicant response…'}</div>}<div className="question-move"><button disabled={i===0||busy} onClick={e=>{e.stopPropagation();moveQuestion(i,-1)}}>↑ Move up</button><button disabled={i===questions.length-1||busy} onClick={e=>{e.stopPropagation();moveQuestion(i,1)}}>↓ Move down</button></div></div>)}</main>
      <aside className="builder-settings card">{selected?<><div className="builder-section-title">Question settings</div><label>Question<input value={selected.label} onChange={e=>updateQuestion({label:e.target.value})}/></label><label>Description<textarea rows={3} value={selected.description||''} onChange={e=>updateQuestion({description:e.target.value||null})}/></label><label>Placeholder<input value={selected.placeholder||''} onChange={e=>updateQuestion({placeholder:e.target.value||null})}/></label><label className="toggle-row"><span>Required</span><input type="checkbox" checked={selected.required} onChange={e=>updateQuestion({required:e.target.checked})}/></label><div className="condition-editor"><div className="options-title"><span>Conditional question</span><span className="optional">Optional</span></div><select value={conditionQuestionId(selected)} onChange={e=>{const id=e.target.value;updateCondition(id,conditionValue(selected))}}><option value="">Always show</option>{questions.filter(q=>q.id!==selected.id).map(q=><option key={q.id} value={q.id}>{q.label}</option>)}</select>{conditionQuestionId(selected)&&<select value={conditionValue(selected)} onChange={e=>updateCondition(conditionQuestionId(selected),e.target.value)}><option value="">Choose answer…</option>{conditionOptions(conditionQuestionId(selected)).map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select>}</div>{optionTypes.includes(selected.type)&&<div className="options-editor"><div className="options-title"><span>Options</span><button onClick={addOption} disabled={busy}>+ Add</button></div>{selected.options.map(o=><div className="option-row" key={o.id}><input value={o.label} onChange={e=>updateOption(o.id,{label:e.target.value})}/><button className="icon-button" onClick={()=>removeOption(o.id)} aria-label="Remove option"><X size={13}/></button></div>)}</div>}<button className="delete-question" onClick={removeQuestion}>Delete question</button></>:<div className="settings-empty"><Settings size={20}/><p>Select a question to edit its settings.</p></div>}</aside>
    </div>
    {preview&&<div className="preview-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPreview(false)}}><div className="preview-panel card"><div className="preview-header"><div><p className="eyebrow">Applicant preview</p><h2>Application form</h2><p>Preview what applicants will see.</p></div><button className="icon-button" onClick={()=>setPreview(false)}><X size={18}/></button></div><div className="preview-form">{questions.map((q,i)=><div key={q.id} className="preview-question"><label>{i+1}. {q.label}{q.required&&<span className="required-star">*</span>}{q.description&&<small>{q.description}</small>}</label>{optionTypes.includes(q.type)?<div className="preview-options">{q.options.map(o=><label key={o.id}><input type={q.type==='multiple_choice'?'checkbox':'radio'} name={q.id}/><span>{o.label}</span></label>)}</div>:q.type==='long_text'?<textarea placeholder={q.placeholder||'Your answer'}/>:q.type==='date'?<input type="date"/>:q.type==='number'?<input type="number" placeholder={q.placeholder||''}/>:q.type==='rating'?<div className="preview-rating">☆ ☆ ☆ ☆ ☆</div>:q.type==='file'||q.type==='image'?<input type="file"/>:<input type={q.type==='email'?'email':q.type==='phone'?'tel':'text'} placeholder={q.placeholder||'Your answer'}/>}</div>)}</div><div className="preview-footer"><button className="secondary-button" onClick={()=>setPreview(false)}>Close preview</button></div></div></div>}
  </div>
}

function StatCard({label,value,note,icon:Icon}:{label:string;value:string;note:string;icon:typeof Users}){return <div className="card stat-card"><div className="stat-icon"><Icon size={18}/></div><div><p className="eyebrow">{label}</p><div className="stat-value">{value}</div><p className="muted">{note}</p></div></div>}
export default App
