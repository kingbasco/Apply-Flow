import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Download, RefreshCw, Shuffle, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { friendlyErrorMessage } from '../lib/errors'
import TablePagination from './TablePagination'

type Assignment = { id: string; application_id: string; title: string; max_score: number; status: string }
type Programme = { id: string; name: string }
type Review = {
  submission_id: string; assignment_id: string; participant_id: string; participant_code: string;
  participant_name: string | null; status: 'submitted' | 'graded'; submitted_at: string;
  score: number | null; feedback: string | null; graded_at: string | null;
  reviewer_id: string | null; reviewer_name: string | null; source_group: string | null; assigned_at: string;
}
type Answer = { id: string; question_id: string; value: unknown; assignment_questions: { label: string; type: string; position: number } | null }
type Document = { id: string; question_id: string; storage_bucket: string; storage_path: string; original_name: string; file_size: number | null }

export default function AssignmentReviewPanel({ organizationId, applications, role }:{
  organizationId: string; applications: Programme[]; role: 'owner' | 'admin' | 'reviewer'
}) {
  const isAdmin = role === 'owner' || role === 'admin'
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [programme, setProgramme] = useState('')
  const [assignmentId, setAssignmentId] = useState('')
  const [rows, setRows] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [queueLoading, setQueueLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [filter, setFilter] = useState<'pending' | 'graded' | 'all'>('pending')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selected, setSelected] = useState<Review | null>(null)
  const [answers, setAnswers] = useState<Answer[]>([])
  const [documents, setDocuments] = useState<Document[]>([])
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [grade, setGrade] = useState({score:'',feedback:''})

  useEffect(()=>{
    let alive = true
    async function load(){
      setLoading(true); setError('')
      const {data,error:fetchError} = await supabase.from('assignments')
        .select('id,application_id,title,max_score,status')
        .eq('organization_id',organizationId).order('created_at',{ascending:false})
      if(!alive)return
      if(fetchError)setError(friendlyErrorMessage(fetchError,'Could not load assignments.'))
      else setAssignments((data || []) as Assignment[])
      setLoading(false)
    }
    void load()
    return ()=>{alive=false}
  },[organizationId])

  const availableAssignments=useMemo(
    ()=>assignments.filter(a=>!programme||a.application_id===programme),[assignments,programme])
  useEffect(()=>{
    if(!availableAssignments.some(a=>a.id===assignmentId)){
      setAssignmentId(availableAssignments[0]?.id||'')
    }
  },[availableAssignments,assignmentId])

  useEffect(()=>{
    let alive=true
    async function load(){
      setRows([]);setPage(1);setSelected(null);setError('')
      if(!assignmentId){setQueueLoading(false);return}
      setQueueLoading(true)
      const {data,error:queueError}=await supabase.rpc('get_assignment_review_queue',{p_assignment_id:assignmentId})
      if(!alive)return
      if(queueError)setError(friendlyErrorMessage(queueError,'Could not load the review queue.'))
      else setRows((data||[]) as Review[])
      setQueueLoading(false)
    }
    void load()
    return ()=>{alive=false}
  },[assignmentId])

  const selectedAssignment=assignments.find(a=>a.id===assignmentId)
  const pending=rows.filter(x=>x.status!=='graded').length
  const completed=rows.filter(x=>x.status==='graded').length
  const visible=rows.filter(x=>filter==='all'||(filter==='pending'?x.status!=='graded':x.status==='graded'))
  const paged=pageSize===0?visible:visible.slice((page-1)*pageSize,page*pageSize)
  const reviewerSummary=useMemo(()=>{
    const summary=new Map<string,{id:string;name:string;pending:number;graded:number}>()
    if(!isAdmin)return []
    for(const item of rows){
      const id=item.reviewer_id||'unassigned'
      const entry=summary.get(id)||{id,name:item.reviewer_name||'Unassigned reviewer',pending:0,graded:0}
      if(item.status==='graded')entry.graded++
      else entry.pending++
      summary.set(id,entry)
    }
    return Array.from(summary.values()).sort((a,b)=>(a.pending+a.graded)-(b.pending+b.graded)||a.name.localeCompare(b.name))
  },[rows,isAdmin])

  async function reload(){
    if(!assignmentId)return
    setQueueLoading(true);setError('')
    const {data,error:reloadError}=await supabase.rpc('get_assignment_review_queue',{p_assignment_id:assignmentId})
    if(reloadError)setError(friendlyErrorMessage(reloadError,'Could not refresh assignment reviews.'))
    else setRows((data||[]) as Review[])
    setQueueLoading(false)
  }
  async function reshuffle(){
    if(!isAdmin||!assignmentId)return
    if(!window.confirm('Re-shuffle ALL currently ungraded submissions? Existing scores and graded work will not change. Reviewers will receive new allocations.'))return
    setBusy(true);setError('');setNotice('')
    try{
      const {data,error:shuffleError}=await supabase.rpc('shuffle_assignment_reviews',{p_assignment_id:assignmentId,p_reshuffle:true})
      if(shuffleError)throw shuffleError
      setNotice('Review queue shuffled. '+(data?.assigned||0)+' pending submissions allocated.')
      await reload()
    }catch(e){setError(friendlyErrorMessage(e,'Could not shuffle reviews.'))}
    finally{setBusy(false)}
  }
  async function openSubmission(row:Review){
    setSelected(row);setAnswers([]);setDocuments([])
    setGrade({score:row.score===null?'':String(row.score),feedback:row.feedback||''})
    setDetailsLoading(true);setError('')
    const [answersResult,documentsResult]=await Promise.all([
      supabase.from('assignment_answers').select('id,question_id,value,assignment_questions(label,type,position)').eq('submission_id',row.submission_id),
      supabase.from('assignment_documents').select('id,question_id,storage_bucket,storage_path,original_name,file_size').eq('submission_id',row.submission_id)
    ])
    if(answersResult.error||documentsResult.error)
      setError(friendlyErrorMessage(answersResult.error||documentsResult.error,'Could not load submission.'))
    else {
      setAnswers((answersResult.data||[]) as unknown as Answer[])
      setDocuments((documentsResult.data||[]) as Document[])
    }
    setDetailsLoading(false)
  }
  async function openFile(file:Document){
    const {data,error:storageError}=await supabase.storage.from(file.storage_bucket).createSignedUrl(file.storage_path,300)
    if(storageError||!data?.signedUrl){setError(storageError?.message||'Could not open attachment.');return}
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }
  async function saveGrade(event:React.FormEvent){
    event.preventDefault()
    if(!selected||!selectedAssignment||(selected.status==='graded'&&!isAdmin))return
    const score=Number(grade.score)
    if(!grade.score.trim()||!Number.isFinite(score)||score<0||score>Number(selectedAssignment.max_score)){
      setError('Enter a score between 0 and '+selectedAssignment.max_score+'.');return
    }
    setBusy(true);setError('');setNotice('')
    try{
      const {data,error:gradeError}=await supabase.rpc('grade_assignment_submission',{
        p_submission_id:selected.submission_id,p_score:score,p_feedback:grade.feedback
      })
      if(gradeError)throw gradeError
      const updated:Review={...selected,score,status:'graded',feedback:grade.feedback||null,graded_at:data.graded_at}
      setRows(items=>items.map(item=>item.submission_id===selected.submission_id?updated:item))
      setSelected(null);setNotice('Grade saved successfully.')
    }catch(e){setError(friendlyErrorMessage(e,'Could not save the grade.'))}
    finally{setBusy(false)}
  }

  return <section className="assignment-review-workspace">
    <div className="page-heading compact"><div><p className="eyebrow">Independent marking</p><h1>Assignment Review</h1>
      <p className="subtitle">{isAdmin
        ? 'Monitor every reviewer’s allocated work, grading progress and source groups. Pending work can be re-shuffled without affecting graded submissions.'
        : 'Grade submissions allocated from across the programme. Your usual participant group is still available under Participants → Assignments.'}</p></div>
      <ClipboardCheck size={25}/></div>
    {error&&<div className="form-error">{error}</div>}
    {notice&&<div className="form-message">{notice}</div>}
    <div className="card table-card">
      <div className="toolbar" style={{flexWrap:'wrap',gap:12}}>
        <label>Programme <select value={programme} onChange={e=>{setProgramme(e.target.value);setPage(1)}}>
          <option value="">All programmes</option>
          {applications.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
        <label>Assignment <select value={assignmentId} onChange={e=>setAssignmentId(e.target.value)} disabled={loading}>
          {availableAssignments.length===0?<option value="">No assignments</option>:availableAssignments.map(a=><option key={a.id} value={a.id}>{a.title}</option>)}
        </select></label>
        <button type="button" className="secondary-button" onClick={()=>void reload()} disabled={queueLoading||!assignmentId}>
          <RefreshCw size={15}/> Refresh</button>
        {isAdmin&&<button type="button" className="primary-button" onClick={()=>void reshuffle()} disabled={busy||queueLoading||!assignmentId}>
          <Shuffle size={15}/> Re-shuffle pending</button>}
      </div>
      <div className="attendance-analytics-grid" style={{padding:16}}>
        <div className="attendance-metric"><span>Allocated submissions</span><strong>{rows.length}</strong><small>{isAdmin?'Across all reviewers':'Assigned to you'}</small></div>
        <div className="attendance-metric is-pending"><span>Awaiting grade</span><strong>{pending}</strong><small>To review</small></div>
        <div className="attendance-metric is-present"><span>Graded</span><strong>{completed}</strong><small>Completed reviews</small></div>
      </div>
      {isAdmin&&reviewerSummary.length>0&&<div style={{padding:'0 16px 16px'}}>
        <h3 style={{marginBottom:10}}>Reviewer allocation breakdown</h3>
        <div className="table-wrap"><table><thead><tr><th>Reviewer</th><th>Pending</th><th>Graded</th><th>Total</th></tr></thead>
          <tbody>{reviewerSummary.map(r=><tr key={r.id}><td><strong>{r.name}</strong></td><td>{r.pending}</td><td>{r.graded}</td><td><strong>{r.pending+r.graded}</strong></td></tr>)}</tbody></table></div>
      </div>}
      <div className="workspace-leaderboard-group-tabs" style={{padding:'0 16px 12px'}}>
        {(['pending','graded','all'] as const).map(value=><button key={value} type="button" className={filter===value?'active':''}
          onClick={()=>{setFilter(value);setPage(1)}}><strong>{value==='pending'?'Awaiting grade':value==='graded'?'Graded':'All'}</strong>
          <span>{value==='pending'?pending:value==='graded'?completed:rows.length} submissions</span></button>)}
      </div>
      <div className="table-wrap"><table><thead><tr>
        <th>Participant</th><th>Submitted</th>{isAdmin&&<><th>Original group</th><th>Review allocated to</th></>}
        <th>Status</th><th>Score</th><th>Action</th>
      </tr></thead><tbody>
        {queueLoading?<tr><td colSpan={isAdmin?7:5}><div className="loading-card">Loading review queue…</div></td></tr>
        :paged.length?paged.map(row=><tr key={row.submission_id}>
          <td><strong>{row.participant_name||row.participant_code}</strong><span className="table-sub">{row.participant_code}</span></td>
          <td>{new Date(row.submitted_at).toLocaleString()}</td>
          {isAdmin&&<><td>{row.source_group||'No group'}</td><td>{row.reviewer_name||'Unassigned'}</td></>}
          <td><span className={'status '+(row.status==='graded'?'green':'blue')}>{row.status==='graded'?'Graded':'Awaiting grade'}</span></td>
          <td>{row.score===null?'—':row.score+'/'+(selectedAssignment?.max_score||100)}</td>
          <td><button type="button" className="text-button" onClick={()=>void openSubmission(row)}>
            {row.status==='graded'&&!isAdmin?'View grade':'Open review'}</button></td>
        </tr>):<tr><td colSpan={isAdmin?7:5}><div className="table-empty">{!assignmentId?'Select an assignment.':'No submissions in this review view.'}</div></td></tr>}
      </tbody></table></div>
      {visible.length>0&&<TablePagination total={visible.length} page={page} pageSize={pageSize}
        pageSizes={[20,50,100,200,0]} onPageChange={setPage}
        onPageSizeChange={size=>{setPageSize(size);setPage(1)}}/>}
    </div>
    {selected&&<div className="modal-backdrop assignment-review-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
      <div className="assignment-review-modal" role="dialog" aria-modal="true" aria-labelledby="shuffle-review-title">
        <div className="assignment-review-modal-header"><div><p className="eyebrow">Assignment Review</p>
          <h2 id="shuffle-review-title">{selected.participant_name||selected.participant_code}</h2>
          <p>{selected.participant_code} · {new Date(selected.submitted_at).toLocaleString()}</p></div>
          <button type="button" className="icon-button" aria-label="Close review" onClick={()=>setSelected(null)}><X size={18}/></button></div>
        <div className="assignment-review-modal-body">
          {detailsLoading?<div className="loading-card">Loading answers and attachments…</div>:<>
            {documents.length>0&&<section className="assignment-attachments-panel"><div className="assignment-attachments-heading"><div>
              <p className="eyebrow">Attachments</p><h4>Uploaded files ({documents.length})</h4></div></div>
              <div className="assignment-attachments-list">{documents.map(file=><button type="button" key={file.id}
                className="assignment-attachment-card" onClick={()=>void openFile(file)}>
                <span className="assignment-attachment-icon"><Download size={16}/></span>
                <span className="assignment-attachment-copy"><strong>{file.original_name}</strong><small>{file.file_size?Math.round(file.file_size/1024)+' KB':''}</small></span>
                <span className="assignment-attachment-action">Open</span></button>)}</div>
            </section>}
            <div className="assignment-answer-list">{answers.slice().sort((a,b)=>(a.assignment_questions?.position||0)-(b.assignment_questions?.position||0))
              .map((answer,i)=><div className="assignment-answer-row" key={answer.id}><span>{i+1}</span><div>
                <strong>{answer.assignment_questions?.label||'Question'}</strong>
                {documents.some(d=>d.question_id===answer.question_id)
                  ?<div className="assignment-document-list">{documents.filter(d=>d.question_id===answer.question_id)
                    .map((file,index)=><button type="button" className="text-button" key={file.id} onClick={()=>void openFile(file)}>
                      <Download size={14}/> Attachment {index+1}: {file.original_name}</button>)}</div>
                  :<p>{Array.isArray(answer.value)?answer.value.map(x=>String(x)).join(', ')
                    :typeof answer.value==='object'?JSON.stringify(answer.value):String(answer.value??'—')}</p>}
              </div></div>)}</div>
            {selected.status==='graded'&&!isAdmin
              ?<div className="assignment-grade-form"><h3>Grade completed</h3><p>Score: <strong>{selected.score}/{selectedAssignment?.max_score}</strong></p>
                  <p>{selected.feedback||'No feedback provided.'}</p></div>
              :<form className="modal-form assignment-grade-form assignment-grade-modal-form" onSubmit={saveGrade}>
                <div className="assignment-form-grid"><label>Score<input type="number" required min="0" max={selectedAssignment?.max_score}
                  step="0.01" value={grade.score} onChange={e=>setGrade(v=>({...v,score:e.target.value}))}/></label>
                  <label>Status<input disabled value={selected.status==='graded'?'Graded':'Awaiting grade'}/></label></div>
                <label>Feedback<textarea rows={5} value={grade.feedback} onChange={e=>setGrade(v=>({...v,feedback:e.target.value}))}
                  placeholder="Provide clear, constructive feedback."/></label>
                <button type="submit" className="primary-button" disabled={busy}>{busy?'Saving…':selected.status==='graded'?'Update grade':'Save grade'}</button>
              </form>}
          </>}
        </div>
      </div>
    </div>}
  </section>
}
