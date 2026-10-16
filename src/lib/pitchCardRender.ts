export type PitchTextField={
  x:number; y:number; size:number; maxWidth:number; color:string;
  font:string; weight:'normal'|'bold'; align:'left'|'center'|'right'
}
export type PitchPhotoField={
  x:number; y:number; width:number; height:number; fit:'cover'|'contain'
}
export type PitchLayout={photo:PitchPhotoField;name:PitchTextField;trade:PitchTextField}
export const DEFAULT_PITCH_LAYOUT:PitchLayout={
  photo:{x:54,y:15,width:30,height:60,fit:'contain'},
  name:{x:72,y:74,size:52,maxWidth:33,color:'#ffffff',font:'Arial',weight:'bold',align:'center'},
  trade:{x:72,y:81,size:26,maxWidth:33,color:'#ffffff',font:'Arial',weight:'normal',align:'center'}
}
export function bounded(value:number,min:number,max:number){return Math.max(min,Math.min(max,Number.isFinite(value)?value:min))}
export function normalizedLayout(raw:unknown):PitchLayout{
  const source=raw&&typeof raw==='object'?raw as Record<string,any>:{}
  const text=(key:'name'|'trade'):PitchTextField=>{
    const rawText=source[key]&&typeof source[key]==='object'?source[key]:{}
    const fallback=DEFAULT_PITCH_LAYOUT[key]
    return {
      x:bounded(Number(rawText.x??fallback.x),0,100),y:bounded(Number(rawText.y??fallback.y),0,100),
      size:bounded(Number(rawText.size??fallback.size),8,250),
      maxWidth:bounded(Number(rawText.maxWidth??fallback.maxWidth),5,100),
      color:/^#[0-9a-f]{6}$/i.test(String(rawText.color))?rawText.color:fallback.color,
      font:/^[a-zA-Z0-9 _-]{1,50}$/.test(String(rawText.font))?rawText.font:fallback.font,
      weight:rawText.weight==='normal'?'normal':'bold',
      align:rawText.align==='left'||rawText.align==='right'?rawText.align:'center'
    }
  }
  const photo=source.photo&&typeof source.photo==='object'?source.photo:{}
  return {
    photo:{x:bounded(Number(photo.x??DEFAULT_PITCH_LAYOUT.photo.x),0,100),y:bounded(Number(photo.y??DEFAULT_PITCH_LAYOUT.photo.y),0,100),
      width:bounded(Number(photo.width??DEFAULT_PITCH_LAYOUT.photo.width),1,100),height:bounded(Number(photo.height??DEFAULT_PITCH_LAYOUT.photo.height),1,100),
      fit:photo.fit==='cover'?'cover':'contain'},
    name:text('name'),trade:text('trade')
  }
}
// Use the same text-width calculation in the admin editor, participant preview, and exports.
export function measurePitchCardText(ctx:CanvasRenderingContext2D,value:string,field:PitchTextField,width:number){
  const label=value.trim().replace(/\s+/g,' ')
  const baseSize=field.size*(width/1920)
  const fontFamily=field.font.replace(/[^a-zA-Z0-9 _-]/g,'')||'Arial'
  ctx.font=`${field.weight} ${baseSize}px "${fontFamily}", Arial, sans-serif`
  const originalWidth=ctx.measureText(label).width
  const maxWidth=width*field.maxWidth/100
  const fittedSize=originalWidth>maxWidth&&originalWidth>0?Math.max(5,baseSize*maxWidth/originalWidth):baseSize
  ctx.font=`${field.weight} ${fittedSize}px "${fontFamily}", Arial, sans-serif`
  return {label,maxWidth,originalWidth,drawnWidth:ctx.measureText(label).width,baseSize,fittedSize,shrunk:originalWidth>maxWidth}
}
export function paintPitchCard(canvas:HTMLCanvasElement,template:HTMLImageElement,photo:HTMLImageElement|null,name:string,trade:string,layout:PitchLayout,width:number){
  const naturalWidth=template.naturalWidth||template.width
  const naturalHeight=template.naturalHeight||template.height
  if(!naturalWidth||!naturalHeight)throw new Error('Invalid pitch card template.')
  const height=Math.max(1,Math.round(width*naturalHeight/naturalWidth))
  if(canvas.width!==width)canvas.width=width
  if(canvas.height!==height)canvas.height=height
  const ctx=canvas.getContext('2d')
  if(!ctx)throw new Error('This device cannot render the pitch card.')
  ctx.clearRect(0,0,width,height)
  ctx.imageSmoothingEnabled=true
  ctx.imageSmoothingQuality='high'
  ctx.drawImage(template,0,0,width,height)
  if(photo){
    const f=layout.photo,x=width*f.x/100,y=height*f.y/100,w=width*f.width/100,h=height*f.height/100
    const pw=photo.naturalWidth||photo.width,ph=photo.naturalHeight||photo.height
    if(pw>0&&ph>0&&w>0&&h>0){
      const scale=f.fit==='cover'?Math.max(w/pw,h/ph):Math.min(w/pw,h/ph)
      const dw=pw*scale,dh=ph*scale
      ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip()
      ctx.drawImage(photo,x+(w-dw)/2,y+(h-dh)/2,dw,dh)
      ctx.restore()
    }
  }
  const draw=(value:string,field:PitchTextField)=>{
    if(!value.trim())return
    ctx.save()
    const metrics=measurePitchCardText(ctx,value,field,width)
    ctx.textAlign=field.align;ctx.textBaseline='middle'
    ctx.fillStyle=field.color
    // The maxWidth argument keeps even extremely long text inside its allocated line.
    ctx.fillText(metrics.label,width*field.x/100,height*field.y/100,metrics.maxWidth)
    ctx.restore()
  }
  draw(name,layout.name);draw(trade,layout.trade)
}
export function readImage(src:string):Promise<HTMLImageElement>{
  return new Promise((resolve,reject)=>{
    const img=new Image()
    img.crossOrigin='anonymous'
    img.onload=()=>resolve(img)
    img.onerror=()=>reject(new Error('Image could not be loaded.'))
    img.src=src
  })
}
export function canvasPng(canvas:HTMLCanvasElement):Promise<Blob>{
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Unable to export PNG.')),'image/png'))
}
export function downloadPitchBlob(blob:Blob,name:string){
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a');a.href=url;a.download=name
  document.body.appendChild(a);a.click();a.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),4000)
}
export function safePitchFileName(value:string){
  return value.normalize('NFKD').replace(/[^\w -]+/g,'').trim().replace(/\s+/g,'-').slice(0,80)||'participant'
}
