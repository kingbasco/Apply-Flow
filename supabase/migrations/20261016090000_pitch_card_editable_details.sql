-- Save participant-edited pitch card details without changing registration records.
-- Keeps the original commit RPC for clients already in flight during deployment.
create function public.commit_pitch_card_photo_details(
  p_slug text,
  p_token text,
  p_path text,
  p_name text,
  p_trade text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_event public.pitch_card_events;
  v_session private.pitch_card_upload_sessions;
  v_participant public.participants;
  v_name text;
  v_trade text;
begin
  if length(coalesce(p_token,''))<>64 then
    raise exception 'Invalid upload session';
  end if;

  v_name:=regexp_replace(btrim(coalesce(p_name,'')),'[[:space:]]+',' ','g');
  v_trade:=regexp_replace(btrim(coalesce(p_trade,'')),'[[:space:]]+',' ','g');
  if char_length(v_name) not between 1 and 120
    or char_length(v_trade) not between 1 and 120
    or v_name ~ '[[:cntrl:]]' or v_trade ~ '[[:cntrl:]]' then
    raise exception 'Please provide a valid name and trade (up to 120 characters each).';
  end if;

  -- Name: John Smith. Trade: Fashion design. Original answers are unchanged.
  v_name:=initcap(lower(v_name));
  v_trade:=upper(left(lower(v_trade),1))||substr(lower(v_trade),2);

  select * into v_event from public.pitch_card_events
    where slug=p_slug and status='published' and template_path is not null;
  if not found then raise exception 'Pitch card unavailable'; end if;

  select * into v_session from private.pitch_card_upload_sessions
    where event_id=v_event.id
      and token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and consumed_at is null
      and expires_at>now()
    for update;
  if not found then raise exception 'Upload session expired'; end if;

  if p_path not like v_event.organization_id::text||'/'||v_event.id::text||'/'||v_session.participant_id::text||'/%'
    or p_path !~ '[.]((png)|(jpg)|(webp))$' then
    raise exception 'Invalid upload path';
  end if;
  select * into v_participant from public.participants
    where id=v_session.participant_id
      and application_id=v_event.application_id
      and status in ('active','completed');
  if not found then raise exception 'Participant is not eligible'; end if;

  insert into public.pitch_card_submissions(
    organization_id,event_id,participant_id,participant_name,trade,photo_path
  ) values (
    v_event.organization_id,v_event.id,v_participant.id,v_name,v_trade,p_path
  )
  on conflict(event_id,participant_id) do update set
    photo_path=excluded.photo_path,
    participant_name=excluded.participant_name,
    trade=excluded.trade,
    updated_at=now(),
    submitted_at=now();

  update private.pitch_card_upload_sessions set consumed_at=now() where id=v_session.id;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.commit_pitch_card_photo_details(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.commit_pitch_card_photo_details(text,text,text,text,text) to service_role;
notify pgrst,'reload schema';
