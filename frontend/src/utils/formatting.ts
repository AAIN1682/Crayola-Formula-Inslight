import type {
  AlertStatus,
  AlertType,
  DocumentStatus,
  ReviewDecisionKind,
  ReviewStatus,
  ScreeningStatus,
  Severity,
  SubmissionOutcome,
} from '../types/domain';

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const MONTH_FORMAT = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_FORMAT.format(date);
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_TIME_FORMAT.format(date);
}

export function formatMonth(iso: string): string {
  return MONTH_FORMAT.format(new Date(iso));
}

export function formatRelative(iso?: string, now: Date = new Date()): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.round(diffMs / 60000);
  if (Math.abs(diffMinutes) < 1) return 'just now';
  if (Math.abs(diffMinutes) < 60) {
    return diffMinutes > 0 ? `${diffMinutes}m ago` : `in ${-diffMinutes}m`;
  }
  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    return diffHours > 0 ? `${diffHours}h ago` : `in ${-diffHours}h`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (Math.abs(diffDays) < 31) {
    return diffDays > 0 ? `${diffDays}d ago` : `in ${-diffDays}d`;
  }
  return formatDate(iso);
}

export function daysUntil(iso?: string, now: Date = new Date()): number | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  return Math.round((date.getTime() - now.getTime()) / 86400000);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${value.toFixed(fractionDigits).replace(/\.0+$/, '')}%`;
}

export function formatConcentration(value: number): string {
  return `${Number(value.toFixed(3))}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export const SCREENING_STATUS_LABEL: Record<ScreeningStatus, string> = {
  green: 'Green',
  amber: 'Amber',
  red: 'Red',
  'not-screened': 'Not screened',
};

export const SCREENING_STATUS_HINT: Record<ScreeningStatus, string> = {
  green: 'Demo checks found no open concerns and required evidence is on file.',
  amber: 'Demo checks found missing evidence or inputs that need reviewer attention.',
  red: 'Demo checks surfaced a high-priority concern that requires expert assessment.',
  'not-screened': 'This formula has not been screened in the demo workspace yet.',
};

export const REVIEW_STATUS_LABEL: Record<ReviewStatus, string> = {
  'not-started': 'Not started',
  'in-review': 'In review',
  'awaiting-evidence': 'Awaiting evidence',
  complete: 'Review complete',
  returned: 'Returned for changes',
};

export const REVIEW_DECISION_LABEL: Record<ReviewDecisionKind, string> = {
  'request-evidence': 'Requested more evidence',
  'review-complete': 'Marked internal review complete',
  'return-for-changes': 'Returned for formulation changes',
};

export const OUTCOME_LABEL: Record<SubmissionOutcome, string> = {
  AP: 'AP',
  CL: 'CL',
  'More Data Needed': 'More Data Needed',
};

export const OUTCOME_DESCRIPTION: Record<SubmissionOutcome, string> = {
  AP: 'Recorded outcome in the synthetic history: accepted as submitted.',
  CL: 'Recorded outcome in the synthetic history: accepted with cautionary labelling.',
  'More Data Needed': 'Recorded outcome in the synthetic history: additional data requested.',
};

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  'safety-source-update': 'Safety-source update',
  'supplier-document-update': 'Supplier-document update',
  'evidence-gap': 'Missing or outdated evidence',
  'scheduled-review': 'Scheduled review due',
};

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  open: 'Open',
  acknowledged: 'Acknowledged',
  resolved: 'Resolved',
};

export const DOCUMENT_STATUS_LABEL: Record<DocumentStatus, string> = {
  available: 'Available',
  missing: 'Missing',
  outdated: 'Outdated',
  requested: 'Requested',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  info: 'Information',
};

export const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

/** ISO timestamp for midnight today — used to keep the seeded dataset anchored to "now". */
export function startOfToday(now: Date = new Date()): Date {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date;
}

export function shiftDays(base: Date, days: number, hours = 9, minutes = 0): string {
  const date = new Date(base);
  date.setDate(date.getDate() + days);
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
}
