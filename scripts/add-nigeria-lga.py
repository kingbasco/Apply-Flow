from pathlib import Path
import re

path = Path("src/App.tsx")
text = path.read_text()

if "'nigeria_lga'" not in text:
    text, n = re.subn(r"('nigeria_state')", r"\1 | 'nigeria_lga'", text, count=1)
    if n != 1:
        raise SystemExit("Could not find nigeria_state in QuestionType.")

    state_item = re.search(r"(\{type:'nigeria_state'[^}]*\},?)", text)
    if not state_item:
        raise SystemExit("Could not find nigeria_state question palette item.")
    item = state_item.group(1)
    text = text[:state_item.end()] + "{type:'nigeria_lga',label:'Local government area',icon:MapPin}," + text[state_item.end():]

    old = "type==='nigeria_state'?'State of origin':questionTypes.find"
    new = "type==='nigeria_state'?'State of origin':type==='nigeria_lga'?'Local government area':questionTypes.find"
    if old not in text:
        raise SystemExit("Could not find addQuestion label expression.")
    text = text.replace(old, new, 1)

    anchor = "const [questions,setQuestions]=useState<BuilderQuestion[]>([]), [answers,setAnswers]=useState<Record<string,string|string[]>>({}), [files,setFiles]=useState<Record<string,File>>({})"
    replacement = anchor + "\n  const [lgaOptions,setLgaOptions]=useState<string[]>([])\n  const [lgaLoading,setLgaLoading]=useState(false)"
    if anchor not in text:
        raise SystemExit("Could not find PublicApplication state anchor.")
    text = text.replace(anchor, replacement, 1)

    anchor = "  const visible=(q:BuilderQuestion)=>{const r=q.conditional_rules?.[0];if(!r)return true;return answers[r.question_id]===r.value}"
    loader = """  useEffect(()=>{(async()=>{
    const stateQuestion=questions.find(q=>q.type==='nigeria_state')
    const stateValue=stateQuestion?String(answers[stateQuestion.id]||''):''
    const lgaQuestion=questions.find(q=>q.type==='nigeria_lga')
    if(!stateValue){setLgaOptions([]);if(lgaQuestion)setAnswer(lgaQuestion.id,'');return}
    setLgaLoading(true)
    try{
      const response=await fetch('https://openadmindata.org/api/v1/countries/ng.json')
      if(!response.ok)throw new Error('Could not load local government areas.')
      const payload=await response.json()
      const rows=payload?.data?.local_government_area||payload?.data?.local_government_areas||payload?.data?.lga||[]
      const matches=rows.filter((row:any)=>String(row?.parent?.name?.en||row?.parent_name||row?.state||'').toLowerCase()===stateValue.toLowerCase())
      setLgaOptions(matches.map((row:any)=>String(row?.name_en||row?.name?.en||row?.name_local||row?.name?.local||'')).filter(Boolean))
    }catch(e){setLgaOptions([]);setError(e instanceof Error?e.message:'Could not load local government areas.')}
    finally{setLgaLoading(false)}
  })()},[questions,answers])
"""
    if anchor not in text:
        raise SystemExit("Could not find PublicApplication visible anchor.")
    text = text.replace(anchor, loader + anchor, 1)

    old = """:q.type==='nigeria_state'?<select value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)}><option value="">Select your state of origin</option>{NIGERIAN_STATES.map(state=><option key={state} value={state}>{state}</option>)}</select>"""
    new = old + """:q.type==='nigeria_lga'?<select value={String(answers[q.id]||'')} onChange={e=>setAnswer(q.id,e.target.value)} disabled={!questions.find(x=>x.type==='nigeria_state')||!String(answers[questions.find(x=>x.type==='nigeria_state')!.id]||'')||lgaLoading}><option value="">{lgaLoading?'Loading local governments…':'Select your local government'}</option>{lgaOptions.map(lga=><option key={lga} value={lga}>{lga}</option>)}</select>"""
    if old not in text:
        raise SystemExit("Could not find public nigeria_state renderer.")
    text = text.replace(old, new, 1)

    old = """:q.type==='nigeria_state'?<select><option>Select your state of origin</option>{NIGERIAN_STATES.map(state=><option key={state}>{state}</option>)}</select>"""
    new = old + """:q.type==='nigeria_lga'?<select disabled><option>Select your local government</option></select>"""
    if old not in text:
        raise SystemExit("Could not find preview nigeria_state renderer.")
    text = text.replace(old, new, 1)

path.write_text(text)
print("Patched App.tsx with Nigeria LGA support.")
