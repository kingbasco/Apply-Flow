-- Allow workspace admins to save the human review score shown in the applicant review screen.
create policy submission_scores_org_admin_insert
on public.submission_scores
for insert
to authenticated
with check (
  exists (
    select 1
    from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = submission_scores.submission_id
      and private.is_org_admin(a.organization_id)
  )
);

create policy submission_scores_org_admin_update
on public.submission_scores
for update
to authenticated
using (
  exists (
    select 1
    from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = submission_scores.submission_id
      and private.is_org_admin(a.organization_id)
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    join public.applications a on a.id = s.application_id
    where s.id = submission_scores.submission_id
      and private.is_org_admin(a.organization_id)
  )
);
