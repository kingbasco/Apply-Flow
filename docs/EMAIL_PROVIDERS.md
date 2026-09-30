# Email provider selection

Email Center supports Gmail SMTP, Zoho Mail SMTP and ZeptoMail API. Existing default preserves the earlier ZeptoMail-first, Zoho SMTP-second configuration. Explicit selections never fall back. Provider selection applies to the current Email Center session; reopening uses the existing default.

## Gmail setup

In the ApplyFlow Supabase project's Edge Function Secrets, set:

- `GMAIL_SMTP_USERNAME`: full Gmail / Google Workspace email address.
- `GMAIL_SMTP_PASSWORD`: Google App Password from that same account (requires eligible account with 2-Step Verification).

The backend removes display spaces from the App Password. Gmail connects to `smtp.gmail.com:465` using direct TLS and uses the authenticated address as the sender. Do not enter a regular Google password. Never commit credentials or place them in frontend/Vercel variables.

Keep all existing `ZOHO_*` and `ZEPTOMAIL_*` secrets. No database migration is required.

Deploy `zoho-mail-status` and `send-zoho-email` with their `index.ts`, `smtp.ts`, `zeptomail.ts` and `providers.ts` files, preserving JWT verification. Deploy the frontend after the functions. The endpoint names remain unchanged for compatibility.

## Use

1. Email → Email connection → Send using → Gmail.
2. Validate Gmail. This authenticates and checks MAIL FROM, then resets/closes the SMTP session; it does not send an email.
3. Compose → Send using → select the desired provider. Confirm the displayed sender.
4. Select recipients and send. First verify receipt with one intended recipient.
5. Delivery reports identify the provider and accepted/failed/skipped outcomes.

Only authenticated Owners/Admins in the requested organisation can check configuration or send. Recipient queries remain scoped to that organisation and programme. Passwords/tokens are not returned to clients. These are project-level configurations, shared by authorised organisations in this deployment, not independent per-organisation credential stores.

Gmail and Zoho limits still apply. A failure stops the current batch and remaining batches; already accepted recipients stay recorded and are removed from the current selection. Remaining unattempted recipients in the current batch are recorded as skipped. Later batches are not attempted or logged. No automatic provider switching or retry occurs. An unconfirmed/timed-out transaction may have been accepted: inspect provider records before retrying. There is no durable idempotency/queue guarantee across manual retries.

“Sent” means provider acceptance, not inbox delivery. ZeptoMail token/domain validity is confirmed on sending rather than by the configuration check. Refreshing configuration cannot reset a provider's quota or unblock its account.

## Verification

- `npm run build`
- `node --test tests/email-providers.test.mjs`

Tests mock all credentials/transports and exercise Gmail isolation, legacy selection, missing credentials, authorization and partial-failure reporting. They do not establish real Gmail authentication or delivery. A logged-in Owner/Admin must run Validate Gmail, then explicitly send and confirm a controlled email.
