import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZES=[50,100,200,300] as const

export default function TablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}:{
  total:number
  page:number
  pageSize:number
  onPageChange:(page:number)=>void
  onPageSizeChange:(pageSize:number)=>void
}){
  const pageCount=Math.max(1,Math.ceil(total/pageSize))
  const currentPage=Math.min(Math.max(1,page),pageCount)
  const start=total===0?0:(currentPage-1)*pageSize+1
  const end=total===0?0:Math.min(currentPage*pageSize,total)

  return <div className="table-pagination">
    <div className="table-pagination-summary">
      <span>Showing <strong>{start}–{end}</strong> of <strong>{total}</strong></span>
      <label>
        <span>Rows per page</span>
        <select value={pageSize} onChange={e=>onPageSizeChange(Number(e.target.value))}>
          {PAGE_SIZES.map(size=><option key={size} value={size}>{size}</option>)}
        </select>
      </label>
    </div>
    <div className="table-pagination-nav" aria-label="Table pagination">
      <button type="button" className="secondary-button" disabled={currentPage<=1||total===0} onClick={()=>onPageChange(currentPage-1)}><ChevronLeft size={15}/> Previous</button>
      <span>Page <strong>{total===0?0:currentPage}</strong> of <strong>{total===0?0:pageCount}</strong></span>
      <button type="button" className="secondary-button" disabled={currentPage>=pageCount||total===0} onClick={()=>onPageChange(currentPage+1)}>Next <ChevronRight size={15}/></button>
    </div>
  </div>
}
