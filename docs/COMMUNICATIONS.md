# Communications

ApplyFlow currently has two communications surfaces:

1. Email Center.
2. WhatsApp Center.

A separate manual WhatsApp participant-ID helper exists in participant profiles.

## Email Center

Current capabilities:

- Compose.
- Templates.
- Connection/provider view.
- Delivery reports.
- Programme selection.
- Audience status filter.
- Assigned-staff filter.
- Recipient search.
- Page-scoped selection.
- Subject/body.
- Merge fields.
- WhatsApp group-link merge field.
- Provider selection.
- Safe batched sending.

### Merge fields

Current participant-oriented merge fields include:

- `{{name}}`
- `{{participant_id}}`
- `{{email}}`
- `{{programme_name}}`
- `{{whatsapp_group_link}}`

### Provider selection

The frontend supports:

- Existing default (ZeptoMail / Zoho).
- Gmail.
- ZeptoMail.
- Zoho Mail SMTP.

Provider-specific details and secrets are documented in [EMAIL_PROVIDERS.md](./EMAIL_PROVIDERS.md).

### Delivery reports

Delivery reports are reconstructed from `communication_logs` metadata and expose counts such as:

- Requested.
- Sent.
- Failed.
- Skipped.
- Provider/transport.
- Per-recipient result details where recorded.

"Sent" means accepted by the provider transport, not guaranteed inbox delivery.

## WhatsApp Center

The current WhatsApp Center uses the Meta WhatsApp Business infrastructure.

Feature areas:

- Connection state.
- Approved-template sync.
- Campaign compose.
- Participant audience selection.
- Explicit opt-in/opt-out records.
- Template variable mapping.
- Campaign queueing.
- Reports.
- Delivery/read/failure counters.
- Webhook-driven status infrastructure.

Relevant Edge Functions include:

- `whatsapp-status`
- `sync-whatsapp-templates`
- `whatsapp-consent`
- `send-whatsapp-campaign`
- `whatsapp-webhook`

### Consent

Campaign eligibility requires:

- A valid WhatsApp number.
- Recorded opt-in.
- Approved/supported Meta template.

The current compose UI caps a campaign at 200 selected eligible recipients.

### Permissions

Current WhatsApp management/sending actions are gated to Owner/Admin in the component.

## Manual WhatsApp helper

Participant profiles can open a normal WhatsApp conversation with a prefilled Participant ID message.

This helper does not use the bulk Meta campaign pipeline.
