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
        {loading ? <div className="loading-card card">Loading your workspace…</div> : error ? <div className="form-error page-error">{error}</div> : active==='Dashboard' ? <>
          <section className="page-heading"><div><p className="eyebrow">Your workspace</p><h1>Good evening, {firstName}.</h1><p className="subtitle">Here’s what is happening across your programmes.</p></div><button className="primary-button" onClick={()=>setActive('Applications')}><Plus size={17}/> New application</button></section>
          <section className="stats-grid"><StatCard label="Programmes" value={applications.length.toLocaleString()} note="In your workspace" icon={FolderKanban}/><StatCard label="Targets" value={totalTarget.toLocaleString()} note="Across programmes" icon={FileCheck2}/><StatCard label="Published" value={applications.filter(a=>a.status==='published').length.toLocaleString()} note="Currently accepting" icon={ShieldCheck}/><StatCard label="Screening" value={applications.filter(a=>a.status==='screening').length.toLocaleString()} note="In review" icon={Users}/></section>
          <section className="dashboard-grid"><div className="card table-card"><div className="card-header"><div><h2>Programmes</h2><p>Your application programmes from Supabase.</p></div><button className="text-button" onClick={()=>setActive('Applications')}>View all</button></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Target</th><th>Deadline</th></tr></thead><tbody>{applications.length===0?<tr><td colSpan={4}><div className="table-empty">No programmes yet. Create your first application programme.</div></td></tr>:applications.map(item=><tr key={item.id}><td><strong>{item.name}</strong><span className="table-sub">{item.description || 'No description yet.'}</span></td><td><span className={'status '+(item.status==='published'?'blue':item.status==='screening'?'amber':item.status==='completed'?'green':'neutral')}>{statusLabel(item.status)}</span></td><td>{(item.target_count??0).toLocaleString()}</td><td>{formatDate(item.deadline)}</td></tr>)}</tbody></table></div></div><div className="card funnel-card"><div className="card-header"><div><h2>Workspace health</h2><p>Live database connection</p></div><span className="status green">Connected</span></div><div className="connection-list"><div><span>Organisation</span><strong>{organization?.name || '—'}</strong></div><div><span>Role</span><strong>{profile?.role || '—'}</strong></div><div><span>Programmes</span><strong>{applications.length}</strong></div></div></div></section>
        </> : <section><div className="page-heading compact"><div><p className="eyebrow">Workspace</p><h1>{active}</h1><p className="subtitle">{active==='Applications'?'Manage your application programmes.':'This module is scaffolded and ready for the next implementation phase.'}</p></div>{active==='Applications'&&<button className="primary-button"><Plus size={17}/> New application</button>}</div>{active==='Applications'?<div className="card table-card"><div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search applications…"/></div><button className="secondary-button">All status <ChevronDown size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Target</th><th>Deadline</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id}><td><strong>{item.name}</strong><span className="table-sub">{item.description || 'No description yet.'}</span></td><td><span className={'status '+(item.status==='published'?'blue':item.status==='screening'?'amber':item.status==='completed'?'green':'neutral')}>{statusLabel(item.status)}</span></td><td>{(item.target_count??0).toLocaleString()}</td><td>{formatDate(item.deadline)}</td></tr>)}</tbody></table></div></div>:<div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>{active} is coming next</h2><p>The shared workspace is now connected to Supabase. We’ll build this module on top of the live architecture.</p></div>}</section>}
      </div>
    </main>
  </div>
}

function StatCard({label,value,note,icon:Icon}:{label:string;value:string;note:string;icon:typeof Users}){return <div className="card stat-card"><div className="stat-icon"><Icon size={18}/></div><div><p className="eyebrow">{label}</p><div className="stat-value">{value}</div><p className="muted">{note}</p></div></div>}
export default App
