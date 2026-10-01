create table if not exists public.whatsapp_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  provider text not null default 'meta' check (provider in ('meta')),
  business_account_id text, phone_number_id text, display_phone text, verified_name text, quality_rating text,
  status text not null default 'disconnected' check (status in ('disconnected','configured','error')),
  last_error text, last_checked_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  meta_template_id text not null, name text not null, language text not null, category text,
  status text not null default 'unknown' check (status in ('approved','pending','rejected','paused','disabled','unknown')),
  body_text text, components jsonb not null default '[]'::jsonb,
  variable_count integer not null default 0 check (variable_count >= 0),
  supports_mvp boolean not null default true, unsupported_reason text,
  synced_at timestamptz not null default now(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, meta_template_id)
);
create table if not exists public.whatsapp_consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  phone_e164 text, opted_in boolean not null default false, source text not null default 'admin_confirmed', proof_note text,
  opted_in_at timestamptz, opted_out_at timestamptz,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (participant_id)
);
create table if not exists public.whatsapp_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  application_id uuid not null references public.applications(id) on delete cascade,
  template_id uuid not null references public.whatsapp_templates(id) on delete restrict,
  client_request_id uuid not null, name text not null, language text not null, variable_mappings jsonb not null default '[]'::jsonb,
  status text not null default 'queued' check (status in ('queued','sending','completed','partially_failed','failed','cancelled')),
  recipient_count integer not null default 0 check (recipient_count >= 0), eligible_count integer not null default 0 check (eligible_count >= 0),
  sent_count integer not null default 0 check (sent_count >= 0), delivered_count integer not null default 0 check (delivered_count >= 0),
  read_count integer not null default 0 check (read_count >= 0), failed_count integer not null default 0 check (failed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  queued_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organization_id, client_request_id)
);
create table if not exists public.whatsapp_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.whatsapp_campaigns(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  phone_e164 text, provider_message_id text,
  status text not null default 'queued' check (status in ('queued','sending','sent','delivered','read','failed','skipped')),
  error_code text, error_message text, attempt_count integer not null default 0 check (attempt_count >= 0),
  queued_at timestamptz not null default now(), started_at timestamptz, sent_at timestamptz, delivered_at timestamptz, read_at timestamptz, failed_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (campaign_id, participant_id)
);
create index if not exists whatsapp_templates_org_idx on public.whatsapp_templates(organization_id);
create index if not exists whatsapp_templates_status_idx on public.whatsapp_templates(organization_id,status);
create index if not exists whatsapp_consents_org_idx on public.whatsapp_consents(organization_id);
create index if not exists whatsapp_consents_opted_in_idx on public.whatsapp_consents(organization_id,opted_in);
create index if not exists whatsapp_campaigns_org_created_idx on public.whatsapp_campaigns(organization_id,created_at desc);
create index if not exists whatsapp_campaigns_application_idx on public.whatsapp_campaigns(application_id,created_at desc);
create index if not exists whatsapp_campaign_recipients_campaign_status_idx on public.whatsapp_campaign_recipients(campaign_id,status);
create unique index if not exists whatsapp_campaign_recipients_provider_message_idx on public.whatsapp_campaign_recipients(provider_message_id) where provider_message_id is not null;
alter table public.whatsapp_connections enable row level security;
alter table public.whatsapp_templates enable row level security;
alter table public.whatsapp_consents enable row level security;
alter table public.whatsapp_campaigns enable row level security;
alter table public.whatsapp_campaign_recipients enable row level security;
drop policy if exists whatsapp_connections_admin_select on public.whatsapp_connections;
create policy whatsapp_connections_admin_select on public.whatsapp_connections for select to authenticated using (private.has_active_user_session() and private.is_org_admin(organization_id));
drop policy if exists whatsapp_templates_admin_select on public.whatsapp_templates;
create policy whatsapp_templates_admin_select on public.whatsapp_templates for select to authenticated using (private.has_active_user_session() and private.is_org_admin(organization_id));
drop policy if exists whatsapp_consents_admin_select on public.whatsapp_consents;
create policy whatsapp_consents_admin_select on public.whatsapp_consents for select to authenticated using (private.has_active_user_session() and private.is_org_admin(organization_id));
drop policy if exists whatsapp_campaigns_admin_select on public.whatsapp_campaigns;
create policy whatsapp_campaigns_admin_select on public.whatsapp_campaigns for select to authenticated using (private.has_active_user_session() and private.is_org_admin(organization_id));
drop policy if exists whatsapp_campaign_recipients_admin_select on public.whatsapp_campaign_recipients;
create policy whatsapp_campaign_recipients_admin_select on public.whatsapp_campaign_recipients for select to authenticated using (
  private.has_active_user_session() and exists (select 1 from public.whatsapp_campaigns c where c.id=whatsapp_campaign_recipients.campaign_id and private.is_org_admin(c.organization_id))
);
revoke all on public.whatsapp_connections from anon, authenticated;
revoke all on public.whatsapp_templates from anon, authenticated;
revoke all on public.whatsapp_consents from anon, authenticated;
revoke all on public.whatsapp_campaigns from anon, authenticated;
revoke all on public.whatsapp_campaign_recipients from anon, authenticated;
grant select on public.whatsapp_connections to authenticated;
grant select on public.whatsapp_templates to authenticated;
grant select on public.whatsapp_consents to authenticated;
grant select on public.whatsapp_campaigns to authenticated;
grant select on public.whatsapp_campaign_recipients to authenticated;
