alter table public.submissions drop constraint if exists submissions_form_version_id_fkey;
alter table public.submissions add constraint submissions_form_version_id_fkey foreign key (form_version_id) references public.form_versions(id) on delete cascade;

alter table public.answers drop constraint if exists answers_question_id_fkey;
alter table public.answers add constraint answers_question_id_fkey foreign key (question_id) references public.questions(id) on delete cascade;

alter table public.eligibility_rules drop constraint if exists eligibility_rules_question_id_fkey;
alter table public.eligibility_rules add constraint eligibility_rules_question_id_fkey foreign key (question_id) references public.questions(id) on delete cascade;
