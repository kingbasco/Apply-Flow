import "jsr:@supabase/functions-js/edge-runtime.d.ts";

export type ZeptoMailConfig = {
  token: string;
  fromAddress: string;
  fromName: string;
  endpoint: string;
};

export function getZeptoMailConfig(): { config: ZeptoMailConfig | null; missing: string[] } {
  const token=(Deno.env.get("ZEPTOMAIL_SEND_TOKEN")||"").trim();
  const fromAddress=(Deno.env.get("ZEPTOMAIL_FROM_ADDRESS")||"").trim();
  const fromName=(Deno.env.get("ZEPTOMAIL_FROM_NAME")||"ApplyFlow").trim();
  const endpoint=(Deno.env.get("ZEPTOMAIL_API_URL")||"https://api.zeptomail.com/v1.1/email").trim();
  const missing=[
    !token?"ZEPTOMAIL_SEND_TOKEN":"",
    !fromAddress?"ZEPTOMAIL_FROM_ADDRESS":"",
  ].filter(Boolean);
  return missing.length?{config:null,missing}:{config:{token,fromAddress,fromName,endpoint},missing:[]};
}

function authorizationValue(token:string){
  return /^Zoho-enczapikey\s/i.test(token)?token:"Zoho-enczapikey "+token;
}

export async function sendZeptoMailMessage(
  config:ZeptoMailConfig,
  toAddress:string,
  toName:string,
  subject:string,
  content:string,
){
  const response=await fetch(config.endpoint,{
    method:"POST",
    headers:{
      "Accept":"application/json",
      "Content-Type":"application/json",
      "Authorization":authorizationValue(config.token),
    },
    body:JSON.stringify({
      from:{address:config.fromAddress,name:config.fromName||undefined},
      to:[{email_address:{address:toAddress,name:toName||undefined}}],
      subject,
      textbody:content,
      track_opens:false,
      track_clicks:false,
    }),
  });
  const text=await response.text();
  let body:any=null;
  try{body=text?JSON.parse(text):null}catch{body=null}
  if(!response.ok){
    const message=body?.error?.message||body?.message||("ZeptoMail returned HTTP "+response.status+".");
    throw new Error(String(message));
  }
  return {
    request_id:body?.request_id||null,
    message:body?.message||"Email request received",
  };
}
