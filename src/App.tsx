import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowRight, BarChart3, Bell, Check, ChevronDown, ChevronRight, ClipboardList, FileCheck2, FileText, Clock3,
  FolderKanban, LayoutDashboard, LogOut, Mail, Menu, Plus, Search, Settings,
  ShieldCheck, Sparkles, Users, X, Download, Upload, TrendingUp, MapPin, Tags, Target, CheckCircle2, Layers, Workflow, Brain, BadgeCheck, Sun, Moon, Trash2,
} from 'lucide-react'
import { supabase } from './lib/supabase'
import { friendlyErrorMessage } from './lib/errors'
import { NIGERIAN_STATES, getNigerianLgas } from './lib/nigeria'
import ParticipantsPanel from './components/ParticipantsPanel'
import CommunicationsWorkspace from './components/CommunicationsWorkspace'
import { FormsWorkspace, ScreeningWorkspace, ReviewsWorkspace, TeamWorkspace, SettingsWorkspace, ScreeningReviewModal } from './components/WorkspaceModules'
import type { ScreeningRow } from './components/WorkspaceModules'
import { GoogleFormImport } from './components/GoogleFormImport'
import TablePagination from './components/TablePagination'

type AppStatus = 'draft' | 'published' | 'screening' | 'closed' | 'completed'
type Application = {
  id: string; name: string; description: string | null; status: AppStatus
  deadline: string | null; target_count: number | null; participant_id_prefix: string; created_at: string
}
type Profile = { id: string; full_name: string | null; username: string | null; birth_month: number | null; birth_day: number | null; avatar_url: string | null; organization_id: string | null; role: 'owner'|'admin'|'reviewer' }
type Organization = { id: string; name: string; slug: string; avatar_url: string | null }
type WorkspaceLeaderboardRow = { participant_record_id:string; participant_id:string; full_name:string|null; graded_assignments:number; submitted_assignments:number; total_assignments:number; average_percentage:number|null; completion_percentage:number; assignment_points:number; attendance_points:number; bonus_points:number; total_points:number; rank:number|null }

const nav = [
  { label: 'Dashboard', icon: LayoutDashboard }, { label: 'Applications', icon: FolderKanban },
  { label: 'Forms', icon: FileText }, { label: 'Screening', icon: ShieldCheck },
  { label: 'Reviews', icon: ClipboardList }, { label: 'Participants', icon: BadgeCheck }, { label: 'Communications', icon: Mail }, { label: 'Analytics', icon: BarChart3 },
]
const bottomNav = [{ label: 'Team', icon: Users }, { label: 'Settings', icon: Settings }]

function statusLabel(status: AppStatus) { return status.charAt(0).toUpperCase() + status.slice(1) }
function formatDate(value: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value))
}

function AuthScreen({ onSignedIn }: { onSignedIn: () => Promise<void> | void }) {
  const [mode, setMode] = useState<'signin'|'signup'|'forgot'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [birthMonth, setBirthMonth] = useState('')
  const [birthDay, setBirthDay] = useState('')
  const [orgName, setOrgName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setMessage('')
    try {
      if (mode === 'forgot') {
        if (!email.trim()) throw new Error('Enter your email address.')
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin + '/login?reset=1',
        })
        if (error) throw error
        setMessage('If an account exists for that email, we’ve sent a password reset link. Check your inbox.')
        return
      }
      if (mode === 'signin') {
        const identifier = email.trim()
        const isEmail = identifier.includes('@')
        if (!isEmail) {
          const { data: result, error: usernameLoginError } = await supabase.functions.invoke('username-login', {
            body: { username: identifier.toLowerCase(), password },
          })
          if (usernameLoginError || !result?.access_token || !result?.refresh_token) {
            throw new Error('Invalid username or password.')
          }
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
          })
          if (sessionError) throw new Error('Could not start your secure session. Please try again.')
        } else {
          const { error } = await supabase.auth.signInWithPassword({ email: identifier, password })
          if (error) throw new Error('Invalid email or password.')
        }
        onSignedIn()
      } else {
        const normalizedUsername = username.trim().toLowerCase()
        if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) throw new Error('Username must be 3–30 characters and use only letters, numbers, or underscores.')
        if (!birthMonth || !birthDay) throw new Error('Please select your date of birth.')
        if (password.length < 10) throw new Error('Password must be at least 10 characters.')
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name.trim(), username: normalizedUsername, birth_month: Number(birthMonth), birth_day: Number(birthDay), organization_name: orgName.trim() } } })
        if (error) throw error
        if (!data.user) throw new Error('Account could not be created.')
        if (!data.session) {
          setMessage('Account created. Check your email to confirm your address, then sign in.')
          return
        }
        const slug = orgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'organisation'
        const { data: org, error: orgError } = await supabase.from('organizations').insert({ name: orgName.trim(), slug, created_by: data.user.id }).select('id,name,slug,avatar_url').single()
        if (orgError) throw orgError
        const { error: profileError } = await supabase.from('profiles').insert({ id: data.user.id, full_name: name.trim() || null, username: normalizedUsername, birth_month: Number(birthMonth), birth_day: Number(birthDay), organization_id: org.id, role: 'owner' })
        if (profileError) throw profileError
        onSignedIn()
      }
    } catch (err) { setError(friendlyErrorMessage(err,'Something went wrong.')) }
    finally { setBusy(false) }
  }

  return <div className="auth-shell">
    <div className="auth-panel">
      <div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application OS</span></div></div>
      <div className="auth-copy"><p className="eyebrow">{mode === 'forgot' ? 'Password recovery' : 'Workspace access'}</p><h1>{mode === 'forgot' ? 'Reset your password.' : mode === 'signin' ? 'Welcome back.' : 'Create your workspace.'}</h1><p>{mode === 'forgot' ? 'Enter the email address linked to your ApplyFlow account and we’ll send you a secure reset link.' : mode === 'signin' ? 'Sign in to manage applications, screening and selections.' : 'Set up your organisation and start managing applications.'}</p></div>
      <form onSubmit={submit} className="auth-form">
        {mode === 'signup' && <><label>Full name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Cyril Adesegha" required /></label><label>Username<input value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} placeholder="cyriladesegha" minLength={3} maxLength={30} autoComplete="username" required /><small className="field-help">3–30 characters · letters, numbers and underscores</small></label><div className="form-grid signup-details-grid"><label>Date of birth <span className="optional">Month and day only</span><div className="dob-fields"><select className="dob-month" aria-label="Birth month" value={birthMonth} onChange={e=>setBirthMonth(e.target.value)} required><option value="">Month</option>{['January','February','March','April','May','June','July','August','September','October','November','December'].map((month,index)=><option key={month} value={index+1}>{month}</option>)}</select><select className="dob-day" aria-label="Birth day" value={birthDay} onChange={e=>setBirthDay(e.target.value)} required><option value="">Day</option>{Array.from({length:31},(_,i)=>i+1).map(day=><option key={day} value={day}>{day}</option>)}</select></div></label><label>Organisation name<input value={orgName} onChange={e=>setOrgName(e.target.value)} placeholder="Emerging Communities" required /></label></div></>}
        <label>{mode === 'signin' ? 'Email or username' : 'Email'}<input type={mode === 'signin' ? 'text' : 'email'} value={email} onChange={e=>setEmail(e.target.value)} placeholder={mode === 'signin' ? 'you@organisation.com or username' : 'you@organisation.com'} autoComplete={mode === 'signin' ? 'username' : 'email'} required /></label>
        {mode !== 'forgot' && <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" minLength={mode==='signin'?6:10} required /></label>}
        {mode === 'signin' && <button type="button" className="auth-forgot-link" onClick={()=>{setMode('forgot');setError('');setMessage('')}}>Forgot password?</button>}
        {error && <div className="form-error">{error}</div>}{message && <div className="form-message">{message}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'forgot' ? 'Send reset link' : mode === 'signin' ? 'Sign in' : 'Create workspace'}</button>
      </form>
      {mode === 'forgot' ? <button className="auth-switch" onClick={()=>{setMode('signin');setError('');setMessage('')}}>← Back to sign in</button> : <div className="auth-secondary-actions">
        <button className="auth-switch" onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('');setMessage('')}}>{mode==='signin' ? 'Need an account? Create a workspace' : 'Already have an account? Sign in'}</button>
      </div>}
    </div>
    <div className="auth-aside"><div><span className="aside-kicker">APPLYFLOW</span><h2>{mode === 'forgot' ? 'Get back into your workspace.' : 'From applications to decisions, in one workspace.'}</h2><p>{mode === 'forgot' ? 'We’ll send a secure link to your email so you can choose a new password.' : 'Collect applications, evaluate eligibility, screen candidates and move the right people through your programme.'}</p></div><div className="aside-stat"><strong>{mode === 'forgot' ? 'Secure password recovery' : 'One source of truth'}</strong><span>{mode === 'forgot' ? 'Email link · New password · Sign in' : 'Forms · Eligibility · Screening · Reviews · Selection'}</span></div></div>
  </div>
}

function ResetPasswordScreen({ onComplete }: { onComplete: () => Promise<void> | void }) {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    if (password.length < 10) { setError('Password must be at least 10 characters.'); return }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return }
    setBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      setMessage('Your password has been updated. Redirecting to sign in…')
      window.setTimeout(() => { void onComplete() }, 900)
    } catch (err) {
      setError(friendlyErrorMessage(err,'Could not reset your password.'))
    } finally { setBusy(false) }
  }

  return <div className="auth-shell">
    <div className="auth-panel">
      <div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application OS</span></div></div>
      <div className="auth-copy"><p className="eyebrow">Password recovery</p><h1>Choose a new password.</h1><p>Set a new password for your ApplyFlow account. Use at least 10 characters.</p></div>
      <form onSubmit={submit} className="auth-form">
        <label>New password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter a new password" minLength={10} required autoFocus /></label>
        <label>Confirm password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter your new password" minLength={10} required /></label>
        {error && <div className="form-error">{error}</div>}{message && <div className="form-message">{message}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Updating password…' : 'Update password'}</button>
      </form>
    </div>
    <div className="auth-aside"><div><span className="aside-kicker">APPLYFLOW</span><h2>Your account, secured again.</h2><p>Once your password is updated, you’ll return to the ApplyFlow sign-in screen.</p></div><div className="aside-stat"><strong>Secure password recovery</strong><span>Reset · Sign in · Continue working</span></div></div>
  </div>
}

function TeamInviteLinkSignup({token}:{token:string}){
  const [details,setDetails]=useState<{organization_name:string|null;role:string|null;expires_at:string|null;is_valid:boolean;invalid_reason:string|null}|null>(null)
  const [loading,setLoading]=useState(true)
  const [name,setName]=useState('')
  const [username,setUsername]=useState('')
  const [birthMonth,setBirthMonth]=useState('')
  const [birthDay,setBirthDay]=useState('')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [confirmPassword,setConfirmPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')

  useEffect(()=>{(async()=>{
    if(!token){setDetails({organization_name:null,role:null,expires_at:null,is_valid:false,invalid_reason:'Invitation link is missing.'});setLoading(false);return}
    const {data,error}=await supabase.rpc('get_team_invite_link_details',{p_token:token})
    if(error){setError(friendlyErrorMessage(error));setLoading(false);return}
    const row=Array.isArray(data)?data[0]:data
    setDetails(row||{organization_name:null,role:null,expires_at:null,is_valid:false,invalid_reason:'Invitation link not found.'})
    setLoading(false)
  })()},[token])

  async function submit(e:React.FormEvent){
    e.preventDefault();setError('');setMessage('')
    const normalizedUsername=username.trim().toLowerCase()
    if(name.trim().length<2){setError('Enter your full name.');return}
    if(!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)){setError('Username must be 3–30 characters and use only letters, numbers, or underscores.');return}
    if(!birthMonth||!birthDay){setError('Select your date of birth.');return}
    if(password.length<10){setError('Password must be at least 10 characters.');return}
    if(password!==confirmPassword){setError('Passwords do not match.');return}
    setBusy(true)
    try{
      const {data:result,error:invokeError}=await supabase.functions.invoke('accept-team-invite-link',{
        body:{
          token,
          email:email.trim(),
          password,
          full_name:name.trim(),
          username:normalizedUsername,
          birth_month:Number(birthMonth),
          birth_day:Number(birthDay)
        }
      })
      if(invokeError){
        let message=invokeError.message||'Could not create your staff account.'
        const context=(invokeError as any)?.context
        if(context&&typeof context.json==='function'){
          try{const payload=await context.json();if(payload?.error)message=String(payload.error)}catch{}
        }
        throw new Error(message)
      }
      if(result?.error)throw new Error(result.error)
      const {data:signInData,error:signInError}=await supabase.auth.signInWithPassword({email:email.trim(),password})
      if(signInError)throw signInError
      if(!signInData.session)throw new Error('Your account was created, but ApplyFlow could not sign you in automatically. Please sign in from the login page.')
      window.location.replace('/')
    }catch(err){setError(friendlyErrorMessage(err,'Could not create your staff account.'))}
    finally{setBusy(false)}
  }

  if(loading)return <div className="loading-screen"><div className="brand-mark">A</div><span>Checking invitation…</span></div>
  if(!details?.is_valid)return <div className="auth-shell team-link-auth-shell"><div className="auth-panel"><div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Team invitation</span></div></div><div className="auth-copy"><p className="eyebrow">Invitation unavailable</p><h1>This link can’t be used.</h1><p>{details?.invalid_reason||error||'Ask your workspace Admin for a new invitation link.'}</p></div><a className="primary-button auth-submit" href="/login">Go to sign in</a></div><div className="auth-aside"><div><span className="aside-kicker">APPLYFLOW TEAM ACCESS</span><h2>Secure workspace invitations.</h2><p>Invitation links are role-specific, single-use and time-limited.</p></div></div></div>

  const roleLabel=details.role==='admin'?'Admin':'Programme Staff'
  return <div className="auth-shell team-link-auth-shell">
    <div className="auth-panel">
      <div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Team invitation</span></div></div>
      <div className="auth-copy"><p className="eyebrow">Join {details.organization_name}</p><h1>Create your staff account.</h1><p>You’ve been invited as <strong>{roleLabel}</strong>. Set up your account to join the workspace.</p></div>
      <form onSubmit={submit} className="auth-form">
        <label>Full name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Jane Doe" required/></label>
        <label>Username<input value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} placeholder="janedoe" minLength={3} maxLength={30} autoComplete="username" required/><small className="field-help">3–30 characters · letters, numbers and underscores</small></label>
        <div className="form-grid signup-details-grid"><label>Date of birth <span className="optional">Month and day only</span><div className="dob-fields"><select value={birthMonth} onChange={e=>setBirthMonth(e.target.value)} required><option value="">Month</option>{['January','February','March','April','May','June','July','August','September','October','November','December'].map((month,index)=><option key={month} value={index+1}>{month}</option>)}</select><select value={birthDay} onChange={e=>setBirthDay(e.target.value)} required><option value="">Day</option>{Array.from({length:31},(_,i)=>i+1).map(day=><option key={day} value={day}>{day}</option>)}</select></div></label></div>
        <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jane@organisation.com" autoComplete="email" required/></label>
        <label>Create password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={8} autoComplete="new-password" required/></label>
        <label>Confirm password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} minLength={8} autoComplete="new-password" required/></label>
        {error&&<div className="form-error">{error}</div>}{message&&<div className="form-message">{message}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy?'Creating account…':'Join workspace'} <ArrowRight size={17}/></button>
      </form>
    </div>
    <div className="auth-aside"><div><span className="aside-kicker">INVITED TO {details.organization_name?.toUpperCase()}</span><h2>{roleLabel} access is ready.</h2><p>This invitation can be used once and expires {details.expires_at?new Date(details.expires_at).toLocaleString():'soon'}.</p></div></div>
  </div>
}

function InviteSetupScreen({ email, onComplete }: { email: string; onComplete: () => Promise<void> | void }) {
  const [name,setName]=useState('')
  const [username,setUsername]=useState('')
  const [birthMonth,setBirthMonth]=useState('')
  const [birthDay,setBirthDay]=useState('')
  const [password,setPassword]=useState('')
  const [confirmPassword,setConfirmPassword]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [completed,setCompleted]=useState(false)
  const [workspaceName,setWorkspaceName]=useState('your workspace')

  useEffect(()=>{(async()=>{
    const {data}=await supabase.from('profiles').select('full_name,username,birth_month,birth_day,organization_id').maybeSingle()
    if(data){
      setName(data.full_name||'');setUsername(data.username||'');setBirthMonth(data.birth_month?String(data.birth_month):'');setBirthDay(data.birth_day?String(data.birth_day):'')
      if(data.organization_id){const {data:org}=await supabase.from('organizations').select('name').eq('id',data.organization_id).maybeSingle();if(org?.name)setWorkspaceName(org.name)}
    }
  })()},[])

  async function submit(e: React.FormEvent) {
    e.preventDefault();setError('')
    const normalizedUsername=username.trim().toLowerCase()
    if(name.trim().length<2){setError('Enter your full name.');return}
    if(!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)){setError('Username must be 3–30 characters and use only letters, numbers, or underscores.');return}
    if(!birthMonth||!birthDay){setError('Select your date of birth.');return}
    if(password.length<10){setError('Password must be at least 10 characters.');return}
    if(password!==confirmPassword){setError('Passwords do not match.');return}
    setBusy(true)
    try{
      const {error:updateError}=await supabase.auth.updateUser({password,data:{full_name:name.trim(),username:normalizedUsername,birth_month:Number(birthMonth),birth_day:Number(birthDay)}})
      if(updateError)throw updateError
      const {error:profileError}=await supabase.rpc('complete_invited_member_profile',{p_full_name:name.trim(),p_username:normalizedUsername,p_birth_month:Number(birthMonth),p_birth_day:Number(birthDay)})
      if(profileError)throw profileError
      setCompleted(true)
    }catch(err){setError(friendlyErrorMessage(err,'Could not finish setting up your account.'))}finally{setBusy(false)}
  }

  if(completed)return <div className="auth-shell">
    <div className="auth-panel">
      <div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application OS</span></div></div>
      <div className="auth-copy"><p className="eyebrow">Account created</p><h1>Welcome to {workspaceName}.</h1><p>Your ApplyFlow account is ready. Continue to sign in with the email or username and password you just created.</p></div>
      <button className="primary-button auth-submit" onClick={()=>void onComplete()}>Continue to sign in <ArrowRight size={17}/></button>
    </div>
    <div className="auth-aside"><div><span className="aside-kicker">WELCOME</span><h2>You’re now part of {workspaceName}.</h2><p>Your access is connected to the role assigned in your invitation. Sign in to start working with your team.</p></div><div className="aside-stat"><strong>Account setup complete</strong><span>Sign in · Enter workspace · Start working</span></div></div>
  </div>

  return <div className="auth-shell">
    <div className="auth-panel">
      <div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application OS</span></div></div>
      <div className="auth-copy"><p className="eyebrow">Team invitation</p><h1>Set up your account.</h1><p>Complete your profile and create a password. Your workspace and access role have already been assigned by the person who invited you.</p></div>
      <form onSubmit={submit} className="auth-form">
        <label>Full name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Your full name" autoComplete="name" required/></label>
        <label>Username<input value={username} onChange={e=>setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,''))} placeholder="yourusername" minLength={3} maxLength={30} autoComplete="username" required/><small className="field-help">3–30 characters · letters, numbers and underscores</small></label>
        <label>Date of birth <span className="optional">Month and day</span><div className="dob-fields"><select className="dob-month" aria-label="Birth month" value={birthMonth} onChange={e=>setBirthMonth(e.target.value)} required><option value="">Month</option>{['January','February','March','April','May','June','July','August','September','October','November','December'].map((month,index)=><option key={month} value={index+1}>{month}</option>)}</select><select className="dob-day" aria-label="Birth day" value={birthDay} onChange={e=>setBirthDay(e.target.value)} required><option value="">Day</option>{Array.from({length:31},(_,i)=>i+1).map(day=><option key={day} value={day}>{day}</option>)}</select></div></label>
        <label>Email address<input type="email" value={email} readOnly autoComplete="email"/><small className="field-help">This is the email address your workspace invitation was sent to.</small></label>
        <label>Create password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Create a password" minLength={10} autoComplete="new-password" required/></label>
        <label>Confirm password<input type="password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} placeholder="Re-enter your password" minLength={10} autoComplete="new-password" required/></label>
        {error&&<div className="form-error">{error}</div>}
        <button className="primary-button auth-submit" disabled={busy}>{busy?'Creating account…':'Create account & continue'}</button>
      </form>
    </div>
    <div className="auth-aside"><div><span className="aside-kicker">APPLYFLOW</span><h2>Join your team workspace.</h2><p>Your invitation controls which workspace you join and what role you have. Your personal account details remain yours to manage after setup.</p></div><div className="aside-stat"><strong>One-time account setup</strong><span>Profile · Password · Sign in · Workspace access</span></div></div>
  </div>
}

function PublicAttendanceCheckIn({slug}:{slug:string}) {
  const [code,setCode]=useState(''),[email,setEmail]=useState(''),[data,setData]=useState<any>(null),[done,setDone]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function identify(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');const r=await supabase.rpc('open_attendance_checkin',{p_slug:slug,p_participant_code:code.trim(),p_email:email.trim()});setBusy(false);if(r.error||r.data?.error){setError(r.error?.message||r.data?.error);return}if(r.data?.already_recorded){setDone({...r.data,status:r.data.attendance_status});return}setData(r.data)}
  async function markPresent(){setBusy(true);setError('');const r=await supabase.rpc('submit_attendance_checkin',{p_slug:slug,p_participant_code:code.trim(),p_email:email.trim()});setBusy(false);if(r.error||r.data?.error){setError(r.error?.message||r.data?.error);return}setDone(r.data)}
  if(done)return <div className="auth-shell attendance-public-shell"><div className="auth-panel attendance-confirm-panel"><div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Attendance</span></div></div><div className="attendance-confirm-content"><div className="assignment-success-check"><Check size={38}/></div><p className="eyebrow">{done.already_recorded?'Already recorded':'Check-in complete'}</p><h1>{done.status==='present'?'You’re present.':'Attendance recorded.'}</h1><p>Thank you, <strong>{done.participant_name}</strong>. Your attendance for <strong>{done.title}</strong> is recorded.</p><div className="assignment-success-receipt"><div><span>Participant ID</span><strong>{done.participant_code}</strong></div><div><span>Recorded</span><strong>{new Date(done.marked_at).toLocaleString()}</strong></div></div><p className="assignment-success-note">{done.already_recorded?'Your attendance was already on record. No duplicate entry was created.':'You can safely close this page.'}</p></div></div><div className="auth-aside"><div><span className="aside-kicker">ATTENDANCE</span><h2>Check-in confirmed.</h2><p>Your programme team can now see your attendance in ApplyFlow.</p></div></div></div>
  if(data)return <div className="auth-shell attendance-public-shell"><div className="auth-panel"><div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Attendance</span></div></div><div className="auth-copy"><p className="eyebrow">Confirm attendance</p><h1>Welcome, {data.participant_name}.</h1><p>You’re checking in for <strong>{data.title}</strong> on {new Date(data.session_date+'T00:00:00').toLocaleDateString()}.</p></div>{error&&<div className="form-error">{error}</div>}<button className="primary-button auth-submit attendance-present-button" onClick={markPresent} disabled={busy}><CheckCircle2 size={18}/>{busy?'Recording…':'Mark me present'}</button><button className="text-button attendance-wrong-id" onClick={()=>{setData(null);setEmail('');setError('')}}>Not you? Use another Participant ID</button></div><div className="auth-aside"><div><span className="aside-kicker">SELF CHECK-IN</span><h2>One tap and you’re checked in.</h2><p>Your Participant ID connects this attendance directly to your programme record.</p></div></div></div>
  return <div className="auth-shell attendance-public-shell"><div className="auth-panel"><div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Attendance</span></div></div><div className="auth-copy"><p className="eyebrow">Participant check-in</p><h1>Check in to class.</h1><p>Enter your Participant ID and the email used for your application to verify your identity.</p></div><form className="auth-form" onSubmit={identify}><label>Participant ID<input value={code} onChange={e=>setCode(e.target.value)} placeholder="e.g. ECA-2026-00001" required autoCapitalize="characters"/></label><label>Application email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"/></label>{error&&<div className="form-error">{error}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy?'Checking…':'Continue'} <ArrowRight size={17}/></button></form><p className="results-privacy-note"><ShieldCheck size={14}/> Only active participants in this programme can check in.</p></div><div className="auth-aside"><div><span className="aside-kicker">ATTENDANCE</span><h2>Fast, secure class check-in.</h2><p>Use the Participant ID assigned to you by your programme team.</p></div></div></div>
}

function PublicAssignmentResults({slug}:{slug:string}) {
  const [code,setCode]=useState(''),[email,setEmail]=useState(''),[result,setResult]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
  async function check(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');setResult(null);const r=await supabase.rpc('get_public_assignment_result',{p_slug:slug,p_participant_code:code.trim(),p_email:email.trim()});setBusy(false);if(r.error||r.data?.error){setError(r.error?.message||r.data?.error);return}setResult(r.data)}
  if(!result)return <div className="auth-shell results-portal-shell"><div className="auth-panel results-login-panel"><div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Participant Results</span></div></div><div className="auth-copy results-login-copy"><p className="eyebrow">Results portal</p><h1>Check your assignment result.</h1><p>Enter your Participant ID and application email to securely view your score, feedback and programme leaderboard position.</p></div><form className="auth-form results-check-form" onSubmit={check}><label>Participant ID<input value={code} onChange={e=>setCode(e.target.value)} placeholder="e.g. ECA-2026-00001" required autoCapitalize="characters"/></label><label>Application email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"/></label>{error&&<div className="form-error">{error}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy?'Checking…':'Check Results'} <ArrowRight size={17}/></button></form><p className="results-privacy-note"><ShieldCheck size={14}/> Results are available only after your programme team releases them.</p></div><div className="auth-aside"><div><span className="aside-kicker">PARTICIPANT RESULTS</span><h2>Your performance, in one place.</h2><p>Review your assignment result and see the full programme leaderboard as points accumulate over time.</p></div></div></div>
  const rows=result.leaderboard||[]
  return <div className="results-page"><header className="results-page-header"><div className="brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Participant Results</span></div></div><button className="secondary-button" onClick={()=>{setResult(null);setCode('');setEmail('');setError('')}}>Check another ID</button></header><main className="results-main"><section className="results-hero"><p className="eyebrow">Assignment result</p><h1>Welcome, {result.participant_name}.</h1><p>Your result for <strong>{result.title}</strong> has been released.</p></section><section className="results-score-grid"><div className="results-score-card primary"><span>Your score</span><strong>{result.score}<small> / {result.max_score}</small></strong><p>{result.percentage}%</p></div><div className="results-score-card"><span>Pass mark</span><strong>{result.pass_mark}</strong><p>Minimum required score</p></div><div className={'results-score-card '+(result.passed?'passed':'below')}><span>Result</span><strong>{result.passed?'Passed':'Below pass mark'}</strong><p>{result.passed?'You met the required score.':'Review the feedback below.'}</p></div></section><section className="results-feedback-card"><div><p className="eyebrow">Marker feedback</p><h2>Feedback from your programme team</h2></div><p>{result.feedback||'No written feedback was added for this assignment.'}</p><div className="results-dates"><span>Submitted <strong>{new Date(result.submitted_at).toLocaleString()}</strong></span>{result.graded_at&&<span>Graded <strong>{new Date(result.graded_at).toLocaleString()}</strong></span>}</div></section><section className="results-leaderboard"><div className="results-section-heading"><div><p className="eyebrow">Programme leaderboard</p><h2>Running standings</h2><p>Everyone in the programme is shown. Points accumulate from released assignment scores, attendance and bonus awards. Your row is highlighted.</p></div><div className="status green"><TrendingUp size={15}/> {rows.length} participants</div></div>{rows.length?<div className="results-table-wrap"><table><thead><tr><th>Rank</th><th>Participant</th><th>Assignment points</th><th>Attendance points</th><th>Bonus points</th><th>Points</th></tr></thead><tbody>{rows.map((row:any)=><tr key={row.participant_id} className={row.is_you?'is-you':''}><td><strong>#{row.rank}</strong></td><td><div><strong>{row.display_name}</strong><small>{row.is_you?'You · ':''}{row.participant_id}</small></div></td><td>{Number(row.assignment_points||0).toFixed(0)}</td><td>{Number(row.attendance_points||0).toFixed(0)}</td><td>{Number(row.bonus_points||0).toFixed(0)}</td><td><strong>{Number(row.points||0).toFixed(0)}</strong></td></tr>)}</tbody></table></div>:<div className="results-empty">No programme leaderboard entries are available yet.</div>}</section></main></div>
}

function PublicAssignment({slug}:{slug:string}) {
  const [code,setCode]=useState(''),[email,setEmail]=useState(''),[data,setData]=useState<any>(null),[started,setStarted]=useState(false),[answers,setAnswers]=useState<Record<string,any>>({}),[files,setFiles]=useState<Record<string,File>>({})
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[done,setDone]=useState<any>(null)
  async function open(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');const r=await supabase.rpc('open_assignment_for_participant',{p_slug:slug,p_participant_code:code.trim(),p_email:email.trim()});setBusy(false);if(r.error||r.data?.error){setError(r.error?.message||r.data?.error);return}setData(r.data)}
  async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setError('');try{
    const payload:any={...answers}
    for(const q of data.questions||[]){
      const file=files[q.id]
      if(q.type==='file'&&file){
        const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-')
        const path='assignment-submissions/'+data.assignment_id+'/'+data.upload_token+'/'+q.id+'-'+crypto.randomUUID()+'-'+safe
        const {error:uploadError}=await supabase.storage.from('application-files').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false})
        if(uploadError)throw new Error('Could not upload '+file.name+'. '+uploadError.message)
        payload[q.id]={path,name:file.name,size:file.size,type:file.type}
      }
    }
    const r=await supabase.rpc('submit_public_assignment',{p_slug:slug,p_participant_code:code.trim(),p_upload_token:data.upload_token,p_answers:payload})
    if(r.error||r.data?.error)throw new Error(r.error?.message||r.data?.error)
    setDone(r.data)
  }catch(e){setError(friendlyErrorMessage(e,'Could not submit this assignment.'))}finally{setBusy(false)}}
  if(done)return <div className="auth-shell assignment-success-shell"><div className="auth-panel assignment-success-panel"><div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Assignment submitted</span></div></div><div className="assignment-success-content"><div className="assignment-success-check"><Check size={38}/></div><p className="eyebrow">Submission received</p><h1>Successfully submitted!</h1><p className="assignment-success-lead">Thank you, <strong>{data?.participant_name||'Participant'}</strong>, for submitting <strong>{done.title}</strong>.</p><p className="assignment-success-copy">Your response has been received and saved. This assignment can only be taken once, so no further submission is required. We look forward to seeing you in the next class.</p><div className="assignment-success-receipt"><div><span>Participant ID</span><strong>{done.participant_code}</strong></div><div><span>Submitted</span><strong>{new Date(done.submitted_at).toLocaleString()}</strong></div></div><a className="primary-button assignment-leaderboard-link" href={'/results/'+encodeURIComponent(slug)}>View results & leaderboard <ArrowRight size={17}/></a><p className="assignment-success-note">Results will appear after your programme team grades the assignment and releases them.</p></div></div><div className="auth-aside"><div><span className="aside-kicker">ALL DONE</span><h2>Assignment received.</h2><p>You can safely close this page. Your submission has been recorded.</p></div></div></div>
  if(!data)return <div className="auth-shell"><div className="auth-panel"><div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Participant assignment</span></div></div><div className="auth-copy"><p className="eyebrow">Programme assignment</p><h1>Open your assignment.</h1><p>Enter your Participant ID and the email used for your application.</p></div><form className="auth-form" onSubmit={open}><label>Participant ID<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="ECA-2026-00001" required autoFocus/></label><label>Application email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"/></label>{error&&<div className="form-error">{error}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy?'Checking…':'Continue'}</button></form></div><div className="auth-aside"><div><span className="aside-kicker">APPLYFLOW</span><h2>Your programme assignment.</h2><p>Your Participant ID securely connects you to assignments for your programme.</p></div></div></div>
  if(!started)return <div className="auth-shell"><div className="auth-panel public-assignment-panel assignment-welcome-panel"><div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>{data.participant_code}</span></div></div><div className="assignment-welcome-copy"><p className="eyebrow">Assignment ready</p><h1>Welcome, {data.participant_name}.</h1><p>{data.description||'Your assignment is ready. Review the details below before you begin.'}</p></div><div className="assignment-welcome-details"><div><span>Assignment</span><strong>{data.title}</strong></div><div><span>Deadline</span><strong>{data.deadline?new Date(data.deadline).toLocaleString():'No deadline'}</strong></div><div><span>Maximum score</span><strong>{data.max_score}</strong></div><div><span>Pass mark</span><strong>{data.pass_mark}</strong></div></div>{data.instructions&&<div className="public-assignment-instructions welcome-instructions"><span>Instructions</span><p>{data.instructions}</p></div>}<button type="button" className="primary-button assignment-start-button" onClick={()=>setStarted(true)}>Take Assignment</button><p className="assignment-welcome-note">Your answers are not submitted until you press Submit assignment at the end.</p></div><div className="auth-aside"><div><span className="aside-kicker">READY TO BEGIN</span><h2>{data.title}</h2><p>Read the instructions and assignment details carefully before you start.</p></div></div></div>
  return <div className="auth-shell"><div className="auth-panel public-assignment-panel"><div className="brand auth-brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>{data.participant_code}</span></div></div><div className="auth-copy"><p className="eyebrow">Assignment</p><h1>{data.title}</h1><p>Good luck, {data.participant_name}.</p></div><div className="public-assignment-meta"><div><span>Deadline</span><strong>{data.deadline?new Date(data.deadline).toLocaleString():'No deadline'}</strong></div><div><span>Pass mark</span><strong>{data.pass_mark} / {data.max_score}</strong></div></div><form className="auth-form public-assignment-form" onSubmit={submit}>{(data.questions||[]).map((q:any,i:number)=><label className="public-assignment-question" key={q.id}><span className="public-question-label"><b>{i+1}.</b> {q.label}{q.required&&<em>*</em>}</span>{q.description&&<small className="field-help">{q.description}</small>}{q.type==='long_text'?<textarea rows={5} value={answers[q.id]||''} onChange={e=>setAnswers(x=>({...x,[q.id]:e.target.value}))} required={q.required}/>:q.type==='number'?<input type="number" value={answers[q.id]||''} onChange={e=>setAnswers(x=>({...x,[q.id]:e.target.value}))} required={q.required}/>:q.type==='url'?<input type="url" placeholder="https://" value={answers[q.id]||''} onChange={e=>setAnswers(x=>({...x,[q.id]:e.target.value}))} required={q.required}/>:q.type==='single_choice'?<div className="public-choice-list">{(q.config?.options||[]).map((option:string)=><label className="public-choice" key={option}><input type="radio" name={q.id} value={option} checked={answers[q.id]===option} onChange={()=>setAnswers(x=>({...x,[q.id]:option}))} required={q.required}/><span>{option}</span></label>)}</div>:q.type==='multiple_choice'?<div className="public-choice-list">{(q.config?.options||[]).map((option:string)=><label className="public-choice" key={option}><input type="checkbox" checked={(answers[q.id]||[]).includes(option)} onChange={e=>setAnswers(x=>({...x,[q.id]:e.target.checked?[...(x[q.id]||[]),option]:(x[q.id]||[]).filter((v:string)=>v!==option)}))}/><span>{option}</span></label>)}</div>:q.type==='file'?<div className="public-file-field"><input id={'assignment-file-'+q.id} type="file" onChange={e=>{const f=e.target.files?.[0];setFiles(x=>{const next={...x};if(f)next[q.id]=f;else delete next[q.id];return next});setAnswers(x=>({...x,[q.id]:f?f.name:''}))}} required={q.required}/><label htmlFor={'assignment-file-'+q.id} className="public-file-button"><Upload size={18}/><span>{files[q.id]?'Change file':'Choose file'}</span></label><div className="public-file-name">{files[q.id]?<><strong>{files[q.id].name}</strong><small>{Math.max(1,Math.round(files[q.id].size/1024))} KB</small></>:<span>No file selected</span>}</div></div>:<input value={answers[q.id]||''} onChange={e=>setAnswers(x=>({...x,[q.id]:e.target.value}))} required={q.required}/>}</label>)}{error&&<div className="form-error">{error}</div>}<button className="primary-button auth-submit" disabled={busy}>{busy?'Submitting…':'Submit assignment'}</button></form></div><div className="auth-aside"><div><span className="aside-kicker">ASSIGNMENT</span><h2>{data.title}</h2><p>Complete every required question before submitting.</p></div></div></div>
}

function PublicApplication({slug}:{slug:string}) {
  const [loading,setLoading]=useState(true), [error,setError]=useState(''), [submitted,setSubmitted]=useState(false), [participantId,setParticipantId]=useState('')
  const [app,setApp]=useState<{id:string;name:string;description:string|null;deadline:string|null} | null>(null)
  const [settings,setSettings]=useState<{confirmation_message:string;start_date:string|null;applicant_instructions:string|null}|null>(null)
  const [questions,setQuestions]=useState<BuilderQuestion[]>([]), [answers,setAnswers]=useState<Record<string,string|string[]>>({}), [files,setFiles]=useState<Record<string,File>>({})
  const [lgaOptions,setLgaOptions]=useState<string[]>([]), [lgaLoading,setLgaLoading]=useState(false)
  useEffect(()=>{(async()=>{try{
    const {data:s,error:se}=await supabase.from('application_settings').select('application_id,confirmation_message,start_date,applicant_instructions').eq('public_slug',slug).single(); if(se)throw se
    const {data:a,error:ae}=await supabase.from('applications').select('id,name,description,deadline').eq('id',s.application_id).eq('status','published').single(); if(ae)throw ae
    const today=new Date().toISOString().slice(0,10); if(s.start_date&&today<s.start_date)throw new Error(`Applications open on ${new Date(s.start_date+'T00:00:00').toLocaleDateString()}.`); if(a.deadline&&today>a.deadline)throw new Error('Applications for this programme are now closed.')
    const {data:v,error:ve}=await supabase.from('form_versions').select('id').eq('application_id',a.id).eq('status','published').order('version_number',{ascending:false}).limit(1).single(); if(ve)throw ve
    const {data:qs,error:qe}=await supabase.from('questions').select('id,type,label,description,required,placeholder,position,config,conditional_rules').eq('form_version_id',v.id).order('position'); if(qe)throw qe
    const full=await Promise.all((qs||[]).map(async q=>{const {data:o,error:oe}=await supabase.from('question_options').select('id,label,value,position').eq('question_id',q.id).order('position');if(oe)throw oe;return {...q,conditional_rules:normalizeConditionalRules(q.conditional_rules),options:o||[]}}))
    setApp(a);setSettings(s);setQuestions(full as BuilderQuestion[])
  }catch(e){setError(friendlyErrorMessage(e,'This application is unavailable.'))}finally{setLoading(false)}})()},[slug])
  const visible=(q:BuilderQuestion)=>{const r=normalizeConditionalRules(q.conditional_rules)[0];if(!r)return true;return answers[r.question_id]===r.value}
  const stateQuestion=questions.find(q=>q.type==='nigeria_state')
  const selectedState=stateQuestion?String(answers[stateQuestion.id]||''):''
  useEffect(()=>{(async()=>{if(!selectedState){setLgaOptions([]);return}setLgaLoading(true);try{setLgaOptions(await getNigerianLgas(selectedState))}catch{setLgaOptions([])}finally{setLgaLoading(false)}})()},[selectedState])
  function setAnswer(id:string,value:string|string[]){setAnswers(x=>({...x,[id]:value}))}
  function setStateAnswer(id:string,value:string){setAnswers(x=>{const next={...x,[id]:value};const lga=questions.find(q=>q.type==='nigeria_lga');if(lga)delete next[lga.id];return next})}
  function setFile(id:string,file:File|null){setFiles(x=>{const next={...x};if(file)next[id]=file;else delete next[id];return next})}
  async function submit(e:React.FormEvent){e.preventDefault();setError('');for(const q of questions){if(visible(q)&&q.required&&!answers[q.id]){setError(`Please answer: ${q.label}`);return}}setLoading(true);try{
    const allowedUploadTypes=new Set(['image/png','image/jpeg','image/webp','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
    const allowedImageTypes=new Set(['image/png','image/jpeg','image/webp'])
    for(const q of questions.filter(q=>(q.type==='file'||q.type==='image')&&files[q.id])){
      const file=files[q.id]!
      if(file.size>15*1024*1024)throw new Error(`"${file.name}" is larger than the 15 MB upload limit.`)
      if(!allowedUploadTypes.has(file.type))throw new Error(`"${file.name}" is not an allowed file type. Use JPG, PNG, WebP, PDF, DOC, or DOCX.`)
      if(q.type==='image'&&!allowedImageTypes.has(file.type))throw new Error(`"${file.name}" must be a JPG, PNG, or WebP image.`)
    }
    const emailQ=questions.find(q=>q.type==='email'), nameQ=questions.find(q=>q.label.toLowerCase().includes('full name')||q.label.toLowerCase()==='name')
    const submissionEmail=emailQ?String(answers[emailQ.id]||''):null
    const submissionName=nameQ?String(answers[nameQ.id]||''):null
    const {data:v,error:ve}=await supabase.from('form_versions').select('id').eq('application_id',app!.id).eq('status','published').order('version_number',{ascending:false}).limit(1).single();if(ve)throw ve
    const {data:sessionResult,error:sessionError}=await supabase.rpc('begin_public_application_submission',{p_application_id:app!.id,p_form_version_id:v.id,p_email:submissionEmail});if(sessionError)throw sessionError
    const sessionPayload:any=typeof sessionResult==='string'?JSON.parse(sessionResult):sessionResult
    if(sessionPayload?.error)throw new Error(sessionPayload.error)
    const uploadToken=sessionPayload?.upload_token
    if(!uploadToken)throw new Error('Could not start a secure application session. Please try again.')
    const answerPayload=questions.filter(q=>visible(q)&&answers[q.id]!==undefined).map(q=>{
      const file=files[q.id]
      if((q.type==='file'||q.type==='image')&&file){
        const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'-')
        const path=`public-submissions/${app!.id}/${uploadToken}/${q.id}-${crypto.randomUUID()}-${safe}`
        return {question_id:q.id,value:{path,name:file.name,size:file.size,type:file.type}}
      }
      return {question_id:q.id,value:answers[q.id]}
    })
    for(const q of questions.filter(q=>(q.type==='file'||q.type==='image')&&files[q.id])){
      const file=files[q.id]!, meta=answerPayload.find(x=>x.question_id===q.id)?.value as {path:string}
      const {error:uploadError}=await supabase.storage.from('application-files').upload(meta.path,file,{contentType:file.type||'application/octet-stream',upsert:false})
      if(uploadError)throw new Error(`Could not securely upload "${file.name}". Please try again. (${uploadError.message})`)
    }
    const {data:submissionResult,error:se}=await supabase.rpc('submit_application_with_participant_id_v2',{p_application_id:app!.id,p_form_version_id:v.id,p_email:submissionEmail,p_full_name:submissionName,p_answers:answerPayload,p_upload_token:uploadToken});if(se)throw se
    let submissionPayload:any=typeof submissionResult==='string'?JSON.parse(submissionResult):submissionResult
    if(typeof submissionPayload==='string'){try{submissionPayload=JSON.parse(submissionPayload)}catch{}}
    if(submissionPayload?.error)throw new Error(submissionPayload.error)
    const assignedId=Array.isArray(submissionPayload)
      ? submissionPayload[0]?.participant_id
      : submissionPayload?.participant_id||submissionPayload?.data?.participant_id||submissionPayload?.result?.participant_id
    if(!assignedId)throw new Error('Your application was submitted, but we could not retrieve your Participant ID. Please contact the programme team with the time of submission.')
    setParticipantId(assignedId)
    setSubmitted(true)
  }catch(e){
    const err=e as any
    const message=err?.message||err?.error_description||err?.details||err?.hint||'Could not submit application. Please try again.'
    setError(message)
  }finally{setLoading(false)}}
  if(loading&&!app)return <div className="public-shell"><div className="public-card card">Loading application…</div></div>
  if(error&&!app)return <div className="public-shell"><div className="public-card card"><div className="empty-icon"><FileText size={22}/></div><h1>Application unavailable</h1><p>{error}</p></div></div>
  if(submitted)return <div className="public-shell"><div className="public-card card public-success"><div className="success-mark">✓</div><p className="eyebrow">Application submitted</p><h1>Thank you.</h1><p>{settings?.confirmation_message}</p><div className="card" style={{marginTop:20,padding:20}}><p className="eyebrow">Your Participant ID</p><h2 style={{margin:"6px 0"}}>{participantId}</h2><p className="muted">This Participant ID has been assigned to you. Please copy it and keep it somewhere safe. You can use it when referencing your application or contacting the programme team.</p></div></div></div>
  return <div className="public-shell"><div className="public-frame"><div className="public-brand"><div className="public-brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application form</span></div></div><form className="public-form card" onSubmit={submit}><header className="public-header"><div className="public-kicker-row"><p className="eyebrow">Application</p><span className="public-status">Open</span></div><h1>{app?.name}</h1><p className="public-description">{app?.description||'Complete the form below to apply.'}</p><div className="public-meta">{settings?.start_date&&<div><span>Opens</span><strong>{new Date(settings.start_date+"T00:00:00").toLocaleDateString()}</strong></div>}{app?.deadline&&<div><span>Deadline</span><strong>{formatDate(app.deadline)}</strong></div>}<div><span>Questions</span><strong>{questions.filter(visible).length}</strong></div></div>{settings?.applicant_instructions&&<div className="public-instructions"><strong>Before you begin</strong><p>{settings.applicant_instructions}</p></div>}</header><div className="public-form-body">{questions.map((q,i)=>visible(q)&&<div className="public-question" key={q.id}><label><span className="public-question-number">{String(i+1).padStart(2,'0')}</span><span className="public-question-copy"><span className="public-question-title">{q.label}{q.required&&<span className="required-star">*</span>}</span>{q.description&&<small>{q.description}</small>}</span></label>{q.type==='long_text'?<textarea value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='date'?<input type="date" className="date-picker-input" onClick={e=>{try{e.currentTarget.showPicker?.()}catch{}}} value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)}/>:q.type==='number'?<input type="number" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='email'?<input type="email" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='phone'?<input type="tel" value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>:q.type==='dropdown'?<select value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)}><option value="">Select an option</option>{q.options.map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select>:q.type==='nigeria_state'?<select value={String(answers[q.id]||'')} onChange={e=>setStateAnswer(q.id,e.target.value)}><option value="">Select your state of origin</option>{NIGERIAN_STATES.map(state=><option key={state} value={state}>{state}</option>)}</select>:q.type==='nigeria_lga'?<select value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} disabled={!selectedState||lgaLoading}><option value="">{!selectedState?'Select your state first':lgaLoading?'Loading local governments…':'Select your local government'}</option>{lgaOptions.map(lga=><option key={lga} value={lga}>{lga}</option>)}</select>:q.type==='single_choice'||q.type==='yes_no'?<div className="public-options">{q.options.map(o=><label key={o.id}><input type="radio" name={q.id} checked={answers[q.id]===o.value} onChange={()=>setAnswer(q.id,o.value)}/><span>{o.label}</span></label>)}</div>:q.type==='multiple_choice'?<div className="public-options">{q.options.map(o=><label key={o.id}><input type="checkbox" checked={Array.isArray(answers[q.id])&&answers[q.id].includes(o.value)} onChange={e=>{const current=Array.isArray(answers[q.id])?(answers[q.id] as string[]):[];setAnswer(q.id,e.target.checked?[...current,o.value]:current.filter((v:string)=>v!==o.value))}}/><span>{o.label}</span></label>)}</div>:q.type==='rating'?<div className="rating-options">{[1,2,3,4,5].map(n=><button type="button" key={n} className={answers[q.id]===String(n)?'rating-active':''} onClick={()=>setAnswer(q.id,String(n))}>{n}</button>)}</div>:q.type==='file'||q.type==='image'?<input type="file" accept={q.type==='image'?'image/*':undefined} onChange={e=>{const f=e.target.files?.[0]||null;setFile(q.id,f);setAnswer(q.id,f?.name||'')}}/>:<input value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} placeholder={q.placeholder||''}/>}</div>)}</div><div className="public-form-actions">{error&&<div className="form-error">{error}</div>}<button className="primary-button public-submit" disabled={loading}>{loading?'Submitting…':'Submit application'}</button></div></form><p className="public-footer-note">Your information will be securely submitted to the programme team.</p></div></div>
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

function ApplyFlowMark({ light = false }: { light?: boolean }) {
  return <span className={"afx-logo-mark" + (light ? " afx-logo-mark-light" : "")} aria-hidden="true">
    <svg viewBox="0 0 42 42" role="presentation">
      <rect x="1" y="1" width="40" height="40" rx="12" fill="currentColor" opacity=".12"/>
      <path d="M11 27.5 17.5 14l7 14 6.5-7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="11" cy="27.5" r="2.7" fill="currentColor"/><circle cx="17.5" cy="14" r="2.7" fill="currentColor"/><circle cx="24.5" cy="28" r="2.7" fill="currentColor"/><circle cx="31" cy="20.5" r="2.7" fill="currentColor"/>
    </svg>
  </span>
}

function LandingPage() {
  const [scrolled,setScrolled]=useState(false)
  const [activeStage,setActiveStage]=useState(1)

  useEffect(()=>{
    const onScroll=()=>setScrolled(window.scrollY>24)
    onScroll(); window.addEventListener('scroll',onScroll,{passive:true})
    const nodes=Array.from(document.querySelectorAll<HTMLElement>('.afx-reveal'))
    const observer=new IntersectionObserver(entries=>{
      entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}})
    },{threshold:.12,rootMargin:'0px 0px -60px'})
    nodes.forEach(node=>observer.observe(node))
    return()=>{window.removeEventListener('scroll',onScroll);observer.disconnect()}
  },[])

  const stages=[
    {icon:FileText,number:'01',title:'Intake',text:'Build forms that collect exactly what your programme needs.',detail:'Conditional questions · uploads · versioned forms'},
    {icon:ShieldCheck,number:'02',title:'Eligibility',text:'Turn programme requirements into clear, repeatable rules.',detail:'Rules · evidence · automatic eligibility status'},
    {icon:Brain,number:'03',title:'Screening',text:'Use AI to surface evidence while your team stays in control.',detail:'AI assessment · final decision · audit trail'},
    {icon:BadgeCheck,number:'04',title:'Participants',text:'Approve applicants and move them into one participant lifecycle.',detail:'Participant ID · active · completed · withdrawn'},
  ]
  const capabilities=[
    {icon:FileText,label:'Application forms',title:'A form builder that behaves like a product.',text:'Conditional logic, uploads, structured fields and versioned publishing — without duct-taping a spreadsheet to it.'},
    {icon:ShieldCheck,label:'Eligibility',title:'Make programme requirements explicit.',text:'Define the answers that qualify someone before reviewers spend time screening the wrong applications.'},
    {icon:Users,label:'Review teams',title:'Give every reviewer the same context.',text:'Assign applications, capture scores and notes, and preserve a clear history of how reviews changed.'},
    {icon:BarChart3,label:'Analytics',title:'See the whole programme, not just the form.',text:'Track submissions, approvals, participants, completion and withdrawal from the same source of truth.'},
  ]

  return <div className="afx-landing">
    <header className={"afx-nav"+(scrolled?" afx-nav-scrolled":"")}>
      <a className="afx-brand" href="/" aria-label="ApplyFlow home"><ApplyFlowMark/><span><strong>ApplyFlow</strong><small>Application OS</small></span></a>
      <nav className="afx-nav-links" aria-label="Primary navigation"><a href="#product">Product</a><a href="#workflow">Workflow</a><a href="#ai">AI screening</a><a href="#analytics">Analytics</a></nav>
      <div className="afx-nav-actions"><ThemeToggle compact/><a className="afx-nav-login" href="/login">Sign in</a><a className="afx-button afx-button-dark afx-button-small" href="/login">Get started <ArrowRight size={15}/></a></div>
    </header>

    <main>
      <section className="afx-hero" id="product">
        <div className="afx-hero-grid"></div><div className="afx-glow afx-glow-one"></div><div className="afx-glow afx-glow-two"></div>
        <div className="afx-hero-inner">
          <div className="afx-hero-copy afx-reveal">
            <div className="afx-overline"><span></span> APPLICATION OPERATIONS PLATFORM</div>
            <h1>Run the whole<br/><em>application journey.</em></h1>
            <p className="afx-hero-lede">Collect applications. Check eligibility. Screen with confidence. Review with context. Turn approved applicants into participants — without moving your programme between five different tools.</p>
            <div className="afx-hero-actions"><a className="afx-button afx-button-dark" href="/login">Build your workspace <ArrowRight size={17}/></a><a className="afx-button afx-button-quiet" href="#workflow"><span className="afx-play"><ChevronRight size={14}/></span> Explore the workflow</a></div>
            <div className="afx-proof-row"><span><Check size={14}/> Structured intake</span><span><Check size={14}/> Human-led decisions</span><span><Check size={14}/> Live programme data</span></div>
          </div>
          <div className="afx-hero-stage afx-reveal afx-delay-2">
            <div className="afx-stage-orbit afx-orbit-a"></div><div className="afx-stage-orbit afx-orbit-b"></div>
            <div className="afx-dashboard">
              <div className="afx-window-bar"><div className="afx-window-dots"><i></i><i></i><i></i></div><span>ApplyFlow / Programme overview</span><b>EC</b></div>
              <div className="afx-dashboard-body">
                <div className="afx-dash-head"><div><small>PROGRAMME OVERVIEW</small><h3>Women Artisans · Cohort 3</h3></div><span><i></i> Screening</span></div>
                <div className="afx-dash-kpis"><div><small>Applications</small><strong>450</strong><span>+18 this week</span></div><div><small>Eligible</small><strong>382</strong><span>84.9% of total</span></div><div><small>Participants</small><strong>146</strong><span>32.4% of total</span></div></div>
                <div className="afx-dash-main"><div className="afx-mini-chart"><div><span>Application flow</span><small>Last 30 days</small></div><div className="afx-chart">{[34,46,40,58,51,73,86,68,94,78,88,96].map((height,index)=><i key={index} style={{height:height+'%'}}></i>)}</div></div><div className="afx-pipeline"><small>LIVE PIPELINE</small><div><span>Submitted</span><b>450</b></div><div><span>Eligible</span><b>382</b></div><div><span>Approved</span><b>146</b></div></div></div>
                <div className="afx-dash-table"><div><span>Applicant</span><span>Eligibility</span><span>Decision</span></div><div><strong>Amina Yusuf</strong><b>Eligible</b><em>Approved</em></div><div><strong>Grace Okafor</strong><b>Pending</b><em>Review</em></div></div>
              </div>
            </div>
            <div className="afx-floating-card"><span><Check size={15}/></span><div><strong>Eligibility evaluated</strong><small>382 applications passed</small></div></div>
            <div className="afx-floating-card afx-floating-card-two"><span><Sparkles size={14}/></span><div><strong>AI screening complete</strong><small>8 evidence points found</small></div></div>
          </div>
        </div>
        <div className="afx-scroll-cue"><span>SCROLL TO EXPLORE</span><i></i></div>
      </section>

      <section className="afx-marquee" aria-label="ApplyFlow capabilities"><div className="afx-marquee-track">{['APPLICATIONS','ELIGIBILITY','SCREENING','REVIEW','PARTICIPANTS','ANALYTICS','APPLICATIONS','ELIGIBILITY','SCREENING','REVIEW','PARTICIPANTS','ANALYTICS'].map((item,index)=><span key={index}><b>✦</b>{item}</span>)}</div></section>

      <section className="afx-section afx-intro afx-reveal"><div className="afx-section-label">01 / THE PROBLEM</div><div className="afx-intro-grid"><h2>Your programme is more than a <em>form.</em></h2><div><p>Applications arrive in one place. Eligibility gets checked somewhere else. Reviewers open a spreadsheet. Decisions land in email. Then someone manually builds a participant list.</p><p className="afx-muted">ApplyFlow connects the stages so the information moves with the applicant — not between tools.</p></div></div></section>

      <section className="afx-section afx-workflow" id="workflow">
        <div className="afx-section-head afx-reveal"><div><div className="afx-section-label">02 / ONE CONNECTED FLOW</div><h2>One system. Every stage.</h2></div><p>Designed around the way programme teams actually work: collect, evaluate, decide, then manage the people who make it through.</p></div>
        <div className="afx-stage-layout">
          <div className="afx-stage-list afx-reveal">{stages.map((stage,index)=>{const Icon=stage.icon;return <button key={stage.number} className={"afx-stage-item"+(activeStage===index?" active":"")} onClick={()=>setActiveStage(index)}><span className="afx-stage-number">{stage.number}</span><span className="afx-stage-icon"><Icon size={18}/></span><span className="afx-stage-copy"><strong>{stage.title}</strong><small>{stage.text}</small></span><ChevronRight size={16}/></button>})}</div>
          <div className="afx-stage-preview afx-reveal afx-delay-1"><div className="afx-preview-top"><span>APPLYFLOW / {stages[activeStage].title.toUpperCase()}</span><i></i></div><div className="afx-preview-content"><div className="afx-preview-number">0{activeStage+1}</div><h3>{stages[activeStage].title}</h3><p>{stages[activeStage].text}</p><div className="afx-preview-detail"><Check size={14}/>{stages[activeStage].detail}</div><div className="afx-preview-lines"><i></i><i></i><i></i><i></i></div><div className="afx-preview-footer"><span>Stage {activeStage+1} of 4</span><span>{activeStage===3?'Participant lifecycle':'Connected to next stage'} <ArrowRight size={13}/></span></div></div></div>
        </div>
      </section>

      <section className="afx-section afx-capabilities" id="analytics">
        <div className="afx-section-head afx-reveal"><div><div className="afx-section-label">03 / CAPABILITIES</div><h2>Built for the work<br/>behind the application.</h2></div><p>Not another form tool with a few extra fields. ApplyFlow is built for the operational layer around programmes.</p></div>
        <div className="afx-capability-grid">{capabilities.map(({icon:Icon,label,title,text},index)=><article className={"afx-capability afx-reveal afx-delay-"+(index%3)} key={title}><div className="afx-capability-top"><span>{label}</span><Icon size={18}/></div><h3>{title}</h3><p>{text}</p><div className="afx-capability-arrow"><ArrowRight size={16}/></div></article>)}</div>
      </section>

      <section className="afx-section afx-ai" id="ai">
        <div className="afx-ai-card afx-reveal afx-ai-card-light">
          <div className="afx-ai-copy"><div className="afx-section-label">04 / AI WITH OVERSIGHT</div><h2>Let AI handle the volume.<br/><em>Keep people in charge.</em></h2><p>ApplyFlow can assess configured criteria against the information an applicant actually provided. It surfaces evidence, strengths, concerns and missing information — then leaves the final decision with your team.</p><ul><li><Check size={14}/> Evidence-backed criterion assessments</li><li><Check size={14}/> Clear reviewer context before a decision</li><li><Check size={14}/> Human decisions and review history</li></ul><a className="afx-inline-link" href="/login">Explore the workspace <ArrowRight size={15}/></a></div>
          <div className="afx-ai-console"><div className="afx-console-bar"><span><Brain size={14}/> AI SCREENING</span><b>COMPLETED</b></div><div className="afx-ai-score"><div><small>SUGGESTED SCORE</small><strong>82<span>/100</span></strong></div><div className="afx-confidence"><b>92%</b><small>confidence</small></div></div><div className="afx-ai-rows"><div><span>Business experience</span><b>17/20</b><i style={{width:'85%'}}></i></div><div><span>Programme fit</span><b>16/20</b><i style={{width:'80%'}}></i></div><div><span>Application quality</span><b>13/15</b><i style={{width:'87%'}}></i></div><div><span>Need</span><b>18/20</b><i style={{width:'90%'}}></i></div></div><div className="afx-ai-note"><Sparkles size={13}/> Evidence found across 8 submitted answers. <strong>1 concern</strong> flagged for reviewer.</div></div>
        </div>
      </section>

      <section className="afx-section afx-participants afx-reveal">
        <div className="afx-participant-visual"><div className="afx-id-card"><small>PARTICIPANT ID</small><strong>ECA-2026-00146</strong><span>ACTIVE / ENROLLED</span><i></i></div><div className="afx-life-line"><span></span><span></span><span></span><span></span></div><div className="afx-life-labels"><span>Approved</span><span>Active</span><span>Completed</span><span>Withdrawn</span></div></div>
        <div className="afx-participant-copy"><div className="afx-section-label">05 / PARTICIPANT LIFECYCLE</div><h2>Approval is the handoff.<br/><em>Not another queue.</em></h2><p>When your team approves an application, ApplyFlow moves that applicant into Participants automatically and assigns a persistent Participant ID.</p><div className="afx-id-format"><span>OWNER</span><b>ECA</b><i>—</i><span>YEAR</span><b>2026</b><i>—</i><span>NUMBER</span><b>00146</b></div></div>
      </section>

      <section className="afx-cta"><div className="afx-cta-grid"></div><div className="afx-cta-inner afx-reveal"><div className="afx-section-label">06 / READY WHEN YOU ARE</div><h2>Make the application process<br/><em>feel like a system.</em></h2><p>Give applicants a clear experience. Give your programme team one source of truth.</p><a className="afx-button afx-button-light" href="/login">Create your workspace <ArrowRight size={17}/></a></div></section>
    </main>

    <footer className="afx-footer"><a className="afx-brand afx-brand-footer" href="/"><ApplyFlowMark light/><span><strong>ApplyFlow</strong><small>Application OS</small></span></a><div className="afx-footer-copy">Application intake, screening, review and participant management — in one workspace.</div><div className="afx-footer-meta"><a href="/login">Sign in</a><span>© 2026 ApplyFlow</span></div></footer>
  </div>
}
function getInitialWorkspaceRoute() {
  const raw = window.location.hash.replace(/^#\/?/, '')
  const parts = raw.split('/').filter(Boolean).map(decodeURIComponent)
  if (!parts.length) return { active: 'Dashboard', applicationId: '', tab: 'Overview' as const }
  const key = parts[0]
  const activeMap: Record<string, string> = { dashboard:'Dashboard', applications:'Applications', forms:'Forms', screening:'Screening', reviews:'Reviews', participants:'Participants', analytics:'Analytics', team:'Team', settings:'Settings' }
  if (key === 'application' && parts[1]) {
    const rawTab = (parts[2] || 'overview').replace(/^./, x => x.toUpperCase()); const tab = (rawTab === 'Selection' ? 'Screening' : rawTab) as 'Overview'|'Form'|'Eligibility'|'Screening'|'Applicants'|'Reviews'|'Communications'
    return { active: 'Applications', applicationId: parts[1], tab }
  }
  return { active: activeMap[key] || 'Dashboard', applicationId: '', tab: 'Overview' as const }
}


type NotificationItem = {
  id: string
  type: 'new_submission'|'review_assigned'|'submission_update'|'system'
  title: string
  message: string
  target: string
  application_id: string | null
  submission_id: string | null
  created_at: string
  read_at: string | null
}

function NotificationCenter({ userId, onNavigate }:{userId:string;onNavigate:(target:string)=>void}) {
  const [open,setOpen]=useState(false)
  const [items,setItems]=useState<NotificationItem[]>([])
  const [loading,setLoading]=useState(false)

  async function load(){
    setLoading(true)
    const {data,error}=await supabase.from('notifications')
      .select('id,type,title,message,target,application_id,submission_id,created_at,read_at')
      .eq('user_id',userId)
      .order('created_at',{ascending:false})
      .limit(30)
    if(!error)setItems((data||[]) as NotificationItem[])
    setLoading(false)
  }

  useEffect(()=>{
    void load()
    const channel=supabase.channel('notifications:'+userId)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'notifications',filter:'user_id=eq.'+userId},payload=>{
        setItems(current=>[payload.new as NotificationItem,...current].slice(0,30))
      })
      .subscribe()
    return ()=>{void supabase.removeChannel(channel)}
  },[userId])

  async function markRead(id:string){
    const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('id',id).eq('user_id',userId)
    if(!error)setItems(current=>current.map(item=>item.id===id?{...item,read_at:new Date().toISOString()}:item))
  }

  async function markAllRead(){
    const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('user_id',userId).is('read_at',null)
    if(!error)setItems(current=>current.map(item=>({...item,read_at:item.read_at||new Date().toISOString()})))
  }

  const unread=items.filter(item=>!item.read_at).length
  const relativeTime=(value:string)=>{
    const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000))
    if(seconds<60)return 'Just now'
    const minutes=Math.floor(seconds/60)
    if(minutes<60)return minutes+'m ago'
    const hours=Math.floor(minutes/60)
    if(hours<24)return hours+'h ago'
    const days=Math.floor(hours/24)
    return days+'d ago'
  }

  return <div className="notification-center">
    <button className="icon-button notification-trigger" aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'} aria-expanded={open} onClick={()=>{setOpen(value=>!value);if(!open)void load()}}>
      <Bell size={18}/>
      {unread>0&&<span className="notification-badge">{unread>9?'9+':unread}</span>}
    </button>
    {open&&<div className="notification-popover">
      <div className="notification-header">
        <div><strong>Notifications</strong><span>{unread?unread+' unread':'All caught up'}</span></div>
        {unread>0&&<button className="text-button" onClick={markAllRead}>Mark all read</button>}
      </div>
      <div className="notification-list">
        {loading?<div className="notification-empty"><Clock3 size={18}/><span>Loading notifications…</span></div>:items.length===0?<div className="notification-empty"><Bell size={18}/><span>No notifications yet.</span></div>:items.map(item=><button key={item.id} className={'notification-item '+(!item.read_at?'unread':'')} onClick={()=>{if(!item.read_at)void markRead(item.id);onNavigate(item.target);setOpen(false)}}>
          <span className={'notification-dot '+item.type}></span>
          <span className="notification-body"><strong>{item.title}</strong><span>{item.message}</span><small>{relativeTime(item.created_at)}</small></span>
        </button>)}
      </div>
      {items.length>0&&<div className="notification-footer"><span>Showing your latest 30 notifications</span></div>}
    </div>}
  </div>
}

function App() {
  const initialRoute = getInitialWorkspaceRoute()
  const [sessionReady, setSessionReady] = useState(false)
  const [invitePending, setInvitePending] = useState(()=>new URLSearchParams(window.location.search).get('invite') === '1')
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']>(null)
  const [passwordRecovery, setPasswordRecovery] = useState(() => new URLSearchParams(window.location.search).get('reset') === '1' || window.location.hash.includes('type=recovery'))
  const [profile, setProfile] = useState<Profile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
    const [applications, setApplications] = useState<Application[]>([])
  const [screeningCount, setScreeningCount] = useState(0)
  const [deletingApplicationId, setDeletingApplicationId] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState<Application | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [active, setActive] = useState(initialRoute.active)
  const mainScrollRef = useRef<HTMLElement>(null)
  const [routeRestored, setRouteRestored] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [applicationStatusFilter, setApplicationStatusFilter] = useState<'all'|AppStatus>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null)
  const [detailTab, setDetailTab] = useState<'Overview'|'Form'|'Eligibility'|'Screening'|'Applicants'|'Reviews'|'Communications'>(initialRoute.tab)
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
  const [newParticipantPrefix, setNewParticipantPrefix] = useState('APP')
  const [importOpen, setImportOpen] = useState(false)
  const [leaderboardOpen,setLeaderboardOpen]=useState(false)
  const [leaderboardApplicationId,setLeaderboardApplicationId]=useState('')
  const [leaderboardRows,setLeaderboardRows]=useState<WorkspaceLeaderboardRow[]>([])
  const [leaderboardLoading,setLeaderboardLoading]=useState(false)
  const [leaderboardError,setLeaderboardError]=useState('')
  const [leaderboardQuery,setLeaderboardQuery]=useState('')
  const [leaderboardPage,setLeaderboardPage]=useState(1)
  const [leaderboardPageSize,setLeaderboardPageSize]=useState(50)

  useEffect(()=>{
    const frame=window.requestAnimationFrame(()=>{
      mainScrollRef.current?.scrollTo({top:0,left:0,behavior:'auto'})
      window.scrollTo({top:0,left:0,behavior:'auto'})
    })
    return()=>window.cancelAnimationFrame(frame)
  },[active,selectedApplication?.id,detailTab])

  async function loadWorkspace(currentSession = session) {
    if (!currentSession?.user) return
    setLoading(true); setError('')
    // Reconcile an accepted team invitation on the member's first authenticated workspace load.
    // This keeps Team Management in sync with Supabase Auth confirmation/sign-in state.
    await supabase.rpc('reconcile_my_team_invitation')
    let { data: p, error: pError } = await supabase.from('profiles').select('id,full_name,username,birth_month,birth_day,avatar_url,organization_id,role').eq('id', currentSession.user.id).maybeSingle()
    if (pError) { setError(friendlyErrorMessage(pError)); setLoading(false); return }
    if (!p) {
      const inviteMetadata=currentSession.user.user_metadata||{}
      const teamInviteToken=String(inviteMetadata.team_invite_token||'').trim()
      if(teamInviteToken){
        const {error:acceptError}=await supabase.rpc('accept_team_invite_link',{
          p_token:teamInviteToken,
          p_full_name:String(inviteMetadata.full_name||currentSession.user.email?.split('@')[0]||'Team member'),
          p_username:String(inviteMetadata.username||currentSession.user.email?.split('@')[0]||'member').toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,30),
          p_birth_month:Number(inviteMetadata.birth_month||1),
          p_birth_day:Number(inviteMetadata.birth_day||1)
        })
        if(acceptError){setError(friendlyErrorMessage(acceptError));setLoading(false);return}
        const {data:acceptedProfile,error:acceptedProfileError}=await supabase.from('profiles').select('id,full_name,username,birth_month,birth_day,avatar_url,organization_id,role').eq('id',currentSession.user.id).single()
        if(acceptedProfileError){setError(friendlyErrorMessage(acceptedProfileError));setLoading(false);return}
        p=acceptedProfile
        await supabase.auth.updateUser({data:{...inviteMetadata,team_invite_token:null}})
      }
    }
    if (!p) {
      const metadata = currentSession.user.user_metadata || {}
      const fullName = String(metadata.full_name || currentSession.user.email?.split('@')[0] || 'Workspace owner').trim()
      const usernameBase = String(metadata.username || currentSession.user.email?.split('@')[0] || 'user').trim().toLowerCase().replace(/[^a-z0-9_]/g,'').slice(0,30)
      const username = usernameBase.length >= 3 ? usernameBase : `user_${currentSession.user.id.slice(0,8)}`
      const organizationName = String(metadata.organization_name || 'ApplyFlow Workspace').trim() || 'ApplyFlow Workspace'
      const slugBase = organizationName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'applyflow'
      const slug = slugBase + '-' + currentSession.user.id.slice(0, 8)
      const { data: org, error: orgError } = await supabase.from('organizations').insert({ name: organizationName, slug, created_by: currentSession.user.id }).select('id,name,slug,avatar_url').single()
      if (orgError) { setError(friendlyErrorMessage(orgError)); setLoading(false); return }
      const { data: createdProfile, error: profileError } = await supabase.from('profiles').insert({ id: currentSession.user.id, full_name: fullName, username, birth_month: (metadata.birth_month as number | undefined) ?? null, birth_day: (metadata.birth_day as number | undefined) ?? null, avatar_url: null, organization_id: org.id, role: 'owner' }).select('id,full_name,username,birth_month,birth_day,avatar_url,organization_id,role').single()
      if (profileError) { setError(friendlyErrorMessage(profileError)); setLoading(false); return }
      p = createdProfile
    }
    setProfile(p)
    if (p.organization_id) {
      const [{ data: org, error: oError }, { data: apps, error: aError }] = await Promise.all([
        supabase.from('organizations').select('id,name,slug,avatar_url').eq('id', p.organization_id).single(),
        supabase.from('applications').select('id,name,description,status,deadline,target_count,participant_id_prefix,created_at').eq('organization_id', p.organization_id).order('created_at', { ascending: false }),
      ])
      if (oError) setError(friendlyErrorMessage(oError)); else setOrganization(org)
      if (aError) setError(friendlyErrorMessage(aError))
      else {
        const nextApplications = apps ?? []
        setApplications(nextApplications)
        if (nextApplications.length) {
          const { count, error: screeningCountError } = await supabase
            .from('submissions')
            .select('id', { count: 'exact', head: true })
            .in('application_id', nextApplications.map(application => application.id))
            .eq('status', 'submitted')
            .eq('decision', 'pending')
          if (screeningCountError) setError(friendlyErrorMessage(screeningCountError))
          else setScreeningCount(count ?? 0)
        } else {
          setScreeningCount(0)
        }
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
        let restoredSession = data.session
        if (restoredSession) {
          const { data: activeSession, error: activeSessionError } = await supabase.rpc('current_session_is_active')
          if (activeSessionError || activeSession !== true) {
            await supabase.auth.signOut({ scope: 'local' })
            restoredSession = null
          }
        }
        setSession(restoredSession)
        if (restoredSession && !invitePending) await loadWorkspace(restoredSession)
      } catch (err) {
        // Keep public pages usable if Supabase is unavailable, but surface the error
        // when the app needs an authenticated workspace.
        setError(friendlyErrorMessage(err,'Could not connect to the authentication service.'))
      } finally {
        setSessionReady(true)
      }
    }

    const { data: listener } = supabase.auth.onAuthStateChange((event, next) => {
      // Supabase may emit INITIAL_SESSION, SIGNED_IN and TOKEN_REFRESHED more than
      // once during a browser session, including when a background tab becomes
      // active again. Those events must not remount the whole workspace: doing so
      // resets the active module's local state, filters, pagination, modals and scroll.
      //
      // Workspace hydration is handled explicitly by restoreSession() on a real page
      // start and by AuthScreen.onSignedIn after an intentional login.
      setSession(next)
      if (event === 'PASSWORD_RECOVERY') {
        setPasswordRecovery(true)
        return
      }
      if (event === 'SIGNED_OUT') {
        setProfile(null)
        setOrganization(null)
        setApplications([])
        setScreeningCount(0)
        setLoading(false)
        setRouteRestored(false)
      }
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

  const filtered = useMemo(() => applications.filter(a => a.name.toLowerCase().includes(query.toLowerCase()) && (applicationStatusFilter==='all'||a.status===applicationStatusFilter)), [applications, query, applicationStatusFilter])
  const totalTarget = applications.reduce((sum,a)=>sum+(a.target_count ?? 0),0)
  const profileName = profile?.full_name || session?.user.email?.split('@')[0] || 'there'
  const firstName = profileName.split(' ')[0]
  const canManageProgrammes = profile?.role==='owner' || profile?.role==='admin'
  const filteredLeaderboardRows=useMemo(()=>{
    const q=leaderboardQuery.trim().toLowerCase()
    if(!q)return leaderboardRows
    return leaderboardRows.filter(row=>(row.full_name||'').toLowerCase().includes(q)||row.participant_id.toLowerCase().includes(q))
  },[leaderboardRows,leaderboardQuery])
  const leaderboardPageCount=Math.max(1,Math.ceil(filteredLeaderboardRows.length/leaderboardPageSize))
  const currentLeaderboardPage=Math.min(leaderboardPage,leaderboardPageCount)
  const pagedWorkspaceLeaderboard=filteredLeaderboardRows.slice((currentLeaderboardPage-1)*leaderboardPageSize,currentLeaderboardPage*leaderboardPageSize)

  if (window.location.pathname === '/join') return <TeamInviteLinkSignup token={new URLSearchParams(window.location.search).get('token')||''} />
  if (window.location.pathname.startsWith('/attendance/')) return <PublicAttendanceCheckIn slug={decodeURIComponent(window.location.pathname.split('/')[2] || '')} />
  if (window.location.pathname.startsWith('/results/')) return <PublicAssignmentResults slug={decodeURIComponent(window.location.pathname.split('/')[2] || '')} />
  if (window.location.pathname.startsWith('/a/')) return <PublicAssignment slug={decodeURIComponent(window.location.pathname.split('/')[2] || '')} />
  if (window.location.pathname.startsWith('/apply/')) return <PublicApplication slug={decodeURIComponent(window.location.pathname.split('/')[2] || '')} />
  if (invitePending && session) return <InviteSetupScreen email={session.user.email || ''} onComplete={async () => {
    // Invitation links create a temporary authenticated session. Once profile
    // setup is complete, sign out so the member proves their new credentials.
    await supabase.auth.signOut()
    setSession(null)
    setProfile(null)
    setOrganization(null)
    setApplications([])
    setInvitePending(false)
    window.history.replaceState({}, '', '/login')
    setSessionReady(true)
  }} />
  if (window.location.pathname === '/login' && passwordRecovery && session) return <ResetPasswordScreen onComplete={async () => {
    await supabase.auth.signOut({ scope: 'global' })
    setSession(null)
    setPasswordRecovery(false)
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

  function requestDeleteApplication(application:Application) {
    if(!canManageProgrammes||deletingApplicationId)return
    setDeleteError('')
    setDeleteCandidate(application)
  }

  async function deleteApplication(application:Application) {
    if(!canManageProgrammes||deletingApplicationId)return
    setDeletingApplicationId(application.id)
    try{
      const {data:storageRows,error:storageListError}=await supabase.rpc('list_programme_storage_paths',{p_application_id:application.id})
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
          if(removeError)throw new Error('Private file cleanup failed. Programme data was not deleted. '+removeError.message)
        }
      }
      const {error}=await supabase.rpc('delete_application',{p_application_id:application.id})
      if(error)throw error
      setApplications(current=>current.filter(item=>item.id!==application.id))
      if(selectedApplication?.id===application.id)closeApplication()
      setDeleteCandidate(null)
      setDeleteError('')
    }catch(e){
      setDeleteError(String((e as any)?.message || (e as any)?.details || (e as any)?.hint || e || 'Could not delete this application. Please try again.'))
    }finally{setDeletingApplicationId('')}
  }

  async function loadWorkspaceLeaderboard(applicationId:string){
    if(!applicationId){setLeaderboardRows([]);return}
    setLeaderboardLoading(true);setLeaderboardError('')
    try{
      const {data,error}=await supabase.rpc('get_assignment_leaderboard',{p_application_id:applicationId})
      if(error)throw error
      setLeaderboardRows((data||[]) as WorkspaceLeaderboardRow[])
    }catch(e){setLeaderboardRows([]);setLeaderboardError(friendlyErrorMessage(e,'Could not load the programme leaderboard.'))}
    finally{setLeaderboardLoading(false)}
  }

  function openWorkspaceLeaderboard(){
    const preferred=selectedApplication?.id||leaderboardApplicationId||applications[0]?.id||''
    setLeaderboardApplicationId(preferred)
    setLeaderboardQuery('')
    setLeaderboardPage(1)
    setLeaderboardOpen(true)
    if(preferred)void loadWorkspaceLeaderboard(preferred)
  }

  function changeLeaderboardProgramme(applicationId:string){
    setLeaderboardApplicationId(applicationId)
    setLeaderboardPage(1)
    setLeaderboardQuery('')
    void loadWorkspaceLeaderboard(applicationId)
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
      if (patch.status === 'published') {
        if (!selectedApplication.participant_id_prefix?.trim()) throw new Error('Set a Participant ID prefix before publishing this programme.')
        const {data:settings,error:settingsError}=await supabase.from('application_settings').select('public_slug').eq('application_id',selectedApplication.id).single()
        if (settingsError) throw settingsError
        if (!settings?.public_slug?.trim()) throw new Error('Set a public application slug before publishing this programme.')
        const {count,error:formError}=await supabase.from('form_versions').select('id',{count:'exact',head:true}).eq('application_id',selectedApplication.id).eq('status','published')
        if (formError) throw formError
        if (!count) throw new Error('Publish the application form first. The programme cannot be opened to applicants without a published form.')
      }
      const { data, error: updateError } = await supabase.from('applications')
        .update({ ...patch, participant_id_prefix: patch.participant_id_prefix?.trim().toUpperCase(), updated_at: new Date().toISOString() })
        .eq('id', selectedApplication.id)
        .select('id,name,description,status,deadline,target_count,participant_id_prefix,created_at')
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
      setDetailError(friendlyErrorMessage(err,'Could not save changes.'))
    } finally { setDetailSaving(false) }
  }

  function openCreate(mode: 'application'|'form' = 'application') {
    if (!canManageProgrammes) return
    setCreateMode(mode); setCreateError(''); setNewName(''); setNewDescription(''); setNewDeadline(''); setNewTarget(''); setNewParticipantPrefix('APP'); setCreateOpen(true)
  }
  function openGoogleFormImport(){ if (canManageProgrammes) setImportOpen(true) }

  async function createApplication(e: React.FormEvent) {
    e.preventDefault()
    if (!canManageProgrammes) { setCreateError('Only an Owner or Admin can create programmes.'); return }
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
          participant_id_prefix: newParticipantPrefix.trim().toUpperCase() || 'APP',
          status: 'draft',
        })
        .select('id,name,description,status,deadline,target_count,participant_id_prefix,created_at')
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
      setCreateError(friendlyErrorMessage(err,'Could not create the application.'))
    } finally {
      setCreating(false)
    }
  }

  return <div className="app-shell">
    <aside className={sidebarOpen ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><div className="brand-mark">A</div><div><strong>ApplyFlow</strong><span>Application OS</span></div><button className="mobile-close" onClick={()=>setSidebarOpen(false)} aria-label="Close menu"><X size={18}/></button></div>
      <div className="workspace-switcher"><div className="workspace-avatar">{organization?.avatar_url?<img src={organization.avatar_url} alt="" />:(organization?.name || 'A').charAt(0).toUpperCase()}</div><div className="workspace-copy"><strong>{organization?.name || 'Your organisation'}</strong><span>Organisation</span></div><ChevronDown size={16} className="muted-icon"/></div>
      <nav className="nav-group"><p className="nav-label">Workspace</p>{(profile?.role==='reviewer'?nav.filter(item=>item.label==='Dashboard'||item.label==='Reviews'||item.label==='Participants'):nav).map(({label,icon:Icon})=><button key={label} className={active===label?'nav-item active':'nav-item'} onClick={()=>{closeApplication();setActive(label);setSidebarOpen(false)}}><Icon size={18}/><span>{label}</span>{label==='Screening'&&<span className="nav-count">{screeningCount}</span>}</button>)}</nav>
      <nav className="nav-group bottom"><p className="nav-label">{profile?.role==='reviewer'?'Account':'Manage'}</p>{(profile?.role==='reviewer'?bottomNav.filter(item=>item.label==='Settings'):bottomNav).map(({label,icon:Icon})=><button key={label} className={active===label?'nav-item active':'nav-item'} onClick={()=>{closeApplication();setActive(label);setSidebarOpen(false)}}><Icon size={18}/><span>{label}</span></button>)}</nav>
      <div className="sidebar-footer"><div className="help-card"><Sparkles size={17}/><div><strong>AI screening</strong><span>Advisory screening · human decision</span></div></div><div className="profile-row"><div className="profile-avatar">{profile?.avatar_url?<img src={profile.avatar_url} alt="" />:profileName.slice(0,2).toUpperCase()}</div><div><strong>{profileName}</strong><span>{profile?.username ? '@'+profile.username : profile?.role==='reviewer'?'Programme Staff':profile?.role || 'Owner'}</span></div><button className="icon-button" onClick={signOut} aria-label="Sign out"><LogOut size={15}/></button></div></div>
    </aside>
    <main ref={mainScrollRef} className="main"><header className="topbar"><button className="mobile-menu" onClick={()=>setSidebarOpen(true)} aria-label="Open menu"><Menu size={20}/></button><div className="breadcrumbs"><span>Workspace</span><span>/</span><strong>{active}</strong></div><div className="top-actions"><button type="button" className="top-leaderboard-button" onClick={openWorkspaceLeaderboard} aria-label="Open programme leaderboard"><TrendingUp size={15}/><span>Leaderboard</span></button><NotificationCenter userId={session?.user?.id||""} onNavigate={(target)=>setActive(target as typeof active)} /><ThemeToggle/><div className="top-avatar">{profile?.avatar_url?<img src={profile.avatar_url} alt="" />:profileName.slice(0,2).toUpperCase()}</div></div></header>
      <div className="content">
        {selectedApplication ? <ApplicationDetails application={selectedApplication} settings={applicationSettings} tab={detailTab} setTab={setDetailTab} loading={detailLoading} saving={detailSaving} error={detailError} onBack={closeApplication} onSave={saveApplicationDetails} /> : loading ? <div className="loading-card card">Loading your workspace…</div> : error ? <div className="form-error page-error">{error}</div> : active==='Dashboard' ? <>
          <section className="page-heading"><div><p className="eyebrow">Your workspace</p><h1>Good evening, {firstName}.</h1><p className="subtitle">Here’s what is happening across your programmes.</p></div>{canManageProgrammes&&<button className="primary-button" onClick={()=>openCreate()}><Plus size={17}/> New application</button>}</section>
          <section className="stats-grid dashboard-stats"><StatCard label="Programmes" value={applications.length.toLocaleString()} note="In your workspace" icon={FolderKanban}/><StatCard label="Targets" value={totalTarget.toLocaleString()} note="Across programmes" icon={FileCheck2}/><StatCard label="Published" value={applications.filter(a=>a.status==='published').length.toLocaleString()} note="Currently accepting" icon={ShieldCheck}/><StatCard label="Screening" value={applications.filter(a=>a.status==='screening').length.toLocaleString()} note="In review" icon={Users}/></section>
          <section className="dashboard-grid dashboard-panels"><div className="card table-card"><div className="card-header"><div><h2>Programmes</h2><p>Your application programmes from Supabase.</p></div>{canManageProgrammes&&<button className="text-button" onClick={()=>setActive('Applications')}>View all</button>}</div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Target</th><th>Deadline</th><th></th></tr></thead><tbody>{applications.length===0?<tr><td colSpan={4}><div className="table-empty">No programmes yet. Create your first application programme.</div></td></tr>:applications.map(item=><tr key={item.id}><td><strong>{item.name}</strong><span className="table-sub">{item.description || 'No description yet.'}</span></td><td><span className={'status '+(item.status==='published'?'blue':item.status==='screening'?'amber':item.status==='completed'?'green':'neutral')}>{statusLabel(item.status)}</span></td><td>{(item.target_count??0).toLocaleString()}</td><td>{formatDate(item.deadline)}</td><td>{canManageProgrammes&&<button type="button" className="icon-button" title="Delete application" aria-label={'Delete '+item.name} disabled={deletingApplicationId===item.id} onClick={e=>{e.stopPropagation();requestDeleteApplication(item)}}><Trash2 size={16}/></button>}</td></tr>)}</tbody></table></div></div><div className="card funnel-card"><div className="card-header"><div><h2>Workspace health</h2><p>Live database connection</p></div><span className="status green">Connected</span></div><div className="connection-list"><div><span>Organisation</span><strong>{organization?.name || '—'}</strong></div><div><span>Role</span><strong>{profile?.role || '—'}</strong></div><div><span>Programmes</span><strong>{applications.length}</strong></div></div></div></section>
        </> : selectedApplication ? <ApplicationDetails application={selectedApplication} settings={applicationSettings} tab={detailTab} setTab={setDetailTab} loading={detailLoading} saving={detailSaving} error={detailError} onBack={closeApplication} onSave={saveApplicationDetails}/> : active==='Analytics' ? <AnalyticsPanel applications={applications}/> : active==='Applications' ? <section><div className="page-heading compact"><div><p className="eyebrow">Workspace</p><h1>Applications</h1><p className="subtitle">Manage your application programmes.</p></div>{canManageProgrammes&&<div className="detail-actions"><button className="secondary-button" onClick={openGoogleFormImport}><Download size={16}/> Import Google Form</button><button className="primary-button" onClick={()=>openCreate()}><Plus size={17}/> New application</button></div>}</div><div className="card table-card"><div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search applications…"/></div><label className="toolbar-select" aria-label="Filter applications by status"><select value={applicationStatusFilter} onChange={e=>setApplicationStatusFilter(e.target.value as 'all'|AppStatus)}><option value="all">All status</option><option value="draft">Draft</option><option value="published">Published</option><option value="screening">Screening</option><option value="closed">Closed</option><option value="completed">Completed</option></select><ChevronDown size={15}/></label></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Status</th><th>Target</th><th>Deadline</th><th>Action</th></tr></thead><tbody>{filtered.map(item=><tr key={item.id} onClick={()=>openApplication(item)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openApplication(item)}}} tabIndex={0} role="button" aria-label={'Open '+item.name} className="clickable-row"><td><strong>{item.name}</strong><span className="table-sub">{item.description || 'No description yet.'}</span></td><td><span className={'status '+(item.status==='published'?'blue':item.status==='screening'?'amber':item.status==='completed'?'green':'neutral')}>{statusLabel(item.status)}</span></td><td>{(item.target_count??0).toLocaleString()}</td><td>{formatDate(item.deadline)}</td><td>{canManageProgrammes&&<button type="button" className="icon-button" title="Delete application" aria-label={'Delete '+item.name} disabled={deletingApplicationId===item.id} onClick={e=>{e.stopPropagation();requestDeleteApplication(item)}}><Trash2 size={16}/></button>}</td></tr>)}</tbody></table></div></div></section> : active==='Forms' ? <FormsWorkspace applications={applications} onOpen={a=>openWorkspaceModule(a,'Form')} onCreate={canManageProgrammes?()=>openCreate('form'):undefined}/> : active==='Screening' ? <ScreeningWorkspace applications={applications} role={profile?.role} onOpen={a=>openWorkspaceModule(a,'Screening')}/> : active==='Reviews' ? <ReviewsWorkspace applications={applications} organizationId={organization!.id} role={profile?.role} onOpen={a=>openWorkspaceModule(a,'Reviews')}/> : active==='Participants' ? <ParticipantsPanel organizationId={organization!.id} applications={applications} role={profile?.role}/> : (active==='Email'||active==='Communications') ? <CommunicationsWorkspace organizationId={organization!.id} applications={applications} role={profile?.role}/> : active==='Team' ? <TeamWorkspace organizationId={organization!.id} role={profile?.role}/> : active==='Settings' ? <SettingsWorkspace organization={organization} profile={profile} onSaved={name=>setOrganization(x=>x?{...x,name}:x)} onOrganizationSaved={next=>setOrganization(x=>x?{...x,...next}:x)} onProfileSaved={next=>setProfile(p=>p?{...p,...next}:p)}/> : <section><div className="page-heading compact"><div><p className="eyebrow">Workspace</p><h1>{active}</h1><p className="subtitle">This module is ready for implementation.</p></div></div><div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>No records yet</h2><p>Create a programme to start using this workspace.</p></div></section>}
      </div>
    </main>
    {leaderboardOpen&&<div className="modal-backdrop workspace-leaderboard-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setLeaderboardOpen(false)}}>
      <div className="card workspace-leaderboard-modal" role="dialog" aria-modal="true" aria-labelledby="workspace-leaderboard-title">
        <div className="workspace-leaderboard-header">
          <div><p className="eyebrow">Programme performance</p><h2 id="workspace-leaderboard-title">Leaderboard</h2><p>Running standings across assignments, attendance and bonus points.</p></div>
          <button type="button" className="icon-button" onClick={()=>setLeaderboardOpen(false)} aria-label="Close leaderboard"><X size={18}/></button>
        </div>
        <div className="workspace-leaderboard-toolbar">
          <label className="workspace-leaderboard-programme"><span>Programme</span><div className="toolbar-select"><select value={leaderboardApplicationId} onChange={e=>changeLeaderboardProgramme(e.target.value)}><option value="">Select programme</option>{applications.map(application=><option key={application.id} value={application.id}>{application.name}</option>)}</select><ChevronDown size={15}/></div></label>
          <div className="search workspace-leaderboard-search"><Search size={16}/><input value={leaderboardQuery} onChange={e=>{setLeaderboardQuery(e.target.value);setLeaderboardPage(1)}} placeholder="Search name or Participant ID…"/></div>
          <div className="workspace-leaderboard-count"><strong>{filteredLeaderboardRows.length}</strong><span>participant{filteredLeaderboardRows.length===1?'':'s'}</span></div>
        </div>
        {leaderboardError&&<div className="form-error workspace-leaderboard-error">{leaderboardError}</div>}
        <div className="workspace-leaderboard-body">
          {!leaderboardApplicationId?<div className="table-empty">Select a programme to view its leaderboard.</div>:leaderboardLoading?<div className="loading-card">Loading leaderboard…</div>:filteredLeaderboardRows.length?<div className="table-wrap workspace-leaderboard-table"><table>
            <thead><tr><th>Rank</th><th>Participant</th><th>Assignment points</th><th>Attendance points</th><th>Bonus points</th><th>Total points</th></tr></thead>
            <tbody>{pagedWorkspaceLeaderboard.map(row=><tr key={row.participant_record_id}><td><strong>{row.rank?'#'+row.rank:'—'}</strong></td><td><strong>{row.full_name||row.participant_id}</strong><span className="table-sub">{row.participant_id}</span></td><td>{Number(row.assignment_points||0).toFixed(0)}</td><td>{Number(row.attendance_points||0).toFixed(0)}</td><td>{Number(row.bonus_points||0).toFixed(0)}</td><td><strong>{Number(row.total_points||0).toFixed(0)}</strong><span className="table-sub">{row.graded_assignments}/{row.total_assignments} released assignments</span></td></tr>)}</tbody>
          </table></div>:<div className="table-empty">No participants match this leaderboard view.</div>}
        </div>
        {leaderboardApplicationId&&!leaderboardLoading&&filteredLeaderboardRows.length>0&&<TablePagination total={filteredLeaderboardRows.length} page={currentLeaderboardPage} pageSize={leaderboardPageSize} onPageChange={setLeaderboardPage} onPageSizeChange={size=>{setLeaderboardPageSize(size);setLeaderboardPage(1)}}/>}
      </div>
    </div>}
    {canManageProgrammes && importOpen && <GoogleFormImport applications={applications} organizationId={organization!.id} onClose={()=>setImportOpen(false)} />}
    {canManageProgrammes && deleteCandidate && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setDeleteCandidate(null)}}>
      <div className="modal card" role="dialog" aria-modal="true" aria-labelledby="delete-application-title">
        <div className="modal-header"><div><p className="eyebrow">Delete programme</p><h2 id="delete-application-title">Delete “{deleteCandidate.name}”?</h2><p>This will permanently delete the programme, its form versions, questions, applicants and submissions. This action cannot be undone.</p>{deleteError && <div className="form-error">{deleteError}</div>}</div><button type="button" className="icon-button" onClick={()=>setDeleteCandidate(null)} aria-label="Close"><X size={18}/></button></div>
        <div className="modal-footer"><button type="button" className="secondary-button" onClick={()=>{setDeleteCandidate(null);setDeleteError('')}} disabled={deletingApplicationId===deleteCandidate.id}>Cancel</button><button type="button" className="primary-button" onClick={()=>void deleteApplication(deleteCandidate)} disabled={deletingApplicationId===deleteCandidate.id}>{deletingApplicationId===deleteCandidate.id?'Deleting…':'Delete programme'}</button></div>
      </div>
    </div>}
    {canManageProgrammes && createOpen && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setCreateOpen(false)}}>
      <form className="modal card" onSubmit={createApplication}>
        <div className="modal-header"><div><p className="eyebrow">{createMode==='form'?'New form':'New programme'}</p><h2>{createMode==='form'?'Create a Form':'Create a Programme'}</h2><p>{createMode==='form'?'Create the questionnaire applicants will complete. You can add questions immediately after it is created.':'Create the programme that owns the application form, deadline and target.'}</p></div><button type="button" className="icon-button" onClick={()=>setCreateOpen(false)} aria-label="Close"><X size={18}/></button></div>
        <div className="modal-form">
          <label>{createMode==='form'?'Form name':'Programme name'}<input autoFocus value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Women Artisans Application Form" required /></label>
          <label>Description <span className="optional">Optional</span><textarea value={newDescription} onChange={e=>setNewDescription(e.target.value)} placeholder={createMode==='form'?'Briefly describe what this form is for.':'Briefly describe who this programme is for and what it offers.'} rows={4}/></label>
          {createMode==='application'&&<><div className="form-grid"><label>Participant ID prefix<input value={newParticipantPrefix} onChange={e=>setNewParticipantPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,''))} maxLength={20} placeholder="ECA" /><small className="field-help">First part of each Participant ID, e.g. ECA-2026-00001.</small></label><label>Application deadline <span className="optional">Optional</span><input type="date" className="date-picker-input" onClick={e=>{try{e.currentTarget.showPicker?.()}catch{}}} value={newDeadline} onChange={e=>setNewDeadline(e.target.value)} /></label><label>Target number <span className="optional">Optional</span><input type="number" min="0" value={newTarget} onChange={e=>setNewTarget(e.target.value)} placeholder="150" /></label></div></>}
          {createError && <div className="form-error">{createError}</div>}
        </div>
        <div className="modal-footer"><button type="button" className="secondary-button" onClick={()=>setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={creating}>{creating?'Creating…':createMode==='form'?'Create Form':'Create Programme'}</button></div>
      </form>
    </div>}
  </div>
}

function ApplicantsPanel({applicationId}:{applicationId:string}) {
  type Row={id:string;applicant_id:string;participant_id:string|null;full_name:string|null;email:string|null;status:string;submitted_at:string|null;created_at:string}
  const [rows,setRows]=useState<Row[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[query,setQuery]=useState(''),[statusFilter,setStatusFilter]=useState<'all'|'submitted'|'draft'>('all'),[selected,setSelected]=useState<Row|null>(null)
  const [answerRows,setAnswerRows]=useState<{label:string;value:string}[]>([])
  useEffect(()=>{(async()=>{try{
    const {data,error}=await supabase.from('submissions').select('id,applicant_id,status,submitted_at,created_at,applicants!inner(full_name,email,participant_id)').eq('application_id',applicationId).order('submitted_at',{ascending:false})
    if(error)throw error
    setRows((data||[]).map((r:any)=>({id:r.id,applicant_id:r.applicant_id,participant_id:r.applicants?.participant_id||null,status:r.status,submitted_at:r.submitted_at,created_at:r.created_at,full_name:r.applicants?.full_name||null,email:r.applicants?.email||null})))
  }catch(e){setError(friendlyErrorMessage(e,'Could not load applications.'))}finally{setLoading(false)}})()},[applicationId])
  const filtered=useMemo(()=>rows.filter(r=>{const haystack=[r.participant_id,r.full_name,r.email,r.status].filter(Boolean).join(' ').toLowerCase();return(!query.trim()||haystack.includes(query.trim().toLowerCase()))&&(statusFilter==='all'||r.status===statusFilter)}),[rows,query,statusFilter])
  const submittedCount=rows.filter(r=>r.status==='submitted').length
  const draftCount=rows.filter(r=>r.status==='draft').length
  async function open(row:Row){
    setSelected(row);setAnswerRows([])
    const {data,error}=await supabase.from('answers').select('question_id,value').eq('submission_id',row.id)
    if(error){setError(friendlyErrorMessage(error));return}
    if(data?.length){const ids=data.map(x=>x.question_id);const {data:qs}=await supabase.from('questions').select('id,label').in('id',ids);const labels=new Map((qs||[]).map(q=>[q.id,q.label]));setAnswerRows(data.map(x=>({label:labels.get(x.question_id)||'Question',value:Array.isArray(x.value)?x.value.join(', '):String(x.value??'')})))}
  }
  if(loading)return <div className="loading-card card">Loading applications…</div>
  if(error)return <div className="form-error page-error">{error}</div>
  return <div className="applicants-panel">
    <div className="applicants-toolbar"><div><p className="eyebrow">Applications received</p><h2>{rows.length} submission{rows.length===1?'':'s'}</h2><p className="muted">Every submission keeps its own Participant ID.</p></div><div className="applicant-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search name, email or Participant ID"/></div></div>
    <div className="stats-grid" style={{marginBottom:16}}><div className="card stat-card"><div className="stat-icon"><FileCheck2 size={18}/></div><div><p className="eyebrow">Total</p><div className="stat-value">{rows.length}</div><p className="muted">All submissions</p></div></div><div className="card stat-card"><div className="stat-icon"><CheckCircle2 size={18}/></div><div><p className="eyebrow">Submitted</p><div className="stat-value">{submittedCount}</div><p className="muted">Ready for screening</p></div></div><div className="card stat-card"><div className="stat-icon"><Clock3 size={18}/></div><div><p className="eyebrow">Drafts</p><div className="stat-value">{draftCount}</div><p className="muted">Not yet submitted</p></div></div></div>
    <div className="card table-card"><div className="toolbar"><div className="forms-filters" role="group" aria-label="Filter applications"><button className={statusFilter==='all'?'filter-button active':'filter-button'} onClick={()=>setStatusFilter('all')}>All <span>{rows.length}</span></button><button className={statusFilter==='submitted'?'filter-button active':'filter-button'} onClick={()=>setStatusFilter('submitted')}>Submitted <span>{submittedCount}</span></button><button className={statusFilter==='draft'?'filter-button active':'filter-button'} onClick={()=>setStatusFilter('draft')}>Drafts <span>{draftCount}</span></button></div></div>
      {!filtered.length?<div className="empty-state"><div className="empty-icon"><Users size={22}/></div><h2>No applications found</h2><p>{rows.length?'Try another search or filter.':'Submitted applications will appear here.'}</p></div>:<div className="table-wrap"><table className="applicants-table"><thead><tr><th>Participant ID</th><th>Applicant</th><th>Email</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>{filtered.map(r=><tr key={r.id} onClick={()=>open(r)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open(r)}}} tabIndex={0} role="button" aria-label={'Open application for '+(r.full_name||r.participant_id||'applicant')}><td><strong>{r.participant_id||'—'}</strong></td><td><strong>{r.full_name||'Unnamed applicant'}</strong></td><td>{r.email||'—'}</td><td><span className={'status '+(r.status==='submitted'?'blue':'neutral')}>{statusLabel(r.status as AppStatus)}</span></td><td>{r.submitted_at?formatDate(r.submitted_at):'—'}</td><td><button className="text-button" onClick={e=>{e.stopPropagation();open(r)}}>View</button></td></tr>)}</tbody></table></div>}</div>
    {selected&&<div className="applicant-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><aside className="applicant-drawer"><div className="drawer-header"><div><p className="eyebrow">Application</p><h2>{selected.participant_id||'Application'}</h2><p>{selected.full_name||'Unnamed applicant'} · {selected.email||'No email provided'}</p></div><button className="icon-button" onClick={()=>setSelected(null)}><X size={18}/></button></div><div className="drawer-meta"><div><span>Applicant</span><strong>{selected.full_name||'Unnamed applicant'}</strong></div><div><span>Status</span><strong>{statusLabel(selected.status as AppStatus)}</strong></div><div><span>Submitted</span><strong>{selected.submitted_at?formatDate(selected.submitted_at):'—'}</strong></div></div><div className="drawer-section"><p className="eyebrow">Application answers</p>{answerRows.length?answerRows.map((a,i)=><div className="answer-item" key={i}><strong>{a.label}</strong><span>{a.value||'Not provided'}</span></div>):<p className="muted">No answers recorded.</p>}</div></aside></div>}
  </div>
}

function ApplicationDetails({ application, settings, tab, setTab, loading, saving, error, onBack, onSave }:{
  application: Application
  settings: {public_slug:string; confirmation_message:string} | null
  tab: 'Overview'|'Form'|'Eligibility'|'Screening'|'Applicants'|'Reviews'|'Communications'
  setTab: (tab:'Overview'|'Form'|'Eligibility'|'Screening'|'Applicants'|'Reviews'|'Communications') => void
  loading: boolean; saving: boolean; error: string; onBack:()=>void
  onSave:(patch:Partial<Application>, settingsPatch?:Partial<{public_slug:string;confirmation_message:string}>)=>Promise<void>
}) {
  const [name,setName]=useState(application.name), [description,setDescription]=useState(application.description||'')
  const [deadline,setDeadline]=useState(application.deadline||''), [target,setTarget]=useState(application.target_count?.toString()||''), [participantPrefix,setParticipantPrefix]=useState(application.participant_id_prefix||'APP')
  const [slug,setSlug]=useState(settings?.public_slug||''), [message,setMessage]=useState(settings?.confirmation_message||'')
  useEffect(()=>{setName(application.name);setDescription(application.description||'');setDeadline(application.deadline||'');setTarget(application.target_count?.toString()||'');setParticipantPrefix(application.participant_id_prefix||'APP')},[application])
  useEffect(()=>{setSlug(settings?.public_slug||'');setMessage(settings?.confirmation_message||'')},[settings])
  const tabs=['Overview','Form','Eligibility','Screening','Applicants','Reviews','Communications'] as const
  return <section className="application-detail">
    <button className="back-link" onClick={onBack}>← Back to applications</button>
    <div className="detail-header"><div><p className="eyebrow">Application programme</p><div className="detail-title-row"><h1>{application.name}</h1><span className={'status '+(application.status==='published'?'blue':application.status==='screening'?'amber':'neutral')}>{statusLabel(application.status)}</span></div><p className="subtitle">{application.description||'No description yet.'}</p></div><div className="detail-actions">{application.status==='draft'&&<button className="primary-button" disabled={saving} onClick={()=>onSave({status:'published'})}>Publish programme</button>}{application.status==='published'&&<><button className="secondary-button" disabled={saving} onClick={()=>onSave({status:'draft'})}>Unpublish</button><button className="secondary-button" disabled={saving} onClick={()=>onSave({status:'closed'})}>Close applications</button></>}</div></div>
    <div className="detail-meta"><div><span>Deadline</span><strong>{formatDate(application.deadline)}</strong></div><div><span>Target</span><strong>{application.target_count?.toLocaleString()||'Not set'}</strong></div><div><span>Participant ID format</span><strong>{application.participant_id_prefix}-2026-00001</strong></div><div><span>Public URL</span><strong>/apply/{settings?.public_slug||'not-configured'}</strong></div></div>
    <div className="detail-tabs">{tabs.map(t=><button key={t} className={tab===t?'detail-tab active':'detail-tab'} onClick={()=>setTab(t)}>{t}</button>)}</div>
    {loading?<div className="loading-card card">Loading programme settings…</div>:error?<div className="form-error page-error">{error}</div>:tab==='Overview'?<div className="detail-grid">
      <div className="card detail-card"><div className="card-header"><div><h2>Programme details</h2><p>Update the basic information for this programme.</p></div></div><div className="detail-form"><label>Programme name<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Participant ID prefix<input value={participantPrefix} onChange={e=>setParticipantPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,''))} maxLength={20} placeholder="ECA"/><small className="field-help">This becomes the first part of every Participant ID for this programme.</small></label><label>Description<textarea rows={5} value={description} onChange={e=>setDescription(e.target.value)}/></label><div className="form-grid"><label>Application deadline<input type="date" className="date-picker-input" onClick={e=>{try{e.currentTarget.showPicker?.()}catch{}}} value={deadline} onChange={e=>setDeadline(e.target.value)}/></label><label>Target number<input type="number" min="0" value={target} onChange={e=>setTarget(e.target.value)}/></label></div><div className="detail-form-footer"><button className="primary-button" disabled={saving} onClick={()=>onSave({name:name.trim(),description:description.trim()||null,deadline:deadline||null,target_count:target?Number(target):null,participant_id_prefix:participantPrefix.trim().toUpperCase()||'APP'})}>{saving?'Saving…':'Save changes'}</button></div></div></div>
      <div className="card detail-card"><div className="card-header"><div><h2>Public application</h2><p>Settings applicants will see.</p></div></div><div className="detail-form"><label>Public slug<input value={slug} onChange={e=>setSlug(e.target.value)}/></label><label>Confirmation message<textarea rows={5} value={message} onChange={e=>setMessage(e.target.value)}/></label><div className="detail-form-footer"><button className="secondary-button" disabled={saving} onClick={()=>onSave({}, {public_slug:slug.trim(),confirmation_message:message.trim()||'Thank you. Your application has been received.'})}>Save public settings</button></div></div></div>
    </div>:tab==='Form'?<FormBuilder applicationId={application.id}/>:tab==='Applicants'?<ApplicantsPanel applicationId={application.id}/>:tab==='Eligibility'?<EligibilityBuilder applicationId={application.id}/>:tab==='Screening'?<ScreeningPanel applicationId={application.id}/>:tab==='Reviews'?<ReviewsPanel applicationId={application.id}/>:tab==='Communications'?<CommunicationsPanel applicationId={application.id}/>:<div className="empty-state card"><div className="empty-icon"><Sparkles size={22}/></div><h2>{tab} is next</h2><p>This section is connected to the programme workspace and will be built on the live data model.</p></div>}
  </section>
}

type QuestionType='short_text'|'long_text'|'email'|'phone'|'number'|'date'|'dropdown'|'single_choice'|'multiple_choice'|'yes_no'|'nigeria_state'|'nigeria_lga'|'file'|'image'|'rating'
type BuilderOption={id:string;label:string;value:string;position:number}
type BuilderQuestion={id:string;type:QuestionType;label:string;description:string|null;required:boolean;placeholder:string|null;position:number;config:Record<string,unknown>;conditional_rules:ConditionRule[]|null;options:BuilderOption[]}
type ConditionRule={question_id:string;operator:'equals'|'not_equals';value:string}
function normalizeConditionalRules(value:unknown):ConditionRule[]{
  if(!Array.isArray(value))return []
  return value.filter((rule:any)=>rule&&typeof rule==='object'&&typeof rule.question_id==='string'&&typeof rule.value==='string').map((rule:any)=>({
    question_id:rule.question_id,
    operator:rule.operator==='not_equals'?'not_equals':'equals',
    value:rule.value,
  }))
}
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
        const full=await Promise.all((qs||[]).map(async q=>{const {data:o,error:oe}=await supabase.from('question_options').select('id,label,value,position').eq('question_id',q.id).order('position');if(oe)throw oe;return {...q,conditional_rules:normalizeConditionalRules(q.conditional_rules),options:o||[]}}))
        setQuestions(full as BuilderQuestion[])
      } else setQuestions([])
      const {data:rs,error:re}=await supabase.from('eligibility_rules').select('id,application_id,question_id,operator,value,logic,position,enabled').eq('application_id',applicationId).order('position')
      if(re)throw re
      setRules((rs||[]).map((r:any)=>({...r,operator:r.operator==='IN'||r.operator==='NOT IN'?'in':r.operator==='between'?'between':'=',logic:'AND'})) as EligibilityRule[])
    }catch(e){setNotice(friendlyErrorMessage(e,'Could not load eligibility rules.'))}finally{setLoading(false)}
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

type ReviewRow={id:string;submission_id:string;reviewer_id:string;status:'assigned'|'in_progress'|'completed';notes:string|null;created_at:string;updated_at:string}

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
  const {data,error}=await supabase.from('review_assignments').select('id,submission_id,reviewer_id,status,notes,created_at,updated_at').order('created_at',{ascending:false})
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
  const {error}=await supabase.rpc('assign_review_submission',{p_submission_id:selected,p_reviewer_id:reviewer})
  if(error)setNotice(error.message);else{setNotice('Review assigned.');setSelected('');setReviewer('');await load()}
  setBusy(false)
 }

 async function updateReview(id:string,patch:Partial<ReviewRow>){
  const current=reviews.find(r=>r.id===id)
  if(!current)return
  const status=(patch.status||current.status) as ReviewRow['status']
  const notes=patch.notes===undefined?current.notes:patch.notes
  const {data,error}=await supabase.rpc('update_review_assignment',{p_assignment_id:id,p_status:status,p_score:null,p_notes:notes})
  if(error)setNotice(error.message);else setReviews(x=>x.map(r=>r.id===id?data as ReviewRow:r))
 }

 async function openHistory(review:ReviewRow){
  setHistoryReview(review)
  const {data,error}=await supabase.from('review_audit_logs').select('id,action,from_status,to_status,actor_id,metadata,created_at').eq('review_assignment_id',review.id).order('created_at',{ascending:false})
  if(error)setNotice(error.message);else setHistory(data||[])
 }

 const isAdmin=role==='owner'||role==='admin'
 return <div className="reviews-panel">
  <div className="builder-top"><div><p className="eyebrow">Reviews</p><h2>{isAdmin?'Reviewer assignments':'My review queue'}</h2><p>{isAdmin?'Assign applications to reviewers and track their review progress.':'Review the applications assigned to you. Your updates are recorded in the review history.'}</p></div>{notice&&<span className="builder-notice">{notice}</span>}</div>
  {isAdmin&&<div className="card review-assign-card"><div><p className="eyebrow">Assign a review</p><h3>Send an application to a reviewer</h3></div><div className="review-assign-grid"><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select application…</option>{submissions.map(s=><option key={s.id} value={s.id}>{s.applicants?.full_name||s.applicants?.email||'Unnamed applicant'}</option>)}</select><select value={reviewer} onChange={e=>setReviewer(e.target.value)}><option value="">Select reviewer…</option>{reviewers.map(p=><option key={p.id} value={p.id}>{p.full_name||'Reviewer'}</option>)}</select><button className="primary-button" disabled={busy||!selected||!reviewer} onClick={assign}><Plus size={14}/> Assign</button></div></div>}
  {!reviews.length?<div className="card builder-empty"><ClipboardList size={24}/><h3>{isAdmin?'No review assignments yet':'No reviews assigned to you'}</h3><p>{isAdmin?'Once applications are submitted, assign them to members of your review team.':'When an admin assigns an application to you, it will appear here.'}</p></div>:<div className="card reviews-table"><div className="review-table-head"><span>Applicant</span><span>Reviewer</span><span>Status</span><span>Notes</span></div>{reviews.map(r=>{const s=submissions.find(x=>x.id===r.submission_id),p=reviewers.find(x=>x.id===r.reviewer_id);return <div className="review-table-row" key={r.id}><span><strong>{s?.applicants?.full_name||'Unnamed'}</strong><small>{s?.applicants?.email||''}</small></span><span>{p?.full_name||'Reviewer'}</span><select value={r.status} onChange={e=>updateReview(r.id,{status:e.target.value as ReviewRow['status']})}><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select><div className="review-notes-cell"><input value={r.notes||''} placeholder="Reviewer notes" onChange={e=>updateReview(r.id,{notes:e.target.value||null})}/><button className="text-button" onClick={()=>openHistory(r)}>History</button></div></div>})}</div>}
  {historyReview&&<div className="screening-drawer-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setHistoryReview(null)}}><aside className="screening-drawer card"><div className="preview-header"><div><p className="eyebrow">Review history</p><h2>{submissions.find(x=>x.id===historyReview.submission_id)?.applicants?.full_name||'Applicant'}</h2><p>{reviewers.find(x=>x.id===historyReview.reviewer_id)?.full_name||'Reviewer'}</p></div><button className="icon-button" onClick={()=>setHistoryReview(null)}><X size={18}/></button></div>{!history.length?<div className="builder-empty"><ClipboardList size={22}/><h3>No history yet</h3><p>Changes to this review will appear here.</p></div>:<div className="screening-detail">{history.map((item:any)=><div className="connection-list" key={item.id}><div><span>Action</span><strong>{item.action}</strong></div><div><span>Status</span><strong>{item.from_status||'—'} → {item.to_status||'—'}</strong></div><div><span>Time</span><strong>{formatDate(item.created_at)}</strong></div></div>)}</div>}</aside></div>}
 </div>
}
function ScreeningPanel({applicationId}:{applicationId:string}){
 const [rows,setRows]=useState<ScreeningRow[]>([])
 const [selected,setSelected]=useState<ScreeningRow|null>(null)
 const [loading,setLoading]=useState(true)
 const [notice,setNotice]=useState('')
 const [running,setRunning]=useState(false)

 async function load(){
  setLoading(true);setNotice('')
  try{
   const {data:subs,error:se}=await supabase.from('submissions').select('id,application_id,applicant_id,submitted_at,decision').eq('application_id',applicationId).eq('status','submitted').order('submitted_at',{ascending:false})
   if(se)throw se
   const submissionIds=(subs||[]).map(s=>s.id)
   if(!submissionIds.length){setRows([]);return}
   const [{data:elig,error:ee},{data:ai,error:ae},{data:applicants,error:ape}]=await Promise.all([
    supabase.from('submission_eligibility').select('submission_id,status').in('submission_id',submissionIds),
    supabase.from('ai_screenings').select('submission_id,status,overall_assessment').in('submission_id',submissionIds),
    supabase.from('applicants').select('id,full_name,email,participant_id').in('id',(subs||[]).map(s=>s.applicant_id).filter(Boolean))
   ])
   if(ee)throw ee;if(ae)throw ae;if(ape)throw ape
   const em=new Map((elig||[]).map(x=>[x.submission_id,x]))
   const am=new Map((ai||[]).map(x=>[x.submission_id,x]))
   const pm=new Map((applicants||[]).map(x=>[x.id,x]))
   setRows((subs||[]).map(s=>{
    const p=pm.get(s.applicant_id),a=am.get(s.id),e=em.get(s.id)
    const assessment=String(a?.overall_assessment||'').toLowerCase()
    const recommendation=a?.status==='completed'?'Screened':a?.status==='failed'?'Failed':'Not screened'
    return {submissionId:s.id,applicationId:s.application_id,participantId:p?.participant_id||'—',applicantName:p?.full_name||'Unnamed applicant',email:p?.email||null,submittedAt:s.submitted_at||null,eligibility:e?.status==='eligible'?'eligible':e?.status==='ineligible'?'ineligible':'pending',aiStatus:a?.status||'pending',aiRecommendation:recommendation,decision:s.decision==='approved'||s.decision==='rejected'?s.decision:'pending'}
   }))
  }catch(e){setNotice(friendlyErrorMessage(e,'Could not load screening data.'))}finally{setLoading(false)}
 }

 useEffect(()=>{load()},[applicationId])

 async function runScreening(id:string){
  setRunning(true);setNotice('')
  try{
   const {data,error}=await supabase.functions.invoke('run-ai-screening',{body:{submission_id:id}})
   if(error)throw error
   if(data?.error)throw new Error(data.error)
   await load()
   setSelected(current=>current?.submissionId===id?current:null)
  }catch(e){setNotice(friendlyErrorMessage(e,'Could not run AI screening.'))}
  finally{setRunning(false)}
 }

 async function setDecision(row:ScreeningRow,decision:'approved'|'rejected'){
  const {error}=await supabase.rpc('set_submission_decision',{p_submission_id:row.submissionId,p_decision:decision})
  if(error){setNotice(error.message);return}
  setRows(current=>current.map(r=>r.submissionId===row.submissionId?{...r,decision}:r))
  setSelected(current=>current?.submissionId===row.submissionId?{...current,decision}:current)
 }

 if(loading)return <div className="loading-card card">Loading screening workspace…</div>
 return <div className="screening-panel">
  <div className="builder-top"><div><p className="eyebrow">Screening</p><h2>Application screening</h2><p>Review the complete application, eligibility and AI assessment in one place. Final decisions remain with your team.</p></div>{notice&&<span className="builder-notice">{notice}</span>}</div>
  {!rows.length?<div className="card builder-empty"><Sparkles size={24}/><h3>No submissions to screen yet</h3><p>Applications will appear here after applicants submit the published form.</p></div>:
   <div className="screening-table card">
    <div className="screening-row screening-head"><span>Applicant</span><span>Eligibility</span><span>AI screening</span><span>Status</span><span></span></div>
    {rows.map(r=><button className="screening-row screening-body" key={r.submissionId} onClick={()=>setSelected(r)}>
     <span><strong>{r.applicantName}</strong><small>{r.email||'No email'}</small></span>
     <span className="status-pill">{r.eligibility}</span>
     <span className="status-pill">{r.aiRecommendation}</span>
     <span className="status-pill">{r.decision}</span>
     <span>Review →</span>
    </button>)}
   </div>}
  {selected&&<ScreeningReviewModal row={selected} onClose={()=>setSelected(null)} onDecision={setDecision}/>}
 </div>
}
function AnalyticsPanel({applications}:{applications:Application[]}){
 const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[rows,setRows]=useState<any[]>([]),[participants,setParticipants]=useState<any[]>([]),[notice,setNotice]=useState(''),[selectedApplicationId,setSelectedApplicationId]=useState('all'),[lastUpdated,setLastUpdated]=useState<Date|null>(null)
 async function load(options:{silent?:boolean}={}){
  if(options.silent)setRefreshing(true);else setLoading(true);setNotice('')
  try{
   const ids=applications.map(a=>a.id)
   if(!ids.length){setRows([]);setParticipants([]);setLastUpdated(new Date());return}
   const [submissionsResult,participantsResult]=await Promise.all([
    supabase.from('submissions').select('id,status,decision,submitted_at,application_id,submission_eligibility(status)').in('application_id',ids).order('submitted_at',{ascending:false}),
    supabase.from('participants').select('id,participant_id,application_id,status,joined_at').in('application_id',ids)
   ])
   if(submissionsResult.error)throw submissionsResult.error
   if(participantsResult.error)throw participantsResult.error
   setRows(submissionsResult.data||[]);setParticipants(participantsResult.data||[]);setLastUpdated(new Date())
  }catch(e){setNotice(friendlyErrorMessage(e,'Could not load analytics.'))}finally{setLoading(false);setRefreshing(false)}
 }
 useEffect(()=>{load()},[applications])
 const selectedRows=useMemo(()=>selectedApplicationId==='all'?rows:rows.filter(r=>r.application_id===selectedApplicationId),[rows,selectedApplicationId])
 const selectedParticipants=useMemo(()=>selectedApplicationId==='all'?participants:participants.filter(p=>p.application_id===selectedApplicationId),[participants,selectedApplicationId])
 const metrics=useMemo(()=>{
  const approved=selectedRows.filter(r=>r.decision==='approved')
  const rejected=selectedRows.filter(r=>r.decision==='rejected')
  const enrolled=selectedParticipants.length
  const completed=selectedParticipants.filter(p=>p.status==='completed').length
  const withdrawn=selectedParticipants.filter(p=>p.status==='withdrawn').length
  const active=selectedParticipants.filter(p=>p.status==='active').length
  const pending=Math.max(0,selectedRows.length-approved.length-rejected.length)
  return{submitted:selectedRows.length,approved:approved.length,rejected:rejected.length,pending,enrolled,active,completed,withdrawn,approvalRate:selectedRows.length?approved.length/selectedRows.length*100:0,completionRate:enrolled?completed/enrolled*100:0,withdrawalRate:enrolled?withdrawn/enrolled*100:0}
 },[selectedRows,selectedParticipants])
 const trend=useMemo(()=>{const days:Array<{key:string;label:string;count:number}>=[];for(let i=13;i>=0;i--){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);const key=d.toISOString().slice(0,10);days.push({key,label:d.toLocaleDateString('en-US',{weekday:'short',day:'numeric'}),count:selectedRows.filter(r=>r.submitted_at?.slice(0,10)===key).length})}return days},[selectedRows])
 const maxTrend=Math.max(1,...trend.map(x=>x.count))
 const programmeRows=useMemo(()=>applications.map(application=>{const ps=rows.filter(r=>r.application_id===application.id),pp=participants.filter(p=>p.application_id===application.id);return{application,submitted:ps.length,approved:ps.filter(r=>r.decision==='approved').length,rejected:ps.filter(r=>r.decision==='rejected').length,enrolled:pp.length,completed:pp.filter(p=>p.status==='completed').length,withdrawn:pp.filter(p=>p.status==='withdrawn').length}}).filter(r=>r.submitted>0||r.enrolled>0),[applications,rows,participants])
 if(loading)return <div className="loading-card card">Loading analytics…</div>
 return <section className="analytics-page">
  <div className="analytics-header"><div><p className="eyebrow">Analytics</p><h1>Programme performance</h1><p className="subtitle">Track applications from submission and approval through enrolment, completion and withdrawal.</p></div><div className="analytics-actions"><label className="analytics-select-wrap"><span>Programme</span><select value={selectedApplicationId} onChange={e=>setSelectedApplicationId(e.target.value)}><option value="all">All programmes</option>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><button className="secondary-button" onClick={()=>load({silent:true})} disabled={refreshing}>{refreshing?'Refreshing…':'Refresh'} <TrendingUp size={15}/></button></div></div>
  {notice&&<div className="form-error page-error">{notice}</div>}
  {!selectedRows.length&&!selectedParticipants.length?<div className="card analytics-empty"><div className="empty-icon"><BarChart3 size={22}/></div><h2>No analytics data yet</h2><p>Once applications are submitted and decisions are made, this page will show your enrolment, completion and withdrawal data.</p></div>:
  <>
   <div className="analytics-kpi-grid">
    <div className="card analytics-kpi"><div className="stat-icon"><FileCheck2 size={18}/></div><div><span className="analytics-kpi-label">Submissions</span><strong>{metrics.submitted}</strong><small>Total applications received</small></div></div>
    <div className="card analytics-kpi"><div className="stat-icon"><CheckCircle2 size={18}/></div><div><span className="analytics-kpi-label">Approved / Enrolled</span><strong>{metrics.enrolled}</strong><small>{metrics.submitted?((metrics.enrolled/metrics.submitted)*100).toFixed(1):'0.0'}% of submissions</small></div></div>
    <div className="card analytics-kpi"><div className="stat-icon"><BadgeCheck size={18}/></div><div><span className="analytics-kpi-label">Rejected</span><strong>{metrics.rejected}</strong><small>{metrics.submitted?((metrics.rejected/metrics.submitted)*100).toFixed(1):'0.0'}% of submissions</small></div></div>
    <div className="card analytics-kpi"><div className="stat-icon"><CheckCircle2 size={18}/></div><div><span className="analytics-kpi-label">Completed</span><strong>{metrics.completed}</strong><small>{metrics.completionRate.toFixed(1)}% of participants</small></div></div>
    <div className="card analytics-kpi"><div className="stat-icon"><Users size={18}/></div><div><span className="analytics-kpi-label">Withdrawn</span><strong>{metrics.withdrawn}</strong><small>{metrics.withdrawalRate.toFixed(1)}% of participants</small></div></div>
   </div>
   <div className="analytics-grid analytics-grid-top">
    <div className="card analytics-card"><div className="analytics-card-header"><div><p className="eyebrow">Application journey</p><h2>Submission to participation</h2><p>Approved applicants become participants automatically. Rejected applications are tracked separately.</p></div><Workflow size={19}/></div><div className="analytics-funnel">{[['Submitted',metrics.submitted,100],['Approved / Enrolled',metrics.enrolled,metrics.submitted?metrics.enrolled/metrics.submitted*100:0],['Completed',metrics.completed,metrics.enrolled?metrics.completed/metrics.enrolled*100:0]].map(([label,value,pct])=><div className="analytics-funnel-row" key={String(label)}><div className="analytics-funnel-meta"><span>{label}</span><strong>{Number(value)} <small>{Number(pct).toFixed(1)}%</small></strong></div><div className="analytics-progress"><span style={{width:Math.min(100,Number(pct))+'%'}}/></div></div>)}</div></div>
    <div className="card analytics-card"><div className="analytics-card-header"><div><p className="eyebrow">Submission trend</p><h2>Last 14 days</h2><p>Daily application volume.</p></div><TrendingUp size={19}/></div><div className="analytics-chart"><div className="analytics-chart-bars">{trend.map(d=><div className="analytics-bar-column" key={d.key}><div className="analytics-bar-track"><span style={{height:d.count?Math.max(8,d.count/maxTrend*100)+'%':'0%'}} title={String(d.count)}/></div><small>{d.label}</small></div>)}</div></div></div>
   </div>
   <div className="analytics-grid analytics-grid-bottom">
    <div className="card analytics-card"><div className="analytics-card-header"><div><p className="eyebrow">Participant outcomes</p><h2>What happens after approval</h2><p>Current participant status across the selected programme.</p></div><Users size={19}/></div><div className="analytics-rate-list"><div><span>Enrolled / active</span><strong>{metrics.active}</strong><small>Approved participants currently active</small></div><div><span>Completed</span><strong>{metrics.completed}</strong><small>{metrics.completionRate.toFixed(1)}% of all participants</small></div><div><span>Withdrawn</span><strong>{metrics.withdrawn}</strong><small>{metrics.withdrawalRate.toFixed(1)}% of all participants</small></div></div></div>
    <div className="card analytics-card"><div className="analytics-card-header"><div><p className="eyebrow">Application outcomes</p><h2>Decision breakdown</h2><p>Current approval, rejection and pending decisions for the selected programme.</p></div><BarChart3 size={19}/></div><div className="analytics-rate-list"><div><span>Approved</span><strong>{metrics.approved}</strong><small>{metrics.submitted?((metrics.approved/metrics.submitted)*100).toFixed(1):'0.0'}% of submissions</small></div><div><span>Rejected</span><strong>{metrics.rejected}</strong><small>{metrics.submitted?((metrics.rejected/metrics.submitted)*100).toFixed(1):'0.0'}% of submissions</small></div><div><span>Pending decision</span><strong>{metrics.pending}</strong><small>Awaiting a final decision</small></div></div></div>
   </div>
   <div className="card analytics-card analytics-programmes"><div className="analytics-card-header"><div><p className="eyebrow">Programme breakdown</p><h2>Applications and participants</h2><p>See how each programme is progressing across applications and participants.</p></div></div><div className="table-wrap"><table><thead><tr><th>Programme</th><th>Submissions</th><th>Approved / Enrolled</th><th>Rejected</th><th>Completed</th><th>Withdrawn</th></tr></thead><tbody>{programmeRows.length?programmeRows.map(({application,submitted,approved,rejected,enrolled,completed,withdrawn})=><tr key={application.id}><td><strong>{application.name}</strong><span className="table-sub">{application.status}</span></td><td>{submitted}</td><td>{enrolled}</td><td>{rejected}</td><td>{completed}</td><td>{withdrawn}</td></tr>):<tr><td colSpan={6}><div className="table-empty">No programme activity yet.</div></td></tr>}</tbody></table></div></div>
   <div className="analytics-footer"><span>{lastUpdated?'Updated '+lastUpdated.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):'Live programme data'}</span><span>Analytics follows the current ApplyFlow participant lifecycle.</span></div>
  </>}
 </section>
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
  const previewVisible=(q:BuilderQuestion)=>{const r=normalizeConditionalRules(q.conditional_rules)[0];if(!r)return true;return previewAnswers[r.question_id]===r.value}
  useEffect(()=>{(async()=>{if(!preview||!previewSelectedState){setPreviewLgas([]);return}setPreviewLgaLoading(true);try{setPreviewLgas(await getNigerianLgas(previewSelectedState))}catch{setPreviewLgas([])}finally{setPreviewLgaLoading(false)}})()},[preview,previewSelectedState])

  async function loadQuestions(versionId:string){
    const {data:qs,error}=await supabase.from('questions').select('id,type,label,description,required,placeholder,position,config,conditional_rules').eq('form_version_id',versionId).order('position')
    if(error) throw error
    const rows=(qs||[]) as Omit<BuilderQuestion,'options'>[]
    const full=await Promise.all(rows.map(async q=>{const {data:opts,error:o}=await supabase.from('question_options').select('id,label,value,position').eq('question_id',q.id).order('position'); if(o) throw o; return {...q,conditional_rules:normalizeConditionalRules(q.conditional_rules),options:(opts||[]) as BuilderOption[]}}))
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
    const questionMap = new Map<string, string>()
      for(const source of sourceQuestions||[]){
      const {data:cloned,error:cloneError}=await supabase.from('questions').insert({
        form_version_id:newVersion.id,type:source.type,label:source.label,description:source.description,required:source.required,
        placeholder:source.placeholder,position:source.position,config:source.config,conditional_rules:normalizeConditionalRules(source.conditional_rules)
      }).select('id,type,label,description,required,placeholder,position,config,conditional_rules').single()
      if(cloneError)throw cloneError
      const {data:opts,error:optionsError}=await supabase.from('question_options').select('label,value,position').eq('question_id',source.id).order('position')
      if(optionsError)throw optionsError
      questionMap.set(source.id,cloned.id)
      if(opts?.length){const {error}=await supabase.from('question_options').insert(opts.map(o=>({question_id:cloned.id,label:o.label,value:o.value,position:o.position})));if(error)throw error}
    }
    for(const source of sourceQuestions||[]){
      const mappedRules=normalizeConditionalRules(source.conditional_rules).map((r:any)=>({...r,question_id:questionMap.get(r.question_id)||r.question_id}))
      const {error}=await supabase.from('questions').update({conditional_rules:mappedRules.length?mappedRules:null}).eq('id',questionMap.get(source.id)!)
      if(error)throw error
    }
    const publishedIds=sourceQuestions.map(q=>q.id)
    if(publishedIds.length){
      const {data:eligibilityRules,error:eligibilityError}=await supabase.from('eligibility_rules').select('id,question_id').eq('application_id',applicationId).in('question_id',publishedIds)
      if(eligibilityError)throw eligibilityError
      for(const rule of eligibilityRules||[]){const mapped=questionMap.get(rule.question_id);if(mapped){const {error}=await supabase.from('eligibility_rules').update({question_id:mapped,updated_at:new Date().toISOString()}).eq('id',rule.id);if(error)throw error}}
    }
    setVersionId(newVersion.id);setVersion(newVersion.version_number);await loadQuestions(newVersion.id)
  }catch(e){showNotice(friendlyErrorMessage(e,'Could not load form.'))}})()},[applicationId])

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
      let item={...(data as Omit<BuilderQuestion,'options'>),conditional_rules:normalizeConditionalRules((data as any).conditional_rules),options:[]} as BuilderQuestion
      if(type==='yes_no'){const {data:opts,error:o}=await supabase.from('question_options').insert([{question_id:item.id,label:'Yes',value:'yes',position:0},{question_id:item.id,label:'No',value:'no',position:1}]).select('id,label,value,position');if(o)throw o;item.options=(opts||[]) as BuilderOption[]}
      setQuestions(x=>[...x,item]);setSelectedId(item.id)
    }catch(e){showNotice(friendlyErrorMessage(e,'Could not add question.'))}finally{setBusy(false)}
  }
  function conditionValue(q:BuilderQuestion){return normalizeConditionalRules(q.conditional_rules)[0]?.value||''}
  function conditionQuestionId(q:BuilderQuestion){return normalizeConditionalRules(q.conditional_rules)[0]?.question_id||''}
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
    if(!error&&data)setQuestions(x=>x.map(q=>q.id===selected.id?{...q,...data,conditional_rules:normalizeConditionalRules((data as any).conditional_rules),options:q.options}:q))
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
    try{for(let i=0;i<copy.length;i++){const {error}=await supabase.from('questions').update({position:i}).eq('id',copy[i].id);if(error)throw error}setQuestions(copy.map((q,i)=>({...q,position:i})))}catch(e){showNotice(friendlyErrorMessage(e,'Could not reorder questions.'))}finally{setBusy(false)}
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
      const questionMap=new Map<string,string>()
      for(const source of sourceQuestions||[]){
        const {data:cloned,error:cloneError}=await supabase.from('questions').insert({
          form_version_id:newVersion.id,type:source.type,label:source.label,description:source.description,required:source.required,
          placeholder:source.placeholder,position:source.position,config:source.config,conditional_rules:normalizeConditionalRules(source.conditional_rules)
        }).select('id').single()
        if(cloneError)throw cloneError
        const {data:opts,error:optionsError}=await supabase.from('question_options').select('label,value,position').eq('question_id',source.id).order('position')
        if(optionsError)throw optionsError
        questionMap.set(source.id,cloned.id)
        if(opts?.length){const {error}=await supabase.from('question_options').insert(opts.map(o=>({question_id:cloned.id,label:o.label,value:o.value,position:o.position})));if(error)throw error}
      }
      for(const source of sourceQuestions||[]){
        const mappedRules=normalizeConditionalRules(source.conditional_rules).map((r:any)=>({...r,question_id:questionMap.get(r.question_id)||r.question_id}))
        const {error}=await supabase.from('questions').update({conditional_rules:mappedRules.length?mappedRules:null}).eq('id',questionMap.get(source.id)!)
        if(error)throw error
      }
      const sourceIds=sourceQuestions.map(q=>q.id)
      if(sourceIds.length){
        const {data:eligibilityRules,error:eligibilityError}=await supabase.from('eligibility_rules').select('id,question_id').eq('application_id',applicationId).in('question_id',sourceIds)
        if(eligibilityError)throw eligibilityError
        for(const rule of eligibilityRules||[]){const mapped=questionMap.get(rule.question_id);if(mapped){const {error}=await supabase.from('eligibility_rules').update({question_id:mapped,updated_at:new Date().toISOString()}).eq('id',rule.id);if(error)throw error}}
      }

      setVersionId(newVersion.id)
      setVersion(newVersion.version_number)
      await loadQuestions(newVersion.id)
      showNotice('Form published successfully.','success')
    }catch(e){showNotice(friendlyErrorMessage(e,'Could not publish form.'))}finally{setBusy(false)}
  }

  return <div className="form-builder">
    <div className="builder-top"><div><p className="eyebrow">Form builder · Version {version}</p><h2>Application form</h2><p>Build the questions applicants will answer.</p></div><div className="builder-actions">{notice&&createPortal(<div className={`toast-notification ${noticeType}`} role="status" aria-live="polite"><span className="toast-icon">{noticeType==='success'?<CheckCircle2 size={17}/>:<X size={17}/>}</span><span>{notice}</span><button className="toast-close" onClick={()=>setNotice('')} aria-label="Dismiss notification"><X size={14}/></button></div>,document.body)}<button className="secondary-button" disabled={busy||!questions.length} onClick={()=>showNotice('Draft saved.','success')}>Save draft</button><button className="secondary-button" disabled={!questions.length} onClick={()=>setPreview(true)}>Preview</button><button className="primary-button" disabled={busy||!questions.length} onClick={publish}>Publish form</button></div></div>
    <div className="builder-layout"><aside className="builder-palette card"><div className="builder-section-title">Question types</div>{questionTypes.map(q=><button key={q.type} className="question-type" disabled={busy} onClick={()=>addQuestion(q.type)}><span className="type-icon">{q.icon}</span><span>{q.label}</span></button>)}</aside>
      <main className="builder-canvas"><div className="canvas-label">FORM CANVAS</div>{!questions.length?<div className="builder-empty card"><FileText size={24}/><h3>Start building your form</h3><p>Select a question type from the left to add your first question.</p></div>:questions.map((q,i)=><div key={q.id} className={selectedId===q.id?'question-card card selected':'question-card card'} onClick={()=>setSelectedId(q.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setSelectedId(q.id)}}} tabIndex={0} role="button" aria-pressed={selectedId===q.id} aria-label={'Edit question '+(i+1)+': '+q.label}><div className="question-card-top"><span className="drag-handle">⋮⋮</span><span className="question-number">{i+1}</span><span className="question-kind">{questionTypes.find(x=>x.type===q.type)?.label}</span><button type="button" className="icon-button question-delete" aria-label={'Delete question '+(i+1)} onClick={e=>{e.stopPropagation();setSelectedId(q.id);removeQuestion()}}><X size={15}/></button></div><h3>{q.label}{q.required&&<span className="required-star">*</span>}</h3>{q.description&&<p>{q.description}</p>}{optionTypes.includes(q.type)&&q.options.length?<div className="choice-preview">{q.options.map(o=><span key={o.id}>○ {o.label}</span>)}</div>:<div className="fake-input">{q.type==='long_text'?'Applicant response…':q.type==='dropdown'?'Select an option…':q.type==='rating'?'☆ ☆ ☆ ☆ ☆':'Applicant response…'}</div>}<div className="question-move"><button disabled={i===0||busy} onClick={e=>{e.stopPropagation();moveQuestion(i,-1)}}>↑ Move up</button><button disabled={i===questions.length-1||busy} onClick={e=>{e.stopPropagation();moveQuestion(i,1)}}>↓ Move down</button></div></div>)}</main>
      <aside className="builder-settings card">{selected?<><div className="builder-section-title">Question settings</div><label>Question<input value={selected.label} onChange={e=>updateQuestion({label:e.target.value})}/></label><label>Description<textarea rows={3} value={selected.description||''} onChange={e=>updateQuestion({description:e.target.value||null})}/></label><label>Placeholder<input value={selected.placeholder||''} onChange={e=>updateQuestion({placeholder:e.target.value||null})}/></label><label className="toggle-row"><span>Required</span><input type="checkbox" checked={selected.required} onChange={e=>updateQuestion({required:e.target.checked})}/></label><div className="condition-editor"><div className="options-title"><div><span>Conditional question</span><small>Show this question only when another answer matches.</small></div><span className="optional">Optional</span></div><div className="condition-select-group"><label>Show when</label><div className="condition-select-wrap"><select value={conditionQuestionId(selected)} onChange={e=>{const id=e.target.value;updateCondition(id,conditionValue(selected))}}><option value="">Always show</option>{questions.filter(q=>q.id!==selected.id).map(q=><option key={q.id} value={q.id}>{q.label}</option>)}</select><ChevronDown size={15}/></div></div>{conditionQuestionId(selected)&&<div className="condition-select-group"><label>Answer is</label><div className="condition-select-wrap"><select value={conditionValue(selected)} onChange={e=>updateCondition(conditionQuestionId(selected),e.target.value)}><option value="">Choose answer…</option>{conditionOptions(conditionQuestionId(selected)).map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select><ChevronDown size={15}/></div></div>}</div>{optionTypes.includes(selected.type)&&<div className="options-editor"><div className="options-title"><span>Options</span><button onClick={addOption} disabled={busy}>+ Add</button></div>{selected.options.map(o=><div className="option-row" key={o.id}><input value={o.label} onChange={e=>updateOption(o.id,{label:e.target.value})}/><button className="icon-button" onClick={()=>removeOption(o.id)} aria-label="Remove option"><X size={13}/></button></div>)}</div>}<button className="delete-question" onClick={removeQuestion}>Delete question</button></>:<div className="settings-empty"><Settings size={20}/><p>Select a question to edit its settings.</p></div>}</aside>
    </div>
    {preview&&<div className="preview-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setPreview(false)}}><div className="preview-panel card"><div className="preview-header"><div><p className="eyebrow">Applicant preview</p><h2>Application form</h2><p>Preview what applicants will see.</p></div><button className="icon-button" onClick={()=>setPreview(false)}><X size={18}/></button></div><div className="preview-form">{questions.filter(previewVisible).map((q,i)=><div key={q.id} className="preview-question"><label>{i+1}. {q.label}{q.required&&<span className="required-star">*</span>}{q.description&&<small>{q.description}</small>}</label>{q.type==='nigeria_state'?<select value={previewAnswers[q.id]||''} onChange={e=>{setPreviewAnswers(x=>{const next={...x,[q.id]:e.target.value};if(previewLgaQuestion)delete next[previewLgaQuestion.id];return next})}}><option value="">Select your state of origin</option>{NIGERIAN_STATES.map(state=><option key={state} value={state}>{state}</option>)}</select>:q.type==='nigeria_lga'?<select value={previewAnswers[q.id]||''} onChange={e=>setPreviewAnswers(x=>({...x,[q.id]:e.target.value}))} disabled={!previewSelectedState||previewLgaLoading}><option value="">{!previewSelectedState?'Select your state first':previewLgaLoading?'Loading local governments…':'Select your local government'}</option>{previewLgas.map(lga=><option key={lga} value={lga}>{lga}</option>)}</select>:optionTypes.includes(q.type)?<div className="preview-options">{q.options.map(o=><label key={o.id}><input type={q.type==='multiple_choice'?'checkbox':'radio'} name={q.id}/><span>{o.label}</span></label>)}</div>:q.type==='long_text'?<textarea placeholder={q.placeholder||'Your answer'}/>:q.type==='date'?<input type="date" className="date-picker-input" onClick={e=>{try{e.currentTarget.showPicker?.()}catch{}}}/>:q.type==='number'?<input type="number" placeholder={q.placeholder||''}/>:q.type==='rating'?<div className="preview-rating">☆ ☆ ☆ ☆ ☆</div>:q.type==='file'||q.type==='image'?<input type="file"/>:<input type={q.type==='email'?'email':q.type==='phone'?'tel':'text'} placeholder={q.placeholder||'Your answer'}/>}</div>)}</div><div className="preview-footer"><button className="secondary-button" onClick={()=>{setPreview(false);setPreviewAnswers({});setPreviewLgas([])}}>Close preview</button></div></div></div>}
  </div>
}

function StatCard({label,value,note,icon:Icon}:{label:string;value:string;note:string;icon:typeof Users}){return <div className="card stat-card"><div className="stat-icon"><Icon size={18}/></div><div><p className="eyebrow">{label}</p><div className="stat-value">{value}</div><p className="muted">{note}</p></div></div>}
export default App

