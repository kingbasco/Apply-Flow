import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, BarChart3, Bell, Check, ChevronDown, ChevronRight, ClipboardList, FileCheck2, FileText,
  FolderKanban, LayoutDashboard, LogOut, Menu, Plus, Search, Settings,
  ShieldCheck, Sparkles, Users, X, Download, TrendingUp, MapPin, Tags, Target, CheckCircle2, Layers, Workflow, Brain,
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

function AuthScreen({ onSignedIn }: { onSignedIn: () => Promise<void> | void }) {
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
  const [questions,setQuestions]=useState<BuilderQuestion[]>([]), [answers,setAnswers]=useState<Record<string,string|string[]>>({}), [files,setFiles]=useState<Record<string,File>>({})
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
  function setFile(id:string,file:File|null){setFiles(x=>{const next={...x};if(file)next[id]=file;else delete next[id];return next})}
  async function submit(e:React.FormEvent){e.preventDefault();setError('');for(const q of questions){if(visible(q)&&q.required&&!answers[q.id]){setError(`Please answer: ${q.label}`);return}}setLoading(true);try{
    const answerPayload=questions.filter(q=>visible(q)&&answers[q.id]!==undefined).map(q=>{
      const file=files[q.id]
      if((q.type==='file'||q.type==='image')&&file){
        const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-')
        const path=`public-submissions/${app!.id}/${q.id}-${crypto.randomUUID()}-${safe}`
        return {question_id:q.id,value:{path,name:file.name,size:file.size,type:file.type}}
      }
      return {question_id:q.id,value:answers[q.id]}
    })
    const emailQ=questions.find(q=>q.type==='email'), nameQ=questions.find(q=>q.label.toLowerCase().includes('full name')||q.label.toLowerCase()==='name')
    const {data:v,error:ve}=await supabase.from('form_versions').select('id').eq('application_id',app!.id).eq('status','published').order('version_number',{ascending:false}).limit(1).single();if(ve)throw ve
    const {data:subId,error:se}=await supabase.rpc('submit_application',{p_application_id:app!.id,p_form_version_id:v.id,p_email:emailQ?String(answers[emailQ.id]||''):null,p_full_name:nameQ?String(answers[nameQ.id]||''):null,p_answers:answerPayload});if(se)throw se
    for(const q of questions.filter(q=>(q.type==='file'||q.type==='image')&&files[q.id])){
      const file=files[q.id]!, meta=answerPayload.find(x=>x.question_id===q.id)?.value as {path:string}
      const {error:uploadError}=await supabase.storage.from('application-files').upload(meta.path,file,{contentType:file.type||'application/octet-stream',upsert:false})
      if(uploadError)throw uploadError
    }
    setSubmitted(true)
  }catch(e){setError(e instanceof Error?e.message:'Could not submit application.')}finally{setLoading(false)}}
  if(loading&&!app)return <div className="public-shell"><div className="public-card card">Loading application…</div></div>
  if(error&&!app)return <div className="public-shell"><div className="public-card card"><div className="empty-icon"><FileText size={22}/></div><h1>Application unavailable</h1><p>{error}</p></div></div>
  if(submitted)return <div className="public-shell"><div className="public-card card public-success"><div className="success-mark">✓</div><p className="eyebrow">Application submitted</p><h1>Thank you.</h1><p>{settings?.confirmation_message}</p></div></div>
  return <div className="public-shell"><form className="public-card card public-form" onSubmit={submit}><div className="public-header"><p className="eyebrow">Application</p><h1>{app?.name}</h1><p>{app?.description||'Complete the form below to apply.'}</p>{app?.deadline&&<span className="public-deadline">Deadline: {formatDate(app.deadline)}</span>}</div>{questions.map((q,i)=>visible(q)&&<div className="public-question" key={q.id}><label><span>{i+1}. {q.label}{q.required&&<span className="required-star">*</span>}</span>{q.description&&<small>{q.description}</small>}</label>{q.type==='long_text'?<textarea value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='date'?<input type="date" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)}/>:q.type==='number'?<input type="number" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='email'?<input type="email" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='phone'?<input type="tel" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='dropdown'?<select value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)}><option value="">Select an option</option>{q.options.map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select>:q.type==='single_choice'||q.type==='yes_no'?<div className="public-options">{q.options.map(o=><label key={o.id}><input type="radio" name={q.id} checked={answers[q.id]===o.value} onChange={()=>setAnswer(q.id,o.value)}/><span>{o.label}</span></label>)}</div>:q.type==='multiple_choice'?<div className="public-options">{q.options.map(o=><label key={o.id}><input type="checkbox" checked={Array.isArray(answers[q.id])&&answers[q.id].includes(o.value)} onChange={e=>{const current=Array.isArray(answers[q.id])?(answers[q.id] as string[]):[];setAnswer(q.id,e.target.checked?[...current,o.value]:current.filter((v:string)=>v!==o.value))}}/><span>{o.label}</span></label>)}</div>:q.type==='rating'?<div className="rating-options">{[1,2,3,4,5].map(n=><button type="button" key={n} className={answers[q.id]===String(n)?'rating-active':''} onClick={()=>setAnswer(q.id,String(n))}>{n}</button>)}</div>:q.type==='file'||q.type==='image'?<input type="file" accept={q.type==='image'?'image/*':undefined} onChange={e=>{const f=e.target.files?.[0]||null;setFile(q.id,f);setAnswer(q.id,f?.name||'')}}/>:<input value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>}</div>)}{error&&<div className="form-error">{error}</div>}<button className="primary-button public-submit" disabled={loading}>{loading?'Submitting…':'Submit application'}</button></form></div>
}

function LandingPage() {
  const features = [
    { icon: FileText, title: 'Flexible application forms', text: 'Build structured application forms with conditional questions, uploads and versioned publishing.' },
    { icon: ShieldCheck, title: 'Eligibility without the guesswork', text: 'Define clear rules and automatically separate eligible applications from those that do not qualify.' },
    { icon: Target, title: 'Consistent scoring', text: 'Create weighted criteria so reviewers assess applications against the same programme priorities.' },
    { icon: Brain, title: 'AI-assisted screening', text: 'Use AI to surface evidence, strengths, concerns and missing information while keeping people in control.' },
    { icon: Users, title: 'Collaborative review', text: 'Assign reviewers, collect scores and notes, and keep a clear history of review decisions.' },
    { icon: BarChart3, title: 'Selection and analytics', text: 'Move applicants from shortlist to selection and understand your programme with live reporting.' },
  ]
  const steps = [
    ['01', 'Create your programme', 'Set the programme details, target and deadline in one workspace.'],
    ['02', 'Build your application', 'Design the questions and rules applicants need to complete.'],
    ['03', 'Screen and review', 'Apply eligibility, scoring and optional AI assistance before human review.'],
    ['04', 'Select and report', 'Shortlist, select, communicate and export the results.'],
  ]
  return <div className="landing-shell">
    <header className="landing-nav">
      <a className="landing-brand" href="/"><span className="landing-mark">A</span><span><strong>ApplyFlow</strong><small>Application OS</small></span></a>
      <nav className="landing-links"><a href="#product">Product</a><a href="#how-it-works">How it works</a><a href="#features">Features</a></nav>
      <div className="landing-actions"><a className="landing-login" href="/login">Sign in</a><a className="landing-cta small" href="/login">Get started <ArrowRight size={15}/></a></div>
    </header>

    <main>
      <section className="landing-hero" id="product">
        <div className="hero-copy">
          <span className="hero-kicker"><span className="kicker-dot"></span> APPLICATION INTAKE + SCREENING</span>
          <h1>From applications<br/><em>to decisions.</em></h1>
          <p>ApplyFlow gives organisations one workspace to collect applications, check eligibility, screen candidates, review submissions and make final selections.</p>
          <div className="hero-actions"><a className="landing-cta" href="/login">Start building <ArrowRight size={17}/></a><a className="hero-secondary" href="#how-it-works">See how it works <ChevronRight size={16}/></a></div>
          <div className="hero-trust"><span><Check size={14}/> Structured intake</span><span><Check size={14}/> Human-led decisions</span><span><Check size={14}/> Live programme data</span></div>
        </div>
        <div className="hero-visual">
          <div className="dashboard-window">
            <div className="window-top"><div className="window-dots"><i></i><i></i><i></i></div><span>ApplyFlow / Programme overview</span><div className="window-avatar">EC</div></div>
            <div className="mock-content">
              <div className="mock-heading"><div><small>PROGRAMME OVERVIEW</small><h3>Women Artisans — Cohort 3</h3></div><span className="mock-status">● Screening</span></div>
              <div className="mock-stats"><div><small>Applications</small><strong>450</strong><span>+18 this week</span></div><div><small>Eligible</small><strong>382</strong><span>84.9% of total</span></div><div><small>Shortlisted</small><strong>210</strong><span>55% of eligible</span></div></div>
              <div className="mock-body"><div className="mock-chart"><div className="chart-label"><span>Application pipeline</span><small>Last 30 days</small></div><div className="chart-bars"><i style={{height:'35%'}}></i><i style={{height:'48%'}}></i><i style={{height:'42%'}}></i><i style={{height:'61%'}}></i><i style={{height:'54%'}}></i><i style={{height:'76%'}}></i><i style={{height:'88%'}}></i><i style={{height:'70%'}}></i><i style={{height:'94%'}}></i><i style={{height:'82%'}}></i></div></div><div className="mock-side"><small>TOP LOCATIONS</small><div><span>Lagos</span><b>124</b></div><div><span>Kaduna</span><b>86</b></div><div><span>Abuja</span><b>71</b></div><div><span>Oyo</span><b>48</b></div></div></div>
              <div className="mock-table"><span>Applicant</span><span>Score</span><span>Status</span><b>Amina Yusuf</b><strong>87.5</strong><em>Shortlisted</em><b>Grace Okafor</b><strong>82.0</strong><em>Review</em></div>
            </div>
          </div>
          <div className="hero-float"><span className="float-icon"><Check size={15}/></span><div><strong>Eligibility evaluated</strong><small>382 applications passed</small></div></div>
        </div>
      </section>

      <section className="landing-strip"><span>BUILT FOR PROGRAMMES THAT NEED MORE THAN A FORM</span><div><b>APPLICATIONS</b><b>ELIGIBILITY</b><b>SCREENING</b><b>REVIEWS</b><b>SELECTION</b><b>REPORTING</b></div></section>

      <section className="landing-section intro-section" id="features">
        <div className="section-kicker">ONE WORKSPACE</div>
        <div className="intro-grid"><h2>Everything between <em>“Apply”</em> and <em>“Selected.”</em></h2><p>Stop stitching together forms, spreadsheets, email threads and review notes. ApplyFlow keeps the full application lifecycle connected so your team can focus on evaluating people, not moving data around.</p></div>
      </section>

      <section className="landing-section feature-section">
        <div className="feature-grid">{features.map(({icon:Icon,title,text})=><article className="feature-card" key={title}><div className="feature-icon"><Icon size={19}/></div><h3>{title}</h3><p>{text}</p><span className="feature-line"></span></article>)}</div>
      </section>

      <section className="landing-section workflow-section" id="how-it-works">
        <div className="section-kicker">HOW IT WORKS</div>
        <div className="workflow-head"><h2>A clearer path from <em>intake</em> to <em>outcome.</em></h2><p>Every stage builds on the one before it. Your programme team gets a shared record of what happened and why.</p></div>
        <div className="steps-grid">{steps.map(([num,title,text])=><article className="step-card" key={num}><span>{num}</span><div><h3>{title}</h3><p>{text}</p></div></article>)}</div>
      </section>

      <section className="landing-section spotlight-section">
        <div className="spotlight-card"><div className="spotlight-copy"><div className="section-kicker">AI, WITH HUMAN OVERSIGHT</div><h2>Let AI help with the volume. Keep people in charge of the decision.</h2><p>ApplyFlow can assess configured criteria against the information an applicant actually provided. It surfaces evidence, strengths, concerns and missing information — then leaves the decision with your team.</p><ul><li><Check size={15}/> Evidence-backed criterion assessments</li><li><Check size={15}/> No invented or missing applicant information</li><li><Check size={15}/> Human review, overrides and audit history</li></ul></div><div className="ai-panel"><div className="ai-panel-head"><span><Brain size={15}/> AI SCREENING</span><small>COMPLETED</small></div><div className="ai-score"><div><small>SUGGESTED SCORE</small><strong>82<span>/100</span></strong></div><div className="confidence">92%<small>confidence</small></div></div><div className="ai-rows"><div><span>Business experience</span><b>17/20</b></div><div><span>Programme fit</span><b>16/20</b></div><div><span>Application quality</span><b>13/15</b></div><div><span>Need</span><b>18/20</b></div></div><div className="ai-note">Evidence found across 8 submitted answers. 1 concern flagged for reviewer.</div></div></div>
      </section>

      <section className="landing-section closing-section"><div className="closing-inner"><div className="section-kicker">READY WHEN YOU ARE</div><h2>Build a better application process.</h2><p>Give your applicants a clear experience and your programme team a system they can trust.</p><a className="landing-cta" href="/login">Create your workspace <ArrowRight size={17}/></a></div></section>
    </main>

    <footer className="landing-footer"><div className="landing-brand"><span className="landing-mark">A</span><span><strong>ApplyFlow</strong><small>Application OS</small></span></div><span>Application intake, screening and selection — in one workspace.</span><span>© 2026 ApplyFlow</span></footer>
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
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [detailTab, setDetailTab] = useState<'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants'|'Reviews'|'Selection'|'Communications'>('Overview')
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
    const path = window.location.pathname
    const isPublicRoute = path === '/' || path === '/login' || path.startsWith('/apply/')
    if (isPublicRoute) {
      setSessionReady(true)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setSessionReady(true)
      if (data.session) loadWorkspace(data.session)
    }).catch((err) => {
      setError(err instanceof Error ? err.message : 'Could not connect to the authentication service.')
      setSessionReady(true)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) loadWorkspace(next)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const filtered = useMemo(() => applications.filter(a => a.name.toLowerCase().includes(query.toLowerCase())), [applications, query])
  const totalTarget = applications.reduce((sum,a)=>sum+(a.target_count ?? 0),0)
  const profileName = profile?.full_name || session?.user.email?.split('@')[0] || 'there'
  const firstName = profileName.split(' ')[0]

  if (window.location.pathname.startsWith('/apply/')) return <PublicApplication slug={decodeURIComponent(window.location.pathname.split('/')[2] || '')} />
  if (window.location.pathname === '/login' && !session) return <AuthScreen onSignedIn={async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    window.history.replaceState({}, '', '/')
    if (data.session) await loadWorkspace(data.session)
    setSessionReady(true)
  }} />
  if (!sessionReady) return <div className="loading-screen"><div className="brand-mark">A</div><span>Loading ApplyFlow…</span></div>
  if (!session) return <LandingPage />

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
        </> : <section><div className="page-heading compact"><div><p className="eyebrow">Workspace</p><h1>{active}</h1><p className="subtitle">{active==='Applications'?'Manage your application programmes.':'This module is scaffolded and ready for the next implementation phase.'}</p></div>{active==='Applications'&&<button className="primary-button" onClick={openCreate}><Plus size={17}/> New application</button>}</div>{active==='Analytics'?<AnalyticsPanel applications={applications}/>:active==='Applications'?<div className="card table-card"><div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search applications…"/></div><button className="secondary-button">All status <ChevronDown size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Target</th><th>Deadline</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id} onClick={()=>openApplication(item)} className="clickable-row"><td><strong>{item.name}</strong><span className="table-sub">{item.description || 'No description yet.'}</span></td><td><span className={'status '+(item.status==='published'?'blue':item.status==='screening'?'amber':item.status==='completed'?'green':'neutral')}>{statusLabel(item.status)}</span></td><td>{(item.target_count??0).toLocaleString()}</td><td>{formatDate(item.deadline)}</td></tr>)}</tbody></table></div></div>:<div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>{active} is coming next</h2><p>The shared workspace is now connected to Supabase. We’ll build this module on top of the live architecture.</p></div>}</section>}
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
  tab: 'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants'|'Reviews'|'Selection'|'Communications'
  setTab: (tab:'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants'|'Reviews'|'Selection'|'Communications') => void
  loading: boolean; saving: boolean; error: string; onBack:()=>void
  onSave:(patch:Partial<Application>, settingsPatch?:Partial<{public_slug:string;confirmation_message:string}>)=>Promise<void>
}) {
  const [name,setName]=useState(application.name), [description,setDescription]=useState(application.description||'')
  const [deadline,setDeadline]=useState(application.deadline||''), [target,setTarget]=useState(application.target_count?.toString()||'')
  const [slug,setSlug]=useState(settings?.public_slug||''), [message,setMessage]=useState(settings?.confirmation_message||'')
  useEffect(()=>{setName(application.name);setDescription(application.description||'');setDeadline(application.deadline||'');setTarget(application.target_count?.toString()||'')},[application])
  useEffect(()=>{setSlug(settings?.public_slug||'');setMessage(settings?.confirmation_message||'')},[settings])
  const tabs=['Overview','Form','Eligibility','Scoring','Screening','Applicants','Reviews','Selection','Communications'] as const
  return <section className="application-detail">
    <button className="back-link" onClick={onBack}>← Back to applications</button>
    <div className="detail-header"><div><p className="eyebrow">Application programme</p><div className="detail-title-row"><h1>{application.name}</h1><span className={'status '+(application.status==='published'?'blue':application.status==='screening'?'amber':'neutral')}>{statusLabel(application.status)}</span></div><p className="subtitle">{application.description||'No description yet.'}</p></div><div className="detail-actions">{application.status==='draft'&&<button className="primary-button" disabled={saving} onClick={()=>onSave({status:'published'})}>Publish</button>}{application.status==='published'&&<button className="secondary-button" disabled={saving} onClick={()=>onSave({status:'closed'})}>Close applications</button>}</div></div>
    <div className="detail-meta"><div><span>Deadline</span><strong>{formatDate(application.deadline)}</strong></div><div><span>Target</span><strong>{application.target_count?.toLocaleString()||'Not set'}</strong></div><div><span>Public URL</span><strong>/apply/{settings?.public_slug||'not-configured'}</strong></div></div>
    <div className="detail-tabs">{tabs.map(t=><button key={t} className={tab===t?'detail-tab active':'detail-tab'} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {loading?<div className="loading-card card">Loading programme settings…</div>:error?<div className="form-error page-error">{error}</div>:tab==='Overview'?<div className="detail-grid">
      <div className="card detail-card"><div className="card-header"><div><h2>Programme details</h2><p>Update the basic information for this programme.</p></div></div><div className="detail-form"><label>Programme name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Description<textarea rows={5} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="form-grid"><label>Application deadline<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>Target number<input type="number" min="0" value={target} onChange={e=>setTarget(e.target.value)}/></label></div><div className="detail-form-footer"><button className="primary-button" disabled={saving} onClick={()=>onSave({name:name.trim(),description:description.trim()||null,deadline:deadline||null,target_count:target?Number(target):null})}>{saving?'Saving…':'Save changes'}</button></div></div></div>
      <div className="card detail-card"><div className="card-header"><div><h2>Public application</h2><p>Settings applicants will see.</p></div></div><div className="detail-form"><label>Public slug<input value={slug} onChange={e=>setSlug(e.target.value)}/></label><label>Confirmation message<textarea rows={5} value={message} onChange={e=>setMessage(e.target.value)}/></label><div className="detail-form-footer"><button className="secondary-button" disabled={saving} onClick={()=>onSave({}, {public_slug:slug.trim(),confirmation_message:message.trim()||'Thank you. Your application has been received.'})}>Save public settings</button></div></div></div>
    </div>:tab==='Form'?<FormBuilder applicationId={application.id}/>:tab==='Applicants'?<ApplicantsPanel applicationId={application.id}/>:tab==='Eligibility'?<EligibilityBuilder applicationId={application.id}/>:tab==='Scoring'?<ScoringBuilder applicationId={application.id}/>:tab==='Screening'?<ScreeningPanel applicationId={application.id}/>:tab==='Reviews'?<ReviewsPanel applicationId={application.id}/>:tab==='Selection'?<SelectionPanel applicationId={application.id}/>:tab==='Communications'?<CommunicationsPanel applicationId={application.id}/>:<div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>{tab} is next</h2><p>This section is connected to the programme workspace and will be built on the live data model.</p></div>}
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


type ReviewRow={id:string;submission_id:string;reviewer_id:string;status:'assigned'|'in_progress'|'completed';score:number|null;notes:string|null;created_at:string;updated_at:string}

type SelectionStatus='submitted'|'shortlisted'|'selected'|'waitlisted'|'rejected'
function SelectionPanel({applicationId}:{applicationId:string}){
 const [rows,setRows]=useState<any[]>([]),[target,setTarget]=useState<number|null>(null),[filter,setFilter]=useState<'all'|SelectionStatus>('all'),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true)
 async function load(){setLoading(true);const {data,error}=await supabase.from('applications').select('target_count').eq('id',applicationId).single();if(error)setNotice(error.message);setTarget(data?.target_count??null);const {data:subs,error:se}=await supabase.from('submissions').select('id,status,submitted_at,applicants!inner(full_name,email),submission_selections(status,updated_at)').eq('application_id',applicationId).order('submitted_at',{ascending:false});if(se)setNotice(se.message);else setRows((subs||[]).map((x:any)=>({...x,selection_status:x.submission_selections?.[0]?.status||'submitted'})));setLoading(false)}
 useEffect(()=>{load()},[applicationId])
 const selectedCount=rows.filter(r=>r.selection_status==='selected').length,shortlistedCount=rows.filter(r=>r.selection_status==='shortlisted').length
 async function changeStatus(submissionId:string,status:SelectionStatus){const current=rows.find(r=>r.id===submissionId);if(!current)return;setNotice('');if(status==='selected'&&target!==null&&selectedCount>=target){setNotice(`Target of ${target} selected applicants has been reached. You can still select this applicant, but the target will be exceeded.`)}
 const {data:user}=await supabase.auth.getUser();const {error}=await supabase.from('submission_selections').upsert({submission_id:submissionId,status,decided_by:user.user?.id||null,decided_at:new Date().toISOString()},{onConflict:'submission_id'}).select('submission_id,status').single();if(error){setNotice(error.message);return}
 await supabase.from('selection_audit_logs').insert({submission_id:submissionId,action:'status_changed',from_status:current.selection_status,to_status:status,actor_id:user.user?.id||null,metadata:{target_count:target,selected_count_before:selectedCount}})
 setRows(x=>x.map(r=>r.id===submissionId?{...r,selection_status:status}:r))
 }
 if(loading)return <div className="loading-card card">Loading selection workspace…</div>
 const filtered=filter==='all'?rows:rows.filter(r=>r.selection_status===filter)
 return <div className="selection-panel">
  <div className="builder-top"><div><p className="eyebrow">Selection</p><h2>Shortlist & final selection</h2><p>Move applicants through shortlist, selection, waitlist, or rejection. Target limits warn but never silently block a decision.</p></div>{notice&&<span className="builder-notice">{notice}</span>}</div>
  <div className="selection-summary"><div className="card"><span>Shortlisted</span><strong>{shortlistedCount}</strong></div><div className="card"><span>Selected</span><strong>{selectedCount}{target!==null?<small> / {target}</small>:null}</strong></div><div className="card"><span>Waitlisted</span><strong>{rows.filter(r=>r.selection_status==='waitlisted').length}</strong></div><div className="card"><span>Rejected</span><strong>{rows.filter(r=>r.selection_status==='rejected').length}</strong></div></div>
  <div className="selection-filters">{(['all','shortlisted','selected','waitlisted','rejected'] as const).map(x=><button key={x} className={filter===x?'filter-active':''} onClick={()=>setFilter(x)}>{x==='all'?'All':x.charAt(0).toUpperCase()+x.slice(1)}</button>)}</div>
  {!filtered.length?<div className="card builder-empty"><ShieldCheck size={24}/><h3>No applicants in this view</h3><p>Submitted applications will appear here for selection decisions.</p></div>:<div className="card selection-table"><div className="selection-head"><span>Applicant</span><span>Status</span><span>Decision</span><span>Updated</span></div>{filtered.map(r=><div className="selection-row" key={r.id}><span><strong>{r.applicants?.full_name||'Unnamed applicant'}</strong><small>{r.applicants?.email||''}</small></span><span className={`selection-pill ${r.selection_status}`}>{r.selection_status}</span><select value={r.selection_status} onChange={e=>changeStatus(r.id,e.target.value as SelectionStatus)}><option value="submitted">Submitted</option><option value="shortlisted">Shortlist</option><option value="selected">Select</option><option value="waitlisted">Waitlist</option><option value="rejected">Reject</option></select><span>{r.submission_selections?.[0]?.updated_at?formatDate(r.submission_selections[0].updated_at):'—'}</span></div>)}</div>}
  <div className="card selection-note"><p className="eyebrow">Decision record</p><p>Every status change is recorded with the actor, previous status, new status, timestamp, and target count snapshot.</p></div>
 </div>
}
function ReviewsPanel({applicationId}:{applicationId:string}){
 const [reviews,setReviews]=useState<ReviewRow[]>([]),[submissions,setSubmissions]=useState<any[]>([]),[reviewers,setReviewers]=useState<Profile[]>([])
 const [selected,setSelected]=useState<string>(''),[reviewer,setReviewer]=useState<string>(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('')
 const [role,setRole]=useState<Profile['role']>('reviewer'),[history,setHistory]=useState<any[]>([]),[historyReview,setHistoryReview]=useState<ReviewRow|null>(null)

 async function load(){
  const {data:user}=await supabase.auth.getUser()
  if(user.user){
   const {data:me}=await supabase.from('profiles').select('role').eq('id',user.user.id).single()
   if(me?.role)setRole(me.role as Profile['role'])
  }
  const {data,error}=await supabase.from('review_assignments').select('id,submission_id,reviewer_id,status,score,notes,created_at,updated_at').order('created_at',{ascending:false})
  if(error)setNotice(error.message);else setReviews((data||[]) as ReviewRow[])
  const {data:s,error:se}=await supabase.from('submissions').select('id,submitted_at,applicants!inner(full_name,email)').eq('application_id',applicationId).order('submitted_at',{ascending:false})
  if(se)setNotice(se.message);else setSubmissions(s||[])
  const {data:p,error:pe}=await supabase.from('profiles').select('id,full_name,role').eq('role','reviewer')
  if(pe)setNotice(pe.message);else setReviewers((p||[]) as Profile[])
 }
 useEffect(()=>{load()},[applicationId])

 async function assign(){
  if(!selected||!reviewer)return
  setBusy(true);setNotice('')
  const {error}=await supabase.from('review_assignments').insert({submission_id:selected,reviewer_id:reviewer,status:'assigned'})
  if(error)setNotice(error.message);else{setNotice('Review assigned.');setSelected('');setReviewer('');await load()}
  setBusy(false)
 }

 async function updateReview(id:string,patch:Partial<ReviewRow>){
  const current=reviews.find(r=>r.id===id)
  if(!current)return
  const status=(patch.status||current.status) as ReviewRow['status']
  const score=patch.score===undefined?current.score:patch.score
  const notes=patch.notes===undefined?current.notes:patch.notes
  const {data,error}=await supabase.rpc('update_review_assignment',{p_assignment_id:id,p_status:status,p_score:score,p_notes:notes})
  if(error)setNotice(error.message);else setReviews(x=>x.map(r=>r.id===id?data as ReviewRow:r))
 }

 async function openHistory(review:ReviewRow){
  setHistoryReview(review)
  const {data,error}=await supabase.from('review_audit_logs').select('id,action,from_status,to_status,previous_score,new_score,actor_id,metadata,created_at').eq('review_assignment_id',review.id).order('created_at',{ascending:false})
  if(error)setNotice(error.message);else setHistory(data||[])
 }

 const isAdmin=role==='owner'||role==='admin'
 return <div className="reviews-panel">
  <div className="builder-top"><div><p className="eyebrow">Reviews</p><h2>{isAdmin?'Reviewer assignments':'My review queue'}</h2><p>{isAdmin?'Assign applications to reviewers and track their review progress.':'Review the applications assigned to you. Your updates are recorded in the review history.'}</p></div>{notice&&<span className="builder-notice">{notice}</span>}</div>
  {isAdmin&&<div className="card review-assign-card"><div><p className="eyebrow">Assign a review</p><h3>Send an application to a reviewer</h3></div><div className="review-assign-grid"><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select application…</option>{submissions.map(s=><option key={s.id} value={s.id}>{s.applicants?.full_name||s.applicants?.email||'Unnamed applicant'}</option>)}</select><select value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">Select reviewer…</option>{reviewers.map(p=><option key={p.id} value={p.id}>{p.full_name||'Reviewer'}</option>)}</select><button className="primary-button" disabled={busy||!selected||!reviewer} onClick={assign}><Plus size={14}/> Assign</button></div></div>}
  {!reviews.length?<div className="card builder-empty"><ClipboardList size={24}/><h3>{isAdmin?'No review assignments yet':'No reviews assigned to you'}</h3><p>{isAdmin?'Once applications are submitted, assign them to members of your review team.':'When an admin assigns an application to you, it will appear here.'}</p></div>:<div className="card reviews-table"><div className="review-table-head"><span>Applicant</span><span>Reviewer</span><span>Status</span><span>Score</span><span>Notes</span></div>{reviews.map(r=>{const s=submissions.find(x=>x.id===r.submission_id),p=reviewers.find(x=>x.id===r.reviewer_id);return <div className="review-table-row" key={r.id}><span><strong>{s?.applicants?.full_name||'Unnamed'}</strong><small>{s?.applicants?.email||''}</small></span><span>{p?.full_name||'Reviewer'}</span><select value={r.status} onChange={e=>updateReview(r.id,{status:e.target.value as ReviewRow['status']})}><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select><input className="review-score-input" type="number" min="0" step="0.1" value={r.score??''} placeholder="—" onChange={e=>updateReview(r.id,{score:e.target.value===''?null:Number(e.target.value)})}/><div className="review-notes-cell"><input value={r.notes||''} placeholder="Reviewer notes" onChange={e=>updateReview(r.id,{notes:e.target.value||null})}/><button className="text-button" onClick={()=>openHistory(r)}>History</button></div></div>})}</div>}
  {historyReview&&<div className="screening-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setHistoryReview(null)}}><aside className="screening-drawer card"><div className="preview-header"><div><p className="eyebrow">Review history</p><h2>{submissions.find(x=>x.id===historyReview.submission_id)?.applicants?.full_name||'Applicant'}</h2><p>{reviewers.find(x=>x.id===historyReview.reviewer_id)?.full_name||'Reviewer'}</p></div><button className="icon-button" onClick={()=>setHistoryReview(null)}><X size={18}/></button></div>{!history.length?<div className="builder-empty"><ClipboardList size={22}/><h3>No history yet</h3><p>Changes to this review will appear here.</p></div>:<div className="screening-detail">{history.map((item:any)=><div className="connection-list" key={item.id}><div><span>Action</span><strong>{item.action}</strong></div><div><span>Status</span><strong>{item.from_status||'—'} → {item.to_status||'—'}</strong></div><div><span>Score</span><strong>{item.previous_score??'—'} → {item.new_score??'—'}</strong></div><div><span>Time</span><strong>{formatDate(item.created_at)}</strong></div></div>)}</div>}</aside></div>}
 </div>
}
function ScreeningPanel({applicationId}:{applicationId:string}){
 const [rows,setRows]=useState<any[]>([]),[selected,setSelected]=useState<any|null>(null),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[running,setRunning]=useState(false)
 async function load(){setLoading(true);setNotice('');const {data,error}=await supabase.from('submissions').select('id,status,submitted_at,applicants!inner(full_name,email),ai_screenings(id,status,overall_assessment,criterion_assessments,strengths,concerns,missing_information,inconsistencies,evidence,suggested_score,confidence,model,updated_at,error_message)').eq('application_id',applicationId).order('submitted_at',{ascending:false});if(error)setNotice(error.message);else setRows(data||[]);setLoading(false)}
 useEffect(()=>{load()},[applicationId])
 async function runScreening(id:string){
   setRunning(true);setNotice('');
   const {data,error}=await supabase.functions.invoke('run-ai-screening',{body:{submission_id:id}});
   if(error){setNotice(error.message||'Could not run AI screening.');setRunning(false);return}
   if(data?.error){setNotice(data.error);setRunning(false);return}
   await load();
   const refreshed=rows.find(r=>r.id===id);
   if(refreshed)setSelected(refreshed);
   setRunning(false);
 }
 if(loading)return <div className="loading-card card">Loading screening workspace…</div>
 return <div className="screening-panel">
  <div className="builder-top"><div><p className="eyebrow">Screening</p><h2>Application screening</h2><p>Review applicants, screening status, and AI-assisted assessments. AI suggestions remain subject to human review.</p></div>{notice&&<span className="builder-notice">{notice}</span>}</div>
  {!rows.length?<div className="card builder-empty"><Sparkles size={24}/><h3>No submissions to screen yet</h3><p>Applications will appear here after applicants submit the published form.</p></div>:
  <div className="screening-table card"><div className="screening-row screening-head"><span>Applicant</span><span>Status</span><span>AI screening</span><span>Score</span><span></span></div>{rows.map(r=>{const s=r.ai_screenings?.[0];return <button className="screening-row screening-body" key={r.id} onClick={()=>setSelected(r)}><span><strong>{r.applicants?.full_name||'Unnamed applicant'}</strong><small>{r.applicants?.email||'No email'}</small></span><span className="status-pill">{r.status}</span><span className="status-pill">{s?.status||'Not started'}</span><span>{s?.suggested_score!=null?s.suggested_score:'—'}</span><span>View →</span></button>})}</div>}
  {selected&&<div className="screening-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="screening-drawer card"><div className="preview-header"><div><p className="eyebrow">Screening review</p><h2>{selected.applicants?.full_name||'Applicant'}</h2><p>{selected.applicants?.email}</p></div><button className="icon-button" onClick={()=>setSelected(null)}><X size={18}/></button></div>{!selected.ai_screenings?.[0]?<div className="builder-empty"><Sparkles size={22}/><h3>AI screening not started</h3><p>Run an evidence-based assessment using the configured scoring criteria.</p><button className="primary-button" disabled={running} onClick={()=>runScreening(selected.id)}>{running?'Running screening…':'Run AI screening'}</button></div>:<div className="screening-detail"><div className="screening-status-card"><span>Status</span><strong>{selected.ai_screenings[0].status}</strong><small>{selected.ai_screenings[0].model||'AI model not assigned'}</small></div>{selected.ai_screenings[0].status==='failed'&&selected.ai_screenings[0].error_message&&<div className="form-error">{selected.ai_screenings[0].error_message}</div>}<section><p className="eyebrow">Assessment</p><p>{selected.ai_screenings[0].overall_assessment||'No assessment available yet.'}</p></section><section><p className="eyebrow">Suggested score</p><strong className="screening-score">{selected.ai_screenings[0].suggested_score??'—'}</strong></section><div className="screening-columns"><section><p className="eyebrow">Strengths</p>{(selected.ai_screenings[0].strengths||[]).map((x:string,i:number)=><p key={i}>• {x}</p>)}</section><section><p className="eyebrow">Concerns</p>{(selected.ai_screenings[0].concerns||[]).map((x:string,i:number)=><p key={i}>• {x}</p>)}</section></div><section><p className="eyebrow">Missing information</p>{(selected.ai_screenings[0].missing_information||[]).length?(selected.ai_screenings[0].missing_information||[]).map((x:string,i:number)=><p key={i}>• {x}</p>):<p className="muted">None recorded.</p>}</section><section><p className="eyebrow">Criterion assessments</p>{(selected.ai_screenings[0].criterion_assessments||[]).length?(selected.ai_screenings[0].criterion_assessments||[]).map((c:any,i:number)=><div className="answer-item" key={c.criterion_id||i}><strong>{c.criterion_name}</strong><span>{c.assessment}</span>{c.suggested_score!=null&&<small>Suggested score: {c.suggested_score} · Confidence: {Math.round(Number(c.confidence||0)*100)}%</small>}</div>):<p className="muted">No criterion assessments recorded.</p>}</section><div className="screening-note">AI screening is advisory only. A reviewer must make the final decision.</div>{selected.ai_screenings[0].status!=='processing'&&<button className="secondary-button" disabled={running} onClick={()=>runScreening(selected.id)}>{running?'Running screening…':'Rerun AI screening'}</button>}</div>}</aside></div>}
 </div>
}
function AnalyticsPanel({applications}:{applications:Application[]}) {
  const [loading,setLoading]=useState(true), [rows,setRows]=useState<any[]>([]), [notice,setNotice]=useState('')
  useEffect(()=>{(async()=>{setLoading(true);setNotice('');const ids=applications.map(a=>a.id);if(!ids.length){setRows([]);setLoading(false);return}const {data,error}=await supabase.from('submissions').select('id,status,submitted_at,submission_eligibility(status),submission_selections(status),submission_scores(overall_score)').in('application_id',ids);if(error)setNotice(error.message);else setRows(data||[]);setLoading(false)})()},[applications])
  const submitted=rows.length, eligible=rows.filter(r=>r.submission_eligibility?.[0]?.status==='eligible').length, shortlisted=rows.filter(r=>r.submission_selections?.[0]?.status==='shortlisted').length, selected=rows.filter(r=>r.submission_selections?.[0]?.status==='selected').length
  const avg=rows.filter(r=>r.submission_scores?.[0]?.overall_score!=null).reduce((s,r)=>s+Number(r.submission_scores[0].overall_score),0)/(rows.filter(r=>r.submission_scores?.[0]?.overall_score!=null).length||1)
  if(loading)return <div className="loading-card card">Loading analytics…</div>
  return <div><div className="builder-top"><div><p className="eyebrow">Analytics</p><h2>Programme performance</h2><p>Live metrics from submitted applications.</p></div>{notice&&<span className="builder-notice">{notice}</span>}</div><div className="stats-grid"><StatCard label="Submissions" value={String(submitted)} note="Total submitted" icon={FileCheck2}/><StatCard label="Eligible" value={String(eligible)} note="Passed eligibility" icon={CheckCircle2}/><StatCard label="Shortlisted" value={String(shortlisted)} note="Current shortlist" icon={Target}/><StatCard label="Selected" value={String(selected)} note="Final selections" icon={Users}/></div><div className="card" style={{marginTop:16,padding:24}}><p className="eyebrow">Average score</p><div className="stat-value">{submitted ? avg.toFixed(1) : '—'}</div><p className="muted">Calculated from scored submissions.</p></div></div>
}
function CommunicationsPanel({applicationId}:{applicationId:string}) {
  const [templates,setTemplates]=useState<any[]>([]),[loading,setLoading]=useState(true),[notice,setNotice]=useState('')
  async function load(){setLoading(true);const {data,error}=await supabase.from('communication_templates').select('id,name,audience_status,subject,body,status,created_at').eq('application_id',applicationId).order('created_at',{ascending:false});if(error)setNotice(error.message);else setTemplates(data||[]);setLoading(false)}
  useEffect(()=>{load()},[applicationId])
  if(loading)return <div className="loading-card card">Loading communications…</div>
  return <div><div className="builder-top"><div><p className="eyebrow">Communications</p><h2>Applicant messages</h2><p>Manage message templates for your programme.</p></div>{notice&&<span className="builder-notice">{notice}</span>}</div>{!templates.length?<div className="card builder-empty"><Bell size={24}/><h3>No communication templates yet</h3><p>Create templates in the communications workspace to prepare applicant updates.</p></div>:<div className="card"><div className="reviews-table"><div className="review-table-head"><span>Name</span><span>Audience</span><span>Subject</span><span>Status</span><span>Created</span></div>{templates.map(t=><div className="review-table-row" key={t.id}><span><strong>{t.name}</strong></span><span>{t.audience_status}</span><span>{t.subject}</span><span>{t.status}</span><span>{formatDate(t.created_at)}</span></div>)}</div></div>}</div>
}
function FormBuilder({applicationId}:{applicationId:string}) {
  const [versionId,setVersionId]=useState<string|null>(null), [version,setVersion]=useState(1)
  const [questions,setQuestions]=useState<BuilderQuestion[]>([]), [selectedId,setSelectedId]=useState<string|null>(null), [preview,setPreview]=useState(false)
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