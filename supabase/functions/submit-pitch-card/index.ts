import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

const cors={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization,apikey,x-client-info,content-type',
  'Access-Control-Allow-Methods':'POST,OPTIONS'
}
const json=(data:Record<string,unknown>,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}
})
function sniff(bytes:Uint8Array){
  if(bytes.length>=8&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return {type:'image/png',ext:'png'}
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return {type:'image/jpeg',ext:'jpg'}
  if(bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP')return {type:'image/webp',ext:'webp'}
  return null
}
serve(async request=>{
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors})
  if(request.method!=='POST')return json({error:'Method not allowed'},405)
  try{
    const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const url=Deno.env.get('SUPABASE_URL')
    if(!serviceKey||!url)return json({error:'Upload service is not configured'},503)
    const form=await request.formData()
    const slug=String(form.get('slug')||'')
    const token=String(form.get('token')||'')
    const name=String(form.get('name')||'')
    const trade=String(form.get('trade')||'')
    const upload=form.get('photo')
    if(!/^[a-z0-9-]{8,100}$/.test(slug)||!/^[a-f0-9]{64}$/i.test(token))return json({error:'Invalid upload session'},400)
    if(!name.trim()||!trade.trim()||name.length>120||trade.length>120||/[\u0000-\u001f\u007f]/.test(name+trade))return json({error:'Enter your name and trade (up to 120 characters each)'},400)
    if(!(upload instanceof File))return json({error:'Choose a photo to upload'},400)
    if(upload.size<1024||upload.size>15*1024*1024)return json({error:'Photo must be between 1 KB and 15 MB'},400)
    const bytes=new Uint8Array(await upload.arrayBuffer())
    const format=sniff(bytes)
    if(!format||upload.type!==format.type)return json({error:'Only valid PNG, JPEG or WebP images are supported'},400)
    const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}})
    const {data:context,error:verifyError}=await db.rpc('pitch_card_upload_context',{p_slug:slug,p_token:token})
    if(verifyError||!context?.organization_id||!context?.event_id||!context?.participant_id)return json({error:'Session expired. Verify your details again.'},401)
    const {data:previous}=await db.from('pitch_card_submissions').select('photo_path')
      .eq('event_id',context.event_id).eq('participant_id',context.participant_id).maybeSingle()
    const path=`${context.organization_id}/${context.event_id}/${context.participant_id}/${crypto.randomUUID()}.${format.ext}`
    const {error:uploadError}=await db.storage.from('pitch-card-photos').upload(path,bytes,{
      contentType:format.type,upsert:false,cacheControl:'3600'
    })
    if(uploadError)return json({error:'Could not save this photograph. Please retry.'},500)
    const {data:committed,error:commitError}=await db.rpc('commit_pitch_card_photo_details',{
      p_slug:slug,p_token:token,p_path:path,p_name:name,p_trade:trade
    })
    if(commitError||!committed?.ok){
      await db.storage.from('pitch-card-photos').remove([path])
      return json({error:'Could not submit this pitch card. Please verify your details again.'},400)
    }
    if(previous?.photo_path&&previous.photo_path!==path){
      await db.storage.from('pitch-card-photos').remove([previous.photo_path])
    }
    return json({ok:true})
  }catch{
    return json({error:'Could not process the photograph. Try again.'},500)
  }
})
