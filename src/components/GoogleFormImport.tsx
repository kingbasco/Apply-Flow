import { useMemo, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application={id:string;name:string}
type ParsedCsv={headers:string[];rows:Record<string,string>[]}

function parseCsv(text:string):ParsedCsv{
  const rows:string[][]=[];let row:string[]=[];let cell='';let quoted=false
  for(let i=0;i<text.length;i++){const ch=text[i];if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else quoted=false}else cell+=ch;continue}
    if(ch==='"'){quoted=true;continue} if(ch===','){row.push(cell);cell='';continue}
    if(ch==='\n'){row.push(cell);cell='';if(row.some(v=>v.trim()!==''))rows.push(row);row=[];continue}
    if(ch==='\r')continue;cell+=ch}
  if(cell!==''||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row)}
  if(!rows.length)return {headers:[],rows:[]}
  const headers=rows[0].map((h,i)=>h.trim()||`Question ${i+1}`)
  const data=rows.slice(1).map(values=>{const item:Record<string,string>={};headers.forEach((header,i)=>{item[header]=(values[i]??'').trim()});return item}).filter(item=>Object.values(item).some(v=>v!==''))
  return {headers,rows:data}
}
function isTimestampHeader(value:string){return /^timestamp$/i.test(value.trim())}

export function GoogleFormImport({applications,organizationId,onClose,onComplete}:{applications:Application[];organizationId:string;onClose:()=>void;onComplete?:()=>void}){
  const [applicationId,setApplicationId]=useState(applications[0]?.id||'')
  const [file,setFile]=useState<File|null>(null);const [parsed,setParsed]=useState<ParsedCsv>({headers:[],rows:[]})
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [done,setDone]=useState(false)
  const questionHeaders=useMemo(()=>parsed.headers.filter(h=>!isTimestampHeader(h)),[parsed.headers]);const sampleRows=parsed.rows.slice(0,5)
  const validation=useMemo(()=>{const normalized=(value:string)=>value.trim().toLowerCase()
    const nameHeader=parsed.headers.find(h=>['full name','name','applicant name','your name'].includes(normalized(h)))
    const emailHeader=parsed.headers.find(h=>['email','email address'].includes(normalized(h))||normalized(h).startsWith('email address (')))
    const emailCounts=new Map<string,number>();if(emailHeader)for(const row of parsed.rows){const email=normalized(row[emailHeader]||'');if(email)emailCounts.set(email,(emailCounts.get(email)||0)+1)}
    const duplicateEmails=emailHeader?[...emailCounts.values()].filter(count=>count>1).reduce((sum,count)=>sum+count,0):0
    const missingName=nameHeader?parsed.rows.filter(row=>!row[nameHeader]?.trim()).length:0
    const missingEmail=emailHeader?parsed.rows.filter(row=>!row[emailHeader]?.trim()).length:0
    const invalidEmail=emailHeader?parsed.rows.filter(row=>{const email=row[emailHeader]?.trim()||'';return email&&!/^\S+@\S+\.\S+$/.test(email)}).length:0
    return {nameHeader,emailHeader,duplicateEmails,missingName,missingEmail,invalidEmail}},[parsed])

  async function readFile(next:File|null){setFile(next);setError('');setParsed({headers:[],rows:[]});setDone(false);if(!next)return
    if(!next.name.toLowerCase().endsWith('.csv')){setError('For Phase 1, upload the CSV exported from the Google Forms response sheet.');return}
    if(next.size>15*1024*1024){setError('CSV file is too large. Please keep the import under 15 MB for this first phase.');return}
    try{const result=parseCsv(await next.text());if(!result.headers.length)throw new Error('No response data was found in this CSV.');if(result.headers.length<2)throw new Error('The CSV needs at least two columns.');setParsed(result)}
    catch(e){setError(e instanceof Error?e.message:'Could not read this CSV file.')}}
  async function importPreview(){if(!applicationId||!file||!parsed.headers.length||!parsed.rows.length)return;setBusy(true);setError('')
    try{const {data:user}=await supabase.auth.getUser();if(!user.user)throw new Error('Your session has expired. Please sign in again.')
      const {data:batch,error:batchError}=await supabase.from('form_import_batches').insert({organization_id:organizationId,application_id:applicationId,source_type:'google_forms_csv',file_name:file.name,question_headers:questionHeaders,row_count:parsed.rows.length,metadata:{timestamp_header:parsed.headers.find(isTimestampHeader)||null,phase:1},status:'previewed',created_by:user.user.id}).select('id').single();if(batchError)throw batchError
      for(let i=0;i<parsed.rows.length;i+=500){const chunk=parsed.rows.slice(i,i+500).map((response,index)=>({batch_id:batch.id,row_number:i+index+1,response}));const {error}=await supabase.from('form_import_rows').insert(chunk);if(error)throw error}
      const {data:importResult,error:importError}=await supabase.rpc('import_google_form_batch',{p_batch_id:batch.id});if(importError)throw importError;if(importResult?.status!=='imported')throw new Error('The import did not complete.')
      setDone(true);onComplete?.()
    }catch(e){setError(e instanceof Error?e.message:'Could not save this import.')}finally{setBusy(false)}}

  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import Google Form responses"><div className="modal card import-modal">
    <div className="modal-header"><div><p className="eyebrow">Phase 3 · Validation</p><h2>Import form responses</h2><p>Upload the CSV exported from your Google Forms response sheet. ApplyFlow keeps the questions dynamic and checks basic applicant data before import.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button></div>
    {done?<div className="import-success"><div className="success-mark"><CheckCircle2 size={24}/></div><p className="eyebrow">Import saved</p><h3>{parsed.rows.length.toLocaleString()} responses are ready.</h3><p>The questions and responses have been imported into the programme. Applicant records and submissions are now ready for screening.</p><div className="import-summary"><div><span>Questions</span><strong>{questionHeaders.length}</strong></div><div><span>Responses</span><strong>{parsed.rows.length}</strong></div></div><div className="modal-footer"><button className="primary-button" onClick={onClose}>Done</button></div></div>:<>
      <div className="modal-form"><label>Programme<select value={applicationId} onChange={e=>setApplicationId(e.target.value)}>{applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
      <label>Google Forms CSV<span className="import-dropzone"><input type="file" accept=".csv,text/csv" onChange={e=>readFile(e.target.files?.[0]||null)}/><Upload size={20}/><strong>{file?file.name:'Choose CSV file'}</strong><span>{file?'File loaded.':'Export your Google Forms responses as CSV first.'}</span></span></label>
      {parsed.headers.length>0&&<div className="import-preview"><div className="import-preview-heading"><div><p className="eyebrow">Preview</p><h3>{parsed.rows.length.toLocaleString()} responses · {questionHeaders.length} questions</h3></div><FileSpreadsheet size={20}/></div>
      <div className="import-question-list">{questionHeaders.map((header,i)=><span key={header+i}>{header}</span>)}</div>
      <div className="table-wrap import-preview-table"><table><thead><tr>{parsed.headers.slice(0,6).map((h,i)=><th key={h+i}>{h}</th>)}</tr></thead><tbody>{sampleRows.map((row,i)=><tr key={i}>{parsed.headers.slice(0,6).map((h,j)=><td key={h+j}>{row[h]||'—'}</td>)}</tr>)}</tbody></table></div>
      {parsed.headers.length>6&&<p className="muted import-preview-note">Showing the first 6 columns in the preview. All {parsed.headers.length} columns will be stored.</p>}
      <div className="import-validation"><div><strong>Validation</strong><span>{validation.emailHeader||validation.nameHeader?'Basic applicant checks':'No name or email column detected — responses will still be imported.'}</span></div>
      {validation.emailHeader&&<div className="import-validation-row"><span>Email column</span><strong>{validation.emailHeader}</strong></div>}
      {validation.nameHeader&&<div className="import-validation-row"><span>Name column</span><strong>{validation.nameHeader}</strong></div>}
      {validation.missingName>0&&<div className="import-validation-warning">{validation.missingName} response{validation.missingName===1?'':'s'} missing a name.</div>}
      {validation.missingEmail>0&&<div className="import-validation-warning">{validation.missingEmail} response{validation.missingEmail===1?'':'s'} missing an email.</div>}
      {validation.invalidEmail>0&&<div className="import-validation-warning">{validation.invalidEmail} response{validation.invalidEmail===1?'':'s'} has an invalid email format.</div>}
      {validation.duplicateEmails>0&&<div className="import-validation-warning">{validation.duplicateEmails} response{validation.duplicateEmails===1?'':'s'} share a duplicate email. They will remain separate responses.</div>}
      {!validation.missingName&&!validation.missingEmail&&!validation.invalidEmail&&!validation.duplicateEmails&&<div className="import-validation-ok">No basic name/email issues found.</div>}</div></div>}
      {error&&<div className="form-error">{error}</div>}</div>
      <div className="modal-footer"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy||!applicationId||!file||!parsed.rows.length} onClick={importPreview}>{busy?'Importing…':'Import responses'}</button></div>
    </>}</div></div>
}
