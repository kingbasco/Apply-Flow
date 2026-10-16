import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileImage, ImagePlus, Loader2, Plus, Save, Share2, Trash2, Upload, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'
import { DEFAULT_PITCH_LAYOUT, normalizedLayout, paintPitchCard, readImage, canvasPng, downloadPitchBlob, safePitchFileName, bounded } from '../lib/pitchCardRender'
import type { PitchLayout } from '../lib/pitchCardRender'
import './PitchCards.css'

type Programme={id:string;name:string}
type PitchEvent={
  id:string;organization_id:string;application_id:string;title:string;slug:string;status:'draft'|'published'|'closed';
  template_path:string|null;layout:PitchLayout;updated_at:string
}
type Submission={id:string;event_id:string;participant_id:string;participant_name:string;trade:string;photo_path:string;submitted_at:string}
type SelectedField='photo'|'name'|'trade'
type ExportQuality='full'|'ultra'

export default function PitchCardsWorkspace({organizationId,applications}:{organizationId:string;applications:Programme[]}){
  const [events,setEvents]=useState<PitchEvent[]>([])
  const [selectedId,setSelectedId]=useState('')
  const [editing,setEditing]=useState<PitchEvent|null>(null)
  const [submissions,setSubmissions]=useState<Submission[]>([])
  const [template,setTemplate]=useState<HTMLImageElement|null>(null)
  const [samplePhoto,setSamplePhoto]=useState<HTMLImageElement|null>(null)
  const [field,setField]=useState<SelectedField>('photo')
  const [quality,setQuality]=useState<ExportQuality>('ultra')
  const [creating,setCreating]=useState(false)
  const [newProgramme,setNewProgramme]=useState(applications[0]?.id||'')
  const [newTitle,setNewTitle]=useState('Hertisan Pitch Competition')
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState('')
  const [progress,setProgress]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const canvasRef=useRef<HTMLCanvasElement|null>(null)
  const urls=useRef<string[]>([])
  const active=useMemo(()=>events.find(item=>item.id===selectedId),[events,selectedId])
  const count=submissions.length
  const sharing=editing?window.location.origin+'/pitch/'+editing.slug:''
  const layout=editing?.layout||DEFAULT_PITCH_LAYOUT

  async function refresh(preferred=''){
    const {data,error}=await supabase.from('pitch_card_events')
      .select('id,organization_id,application_id,title,slug,status,template_path,layout,updated_at')
      .eq('organization_id',organizationId).order('updated_at',{ascending:false})
    if(error)throw error
    const list=(data||[]).map((item:any)=>({...item,layout:normalizedLayout(item.layout)})) as PitchEvent[]
    setEvents(list)
    setSelectedId(current=>list.some(e=>e.id===(preferred||current))?(preferred||current):list[0]?.id||'')
  }
  useEffect(()=>{let mounted=true
    setLoading(true)
    refresh().catch(e=>{if(mounted)setError(friendlyErrorMessage(e,'Could not load pitch card events.'))})
      .finally(()=>{if(mounted)setLoading(false)})
    return()=>{mounted=false}
  },[organizationId])
  useEffect(()=>{setEditing(active?{...active,layout:normalizedLayout(active.layout)}:null);setError('');setNotice('')},[active?.id])
  useEffect(()=>{let cancelled=false
    setTemplate(null);setSamplePhoto(null);setSubmissions([])
    if(!active)return
    async function load(){
      try{
        if(active!.template_path){
          const publicUrl=supabase.storage.from('pitch-card-templates').getPublicUrl(active!.template_path!).data.publicUrl
          const image=await readImage(publicUrl)
          if(!cancelled)setTemplate(image)
        }
        const {data,error}=await supabase.from('pitch_card_submissions')
          .select('id,event_id,participant_id,participant_name,trade,photo_path,submitted_at')
          .eq('event_id',active!.id).order('submitted_at',{ascending:false})
        if(error)throw error
        if(!cancelled)setSubmissions(data||[])
      }catch(e){if(!cancelled)setError(friendlyErrorMessage(e,'Could not load pitch card details.'))}
    }
    void load()
    return()=>{cancelled=true}
  },[active?.id,active?.template_path])
  useEffect(()=>{
    if(!template||!editing||!canvasRef.current)return
    try{paintPitchCard(canvasRef.current,template,samplePhoto,'SEYI TYTLER','Fashion Design',layout,Math.min(1400,template.naturalWidth||1400))}
    catch(e){setError(friendlyErrorMessage(e,'Could not preview artwork.'))}
  },[template,samplePhoto,editing])

  function updateLayout<K extends SelectedField>(key:K,update:Partial<PitchLayout[K]>){
    setEditing(current=>current?{...current,layout:{...current.layout,[key]:{...current.layout[key],...update}}}:current)
  }
  function handleCanvasClick(e:React.MouseEvent<HTMLCanvasElement>){
    const rect=e.currentTarget.getBoundingClientRect()
    const x=bounded((e.clientX-rect.left)/rect.width*100,0,100)
    const y=bounded((e.clientY-rect.top)/rect.height*100,0,100)
    if(field==='photo')updateLayout('photo',{x:bounded(x-layout.photo.width/2,0,100-layout.photo.width),y:bounded(y-layout.photo.height/2,0,100-layout.photo.height)})
    else updateLayout(field,{x,y})
  }
  async function createEvent(){
    if(!newProgramme||!newTitle.trim()){setError('Choose a programme and enter an event title.');return}
    setBusy('create');setError('');setNotice('')
    try{
      const slug='pitch-'+crypto.randomUUID().slice(0,12)
      const {data,error}=await supabase.from('pitch_card_events').insert({
        organization_id:organizationId,application_id:newProgramme,
        title:newTitle.trim(),slug,layout:DEFAULT_PITCH_LAYOUT
      }).select('id').single()
      if(error)throw error
      await refresh(data.id);setCreating(false);setNotice('Pitch card event created. Upload your artwork to begin.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not create pitch event.'))}
    finally{setBusy('')}
  }
  async function saveEvent(){
    if(!editing)return
    if(editing.status==='published'&&!editing.template_path){setError('Upload a template before publishing.');return}
    setBusy('save');setError('');setNotice('')
    try{
      const {error}=await supabase.from('pitch_card_events').update({
        title:editing.title.trim(),layout:editing.layout,status:editing.status,updated_at:new Date().toISOString()
      }).eq('id',editing.id).eq('organization_id',organizationId)
      if(error)throw error
      await refresh(editing.id)
      setNotice('Pitch card template saved.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not save pitch card.'))}
    finally{setBusy('')}
  }
  async function uploadTemplate(file:File){
    if(!editing)return
    if(!['image/png','image/jpeg','image/svg+xml'].includes(file.type)||file.size>20*1024*1024){
      setError('Upload PNG, JPEG or SVG artwork, up to 20 MB.');return
    }
    setBusy('template');setError('')
    try{
      const ext=file.type==='image/svg+xml'?'svg':file.type==='image/jpeg'?'jpg':'png'
      const path=organizationId+'/'+editing.id+'/'+crypto.randomUUID()+'.'+ext
      const {error}=await supabase.storage.from('pitch-card-templates').upload(path,file,{contentType:file.type,upsert:false})
      if(error)throw error
      const {error:dbError}=await supabase.from('pitch_card_events').update({template_path:path,updated_at:new Date().toISOString()}).eq('id',editing.id)
      if(dbError){await supabase.storage.from('pitch-card-templates').remove([path]);throw dbError}
      await refresh(editing.id)
      setNotice('Artwork uploaded. Click the preview to position a selected field.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not upload artwork.'))}
    finally{setBusy('')}
  }
  async function previewPhoto(file:File){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)){setError('Choose a PNG, JPG or WebP photograph.');return}
    const url=URL.createObjectURL(file);urls.current.push(url)
    try{setSamplePhoto(await readImage(url))}catch(e){setError(friendlyErrorMessage(e,'Could not load sample photograph.'))}
  }
  async function deleteEvent(){
    if(!editing||!window.confirm('Delete this pitch card event and its submission records?'))return
    setBusy('delete');setError('')
    try{
      const {error}=await supabase.from('pitch_card_events').delete().eq('id',editing.id)
      if(error)throw error
      await refresh()
      setNotice('Event deleted. Previously uploaded files should be cleaned up by an administrator.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not delete event.'))}
    finally{setBusy('')}
  }
  async function exportCards(rows:Submission[]){
    if(!editing||!template||!rows.length){setError('You need a template and at least one submission to export.');return}
    setBusy('export');setError('');setNotice('')
    try{
      const width=quality==='ultra'?3840:1920
      const canvas=document.createElement('canvas')
      const JSZip=(await import('jszip')).default
      const zip=new JSZip()
      let exported=0
      for(const row of rows){
        setProgress('Generating '+(exported+1)+' of '+rows.length+'…')
        const {data,error}=await supabase.storage.from('pitch-card-photos').download(row.photo_path)
        if(error)throw error
        const url=URL.createObjectURL(data)
        try{
          const photograph=await readImage(url)
          paintPitchCard(canvas,template,photograph,row.participant_name,row.trade,layout,width)
          const blob=await canvasPng(canvas)
          zip.file(safePitchFileName(row.participant_name)+'-'+row.participant_id.slice(0,8)+'.png',blob)
        }finally{URL.revokeObjectURL(url)}
        exported++
      }
      if(rows.length===1){
        const filename=Object.keys(zip.files)[0]
        const blob=await zip.file(filename)!.async('blob')
        downloadPitchBlob(blob,filename)
      }else{
        setProgress('Creating ZIP archive…')
        downloadPitchBlob(await zip.generateAsync({type:'blob'}),safePitchFileName(editing.title)+'-pitch-cards.zip')
      }
      setNotice(exported+' pitch card'+(exported===1?'':'s')+' exported successfully.')
    }catch(e){setError(friendlyErrorMessage(e,'Unable to export pitch cards.'))}
    finally{setBusy('');setProgress('')}
  }
  useEffect(()=>()=>{urls.current.forEach(url=>URL.revokeObjectURL(url))},[])
  if(loading)return <section className="pitch-page"><div className="card">Loading pitch cards…</div></section>
  return <section className="pitch-page">
    <div className="page-heading compact">
      <div><p className="eyebrow">Admin tools</p><h1>Pitch Cards</h1><p className="subtitle">Design once, share a secure link, and export every participant's TV-ready pitch card.</p></div>
      <button className="primary-button" onClick={()=>setCreating(true)}><Plus size={16}/> New pitch event</button>
    </div>
    {error&&<div className="form-error">{error}</div>}
    {notice&&<div className="form-success">{notice}</div>}
    {creating&&<div className="card pitch-create">
      <h2>Create pitch event</h2>
      <label>Event name<input value={newTitle} onChange={e=>setNewTitle(e.target.value)}/></label>
      <label>Programme<select value={newProgramme} onChange={e=>setNewProgramme(e.target.value)}>
        <option value="">Select programme</option>{applications.map(app=><option key={app.id} value={app.id}>{app.name}</option>)}
      </select></label>
      <div className="pitch-actions"><button className="primary-button" disabled={!!busy} onClick={()=>void createEvent()}>Create</button><button className="secondary-button" onClick={()=>setCreating(false)}>Cancel</button></div>
    </div>}
    <div className="pitch-layout">
      <aside className="card pitch-library">
        <h2>Saved pitch events</h2>
        {events.map(item=><button key={item.id} type="button" className={'pitch-event-option '+(item.id===selectedId?'active':'')}
          onClick={()=>setSelectedId(item.id)}>
          <strong>{item.title}</strong><span>{item.status} · {applications.find(p=>p.id===item.application_id)?.name||'Programme'}</span>
        </button>)}
        {!events.length&&<p>No pitch events yet. Create an event to begin.</p>}
      </aside>
      {editing&&<div className="pitch-edit-stack">
        <div className="pitch-editor">
          <div className="card pitch-controls">
            <h2>Template settings</h2>
            <label>Event title<input maxLength={120} value={editing.title} onChange={e=>setEditing({...editing,title:e.target.value})}/></label>
            <label>Status<select value={editing.status} onChange={e=>setEditing({...editing,status:e.target.value as PitchEvent['status']})}>
              <option value="draft">Draft</option><option value="published">Published</option><option value="closed">Closed</option>
            </select></label>
            <label className="pitch-file-button"><FileImage size={18}/><strong>{editing.template_path?'Replace artwork':'Upload artwork'}</strong>
              <small>PNG, JPG or SVG · max 20 MB</small>
              <input type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" disabled={!!busy}
                onChange={e=>{const file=e.target.files?.[0];if(file)void uploadTemplate(file);e.currentTarget.value=''}}/>
            </label>
            <div className="pitch-field-tabs">
              {(['photo','name','trade'] as const).map(option=><button key={option} className={field===option?'selected':''} type="button" onClick={()=>setField(option)}>{option==='photo'?'Photo':option==='name'?'Name':'Trade'}</button>)}
            </div>
            <p className="pitch-hint">Select a field, then click the artwork to place it. Values are saved as percentages, so exports stay correctly aligned.</p>
            <div className="pitch-settings-grid">
              <label>X (%)<input type="number" min="0" max="100" value={layout[field].x} onChange={e=>updateLayout(field,{x:bounded(Number(e.target.value),0,100)})}/></label>
              <label>Y (%)<input type="number" min="0" max="100" value={layout[field].y} onChange={e=>updateLayout(field,{y:bounded(Number(e.target.value),0,100)})}/></label>
              {field==='photo'?<>
                <label>Width (%)<input type="number" min="1" max="100" value={layout.photo.width} onChange={e=>updateLayout('photo',{width:bounded(Number(e.target.value),1,100)})}/></label>
                <label>Height (%)<input type="number" min="1" max="100" value={layout.photo.height} onChange={e=>updateLayout('photo',{height:bounded(Number(e.target.value),1,100)})}/></label>
                <label className="pitch-wide">Photo fit<select value={layout.photo.fit} onChange={e=>updateLayout('photo',{fit:e.target.value as 'cover'|'contain'})}><option value="contain">Contain / transparent cut-out</option><option value="cover">Crop to fill rectangle</option></select></label>
              </>:<>
                <label>Font size (at 1920px)<input type="number" min="8" max="250" value={layout[field].size} onChange={e=>updateLayout(field,{size:bounded(Number(e.target.value),8,250)})}/></label>
                <label>Maximum width (%)<input type="number" min="5" max="100" value={layout[field].maxWidth} onChange={e=>updateLayout(field,{maxWidth:bounded(Number(e.target.value),5,100)})}/></label>
                <label>Font<input value={layout[field].font} onChange={e=>updateLayout(field,{font:e.target.value})}/></label>
                <label>Colour<input type="color" value={layout[field].color} onChange={e=>updateLayout(field,{color:e.target.value})}/></label>
                <label>Weight<select value={layout[field].weight} onChange={e=>updateLayout(field,{weight:e.target.value as 'normal'|'bold'})}><option value="normal">Regular</option><option value="bold">Bold</option></select></label>
                <label>Alignment<select value={layout[field].align} onChange={e=>updateLayout(field,{align:e.target.value as 'center'|'left'|'right'})}><option value="center">Center</option><option value="left">Left</option><option value="right">Right</option></select></label>
              </>}
            </div>
            <button className="primary-button pitch-save" disabled={!!busy} onClick={()=>void saveEvent()}><Save size={16}/>{busy==='save'?'Saving…':'Save template'}</button>
          </div>
          <div className="card pitch-preview">
            <div className="pitch-section-title"><div><h2>Live template preview</h2><p>Showing sample name and trade. Upload a sample photo to test the placement.</p></div></div>
            <div className="pitch-artboard">{template?<canvas ref={canvasRef} onClick={handleCanvasClick} title={'Click to position '+field}/>:<div className="pitch-empty"><ImagePlus size={38}/><strong>Upload your blank artwork to start</strong></div>}</div>
            <label className="secondary-button pitch-sample-button"><Upload size={15}/> Sample photo for preview<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(f)void previewPhoto(f);e.currentTarget.value=''}}/></label>
            <p className="pitch-hint">Use a transparent-background PNG for a cut-out speaker portrait, or choose “Crop to fill” for a regular photograph.</p>
          </div>
        </div>
        <div className="card pitch-sharing">
          <div className="pitch-section-title"><div><h2>Participant submission link</h2><p>Publish this event to enable identity verification and uploads.</p></div><span className={'status '+(editing.status==='published'?'green':'neutral')}>{editing.status}</span></div>
          <div className="pitch-link-field"><input readOnly value={sharing}/><button type="button" className="secondary-button" onClick={()=>{void navigator.clipboard.writeText(sharing);setNotice('Link copied to clipboard.')}} disabled={editing.status!=='published'}><Share2 size={15}/> Copy link</button></div>
        </div>
        <div className="card pitch-submissions">
          <div className="pitch-section-title"><div><h2>Participant submissions</h2><p>{count} completed cards · download individually or export a ZIP.</p></div><span className="pitch-submission-count"><Users size={16}/>{count}</span></div>
          <div className="pitch-export-tools"><label>Export resolution<select value={quality} onChange={e=>setQuality(e.target.value as ExportQuality)}>
            <option value="full">Full HD · 1920 wide</option><option value="ultra">4K · 3840 wide</option></select></label>
            <button className="primary-button" disabled={!template||!count||!!busy} onClick={()=>void exportCards(submissions)}><Download size={16}/> Export all PNGs</button>
          </div>
          {progress&&<p className="pitch-hint">{progress}</p>}
          {submissions.length?<div className="pitch-submission-table"><table><thead><tr><th>Participant</th><th>Trade</th><th>Submitted</th><th></th></tr></thead>
            <tbody>{submissions.map(row=><tr key={row.id}><td><strong>{row.participant_name}</strong></td><td>{row.trade||'Not provided'}</td><td>{new Date(row.submitted_at).toLocaleDateString()}</td><td><button type="button" className="secondary-button" disabled={!!busy||!template} onClick={()=>void exportCards([row])}><Download size={14}/> PNG</button></td></tr>)}</tbody></table></div>:<p>No photographs have been submitted yet.</p>}
        </div>
        <div className="pitch-danger"><button type="button" className="secondary-button" disabled={!!busy} onClick={()=>void deleteEvent()}><Trash2 size={15}/> Delete event</button></div>
      </div>}
    </div>
  </section>
}
