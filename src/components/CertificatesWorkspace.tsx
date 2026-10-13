import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileImage, FileText, Loader2, Save, Type, Upload } from 'lucide-react'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'

type CertificateSettings = {
  organization_id:string
  template_path:string|null
  template_mime_type:string|null
  font_path:string|null
  font_family:string
  x_percent:number
  y_percent:number
  font_size:number
  max_width_percent:number
  color:string
  updated_at?:string
}

const DEFAULT_SETTINGS:Omit<CertificateSettings,'organization_id'> = {
  template_path:null,
  template_mime_type:null,
  font_path:null,
  font_family:'CertificateName',
  x_percent:50,
  y_percent:58,
  font_size:72,
  max_width_percent:72,
  color:'#111827',
}

const FONT_FACE_NAME='ApplyFlowCertificateName'
const STORAGE_BUCKET='certificate-assets'

function parseNames(value:string){
  const seen=new Set<string>()
  const names:string[]=[]
  for(const raw of value.split(/\r?\n/)){
    const name=raw.trim().replace(/\s+/g,' ')
    if(!name)continue
    const key=name.toLocaleLowerCase()
    if(seen.has(key))continue
    seen.add(key)
    names.push(name)
  }
  return names
}

function safeFilename(value:string){
  return value.trim().replace(/[^a-zA-Z0-9 _.-]+/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').slice(0,100)||'certificate'
}

function extensionOf(name:string){
  return name.toLowerCase().split('.').pop()||''
}

function templateContentType(file:File){
  const ext=extensionOf(file.name)
  if(ext==='svg')return'image/svg+xml'
  if(ext==='jpg'||ext==='jpeg')return'image/jpeg'
  return'image/png'
}

function fontContentType(file:File){
  return extensionOf(file.name)==='otf'?'font/otf':'font/ttf'
}

function downloadBlob(blob:Blob,filename:string){
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url
  anchor.download=filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}

function canvasBlob(canvas:HTMLCanvasElement,type='image/png',quality?:number){
  return new Promise<Blob>((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Could not render certificate image.')),type,quality)
  })
}

function blobToDataUrl(blob:Blob){
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader()
    reader.onload=()=>resolve(String(reader.result||''))
    reader.onerror=()=>reject(reader.error||new Error('Could not read generated image.'))
    reader.readAsDataURL(blob)
  })
}

export default function CertificatesWorkspace({organizationId}:{organizationId:string}){
  const [settings,setSettings]=useState<CertificateSettings>({organization_id:organizationId,...DEFAULT_SETTINGS})
  const [namesText,setNamesText]=useState('')
  const names=useMemo(()=>parseNames(namesText),[namesText])
  const [previewIndex,setPreviewIndex]=useState(0)
  const previewName=names[previewIndex]||'Recipient Name'
  const [templateUrl,setTemplateUrl]=useState('')
  const [fontUrl,setFontUrl]=useState('')
  const templateImageRef=useRef<HTMLImageElement|null>(null)
  const fontFaceRef=useRef<FontFace|null>(null)
  const canvasRef=useRef<HTMLCanvasElement|null>(null)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [uploading,setUploading]=useState<'template'|'font'|''>('')
  const [exporting,setExporting]=useState<'png'|'pdf'|'png-all'|'pdf-all'|''>('')
  const [exportProgress,setExportProgress]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  useEffect(()=>{
    let cancelled=false
    async function load(){
      setLoading(true);setError('')
      try{
        const {data,error:settingsError}=await supabase
          .from('certificate_settings')
          .select('organization_id,template_path,template_mime_type,font_path,font_family,x_percent,y_percent,font_size,max_width_percent,color,updated_at')
          .eq('organization_id',organizationId)
          .maybeSingle()
        if(settingsError)throw settingsError
        const next:CertificateSettings=data
          ? {...data,x_percent:Number(data.x_percent),y_percent:Number(data.y_percent),font_size:Number(data.font_size),max_width_percent:Number(data.max_width_percent)}
          : {organization_id:organizationId,...DEFAULT_SETTINGS}
        if(cancelled)return
        setSettings(next)
        await loadAssets(next,cancelled)
      }catch(e){
        if(!cancelled)setError(friendlyErrorMessage(e,'Could not load certificate settings.'))
      }finally{
        if(!cancelled)setLoading(false)
      }
    }
    async function loadAssets(next:CertificateSettings,isCancelled:boolean){
      if(next.template_path){
        const {data,error}=await supabase.storage.from(STORAGE_BUCKET).download(next.template_path)
        if(error)throw error
        if(!isCancelled){
          const url=URL.createObjectURL(data)
          setTemplateUrl(current=>{if(current)URL.revokeObjectURL(current);return url})
        }
      }
      if(next.font_path){
        const {data,error}=await supabase.storage.from(STORAGE_BUCKET).download(next.font_path)
        if(error)throw error
        if(!isCancelled){
          const url=URL.createObjectURL(data)
          setFontUrl(current=>{if(current)URL.revokeObjectURL(current);return url})
        }
      }
    }
    void load()
    return()=>{cancelled=true}
  },[organizationId])

  useEffect(()=>{
    if(!templateUrl){templateImageRef.current=null;return}
    let cancelled=false
    const image=new Image()
    image.onload=()=>{if(!cancelled){templateImageRef.current=image;renderPreview()}}
    image.onerror=()=>{if(!cancelled)setError('The certificate template could not be rendered. Please upload a valid PNG, JPG or SVG file.')}
    image.src=templateUrl
    return()=>{cancelled=true}
  },[templateUrl])

  useEffect(()=>{
    let cancelled=false
    async function loadFont(){
      if(fontFaceRef.current){
        document.fonts.delete(fontFaceRef.current)
        fontFaceRef.current=null
      }
      if(!fontUrl){renderPreview();return}
      try{
        const face=new FontFace(FONT_FACE_NAME,`url("${fontUrl}")`)
        const loaded=await face.load()
        if(cancelled)return
        document.fonts.add(loaded)
        fontFaceRef.current=loaded
        renderPreview()
      }catch{
        if(!cancelled)setError('The name font could not be loaded. Please upload a valid TTF or OTF font.')
      }
    }
    void loadFont()
    return()=>{cancelled=true}
  },[fontUrl])

  useEffect(()=>{renderPreview()},[previewName,settings.x_percent,settings.y_percent,settings.font_size,settings.max_width_percent,settings.color])

  useEffect(()=>()=>{
    if(templateUrl)URL.revokeObjectURL(templateUrl)
    if(fontUrl)URL.revokeObjectURL(fontUrl)
    if(fontFaceRef.current)document.fonts.delete(fontFaceRef.current)
  },[])

  function drawCertificate(name:string,canvas:HTMLCanvasElement){
    const image=templateImageRef.current
    if(!image)throw new Error('Upload a certificate template first.')
    const width=image.naturalWidth||image.width
    const height=image.naturalHeight||image.height
    if(!width||!height)throw new Error('The certificate template has no valid dimensions.')
    canvas.width=width
    canvas.height=height
    const context=canvas.getContext('2d')
    if(!context)throw new Error('Your browser could not create the certificate canvas.')
    context.clearRect(0,0,width,height)
    context.drawImage(image,0,0,width,height)
    context.save()
    context.textAlign='center'
    context.textBaseline='middle'
    context.fillStyle=settings.color
    const family=fontFaceRef.current?`"${FONT_FACE_NAME}"`:'Georgia'
    let size=Math.max(8,Number(settings.font_size)||72)
    context.font=`${size}px ${family}`
    const maximum=width*(Number(settings.max_width_percent)||72)/100
    const measured=context.measureText(name).width
    if(measured>maximum&&measured>0){
      size=Math.max(8,size*(maximum/measured))
      context.font=`${size}px ${family}`
    }
    context.fillText(name,width*settings.x_percent/100,height*settings.y_percent/100)
    context.restore()
  }

  function renderPreview(){
    const canvas=canvasRef.current
    if(!canvas||!templateImageRef.current)return
    try{drawCertificate(previewName,canvas)}catch{/* handled by setup state */}
  }

  async function persistSettings(next=settings){
    const payload={
      organization_id:organizationId,
      template_path:next.template_path,
      template_mime_type:next.template_mime_type,
      font_path:next.font_path,
      font_family:next.font_family||'CertificateName',
      x_percent:Number(next.x_percent),
      y_percent:Number(next.y_percent),
      font_size:Number(next.font_size),
      max_width_percent:Number(next.max_width_percent),
      color:next.color,
      updated_at:new Date().toISOString(),
    }
    const {error}=await supabase.from('certificate_settings').upsert(payload,{onConflict:'organization_id'})
    if(error)throw error
  }

  async function savePlacement(){
    setSaving(true);setError('');setNotice('')
    try{
      await persistSettings()
      setNotice('Certificate placement and style saved.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not save certificate settings.'))}
    finally{setSaving(false)}
  }

  async function uploadTemplate(file:File){
    const ext=extensionOf(file.name)
    if(!['png','jpg','jpeg','svg'].includes(ext)){setError('Template must be PNG, JPG, JPEG or SVG.');return}
    if(file.size>20*1024*1024){setError('Template must be 20 MB or smaller.');return}
    setUploading('template');setError('');setNotice('')
    try{
      const path=`${organizationId}/template.${ext==='jpeg'?'jpg':ext}`
      const {error:uploadError}=await supabase.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:true,contentType:templateContentType(file)})
      if(uploadError)throw uploadError
      const previous=settings.template_path
      const next={...settings,template_path:path,template_mime_type:templateContentType(file)}
      await persistSettings(next)
      setSettings(next)
      const {data,error:downloadError}=await supabase.storage.from(STORAGE_BUCKET).download(path)
      if(downloadError)throw downloadError
      const url=URL.createObjectURL(data)
      setTemplateUrl(current=>{if(current)URL.revokeObjectURL(current);return url})
      if(previous&&previous!==path)void supabase.storage.from(STORAGE_BUCKET).remove([previous])
      setNotice('Certificate template uploaded.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not upload certificate template.'))}
    finally{setUploading('')}
  }

  async function uploadFont(file:File){
    const ext=extensionOf(file.name)
    if(!['ttf','otf'].includes(ext)){setError('Name font must be a TTF or OTF file.');return}
    if(file.size>10*1024*1024){setError('Font must be 10 MB or smaller.');return}
    setUploading('font');setError('');setNotice('')
    try{
      const path=`${organizationId}/name-font.${ext}`
      const {error:uploadError}=await supabase.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:true,contentType:fontContentType(file)})
      if(uploadError)throw uploadError
      const previous=settings.font_path
      const next={...settings,font_path:path,font_family:file.name.replace(/\.(ttf|otf)$/i,'')||'CertificateName'}
      await persistSettings(next)
      setSettings(next)
      const {data,error:downloadError}=await supabase.storage.from(STORAGE_BUCKET).download(path)
      if(downloadError)throw downloadError
      const url=URL.createObjectURL(data)
      setFontUrl(current=>{if(current)URL.revokeObjectURL(current);return url})
      if(previous&&previous!==path)void supabase.storage.from(STORAGE_BUCKET).remove([previous])
      setNotice('Name font uploaded.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not upload name font.'))}
    finally{setUploading('')}
  }

  function moveNameFromPreview(event:React.MouseEvent<HTMLCanvasElement>){
    const canvas=event.currentTarget
    const rect=canvas.getBoundingClientRect()
    const x=Math.max(0,Math.min(100,((event.clientX-rect.left)/rect.width)*100))
    const y=Math.max(0,Math.min(100,((event.clientY-rect.top)/rect.height)*100))
    setSettings(current=>({...current,x_percent:Number(x.toFixed(2)),y_percent:Number(y.toFixed(2))}))
  }

  function makeCanvas(name:string){
    const canvas=document.createElement('canvas')
    drawCertificate(name,canvas)
    return canvas
  }

  async function makePdfBlob(name:string){
    const canvas=makeCanvas(name)
    const png=await canvasBlob(canvas)
    const pngBytes=await png.arrayBuffer()
    const pdf=await PDFDocument.create()
    const image=await pdf.embedPng(pngBytes)
    const page=pdf.addPage([canvas.width,canvas.height])
    page.drawImage(image,{x:0,y:0,width:canvas.width,height:canvas.height})
    const bytes=await pdf.save()
    return new Blob([bytes],{type:'application/pdf'})
  }

  async function exportCurrent(kind:'png'|'pdf'){
    setExporting(kind);setError('');setNotice('')
    try{
      if(!settings.template_path||!templateImageRef.current)throw new Error('Upload a certificate template first.')
      const name=previewName
      if(kind==='png'){
        const blob=await canvasBlob(makeCanvas(name))
        downloadBlob(blob,`${safeFilename(name)}-certificate.png`)
      }else{
        const blob=await makePdfBlob(name)
        downloadBlob(blob,`${safeFilename(name)}-certificate.pdf`)
      }
    }catch(e){setError(friendlyErrorMessage(e,'Could not export certificate.'))}
    finally{setExporting('');setExportProgress('')}
  }

  async function exportAll(kind:'png'|'pdf'){
    if(!names.length){setError('Paste at least one recipient name first.');return}
    setExporting(kind==='png'?'png-all':'pdf-all');setError('');setNotice('')
    try{
      if(!settings.template_path||!templateImageRef.current)throw new Error('Upload a certificate template first.')
      const zip=new JSZip()
      for(let index=0;index<names.length;index++){
        const name=names[index]
        setExportProgress(`Generating ${index+1} of ${names.length}…`)
        if(kind==='png'){
          zip.file(`${safeFilename(name)}-certificate.png`,await canvasBlob(makeCanvas(name)))
        }else{
          zip.file(`${safeFilename(name)}-certificate.pdf`,await makePdfBlob(name))
        }
        if(index%4===3)await new Promise(resolve=>window.setTimeout(resolve,0))
      }
      setExportProgress('Preparing ZIP…')
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}})
      downloadBlob(blob,`certificates-${kind}.zip`)
      setNotice(`${names.length} certificate${names.length===1?'':'s'} exported.`)
    }catch(e){setError(friendlyErrorMessage(e,'Could not export certificates.'))}
    finally{setExporting('');setExportProgress('')}
  }

  const templateLabel=settings.template_path?.split('/').pop()||'No template uploaded'
  const fontLabel=settings.font_path?settings.font_family:'Default Georgia preview'

  if(loading)return <div className="loading-card card">Loading certificate generator…</div>

  return <section className="certificates-page">
    <div className="page-heading compact">
      <div><p className="eyebrow">Admin tools</p><h1>Certificates</h1><p className="subtitle">Upload the certificate artwork and name font, paste recipient names, preview the placement, and export print-ready certificates.</p></div>
      <div className="certificate-name-count"><strong>{names.length}</strong><span>recipient{names.length===1?'':'s'}</span></div>
    </div>

    {error&&<div className="form-error">{error}</div>}
    {notice&&<div className="form-success">{notice}</div>}

    <div className="certificate-workspace">
      <aside className="card certificate-controls">
        <div className="certificate-control-section">
          <div className="certificate-section-heading"><span className="certificate-step">1</span><div><strong>Certificate artwork</strong><small>PNG, JPG or SVG · up to 20 MB</small></div></div>
          <label className="certificate-upload-box">
            <FileImage size={20}/>
            <span><strong>{templateLabel}</strong><small>Use a high-resolution export for the sharpest result.</small></span>
            <input type="file" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" disabled={uploading!==''} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadTemplate(file);e.currentTarget.value=''}}/>
            <span className="secondary-button">{uploading==='template'?<><Loader2 className="spin" size={15}/> Uploading…</>:<><Upload size={15}/> {settings.template_path?'Replace':'Upload'}</>}</span>
          </label>
        </div>

        <div className="certificate-control-section">
          <div className="certificate-section-heading"><span className="certificate-step">2</span><div><strong>Recipient name font</strong><small>TTF or OTF · up to 10 MB</small></div></div>
          <label className="certificate-upload-box">
            <Type size={20}/>
            <span><strong>{fontLabel}</strong><small>The uploaded font is used in preview and exports.</small></span>
            <input type="file" accept=".ttf,.otf,font/ttf,font/otf" disabled={uploading!==''} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadFont(file);e.currentTarget.value=''}}/>
            <span className="secondary-button">{uploading==='font'?<><Loader2 className="spin" size={15}/> Uploading…</>:<><Upload size={15}/> {settings.font_path?'Replace':'Upload'}</>}</span>
          </label>
        </div>

        <div className="certificate-control-section">
          <div className="certificate-section-heading"><span className="certificate-step">3</span><div><strong>Names</strong><small>One recipient per line; duplicates are removed.</small></div></div>
          <textarea className="certificate-names-input" rows={9} value={namesText} onChange={e=>{setNamesText(e.target.value);setPreviewIndex(0)}} placeholder={'Ada Lovelace\nGrace Hopper\nKatherine Johnson'}/>
          {names.length>0&&<div className="certificate-recipient-strip">{names.slice(0,8).map((name,index)=><button key={name} type="button" className={previewIndex===index?'active':''} onClick={()=>setPreviewIndex(index)}>{name}</button>)}{names.length>8&&<span>+{names.length-8} more</span>}</div>}
        </div>

        <div className="certificate-control-section">
          <div className="certificate-section-heading"><span className="certificate-step">4</span><div><strong>Name placement</strong><small>Click directly on the preview to reposition the name.</small></div></div>
          <div className="certificate-setting-grid">
            <label><span>X position</span><input type="number" min="0" max="100" step="0.1" value={settings.x_percent} onChange={e=>setSettings(current=>({...current,x_percent:Number(e.target.value)}))}/><small>%</small></label>
            <label><span>Y position</span><input type="number" min="0" max="100" step="0.1" value={settings.y_percent} onChange={e=>setSettings(current=>({...current,y_percent:Number(e.target.value)}))}/><small>%</small></label>
            <label><span>Font size</span><input type="number" min="8" max="300" step="1" value={settings.font_size} onChange={e=>setSettings(current=>({...current,font_size:Number(e.target.value)}))}/><small>px</small></label>
            <label><span>Max width</span><input type="number" min="10" max="100" step="1" value={settings.max_width_percent} onChange={e=>setSettings(current=>({...current,max_width_percent:Number(e.target.value)}))}/><small>%</small></label>
            <label className="certificate-color-field"><span>Name colour</span><input type="color" value={settings.color} onChange={e=>setSettings(current=>({...current,color:e.target.value}))}/><input type="text" value={settings.color} maxLength={7} onChange={e=>/^#[0-9A-Fa-f]{0,6}$/.test(e.target.value)&&setSettings(current=>({...current,color:e.target.value}))}/></label>
          </div>
          <button type="button" className="secondary-button certificate-save-settings" onClick={()=>void savePlacement()} disabled={saving}>{saving?<Loader2 className="spin" size={15}/>:<Save size={15}/>} {saving?'Saving…':'Save placement'}</button>
        </div>
      </aside>

      <div className="certificate-main">
        <div className="card certificate-preview-card">
          <div className="card-header"><div><p className="eyebrow">Live preview</p><h2>{previewName}</h2><p>Names automatically shrink when they exceed the configured maximum width.</p></div>{settings.template_path&&<span className="status green">Template ready</span>}</div>
          <div className={settings.template_path?'certificate-canvas-shell ready':'certificate-canvas-shell'}>
            {settings.template_path?<canvas ref={canvasRef} onClick={moveNameFromPreview} aria-label="Certificate preview. Click to position the recipient name."/>:<div className="certificate-empty-preview"><FileImage size={30}/><strong>Upload your certificate artwork</strong><span>The design stays unchanged; ApplyFlow only places the recipient name over it.</span></div>}
          </div>
          <div className="certificate-current-actions">
            <button type="button" className="secondary-button" disabled={!settings.template_path||exporting!==''} onClick={()=>void exportCurrent('png')}><Download size={15}/> PNG preview</button>
            <button type="button" className="secondary-button" disabled={!settings.template_path||exporting!==''} onClick={()=>void exportCurrent('pdf')}><FileText size={15}/> PDF preview</button>
          </div>
        </div>

        <div className="card certificate-export-card">
          <div><p className="eyebrow">Bulk export</p><h2>Generate certificates</h2><p>Each recipient is exported as an individual file inside a ZIP, so the files remain easy to share or print separately.</p></div>
          <div className="certificate-export-actions">
            <button type="button" className="primary-button" disabled={!names.length||!settings.template_path||exporting!==''} onClick={()=>void exportAll('png')}>{exporting==='png-all'?<Loader2 className="spin" size={16}/>:<Download size={16}/>} Export {names.length||0} PNG{names.length===1?'':'s'}</button>
            <button type="button" className="secondary-button" disabled={!names.length||!settings.template_path||exporting!==''} onClick={()=>void exportAll('pdf')}>{exporting==='pdf-all'?<Loader2 className="spin" size={16}/>:<FileText size={16}/>} Export {names.length||0} PDF{names.length===1?'':'s'}</button>
          </div>
          {exportProgress&&<div className="certificate-export-progress"><Loader2 className="spin" size={14}/><span>{exportProgress}</span></div>}
          <div className="certificate-quality-note"><strong>Quality note</strong><span>The output uses the template’s native pixel dimensions. For print-quality certificates, upload an SVG or a high-resolution PNG/JPG instead of a screenshot.</span></div>
        </div>
      </div>
    </div>
  </section>
}
