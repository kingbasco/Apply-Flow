-- Reuse the Pitch Cards editor for participant-downloadable event social flyers.
-- Existing pitch events remain unchanged in admin-export mode.
alter table public.pitch_card_events
  add column card_mode text not null default 'pitch'
    check (card_mode in ('pitch', 'flyer')),
  add column share_caption text not null default ''
    check (char_length(share_caption) <= 500);

create index pitch_card_events_mode_idx
  on public.pitch_card_events(organization_id, card_mode, updated_at desc);

-- Only published events expose artwork and public sharing settings.
-- Identity verification is still handled by open_pitch_card_for_participant.
create or replace function public.get_pitch_card_event(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'title', e.title,
    'slug', e.slug,
    'layout', e.layout,
    'template_path', e.template_path,
    'card_mode', e.card_mode,
    'share_caption', e.share_caption
  )
  from public.pitch_card_events e
  where e.slug = p_slug
    and e.status = 'published'
    and e.template_path is not null
  limit 1;
$$;
notify pgrst, 'reload schema';
