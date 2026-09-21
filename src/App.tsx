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


function ApplicationDetails({ application, settings, tab, setTab, loading, saving, error, onBack, onSave }:{
  application: Application
  settings: {public_slug:string; confirmation_message:string} | null
  tab: 'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants'
  setTab: (tab:'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants') => void
  loading: boolean
  saving: boolean
  error: string
  onBack: () => void
  onSave: (patch: Partial<Application>, settingsPatch?: Partial<{public_slug:string;confirmation_message:string}>) => Promise<void>
}) {
  const [name,setName]=useState(application.name)
  const [description,setDescription]=useState(application.description || '')
  const [deadline,setDeadline]=useState(application.deadline || '')
  const [target,setTarget]=useState(application.target_count?.toString() || '')
  const [slug,setSlug]=useState(settings?.public_slug || '')
  const [message,setMessage]=useState(settings?.confirmation_message || '')
  useEffect(()=>{setName(application.name);setDescription(application.description||'');setDeadline(application.deadline||'');setTarget(application.target_count?.toString()||'')},[application])
  useEffect(()=>{setSlug(settings?.public_slug||'');setMessage(settings?.confirmation_message||'')},[settings])
  const tabs=['Overview','Form','Eligibility','Scoring','Screening','Applicants'] as const
  const statusClass=application.status==='published'?'blue':application.status==='screening'?'amber':application.status==='closed'?'neutral':'neutral'
  return <section className="application-detail">
    <button className="back-link" onClick={onBack}>← Back to applications</button>
    <div className="detail-header">
      <div><p className="eyebrow">Application programme</p><div className="detail-title-row"><h1>{application.name}</h1><span className={'status '+statusClass}>{statusLabel(application.status)}</span></div><p className="subtitle">{application.description || 'No description yet.'}</p></div>
      <div className="detail-actions">
        {application.status==='draft' && <button className="primary-button" disabled={saving} onClick={()=>onSave({status:'published'})}>Publish</button>}
        {application.status==='published' && <button className="secondary-button" disabled={saving} onClick={()=>onSave({status:'closed'})}>Close applications</button>}
        {application.status==='closed' && <button className="secondary-button" disabled={saving} onClick={()=>onSave({status:'draft'})}>Reopen as draft</button>}
      </div>
    </div>
    <div className="detail-meta">
      <div><span>Deadline</span><strong>{formatDate(application.deadline)}</strong></div>
      <div><span>Target</span><strong>{application.target_count?.toLocaleString() || 'Not set'}</strong></div>
      <div><span>Public URL</span><strong>{settings?.public_slug ? '/apply/'+settings.public_slug : 'Not configured'}</strong></div>
    </div>
    <div className="detail-tabs">{tabs.map(item=><button key={item} className={tab===item?'detail-tab active':'detail-tab'} onClick={()=>setTab(item)}>{item}</button>)}</div>
    {loading ? <div className="loading-card card">Loading programme settings…</div> : error ? <div className="form-error page-error">{error}</div> : tab==='Overview' ? <div className="detail-grid">
      <div className="card detail-card"><div className="card-header"><div><h2>Programme details</h2><p>Update the basic information for this programme.</p></div></div><div className="detail-form">
        <label>Programme name<input value={name} onChange={e=>setName(e.target.value)}/></label>
        <label>Description<textarea rows={5} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Describe the programme."/></label>
        <div className="form-grid"><label>Application deadline<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>Target number<input type="number" min="0" value={target} onChange={e=>setTarget(e.target.value)} placeholder="150"/></label></div>
        <div className="detail-form-footer"><button className="primary-button" disabled={saving} onClick={()=>onSave({name:name.trim(),description:description.trim()||null,deadline:deadline||null,target_count:target?Number(target):null})}>{saving?'Saving…':'Save changes'}</button></div>
      </div></div>
      <div className="card detail-card"><div className="card-header"><div><h2>Public application</h2><p>Settings applicants will see when they submit.</p></div></div><div className="detail-form">
        <label>Public slug<input value={slug} onChange={e=>setSlug(e.target.value)} /></label>
        <label>Confirmation message<textarea rows={5} value={message} onChange={e=>setMessage(e.target.value)}/></label>
        <div className="detail-form-footer"><button className="secondary-button" disabled={saving} onClick={()=>onSave({}, {public_slug:slug.trim(),confirmation_message:message.trim()||'Thank you. Your application has been received.'})}>Save public settings</button></div>
      </div></div>
    </div> : <div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>{tab} is the next build</h2><p>The programme shell is ready. This section will connect to the live {tab.toLowerCase()} data next.</p></div>}
  </section>
}

function StatCard({label,value,note,icon:Icon}:{label:string;value:string;note:string;icon:typeof Users}){return <div className="card stat-card"><div className="stat-icon"><Icon size={18}/></div><div><p className="eyebrow">{label}</p><div className="stat-value">{value}</div><p className="muted">{note}</p></div></div>}
export default App
