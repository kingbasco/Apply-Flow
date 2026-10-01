
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
const allowedOrigins=new Set(["https://apply-flow-one.vercel.app","https://apply-flow-bascocreative.vercel.app","http://localhost:5173","http://127.0.0.1:5173",...(Deno.env.get("APPLYFLOW_ALLOWED_ORIGINS")||"").split(",").map(v=>v.trim()).filter(Boolean)]);
function originAllowed(req:Request){const origin=req.headers.get("origin");return !origin||allowedOrigins.has(origin)}
async function context(req:Request){
 const authorization=req.headers.get("Authorization");
 if(!authorization?.startsWith("Bearer ")) throw Object.assign(new Error("Authentication required."),{status:401});
 const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}}}); const admin=createClient(url,service);
 const {data,error}=await userClient.auth.getUser(); if(error||!data.user) throw Object.assign(new Error("Invalid session."),{status:401});
 return {user:data.user,admin};
}
async function requireAdmin(admin:any,userId:string,organizationId:string){
 const {data,error}=await admin.from("profiles").select("id,organization_id,role").eq("id",userId).single();
 if(error||!data||data.organization_id!==organizationId||!["owner","admin"].includes(data.role)) throw Object.assign(new Error("Only an Owner or Admin can manage WhatsApp messaging."),{status:403});
}
function cfg(){const accessToken=Deno.env.get("META_WHATSAPP_ACCESS_TOKEN")||"";const phoneNumberId=Deno.env.get("META_WHATSAPP_PHONE_NUMBER_ID")||"";const businessAccountId=Deno.env.get("META_WHATSAPP_BUSINESS_ACCOUNT_ID")||"";const graphVersion=Deno.env.get("META_GRAPH_API_VERSION")||"";const missing=[] as string[];if(!accessToken)missing.push("META_WHATSAPP_ACCESS_TOKEN");if(!phoneNumberId)missing.push("META_WHATSAPP_PHONE_NUMBER_ID");if(!businessAccountId)missing.push("META_WHATSAPP_BUSINESS_ACCOUNT_ID");if(!graphVersion)missing.push("META_GRAPH_API_VERSION");return {accessToken,phoneNumberId,businessAccountId,graphVersion,missing}}

function analyse(components:any[]){const body=components.find(c=>String(c?.type||"").toUpperCase()==="BODY");const bodyText=String(body?.text||"");const bodyVars=[...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(m=>Number(m[1]));const variableCount=bodyVars.length?Math.max(...bodyVars):0;let unsupported="";for(const c of components){if(String(c?.type||"").toUpperCase()!=="BODY"&&/\{\{\d+\}\}/.test(JSON.stringify(c)))unsupported="This first version supports variables in the template body only."}return {bodyText,variableCount,supportsMvp:!unsupported,unsupportedReason:unsupported||null}}
Deno.serve(async(req)=>{
 if(!originAllowed(req))return json({error:"Request origin is not allowed."},403);if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});if(req.method!=="POST")return json({error:"Method not allowed."},405);
 try{
  const {user,admin}=await context(req);const body=await req.json();const organizationId=String(body?.organization_id||"");if(!organizationId)return json({error:"organization_id is required."},400);await requireAdmin(admin,user.id,organizationId);const c=cfg();if(c.missing.length)return json({error:"WhatsApp is not configured.",missing:c.missing},503);
  let url=`https://graph.facebook.com/${c.graphVersion}/${c.businessAccountId}/message_templates?limit=250&fields=id,name,status,category,language,components`;const all:any[]=[];let pages=0;
  while(url&&pages<10){const res=await fetch(url,{headers:{Authorization:`Bearer ${c.accessToken}`}});const payload=await res.json();if(!res.ok)throw new Error(String(payload?.error?.message||"Could not load Meta templates."));all.push(...(payload.data||[]));url=payload?.paging?.next||"";pages++}
  for(const t of all){const a=analyse(Array.isArray(t.components)?t.components:[]);await admin.from("whatsapp_templates").upsert({organization_id:organizationId,meta_template_id:String(t.id),name:String(t.name),language:String(t.language),category:t.category?String(t.category):null,status:String(t.status||"unknown").toLowerCase(),body_text:a.bodyText||null,components:t.components||[],variable_count:a.variableCount,supports_mvp:a.supportsMvp,unsupported_reason:a.unsupportedReason,synced_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"organization_id,meta_template_id"})}
  return json({synced:all.length});
 }catch(e){const err=e as any;return json({error:err?.message||"Could not sync WhatsApp templates."},err?.status||500)}
});