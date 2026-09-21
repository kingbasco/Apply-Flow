create sequence if not exists public.applicant_unique_id_seq;

alter table public.applicants
  add column if not exists unique_id text;

update public.applicants
set unique_id = 'APP-' || lpad(nextval('public.applicant_unique_id_seq')::text, 5, '0')
where unique_id is null;

alter table public.applicants
  alter column unique_id set default 'APP-' || lpad(nextval('public.applicant_unique_id_seq')::text, 5, '0'),
  alter column unique_id set not null;

create unique index if not exists applicants_unique_id_idx on public.applicants(unique_id);

alter table public.submissions
  add column if not exists decision text not null default 'pending';

alter table public.submissions
  drop constraint if exists submissions_decision_check;

alter table public.submissions
  add constraint submissions_decision_check check (decision = any (array['pending'::text,'approved'::text,'rejected'::text]));

create index if not exists submissions_decision_idx on public.submissions(decision);
