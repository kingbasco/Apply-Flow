
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

type Mapping="name"|"participant_id"|"programme_name"|"phone";
function metaConfig(){const c=cfg();if(c.missing.length)throw Object.assign(new Error("WhatsApp is not configured."),{status:503,missing:c.missing});return c}
async function recalc(admin:any,campaignId:string){
 const {data:rows}=await admin.from("whatsapp_campaign_recipients").select("status").eq("campaign_id",campaignId);const counts={sent:0,delivered:0,read:0,failed:0,skipped:0,queued:0,sending:0};for(const r of rows||[])(counts as any)[r.status]=((counts as any)[r.status]||0)+1;
 const terminal=counts.queued===0&&counts.sending===0;const status=terminal?(counts.failed>0?(counts.sent+counts.delivered+counts.read>0?"partially_failed":"failed"):"completed"):"sending";
 await admin.from("whatsapp_campaigns").update({status,sent_count:counts.sent+counts.delivered+counts.read,delivered_count:counts.delivered+counts.read,read_count:counts.read,failed_count:counts.failed,skipped_count:counts.skipped,completed_at:terminal?new Date().toISOString():null,updated_at:new Date().toISOString()}).eq("id",campaignId);
}
async function processCampaign(admin:any,campaignId:string,c:any){
 const {data:campaign,error:ce}=await admin.from("whatsapp_campaigns").select("id,application_id,template_id,variable_mappings,applications(name),whatsapp_templates(name,language,variable_count)").eq("id",campaignId).single();if(ce||!campaign)return;
 await admin.from("whatsapp_campaigns").update({status:"sending",started_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",campaignId);
 const {data:rows}=await admin.from("whatsapp_campaign_recipients").select("id,participant_id,phone_e164,status,participants(participant_id,applicants(full_name))").eq("campaign_id",campaignId).eq("status","queued").order("queued_at");
 const mappings=(Array.isArray(campaign.variable_mappings)?campaign.variable_mappings:[]) as Mapping[];
 for(const row of rows||[]){
  const started=new Date().toISOString();const {data:claimed}=await admin.from("whatsapp_campaign_recipients").update({status:"sending",started_at:started,attempt_count:1,updated_at:started}).eq("id",row.id).eq("status","queued").select("id").maybeSingle();if(!claimed)continue;
  const values:any={name:String(row.participants?.applicants?.full_name||"Participant"),participant_id:String(row.participants?.participant_id||""),programme_name:String(campaign.applications?.name||"Programme"),phone:String(row.phone_e164||"")};
  const parameters=mappings.map(key=>({type:"text",text:String(values[key]||"")}));
  const payload:any={messaging_product:"whatsapp",to:row.phone_e164,type:"template",template:{name:campaign.whatsapp_templates?.name,language:{code:campaign.whatsapp_templates?.language}}};if(parameters.length)payload.template.components=[{type:"body",parameters}];
  try{const res=await fetch(`https://graph.facebook.com/${c.graphVersion}/${c.phoneNumberId}/messages`,{method:"POST",headers:{Authorization:`Bearer ${c.accessToken}`,"Content-Type":"application/json"},body:JSON.stringify(payload)});const out=await res.json();if(!res.ok)throw Object.assign(new Error(String(out?.error?.message||"Meta rejected the message.")),{code:String(out?.error?.code||"META_SEND_FAILED")});const messageId=String(out?.messages?.[0]?.id||"");if(!messageId)throw new Error("Meta did not return a message identifier.");await admin.from("whatsapp_campaign_recipients").update({status:"sent",provider_message_id:messageId,sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id)}
  catch(e){const err=e as any;await admin.from("whatsapp_campaign_recipients").update({status:"failed",error_code:String(err?.code||"SEND_FAILED"),error_message:String(err?.message||"Send failed.").slice(0,1000),failed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",row.id)}
 }
 await recalc(admin,campaignId);
}
function normalizePhone(value:string){const raw=value.trim();const cc=(Deno.env.get("WHATSAPP_DEFAULT_COUNTRY_CODE")||"234").replace(/\D/g,"");let digits=raw.replace(/\D/g,"");if(raw.startsWith("+")){}else if(digits.startsWith("0"))digits=cc+digits.replace(/^0+/,"");else if(digits.startsWith(cc)){}else return null;return digits.length>=8&&digits.length<=15?digits:null}
Deno.serve(async(req)=>{
 if(!originAllowed(req))return json({error:"Request origin is not allowed."},403);if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});if(req.method!=="POST")return json({error:"Method not allowed."},405);
 try{
  const {user,admin}=await context(req);const body=await req.json();const organizationId=String(body?.organization_id||"");const applicationId=String(body?.application_id||"");const templateId=String(body?.template_id||"");const participantIds=Array.isArray(body?.participant_ids)?[...new Set(body.participant_ids.map(String))]:[];const clientRequestId=String(body?.client_request_id||"");const mappings=Array.isArray(body?.variable_mappings)?body.variable_mappings.map(String):[];
  if(!organizationId||!applicationId||!templateId||!participantIds.length||!clientRequestId)return json({error:"organization_id, application_id, template_id, participant_ids and client_request_id are required."},400);if(participantIds.length>200)return json({error:"This version supports up to 200 recipients per campaign."},400);if(!/^[0-9a-f-]{36}$/i.test(clientRequestId))return json({error:"Invalid client_request_id."},400);await requireAdmin(admin,user.id,organizationId);const c=metaConfig();
  const {data:existing}=await admin.from("whatsapp_campaigns").select("id,status").eq("organization_id",organizationId).eq("client_request_id",clientRequestId).maybeSingle();if(existing)return json({campaign_id:existing.id,status:existing.status,deduplicated:true},202);
  const {data:app,error:ae}=await admin.from("applications").select("id,name,organization_id").eq("id",applicationId).eq("organization_id",organizationId).single();if(ae||!app)return json({error:"Programme not found."},404);
  const {data:template,error:te}=await admin.from("whatsapp_templates").select("*").eq("id",templateId).eq("organization_id",organizationId).single();if(te||!template)return json({error:"WhatsApp template not found."},404);if(template.status!=="approved")return json({error:"Only approved Meta templates can be sent."},400);if(!template.supports_mvp)return json({error:template.unsupported_reason||"This template is not supported by the current sender."},400);if(Number(template.variable_count)!==mappings.length)return json({error:`This template requires ${template.variable_count} body variable mapping(s).`},400);if(mappings.some((m:string)=>!["name","participant_id","programme_name","phone"].includes(m)))return json({error:"Unsupported template variable mapping."},400);
  const {data:participants,error:pe}=await admin.from("participants").select("id,participant_id,application_id,applicants(whatsapp_phone)").eq("organization_id",organizationId).eq("application_id",applicationId).in("id",participantIds);if(pe)throw pe;
  const foundIds=(participants||[]).map((p:any)=>p.id);const {data:consents}=foundIds.length?await admin.from("whatsapp_consents").select("participant_id,opted_in,phone_e164").in("participant_id",foundIds):{data:[]};const consentMap=new Map((consents||[]).map((x:any)=>[x.participant_id,x]));
  const campaignName=String(body?.name||template.name||"WhatsApp campaign").slice(0,120);const {data:campaign,error:ci}=await admin.from("whatsapp_campaigns").insert({organization_id:organizationId,application_id:applicationId,template_id:templateId,client_request_id:clientRequestId,name:campaignName,language:template.language,variable_mappings:mappings,status:"queued",recipient_count:participantIds.length,created_by:user.id}).select("id").single();if(ci)throw ci;
  const rows:any[]=[];let eligible=0,skipped=0;for(const p of participants||[]){const consent=consentMap.get(p.id) as any;const phone=normalizePhone(String(consent?.phone_e164||p.applicants?.whatsapp_phone||""));let status="queued",error_message=null;if(!consent?.opted_in){status="skipped";error_message="No active WhatsApp opt-in recorded."}else if(!phone){status="skipped";error_message="No valid WhatsApp number."}if(status==="queued")eligible++;else skipped++;rows.push({campaign_id:campaign.id,participant_id:p.id,phone_e164:phone,status,error_message})}
  const missing=participantIds.filter((id:string)=>!foundIds.includes(id));for(const id of missing){rows.push({campaign_id:campaign.id,participant_id:id,phone_e164:null,status:"skipped",error_message:"Participant is outside this programme or organization."});skipped++}
  if(rows.length){const {error:ri}=await admin.from("whatsapp_campaign_recipients").insert(rows);if(ri)throw ri}
  await admin.from("whatsapp_campaigns").update({eligible_count:eligible,skipped_count:skipped,status:eligible?"queued":"completed",completed_at:eligible?null:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",campaign.id);
  if(eligible){EdgeRuntime.waitUntil(processCampaign(admin,campaign.id,c))}
  return json({campaign_id:campaign.id,status:eligible?"queued":"completed",requested:participantIds.length,eligible,skipped},202);
 }catch(e){const err=e as any;return json({error:err?.message||"Could not create WhatsApp campaign.",missing:err?.missing||undefined},err?.status||500)}
});