import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};

const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,
  headers:{...corsHeaders,"Content-Type":"application/json"}
});

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST")return respond({error:"Method not allowed."},405);

  const supabaseUrl=Deno.env.get("SUPABASE_URL");
  const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!supabaseUrl||!serviceRole)return respond({error:"Server configuration is incomplete."},500);

  const admin=createClient(supabaseUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
  let body:any;
  try{body=await req.json()}catch{return respond({error:"Invalid request body."},400)}

  const token=String(body?.token||"").trim();
  const email=String(body?.email||"").trim().toLowerCase();
  const password=String(body?.password||"");
  const fullName=String(body?.full_name||"").trim();
  const username=String(body?.username||"").trim().toLowerCase();
  const birthMonth=Number(body?.birth_month);
  const birthDay=Number(body?.birth_day);

  if(!token)return respond({error:"Invitation link is missing."},400);
  if(!/^\S+@\S+\.\S+$/.test(email))return respond({error:"Enter a valid email address."},400);
  if(password.length<10)return respond({error:"Password must be at least 10 characters."},400);
  if(fullName.length<2)return respond({error:"Enter your full name."},400);
  if(!/^[a-z0-9_]{3,30}$/.test(username))return respond({error:"Username must be 3–30 characters and use only letters, numbers, or underscores."},400);
  if(!Number.isInteger(birthMonth)||birthMonth<1||birthMonth>12||!Number.isInteger(birthDay)||birthDay<1||birthDay>31)return respond({error:"Select a valid date of birth."},400);

  const {data:detailRows,error:detailsError}=await admin.rpc("get_team_invite_link_details",{p_token:token});
  if(detailsError)return respond({error:detailsError.message},400);
  const invitation=Array.isArray(detailRows)?detailRows[0]:detailRows;
  if(!invitation?.is_valid)return respond({error:invitation?.invalid_reason||"This invitation link cannot be used."},400);

  const {data:created,error:createError}=await admin.auth.admin.createUser({
    email,
    password,
    email_confirm:true,
    user_metadata:{full_name:fullName,username,birth_month:birthMonth,birth_day:birthDay}
  });
  if(createError){
    const friendly=createError.message.toLowerCase().includes("already")
      ?"An ApplyFlow account already exists for this email. Sign in with that account, or use a different email."
      :createError.message;
    return respond({error:friendly},createError.status||400);
  }

  if(!created.user)return respond({error:"Account could not be created."},500);

  const {error:acceptError}=await admin.rpc("accept_team_invite_link_admin",{
    p_token:token,
    p_user_id:created.user.id,
    p_email:email,
    p_full_name:fullName,
    p_username:username,
    p_birth_month:birthMonth,
    p_birth_day:birthDay
  });

  if(acceptError){
    try{await admin.auth.admin.deleteUser(created.user.id)}catch{}
    return respond({error:acceptError.message},400);
  }

  return respond({ok:true,email,organization_name:invitation.organization_name,role:invitation.role});
});
