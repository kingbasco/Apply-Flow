/**
 * Assignment deadlines are scheduled in Nigeria time (West Africa Time, UTC+01:00).
 * We store absolute UTC instants in Supabase's timestamptz column and always render
 * them in Africa/Lagos rather than relying on the viewer's device timezone.
 */
export const ASSIGNMENT_TIME_ZONE = 'Africa/Lagos';

const localPartsFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: ASSIGNMENT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function assignmentDeadlineForInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const parts = localPartsFormatter.formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

export function assignmentDeadlineToISO(localTime: string): string | null {
  if (!localTime) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localTime)) {
    throw new Error('Select a valid assignment deadline.');
  }
  // West Africa Time does not observe daylight saving time.
  const date = new Date(`${localTime}:00+01:00`);
  if (!Number.isFinite(date.getTime()) || assignmentDeadlineForInput(date.toISOString()) !== localTime) {
    throw new Error('Select a valid assignment deadline.');
  }
  return date.toISOString();
}

export function formatAssignmentDeadline(value: string | null | undefined): string {
  if (!value) return 'No deadline';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Invalid deadline';
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: ASSIGNMENT_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date) + ' WAT';
}
