// Run with node --test tests/email-providers.test.mjs. All transports are mocked;
// this suite never sends email or reads production credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const env = new Map();
globalThis.Deno = { env: { get: key => env.get(key) }, serve: handler => { globalThis.handler = handler; } };
function moduleUrl(source) {
  return 'data:text/javascript;base64,' + Buffer.from(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText).toString('base64');
}
const dir = new URL('../supabase/functions/send-zoho-email/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, dir), 'utf8').replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";', '');
const smtpUrl = moduleUrl(read('smtp.ts'));
const zeptoUrl = moduleUrl(read('zeptomail.ts'));
const providerUrl = moduleUrl(read('providers.ts').replace('"./smtp.ts"', JSON.stringify(smtpUrl)).replace('"./zeptomail.ts"', JSON.stringify(zeptoUrl)));
const { resolveEmailProvider } = await import(providerUrl);
function configure() {
  env.clear();
  for (const [key,value] of Object.entries({ GMAIL_SMTP_USERNAME:'gmail@example.com',GMAIL_SMTP_PASSWORD:'abcd efgh ijkl mnop',ZOHO_SMTP_USERNAME:'zoho@example.com',ZOHO_SMTP_PASSWORD:'zoho-test',ZEPTOMAIL_SEND_TOKEN:'zepto-test',ZEPTOMAIL_FROM_ADDRESS:'zepto@example.com' })) env.set(key,value);
}

test('explicit Gmail routes only to Gmail; legacy default and Zoho remain available', () => {
  configure();
  const gmail = resolveEmailProvider('gmail');
  assert.equal(gmail.zeptoConfig, null);
  assert.deepEqual(gmail.smtpConfig.hosts, ['smtp.gmail.com']);
  assert.equal(gmail.smtpConfig.port,465);
  assert.equal(gmail.smtpConfig.password,'abcdefghijklmnop');
  assert.equal(gmail.smtpConfig.fromAddress,'gmail@example.com');
  assert.equal(resolveEmailProvider().provider,'zeptomail');
  assert.equal(resolveEmailProvider('zoho').smtpConfig.username,'zoho@example.com');
  env.delete('ZEPTOMAIL_SEND_TOKEN');
  assert.equal(resolveEmailProvider().provider,'zoho');
});
test('missing Gmail credentials never fall back and unknown providers are rejected', () => {
  configure();env.delete('GMAIL_SMTP_PASSWORD');
  const result=resolveEmailProvider('gmail');
  assert.equal(result.smtpConfig,null); assert.equal(result.zeptoConfig,null);
  assert.deepEqual(result.missing,['GMAIL_SMTP_PASSWORD']);
  assert.throws(()=>resolveEmailProvider('attacker.example'),/INVALID_PROVIDER/);
});

let role='owner', org='org', authenticated=true, writes=[], sends=0, opened=[];
globalThis.mockCreateClient=()=>({ auth:{getUser:async()=>({data:{user:authenticated?{id:'user'}:null},error:null})}, from(table){
  const q={select(){return q},eq(){return q},in(){return q},single:async()=>({data:table==='profiles'?{id:'user',organization_id:org,role}:{id:'app',name:'Programme',organization_id:'org'},error:null}),
    insert:async row=>{writes.push(row);return {error:null}},then(resolve){return Promise.resolve({data:[1,2,3].map(n=>({id:String(n),participant_id:'P'+n,applicants:{full_name:'Person',email:'person'+n+'@example.com'}})),error:null}).then(resolve)}};
  return q;
}});
globalThis.mockSmtp={closeZohoSmtp:async()=>{},openZohoSmtp:async config=>{opened.push(config.hosts[0]);return {}},validateZohoSmtpSender:async()=>{},sendZohoSmtpMessage:async()=>{if(++sends===2)throw new Error('Daily limit reached')}};
let source=read('index.ts').replace(/import \{[\s\S]*?\} from "\.\/smtp.ts";/, 'const { closeZohoSmtp, openZohoSmtp, sendZohoSmtpMessage, validateZohoSmtpSender } = globalThis.mockSmtp;');
source=source.replace('"./providers.ts"',JSON.stringify(providerUrl)).replace('"./zeptomail.ts"',JSON.stringify(zeptoUrl)).replace('await import("npm:@supabase/supabase-js@2.57.4")','({createClient:globalThis.mockCreateClient})');
await import(moduleUrl(source));
const request=(overrides={},auth=true)=>new Request('https://example.com',{method:'POST',headers:auth?{Authorization:'Bearer test'}:{},body:JSON.stringify({organization_id:'org',application_id:'app',participant_ids:['1','2','3'],subject:'Hello',body:'Hello {{name}}',provider:'gmail',...overrides})});
test('send endpoint rejects unauthenticated and wrong-organisation/staff callers',async()=>{
  configure();
  assert.equal((await handler(request({},false))).status,401);
  org='other';assert.equal((await handler(request())).status,403);org='org';
  role='reviewer';assert.equal((await handler(request())).status,403);role='owner';
  assert.equal(opened.length,0);
});
test('partial SMTP failure preserves accepted recipients and stops without provider fallback',async()=>{
  configure();writes=[];sends=0;opened=[];
  const response=await handler(request());const data=await response.json();
  assert.equal(response.status,200);assert.equal(data.provider,'gmail');
  assert.equal(data.sent_count,1);assert.equal(data.failed_count,1);assert.equal(data.skipped_count,1);
  assert.equal(data.stopped,true);assert.equal(sends,2);
  assert.deepEqual(opened,['smtp.gmail.com']);
  assert.equal(writes[0].metadata.provider,'gmail');
  assert.deepEqual(writes[0].metadata.results.map(r=>r.status),['sent','failed','skipped']);
});
const sendHandler=globalThis.handler;
let statusSource=fs.readFileSync(new URL('../supabase/functions/zoho-mail-status/index.ts',import.meta.url),'utf8')
  .replace('import "jsr:@supabase/functions-js/edge-runtime.d.ts";','')
  .replace(/import \{[^\n]+\} from "\.\/smtp.ts";/,'const {closeZohoSmtp,openZohoSmtp,validateZohoSmtpSender}=globalThis.mockSmtp;')
  .replace('"./providers.ts"',JSON.stringify(providerUrl))
  .replace('await import("npm:@supabase/supabase-js@2.57.4")','({createClient:globalThis.mockCreateClient})');
await import(moduleUrl(statusSource));
const statusHandler=globalThis.handler;
globalThis.handler=sendHandler;
test('Gmail validation authenticates without sending; missing ZeptoMail preserves API identity',async()=>{
  configure();sends=0;opened=[];
  let response=await statusHandler(request({validate:true}));let data=await response.json();
  assert.equal(data.provider,'gmail');assert.equal(data.validated,true);assert.equal(sends,0);
  assert.deepEqual(opened,['smtp.gmail.com']);assert.equal(data.password,undefined);
  env.delete('ZEPTOMAIL_SEND_TOKEN');
  response=await statusHandler(request({provider:'zeptomail'}));data=await response.json();
  assert.equal(data.provider,'zeptomail');assert.equal(data.transport,'api');assert.equal(data.configured,false);
});
