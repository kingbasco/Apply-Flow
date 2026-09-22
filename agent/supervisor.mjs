#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';

const ROOT = process.cwd();
const MAX_ATTEMPTS = Number(process.env.SUPERVISOR_MAX_ATTEMPTS || 5);
const repo = process.env.GITHUB_REPOSITORY || 'kingbasco/Apply-Flow';
const branch = process.env.GITHUB_REF_NAME || 'main';
const log = (m) => console.log('[ApplyFlow Supervisor] ' + m);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function run(cmd,args=[],timeout=120000){
  log('$ ' + cmd + ' ' + args.join(' '));
  try { return execFileSync(cmd,args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:process.env,timeout}); }
  catch(e){ throw new Error([(e.stdout||'').toString(),(e.stderr||'').toString(),e.message].filter(Boolean).join('\n')); }
}
async function json(path,fallback={}){try{return JSON.parse(await readFile(path,'utf8'))}catch{return fallback}}
async function stateWrite(s){await writeFile('agent/state.json',JSON.stringify(s,null,2)+'\n')}

async function permissionGate(){
  if(!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) throw new Error('GITHUB_TOKEN/GH_TOKEN is missing.');
  if(!process.env.VERCEL_TOKEN) throw new Error('VERCEL_TOKEN is missing.');
  try{run('git',['ls-remote','origin'],30000)}catch{throw new Error('GitHub repository is not reachable with the configured credentials.')} 
  try{run('npx',['--yes','vercel@latest','whoami','--token',process.env.VERCEL_TOKEN],60000)}catch{throw new Error('Vercel authentication failed. Check VERCEL_TOKEN permissions.')}
  log('Permission gate passed.');
}
function sha(){return run('git',['rev-parse','HEAD']).trim()}
function status(){return run('git',['status','--porcelain']).trim()}

async function build(){
  try{run('npm',['run','build'],180000);return {ok:true,output:'npm run build passed'}}
  catch(e){return {ok:false,output:e.message}}
}

async function latestVercel(){
  if(!process.env.VERCEL_PROJECT_ID) return null;
  const u=new URL('https://api.vercel.com/v6/deployments');
  u.searchParams.set('projectId',process.env.VERCEL_PROJECT_ID);
  u.searchParams.set('limit','5');
  if(process.env.VERCEL_TEAM_ID) u.searchParams.set('teamId',process.env.VERCEL_TEAM_ID);
  const r=await fetch(u,{headers:{Authorization:'Bearer '+process.env.VERCEL_TOKEN}});
  if(!r.ok) throw new Error('Vercel deployments API '+r.status+': '+await r.text());
  const d=await r.json(); return d.deployments?.[0]||null;
}

async function vercelCheck(){
  const d=await latestVercel();
  if(!d) return {ok:false,status:'UNKNOWN',output:'No Vercel project configured.'};
  const s=d.readyState||d.state||d.status;
  const url=d.url?'https://'+d.url:(d.alias?.[0]||'');
  let logs='';
  if(['ERROR','CANCELED','FAILED'].includes(String(s).toUpperCase())){
    try{logs=run('npx',['--yes','vercel@latest','inspect',url,'--logs','--token',process.env.VERCEL_TOKEN],120000)}catch(e){logs=e.message}
  }
  return {ok:String(s).toUpperCase()==='READY',status:s,url,id:d.uid||d.id,sha:d.meta?.githubCommitSha||d.gitSource?.sha||'',output:logs||('Vercel deployment status: '+s)};
}

async function browserCheck(url){
  if(!url) return {ok:false,output:'No deployment URL available.'};
  try{
    run('agent-browser',['open',url],60000);
    run('agent-browser',['wait','--load','networkidle'],60000);
    const body=run('agent-browser',['eval',"document.body.innerText.trim().length > 0 ? 'HAS_CONTENT' : 'BLANK'"],30000).trim();
    const overlay=run('agent-browser',['eval',"document.querySelector('[data-nextjs-dialog], .vite-error-overlay, #webpack-dev-server-client-overlay') ? 'ERROR_OVERLAY' : 'OK'"],30000).trim();
    try{run('agent-browser',['close'],30000)}catch{}
    return {ok:body==='HAS_CONTENT'&&overlay==='OK',output:'body='+body+'; overlay='+overlay};
  }catch(e){
    try{const r=await fetch(url);const t=await r.text();return {ok:r.ok&&t.length>0,output:'HTTP '+r.status+'; bytes='+t.length+'; browser unavailable: '+e.message}}
    catch(x){return {ok:false,output:'Browser and HTTP checks failed: '+x.message}}
  }
}

async function askModel(evidence,attempt){
  if(!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is missing.');
  const s=await json('agent/state.json',{});
  const prompt='You are the senior coding agent for ApplyFlow.\nRepository: '+repo+'\nBranch: '+branch+'\nAttempt: '+attempt+'/'+MAX_ATTEMPTS+'\nCurrent phase: '+(s.currentPhase||'unknown')+'\n\nRules: diagnose the real root cause; make the smallest safe code fix; never remove auth, RLS or security controls; never expose secrets; do not change production infrastructure settings. Return JSON with diagnosis, action (patch|permission|blocked), patch (a unified git diff directly applicable with git apply, or empty), commitMessage, nextCheck.\n\nEvidence:\n'+JSON.stringify(evidence,null,2);
  const r=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.SUPERVISOR_MODEL||'gpt-5',input:prompt,text:{format:{type:'json_object'}}})});
  if(!r.ok) throw new Error('OpenAI API '+r.status+': '+await r.text());
  const d=await r.json();
  const out=d.output_text||d.output?.flatMap(x=>x.content||[]).map(x=>x.text||'').join('')||'';
  return JSON.parse(out);
}

async function applyPatch(patch){
  if(!patch?.trim()) return;
  await writeFile('/tmp/applyflow.patch',patch);
  run('git',['apply','--check','/tmp/applyflow.patch'],30000);
  run('git',['apply','--index','/tmp/applyflow.patch'],30000);
}
async function commitPush(message){
  if(!status()) return null;
  run('git',['config','user.name','ApplyFlow Supervisor']);
  run('git',['config','user.email','applyflow-supervisor@users.noreply.github.com']);
  run('git',['add','-A']);
  run('git',['commit','-m',message||'fix: supervisor remediation']);
  run('git',['push','origin',branch],120000);
  return sha();
}

async function main(){
  const s=await json('agent/state.json',{currentPhase:1,attempts:0,status:'supervising',maxAttempts:MAX_ATTEMPTS});
  await permissionGate();
  for(let attempt=1;attempt<=MAX_ATTEMPTS;attempt++){
    s.attempts=attempt;s.status='verifying';s.lastSha=sha();await stateWrite(s);
    const b=await build(); const v=await vercelCheck(); const br=v.url?await browserCheck(v.url):{ok:false,output:'Skipped: no deployment URL.'};
    const evidence={git:{sha:sha(),status:status()},build:b,vercel:v,browser:br,phase:s.currentPhase};
    if(b.ok&&v.ok&&br.ok){s.status='phase-passed';s.lastVerification=evidence;s.lastVerifiedAt=new Date().toISOString();await stateWrite(s);log('All checks passed.');return;}
    s.status='diagnosing';s.lastFailure=evidence;await stateWrite(s);
    const result=await askModel(evidence,attempt); log('Diagnosis: '+result.diagnosis);
    if(result.action!=='patch'||!result.patch?.trim()){s.status=result.action==='permission'?'blocked-permission':'blocked';s.blockedReason=result.diagnosis;await stateWrite(s);throw new Error('Supervisor stopped: '+result.diagnosis)}
    await applyPatch(result.patch); s.status='fixed-locally';s.diagnosis=result.diagnosis;await stateWrite(s);
    s.lastSha=await commitPush(result.commitMessage);s.status='pushed';await stateWrite(s);
    log('Code pushed. Waiting for Vercel to create a deployment...'); await sleep(15000);
  }
  s.status='blocked-max-attempts';await stateWrite(s);throw new Error('Supervisor stopped after '+MAX_ATTEMPTS+' remediation cycles.');
}
main().catch(async e=>{console.error(e);try{const s=await json('agent/state.json',{});s.status='error';s.error=e.message;s.updatedAt=new Date().toISOString();await stateWrite(s)}catch{}process.exit(1)});