-- Set attendance contribution to the programme leaderboard.
-- Every present attendance record contributes 5 points.

alter table public.attendance_sessions
  alter column points_value set default 5;

update public.attendance_sessions
set points_value=5
where points_value=0;
