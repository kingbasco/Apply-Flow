-- Existing withdrawn participants created by the previous direct-status flow
-- should be represented as rejected applications in Screening/Review.
update public.submissions s
set decision='rejected'
from public.participants p
where p.submission_id=s.id
  and p.status='withdrawn'
  and s.decision<>'rejected';
