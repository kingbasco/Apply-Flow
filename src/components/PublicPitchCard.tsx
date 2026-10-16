import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CheckCircle2, Copy, Download, FileImage, Loader2, Share2, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'
import { normalizedLayout, paintPitchCard, readImage, canvasPng, downloadPitchBlob, safePitchFileName } from '../lib/pitchCardRender'
import type { PitchLayout } from '../lib/pitchCardRender'
import { formatPitchName, formatPitchTrade, validPitchDetails } from '../lib/pitchCardText'
import './PitchCards.css'

type PublicEvent={title:string;slug:string;layout:PitchLayout;template_path:string;card_mode?:'pitch'|'flyer';share_caption?:string}
type Verified={token:string;participant_name:string;trade:string}
export default function PublicPitchCard({slug}:{slug:string}){
  const [event,setEvent]=useState<PublicEvent|null>(null)
  const [template,setTemplate]=useState<HTMLImageElement|null>(null)
  const [email,setEmail]=useState('')
  const [participantId,setParticipantId]=useState('')
  const [verified,setVerified]=useState<Verified|null>(null)
  const [cardName,setCardName]=useState('')
  const [cardTrade,setCardTrade]=useState('')
  const [photo,setPhoto]=useState<HTMLImageElement|null>(null)
  const [photoFile,setPhotoFile]=useState<File|null>(null)
  const [tooSmall,setTooSmall]=useState(false)
  const [busy,setBusy]=useState('')
  const [loading,setLoading]=useState(true)
  const [finished,setFinished]=useState(false)
  const [error,setError]=useState('')
  const [feedback,setFeedback]=useState('')
  const canvasRef=useRef<HTMLCanvasElement|null>(null)
  const blobUrl=useRef('')
  const isFlyer=event?.card_mode==='flyer'
  const caption=event?.share_caption?.trim()||(`I'm attending ${event?.title||'the final event'}!`)

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
    try{paintPitchCard(canvasRef.current,template,photo,formatPitchName(cardName),formatPitchTrade(cardTrade),event.layout,Math.min(1400,template.naturalWidth||1400))}
    catch(e){setError(friendlyErrorMessage(e,'Could not render your pitch card.'))}
  },[template,event,verified,photo,cardName,cardTrade])
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
      const name=formatPitchName(data.participant_name)
      const trade=formatPitchTrade(data.trade||'')
      setCardName(name)
      setCardTrade(trade)
      setVerified({token:data.token,participant_name:name,trade})
    }catch(e){setError(friendlyErrorMessage(e,'Could not verify your identity.'))}
    finally{setBusy('')}
  }
  async function choosePhoto(file:File){
    setError('');setFeedback('')
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
    const name=formatPitchName(cardName)
    const trade=formatPitchTrade(cardTrade)
    if(!validPitchDetails(name,trade)){
      setError('Please enter your name and trade, up to 120 characters each.');return
    }
    setCardName(name);setCardTrade(trade)
    setBusy('submit');setError('')
    try{
      const body=new FormData()
      body.append('slug',slug)
      body.append('token',verified.token)
      body.append('name',name)
      body.append('trade',trade)
      body.append('photo',photoFile)
      const {data,error}=await supabase.functions.invoke('submit-pitch-card',{body})
      if(error)throw error
      if(!data?.ok)throw new Error(data?.error||'Unable to submit your photograph.')
      setFinished(true)
    }catch(e){setError(friendlyErrorMessage(e,'Could not submit your pitch card.'))}
    finally{setBusy('')}
  }

  async function buildFlyer(){
    if(!isFlyer||!verified||!template||!photoFile||!photo)return null
    const name=formatPitchName(cardName),trade=formatPitchTrade(cardTrade)
    if(!validPitchDetails(name,trade)){
      setError('Enter your name and trade before downloading.');return null
    }
    const canvas=document.createElement('canvas')
    paintPitchCard(canvas,template,photo,name,trade,event!.layout,Math.min(3840,Math.max(1920,template.naturalWidth||1920)))
    const blob=await canvasPng(canvas)
    const filename=safePitchFileName(event!.title)+'-'+safePitchFileName(name)+'.png'
    return new File([blob],filename,{type:'image/png'})
  }
  async function downloadFlyer(){
    setBusy('download');setError('');setFeedback('')
    try{
      const file=await buildFlyer()
      if(!file)return
      downloadPitchBlob(file,file.name)
      setFeedback('Your flyer is downloaded. You can post the image to your social media accounts.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not download the flyer.'))}
    finally{setBusy('')}
  }
  async function copyCaption(){
    try{await navigator.clipboard.writeText(caption);setFeedback('Caption copied. Paste it when posting your flyer.')}
    catch{setFeedback('To share, copy this caption: '+caption)}
  }
  async function shareFlyer(){
    setBusy('share');setError('');setFeedback('')
    try{
      const file=await buildFlyer()
      if(!file)return
      if(navigator.share&&navigator.canShare?.({files:[file]})){
        try{
          await navigator.share({files:[file],title:event?.title||'Event flyer',text:caption})
          setFeedback('Flyer shared or handed off to your chosen app.')
          return
        }catch(e){
          if(e instanceof Error&&e.name==='AbortError')return
        }
      }
      downloadPitchBlob(file,file.name)
      try{await navigator.clipboard.writeText(caption)
        setFeedback('Your device cannot share this image directly here. The flyer has downloaded and your caption was copied. Open Instagram, WhatsApp or another app to post it.')
      }catch{
        setFeedback('Your flyer has downloaded. Open your social app to post it, and copy the caption below if needed.')
      }
    }catch(e){setError(friendlyErrorMessage(e,'Could not prepare the flyer for sharing.'))}
    finally{setBusy('')}
  }

  if(loading)return <div className="pitch-public"><div className="pitch-public-box"><Loader2 className="spin" size={30}/><h2>Loading your event flyer…</h2></div></div>
  return <div className="pitch-public">
    <header className="pitch-public-header"><a href="/"><ArrowLeft size={17}/> ApplyFlow</a><span>{isFlyer?'Event attendance flyer':'Participant pitch card'}</span></header>
    <main className="pitch-public-box">
      <div className="pitch-public-heading">
        <span className="pitch-public-eyebrow">{isFlyer?'Event Attendee Flyer':'Pitch Competition'}</span>
        <h1>{event?.title||'Pitch card unavailable'}</h1>
        <p>{finished?'Your photograph and pitch card details have been received.':isFlyer?'Verify your identity, add your photo, and download your personalized event flyer to share on social media.':'Verify your identity, upload a clear portrait, and preview your personalized pitch card.'}</p>
      </div>
      {error&&<div className="form-error">{error}</div>}
      {feedback&&<div className="form-success" role="status">{feedback}</div>}
      {!event?null:finished?<div className="pitch-success"><CheckCircle2 size={45}/><h2>Pitch card submitted!</h2><p>The organizers can now download your high-quality pitch card. You may close this page.</p></div>
      :!verified?<form className="pitch-verify-form" onSubmit={e=>void verify(e)}>
        <label>Registered email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Enter the email you registered with"/></label>
        <label>Participant ID<input required value={participantId} onChange={e=>setParticipantId(e.target.value)} placeholder="e.g. EC-2026-00155" maxLength={80}/></label>
        <button type="submit" className="primary-button" disabled={!!busy}>{busy==='verify'?'Verifying…':isFlyer?'Continue to my flyer':'Continue to my pitch card'}</button>
        <p className="pitch-hint">Your registered email and participant ID must match the programme's records.</p>
      </form>:<>
        <div className="pitch-verified"><CheckCircle2 size={21}/><div><strong>Identity verified</strong><small>Check the details below. You can correct them for your pitch card without changing your registration.</small></div></div>
        <div className="pitch-participant-details">
          <div><h2>Your {isFlyer?'flyer':'pitch card'} details</h2><p>We filled these from your registration. Edit either field if needed, or leave them as they are.</p></div>
          <label>Full name
            <input required type="text" maxLength={120} autoComplete="name" value={cardName} placeholder="Enter your name"
              onChange={e=>setCardName(e.target.value)} onBlur={()=>setCardName(name=>formatPitchName(name))}/>
          </label>
          <label>Trade
            <input required type="text" maxLength={120} value={cardTrade} placeholder="Enter your trade"
              onChange={e=>setCardTrade(e.target.value)} onBlur={()=>setCardTrade(trade=>formatPitchTrade(trade))}/>
          </label>
          <p className="pitch-hint">Names are formatted with capital initials; trades are sentence case. Your edits appear immediately in the preview.</p>
        </div>
        <label className="pitch-public-upload"><FileImage size={25}/><strong>{photoFile?'Change photograph':'Upload your portrait photograph'}</strong><small>PNG, JPG or WebP · up to 15 MB · clear, high-resolution photo recommended</small>
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(file)void choosePhoto(file);e.currentTarget.value=''}}/>
          <span className="secondary-button"><Upload size={15}/> Choose photo</span>
        </label>
        {tooSmall&&<div className="pitch-warning">This photo is small and may look blurry when projected on a large screen. We recommend at least 1200 × 900 pixels.</div>}
        <div className="pitch-public-preview">
          <div><h2>Your {isFlyer?'event flyer':'pitch card'} preview</h2><p>This is how your photograph, name and trade will appear on the design.</p></div>
          <div className="pitch-artboard">{template?<canvas ref={canvasRef} aria-label="Your completed pitch card preview"/>:null}</div>
        </div>
        {isFlyer&&<div className="pitch-social-caption"><strong>Social media caption</strong><p>{caption}</p><button type="button" className="secondary-button" onClick={()=>void copyCaption()}><Copy size={15}/> Copy caption</button></div>}
        <div className="pitch-public-actions">{isFlyer?<>
          <button className="primary-button" type="button" disabled={!photoFile||!!busy||!cardName.trim()||!cardTrade.trim()} onClick={()=>void downloadFlyer()}><Download size={16}/> {busy==='download'?'Preparing PNG…':'Download my flyer'}</button>
          <button className="secondary-button" type="button" disabled={!photoFile||!!busy||!cardName.trim()||!cardTrade.trim()} onClick={()=>void shareFlyer()}><Share2 size={16}/> {busy==='share'?'Preparing share…':'Share my flyer'}</button>
        </>:<button className="primary-button" type="button" disabled={!photoFile||!!busy} onClick={()=>void submit()}>
          {busy==='submit'?<><Loader2 className="spin" size={16}/> Submitting…</>:<>Submit my pitch card</>}</button>}
          {isFlyer&&<p className="pitch-hint pitch-share-note">On phones, Share opens supported apps. If your browser cannot share files directly, the PNG will download so you can upload it yourself to Instagram, WhatsApp or other social media.</p>}
          <button type="button" className="secondary-button" onClick={()=>{setVerified(null);setCardName('');setCardTrade('');setPhoto(null);setPhotoFile(null);setError('')}} disabled={!!busy}>Back</button>
        </div>
      </>}
    </main>
  </div>
}
