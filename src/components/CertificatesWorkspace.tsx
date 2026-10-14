import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, FileImage, FileText, Loader2, Plus, Save, Trash2, Type, Upload } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'
import './CertificatesWorkspace.css'

type CertificateSettings = {
  id:string
  organization_id:string
  name:string
  template_path:string|null
  template_mime_type:string|null
  font_path:string|null
  font_family:string
  x_percent:number
  y_percent:number
  font_size:number
  max_width_percent:number
  color:string
  created_at:string
  updated_at?:string
}

const DEFAULT_SETTINGS:Omit<CertificateSettings,'id'|'organization_id'|'name'|'created_at'> = {
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
type ExportQuality='standard'|'high'|'ultra'

function exportScale(quality:ExportQuality){
  if(quality==='standard')return 2
  if(quality==='high')return 4
  return 6
}

function safeScale(width:number,height:number,requested:number){
  const maxDimension=12000
  const maxPixels=80_000_000
  const dimensionScale=Math.min(maxDimension/Math.max(width,1),maxDimension/Math.max(height,1))
  const pixelScale=Math.sqrt(maxPixels/Math.max(width*height,1))
  return Math.max(1,Math.min(requested,dimensionScale,pixelScale))
}

function svgGeometry(svgText:string){
  const parser=new DOMParser()
  const document=parser.parseFromString(svgText,'image/svg+xml')
  if(document.querySelector('parsererror'))throw new Error('The SVG template is not valid.')
  const root=document.documentElement
  const viewBox=(root.getAttribute('viewBox')||'').trim().split(/[\s,]+/).map(Number)
  if(viewBox.length===4&&viewBox.every(Number.isFinite)&&viewBox[2]>0&&viewBox[3]>0){
    return {minX:viewBox[0],minY:viewBox[1],width:viewBox[2],height:viewBox[3]}
  }
  const width=Number.parseFloat(root.getAttribute('width')||'0')
  const height=Number.parseFloat(root.getAttribute('height')||'0')
  if(width>0&&height>0)return{minX:0,minY:0,width,height}
  return{minX:0,minY:0,width:1600,height:1131}
}

function sanitizeSvgDocument(document:Document){
  document.querySelectorAll('script,foreignObject,iframe,object,embed').forEach(node=>node.remove())
  document.querySelectorAll('*').forEach(element=>{
    for(const attribute of Array.from(element.attributes)){
      const name=attribute.name.toLowerCase()
      const value=attribute.value.trim().toLowerCase()
      if(name.startsWith('on'))element.removeAttribute(attribute.name)
      if((name==='href'||name==='xlink:href')&&value&&!value.startsWith('#')&&!value.startsWith('data:')){
        element.removeAttribute(attribute.name)
      }
      if((name==='style'||name==='filter'||name==='clip-path'||name==='mask')&&/url\(\s*['"]?https?:/i.test(attribute.value)){
        element.removeAttribute(attribute.name)
      }
    }
  })
}

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
  const [templates,setTemplates]=useState<CertificateSettings[]>([])
  const [activeTemplateId,setActiveTemplateId]=useState('')
  const [settings,setSettings]=useState<CertificateSettings>({id:'',organization_id:organizationId,name:'Certificate Template',created_at:new Date().toISOString(),...DEFAULT_SETTINGS})
  const [namesText,setNamesText]=useState('')
  const names=useMemo(()=>parseNames(namesText),[namesText])
  const [previewIndex,setPreviewIndex]=useState(0)
  const previewName=names[previewIndex]||'Recipient Name'
  const [templateUrl,setTemplateUrl]=useState('')
  const [rawSvgText,setRawSvgText]=useState('')
  const [fontUrl,setFontUrl]=useState('')
  const [fontDataUrl,setFontDataUrl]=useState('')
  const [exportQuality,setExportQuality]=useState<ExportQuality>('ultra')
  const templateImageRef=useRef<HTMLImageElement|null>(null)
  const fontFaceRef=useRef<FontFace|null>(null)
  const canvasRef=useRef<HTMLCanvasElement|null>(null)
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [uploading,setUploading]=useState<'template'|'font'|''>('')
  const [exporting,setExporting]=useState<'png'|'pdf'|'svg'|'png-all'|'pdf-all'|'svg-all'|''>('')
  const [exportProgress,setExportProgress]=useState('')
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')

  function normalizeTemplate(row:any):CertificateSettings{
    return {
      ...row,
      id:String(row.id),
      organization_id:String(row.organization_id),
      name:String(row.name||'Certificate Template'),
      created_at:String(row.created_at||new Date().toISOString()),
      x_percent:Number(row.x_percent),
      y_percent:Number(row.y_percent),
      font_size:Number(row.font_size),
      max_width_percent:Number(row.max_width_percent),
    }
  }

  async function loadAssets(next:CertificateSettings,isCancelled=false){
    templateImageRef.current=null
    if(next.template_path){
      const {data,error}=await supabase.storage.from(STORAGE_BUCKET).download(next.template_path)
      if(error)throw error
      const svgText=next.template_mime_type==='image/svg+xml'?await data.text():''
      if(!isCancelled){
        setRawSvgText(svgText)
        const url=URL.createObjectURL(data)
        setTemplateUrl(current=>{if(current)URL.revokeObjectURL(current);return url})
      }
    }else if(!isCancelled){
      setRawSvgText('')
      setTemplateUrl(current=>{if(current)URL.revokeObjectURL(current);return ''})
    }
    if(next.font_path){
      const {data,error}=await supabase.storage.from(STORAGE_BUCKET).download(next.font_path)
      if(error)throw error
      const dataUrl=await blobToDataUrl(data)
      if(!isCancelled){
        setFontDataUrl(dataUrl)
        const url=URL.createObjectURL(data)
        setFontUrl(current=>{if(current)URL.revokeObjectURL(current);return url})
      }
    }else if(!isCancelled){
      setFontDataUrl('')
      setFontUrl(current=>{if(current)URL.revokeObjectURL(current);return ''})
    }
  }

  async function loadTemplateList(preferredId=''){
    const {data,error:settingsError}=await supabase
      .from('certificate_settings')
      .select('id,organization_id,name,template_path,template_mime_type,font_path,font_family,x_percent,y_percent,font_size,max_width_percent,color,created_at,updated_at')
      .eq('organization_id',organizationId)
      .order('updated_at',{ascending:false})
    if(settingsError)throw settingsError
    let list=(data||[]).map(normalizeTemplate)
    if(!list.length){
      const {data:created,error:createError}=await supabase
        .from('certificate_settings')
        .insert({organization_id:organizationId,name:'Certificate Template',...DEFAULT_SETTINGS})
        .select('id,organization_id,name,template_path,template_mime_type,font_path,font_family,x_percent,y_percent,font_size,max_width_percent,color,created_at,updated_at')
        .single()
      if(createError)throw createError
      list=[normalizeTemplate(created)]
    }
    setTemplates(list)
    const next=list.find(item=>item.id===preferredId)||list[0]
    setActiveTemplateId(next.id)
    setSettings(next)
    await loadAssets(next)
  }

  useEffect(()=>{
    let cancelled=false
    async function load(){
      setLoading(true);setError('')
      try{
        const {data,error:settingsError}=await supabase
          .from('certificate_settings')
          .select('id,organization_id,name,template_path,template_mime_type,font_path,font_family,x_percent,y_percent,font_size,max_width_percent,color,created_at,updated_at')
          .eq('organization_id',organizationId)
          .order('updated_at',{ascending:false})
        if(settingsError)throw settingsError
        let list=(data||[]).map(normalizeTemplate)
        if(!list.length){
          const {data:created,error:createError}=await supabase
            .from('certificate_settings')
            .insert({organization_id:organizationId,name:'Certificate Template',...DEFAULT_SETTINGS})
            .select('id,organization_id,name,template_path,template_mime_type,font_path,font_family,x_percent,y_percent,font_size,max_width_percent,color,created_at,updated_at')
            .single()
          if(createError)throw createError
          list=[normalizeTemplate(created)]
        }
        if(cancelled)return
        setTemplates(list)
        const next=list[0]
        setActiveTemplateId(next.id)
        setSettings(next)
        await loadAssets(next,cancelled)
      }catch(e){
        if(!cancelled)setError(friendlyErrorMessage(e,'Could not load certificate templates.'))
      }finally{
        if(!cancelled)setLoading(false)
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

  function fittedFontSize(name:string,width:number){
    const measure=document.createElement('canvas').getContext('2d')
    let size=Math.max(8,Number(settings.font_size)||72)
    if(!measure)return size
    const family=fontFaceRef.current?`"${FONT_FACE_NAME}"`:'Georgia'
    measure.font=`${size}px ${family}`
    const maximum=width*(Number(settings.max_width_percent)||72)/100
    const measured=measure.measureText(name).width
    if(measured>maximum&&measured>0)size=Math.max(8,size*(maximum/measured))
    return size
  }

  function drawCertificate(name:string,canvas:HTMLCanvasElement,requestedScale=1){
    const image=templateImageRef.current
    if(!image)throw new Error('Upload a certificate template first.')
    const width=image.naturalWidth||image.width
    const height=image.naturalHeight||image.height
    if(!width||!height)throw new Error('The certificate template has no valid dimensions.')
    const scale=safeScale(width,height,requestedScale)
    canvas.width=Math.max(1,Math.round(width*scale))
    canvas.height=Math.max(1,Math.round(height*scale))
    const context=canvas.getContext('2d')
    if(!context)throw new Error('Your browser could not create the certificate canvas.')
    context.imageSmoothingEnabled=true
    context.imageSmoothingQuality='high'
    context.setTransform(scale,0,0,scale,0,0)
    context.clearRect(0,0,width,height)
    context.drawImage(image,0,0,width,height)
    context.save()
    context.textAlign='center'
    context.textBaseline='middle'
    context.fillStyle=settings.color
    const family=fontFaceRef.current?`"${FONT_FACE_NAME}"`:'Georgia'
    const size=fittedFontSize(name,width)
    context.font=`${size}px ${family}`
    context.fillText(name,width*settings.x_percent/100,height*settings.y_percent/100)
    context.restore()
    context.setTransform(1,0,0,1,0,0)
  }

  function buildCertificateSvg(name:string){
    if(!rawSvgText)throw new Error('The original SVG template could not be loaded.')
    const parser=new DOMParser()
    const document=parser.parseFromString(rawSvgText,'image/svg+xml')
    if(document.querySelector('parsererror'))throw new Error('The SVG template is not valid.')
    sanitizeSvgDocument(document)
    const root=document.documentElement
    const geometry=svgGeometry(rawSvgText)
    const defs=document.createElementNS('http://www.w3.org/2000/svg','defs')
    if(fontDataUrl){
      const style=document.createElementNS('http://www.w3.org/2000/svg','style')
      style.textContent=`@font-face{font-family:"${FONT_FACE_NAME}";src:url("${fontDataUrl}");font-weight:normal;font-style:normal;}`
      defs.appendChild(style)
    }
    root.insertBefore(defs,root.firstChild)
    const text=document.createElementNS('http://www.w3.org/2000/svg','text')
    const x=geometry.minX+geometry.width*settings.x_percent/100
    const y=geometry.minY+geometry.height*settings.y_percent/100
    const size=fittedFontSize(name,geometry.width)
    text.setAttribute('x',String(x))
    text.setAttribute('y',String(y))
    text.setAttribute('fill',settings.color)
    text.setAttribute('font-size',String(size))
    text.setAttribute('font-family',fontDataUrl?FONT_FACE_NAME:'Georgia')
    text.setAttribute('font-weight','normal')
    text.setAttribute('text-anchor','middle')
    text.setAttribute('dominant-baseline','middle')
    text.setAttribute('class','applyflow-certificate-recipient')
    text.textContent=name
    root.appendChild(text)
    if(!root.getAttribute('viewBox')){
      root.setAttribute('viewBox',`${geometry.minX} ${geometry.minY} ${geometry.width} ${geometry.height}`)
    }
    return{
      svgText:new XMLSerializer().serializeToString(document),
      width:geometry.width,
      height:geometry.height,
    }
  }

  async function svgCanvas(name:string,quality:ExportQuality){
    const finalSvg=buildCertificateSvg(name)
    const requested=exportScale(quality)
    const scale=safeScale(finalSvg.width,finalSvg.height,requested)
    const targetWidth=Math.max(1,Math.round(finalSvg.width*scale))
    const targetHeight=Math.max(1,Math.round(finalSvg.height*scale))
    const blob=new Blob([finalSvg.svgText],{type:'image/svg+xml;charset=utf-8'})
    const canvas=document.createElement('canvas')
    canvas.width=targetWidth
    canvas.height=targetHeight
    const context=canvas.getContext('2d')
    if(!context)throw new Error('Your browser could not create the certificate canvas.')
    context.imageSmoothingEnabled=true
    context.imageSmoothingQuality='high'
    if('createImageBitmap' in window){
      try{
        const bitmap=await createImageBitmap(blob,{resizeWidth:targetWidth,resizeHeight:targetHeight,resizeQuality:'high'})
        context.drawImage(bitmap,0,0,targetWidth,targetHeight)
        bitmap.close()
        return canvas
      }catch{/* fall back to HTMLImageElement below */}
    }
    const url=URL.createObjectURL(blob)
    try{
      const image=new Image()
      image.decoding='async'
      image.src=url
      await image.decode()
      context.drawImage(image,0,0,targetWidth,targetHeight)
      return canvas
    }finally{
      URL.revokeObjectURL(url)
    }
  }

  function renderPreview(){
    const canvas=canvasRef.current
    if(!canvas||!templateImageRef.current)return
    try{drawCertificate(previewName,canvas)}catch{/* handled by setup state */}
  }

  async function persistSettings(next=settings){
    if(!next.id)throw new Error('Select or create a certificate template first.')
    const payload={
      id:next.id,
      organization_id:organizationId,
      name:(next.name||'Certificate Template').trim()||'Certificate Template',
      template_path:next.template_path,
      template_mime_type:next.template_mime_type,
      font_path:next.font_path,
      font_family:next.font_family||'CertificateName',
      x_percent:Number(next.x_percent),
      y_percent:Number(next.y_percent),
      font_size:Number(next.font_size),
      max_width_percent:Number(next.max_width_percent),
      color:next.color,
      created_at:next.created_at,
      updated_at:new Date().toISOString(),
    }
    const {data,error}=await supabase
      .from('certificate_settings')
      .upsert(payload,{onConflict:'id'})
      .select('id,organization_id,name,template_path,template_mime_type,font_path,font_family,x_percent,y_percent,font_size,max_width_percent,color,created_at,updated_at')
      .single()
    if(error)throw error
    const saved=normalizeTemplate(data)
    setSettings(saved)
    setTemplates(current=>[saved,...current.filter(item=>item.id!==saved.id)])
    return saved
  }

  async function selectTemplate(template:CertificateSettings){
    if(template.id===activeTemplateId)return
    setError('');setNotice('');setActiveTemplateId(template.id);setSettings(template);setPreviewIndex(0)
    try{await loadAssets(template)}catch(e){setError(friendlyErrorMessage(e,'Could not load this certificate template.'))}
  }

  async function createTemplate(){
    setSaving(true);setError('');setNotice('')
    try{
      const nextNumber=templates.length+1
      const {data,error}=await supabase
        .from('certificate_settings')
        .insert({organization_id:organizationId,name:`Certificate Template ${nextNumber}`,...DEFAULT_SETTINGS})
        .select('id,organization_id,name,template_path,template_mime_type,font_path,font_family,x_percent,y_percent,font_size,max_width_percent,color,created_at,updated_at')
        .single()
      if(error)throw error
      const created=normalizeTemplate(data)
      setTemplates(current=>[created,...current])
      setActiveTemplateId(created.id)
      setSettings(created)
      setRawSvgText('')
      setTemplateUrl(current=>{if(current)URL.revokeObjectURL(current);return ''})
      setFontDataUrl('')
      setFontUrl(current=>{if(current)URL.revokeObjectURL(current);return ''})
      templateImageRef.current=null
      setNotice('New certificate template created. Upload its artwork and font.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not create a certificate template.'))}
    finally{setSaving(false)}
  }

  async function deleteTemplate(template:CertificateSettings){
    if(!window.confirm(`Delete “${template.name}”? The saved artwork, font and placement settings for this template will be removed.`))return
    setSaving(true);setError('');setNotice('')
    try{
      const paths=[template.template_path,template.font_path].filter(Boolean) as string[]
      if(paths.length){
        const {error:storageError}=await supabase.storage.from(STORAGE_BUCKET).remove(paths)
        if(storageError)throw storageError
      }
      const {error}=await supabase.from('certificate_settings').delete().eq('id',template.id).eq('organization_id',organizationId)
      if(error)throw error
      const remaining=templates.filter(item=>item.id!==template.id)
      if(remaining.length){
        setTemplates(remaining)
        const next=remaining[0]
        setActiveTemplateId(next.id)
        setSettings(next)
        await loadAssets(next)
      }else{
        await loadTemplateList()
      }
      setNotice('Certificate template deleted.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not delete this certificate template.'))}
    finally{setSaving(false)}
  }

  async function savePlacement(){
    setSaving(true);setError('');setNotice('')
    try{
      await persistSettings()
      setNotice('Certificate template saved.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not save certificate template.'))}
    finally{setSaving(false)}
  }

  async function uploadTemplate(file:File){
    const ext=extensionOf(file.name)
    if(!['png','jpg','jpeg','svg'].includes(ext)){setError('Template must be PNG, JPG, JPEG or SVG.');return}
    if(file.size>20*1024*1024){setError('Template must be 20 MB or smaller.');return}
    if(!settings.id){setError('Create a certificate template first.');return}
    setUploading('template');setError('');setNotice('')
    try{
      const path=`${organizationId}/${settings.id}/template.${ext==='jpeg'?'jpg':ext}`
      const {error:uploadError}=await supabase.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:true,contentType:templateContentType(file)})
      if(uploadError)throw uploadError
      const previous=settings.template_path
      const next={...settings,template_path:path,template_mime_type:templateContentType(file)}
      const saved=await persistSettings(next)
      const {data,error:downloadError}=await supabase.storage.from(STORAGE_BUCKET).download(path)
      if(downloadError)throw downloadError
      setRawSvgText(saved.template_mime_type==='image/svg+xml'?await data.text():'')
      const url=URL.createObjectURL(data)
      setTemplateUrl(current=>{if(current)URL.revokeObjectURL(current);return url})
      if(previous&&previous!==path)void supabase.storage.from(STORAGE_BUCKET).remove([previous])
      setNotice('Certificate artwork saved to this template.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not upload certificate template.'))}
    finally{setUploading('')}
  }

  async function uploadFont(file:File){
    const ext=extensionOf(file.name)
    if(!['ttf','otf'].includes(ext)){setError('Name font must be a TTF or OTF file.');return}
    if(file.size>10*1024*1024){setError('Font must be 10 MB or smaller.');return}
    if(!settings.id){setError('Create a certificate template first.');return}
    setUploading('font');setError('');setNotice('')
    try{
      const path=`${organizationId}/${settings.id}/name-font.${ext}`
      const {error:uploadError}=await supabase.storage.from(STORAGE_BUCKET).upload(path,file,{upsert:true,contentType:fontContentType(file)})
      if(uploadError)throw uploadError
      const previous=settings.font_path
      const next={...settings,font_path:path,font_family:file.name.replace(/\.(ttf|otf)$/i,'')||'CertificateName'}
      const saved=await persistSettings(next)
      const {data,error:downloadError}=await supabase.storage.from(STORAGE_BUCKET).download(path)
      if(downloadError)throw downloadError
      setFontDataUrl(await blobToDataUrl(data))
      const url=URL.createObjectURL(data)
      setFontUrl(current=>{if(current)URL.revokeObjectURL(current);return url})
      if(previous&&previous!==path)void supabase.storage.from(STORAGE_BUCKET).remove([previous])
      setNotice('Name font saved to this template.')
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

  function makeRasterCanvas(name:string,quality:ExportQuality){
    const canvas=document.createElement('canvas')
    drawCertificate(name,canvas,exportScale(quality))
    return canvas
  }

  async function makeExportCanvas(name:string,quality:ExportQuality){
    if(settings.template_mime_type==='image/svg+xml'&&rawSvgText)return svgCanvas(name,quality)
    return makeRasterCanvas(name,quality)
  }

  async function makePdfBlob(name:string){
    if(settings.template_mime_type==='image/svg+xml'&&rawSvgText){
      const [{jsPDF}]=await Promise.all([import('jspdf'),import('svg2pdf.js')])
      const finalSvg=buildCertificateSvg(name)
      const parser=new DOMParser()
      const document=parser.parseFromString(finalSvg.svgText,'image/svg+xml')
      const element=document.documentElement as unknown as SVGElement
      const doc=new jsPDF({
        orientation:finalSvg.width>=finalSvg.height?'landscape':'portrait',
        unit:'pt',
        format:[finalSvg.width,finalSvg.height],
        compress:false,
      })
      if(fontDataUrl&&settings.font_path){
        const base64=fontDataUrl.split(',')[1]||''
        const extension=settings.font_path.toLowerCase().endsWith('.otf')?'otf':'ttf'
        const filename=`certificate-name.${extension}`
        doc.addFileToVFS(filename,base64)
        doc.addFont(filename,FONT_FACE_NAME,'normal')
        doc.setFont(FONT_FACE_NAME,'normal')
      }
      await (doc as unknown as {svg:(node:SVGElement,options:{x:number;y:number;width:number;height:number})=>Promise<void>}).svg(element,{
        x:0,y:0,width:finalSvg.width,height:finalSvg.height,
      })
      return doc.output('blob')
    }
    const {PDFDocument}=await import('pdf-lib')
    const canvas=await makeExportCanvas(name,exportQuality)
    const source=templateImageRef.current
    if(!source)throw new Error('Upload a certificate template first.')
    const pageWidth=source.naturalWidth||source.width
    const pageHeight=source.naturalHeight||source.height
    const png=await canvasBlob(canvas,'image/png')
    const pngBytes=await png.arrayBuffer()
    const pdf=await PDFDocument.create()
    const image=await pdf.embedPng(pngBytes)
    const page=pdf.addPage([pageWidth,pageHeight])
    page.drawImage(image,{x:0,y:0,width:pageWidth,height:pageHeight})
    const bytes=await pdf.save({useObjectStreams:false})
    const copy=new Uint8Array(bytes.length)
    copy.set(bytes)
    return new Blob([copy.buffer],{type:'application/pdf'})
  }

  async function exportCurrent(kind:'png'|'pdf'|'svg'){
    setExporting(kind);setError('');setNotice('')
    try{
      if(!settings.template_path||!templateImageRef.current)throw new Error('Upload a certificate template first.')
      const name=previewName
      if(kind==='svg'){
        if(settings.template_mime_type!=='image/svg+xml'||!rawSvgText)throw new Error('SVG export is only available when the template is SVG.')
        const finalSvg=buildCertificateSvg(name)
        downloadBlob(new Blob([finalSvg.svgText],{type:'image/svg+xml;charset=utf-8'}),`${safeFilename(name)}-certificate.svg`)
      }else if(kind==='png'){
        const blob=await canvasBlob(await makeExportCanvas(name,exportQuality),'image/png')
        downloadBlob(blob,`${safeFilename(name)}-certificate.png`)
      }else{
        const blob=await makePdfBlob(name)
        downloadBlob(blob,`${safeFilename(name)}-certificate.pdf`)
      }
    }catch(e){setError(friendlyErrorMessage(e,'Could not export certificate.'))}
    finally{setExporting('');setExportProgress('')}
  }

  async function exportAll(kind:'png'|'pdf'|'svg'){
    if(!names.length){setError('Paste at least one recipient name first.');return}
    setExporting(kind==='png'?'png-all':kind==='pdf'?'pdf-all':'svg-all');setError('');setNotice('')
    try{
      if(!settings.template_path||!templateImageRef.current)throw new Error('Upload a certificate template first.')
      const JSZip=(await import('jszip')).default
      const zip=new JSZip()
      for(let index=0;index<names.length;index++){
        const name=names[index]
        setExportProgress(`Generating ${index+1} of ${names.length}…`)
        if(kind==='svg'){
          if(settings.template_mime_type!=='image/svg+xml'||!rawSvgText)throw new Error('SVG export is only available when the template is SVG.')
          zip.file(`${safeFilename(name)}-certificate.svg`,buildCertificateSvg(name).svgText)
        }else if(kind==='png'){
          zip.file(`${safeFilename(name)}-certificate.png`,await canvasBlob(await makeExportCanvas(name,exportQuality),'image/png'))
        }else{
          zip.file(`${safeFilename(name)}-certificate.pdf`,await makePdfBlob(name))
        }
        if(index%4===3)await new Promise(resolve=>window.setTimeout(resolve,0))
      }
      setExportProgress('Preparing ZIP…')
      const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:9}})
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
            {settings.template_mime_type==='image/svg+xml'&&<button type="button" className="secondary-button" disabled={!settings.template_path||exporting!==''} onClick={()=>void exportCurrent('svg')}><FileImage size={15}/> SVG master</button>}
            <button type="button" className="secondary-button" disabled={!settings.template_path||exporting!==''} onClick={()=>void exportCurrent('png')}><Download size={15}/> PNG preview</button>
            <button type="button" className="secondary-button" disabled={!settings.template_path||exporting!==''} onClick={()=>void exportCurrent('pdf')}><FileText size={15}/> PDF preview</button>
          </div>
        </div>

        <div className="card certificate-export-card">
          <div><p className="eyebrow">Bulk export</p><h2>Generate certificates</h2><p>Each recipient is exported as an individual file inside a ZIP. SVG templates stay vector for SVG/PDF output, while PNG is rasterized at the selected high-resolution scale.</p></div>
          <div className="certificate-export-actions">
            <label className="certificate-quality-picker"><span>PNG quality</span><select value={exportQuality} onChange={e=>setExportQuality(e.target.value as ExportQuality)} disabled={exporting!==''}><option value="standard">Standard · 2×</option><option value="high">High · 4×</option><option value="ultra">Ultra · 6×</option></select></label>
            {settings.template_mime_type==='image/svg+xml'&&<button type="button" className="secondary-button" disabled={!names.length||!settings.template_path||exporting!==''} onClick={()=>void exportAll('svg')}>{exporting==='svg-all'?<Loader2 className="spin" size={16}/>:<FileImage size={16}/>} Export {names.length||0} SVG{names.length===1?'':'s'}</button>}
            <button type="button" className="primary-button" disabled={!names.length||!settings.template_path||exporting!==''} onClick={()=>void exportAll('png')}>{exporting==='png-all'?<Loader2 className="spin" size={16}/>:<Download size={16}/>} Export {names.length||0} PNG{names.length===1?'':'s'}</button>
            <button type="button" className="secondary-button" disabled={!names.length||!settings.template_path||exporting!==''} onClick={()=>void exportAll('pdf')}>{exporting==='pdf-all'?<Loader2 className="spin" size={16}/>:<FileText size={16}/>} Export {names.length||0} PDF{names.length===1?'':'s'}</button>
          </div>
          {exportProgress&&<div className="certificate-export-progress"><Loader2 className="spin" size={14}/><span>{exportProgress}</span></div>}
          <div className="certificate-quality-note"><strong>Maximum-quality export</strong><span>Ultra PNG renders up to 6× the template dimensions with high-quality smoothing. SVG templates remain vector for SVG and PDF export, so lines, logos and text stay sharp at any zoom. Very large raster templates are automatically capped at a safe browser memory limit.</span></div>
        </div>
      </div>
    </div>
  </section>
}
