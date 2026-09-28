-- ApplyFlow Phase 2: protected assignment file upload sessions
create table if not exists public.assignment_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null default (now()+interval '45 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.assignment_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  submission_id uuid not null references public.assignment_submissions(id) on delete cascade,
  question_id uuid not null references public.assignment_questions(id) on delete restrict,
  storage_bucket text not null default 'application-files',
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  file_size bigint,
  status text not null default 'uploaded' check (status in ('pending','uploaded','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assignment_upload_sessions_assignment_idx on public.assignment_upload_sessions(assignment_id);
create index if not exists assignment_upload_sessions_participant_idx on public.assignment_upload_sessions(participant_id);
create index if not exists assignment_documents_submission_idx on public.assignment_documents(submission_id);
create index if not exists assignment_documents_question_idx on public.assignment_documents(question_id);

alter table public.assignment_upload_sessions enable row level security;
alter table public.assignment_documents enable row level security;

create policy "assignment_documents_staff_select" on public.assignment_documents for select to authenticated using (
  exists(select 1 from public.profiles p where p.id=auth.uid() and p.organization_id=assignment_documents.organization_id and p.role in ('owner','admin','reviewer'))
);
grant select on public.assignment_documents to authenticated;

drop policy if exists "participant assignment upload" on storage.objects;
create policy "participant assignment upload" on storage.objects for insert to anon with check (
  bucket_id='application-files'
  and (storage.foldername(storage.objects.name))[1]='assignment-submissions'
  and exists(
    select 1
    from public.assignment_upload_sessions us
    join public.assignments a on a.id=us.assignment_id
    join public.participants p on p.id=us.participant_id
    where a.id=((storage.foldername(storage.objects.name))[2])::uuid
      and us.token=(storage.foldername(storage.objects.name))[3]
      and us.used_at is null
      and us.expires_at>now()
      and a.status='published'
      and (a.deadline is null or a.deadline>=now())
      and p.application_id=a.application_id
      and p.status='active'
  )
);

drop policy if exists "assignment documents staff read" on storage.objects;
create policy "assignment documents staff read" on storage.objects for select to authenticated using (
  bucket_id='application-files'
  and (storage.foldername(storage.objects.name))[1]='assignment-submissions'
  and exists(
    select 1 from public.assignments a
    join public.profiles p on p.organization_id=a.organization_id
    where a.id=((storage.foldername(storage.objects.name))[2])::uuid
      and p.id=auth.uid()
      and p.role in ('owner','admin','reviewer')
  )
);

create or replace function public.open_assignment_for_participant(p_slug text,p_participant_code text)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare a public.assignments; p public.participants; qs jsonb; v_token text;
begin
  select * into a from public.assignments where public_slug=p_slug and status='published';
  if a.id is null then raise exception 'Assignment is not available.'; end if;
  if a.deadline is not null and now()>a.deadline then raise exception 'This assignment deadline has passed.'; end if;

  select * into p from public.participants
  where application_id=a.application_id
    and upper(participant_id)=upper(trim(p_participant_code))
    and status='active';
  if p.id is null then raise exception 'Participant ID is not valid for this programme.'; end if;

  if exists(select 1 from public.assignment_submissions s where s.assignment_id=a.id and s.participant_id=p.id) then
    raise exception 'This assignment has already been submitted.';
  end if;

  delete from public.assignment_upload_sessions
  where assignment_id=a.id and participant_id=p.id and used_at is null;

  v_token:=encode(gen_random_bytes(24),'hex');
  insert into public.assignment_upload_sessions(assignment_id,participant_id,token)
  values(a.id,p.id,v_token);

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'type',q.type,'label',q.label,'description',q.description,
    'required',q.required,'position',q.position,'config',q.config
  ) order by q.position),'[]'::jsonb)
  into qs from public.assignment_questions q where q.assignment_id=a.id;

  return jsonb_build_object(
    'assignment_id',a.id,
    'participant_code',p.participant_id,
    'upload_token',v_token,
    'title',a.title,
    'description',a.description,
    'instructions',a.instructions,
    'deadline',a.deadline,
    'max_score',a.max_score,
    'questions',qs
  );
end $$;

drop function if exists public.submit_public_assignment(text,text,jsonb);
create function public.submit_public_assignment(p_slug text,p_participant_code text,p_upload_token text,p_answers jsonb)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare a public.assignments; p public.participants; s_id uuid; q public.assignment_questions; answer jsonb; v_session public.assignment_upload_sessions;
begin
  select * into a from public.assignments where public_slug=p_slug and status='published';
  if a.id is null then raise exception 'Assignment is not available.'; end if;
  if a.deadline is not null and now()>a.deadline then raise exception 'This assignment deadline has passed.'; end if;

  select * into p from public.participants
  where application_id=a.application_id
    and upper(participant_id)=upper(trim(p_participant_code))
    and status='active';
  if p.id is null then raise exception 'Participant ID is not valid for this programme.'; end if;

  select * into v_session from public.assignment_upload_sessions
  where assignment_id=a.id and participant_id=p.id and token=p_upload_token and used_at is null and expires_at>now();
  if v_session.id is null then raise exception 'Your assignment session expired. Reopen the assignment and try again.'; end if;

  if exists(select 1 from public.assignment_submissions where assignment_id=a.id and participant_id=p.id) then
    raise exception 'This assignment has already been submitted.';
  end if;

  for q in select * from public.assignment_questions where assignment_id=a.id order by position loop
    answer:=p_answers->q.id::text;
    if q.required and (answer is null or answer='null'::jsonb or answer='""'::jsonb or answer='[]'::jsonb) then
      raise exception 'Please answer all required questions.';
    end if;
    if q.type='file' and answer is not null and answer<>'null'::jsonb then
      if coalesce(answer->>'path','') not like 'assignment-submissions/'||a.id::text||'/'||p_upload_token||'/%' then
        raise exception 'Invalid assignment file path.';
      end if;
    end if;
  end loop;

  insert into public.assignment_submissions(assignment_id,participant_id,organization_id,application_id)
  values(a.id,p.id,a.organization_id,a.application_id)
  returning id into s_id;

  insert into public.assignment_answers(submission_id,question_id,value)
  select s_id,q.id,coalesce(p_answers->q.id::text,'null'::jsonb)
  from public.assignment_questions q where q.assignment_id=a.id;

  insert into public.assignment_documents(organization_id,submission_id,question_id,storage_bucket,storage_path,original_name,mime_type,file_size,status)
  select a.organization_id,s_id,q.id,'application-files',
         p_answers->q.id::text->>'path',
         p_answers->q.id::text->>'name',
         p_answers->q.id::text->>'type',
         nullif(p_answers->q.id::text->>'size','')::bigint,
         'uploaded'
  from public.assignment_questions q
  where q.assignment_id=a.id and q.type='file'
    and coalesce(p_answers->q.id::text->>'path','') like 'assignment-submissions/'||a.id::text||'/'||p_upload_token||'/%';

  update public.assignment_upload_sessions set used_at=now() where id=v_session.id;

  return jsonb_build_object('submission_id',s_id,'participant_code',p.participant_id,'submitted_at',now(),'title',a.title);
end $$;

revoke all on function public.open_assignment_for_participant(text,text) from public;
revoke all on function public.submit_public_assignment(text,text,text,jsonb) from public;
grant execute on function public.open_assignment_for_participant(text,text) to anon,authenticated;
grant execute on function public.submit_public_assignment(text,text,text,jsonb) to anon,authenticated;
