-- Programme Staff can read the applicant identity for participants explicitly
-- assigned to them. This fixes participant directory joins without widening
-- access to unassigned applicants or other organisations.

drop policy if exists applicants_staff_assigned_participant_select on public.applicants;

create policy applicants_staff_assigned_participant_select
on public.applicants
for select
to authenticated
using (
  exists (
    select 1
    from public.participants p
    join public.participant_staff_assignments psa
      on psa.participant_id=p.id
    where p.applicant_id=applicants.id
      and psa.staff_id=auth.uid()
  )
);
