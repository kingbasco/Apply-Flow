-- Pitch card events: admin-designed artwork, participant photos, private uploads.
create table public.pitch_card_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9-]{8,100}$'),
  status text not null default 'draft' check (status in ('draft','published','closed')),
  template_path text,
  layout jsonb not null default '{
    "photo":{"x":54,"y":15,"width":30,"height":60,"fit":"cover"},
    "name":{"x":72,"y":74,"size":52,"maxWidth":33,"color":"#ffffff","font":"Arial","weight":"bold","align":"center"},
    "trade":{"x":72,"y":81,"size":26,"maxWidth":33,"color":"#ffffff","font":"Arial","weight":"normal","align":"center"}
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pitch_cards_event_org_unique unique(id,organization_id)
);
create index pitch_card_events_org_idx on public.pitch_card_events(organization_id,updated_at desc);

create table public.pitch_card_submissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  event_id uuid not null,
  participant_id uuid not null references public.participants(id) on delete cascade,
  participant_name text not null,
  trade text not null default '',
  photo_path text not null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,participant_id),
  foreign key(event_id,organization_id) references public.pitch_card_events(id,organization_id) on delete cascade
);
create index pitch_card_submissions_event_idx on public.pitch_card_submissions(event_id,submitted_at desc);

create table private.pitch_card_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.pitch_card_events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '30 minutes',
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index pitch_card_upload_sessions_expiry_idx on private.pitch_card_upload_sessions(expires_at);
revoke all on private.pitch_card_upload_sessions from public,anon,authenticated;

alter table public.pitch_card_events enable row level security;
alter table public.pitch_card_submissions enable row level security;
grant select,insert,update,delete on public.pitch_card_events to authenticated;
grant select on public.pitch_card_submissions to authenticated;

create policy "admins manage pitch events" on public.pitch_card_events
for all to authenticated using (
  private.has_active_user_session() and exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and p.organization_id=pitch_card_events.organization_id and p.role in ('owner','admin')
  )
) with check (
  private.has_active_user_session() and exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and p.organization_id=pitch_card_events.organization_id and p.role in ('owner','admin')
  ) and exists (
    select 1 from public.applications a where a.id=pitch_card_events.application_id and a.organization_id=pitch_card_events.organization_id
  )
);
create policy "admins read pitch submissions" on public.pitch_card_submissions
for select to authenticated using (
  private.has_active_user_session() and exists (
    select 1 from public.profiles p where p.id=(select auth.uid()) and p.organization_id=pitch_card_submissions.organization_id and p.role in ('owner','admin')
  )
);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('pitch-card-templates','pitch-card-templates',true,20971520,array['image/png','image/jpeg','image/svg+xml']::text[])
on conflict(id) do update set public=true,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('pitch-card-photos','pitch-card-photos',false,15728640,array['image/png','image/jpeg','image/webp']::text[])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy "pitch templates upload admins" on storage.objects for insert to authenticated with check (
  bucket_id='pitch-card-templates' and private.has_active_user_session()
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','admin') and p.organization_id::text=(storage.foldername(name))[1])
);
create policy "pitch templates update admins" on storage.objects for update to authenticated using (
  bucket_id='pitch-card-templates' and private.has_active_user_session()
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','admin') and p.organization_id::text=(storage.foldername(name))[1])
) with check (
  bucket_id='pitch-card-templates' and private.has_active_user_session()
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','admin') and p.organization_id::text=(storage.foldername(name))[1])
);
create policy "pitch templates delete admins" on storage.objects for delete to authenticated using (
  bucket_id='pitch-card-templates' and private.has_active_user_session()
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','admin') and p.organization_id::text=(storage.foldername(name))[1])
);
create policy "pitch photos read admins" on storage.objects for select to authenticated using (
  bucket_id='pitch-card-photos' and private.has_active_user_session()
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','admin') and p.organization_id::text=(storage.foldername(name))[1])
);
create policy "pitch photos delete admins" on storage.objects for delete to authenticated using (
  bucket_id='pitch-card-photos' and private.has_active_user_session()
  and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.role in ('owner','admin') and p.organization_id::text=(storage.foldername(name))[1])
);

-- Exposes public artwork settings only, never participant data.
create function public.get_pitch_card_event(p_slug text) returns jsonb
language sql stable security definer set search_path='' as $$
select jsonb_build_object('title',e.title,'slug',e.slug,'layout',e.layout,'template_path',e.template_path)
from public.pitch_card_events e where e.slug=p_slug and e.status='published' and e.template_path is not null
limit 1;
$$;

-- ID + email verification follows the existing attendance/assignment portals.
-- A one-use 30-minute token is returned; only its SHA-256 digest is persisted.
create function public.open_pitch_card_for_participant(p_slug text,p_participant_code text,p_email text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_event public.pitch_card_events;
  v_participant public.participants;
  v_applicant public.applicants;
  v_trade text;
  v_token text;
  v_email text:=lower(btrim(coalesce(p_email,'')));
  v_identity text:=lower(btrim(coalesce(p_slug,'')))||'|'||upper(btrim(coalesce(p_participant_code,'')));
begin
  if not private.record_public_attempt('pitch_open_global',null,250,600)
    or not private.record_public_attempt('pitch_open_identity',v_identity,6,600) then
    return jsonb_build_object('error','Too many attempts. Please try again later.');
  end if;
  if length(v_email)>320 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
    return jsonb_build_object('error','Participant ID or email is not valid.');
  end if;
  select * into v_event from public.pitch_card_events where slug=p_slug and status='published' and template_path is not null;
  if not found then return jsonb_build_object('error','This pitch card is not available.'); end if;
  select p.* into v_participant from public.participants p
    join public.applicants a on a.id=p.applicant_id
    where p.application_id=v_event.application_id and p.status in ('active','completed')
      and upper(p.participant_id)=upper(btrim(p_participant_code)) and lower(btrim(coalesce(a.email,'')))=v_email
    limit 1;
  if not found then return jsonb_build_object('error','Participant ID or email is not valid.'); end if;
  select * into v_applicant from public.applicants where id=v_participant.applicant_id;
  select coalesce(
    case jsonb_typeof(ans.value)
      when 'string' then ans.value #>> '{}'
      when 'object' then coalesce(ans.value->>'label',ans.value->>'value',ans.value->>'text')
      when 'array' then ans.value->>0
      else ans.value #>> '{}'
    end,'') into v_trade
  from public.answers ans join public.questions q on q.id=ans.question_id
  where ans.submission_id=v_participant.submission_id
    and lower(btrim(q.label))='what is your trade?'
  limit 1;
  v_token:=encode(extensions.gen_random_bytes(32),'hex');
  delete from private.pitch_card_upload_sessions where event_id=v_event.id and participant_id=v_participant.id;
  insert into private.pitch_card_upload_sessions(event_id,participant_id,token_hash)
  values(v_event.id,v_participant.id,encode(extensions.digest(v_token,'sha256'),'hex'));
  return jsonb_build_object(
    'token',v_token,'participant_name',coalesce(v_applicant.full_name,'Participant'),
    'trade',coalesce(v_trade,''),'title',v_event.title
  );
exception when others then
  return jsonb_build_object('error','Unable to open pitch card. Please try again.');
end;
$$;

-- Service-role-only upload context and commit functions called by the edge upload function.
create function public.pitch_card_upload_context(p_slug text,p_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.pitch_card_events; v_session private.pitch_card_upload_sessions;
begin
  if length(coalesce(p_token,''))<>64 then return null; end if;
  select * into v_event from public.pitch_card_events where slug=p_slug and status='published' and template_path is not null;
  if not found then return null; end if;
  select * into v_session from private.pitch_card_upload_sessions
  where event_id=v_event.id and token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and consumed_at is null and expires_at>now();
  if not found then return null; end if;
  return jsonb_build_object('organization_id',v_event.organization_id,'event_id',v_event.id,'participant_id',v_session.participant_id);
end;
$$;

create function public.commit_pitch_card_photo(p_slug text,p_token text,p_path text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_event public.pitch_card_events; v_session private.pitch_card_upload_sessions;
  v_participant public.participants; v_applicant public.applicants; v_trade text;
begin
  if length(coalesce(p_token,''))<>64 then raise exception 'Invalid upload session'; end if;
  select * into v_event from public.pitch_card_events where slug=p_slug and status='published' and template_path is not null;
  if not found then raise exception 'Pitch card unavailable'; end if;
  select * into v_session from private.pitch_card_upload_sessions
    where event_id=v_event.id and token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
      and consumed_at is null and expires_at>now() for update;
  if not found then raise exception 'Upload session expired'; end if;
  if p_path not like v_event.organization_id::text||'/'||v_event.id::text||'/'||v_session.participant_id::text||'/%'
    or p_path !~ '[.]((png)|(jpg)|(webp))$' then raise exception 'Invalid upload path'; end if;
  select * into v_participant from public.participants where id=v_session.participant_id and status in ('active','completed');
  if not found then raise exception 'Participant is not eligible'; end if;
  select * into v_applicant from public.applicants where id=v_participant.applicant_id;
  select coalesce(case jsonb_typeof(ans.value)
    when 'string' then ans.value #>> '{}'
    when 'object' then coalesce(ans.value->>'label',ans.value->>'value',ans.value->>'text')
    when 'array' then ans.value->>0 else ans.value #>> '{}' end,'') into v_trade
  from public.answers ans join public.questions q on q.id=ans.question_id
  where ans.submission_id=v_participant.submission_id
    and lower(btrim(q.label))='what is your trade?' limit 1;
  insert into public.pitch_card_submissions(organization_id,event_id,participant_id,participant_name,trade,photo_path)
  values(v_event.organization_id,v_event.id,v_participant.id,coalesce(v_applicant.full_name,'Participant'),coalesce(v_trade,''),p_path)
  on conflict(event_id,participant_id) do update set
    photo_path=excluded.photo_path,participant_name=excluded.participant_name,trade=excluded.trade,updated_at=now(),submitted_at=now();
  update private.pitch_card_upload_sessions set consumed_at=now() where id=v_session.id;
  return jsonb_build_object('ok',true);
end;
$$;

revoke all on function public.get_pitch_card_event(text) from public,anon,authenticated;
revoke all on function public.open_pitch_card_for_participant(text,text,text) from public,anon,authenticated;
revoke all on function public.pitch_card_upload_context(text,text) from public,anon,authenticated;
revoke all on function public.commit_pitch_card_photo(text,text,text) from public,anon,authenticated;
grant execute on function public.get_pitch_card_event(text) to anon,authenticated;
grant execute on function public.open_pitch_card_for_participant(text,text,text) to anon,authenticated;
grant execute on function public.pitch_card_upload_context(text,text) to service_role;
grant execute on function public.commit_pitch_card_photo(text,text,text) to service_role;
notify pgrst, 'reload schema';
