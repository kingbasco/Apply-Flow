import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};

const applyflowAllowedOrigins = new Set([
  "https://apply-flow-one.vercel.app",
  "https://apply-flow-bascocreative.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  ...(Deno.env.get("APPLYFLOW_ALLOWED_ORIGINS") || "").split(",").map((value) => value.trim()).filter(Boolean),
]);

function applyflowOriginAllowed(req: Request) {
  const origin = req.headers.get("origin");
  return !origin || applyflowAllowedOrigins.has(origin);
}

Deno.serve(async(req)=>{
 if(!applyflowOriginAllowed(req)) return new Response(JSON.stringify({error:"Request origin is not allowed."}),{status:403,headers:{...corsHeaders,"Content-Type":"application/json"}});
 if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
 const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
 try{
  const auth=req.headers.get("Authorization"); if(!auth?.startsWith("Bearer ")) return json({error:"Authentication required."},401);
  const {createClient}=await import("npm:@supabase/supabase-js@2.57.4");
  const url=Deno.env.get("SUPABASE_URL")!, anon=Deno.env.get("SUPABASE_ANON_KEY")!, service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const admin=createClient(url,service);
  const {data:u,error:ue}=await userClient.auth.getUser(); if(ue||!u.user)return json({error:"Invalid session."},401);
  const body=await req.json(); const documentId=String(body?.document_id||""); if(!documentId)return json({error:"document_id is required."},400);
  const {data:doc,error:de}=await admin.from("uploaded_documents").select("id,organization_id,submission_id,storage_bucket,storage_path,original_name,mime_type,extraction_status").eq("id",documentId).single();
  if(de||!doc)return json({error:"Document not found."},404);
  const {data:profile}=await admin.from("profiles").select("organization_id,role").eq("id",u.user.id).single();
  if(!profile||profile.organization_id!==doc.organization_id||!["owner","admin"].includes(profile.role))return json({error:"Not authorized."},403);
  await admin.from("uploaded_documents").update({extraction_status:"processing",status:"uploaded",updated_at:new Date().toISOString()}).eq("id",documentId);

  const {data:file,error:fe}=await admin.storage.from(doc.storage_bucket).download(doc.storage_path);
  if(fe||!file)throw new Error("Could not download the uploaded document.");
  const type=doc.mime_type||file.type||"application/octet-stream";
  let extracted="";
  if(type.startsWith("text/")||["application/json","application/csv","text/csv"].includes(type)){
    extracted=await file.text();
  } else if(type.startsWith("image/")){
    const bytes=new Uint8Array(await file.arrayBuffer());
    let binary=""; for(let i=0;i<bytes.length;i+=0x8000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    const dataUrl="data:"+type+";base64,"+btoa(binary);
    const key=Deno.env.get("OPENAI_API_KEY"); if(!key)throw new Error("OPENAI_API_KEY is not configured.");
    const model=Deno.env.get("OPENAI_MODEL")||"gpt-5.6-luna";
    const response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json"},body:JSON.stringify({
      model,store:false,input:[{role:"user",content:[
        {type:"input_text",text:"Extract the useful factual text from this uploaded application document/image. Preserve names, dates, numbers, IDs, addresses and other visible text accurately. Do not infer or add information. If text is unclear, say [unclear]. Return plain extracted text only."},
        {type:"input_image",image_url:dataUrl}
      ]}]
    })});
    if(!response.ok)throw new Error("OpenAI document extraction failed.");
    const result=await response.json(); extracted=result.output_text||"";
  } else {
    await admin.from("uploaded_documents").update({extraction_status:"not_supported",updated_at:new Date().toISOString()}).eq("id",documentId);
    return json({document_id:documentId,status:"not_supported",message:"This file type does not have an extractor yet."});
  }
  if(!extracted.trim())throw new Error("No extractable text was returned.");
  const {error:saveError}=await admin.from("uploaded_documents").update({extracted_text:extracted.slice(0,50000),extraction_status:"completed",updated_at:new Date().toISOString()}).eq("id",documentId);
  if(saveError)throw saveError;
  return json({document_id:documentId,status:"completed"});
 }catch(error){
  const message=error instanceof Error?error.message:"Document extraction failed.";
  return json({error:message},500);
 }
});