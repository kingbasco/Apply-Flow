create or replace function public.import_google_form_batch(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path to ''
as $function$
declare
 v_batch public.form_import_batches; v_actor uuid := (select auth.uid());
 v_version_id uuid; v_question_id uuid; v_applicant_id uuid; v_submission_id uuid;
 v_row record; v_header text; v_answer text; v_email text; v_name text; v_timestamp text;
 v_submitted_at timestamptz; v_count integer := 0;
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 select * into v_batch from public.form_import_batches where id=p_batch_id;
 if v_batch.id is null then raise exception 'Import batch not found'; end if;
 if not private.is_org_member(v_batch.organization_id) then raise exception 'Not authorized'; end if;
 if v_batch.status='imported' then return jsonb_build_object('status','imported','imported_count',v_batch.row_count); end if;

 select fv.id into v_version_id from public.form_versions fv
 where fv.application_id=v_batch.application_id
 order by case when fv.status='draft' then 0 else 1 end, fv.version_number desc limit 1;

 if v_version_id is null then
   insert into public.form_versions(application_id,version_number,status,title,created_by)
   values(v_batch.application_id,coalesce((select max(version_number)+1 from public.form_versions where application_id=v_batch.application_id),1),'draft','Imported Google Form',v_actor)
   returning id into v_version_id;
 end if;

 for v_header in select jsonb_array_elements_text(v_batch.question_headers) loop
   if not exists(select 1 from public.questions q where q.form_version_id=v_version_id and q.label=v_header) then
     insert into public.questions(form_version_id,type,label,description,required,placeholder,position,config,conditional_rules)
     values(v_version_id,'short_text',v_header,null,false,null,
       (select coalesce(max(position),-1)+1 from public.questions where form_version_id=v_version_id),
       jsonb_build_object('source','google_forms_import','import_batch_id',v_batch.id),'{}'::jsonb);
   end if;
 end loop;

 for v_row in select * from public.form_import_rows where batch_id=p_batch_id order by row_number loop
   v_name:=null; v_email:=null; v_timestamp:=null; v_submitted_at:=now();
   for v_header,v_answer in select key,value from jsonb_each_text(v_row.response) loop
     if v_header ~* '^(full name|name|applicant name|your name)$' and coalesce(v_answer,'')<>'' then v_name:=v_answer; end if;
     if v_header ~* '^(email|email address|email address \(.*\))$' and coalesce(v_answer,'')<>'' then v_email:=v_answer; end if;
     if v_header ~* '^timestamp$' and coalesce(v_answer,'')<>'' then v_timestamp:=v_answer; end if;
   end loop;
   if v_timestamp is not null then begin v_submitted_at:=v_timestamp::timestamptz; exception when others then v_submitted_at:=now(); end; end if;
   v_name:=coalesce(v_name,'Imported applicant '||v_row.row_number::text);

   insert into public.applicants(application_id,full_name,email) values(v_batch.application_id,v_name,nullif(v_email,'')) returning id into v_applicant_id;
   insert into public.submissions(application_id,form_version_id,applicant_id,status,submitted_at) values(v_batch.application_id,v_version_id,v_applicant_id,'submitted',v_submitted_at) returning id into v_submission_id;

   for v_header,v_answer in select key,value from jsonb_each_text(v_row.response) loop
     if v_header !~* '^timestamp$' then
       select q.id into v_question_id from public.questions q where q.form_version_id=v_version_id and q.label=v_header order by q.position desc limit 1;
       if v_question_id is not null then
         insert into public.answers(submission_id,question_id,value) values(v_submission_id,v_question_id,to_jsonb(v_answer))
         on conflict(submission_id,question_id) do update set value=excluded.value;
       end if;
     end if;
   end loop;
   v_count:=v_count+1;
 end loop;

 update public.form_import_batches set status='imported',
   metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('imported_count',v_count,'imported_at',now())
 where id=p_batch_id;
 return jsonb_build_object('status','imported','imported_count',v_count,'form_version_id',v_version_id);
end;
$function$;