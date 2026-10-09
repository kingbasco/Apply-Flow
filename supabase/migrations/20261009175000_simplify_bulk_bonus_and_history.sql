
-- Make bulk awards independent of staff groups and allow larger batches.
-- Admin/session checks and idempotent, atomic writes are retained.
ALTER TABLE private.participant_point_award_batches
  DROP CONSTRAINT IF EXISTS participant_point_award_batches_recipient_count_check;
ALTER TABLE private.participant_point_award_batches
  ADD CONSTRAINT participant_point_award_batches_recipient_count_check
  CHECK (recipient_count > 0 AND recipient_count <= 500);

CREATE OR REPLACE FUNCTION public.award_participant_points_bulk(
  p_application_id uuid, p_participant_codes text[], p_points numeric,
  p_category text, p_reason text, p_note text DEFAULT NULL, p_request_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_programme public.applications;
  v_participant public.participants;
  v_award_id uuid;
  v_participant_ids uuid[]:=ARRAY[]::uuid[];
  v_code text;
  v_category text:=lower(trim(coalesce(p_category,'')));
  v_reason text:=trim(coalesce(p_reason,''));
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
  v_awarder_name text;
  v_target_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_active_user_session() THEN
    RAISE EXCEPTION 'You must be signed in to award points.';
  END IF;
  SELECT * INTO v_programme FROM public.applications WHERE id=p_application_id;
  IF v_programme.id IS NULL OR NOT private.is_org_admin(v_programme.organization_id) THEN
    RAISE EXCEPTION 'Only an Owner or Admin of this programme can award points.';
  END IF;
  IF p_request_id IS NULL THEN RAISE EXCEPTION 'Missing bulk request ID.'; END IF;
  IF p_points IS NULL OR p_points<=0 OR p_points>10000 THEN
    RAISE EXCEPTION 'Points must be greater than 0 and no more than 10000.';
  END IF;
  IF v_category NOT IN ('class_activity','group_activity','participation','leadership','helpfulness','first_on_call','other') THEN
    RAISE EXCEPTION 'Choose a valid point category.';
  END IF;
  IF char_length(v_reason)<2 OR char_length(v_reason)>200 THEN
    RAISE EXCEPTION 'Reason must be between 2 and 200 characters.';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note)>1000 THEN
    RAISE EXCEPTION 'Note must be 1000 characters or fewer.';
  END IF;
  IF coalesce(cardinality(p_participant_codes),0)<1 OR cardinality(p_participant_codes)>500 THEN
    RAISE EXCEPTION 'Include between 1 and 500 Participant IDs.';
  END IF;
  FOREACH v_code IN ARRAY p_participant_codes LOOP
    v_code:=upper(trim(v_code));
    IF v_code IS NULL OR v_code='' THEN RAISE EXCEPTION 'Remove blank Participant IDs.'; END IF;
    SELECT * INTO v_participant FROM public.participants
      WHERE organization_id=v_programme.organization_id
        AND application_id=p_application_id
        AND status='active'
        AND upper(trim(participant_id))=v_code;
    IF v_participant.id IS NULL THEN RAISE EXCEPTION 'Unknown or inactive Participant ID: %',v_code; END IF;
    IF v_participant.id=ANY(v_participant_ids) THEN
      RAISE EXCEPTION 'Duplicate Participant ID: %',v_code;
    END IF;
    v_participant_ids:=array_append(v_participant_ids,v_participant.id);
  END LOOP;

  INSERT INTO private.participant_point_award_batches(
    id,organization_id,application_id,created_by,recipient_count
  ) VALUES (
    p_request_id,v_programme.organization_id,p_application_id,auth.uid(),
    cardinality(v_participant_ids)
  );

  SELECT coalesce(nullif(trim(full_name),''),nullif(trim(username),''),'Administrator')
  INTO v_awarder_name FROM public.profiles WHERE id=auth.uid();
  FOREACH v_target_id IN ARRAY v_participant_ids LOOP
    INSERT INTO public.participant_point_awards (
      organization_id,application_id,participant_id,points,category,reason,note,awarded_by,awarded_by_name
    ) VALUES (
      v_programme.organization_id,p_application_id,v_target_id,p_points,v_category,v_reason,v_note,
      auth.uid(),coalesce(v_awarder_name,'Administrator')
    ) RETURNING id INTO v_award_id;
  END LOOP;
  RETURN jsonb_build_object(
    'batch_id',p_request_id,'awarded',cardinality(v_participant_ids),
    'points_each',p_points,'total_points',cardinality(v_participant_ids)*p_points
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.award_participant_points_bulk(uuid,text[],numeric,text,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_participant_points_bulk(uuid,text[],numeric,text,text,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_participant_bonus_award_summary(p_application_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_programme public.applications;
  v_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_active_user_session() THEN
    RAISE EXCEPTION 'You must be signed in to see bonus awards.';
  END IF;
  SELECT * INTO v_programme FROM public.applications WHERE id=p_application_id;
  IF v_programme.id IS NULL OR NOT private.is_org_admin(v_programme.organization_id) THEN
    RAISE EXCEPTION 'Only an Owner or Admin of this programme can view bonus awards.';
  END IF;
  SELECT jsonb_build_object(
    'total_awards',count(*),
    'participants_awarded',count(distinct participant_id) FILTER(WHERE revoked_at IS NULL),
    'active_awards',count(*) FILTER(WHERE revoked_at IS NULL),
    'active_points',coalesce(sum(points) FILTER(WHERE revoked_at IS NULL),0),
    'revoked_awards',count(*) FILTER(WHERE revoked_at IS NOT NULL)
  ) INTO v_summary
  FROM public.participant_point_awards
  WHERE organization_id=v_programme.organization_id AND application_id=p_application_id;
  RETURN v_summary;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_participant_bonus_award_summary(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_participant_bonus_award_summary(uuid) TO authenticated;
