
-- New bonus award category, including the existing individual award workflow.
ALTER TABLE public.participant_point_awards
  DROP CONSTRAINT participant_point_awards_category_check;
ALTER TABLE public.participant_point_awards
  ADD CONSTRAINT participant_point_awards_category_check
  CHECK (category = ANY (ARRAY['class_activity','group_activity','participation','leadership','helpfulness','first_on_call','other']));

CREATE OR REPLACE FUNCTION public.award_participant_points(
  p_participant_id uuid, p_points numeric, p_category text, p_reason text, p_note text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $function$
DECLARE
  v_participant public.participants;
  v_award public.participant_point_awards;
  v_awarder_name text;
  v_category text:=lower(trim(coalesce(p_category,'')));
  v_reason text:=trim(coalesce(p_reason,''));
  v_note text:=nullif(trim(coalesce(p_note,'')),'');
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_active_user_session() THEN
    RAISE EXCEPTION 'You must be signed in to award points.';
  END IF;
  SELECT * INTO v_participant FROM public.participants WHERE id=p_participant_id;
  IF v_participant.id IS NULL THEN RAISE EXCEPTION 'Participant not found.'; END IF;
  IF NOT private.is_org_admin(v_participant.organization_id) THEN
    RAISE EXCEPTION 'Only Owner or Admin can award participant points.';
  END IF;
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
  SELECT coalesce(nullif(trim(full_name),''),nullif(trim(username),''),'Administrator')
    INTO v_awarder_name FROM public.profiles WHERE id=auth.uid();
  INSERT INTO public.participant_point_awards(
    organization_id,application_id,participant_id,points,category,reason,note,awarded_by,awarded_by_name
  ) VALUES (
    v_participant.organization_id,v_participant.application_id,v_participant.id,
    p_points,v_category,v_reason,v_note,auth.uid(),coalesce(v_awarder_name,'Administrator')
  ) RETURNING * INTO v_award;
  RETURN jsonb_build_object(
    'id',v_award.id,'points',v_award.points,'category',v_award.category,
    'reason',v_award.reason,'note',v_award.note,
    'awarded_by',v_award.awarded_by,'awarded_by_name',v_award.awarded_by_name,
    'created_at',v_award.created_at,'revoked_at',v_award.revoked_at
  );
END;
$function$;

-- Request-key ledger makes retries safe: each bulk operation is atomic and single-use.
CREATE TABLE IF NOT EXISTS private.participant_point_award_batches (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  application_id uuid NOT NULL REFERENCES public.applications(id),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  recipient_count integer NOT NULL CHECK (recipient_count>0 AND recipient_count<=100),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.participant_point_award_batches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.participant_point_award_batches FROM PUBLIC, anon, authenticated;

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
  v_group_count integer;
  v_group_number integer;
  v_group_counts integer[]:=ARRAY[0,0,0,0,0];
  v_awarder_name text;
  v_results jsonb:='[]'::jsonb;
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
  IF coalesce(cardinality(p_participant_codes),0)<1 OR cardinality(p_participant_codes)>100 THEN
    RAISE EXCEPTION 'Include between 1 and 100 Participant IDs.';
  END IF;
  IF v_category='first_on_call' AND cardinality(p_participant_codes)>25 THEN
    RAISE EXCEPTION 'First on the Call supports up to five people in each of Groups 1–5.';
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
    IF v_category='first_on_call' THEN
      SELECT count(distinct g.group_number)::integer, min(g.group_number)
      INTO v_group_count,v_group_number
      FROM private.programme_leaderboard_groups g
      JOIN public.participant_staff_assignments sa
        ON sa.application_id=g.application_id AND sa.staff_id=g.staff_id
       AND sa.participant_id=v_participant.id
      WHERE g.application_id=p_application_id AND g.group_number BETWEEN 1 AND 5;
      IF v_group_count<>1 THEN
        RAISE EXCEPTION 'Participant % must belong to exactly one of Groups 1–5.',v_code;
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.participant_point_awards pa
        WHERE pa.participant_id=v_participant.id AND pa.application_id=p_application_id
        AND pa.category='first_on_call' AND pa.revoked_at IS NULL
        AND (pa.created_at AT TIME ZONE 'Africa/Lagos')::date=(now() AT TIME ZONE 'Africa/Lagos')::date
      ) THEN
        RAISE EXCEPTION '% already received First on the Call bonus points today.',v_code;
      END IF;
      v_group_counts[v_group_number]:=v_group_counts[v_group_number]+1;
      IF v_group_counts[v_group_number]>5 THEN RAISE EXCEPTION 'Group % has more than five selected participants.',v_group_number; END IF;
    END IF;
  END LOOP;
  IF v_category='first_on_call' THEN
    FOR v_group_number IN 1..5 LOOP
      IF v_group_counts[v_group_number]<>0 AND v_group_counts[v_group_number]<>5 THEN
        RAISE EXCEPTION 'Group % must have exactly five selected participants (found %).',v_group_number,v_group_counts[v_group_number];
      END IF;
    END LOOP;
  END IF;
  INSERT INTO private.participant_point_award_batches(id,organization_id,application_id,created_by,recipient_count)
  VALUES(p_request_id,v_programme.organization_id,p_application_id,auth.uid(),cardinality(v_participant_ids));

  SELECT coalesce(nullif(trim(full_name),''),nullif(trim(username),''),'Administrator')
  INTO v_awarder_name FROM public.profiles WHERE id=auth.uid();

  FOREACH v_target_id IN ARRAY v_participant_ids LOOP
    INSERT INTO public.participant_point_awards (
      organization_id,application_id,participant_id,points,category,reason,note,awarded_by,awarded_by_name
    ) VALUES (
      v_programme.organization_id,p_application_id,v_target_id,p_points,v_category,v_reason,v_note,
      auth.uid(),coalesce(v_awarder_name,'Administrator')
    ) RETURNING id INTO v_award_id;
    v_results:=v_results||jsonb_build_array(jsonb_build_object(
      'participant_record_id',v_target_id,'award_id',v_award_id));
  END LOOP;
  RETURN jsonb_build_object(
    'batch_id',p_request_id,'awarded',cardinality(v_participant_ids),
    'points_each',p_points,'total_points',cardinality(v_participant_ids)*p_points,'recipients',v_results);
END;
$function$;
REVOKE ALL ON FUNCTION public.award_participant_points_bulk(uuid,text[],numeric,text,text,text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.award_participant_points_bulk(uuid,text[],numeric,text,text,text,uuid) TO authenticated;
