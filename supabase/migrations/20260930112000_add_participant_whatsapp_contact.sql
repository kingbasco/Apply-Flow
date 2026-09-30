-- Store the WhatsApp contact number directly on the applicant record so
-- Participant profiles can expose it using the existing applicant RLS rules.

alter table public.applicants
  add column if not exists whatsapp_phone text;

create or replace function private.sync_applicant_whatsapp_from_answer()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_label text;
  v_applicant_id uuid;
  v_phone text;
begin
  select q.label into v_label
  from public.questions q
  where q.id=new.question_id;

  if v_label is null
     or lower(v_label) not like '%whatsapp%'
     or not (
       lower(v_label) like '%number%'
       or lower(v_label) like '%phone%'
       or lower(v_label) like '%mobile%'
       or lower(v_label) like '%contact%'
     )
  then
    return new;
  end if;

  if jsonb_typeof(new.value) not in ('string','number') then
    return new;
  end if;

  v_phone:=nullif(left(trim(new.value #>> '{}'),64),'');
  if v_phone is null then return new; end if;

  select s.applicant_id into v_applicant_id
  from public.submissions s
  where s.id=new.submission_id;

  if v_applicant_id is not null then
    update public.applicants
    set whatsapp_phone=v_phone,
        updated_at=now()
    where id=v_applicant_id;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_applicant_whatsapp_from_answer()
from public,anon,authenticated;

drop trigger if exists sync_applicant_whatsapp_from_answer on public.answers;

create trigger sync_applicant_whatsapp_from_answer
after insert or update of value,question_id,submission_id
on public.answers
for each row
execute function private.sync_applicant_whatsapp_from_answer();

with ranked as (
  select
    s.applicant_id,
    left(trim(a.value #>> '{}'),64) as phone,
    row_number() over (
      partition by s.applicant_id
      order by a.created_at desc,a.id desc
    ) as rn
  from public.answers a
  join public.questions q on q.id=a.question_id
  join public.submissions s on s.id=a.submission_id
  where lower(q.label) like '%whatsapp%'
    and (
      lower(q.label) like '%number%'
      or lower(q.label) like '%phone%'
      or lower(q.label) like '%mobile%'
      or lower(q.label) like '%contact%'
    )
    and jsonb_typeof(a.value) in ('string','number')
    and nullif(trim(a.value #>> '{}'),'') is not null
)
update public.applicants ap
set whatsapp_phone=r.phone
from ranked r
where r.rn=1
  and r.applicant_id=ap.id;
