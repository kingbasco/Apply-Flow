create index if not exists participant_point_awards_awarded_by_idx
  on public.participant_point_awards(awarded_by);

create index if not exists participant_point_awards_revoked_by_idx
  on public.participant_point_awards(revoked_by)
  where revoked_by is not null;
