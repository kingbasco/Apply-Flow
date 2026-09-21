-- Phase 12: secure application document metadata and associate uploaded files with submissions.
create table if not exists public.uploaded_documents (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 submission_id uuid not null references public.submissions(id) on delete cascade,
 question_id uuid not null references public.questions(id) on delete cascade,
 answer_id uuid references public.answers(id) on delete set null,
 storage_bucket text not null default 'application-files',
 storage_path text not null unique,
 original_name text not null,
 mime_type text,
 file_size bigint,
 status text not null default 'uploaded' check (status in ('pending','uploaded','failed','needs_review')),
 extracted_text text,
 extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','completed','failed','not_supported')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table public.uploaded_documents enable row level security;
create index if not exists uploaded_documents_submission_id_idx on public.uploaded_documents(submission_id);
create index if not exists uploaded_documents_organization_id_idx on public.uploaded_documents(organization_id);
create index if not exists uploaded_documents_question_id_idx on public.uploaded_documents(question_id);
drop policy if exists uploaded_documents_org_select on public.uploaded_documents;
create policy uploaded_documents_org_select on public.uploaded_documents for select to authenticated using (private.is_org_member(organization_id));
drop policy if exists uploaded_documents_org_update on public.uploaded_documents;
create policy uploaded_documents_org_update on public.uploaded_documents for update to authenticated using (private.is_org_admin(organization_id)) with check (private.is_org_admin(organization_id));
drop policy if exists "applicant public upload metadata" on storage.objects;
drop policy if exists "applicant public upload application files" on storage.objects;
create policy "applicant public upload application files" on storage.objects for insert to anon with check (
 bucket_id='application-files'
 and (storage.foldername(storage.objects.name))[1]='public-submissions'
 and exists (
   select 1 from public.applications a
   where a.id=((storage.foldername(storage.objects.name))[2])::uuid and a.status='published'
 )
);

-- Keep the public submission RPC responsible for creating document metadata.
-- The client uploads the actual object after the submission transaction succeeds.
