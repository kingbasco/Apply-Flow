-- Harden public assignment uploads so a session token can upload only an
-- allowed MIME type for an actual file question, once per token/question.

create or replace function public.is_valid_assignment_upload_path(p_name text,p_mime text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
select exists(
  select 1
  from public.assignment_upload_sessions us
  join public.assignments a on a.id=us.assignment_id
  join public.participants p on p.id=us.participant_id
  join public.assignment_questions q on q.assignment_id=a.id and q.type='file'
  where (storage.foldername(p_name))[1]='assignment-submissions'
    and a.id::text=(storage.foldername(p_name))[2]
    and us.token=(storage.foldername(p_name))[3]
    and us.used_at is null
    and us.expires_at>now()
    and a.status='published'
    and (a.deadline is null or a.deadline>=now())
    and p.application_id=a.application_id
    and p.status='active'
    and storage.filename(p_name) like q.id::text||'-%'
    and lower(coalesce(p_mime,'')) in (
      'image/png','image/jpeg','image/webp','application/pdf','application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    and not exists(
      select 1 from storage.objects o
      where o.bucket_id='application-files'
        and (storage.foldername(o.name))[1]='assignment-submissions'
        and (storage.foldername(o.name))[2]=a.id::text
        and (storage.foldername(o.name))[3]=us.token
        and storage.filename(o.name) like q.id::text||'-%'
    )
);
$$;

revoke all on function public.is_valid_assignment_upload_path(text,text) from public;
grant execute on function public.is_valid_assignment_upload_path(text,text) to anon,authenticated,service_role;

drop policy if exists "participant assignment upload" on storage.objects;
create policy "participant assignment upload"
on storage.objects for insert to anon,authenticated
with check(
  bucket_id='application-files'
  and public.is_valid_assignment_upload_path(name,metadata->>'mimetype')
);

revoke execute on function public.is_valid_assignment_upload_path(text) from anon,authenticated;
