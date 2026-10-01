
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

function normalizePhone(value:string){const raw=value.trim();const cc=(Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE")||"234").replace(/\D/g,"");let digits=raw.replace(/\D/g,"");if(raw.startsWith("+")){}else if(digits.startsWith("0"))digits=cc+digits.replace(/^0+/,"");else if(digits.startsWith(cc)){}else return null;return digits.length>=8&&digits.length<=15?digits:null}
Deno.serve(async(req)=>{
 if(!originAllowed(req))return json({error:"Request origin is not allowed."},403);if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});if(req.method!=="POST")return json({error:"Method not allowed."},405);
 try{
  const {user,admin}=await context(req);const body=await req.json();const organizationId=String(body?.organization_id||"");const participantId=String(body?.participant_id||"");const optedIn=Boolean(body?.opted_in);if(!organizationId||!participantId)return json({error:"organization_id and participant_id are required."},400);await requireAdmin(admin,user.id,organizationId);
  const {data:p,error}=await admin.from("participants").select("id,organization_id,applicants(whatsapp_phone)").eq("id",participantId).eq("organization_id",organizationId).single();if(error||!p)return json({error:"Participant not found."},404);
  const phone=normalizePhone(String(p.applicants?.whatsapp_phone||""));if(optedIn&&!phone)return json({error:"This participant does not have a valid WhatsApp number. Use +country-code format or a Nigerian 0-prefixed number."},400);
  const now=new Date().toISOString();const payload={organization_id:organizationId,participant_id:participantId,phone_e164:phone,opted_in:optedIn,source:String(body?.source||"admin_confirmed").slice(0,80),proof_note:String(body?.proof_note||"").slice(0,500)||null,opted_in_at:optedIn?now:null,opted_out_at:optedIn?null:now,recorded_by:user.id,updated_at:now};
  const {data,error:upsertError}=await admin.from("whatsapp_consents").upsert(payload,{onConflict:"participant_id"}).select("*").single();if(upsertError)throw upsertError;return json({consent:data});
 }catch(e){const err=e as any;return json({error:err?.message||"Could not update WhatsApp consent."},err?.status||500)}
});