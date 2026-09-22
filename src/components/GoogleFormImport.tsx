import { useMemo, useState } from 'react'
import { CheckCircle2, FileSpreadsheet, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'

type Application={id:string;name:string}

type ParsedCsv={
  headers:string[]
  rows:Record<string,string>[]
}

function parseCsv(text:string):ParsedCsv{
  const rows:string[][]=[]
  let row:string[]=[]
  let cell=''
  let quoted=false
  for(let i=0;i<text.length;i++){
    const ch=text[i]
    if(quoted){
      if(ch==='"'){
        if(text[i+1]==='"'){cell+='"';i++}else quoted=false
      }else cell+=ch
      continue
    }
    if(ch==='"'){quoted=true;continue}
    if(ch===','){row.push(cell);cell='';continue}
    if(ch==='\n'){
      row.push(cell);cell=''
      if(row.some(v=>v.trim()!==''))rows.push(row)
      row=[]
      continue
    }
    if(ch==='\r')continue
    cell+=ch
  }
  if(cell!==''||row.length){row.push(cell);if(row.some(v=>v.trim()!==''))rows.push(row)}
  if(!rows.length)return {headers:[],rows:[]}
  const headers=rows[0].map((h,i)=>h.trim()||`Question ${i+1}`)
  const data=rows.slice(1).map(values=>{
    const item:Record<string,string>={}
    headers.forEach((header,i)=>{item[header]=(values[i]??'').trim()})
    return item
  }).filter(item=>Object.values(item).some(v=>v!==''))
  return {headers,rows:data}
}

function isTimestampHeader(value:string){
  return /^timestamp$/i.test(value.trim())
}

export function GoogleFormImport({applications,organizationId,onClose,onComplete}:{applications:Application[];organizationId:string;onClose:()=>void;onComplete?:()=>void}){
  const [applicationId,setApplicationId]=useState(applications[0]?.id||'')
  const [file,setFile]=useState<File|null>(null)
  const [parsed,setParsed]=useState<ParsedCsv>({headers:[],rows:[]})
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  const [done,setDone]=useState(false)

  const questionHeaders=useMemo(()=>parsed.headers.filter(h=>!isTimestampHeader(h)),[parsed.headers])
  const sampleRows=parsed.rows.slice(0,5)

  async function readFile(next:File|null){
    setFile(next);setError('');setParsed({headers:[],rows:[]});setDone(false)
    if(!next)return
    if(!next.name.toLowerCase().endsWith('.csv')){setError('For Phase 1, upload the CSV exported from the Google Forms response sheet.');return}
    if(next.size>15*1024*1024){setError('CSV file is too large. Please keep the import under 15 MB for this first phase.');return}
    try{
      const text=await next.text()
      const result=parseCsv(text)
      if(!result.headers.length)throw new Error('No response data was found in this CSV.')
      if(result.headers.length<2)throw new Error('The CSV needs at least two columns.')
      setParsed(result)
    }catch(e){setError(e instanceof Error?e.message:'Could not read this CSV file.')}
  }

  async function importPreview(){
    if(!applicationId||!file||!parsed.headers.length||!parsed.rows.length)return
    setBusy(true);setError('')
    try{
      const {data:user}=await supabase.auth.getUser()
      if(!user.user)throw new Error('Your session has expired. Please sign in again.')
      const {data:batch,error:batchError}=await supabase.from('form_import_batches').insert({
        organization_id:organizationId,
        application_id:applicationId,
        source_type:'google_forms_csv',
        file_name:file.name,
        question_headers:questionHeaders,
        row_count:parsed.rows.length,
        metadata:{timestamp_header:parsed.headers.find(isTimestampHeader)||null,phase:1},
        status:'previewed',
        created_by:user.user.id
      }).select('id').single()
      if(batchError)throw batchError
      const chunks:Record<string,unknown>[][]=[]
      for(let i=0;i<parsed.rows.length;i+=500)chunks.push(parsed.rows.slice(i,i+500).map((response,index)=>({batch_id:batch.id,row_number:i+index+1,response})))
      for(const chunk of chunks){
        const {error}=await supabase.from('form_import_rows').insert(chunk)
        if(error)throw error
      }
      setDone(true)
      onComplete?.()
    }catch(e){setError(e instanceof Error?e.message:'Could not save this import.')}
    finally{setBusy(false)}
  }

  return <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Import Google Form responses">
    <div className="modal card import-modal">
      <div className="modal-header">
        <div>
          <p className="eyebrow">Phase 1 · Google Forms</p>
          <h2>Import form responses</h2>
          <p>Upload the CSV exported from your Google Forms response sheet. ApplyFlow will keep the questions dynamic.</p>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close"><X size={18}/></button>
      </div>

      {done ? <div className="import-success">
        <div className="success-mark"><CheckCircle2 size={24}/></div>
        <p className="eyebrow">Import saved</p>
        <h3>{parsed.rows.length.toLocaleString()} responses are ready.</h3>
        <p>The questions and raw responses have been saved for this programme. No applicant IDs or submissions were created yet.</p>
        <div className="import-summary">
          <div><span>Questions</span><strong>{questionHeaders.length}</strong></div>
          <div><span>Responses</span><strong>{parsed.rows.length}</strong></div>
        </div>
        <div className="modal-footer"><button className="primary-button" onClick={onClose}>Done</button></div>
      </div> : <>
        <div className="modal-form">
          <label>Programme
            <select value={applicationId} onChange={e=>setApplicationId(e.target.value)}>
              {applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>

          <label>Google Forms CSV
            <span className="import-dropzone">
              <input type="file" accept=".csv,text/csv" onChange={e=>readFile(e.target.files?.[0]||null)} />
              <Upload size={20}/>
              <strong>{file?file.name:'Choose CSV file'}</strong>
              <span>{file?'File loaded.':'Export your Google Forms responses as CSV first.'}</span>
            </span>
          </label>

          {parsed.headers.length>0&&<div className="import-preview">
            <div className="import-preview-heading">
              <div><p className="eyebrow">Preview</p><h3>{parsed.rows.length.toLocaleString()} responses · {questionHeaders.length} questions</h3></div>
              <FileSpreadsheet size={20}/>
            </div>
            <div className="import-question-list">
              {questionHeaders.map((header,i)=><span key={header+i}>{header}</span>)}
            </div>
            <div className="table-wrap import-preview-table"><table><thead><tr>{parsed.headers.slice(0,6).map((h,i)=><th key={h+i}>{h}</th>)}</tr></thead><tbody>{sampleRows.map((row,i)=><tr key={i}>{parsed.headers.slice(0,6).map((h,j)=><td key={h+j}>{row[h]||'—'}</td>)}</tr>)}</tbody></table></div>
            {parsed.headers.length>6&&<p className="muted import-preview-note">Showing the first 6 columns in the preview. All {parsed.headers.length} columns will be stored.</p>}
          </div>}

          {error&&<div className="form-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" disabled={busy||!applicationId||!file||!parsed.rows.length} onClick={importPreview}>{busy?'Importing…':'Import responses'}</button>
        </div>
      </>}
    </div>
  </div>
}
