import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, FileImage, Loader2, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'
import { normalizedLayout, paintPitchCard, readImage } from '../lib/pitchCardRender'
import type { PitchLayout } from '../lib/pitchCardRender'
import './PitchCards.css'

type PublicEvent={title:string;slug:string;layout:PitchLayout;template_path:string}
type Verified={token:string;participant_name:string;trade:string}
export default function PublicPitchCard({slug}:{slug:string}){
  const [event,setEvent]=useState<PublicEvent|null>(null)
  const [template,setTemplate]=useState<HTMLImageElement|null>(null)
  const [email,setEmail]=useState('')
  const [participantId,setParticipantId]=useState('')
  const [verified,setVerified]=useState<Verified|null>(null)
  const [photo,setPhoto]=useState<HTMLImageElement|null>(null)
  const [photoFile,setPhotoFile]=useState<File|null>(null)
  const [tooSmall,setTooSmall]=useState(false)
  const [busy,setBusy]=useState('')
  const [loading,setLoading]=useState(true)
  const [finished,setFinished]=useState(false)
  const [error,setError]=useState('')
  const canvasRef=useRef<HTMLCanvasElement|null>(null)
  const blobUrl=useRef('')

  useEffect(()=>{
    let cancelled=false
    async function load(){
      try{
        const {data,error}=await supabase.rpc('get_pitch_card_event',{p_slug:slug})
        if(error)throw error
        if(!data?.template_path)throw new Error('This pitch card link is not active.')
        const publicUrl=supabase.storage.from('pitch-card-templates').getPublicUrl(data.template_path).data.publicUrl
        const image=await readImage(publicUrl)
        if(!cancelled){
          setEvent({...data,layout:normalizedLayout(data.layout)})
          setTemplate(image)
        }
      }catch(e){if(!cancelled)setError(friendlyErrorMessage(e,'Could not load this pitch event.'))}
      finally{if(!cancelled)setLoading(false)}
    }
    void load()
    return()=>{cancelled=true}
  },[slug])
  useEffect(()=>{
    if(!template||!event||!verified||!canvasRef.current)return
    try{paintPitchCard(canvasRef.current,template,photo,verified.participant_name,verified.trade,event.layout,Math.min(1400,template.naturalWidth||1400))}
    catch(e){setError(friendlyErrorMessage(e,'Could not render your pitch card.'))}
  },[template,event,verified,photo])
  useEffect(()=>()=>{if(blobUrl.current)URL.revokeObjectURL(blobUrl.current)},[])

  async function verify(e:React.FormEvent){
    e.preventDefault();setBusy('verify');setError('')
    try{
      const {data,error}=await supabase.rpc('open_pitch_card_for_participant',{
        p_slug:slug,p_participant_code:participantId.trim(),p_email:email.trim()
      })
      if(error)throw error
      if(data?.error)throw new Error(data.error)
      if(!data?.token||!data?.participant_name)throw new Error('Your details could not be verified.')
      setVerified({token:data.token,participant_name:data.participant_name,trade:data.trade||''})
    }catch(e){setError(friendlyErrorMessage(e,'Could not verify your identity.'))}
    finally{setBusy('')}
  }
  async function choosePhoto(file:File){
    setError('')
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>15*1024*1024||file.size<1024){
      setError('Upload a PNG, JPG or WebP photograph between 1 KB and 15 MB.');return
    }
    if(blobUrl.current)URL.revokeObjectURL(blobUrl.current)
    blobUrl.current=URL.createObjectURL(file)
    try{
      const image=await readImage(blobUrl.current)
      if(image.naturalWidth>12000||image.naturalHeight>12000)throw new Error('Please choose an image smaller than 12,000 pixels per side.')
      setPhoto(image);setPhotoFile(file)
      setTooSmall(image.naturalWidth<1200||image.naturalHeight<900)
    }catch(e){setPhoto(null);setPhotoFile(null);setError(friendlyErrorMessage(e,'The photograph is not valid.'))}
  }
  async function submit(){
    if(!verified||!photoFile)return
    setBusy('submit');setError('')
    try{
      const body=new FormData()
      body.append('slug',slug)
      body.append('token',verified.token)
      body.append('photo',photoFile)
      const {data,error}=await supabase.functions.invoke('submit-pitch-card',{body})
      if(error)throw error
      if(!data?.ok)throw new Error(data?.error||'Unable to submit your photograph.')
      setFinished(true)
    }catch(e){setError(friendlyErrorMessage(e,'Could not submit your pitch card.'))}
    finally{setBusy('')}
  }

  if(loading)return <div className="pitch-public"><div className="pitch-public-box"><Loader2 className="spin" size={30}/><h2>Loading pitch card…</h2></div></div>
  return <div className="pitch-public">
    <header className="pitch-public-header"><a href="/"><ArrowLeft size={17}/> ApplyFlow</a><span>Participant pitch card</span></header>
    <main className="pitch-public-box">
      <div className="pitch-public-heading">
        <span className="pitch-public-eyebrow">Pitch Competition</span>
        <h1>{event?.title||'Pitch card unavailable'}</h1>
        <p>{finished?'Your photograph and pitch card details have been received.':'Verify your identity, upload a clear portrait, and preview your personalized pitch card.'}</p>
      </div>
      {error&&<div className="form-error">{error}</div>}
      {!event?null:finished?<div className="pitch-success"><CheckCircle2 size={45}/><h2>Pitch card submitted!</h2><p>The organizers can now download your high-quality pitch card. You may close this page.</p></div>
      :!verified?<form className="pitch-verify-form" onSubmit={e=>void verify(e)}>
        <label>Registered email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Enter the email you registered with"/></label>
        <label>Participant ID<input required value={participantId} onChange={e=>setParticipantId(e.target.value)} placeholder="e.g. EC-2026-00155" maxLength={80}/></label>
        <button type="submit" className="primary-button" disabled={!!busy}>{busy==='verify'?'Verifying…':'Continue to my pitch card'}</button>
        <p className="pitch-hint">Your registered email and participant ID must match the programme's records.</p>
      </form>:<>
        <div className="pitch-verified"><CheckCircle2 size={21}/><div><strong>{verified.participant_name}</strong><small>{verified.trade||'Trade information not available in your registration'}</small></div></div>
        <label className="pitch-public-upload"><FileImage size={25}/><strong>{photoFile?'Change photograph':'Upload your portrait photograph'}</strong><small>PNG, JPG or WebP · up to 15 MB · clear, high-resolution photo recommended</small>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void choosePhoto(file);e.currentTarget.value=''}}/>
          <span className="secondary-button"><Upload size={15}/> Choose photo</span>
        </label>
        {tooSmall&&<div className="pitch-warning">This photo is small and may look blurry when projected on a large screen. We recommend at least 1200 × 900 pixels.</div>}
        <div className="pitch-public-preview">
          <div><h2>Your pitch card preview</h2><p>This is how your photograph, name and trade will appear on the design.</p></div>
          <div className="pitch-artboard">{template?<canvas ref={canvasRef} aria-label="Your completed pitch card preview"/>:null}</div>
        </div>
        <div className="pitch-public-actions"><button className="primary-button" type="button" disabled={!photoFile||!!busy} onClick={()=>void submit()}>
          {busy==='submit'?<><Loader2 className="spin" size={16}/> Submitting…</>:<>Submit my pitch card</>}</button>
          <button type="button" className="secondary-button" onClick={()=>{setVerified(null);setPhoto(null);setPhotoFile(null);setError('')}} disabled={!!busy}>Back</button>
        </div>
      </>}
    </main>
  </div>
}
