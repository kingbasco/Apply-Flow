export function friendlyErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.') {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message ?? '')
        : typeof error === 'string'
          ? error
          : ''

  const message = raw.trim()
  const lower = message.toLowerCase()

  if (!message) return fallback

  if (
    lower.includes('email rate limit exceeded') ||
    lower.includes('over_email_send_rate_limit') ||
    (lower.includes('rate limit') && lower.includes('email'))
  ) {
    return 'Too many emails were requested recently. Please wait a few minutes, then try again.'
  }

  if (
    lower.includes('jwt expired') ||
    lower.includes('invalid jwt') ||
    lower.includes('not authenticated') ||
    lower.includes('authentication required') ||
    lower.includes('session_not_found')
  ) {
    return 'Your session has expired. Please sign in again and retry.'
  }

  if (
    lower.includes('row-level security') ||
    lower.includes('row level security') ||
    lower.includes('permission denied') ||
    lower.includes('insufficient_privilege') ||
    lower.includes('not authorized') ||
    lower.includes('unauthorized')
  ) {
    return 'You do not have permission to complete this action.'
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network request failed') ||
    lower.includes('load failed')
  ) {
    return 'ApplyFlow could not reach the server. Check your connection and try again.'
  }

  if (
    lower.includes('duplicate key value') ||
    lower.includes('unique constraint') ||
    lower.includes('already exists')
  ) {
    return 'That value is already in use. Please choose another one.'
  }

  const looksTechnical =
    /\b(pgrst\d+|sqlstate|postgres|postgrest|relation |column |constraint |violates |invalid input syntax|uuid|stack trace|runtimeexception|http exception)\b/i.test(message) ||
    message.length > 220

  if (looksTechnical) return fallback

  return message
}
