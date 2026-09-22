-- Simplify eligibility requirements and evaluate every submission automatically.

alter table public.ai_screenings
  add column if not exists eligibility_status text,
  add column if not exists eligibility_assessment text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='ai_screenings_eligibility_status_check') then
    alter table public.ai_screenings add constraint ai_screenings_eligibility_status_check
      check (eligibility_status is null or eligibility_status in ('eligible','ineligible','pending'));
  end if;
end $$;

create or replace function private.evaluate_submission_eligibility(p_submission_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  s public.submissions;
  r record;
  a record;
  pass boolean;
  has_rules boolean := false;
  all_pass boolean := true;
  has_missing boolean := false;
  reason_list jsonb := '[]'::jsonb;
  answer_text text;
  rule_text text;
  answer_num numeric;
  low_num numeric;
  high_num numeric;
begin
  select * into s from public.submissions where id = p_submission_id;
  if not found then raise exception 'Submission not found'; end if;

  for r in
    select er.id, er.question_id, er.operator, er.value, er.position,
           q.type as question_type, q.label as question_label
    from public.eligibility_rules er
    join public.questions q on q.id=er.question_id
    where er.application_id=s.application_id and er.enabled=true
    order by er.position
  loop
    has_rules := true;
    select an.value into a from public.answers an
    where an.submission_id=p_submission_id and an.question_id=r.question_id limit 1;

    if a.value is null or a.value='null'::jsonb or a.value='""'::jsonb or a.value='[]'::jsonb then
      has_missing := true; all_pass := false;
      reason_list := reason_list || jsonb_build_array(jsonb_build_object(
        'rule_id',r.id,'question',r.question_label,'status','missing','reason','No answer provided'));
      continue;
    end if;

    pass := false;
    if r.operator='between' then
      begin
        answer_num := (a.value #>> '{}')::numeric;
        low_num := nullif(r.value->>0,'')::numeric;
        high_num := nullif(r.value->>1,'')::numeric;
        pass := answer_num between low_num and high_num;
      exception when others then pass := false; end;
    elsif r.operator='in' then
      if jsonb_typeof(a.value)='array' then
        select exists(select 1 from jsonb_array_elements_text(a.value) av
          where exists(select 1 from jsonb_array_elements_text(r.value) ev
            where lower(trim(av))=lower(trim(ev)))) into pass;
      else
        answer_text := lower(trim(both '"' from a.value::text));
        select exists(select 1 from jsonb_array_elements_text(r.value) ev
          where lower(trim(ev))=answer_text) into pass;
      end if;
    else
      answer_text := lower(trim(both '"' from a.value::text));
      rule_text := lower(trim(both '"' from r.value::text));
      pass := answer_text=rule_text;
    end if;

    if pass then
      reason_list := reason_list || jsonb_build_array(jsonb_build_object(
        'rule_id',r.id,'question',r.question_label,'status','passed','reason','Eligibility condition passed'));
    else
      all_pass := false;
      reason_list := reason_list || jsonb_build_array(jsonb_build_object(
        'rule_id',r.id,'question',r.question_label,'status','failed',
        'reason','Eligibility condition not met','expected',r.value,'answer',a.value));
    end if;
  end loop;

  insert into public.submission_eligibility(submission_id,status,reasons,evaluated_at,overridden,updated_at)
  values(p_submission_id,
    case when not has_rules then 'pending'
         when all_pass then 'eligible'
         when has_missing then 'pending'
         else 'ineligible' end,
    reason_list,now(),false,now())
  on conflict(submission_id) do update set
    status=excluded.status,reasons=excluded.reasons,evaluated_at=excluded.evaluated_at,
    overridden=false,override_reason=null,overridden_by=null,overridden_at=null,updated_at=excluded.updated_at;
end;
$function$;

create or replace function private.trigger_evaluate_eligibility_from_answer()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin
  perform private.evaluate_submission_eligibility(coalesce(new.submission_id,old.submission_id));
  return coalesce(new,old);
end;
$function$;

drop trigger if exists answers_evaluate_eligibility on public.answers;
create trigger answers_evaluate_eligibility after insert or update or delete on public.answers
for each row execute function private.trigger_evaluate_eligibility_from_answer();

create or replace function private.trigger_evaluate_eligibility_from_submission()
returns trigger language plpgsql security definer set search_path=''
as $function$
begin perform private.evaluate_submission_eligibility(new.id); return new; end;
$function$;

drop trigger if exists submissions_evaluate_eligibility on public.submissions;
create trigger submissions_evaluate_eligibility after insert on public.submissions
for each row execute function private.trigger_evaluate_eligibility_from_submission();

create or replace function private.trigger_re_evaluate_application_eligibility()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare s record;
begin
  for s in select id from public.submissions where application_id=coalesce(new.application_id,old.application_id)
  loop perform private.evaluate_submission_eligibility(s.id); end loop;
  return coalesce(new,old);
end;
$function$;

drop trigger if exists eligibility_rules_re_evaluate on public.eligibility_rules;
create trigger eligibility_rules_re_evaluate after insert or update or delete on public.eligibility_rules
for each row execute function private.trigger_re_evaluate_application_eligibility();

update public.eligibility_rules set logic='AND';
update public.eligibility_rules set operator='in' where operator in ('IN','NOT IN');