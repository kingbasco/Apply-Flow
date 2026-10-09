-- Attach each active participant's configured leaderboard group and staff contact
-- to the overall leaderboard without altering point totals or rank calculations.
-- Same organization and active-session authorization as get_assignment_leaderboard.
CREATE OR REPLACE FUNCTION public.get_leaderboard_participant_groups(p_application_id uuid)
RETURNS TABLE (
  participant_record_id uuid,
  group_label text,
  staff_name text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $function$
  WITH permitted AS (
    SELECT 1
    FROM public.profiles me
    JOIN public.applications programme
      ON programme.organization_id = me.organization_id
    WHERE me.id = auth.uid()
      AND programme.id = p_application_id
      AND me.role IN ('owner', 'admin', 'reviewer')
      AND private.has_active_user_session()
  )
  SELECT
    participant.id AS participant_record_id,
    grp.group_label,
    grp.staff_name
  FROM public.participants participant
  JOIN permitted ON true
  LEFT JOIN LATERAL (
    SELECT
      coalesce(nullif(trim(g.display_label), ''), 'Group ' || g.group_number::text) AS group_label,
      coalesce(nullif(trim(staff.full_name), ''), nullif(trim(staff.email), ''), 'Programme Staff') AS staff_name
    FROM public.participant_staff_assignments assignment
    JOIN private.programme_leaderboard_groups g
      ON g.application_id = assignment.application_id
     AND g.staff_id = assignment.staff_id
    JOIN public.profiles staff
      ON staff.id = g.staff_id
    WHERE assignment.participant_id = participant.id
      AND assignment.application_id = participant.application_id
    ORDER BY g.group_number, g.staff_id
    LIMIT 1
  ) grp ON true
  WHERE participant.application_id = p_application_id
    AND participant.status = 'active'
  ORDER BY participant.participant_id;
$function$;

REVOKE ALL ON FUNCTION public.get_leaderboard_participant_groups(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_participant_groups(uuid) TO authenticated;
