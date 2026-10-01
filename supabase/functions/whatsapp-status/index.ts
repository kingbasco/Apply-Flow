
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

Deno.serve(async(req)=>{
 if(!originAllowed(req))return json({error:"Request origin is not allowed."},403);
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({error:"Method not allowed."},405);
 try{
  const {user,admin}=await context(req);const body=await req.json();const organizationId=String(body?.organization_id||"");if(!organizationId)return json({error:"organization_id is required."},400);await requireAdmin(admin,user.id,organizationId);
  const c=cfg(); if(c.missing.length)return json({configured:false,validated:false,missing:c.missing,provider:"meta",display_phone:null,verified_name:null,quality_rating:null});
  let details:any=null, validationError:string|null=null;
  if(body?.validate){
   const res=await fetch(`https://graph.facebook.com/${c.graphVersion}/${c.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`,{headers:{Authorization:`Bearer ${c.accessToken}`}});
   details=await res.json(); if(!res.ok)validationError=String(details?.error?.message||"Meta connection validation failed.");
  }
  const configured=!validationError;
  await admin.from("whatsapp_connections").upsert({organization_id:organizationId,provider:"meta",business_account_id:c.businessAccountId,phone_number_id:c.phoneNumberId,display_phone:details?.display_phone_number||null,verified_name:details?.verified_name||null,quality_rating:details?.quality_rating||null,status:configured?"configured":"error",last_error:validationError,last_checked_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"organization_id"});
  return json({configured,validated:Boolean(body?.validate&&configured),missing:[],provider:"meta",display_phone:details?.display_phone_number||null,verified_name:details?.verified_name||null,quality_rating:details?.quality_rating||null,validation_error:validationError});
 }catch(e){const err=e as any;return json({error:err?.message||"Could not check WhatsApp connection."},err?.status||500)}
});