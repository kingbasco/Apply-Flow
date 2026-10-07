# Email Provider Selection

**Last reconciled:** 7 October 2026

ApplyFlow Email Center supports these selections:

- **Existing default** — current compatibility/default path labelled in the UI as ZeptoMail / Zoho.
- **Gmail**
- **ZeptoMail**
- **Zoho Mail SMTP**

The provider selector is session/UI state; it does not create independent credential stores per organisation.

## Backend endpoints

The current frontend continues to use the compatibility Edge Function names:

- zoho-mail-status
- send-zoho-email

Those functions resolve the selected provider internally.

## Provider behavior

### Existing default

The existing default preserves the deployed compatibility order/configuration used before explicit provider selection.

Do not assume an explicit Gmail/Zoho/ZeptoMail choice will automatically fall back to another provider.

### Gmail

Required Edge Function Secrets:

- GMAIL_SMTP_USERNAME
- GMAIL_SMTP_PASSWORD

Use a Google App Password for an eligible Gmail / Google Workspace account with 2-Step Verification.

Transport:

- smtp.gmail.com
- Port 465
- Direct TLS

Do not use a normal Google password.

### Zoho Mail

Zoho uses SMTP credentials stored in Supabase Edge Function Secrets.

The exact active hostname/configuration depends on the deployed mail function configuration.

Keep credentials server-side only.

### ZeptoMail

ZeptoMail uses its API/token-based configuration.

Token/sender-domain validity may only be fully confirmed during an actual send rather than a no-send connection check.

## Validation

Email Center can request provider validation through the status function.

For Gmail/SMTP, validation checks the connection/authentication path and does not itself send a participant email.

After any credential/provider change, perform a controlled real send and confirm receipt.

## Sending and batching

Current backend requests are intentionally limited to safe batches.

The frontend can split a larger selected audience into smaller backend requests.

Delivery reporting records:

- Provider.
- Transport.
- Requested count.
- Sent count.
- Failed count.
- Skipped count.
- Per-recipient details where available.
- Failure details where recorded.

## Failure semantics

A failure in a batch does not mean already accepted recipients were unsent.

Current behavior does not provide a durable exactly-once queue across manual retries.

Before retrying an uncertain/timed-out send, inspect:

- ApplyFlow delivery report.
- Provider-side records/logs.

## "Sent" vs delivered

ApplyFlow "sent" means the provider accepted the transmission request.

It does **not** guarantee:

- Inbox placement.
- No spam filtering.
- Recipient read.
- Permanent delivery.

## Permissions

Current Email Center sending/configuration actions are Owner/Admin workflows.

Participant data remains organisation/programme scoped.

## Secret handling

Never put SMTP/API credentials in:

- React/Vite public environment variables.
- GitHub.
- Documentation with real values.

Use Supabase Edge Function Secrets.

## Verification commands

Repository automated coverage includes:

~~~bash
npm run build
node --test tests/email-providers.test.mjs
~~~

The test suite uses mocked credentials/transports and does not prove real provider delivery.

See [COMMUNICATIONS.md](./COMMUNICATIONS.md) for the wider communications model.
