-- Ensure attendance session creation always gets a unique self-check-in slug.
alter table public.attendance_sessions
  alter column check_in_slug
  set default ('attendance-' || replace(gen_random_uuid()::text, '-', ''));
