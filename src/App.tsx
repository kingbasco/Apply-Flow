import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, BarChart3, Bell, Check, ChevronDown, ChevronRight, ClipboardList, FileCheck2, FileText, Clock3,
  FolderKanban, LayoutDashboard, LogOut, Menu, Plus, Search, Settings,
  ShieldCheck, Sparkles, Users, X, Download, TrendingUp, MapPin, Tags, Target, CheckCircle2, Layers, Workflow, Brain, BadgeCheck, Sun, Moon,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { NIGERIAN_STATES, getNigerianLgas } from './lib/nigeria'
import ParticipantsPanel from './components/ParticipantsPanel'
import { FormsWorkspace, ScreeningWorkspace, ReviewsWorkspace, TeamWorkspace, SettingsWorkspace } from './components/WorkspaceModules'
import { GoogleFormImport } from './components/GoogleFormImport'

type AppStatus = 'draft' | 'published' | 'screening' | 'closed' | 'completed'
type Application = {
  id: string; name: string; description: string | null; status: AppStatus
  deadline: string | null; target_count: number | null; participant_code: string; created_at: string
}
type Profile = { id: string; full_name: string | null; organization_id: string | null; role: 'owner'|'admin'|'reviewer' }
type Organization = { id: string; name: string; slug: string }

const nav = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'Applications', icon: FolderKanban },
  { label: 'Forms', icon: FileText }, { label: 'Screening', icon: ShieldCheck },
  { label: 'Reviews', icon: ClipboardList }, { label: 'Participants', icon: BadgeCheck }, { label: 'Analytics', icon: BarChart3 },
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
  async function signInWithGoogle() {
    setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'signup') {
        if (!orgName.trim()) {
          setError('Enter your organisation name first, then continue with Google.')
          setBusy(false)
          return
        }
        localStorage.setItem('applyflow-google-signup', JSON.stringify({
          full_name: name.trim(),
          organization_name: orgName.trim(),
        }))
      } else {
        localStorage.removeItem('applyflow-google-signup')
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/login',
        },
      })
      if (error) throw error
    } catch (err) {
      localStorage.removeItem('applyflow-google-signup')
      setError(err instanceof Error ? err.message : 'Could not continue with Google.')
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        onSignedIn()
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name.trim(), organization_name: orgName.trim() } } })
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
      <div className="auth-divider"><span>OR</span></div>
      <button type="button" className="google-auth-button" onClick={signInWithGoogle} disabled={busy}>
        <span className="google-mark" aria-hidden="true">G</span>
        <span>{mode === 'signin' ? 'Continue with Google' : 'Sign up with Google'}</span>
      </button>
      <button className="auth-switch" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('');setMessage('')}}>{mode==='signin' ? 'Need an account? Create a workspace' : 'Already have an account? Sign in'}</button>
    </div>
    <div className="auth-aside"><div><span className="aside-kicker">APPLYFLOW</span><h2>From applications to decisions, in one workspace.</h2><p>Collect applications, evaluate eligibility, screen candidates and move the right people through your programme.</p></div><div className="aside-stat"><strong>One source of truth</strong><span>Forms · Eligibility · Screening · Reviews · Selection</span></div></div>
  </div>
}

function InviteSetupScreen({ email, onComplete }: { email: string; onComplete: () => Promise<void> | void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) throw updateError
      await onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not finish setting up your account.')
    } finally {
      setBusy(false)
    }
  }

  return <div className="auth-shell">
    <div className="auth-panel">
      <div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application OS</span></div></div>
      <div className="auth-copy"><p className="eyebrow">Team invitation</p><h1>Create your account.</h1><p>You’ve been invited to join an ApplyFlow workspace. Create your password, then sign in normally to access the workspace.</p></div>
      <form onSubmit={submit} className="auth-form">
        <label>Email<input type="email" value={email} readOnly /></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Create a password" minLength={6} required /></label>
        <label>Confirm password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter your password" minLength={6} required /></label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Setting up…' : 'Finish account setup'}</button>
      </form>
    </div>
    <div className="auth-aside"><div><span className="aside-kicker">APPLYFLOW</span><h2>Your account is almost ready.</h2><p>Set your password first. After that, you’ll return to the normal ApplyFlow sign-in screen and use your email and password to enter the workspace.</p></div><div className="aside-stat"><strong>Invited workspace member</strong><span>Create password · Sign in · Start working</span></div></div>
  </div>
}

function PublicApplication({slug}:{slug:string}) {
  const [loading,setLoading]=useState(true), [error,setError]=useState(''), [submitted,setSubmitted]=useState(false), [uniqueId,setUniqueId]=useState('')
  const [app,setApp]=useState<{id:string;name:string;description:string|null;deadline:string|null} | null>(null)
  const [settings,setSettings]=useState<{confirmation_message:string;start_date:string|null;submission_limit:number|null;applicant_instructions:string|null}|null>(null)
  const [questions,setQuestions]=useState<BuilderQuestion[]>([]), [answers,setAnswers]=useState<Record<string,string|string[]>>({}), [files,setFiles]=useState<Record<string,File>>({})
  const [lgaOptions,setLgaOptions]=useState<string[]>([]), [lgaLoading,setLgaLoading]=useState(false)
  useEffect(()=>{(async()=>{try{
    const {data:s,error:se}=await supabase.from('application_settings').select('application_id,confirmation_message,start_date,submission_limit,applicant_instructions').eq('public_slug',slug).single(); if(se)throw se
    const {data:a,error:ae}=await supabase.from('applications').select('id,name,description,deadline').eq('id',s.application_id).eq('status','published').single(); if(ae)throw ae
    const today=new Date().toISOString().slice(0,10); if(s.start_date&&today<s.start_date)throw new Error(`Applications open on ${new Date(s.start_date+'T00:00:00').toLocaleDateString()}.`); if(a.deadline&&today>a.deadline)throw new Error('Applications for this programme are now closed.')
    if(s.submission_limit!==null){const {count,error:ce}=await supabase.from('submissions').select('id',{count:'exact',head:true}).eq('application_id',a.id).eq('status','submitted');if(ce)throw ce;if((count||0)>=s.submission_limit)throw new Error('This application has reached its submission limit.')}
    const {data:v,error:ve}=await supabase.from('form_versions').select('id').eq('application_id',a.id).eq('status','published').order('version_number',{ascending:false}).limit(1).single(); if(ve)throw ve
    const {data:qs,error:qe}=await supabase.from('questions').select('id,type,label,description,required,placeholder,position,config,conditional_rules').eq('form_version_id',v.id).order('position'); if(qe)throw qe
    const full=await Promise.all((qs||[]).map(async q=>{const {data:o,error:oe}=await supabase.from('question_options').select('id,label,value,position').eq('question_id',q.id).order('position');if(oe)throw oe;return {...q,options:o||[]}}))
    setApp(a);setSettings(s);setQuestions(full as BuilderQuestion[])
  }catch(e){setError(e instanceof Error?e.message:'This application is unavailable.')}finally{setLoading(false)}})()},[slug])
  const visible=(q:BuilderQuestion)=>{const r=q.conditional_rules?.[0];if(!r)return true;return answers[r.question_id]===r.value}
  const stateQuestion=questions.find(q=>q.type==='nigeria_state')
  const selectedState=stateQuestion?String(answers[stateQuestion.id]||''):''
  useEffect(()=>{(async()=>{if(!selectedState){setLgaOptions([]);return}setLgaLoading(true);try{setLgaOptions(await getNigerianLgas(selectedState))}catch{setLgaOptions([])}finally{setLgaLoading(false)}})()},[selectedState])
  function setAnswer(id:string,value:string|string[]){setAnswers(x=>({...x,[id]:value}))}
  function setStateAnswer(id:string,value:string){setAnswers(x=>{const next={...x,[id]:value};const lga=questions.find(q=>q.type==='nigeria_lga');if(lga)delete next[lga.id];return next})}
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
    const {data:submissionResult,error:se}=await supabase.rpc('submit_application_with_id',{p_application_id:app!.id,p_form_version_id:v.id,p_email:emailQ?String(answers[emailQ.id]||''):null,p_full_name:nameQ?String(answers[nameQ.id]||''):null,p_answers:answerPayload});if(se)throw se
    let submissionPayload:any=typeof submissionResult==='string'?JSON.parse(submissionResult):submissionResult
    if(typeof submissionPayload==='string'){
      try{submissionPayload=JSON.parse(submissionPayload)}catch{}
    }
    let assignedId=Array.isArray(submissionPayload)
      ? submissionPayload[0]?.unique_id
      : submissionPayload?.unique_id||submissionPayload?.data?.unique_id||submissionPayload?.result?.unique_id
    // Supabase can return JSONB through a nested response shape depending on the client/runtime.
    // If the ID is not in the RPC payload, use the returned submission ID to resolve it directly.
    const submissionId=Array.isArray(submissionPayload)
      ? submissionPayload[0]?.submission_id
      : submissionPayload?.submission_id
        ||submissionPayload?.data?.submission_id
        ||submissionPayload?.data?.[0]?.submission_id
        ||submissionPayload?.result?.submission_id
        ||submissionPayload?.result?.data?.submission_id
    if(!assignedId&&submissionId){
      const {data:submittedRow,error:submittedRowError}=await supabase
        .from('submissions')
        .select('applicants!inner(unique_id)')
        .eq('id',submissionId)
        .maybeSingle()
      if(submittedRowError)throw submittedRowError
      assignedId=(submittedRow as any)?.applicants?.unique_id||''
    }
    if(!assignedId)throw new Error('Your application was submitted, but we could not retrieve your application ID. Please contact the programme team with the time of submission.')
    for(const q of questions.filter(q=>(q.type==='file'||q.type==='image')&&files[q.id])){
      const file=files[q.id]!, meta=answerPayload.find(x=>x.question_id===q.id)?.value as {path:string}
      const {error:uploadError}=await supabase.storage.from('application-files').upload(meta.path,file,{contentType:file.type||'application/octet-stream',upsert:false})
      if(uploadError){
        throw new Error(`Application was submitted, but the file "${file.name}" could not be uploaded. Please try again or contact the programme team. (${uploadError.message})`)
      }
    }
    setUniqueId(assignedId)
    setSubmitted(true)
  }catch(e){
    const err=e as any
    const message=err?.message||err?.error_description||err?.details||err?.hint||'Could not submit application. Please try again.'
    setError(message)
  }finally{setLoading(false)}}
  if(loading&&!app)return <div className="public-shell"><div className="public-card card">Loading application…</div></div>
  if(error&&!app)return <div className="public-shell"><div className="public-card card"><div className="empty-icon"><FileText size={22}/></div><h1>Application unavailable</h1><p>{error}</p></div></div>
  if(submitted)return <div className="public-shell"><div className="public-card card public-success"><div className="success-mark">✓</div><p className="eyebrow">Application submitted</p><h1>Thank you.</h1><p>{settings?.confirmation_message}</p><div className="card" style={{marginTop:20,padding:20}}><p className="eyebrow">Your unique application ID</p><h2 style={{margin:"6px 0"}}>{uniqueId}</h2><p className="muted">This ID has been assigned to your application. Please copy it and keep it somewhere safe. You can use this ID when referencing your application or contacting the programme team.</p></div></div></div>
  return <div className="public-shell"><div className="public-frame"><div className="public-brand"><div className="public-brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application form</span></div></div><form className="public-form card" onSubmit={submit}><header className="public-header"><div className="public-kicker-row"><p className="eyebrow">Application</p><span className="public-status">Open</span></div><h1>{app?.name}</h1><p className="public-description">{app?.description||'Complete the form below to apply.'}</p><div className="public-meta">{settings?.start_date&&<div><span>Opens</span><strong>{new Date(settings.start_date+"T00:00:00").toLocaleDateString()}</strong></div>}{app?.deadline&&<div><span>Deadline</span><strong>{formatDate(app.deadline)}</strong></div>}<div><span>Questions</span><strong>{questions.filter(visible).length}</strong></div></div>{settings?.applicant_instructions&&<div className="public-instructions"><strong>Before you begin</strong><p>{settings.applicant_instructions}</p></div>}</header><div className="public-form-body">{questions.map((q,i)=>visible(q)&&<div className="public-question" key={q.id}><label><span className="public-question-number">{String(i+1).padStart(2,'0')}</span><span className="public-question-copy"><span className="public-question-title">{q.label}{q.required&&<span className="required-star">*</span>}</span>{q.description&&<small>{q.description}</small>}</span></label>{q.type==='long_text'?<textarea value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='date'?<input type="date" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)}/>:q.type==='number'?<input type="number" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='email'?<input type="email" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='phone'?<input type="tel" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='dropdown'?<select value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)}><option value="">Select an option</option>{q.options.map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select>:q.type==='nigeria_state'?<select value={String(answers[q.id]||'')} onChange={e=>setStateAnswer(q.id,e.target.value)}><option value="">Select your state of origin</option>{NIGERIAN_STATES.map(state=><option key={state} value={state}>{state}</option>)}</select>:q.type==='nigeria_lga'?<select value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} disabled={!selectedState||lgaLoading}><option value="">{!selectedState?'Select your state first':lgaLoading?'Loading local governments…':'Select your local government'}</option>{lgaOptions.map(lga=><option key={lga} value={lga}>{lga}</option>)}</select>:q.type==='single_choice'||q.type==='yes_no'?<div className="public-options">{q.options.map(o=><label key={o.id}><input type="radio" name={q.id} checked={answers[q.id]===o.value} onChange={()=>setAnswer(q.id,o.value)}/><span>{o.label}</span></label>)}</div>:q.type==='multiple_choice'?<div className="public-options">{q.options.map(o=><label key={o.id}><input type="checkbox" checked={Array.isArray(answers[q.id])&&answers[q.id].includes(o.value)} onChange={e=>{const current=Array.isArray(answers[q.id])?(answers[q.id] as string[]):[];setAnswer(q.id,e.target.checked?[...current,o.value]:current.filter((v:string)=>v!==o.value))}}/><span>{o.label}</span></label>)}</div>:q.type==='rating'?<div className="rating-options">{[1,2,3,4,5].map(n=><button type="button" key={n} className={answers[q.id]===String(n)?'rating-active':''} onClick={()=>setAnswer(q.id,String(n))}>{n}</button>)}</div>:q.type==='file'||q.type==='image'?<input type="file" accept={q.type==='image'?'image/*':undefined} onChange={e=>{const f=e.target.files?.[0]||null;setFile(q.id,f);setAnswer(q.id,f?.name||'')}}/>:<input value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>}</div>)}</div><div className="public-form-actions">{error&&<div className="form-error">{error}</div>}<button className="primary-button public-submit" disabled={loading}>{loading?'Submitting…':'Submit application'}</button></div></form><p className="public-footer-note">Your information will be securely submitted to the programme team.</p></div></div>
}

function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(() => localStorage.getItem('applyflow-theme') === 'dark')
  useEffect(() => {
    document.documentElement.classList.toggle('dark-theme', dark)
    localStorage.setItem('applyflow-theme', dark ? 'dark' : 'light')
  }, [dark])
  return <button className={compact ? 'theme-toggle compact' : 'theme-toggle'} onClick={() => setDark(value => !value)} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
    {dark ? <Sun size={16}/> : <Moon size={16}/>}<span>{dark ? 'Light' : 'Dark'}</span>
  </button>
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
      <div className="landing-actions"><ThemeToggle compact/><a className="landing-login" href="/login">Sign in</a><a className="landing-cta small" href="/login">Get started <ArrowRight size={15}/></a></div>
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

function getInitialWorkspaceRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent)
  if (!parts.length) return { active: 'Dashboard', applicationId: '', tab: 'Overview' as const }
  const key = parts[0]
  const activeMap: Record<string, string> = { dashboard:'Dashboard', applications:'Applications', forms:'Forms', screening:'Screening', reviews:'Reviews', participants:'Participants', analytics:'Analytics', team:'Team', settings:'Settings' }
  if (key === 'application' && parts[1]) {
    const tab = (parts[2] || 'overview').replace(/^./, x => x.toUpperCase()) as 'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants'|'Reviews'|'Selection'|'Communications'
    return { active: 'Applications', applicationId: parts[1], tab }
  }
  return { active: activeMap[key] || 'Dashboard', applicationId: '', tab: 'Overview' as const }
}

function App() {
  const initialRoute = getInitialWorkspaceRoute()
  const [sessionReady, setSessionReady] = useState(false)
  const [invitePending, setInvitePending] = useState(()=>new URLSearchParams(window.location.search).get('invite') === '1')
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [applications, setApplications] = useState<Application[]>([])
  const [active, setActive] = useState(initialRoute.active)
  const [routeRestored, setRouteRestored] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [detailTab, setDetailTab] = useState<'Overview'|'Form'|'Eligibility'|'Scoring'|'Screening'|'Applicants'|'Reviews'|'Selection'|'Communications'>(initialRoute.tab)
  const [applicationSettings, setApplicationSettings] = useState<{ public_slug: string; confirmation_message: string } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailSaving, setDetailSaving] = useState(false)
  const [detailError, setDetailError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createMode, setCreateMode] = useState<'application'|'form'>('application')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [newName, setNewName] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newDeadline, setNewDeadline] = useState('')
  const [newTarget, setNewTarget] = useState('')
  const [newParticipantCode, setNewParticipantCode] = useState('APP')
  const [importOpen, setImportOpen] = useState(false)

  async function loadWorkspace(currentSession = session) {
    if (!currentSession?.user) return
    setLoading(true); setError('')
    let { data: p, error: pError } = await supabase.from('profiles').select('id,full_name,organization_id,role').eq('id', currentSession.user.id).maybeSingle()
    if (pError) { setError(pError.message); setLoading(false); return }
    if (!p) {
      const metadata = currentSession.user.user_metadata || {}
      let googleSignup: { full_name?: string; organization_name?: string } | null = null
      try {
        const raw = localStorage.getItem('applyflow-google-signup')
        if (raw) googleSignup = JSON.parse(raw)
      } catch {}
      const fullName = String(googleSignup?.full_name || metadata.full_name || currentSession.user.email?.split('@')[0] || 'Workspace owner').trim()
      const organizationName = String(googleSignup?.organization_name || metadata.organization_name || 'ApplyFlow Workspace').trim() || 'ApplyFlow Workspace'
      const slugBase = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'applyflow'
      const slug = slugBase + '-' + currentSession.user.id.slice(0, 8)
      const { data: org, error: orgError } = await supabase.from('organizations').insert({ name: organizationName, slug, created_by: currentSession.user.id }).select('id,name,slug').single()
      if (orgError) { setError(orgError.message); setLoading(false); return }
      const { data: createdProfile, error: profileError } = await supabase.from('profiles').insert({ id: currentSession.user.id, full_name: fullName, organization_id: org.id, role: 'owner' }).select('id,full_name,organization_id,role').single()
      if (profileError) { setError(profileError.message); setLoading(false); return }
      p = createdProfile
      localStorage.removeItem('applyflow-google-signup')
    }
    setProfile(p)
    localStorage.removeItem('applyflow-google-signup')
    if (p.organization_id) {
      const [{ data: org, error: oError }, { data: apps, error: aError }] = await Promise.all([
        supabase.from('organizations').select('id,name,slug').eq('id', p.organization_id).single(),
        supabase.from('applications').select('id,name,description,status,deadline,target_count,participant_code,created_at').eq('organization_id', p.organization_id).order('created_at', { ascending: false }),
      ])
      if (oError) setError(oError.message); else setOrganization(org)
      if (aError) setError(aError.message)
      else {
        const nextApplications = apps ?? []
        setApplications(nextApplications)
        if (initialRoute.applicationId) {
          const restored = nextApplications.find(item => item.id === initialRoute.applicationId)
          if (restored) {
            setSelectedApplication(restored)
            setDetailTab(initialRoute.tab)
            setDetailLoading(true)
            const { data: restoredSettings, error: restoredSettingsError } = await supabase.from('application_settings').select('public_slug,confirmation_message').eq('application_id', restored.id).single()
            if (restoredSettingsError) setDetailError(restoredSettingsError.message)
            setApplicationSettings(restoredSettings)
            setDetailLoading(false)
          }
        }
      }
    }
    setLoading(false)
    setRouteRestored(true)
  }

  useEffect(() => {
    // Always restore the persisted Supabase session on startup, including public routes.
    // Public pages can render without waiting for auth, but a logged-in user must not
    // be treated as signed out just because the browser was refreshed.
    const restoreSession = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        setSession(data.session)
        if (data.session && !invitePending) await loadWorkspace(data.session)
      } catch (err) {
        // Keep public pages usable if Supabase is unavailable, but surface the error
        // when the app needs an authenticated workspace.
        setError(err instanceof Error ? err.message : 'Could not connect to the authentication service.')
      } finally {
        setSessionReady(true)
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next && !invitePending) loadWorkspace(next)
    })

    restoreSession()
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!sessionReady || !session || !routeRestored) return
    const nextHash = selectedApplication
      ? `#/application/${encodeURIComponent(selectedApplication.id)}/${encodeURIComponent(detailTab.toLowerCase())}`
      : `#/${active.toLowerCase()}`
    if (window.location.hash !== nextHash) window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}${nextHash}`)
  }, [active, detailTab, selectedApplication, routeRestored, sessionReady, session])

  const filtered = useMemo(() => applications.filter(a => a.name.toLowerCase().includes(query.toLowerCase())), [applications, query])
  const totalTarget = applications.reduce((sum,a)=>sum+(a.target_count ?? 0),0)
  const profileName = profile?.full_name || session?.user.email?.split('@')[0] || 'there'
  const firstName = profileName.split(' ')[0]

  if (window.location.pathname.startsWith('/apply/')) return <PublicApplication slug={decodeURIComponent(window.location.pathname.split('/')[2] || '')} />
  if (invitePending && session) return <InviteSetupScreen email={session.user.email || ''} onComplete={async () => {
    const { error: profileError } = await supabase.from('profiles')
      .update({ invitation_status: 'active' })
      .eq('id', session.user.id)
    if (profileError) throw profileError

    // Invitation links create a temporary authenticated session so the invited
    // user can set their password. Do not send them into the workspace yet.
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setOrganization(null)
    setApplications([])
    setInvitePending(false)
    window.history.replaceState({}, '', '/login')
    setSessionReady(true)
  }} />
  if (window.location.pathname === '/login' && !session) return <AuthScreen onSignedIn={async () => {
    const { data } = await supabase.auth.getSession()
    setSession(data.session)
    window.history.replaceState({}, '', '/')
    if (data.session) await loadWorkspace(data.session)
    setSessionReady(true)
  }} />
  if (!sessionReady) return <div className="loading-screen"><div className="brand-mark">A</div><span>Loading ApplyFlow…</span></div>
  if (!session) return <LandingPage />

  function openWorkspaceModule(application: Application, tab: 'Form'|'Screening'|'Reviews') {
    setSelectedApplication(application)
    setDetailTab(tab)
    setDetailLoading(true)
    setDetailError('')
    supabase.from('application_settings').select('public_slug,confirmation_message').eq('application_id', application.id).single().then(({data,error})=>{
      if(error) setDetailError(error.message)
      setApplicationSettings(data)
      setDetailLoading(false)
    })
  }

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
        .select('id,name,description,status,deadline,target_count,participant_code,created_at')
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

  function openCreate(mode: 'application'|'form' = 'application') { setCreateMode(mode); setCreateError(''); setNewName(''); setNewDescription(''); setNewDeadline(''); setNewTarget(''); setNewParticipantCode('APP'); setCreateOpen(true) }
  function openGoogleFormImport(){ setImportOpen(true) }

  async function createApplication(e: React.FormEvent) {
    e.preventDefault()
    if (!session?.user || !profile?.organization_id) return
    if (!newName.trim()) { setCreateError(createMode==='form' ? 'Form name is required.' : 'Programme name is required.'); return }
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
          participant_code: newParticipantCode.trim().toUpperCase() || 'APP',
          status: 'draft',
        })
        .select('id,name,description,status,deadline,target_count,participant_code,created_at')
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
      if (createMode==='form') {
        setActive('Forms')
        setSelectedApplication(application)
        setDetailTab('Form')
        setDetailLoading(true)
        setDetailError('')
        const {data:createdSettings,error:createdSettingsError}=await supabase.from('application_settings').select('public_slug,confirmation_message').eq('application_id',application.id).single()
        if(createdSettingsError) setDetailError(createdSettingsError.message)
        setApplicationSettings(createdSettings)
        setDetailLoading(false)
      } else {
        setActive('Applications')
      }
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
      <nav className="nav-group"><p className="nav-label">Workspace</p>{(profile?.role==='reviewer'?nav.filter(item=>item.label==='Dashboard'||item.label==='Reviews'):nav).map(({label,icon:Icon})=><button key={label} className={active===label?'nav-item active':'nav-item'} onClick={()=>{closeApplication();setActive(label);setSidebarOpen(false)}}><Icon size={18}/><span>{label}</span>{label==='Screening'&&<span className="nav-count">0</span>}</button>)}</nav>
      {profile?.role!=='reviewer'&&<nav className="nav-group bottom"><p className="nav-label">Manage</p>{bottomNav.map(({label,icon:Icon})=><button key={label} className={active===label?'nav-item active':'nav-item'} onClick={()=>{closeApplication();setActive(label);setSidebarOpen(false)}}><Icon size={18}/><span>{label}</span></button>)}</nav>}
      <div className="sidebar-footer"><div className="help-card"><Sparkles size={17}/><div><strong>AI screening</strong><span>Coming in the next phase</span></div></div><div className="profile-row"><div className="profile-avatar">{profileName.slice(0,2).toUpperCase()}</div><div><strong>{profileName}</strong><span>{profile?.role || 'Owner'}</span></div><button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={15}/></button></div></div>
    </aside>
    <main className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setSidebarOpen(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{active}</strong></div><div className="top-actions"><button className="icon-button" aria-label="Notifications"><Bell size={18}/></button><ThemeToggle/><div className="top-avatar">{profileName.slice(0,2).toUpperCase()}</div></div></header>
      <div className="content">
        {selectedApplication ? <ApplicationDetails application={selectedApplication} settings={applicationSettings} tab={detailTab} setTab={setDetailTab} loading={detailLoading} saving={detailSaving} error={detailError} onBack={closeApplication} onSave={saveApplicationDetails} /> : loading ? <div className="loading-card card">Loading your workspace…</div> : error ? <div className="form-error page-error">{error}</div> : active==='Dashboard' ? <>
          <section className="page-heading"><div><p className="eyebrow">Your workspace</p><h1>Good evening, {firstName}.</h1><p className="subtitle">Here’s what is happening across your programmes.</p></div><button className="primary-button" onClick={()=>openCreate()}><Plus size={17}/> New application</button></section>
          <section className="stats-grid"><StatCard label="Programmes" value={applications.length.toLocaleString()} note="In your workspace" icon={FolderKanban}/><StatCard label="Targets" value={totalTarget.toLocaleString()} note="Across programmes" icon={FileCheck2}/><StatCard label="Published" value={applications.filter(a=>a.status==='published').length.toLocaleString()} note="Currently accepting" icon={ShieldCheck}/><StatCard label="Screening" value={applications.filter(a=>a.status==='screening').length.toLocaleString()} note="In review" icon={Users}/></section>
          <section className="dashboard-grid"><div className="card table-card"><div className="card-header"><div><h2>Programmes</h2><p>Your application programmes from Supabase.</p></div><button className="text-button" onClick={()=>setActive('Applications')}>View all</button></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Target</th><th>Deadline</th></tr></thead><tbody>{applications.length===0?<tr><td colSpan={4}><div className="table-empty">No programmes yet. Create your first application programme.</div></td></tr>:applications.map(item=><tr key={item.id}><td><strong>{item.name}</strong><span className="table-sub">{item.description || 'No description yet.'}</span></td><td><span className={'status '+(item.status==='published'?'blue':item.status==='screening'?'amber':item.status==='completed'?'green':'neutral')}>{statusLabel(item.status)}</span></td><td>{(item.target_count??0).toLocaleString()}</td><td>{formatDate(item.deadline)}</td></tr>)}</tbody></table></div></div><div className="card funnel-card"><div className="card-header"><div><h2>Workspace health</h2><p>Live database connection</p></div><span className="status green">Connected</span></div><div className="connection-list"><div><span>Organisation</span><strong>{organization?.name || '—'}</strong></div><div><span>Role</span><strong>{profile?.role || '—'}</strong></div><div><span>Programmes</span><strong>{applications.length}</strong></div></div></div></section>
        </> : selectedApplication ? <ApplicationDetails application={selectedApplication} settings={applicationSettings} tab={detailTab} setTab={setDetailTab} loading={detailLoading} saving={detailSaving} error={detailError} onBack={closeApplication} onSave={saveApplicationDetails}/> : active==='Analytics' ? <AnalyticsPanel applications={applications}/> : active==='Applications' ? <section><div className="page-heading compact"><div><p className="eyebrow">Workspace</p><h1>Applications</h1><p className="subtitle">Manage your application programmes.</p></div><div className="detail-actions"><button className="secondary-button" onClick={openGoogleFormImport}><Download size={16}/> Import Google Form</button><button className="primary-button" onClick={()=>openCreate()}><Plus size={17}/> New application</button></div></div><div className="card table-card"><div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search applications…"/></div><button className="secondary-button">All status <ChevronDown size={15}/></button></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Target</th><th>Deadline</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id} onClick={()=>openApplication(item)} className="clickable-row"><td><strong>{item.name}</strong><span className="table-sub">{item.description || 'No description yet.'}</span></td><td><span className={'status '+(item.status==='published'?'blue':item.status==='screening'?'amber':item.status==='completed'?'green':'neutral')}>{statusLabel(item.status)}</span></td><td>{(item.target_count??0).toLocaleString()}</td><td>{formatDate(item.deadline)}</td></tr>)}</tbody></table></div></div></section> : active==='Forms' ? <FormsWorkspace applications={applications} onOpen={a=>openWorkspaceModule(a,'Form')} onCreate={()=>openCreate('form')}/> : active==='Screening' ? <ScreeningWorkspace applications={applications} role={profile?.role} onOpen={a=>openWorkspaceModule(a,'Screening')}/> : active==='Reviews' ? <ReviewsWorkspace applications={applications} organizationId={organization!.id} role={profile?.role} onOpen={a=>openWorkspaceModule(a,'Reviews')}/> : active==='Participants' ? <ParticipantsPanel organizationId={organization!.id} applications={applications}/> : active==='Team' ? <TeamWorkspace organizationId={organization!.id} role={profile?.role}/> : active==='Settings' ? <SettingsWorkspace organization={organization} onSaved={name=>setOrganization(x=>x?{...x,name}:x)}/> : <section><div className="page-heading compact"><div><p className="eyebrow">Workspace</p><h1>{active}</h1><p className="subtitle">This module is ready for implementation.</p></div></div><div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>No records yet</h2><p>Create a programme to start using this workspace.</p></div></section>}
      </div>
    </main>
    {importOpen && <GoogleFormImport applications={applications} organizationId={organization!.id} onClose={()=>setImportOpen(false)} />}
    {createOpen && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCreateOpen(false)}}>
      <form className="modal card" onSubmit={createApplication}>
        <div className="modal-header"><div><p className="eyebrow">{createMode==='form'?'New form':'New programme'}</p><h2>{createMode==='form'?'Create a Form':'Create a Programme'}</h2><p>{createMode==='form'?'Create the questionnaire applicants will complete. You can add questions immediately after it is created.':'Create the programme that owns the application form, deadline and target.'}</p></div><button type="button" className="icon-button" onClick={()=>setCreateOpen(false)} aria-label="Close"><X size={18}/></button></div>
        <div className="modal-form">
          <label>{createMode==='form'?'Form name':'Programme name'}<input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Women Artisans Application Form" required /></label>
          <label>Description <span className="optional">Optional</span><textarea value={newDescription} onChange={e=>setNewDescription(e.target.value)} placeholder={createMode==='form'?'Briefly describe what this form is for.':'Briefly describe who this programme is for and what it offers.'} rows={4}/></label>
          {createMode==='application'&&<><div className="form-grid"><label>Application deadline <span className="optional">Optional</span><input type="date" value={newDeadline} onChange={e=>setNewDeadline(e.target.value)} /></label><label>Target number <span className="optional">Optional</span><input type="number" min="0" value={newTarget} onChange={e=>setNewTarget(e.target.value)} placeholder="150" /></label></div><label>Participant ID code<input value={newParticipantCode} onChange={e=>setNewParticipantCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} placeholder="HC2" minLength={2} maxLength={12} required/><small className="field-help">This is the owner-defined code. ApplyFlow adds the creation year and 4-digit participant number automatically, e.g. <strong>{newParticipantCode||'HC2'}-2026-0001</strong>.</small></label></>}
          {createError && <div className="form-error">{createError}</div>}
        </div>
        <div className="modal-footer"><button type="button" className="secondary-button" onClick={()=>setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={creating}>{creating?'Creating…':createMode==='form'?'Create Form':'Create Programme'}</button></div>
      </form>
    </div>}
  </div>
}

function ApplicantsPanel({applicationId}:{applicationId:string}) {
  type Row={id:string;applicant_id:string;unique_id:string|null;full_name:string|null;email:string|null;status:string;submitted_at:string|null;created_at:string}
  const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState<'all'|'submitted'|'draft'>('all'),[selected,setSelected]=useState<Row|null>(null)
  const [answerRows,setAnswerRows]=useState<{label:string;value:string}[]>([])
  useEffect(()=>{(async()=>{try{
    const {data,error}=await supabase.from('submissions').select('id,applicant_id,status,submitted_at,created_at,applicants!inner(full_name,email,unique_id)').eq('application_id',applicationId).order('submitted_at',{ascending:false})
    if(error)throw error
    setRows((data||[]).map((r:any)=>({id:r.id,applicant_id:r.applicant_id,unique_id:r.applicants?.unique_id||null,status:r.status,submitted_at:r.submitted_at,created_at:r.created_at,full_name:r.applicants?.full_name||null,email:r.applicants?.email||null})))
  }catch(e){setError(e instanceof Error?e.message:'Could not load applications.')}finally{setLoading(false)}})()},[applicationId])
  const filtered=useMemo(()=>rows.filter(r=>{const haystack=[r.unique_id,r.full_name,r.email,r.status].filter(Boolean).join(' ').toLowerCase();return(!query.trim()||haystack.includes(query.trim().toLowerCase()))&&(statusFilter==='all'||r.status===statusFilter)}),[rows,query,statusFilter])
  const submittedCount=rows.filter(r=>r.status==='submitted').length
  const draftCount=rows.filter(r=>r.status==='draft').length
  async function open(row:Row){
    setSelected(row);setAnswerRows([])
    const {data,error}=await supabase.from('answers').select('question_id,value').eq('submission_id',row.id)
    if(error){setError(error.message);return}
    if(data?.length){const ids=data.map(x=>x.question_id);const {data:qs}=await supabase.from('questions').select('id,label').in('id',ids);const labels=new Map((qs||[]).map(q=>[q.id,q.label]));setAnswerRows(data.map(x=>({label:labels.get(x.question_id)||'Question',value:Array.isArray(x.value)?x.value.join(', '):String(x.value??'')})))}
  }
  if(loading)return <div className="loading-card card">Loading applications…</div>
  if(error)return <div className="form-error page-error">{error}</div>
  return <div className="applicants-panel">
    <div className="applicants-toolbar"><div><p className="eyebrow">Applications received</p><h2>{rows.length} submission{rows.length===1?'':'s'}</h2><p className="muted">Every submission keeps its own unique application ID.</p></div><div className="applicant-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email or application ID"/></div></div>
    <div className="stats-grid" style={{marginBottom:16}}><div className="card stat-card"><div className="stat-icon"><FileCheck2 size={18}/></div><div><p className="eyebrow">Total</p><div className="stat-value">{rows.length}</div><p className="muted">All submissions</p></div></div><div className="card stat-card"><div className="stat-icon"><CheckCircle2 size={18}/></div><div><p className="eyebrow">Submitted</p><div className="stat-value">{submittedCount}</div><p className="muted">Ready for screening</p></div></div><div className="card stat-card"><div className="stat-icon"><Clock3 size={18}/></div><div><p className="eyebrow">Drafts</p><div className="stat-value">{draftCount}</div><p className="muted">Not yet submitted</p></div></div></div>
    <div className="card table-card"><div className="toolbar"><div className="forms-filters" role="group" aria-label="Filter applications"><button className={statusFilter==='all'?'filter-button active':'filter-button'} onClick={()=>setStatusFilter('all')}>All <span>{rows.length}</span></button><button className={statusFilter==='submitted'?'filter-button active':'filter-button'} onClick={()=>setStatusFilter('submitted')}>Submitted <span>{submittedCount}</span></button><button className={statusFilter==='draft'?'filter-button active':'filter-button'} onClick={()=>setStatusFilter('draft')}>Drafts <span>{draftCount}</span></button></div></div>
      {!filtered.length?<div className="empty-state"><div className="empty-icon"><Users size={22}/></div><h2>No applications found</h2><p>{rows.length?'Try another search or filter.':'Submitted applications will appear here.'}</p></div>:<div className="table-wrap"><table className="applicants-table"><thead><tr><th>Application ID</th><th>Applicant</th><th>Email</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.id} onClick={()=>open(r)}><td><strong>{r.unique_id||'—'}</strong></td><td><strong>{r.full_name||'Unnamed applicant'}</strong></td><td>{r.email||'—'}</td><td><span className={'status '+(r.status==='submitted'?'blue':'neutral')}>{statusLabel(r.status as AppStatus)}</span></td><td>{r.submitted_at?formatDate(r.submitted_at):'—'}</td><td><button className="text-button" onClick={e=>{e.stopPropagation();open(r)}}>View</button></td></tr>)}</tbody></table></div>}</div>
    {selected&&<div className="applicant-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="applicant-drawer"><div className="drawer-header"><div><p className="eyebrow">Application</p><h2>{selected.unique_id||'Application'}</h2><p>{selected.full_name||'Unnamed applicant'} · {selected.email||'No email provided'}</p></div><button className="icon-button" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="drawer-meta"><div><span>Applicant</span><strong>{selected.full_name||'Unnamed applicant'}</strong></div><div><span>Status</span><strong>{statusLabel(selected.status as AppStatus)}</strong></div><div><span>Submitted</span><strong>{selected.submitted_at?formatDate(selected.submitted_at):'—'}</strong></div></div><div className="drawer-section"><p className="eyebrow">Application answers</p>{answerRows.length?answerRows.map((a,i)=><div className="answer-item" key={i}><strong>{a.label}</strong><span>{a.value||'Not provided'}</span></div>):<p className="muted">No answers recorded.</p>}</div></aside></div>}
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
  const [deadline,setDeadline]=useState(application.deadline||''), [target,setTarget]=useState(application.target_count?.toString()||''), [participantCode,setParticipantCode]=useState(application.participant_code||'APP')
  const [slug,setSlug]=useState(settings?.public_slug||''), [message,setMessage]=useState(settings?.confirmation_message||'')
  useEffect(()=>{setName(application.name);setDescription(application.description||'');setDeadline(application.deadline||'');setTarget(application.target_count?.toString()||'');setParticipantCode(application.participant_code||'APP')},[application])
  useEffect(()=>{setSlug(settings?.public_slug||'');setMessage(settings?.confirmation_message||'')},[settings])
  const tabs=['Overview','Form','Eligibility','Scoring','Screening','Applicants','Reviews','Selection','Communications'] as const
  return <section className="application-detail">
    <button className="back-link" onClick={onBack}>← Back to applications</button>
    <div className="detail-header"><div><p className="eyebrow">Application programme</p><div className="detail-title-row"><h1>{application.name}</h1><span className={'status '+(application.status==='published'?'blue':application.status==='screening'?'amber':'neutral')}>{statusLabel(application.status)}</span></div><p className="subtitle">{application.description||'No description yet.'}</p></div><div className="detail-actions">{application.status==='draft'&&<button className="primary-button" disabled={saving} onClick={()=>onSave({status:'published'})}>Publish</button>}{application.status==='published'&&<button className="secondary-button" disabled={saving} onClick={()=>onSave({status:'closed'})}>Close applications</button>}</div></div>
    <div className="detail-meta"><div><span>Deadline</span><strong>{formatDate(application.deadline)}</strong></div><div><span>Target</span><strong>{application.target_count?.toLocaleString()||'Not set'}</strong></div><div><span>Participant IDs</span><strong>{application.participant_code}-{new Date(application.created_at).getFullYear()}-0001</strong></div><div><span>Public URL</span><strong>/apply/{settings?.public_slug||'not-configured'}</strong></div></div>
    <div className="detail-tabs">{tabs.map(t=><button key={t} className={tab===t?'detail-tab active':'detail-tab'} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {loading?<div className="loading-card card">Loading programme settings…</div>:error?<div className="form-error page-error">{error}</div>:tab==='Overview'?<div className="detail-grid">
      <div className="card detail-card"><div className="card-header"><div><h2>Programme details</h2><p>Update the basic information for this programme.</p></div></div><div className="detail-form"><label>Programme name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Participant ID code<input value={participantCode} onChange={e=>setParticipantCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))} minLength={2} maxLength={12} required/><small className="field-help">Format: <strong>{participantCode||'HC2'}-{new Date(application.created_at).getFullYear()}-0001</strong>. The year and sequence are generated automatically.</small></label><label>Description<textarea rows={5} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="form-grid"><label>Application deadline<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>Target number<input type="number" min="0" value={target} onChange={e=>setTarget(e.target.value)}/></label></div><div className="detail-form-footer"><button className="primary-button" disabled={saving} onClick={()=>onSave({name:name.trim(),description:description.trim()||null,deadline:deadline||null,target_count:target?Number(target):null,participant_code:participantCode.trim().toUpperCase()})}>{saving?'Saving…':'Save changes'}</button></div></div></div>
      <div className="card detail-card"><div className="card-header"><div><h2>Public application</h2><p>Settings applicants will see.</p></div></div><div className="detail-form"><label>Public slug<input value={slug} onChange={e=>setSlug(e.target.value)}/></label><label>Confirmation message<textarea rows={5} value={message} onChange={e=>setMessage(e.target.value)}/></label><div className="detail-form-footer"><button className="secondary-button" disabled={saving} onClick={()=>onSave({}, {public_slug:slug.trim(),confirmation_message:message.trim()||'Thank you. Your application has been received.'})}>Save public settings</button></div></div></div>
    </div>:tab==='Form'?<FormBuilder applicationId={application.id}/>:tab==='Applicants'?<ApplicantsPanel applicationId={application.id}/>:tab==='Eligibility'?<EligibilityBuilder applicationId={application.id}/>:tab==='Scoring'?<ScoringBuilder applicationId={application.id}/>:tab==='Screening'?<ScreeningPanel applicationId={application.id}/>:tab==='Reviews'?<ReviewsPanel applicationId={application.id}/>:tab==='Selection'?<SelectionPanel applicationId={application.id}/>:tab==='Communications'?<CommunicationsPanel applicationId={application.id}/>:<div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>{tab} is next</h2><p>This section is connected to the programme workspace and will be built on the live data model.</p></div>}
  </section>
}

type QuestionType='short_text'|'long_text'|'email'|'phone'|'number'|'date'|'dropdown'|'single_choice'|'multiple_choice'|'yes_no'|'nigeria_state'|'nigeria_lga'|'file'|'image'|'rating'
type BuilderOption={id:string;label:string;value:string;position:number}
type BuilderQuestion={id:string;type:QuestionType;label:string;description:string|null;required:boolean;placeholder:string|null;position:number;config:Record<string,unknown>;conditional_rules:ConditionRule[]|null;options:BuilderOption[]}
type ConditionRule={question_id:string;operator:'equals'|'not_equals';value:string}
const questionTypes:{type:QuestionType;label:string;icon:string}[]=[
 {type:'short_text',label:'Short text',icon:'Aa'},{type:'long_text',label:'Long text',icon:'¶'},{type:'email',label:'Email',icon:'@'},{type:'phone',label:'Phone',icon:'☎'},
 {type:'number',label:'Number',icon:'#'},{type:'date',label:'Date',icon:'◫'},{type:'dropdown',label:'Dropdown',icon:'⌄'},{type:'single_choice',label:'Single choice',icon:'○'},
 {type:'multiple_choice',label:'Multiple choice',icon:'☑'},{type:'yes_no',label:'Yes / No',icon:'Y/N'},{type:'nigeria_state',label:'State of origin',icon:'NG'},{type:'nigeria_lga',label:'Local government area',icon:'LGA'},{type:'file',label:'File upload',icon:'↑'},{type:'image',label:'Image upload',icon:'▧'},{type:'rating',label:'Rating',icon:'★'}
]

type EligibilityOperator='='|'in'|'between'
type EligibilityRule={id:string;application_id:string;question_id:string;operator:EligibilityOperator;value:unknown;logic:'AND';position:number;enabled:boolean}

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
      setRules((rs||[]).map((r:any)=>({...r,operator:r.operator==='IN'||r.operator==='NOT IN'?'in':r.operator==='between'?'between':'=',logic:'AND'})) as EligibilityRule[])
    }catch(e){setNotice(e instanceof Error?e.message:'Could not load eligibility rules.')}finally{setLoading(false)}
  }

  useEffect(()=>{load()},[applicationId])

  function ruleForQuestion(q:BuilderQuestion){
    if(q.type==='number'||q.type==='rating') return {operator:'between' as const,value:[null,null]}
    if(q.type==='multiple_choice') return {operator:'in' as const,value:[]}
    return {operator:'=' as const,value:q.options[0]?.value||''}
  }

  function displayValue(rule:EligibilityRule){
    const q=questions.find(x=>x.id===rule.question_id)
    if(!q)return ''
    if(rule.operator==='between'&&Array.isArray(rule.value))return rule.value.every(v=>v!==null&&v!=='')?String(rule.value[0])+'–'+String(rule.value[1]):'Set age range'
    if(Array.isArray(rule.value)){
      return rule.value.map(String).map(v=>q.options.find(o=>o.value===v)?.label||v).join(', ')
    }
    return q.options.find(o=>o.value===String(rule.value))?.label||String(rule.value??'')
  }

  async function addRule(){
    if(!questions.length){setNotice('Add questions to the form before creating eligibility rules.');return}
    setBusy(true);setNotice('')
    const q=questions[0], defaults=ruleForQuestion(q)
    const {data,error}=await supabase.from('eligibility_rules').insert({
      application_id:applicationId,question_id:q.id,operator:defaults.operator,value:defaults.value,logic:'AND',position:rules.length,enabled:true
    }).select('id,application_id,question_id,operator,value,logic,position,enabled').single()
    if(error)setNotice(error.message);else setRules(x=>[...x,{...data,operator:data.operator as EligibilityOperator,logic:'AND'} as EligibilityRule])
    setBusy(false)
  }

  async function updateRule(id:string,patch:Partial<EligibilityRule>){
    setBusy(true);setNotice('')
    const clean={...patch,logic:'AND',updated_at:new Date().toISOString()}
    const {data,error}=await supabase.from('eligibility_rules').update(clean).eq('id',id).select('id,application_id,question_id,operator,value,logic,position,enabled').single()
    if(error)setNotice(error.message);else setRules(x=>x.map(r=>r.id===id?{...data,operator:data.operator as EligibilityOperator,logic:'AND'} as EligibilityRule:r))
    setBusy(false)
  }

  async function removeRule(id:string){
    setBusy(true);setNotice('')
    const {error}=await supabase.from('eligibility_rules').delete().eq('id',id)
    if(error)setNotice(error.message);else setRules(x=>x.filter(r=>r.id!==id))
    setBusy(false)
  }

  function valueEditor(rule:EligibilityRule,q:BuilderQuestion){
    if(rule.operator==='between'){
      const values=Array.isArray(rule.value)?rule.value:[null,null]
      return <div className="eligibility-range"><input type="number" value={values[0]??''} placeholder="Minimum" onChange={e=>updateRule(rule.id,{value:[e.target.value===''?null:Number(e.target.value),values[1]??null]})}/><span>to</span><input type="number" value={values[1]??''} placeholder="Maximum" onChange={e=>updateRule(rule.id,{value:[values[0]??null,e.target.value===''?null:Number(e.target.value)]})}/></div>
    }
    if(q.options.length){
      if(rule.operator==='in')return <div className="public-options eligibility-options">{q.options.map(o=>{const values=Array.isArray(rule.value)?rule.value.map(String):[];return <label key={o.id}><input type="checkbox" checked={values.includes(o.value)} onChange={e=>{const current=Array.isArray(rule.value)?rule.value.map(String):[];updateRule(rule.id,{value:e.target.checked?[...current,o.value]:current.filter(v=>v!==o.value)})}}/><span>{o.label}</span></label>})}</div>
      return <div className="eligibility-field"><select value={String(rule.value??'')} onChange={e=>updateRule(rule.id,{value:e.target.value})}><option value="">Select expected answer</option>{q.options.map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select><ChevronDown size={15}/></div>
    }
    return <input type={q.type==='number'||q.type==='rating'?'number':q.type==='date'?'date':'text'} value={Array.isArray(rule.value)?rule.value.join(', '):String(rule.value??'')} placeholder="Enter expected answer" onChange={e=>updateRule(rule.id,{value:e.target.value})}/>
  }

  if(loading)return <div className="loading-card card">Loading eligibility rules…</div>

  const enabledRules=rules.filter(r=>r.enabled).length
  return <div className="eligibility-builder">
    <div className="builder-top"><div><p className="eyebrow">Eligibility</p><h2>Eligibility rules</h2><p>Choose the answers an applicant must provide to qualify for this programme.</p></div><div className="builder-actions">{notice&&<span className="builder-notice">{notice}</span>}<button className="primary-button" disabled={busy||!questions.length} onClick={addRule}><Plus size={14}/> Add rule</button></div></div>
    <div className="eligibility-layout">
      <div className="eligibility-column"><div className="card eligibility-rules-card">
        <div className="card-header"><div><p className="eyebrow">Requirements</p><h2>{rules.length?rules.length+' requirement'+(rules.length===1?'':'s'):'No requirements yet'}</h2><p>Each requirement is one simple eligibility condition.</p></div><ShieldCheck size={20}/></div>
        {!rules.length?<div className="builder-empty eligibility-empty"><ShieldCheck size={24}/><h3>No eligibility requirements yet</h3><p>Add a requirement such as age, residence, or eligible trade.</p><button className="secondary-button" disabled={!questions.length||busy} onClick={addRule}>Create first requirement</button></div>:
        <div className="eligibility-list">{rules.map((rule,index)=>{const q=questions.find(x=>x.id===rule.question_id);return <div className="eligibility-rule" key={rule.id}>
          <div className="eligibility-rule-header"><div className="eligibility-rule-title"><span className="question-number">{index+1}</span><div><strong>Requirement {index+1}</strong><span>{rule.enabled?'Active':'Disabled'}</span></div></div><button className="icon-button question-delete" onClick={()=>removeRule(rule.id)} aria-label={'Delete requirement '+(index+1)}><X size={15}/></button></div>
          <label className="eligibility-rule-question">Question<div className="eligibility-field"><select value={rule.question_id} onChange={e=>{const next=questions.find(x=>x.id===e.target.value);const defaults=next?ruleForQuestion(next):{operator:'=' as EligibilityOperator,value:''};updateRule(rule.id,{question_id:e.target.value,operator:defaults.operator,value:defaults.value})}}>{questions.map(x=><option key={x.id} value={x.id}>{x.label}</option>)}</select><ChevronDown size={15}/></div></label>
          {q&&<label className="eligibility-value-field">Expected answer{q.type==='number'||q.type==='rating'?<><small>Set the minimum and maximum allowed value.</small>{valueEditor(rule,q)}</>:valueEditor(rule,q)}</label>}
          <div className="eligibility-rule-footer"><label className="toggle-row"><span>Requirement active</span><input type="checkbox" checked={rule.enabled} onChange={e=>updateRule(rule.id,{enabled:e.target.checked})}/></label><span className="eligibility-current">Current: <strong>{displayValue(rule)||'Not set'}</strong></span></div>
        </div>})}</div>}
      </div></div>
      <aside className="eligibility-column"><div className="card eligibility-summary-card">
        <div className="card-header"><div><p className="eyebrow">How eligibility works</p><h2>Simple and automatic</h2><p>Every active requirement must be satisfied.</p></div><ShieldCheck size={20}/></div>
        <div className="eligibility-summary-stats"><div><span>Total</span><strong>{rules.length}</strong></div><div><span>Active</span><strong>{enabledRules}</strong></div><div><span>Questions</span><strong>{questions.length}</strong></div></div>
        <div className="eligibility-info-box"><div className="eligibility-info-icon"><CheckCircle2 size={16}/></div><div><strong>Example</strong><p>Age: 20–35 · Residence: Lagos State · Trade: any selected eligible trade.</p></div></div>
        <div className="eligibility-info-box"><div className="eligibility-info-icon"><Sparkles size={16}/></div><div><strong>AI screening</strong><p>These requirements are included as part of the screening context so AI can explain whether the applicant meets them.</p></div></div>
        <div className="eligibility-help"><p className="eyebrow">Important</p><p>Eligibility is based on the applicant's submitted answers. If a required eligibility answer is missing, the result stays Pending rather than being guessed.</p></div>
      </div></aside>
    </div>
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
 async function load(){setLoading(true);setNotice('');const {data,error}=await supabase.from('submissions').select('id,status,submitted_at,applicants!inner(full_name,email),ai_screenings(id,status,overall_assessment,eligibility_status,eligibility_assessment,criterion_assessments,strengths,concerns,missing_information,inconsistencies,evidence,suggested_score,confidence,model,updated_at,error_message)').eq('application_id',applicationId).order('submitted_at',{ascending:false});if(error)setNotice(error.message);else setRows(data||[]);setLoading(false)}
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
  {selected&&<div className="screening-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="screening-drawer card"><div className="preview-header"><div><p className="eyebrow">Screening review</p><h2>{selected.applicants?.full_name||'Applicant'}</h2><p>{selected.applicants?.email}</p></div><button className="icon-button" onClick={()=>setSelected(null)}><X size={18}/></button></div>{!selected.ai_screenings?.[0]?<div className="builder-empty"><Sparkles size={22}/><h3>AI screening not started</h3><p>Run an evidence-based assessment using the configured scoring criteria.</p><button className="primary-button" disabled={running} onClick={()=>runScreening(selected.id)}>{running?'Running screening…':'Run AI screening'}</button></div>:<div className="screening-detail"><div className="screening-status-card"><span>Status</span><strong>{selected.ai_screenings[0].status}</strong><small>{selected.ai_screenings[0].model||'AI model not assigned'}</small></div><div className="screening-eligibility-card"><div><p className="eyebrow">Eligibility</p><strong>{selected.ai_screenings[0].eligibility_status||'Pending'}</strong><p>{selected.ai_screenings[0].eligibility_assessment||'Eligibility assessment will appear here after screening.'}</p></div><ShieldCheck size={20}/></div>{selected.ai_screenings[0].status==='failed'&&selected.ai_screenings[0].error_message&&<div className="form-error">{selected.ai_screenings[0].error_message}</div>}<section><p className="eyebrow">Assessment</p><p>{selected.ai_screenings[0].overall_assessment||'No assessment available yet.'}</p></section><section><p className="eyebrow">Suggested score</p><strong className="screening-score">{selected.ai_screenings[0].suggested_score??'—'}</strong></section><div className="screening-columns"><section><p className="eyebrow">Strengths</p>{(selected.ai_screenings[0].strengths||[]).map((x:string,i:number)=><p key={i}>• {x}</p>)}</section><section><p className="eyebrow">Concerns</p>{(selected.ai_screenings[0].concerns||[]).map((x:string,i:number)=><p key={i}>• {x}</p>)}</section></div><section><p className="eyebrow">Missing information</p>{(selected.ai_screenings[0].missing_information||[]).length?(selected.ai_screenings[0].missing_information||[]).map((x:string,i:number)=><p key={i}>• {x}</p>):<p className="muted">None recorded.</p>}</section><section><p className="eyebrow">Criterion assessments</p>{(selected.ai_screenings[0].criterion_assessments||[]).length?(selected.ai_screenings[0].criterion_assessments||[]).map((c:any,i:number)=><div className="answer-item" key={c.criterion_id||i}><strong>{c.criterion_name}</strong><span>{c.assessment}</span>{c.suggested_score!=null&&<small>Suggested score: {c.suggested_score} · Confidence: {Math.round(Number(c.confidence||0)*100)}%</small>}</div>):<p className="muted">No criterion assessments recorded.</p>}</section><div className="screening-note">AI screening is advisory only. A reviewer must make the final decision.</div>{selected.ai_screenings[0].status!=='processing'&&<button className="secondary-button" disabled={running} onClick={()=>runScreening(selected.id)}>{running?'Running screening…':'Rerun AI screening'}</button>}</div>}</aside></div>}
 </div>
}
function AnalyticsPanel({applications}:{applications:Application[]}) {
 const [loading,setLoading]=useState(true),[rows,setRows]=useState<any[]>([]),[notice,setNotice]=useState('')
 useEffect(()=>{(async()=>{setLoading(true);setNotice('');const ids=applications.map(a=>a.id);if(!ids.length){setRows([]);setLoading(false);return}const {data,error}=await supabase.from('submissions').select('id,status,submitted_at,application_id,submission_eligibility(status),submission_selections(status),submission_scores(overall_score)').in('application_id',ids);if(error)setNotice(error.message);else setRows(data||[]);setLoading(false)})()},[applications])
 const metrics=useMemo(()=>{const scored=rows.filter(r=>r.submission_scores?.[0]?.overall_score!=null);const eligible=rows.filter(r=>r.submission_eligibility?.[0]?.status==='eligible');const shortlisted=rows.filter(r=>r.submission_selections?.[0]?.status==='shortlisted');const selected=rows.filter(r=>r.submission_selections?.[0]?.status==='selected');const avg=scored.length?scored.reduce((s,r)=>s+Number(r.submission_scores[0].overall_score),0)/scored.length:0;return{submitted:rows.length,eligible:eligible.length,shortlisted:shortlisted.length,selected:selected.length,avg,eligibilityRate:rows.length?eligible.length/rows.length*100:0,shortlistRate:eligible.length?shortlisted.length/eligible.length*100:0,selectionRate:shortlisted.length?selected.length/shortlisted.length*100:0}},[rows])
 const trend=useMemo(()=>{const days:Array<{label:string;count:number}>=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);days.push({label:d.toLocaleDateString('en-US',{weekday:'short'}),count:rows.filter(r=>{if(!r.submitted_at)return false;const x=new Date(r.submitted_at);return x.getFullYear()===d.getFullYear()&&x.getMonth()===d.getMonth()&&x.getDate()===d.getDate()}).length})}return days},[rows])
 const maxTrend=Math.max(1,...trend.map(x=>x.count))
 const scoreBands=useMemo(()=>{const bands=[{label:'0–39',min:0,max:39,count:0},{label:'40–59',min:40,max:59,count:0},{label:'60–79',min:60,max:79,count:0},{label:'80–100',min:80,max:100,count:0}];rows.forEach(r=>{const n=r.submission_scores?.[0]?.overall_score;if(n!=null){const band=bands.find(b=>Number(n)>=b.min&&Number(n)<=b.max);if(band)band.count++}});return bands},[rows])
 if(loading)return <div className="loading-card card">Loading analytics…</div>
 return <div><div className="builder-top"><div><p className="eyebrow">Analytics</p><h2>Programme performance</h2><p>Track the application funnel, screening outcomes and scoring activity.</p></div>{notice&&<span className="builder-notice">{notice}</span>}</div>
  <div className="stats-grid"><StatCard label="Submissions" value={String(metrics.submitted)} note="Total submitted" icon={FileCheck2}/><StatCard label="Eligible" value={String(metrics.eligible)} note={metrics.eligibilityRate.toFixed(1)+'% of submissions'} icon={CheckCircle2}/><StatCard label="Shortlisted" value={String(metrics.shortlisted)} note={metrics.shortlistRate.toFixed(1)+'% of eligible'} icon={Target}/><StatCard label="Selected" value={String(metrics.selected)} note={metrics.selectionRate.toFixed(1)+'% of shortlisted'} icon={Users}/></div>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}><div className="card" style={{padding:24}}><div className="card-header"><div><h2>Application funnel</h2><p>Conversion between screening stages.</p></div><Workflow size={20}/></div>{[['Submitted',metrics.submitted],['Eligible',metrics.eligible],['Shortlisted',metrics.shortlisted],['Selected',metrics.selected]].map(([label,value])=>{const n=Number(value);const pct=metrics.submitted?n/metrics.submitted*100:0;return <div key={String(label)} style={{marginTop:18}}><div style={{display:'flex',justifyContent:'space-between',fontSize:13,marginBottom:7}}><span>{label}</span><strong>{n} · {pct.toFixed(1)}%</strong></div><div style={{height:8,background:'var(--border)',borderRadius:99,overflow:'hidden'}}><div style={{height:'100%',width:pct+'%',background:'currentColor',opacity:.8,borderRadius:99}}/></div></div>})}</div>
   <div className="card" style={{padding:24}}><div className="card-header"><div><h2>Submissions · last 7 days</h2><p>Daily submitted application volume.</p></div><TrendingUp size={20}/></div><div style={{display:'flex',alignItems:'end',gap:10,height:150,marginTop:20}}>{trend.map(d=><div key={d.label} style={{flex:1,height:'100%',display:'flex',flexDirection:'column',justifyContent:'end',alignItems:'center',gap:7}}><div title={String(d.count)} style={{width:'100%',maxWidth:38,height:(d.count/maxTrend*110)+'px',minHeight:d.count?4:0,background:'currentColor',opacity:.75,borderRadius:'6px 6px 2px 2px'}}/><span style={{fontSize:11}}>{d.label}</span></div>)}</div></div></div>
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginTop:16}}><div className="card" style={{padding:24}}><div className="card-header"><div><h2>Score distribution</h2><p>Scored submissions by range.</p></div><BarChart3 size={20}/></div>{scoreBands.map(b=><div key={b.label} style={{display:'grid',gridTemplateColumns:'70px 1fr 40px',gap:10,alignItems:'center',marginTop:15}}><span>{b.label}</span><div style={{height:8,background:'var(--border)',borderRadius:99,overflow:'hidden'}}><div style={{height:'100%',width:(metrics.submitted?b.count/Math.max(1,rows.filter(r=>r.submission_scores?.[0]?.overall_score!=null).length)*100:0)+'%',background:'currentColor',opacity:.8}}/></div><strong style={{textAlign:'right'}}>{b.count}</strong></div>)}</div>
   <div className="card" style={{padding:24}}><p className="eyebrow">Average score</p><div className="stat-value">{metrics.avg?metrics.avg.toFixed(1):'—'}</div><p className="muted">Calculated from submissions with a recorded score.</p><div style={{marginTop:24,paddingTop:18,borderTop:'1px solid var(--border)',display:'grid',gridTemplateColumns:'1fr 1fr',gap:14}}><div><span className="muted">Eligibility rate</span><strong style={{display:'block',fontSize:22,marginTop:4}}>{metrics.eligibilityRate.toFixed(1)}%</strong></div><div><span className="muted">Selection rate</span><strong style={{display:'block',fontSize:22,marginTop:4}}>{metrics.selectionRate.toFixed(1)}%</strong></div></div></div></div>
 </div>
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
  const [busy,setBusy]=useState(false), [notice,setNotice]=useState(''), [noticeType,setNoticeType]=useState<'success'|'error'>('error')
  const [previewAnswers,setPreviewAnswers]=useState<Record<string,string>>({}), [previewLgas,setPreviewLgas]=useState<string[]>([]), [previewLgaLoading,setPreviewLgaLoading]=useState(false)
  function showNotice(message:string,type:'success'|'error'='error'){setNoticeType(type);setNotice(message)}
  useEffect(()=>{if(!notice)return;const timer=window.setTimeout(()=>setNotice(''),5000);return()=>window.clearTimeout(timer)},[notice])
  const selected=questions.find(q=>q.id===selectedId)||null
  const optionTypes:QuestionType[]=['dropdown','single_choice','multiple_choice','yes_no']
  const previewStateQuestion=questions.find(q=>q.type==='nigeria_state')
  const previewLgaQuestion=questions.find(q=>q.type==='nigeria_lga')
  const previewSelectedState=previewStateQuestion?previewAnswers[previewStateQuestion.id]||'':''
  useEffect(()=>{(async()=>{if(!preview||!previewSelectedState){setPreviewLgas([]);return}setPreviewLgaLoading(true);try{setPreviewLgas(await getNigerianLgas(previewSelectedState))}catch{setPreviewLgas([])}finally{setPreviewLgaLoading(false)}})()},[preview,previewSelectedState])

  async function loadQuestions(versionId:string){
    const {data:qs,error}=await supabase.from('questions').select('id,type,label,description,required,placeholder,position,config,conditional_rules').eq('form_version_id',versionId).order('position')
    if(error) throw error
    const rows=(qs||[]) as Omit<BuilderQuestion,'options'>[]
    const full=await Promise.all(rows.map(async q=>{const {data:opts,error:o}=await supabase.from('question_options').select('id,label,value,position').eq('question_id',q.id).order('position'); if(o) throw o; return {...q,options:(opts||[]) as BuilderOption[]}}))
    setQuestions(full); if(full[0]) setSelectedId(full[0].id)
  }
  useEffect(()=>{(async()=>{try{
    const {data:draft}=await supabase.from('form_versions').select('id,version_number').eq('application_id',applicationId).eq('status','draft').order('version_number',{ascending:false}).limit(1).maybeSingle()
    if(draft){setVersionId(draft.id);setVersion(draft.version_number);await loadQuestions(draft.id);return}

    // Published versions are immutable. When an admin opens the builder again,
    // create a new draft by cloning the latest published version so it can be edited safely.
    const {data:published}=await supabase.from('form_versions').select('id,version_number,title').eq('application_id',applicationId).eq('status','published').order('version_number',{ascending:false}).limit(1).maybeSingle()
    if(!published)return

    const {data:newVersion,error:versionError}=await supabase.from('form_versions').insert({
      application_id:applicationId,
      version_number:published.version_number+1,
      created_by:(await supabase.auth.getUser()).data.user?.id,
      title:published.title||'Application form',
      status:'draft'
    }).select('id,version_number').single()
    if(versionError)throw versionError

    const {data:sourceQuestions,error:questionsError}=await supabase.from('questions').select('id,type,label,description,required,placeholder,position,config,conditional_rules').eq('form_version_id',published.id).order('position')
    if(questionsError)throw questionsError
    for(const source of sourceQuestions||[]){
      const {data:cloned,error:cloneError}=await supabase.from('questions').insert({
        form_version_id:newVersion.id,type:source.type,label:source.label,description:source.description,required:source.required,
        placeholder:source.placeholder,position:source.position,config:source.config,conditional_rules:source.conditional_rules
      }).select('id,type,label,description,required,placeholder,position,config,conditional_rules').single()
      if(cloneError)throw cloneError
      const {data:opts,error:optionsError}=await supabase.from('question_options').select('label,value,position').eq('question_id',source.id).order('position')
      if(optionsError)throw optionsError
      if(opts?.length){const {error}=await supabase.from('question_options').insert(opts.map(o=>({question_id:cloned.id,label:o.label,value:o.value,position:o.position})));if(error)throw error}
    }
    setVersionId(newVersion.id);setVersion(newVersion.version_number);await loadQuestions(newVersion.id)
  }catch(e){showNotice(e instanceof Error?e.message:'Could not load form.')}})()},[applicationId])

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
      const {data,error}=await supabase.from('questions').insert({form_version_id:v,type,label:type==='nigeria_state'?'State of origin':questionTypes.find(x=>x.type===type)?.label||'Question',required:false,position:questions.length,config:{}}).select('id,type,label,description,required,placeholder,position,config,conditional_rules').single()
      if(error)throw error
      let item={...(data as Omit<BuilderQuestion,'options'>),options:[]} as BuilderQuestion
      if(type==='yes_no'){const {data:opts,error:o}=await supabase.from('question_options').insert([{question_id:item.id,label:'Yes',value:'yes',position:0},{question_id:item.id,label:'No',value:'no',position:1}]).select('id,label,value,position');if(o)throw o;item.options=(opts||[]) as BuilderOption[]}
      setQuestions(x=>[...x,item]);setSelectedId(item.id)
    }catch(e){showNotice(e instanceof Error?e.message:'Could not add question.')}finally{setBusy(false)}
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
    if(error)showNotice(error.message);setBusy(false)
  }
  async function addOption(){
    if(!selected)return;setBusy(true)
    const n=selected.options.length+1, value=`option-${n}`
    const {data,error}=await supabase.from('question_options').insert({question_id:selected.id,label:`Option ${n}`,value,position:n-1}).select('id,label,value,position').single()
    if(!error&&data)setQuestions(x=>x.map(q=>q.id===selected.id?{...q,options:[...q.options,data as BuilderOption]}:q))
    if(error)showNotice(error.message);setBusy(false)
  }
  async function updateOption(id:string,patch:Partial<BuilderOption>){
    setBusy(true);const {data,error}=await supabase.from('question_options').update(patch).eq('id',id).select('id,label,value,position').single()
    if(!error&&data)setQuestions(x=>x.map(q=>q.id===selected?.id?{...q,options:q.options.map(o=>o.id===id?data as BuilderOption:o)}:q))
    if(error)showNotice(error.message);setBusy(false)
  }
  async function removeOption(id:string){
    setBusy(true);const {error}=await supabase.from('question_options').delete().eq('id',id)
    if(!error&&selected)setQuestions(x=>x.map(q=>q.id===selected.id?{...q,options:q.options.filter(o=>o.id!==id)}:q))
    if(error)showNotice(error.message);setBusy(false)
  }
  async function moveQuestion(index:number,direction:number){
    const next=index+direction;if(next<0||next>=questions.length)return
    const copy=[...questions];[copy[index],copy[next]]=[copy[next],copy[index]]
    setBusy(true)
    try{for(let i=0;i<copy.length;i++){const {error}=await supabase.from('questions').update({position:i}).eq('id',copy[i].id);if(error)throw error}setQuestions(copy.map((q,i)=>({...q,position:i})))}catch(e){showNotice(e instanceof Error?e.message:'Could not reorder questions.')}finally{setBusy(false)}
  }
  async function removeQuestion(){if(!selected)return;setBusy(true);const {error}=await supabase.from('questions').delete().eq('id',selected.id);if(!error){const left=questions.filter(q=>q.id!==selected.id).map((q,i)=>({...q,position:i}));for(const q of left)await supabase.from('questions').update({position:q.position}).eq('id',q.id);setQuestions(left);setSelectedId(left[0]?.id||null)}else showNotice(error.message);setBusy(false)}
  async function publish(){
    if(!versionId)return
    setBusy(true);setNotice('')
    try{
      const publishedVersionId=versionId
      const {error}=await supabase.from('form_versions').update({status:'published',published_at:new Date().toISOString()}).eq('id',publishedVersionId)
      if(error)throw error

      // Keep the published version immutable, but immediately create the next draft
      // from it so the just-published questions remain visible on the canvas and can
      // be edited without leaving or refreshing the form builder.
      const {data:published}=await supabase.from('form_versions').select('version_number,title').eq('id',publishedVersionId).single()
      if(!published)throw new Error('Published form could not be loaded.')
      const userId=(await supabase.auth.getUser()).data.user?.id
      const {data:newVersion,error:versionError}=await supabase.from('form_versions').insert({
        application_id:applicationId,
        version_number:published.version_number+1,
        created_by:userId,
        title:published.title||'Application form',
        status:'draft'
      }).select('id,version_number').single()
      if(versionError)throw versionError

      const {data:sourceQuestions,error:questionsError}=await supabase.from('questions').select('id,type,label,description,required,placeholder,position,config,conditional_rules').eq('form_version_id',publishedVersionId).order('position')
      if(questionsError)throw questionsError
      for(const source of sourceQuestions||[]){
        const {data:cloned,error:cloneError}=await supabase.from('questions').insert({
          form_version_id:newVersion.id,type:source.type,label:source.label,description:source.description,required:source.required,
          placeholder:source.placeholder,position:source.position,config:source.config,conditional_rules:source.conditional_rules
        }).select('id').single()
        if(cloneError)throw cloneError
        const {data:opts,error:optionsError}=await supabase.from('question_options').select('label,value,position').eq('question_id',source.id).order('position')
        if(optionsError)throw optionsError
        if(opts?.length){const {error}=await supabase.from('question_options').insert(opts.map(o=>({question_id:cloned.id,label:o.label,value:o.value,position:o.position})));if(error)throw error}
      }

      setVersionId(newVersion.id)
      setVersion(newVersion.version_number)
      await loadQuestions(newVersion.id)
      showNotice('Form published successfully.','success')
    }catch(e){showNotice(e instanceof Error?e.message:'Could not publish form.')}finally{setBusy(false)}
  }

  return <div className="form-builder">
    <div className="builder-top"><div><p className="eyebrow">Form builder · Version {version}</p><h2>Application form</h2><p>Build the questions applicants will answer.</p></div><div className="builder-actions">{notice&&<div className={`toast-notification ${noticeType}`} role="status" aria-live="polite"><span className="toast-icon">{noticeType==='success'?<CheckCircle2 size={17}/>:<X size={17}/>}</span><span>{notice}</span><button className="toast-close" onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={14}/></button></div>}<button className="secondary-button" disabled={busy||!questions.length} onClick={()=>showNotice('Draft saved.','success')}>Save draft</button><button className="secondary-button" disabled={!questions.length} onClick={()=>setPreview(true)}>Preview</button><button className="primary-button" disabled={busy||!questions.length} onClick={publish}>Publish form</button></div></div>
    <div className="builder-layout"><aside className="builder-palette card"><div className="builder-section-title">Question types</div>{questionTypes.map(q=><button key={q.type} className="question-type" disabled={busy} onClick={()=>addQuestion(q.type)}><span className="type-icon">{q.icon}</span><span>{q.label}</span></button>)}</aside>
      <main className="builder-canvas"><div className="canvas-label">FORM CANVAS</div>{!questions.length?<div className="builder-empty card"><FileText size={24}/><h3>Start building your form</h3><p>Select a question type from the left to add your first question.</p></div>:questions.map((q,i)=><div key={q.id} className={selectedId===q.id?'question-card card selected':'question-card card'} onClick={()=>setSelectedId(q.id)}><div className="question-card-top"><span className="drag-handle">⋮⋮</span><span className="question-number">{i+1}</span><span className="question-kind">{questionTypes.find(x=>x.type===q.type)?.label}</span><button className="icon-button question-delete" onClick={e=>{e.stopPropagation();setSelectedId(q.id);removeQuestion()}}><X size={15}/></button></div><h3>{q.label}{q.required&&<span className="required-star">*</span>}</h3>{q.description&&<p>{q.description}</p>}{optionTypes.includes(q.type)&&q.options.length?<div className="choice-preview">{q.options.map(o=><span key={o.id}>○ {o.label}</span>)}</div>:<div className="fake-input">{q.type==='long_text'?'Applicant response…':q.type==='dropdown'?'Select an option…':q.type==='rating'?'☆ ☆ ☆ ☆ ☆':'Applicant response…'}</div>}<div className="question-move"><button disabled={i===0||busy} onClick={e=>{e.stopPropagation();moveQuestion(i,-1)}}>↑ Move up</button><button disabled={i===questions.length-1||busy} onClick={e=>{e.stopPropagation();moveQuestion(i,1)}}>↓ Move down</button></div></div>)}</main>
      <aside className="builder-settings card">{selected?<><div className="builder-section-title">Question settings</div><label>Question<input value={selected.label} onChange={e=>updateQuestion({label:e.target.value})}/></label><label>Description<textarea rows={3} value={selected.description||''} onChange={e=>updateQuestion({description:e.target.value||null})}/></label><label>Placeholder<input value={selected.placeholder||''} onChange={e=>updateQuestion({placeholder:e.target.value||null})}/></label><label className="toggle-row"><span>Required</span><input type="checkbox" checked={selected.required} onChange={e=>updateQuestion({required:e.target.checked})}/></label><div className="condition-editor"><div className="options-title"><div><span>Conditional question</span><small>Show this question only when another answer matches.</small></div><span className="optional">Optional</span></div><div className="condition-select-group"><label>Show when</label><div className="condition-select-wrap"><select value={conditionQuestionId(selected)} onChange={e=>{const id=e.target.value;updateCondition(id,conditionValue(selected))}}><option value="">Always show</option>{questions.filter(q=>q.id!==selected.id).map(q=><option key={q.id} value={q.id}>{q.label}</option>)}</select><ChevronDown size={15}/></div></div>{conditionQuestionId(selected)&&<div className="condition-select-group"><label>Answer is</label><div className="condition-select-wrap"><select value={conditionValue(selected)} onChange={e=>updateCondition(conditionQuestionId(selected),e.target.value)}><option value="">Choose answer…</option>{conditionOptions(conditionQuestionId(selected)).map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select><ChevronDown size={15}/></div></div>}</div>{optionTypes.includes(selected.type)&&<div className="options-editor"><div className="options-title"><span>Options</span><button onClick={addOption} disabled={busy}>+ Add</button></div>{selected.options.map(o=><div className="option-row" key={o.id}><input value={o.label} onChange={e=>updateOption(o.id,{label:e.target.value})}/><button className="icon-button" onClick={()=>removeOption(o.id)} aria-label="Remove option"><X size={13}/></button></div>)}</div>}<button className="delete-question" onClick={removeQuestion}>Delete question</button></>:<div className="settings-empty"><Settings size={20}/><p>Select a question to edit its settings.</p></div>}</aside>
    </div>
    {preview&&<div className="preview-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPreview(false)}}><div className="preview-panel card"><div className="preview-header"><div><p className="eyebrow">Applicant preview</p><h2>Application form</h2><p>Preview what applicants will see.</p></div><button className="icon-button" onClick={()=>setPreview(false)}><X size={18}/></button></div><div className="preview-form">{questions.map((q,i)=><div key={q.id} className="preview-question"><label>{i+1}. {q.label}{q.required&&<span className="required-star">*</span>}{q.description&&<small>{q.description}</small>}</label>{q.type==='nigeria_state'?<select value={previewAnswers[q.id]||''} onChange={e=>{setPreviewAnswers(x=>{const next={...x,[q.id]:e.target.value};if(previewLgaQuestion)delete next[previewLgaQuestion.id];return next})}}><option value="">Select your state of origin</option>{NIGERIAN_STATES.map(state=><option key={state} value={state}>{state}</option>)}</select>:q.type==='nigeria_lga'?<select value={previewAnswers[q.id]||''} onChange={e=>setPreviewAnswers(x=>({...x,[q.id]:e.target.value}))} disabled={!previewSelectedState||previewLgaLoading}><option value="">{!previewSelectedState?'Select your state first':previewLgaLoading?'Loading local governments…':'Select your local government'}</option>{previewLgas.map(lga=><option key={lga} value={lga}>{lga}</option>)}</select>:optionTypes.includes(q.type)?<div className="preview-options">{q.options.map(o=><label key={o.id}><input type={q.type==='multiple_choice'?'checkbox':'radio'} name={q.id}/><span>{o.label}</span></label>)}</div>:q.type==='long_text'?<textarea placeholder={q.placeholder||'Your answer'}/>:q.type==='date'?<input type="date"/>:q.type==='number'?<input type="number" placeholder={q.placeholder||''}/>:q.type==='rating'?<div className="preview-rating">☆ ☆ ☆ ☆ ☆</div>:q.type==='file'||q.type==='image'?<input type="file"/>:<input type={q.type==='email'?'email':q.type==='phone'?'tel':'text'} placeholder={q.placeholder||'Your answer'}/>}</div>)}</div><div className="preview-footer"><button className="secondary-button" onClick={()=>{setPreview(false);setPreviewAnswers({});setPreviewLgas([])}}>Close preview</button></div></div></div>}
  </div>
}

function StatCard({label,value,note,icon:Icon}:{label:string;value:string;note:string;icon:typeof Users}){return <div className="card stat-card"><div className="stat-icon"><Icon size={18}/></div><div><p className="eyebrow">{label}</p><div className="stat-value">{value}</div><p className="muted">{note}</p></div></div>}
export default App

