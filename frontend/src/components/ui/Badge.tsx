import type { ReactNode } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  CircleHelp,
  Clock,
  FileCheck2,
  FileQuestion,
  FileWarning,
  Info,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type {
  AlertStatus,
  DocumentStatus,
  ReviewStatus,
  ScreeningStatus,
  Severity,
  SubmissionOutcome,
} from '../../types/domain';
import {
  ALERT_STATUS_LABEL,
  DOCUMENT_STATUS_LABEL,
  REVIEW_STATUS_LABEL,
  SCREENING_STATUS_LABEL,
  SEVERITY_LABEL,
} from '../../utils/formatting';
import { cn } from '../../utils/cn';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-soft text-muted border-line',
  info: 'bg-info-soft text-brand-500 border-info-line',
  success: 'bg-success-soft text-success border-success-line',
  warning: 'bg-warning-soft text-warning border-warning-line',
  danger: 'bg-danger-soft text-danger border-danger-line',
  accent: 'bg-accent-50 text-accent-600 border-accent-100',
};

export interface BadgeProps {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({ tone = 'neutral', icon, children, className, title }: BadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        TONES[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}

const SCREENING_TONE: Record<ScreeningStatus, BadgeTone> = {
  green: 'success',
  amber: 'warning',
  red: 'danger',
  'not-screened': 'neutral',
};

export function ScreeningBadge({
  status,
  current = true,
  className,
}: {
  status: ScreeningStatus;
  current?: boolean;
  className?: string;
}) {
  const icon =
    status === 'green' ? (
      <ShieldCheck aria-hidden className="size-3.5" />
    ) : status === 'amber' ? (
      <AlertTriangle aria-hidden className="size-3.5" />
    ) : status === 'red' ? (
      <AlertOctagon aria-hidden className="size-3.5" />
    ) : (
      <CircleDashed aria-hidden className="size-3.5" />
    );

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1.5', className)}>
      <Badge
        tone={SCREENING_TONE[status]}
        icon={icon}
        title={`Internal screening status: ${SCREENING_STATUS_LABEL[status]}`}
      >
        {SCREENING_STATUS_LABEL[status]}
      </Badge>
      {!current && status !== 'not-screened' ? (
        <Badge
          tone="neutral"
          icon={<RotateCcw aria-hidden className="size-3.5" />}
          title="Reassessment required. Markets, age group, or composition no longer match this result."
        >
          Reassessment required
        </Badge>
      ) : null}
    </span>
  );
}

const REVIEW_TONE: Record<ReviewStatus, BadgeTone> = {
  'not-started': 'neutral',
  'in-review': 'info',
  'awaiting-evidence': 'warning',
  complete: 'success',
  returned: 'danger',
};

export function ReviewBadge({ status }: { status: ReviewStatus }) {
  const icon =
    status === 'complete' ? (
      <CheckCircle2 aria-hidden className="size-3.5" />
    ) : status === 'awaiting-evidence' ? (
      <FileQuestion aria-hidden className="size-3.5" />
    ) : status === 'returned' ? (
      <RotateCcw aria-hidden className="size-3.5" />
    ) : status === 'in-review' ? (
      <Clock aria-hidden className="size-3.5" />
    ) : (
      <CircleDashed aria-hidden className="size-3.5" />
    );
  return (
    <Badge tone={REVIEW_TONE[status]} icon={icon} title={`Internal review status: ${REVIEW_STATUS_LABEL[status]}`}>
      {REVIEW_STATUS_LABEL[status]}
    </Badge>
  );
}

const OUTCOME_TONE: Record<SubmissionOutcome, BadgeTone> = {
  AP: 'success',
  CL: 'info',
  'More Data Needed': 'warning',
};

export function OutcomeBadge({ outcome }: { outcome: SubmissionOutcome }) {
  return (
    <Badge tone={OUTCOME_TONE[outcome]} title={`Recorded historical outcome: ${outcome}`}>
      {outcome}
    </Badge>
  );
}

const SEVERITY_TONE: Record<Severity, BadgeTone> = {
  high: 'danger',
  medium: 'warning',
  low: 'info',
  info: 'neutral',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  const icon =
    severity === 'high' ? (
      <AlertOctagon aria-hidden className="size-3.5" />
    ) : severity === 'medium' ? (
      <AlertTriangle aria-hidden className="size-3.5" />
    ) : severity === 'low' ? (
      <CircleHelp aria-hidden className="size-3.5" />
    ) : (
      <Info aria-hidden className="size-3.5" />
    );
  return (
    <Badge tone={SEVERITY_TONE[severity]} icon={icon}>
      {SEVERITY_LABEL[severity]}
    </Badge>
  );
}

const ALERT_STATUS_TONE: Record<AlertStatus, BadgeTone> = {
  open: 'warning',
  acknowledged: 'info',
  resolved: 'success',
};

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  return <Badge tone={ALERT_STATUS_TONE[status]}>{ALERT_STATUS_LABEL[status]}</Badge>;
}

const DOC_STATUS_TONE: Record<DocumentStatus, BadgeTone> = {
  available: 'success',
  missing: 'danger',
  outdated: 'warning',
  requested: 'info',
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const icon =
    status === 'available' ? (
      <FileCheck2 aria-hidden className="size-3.5" />
    ) : status === 'outdated' ? (
      <FileWarning aria-hidden className="size-3.5" />
    ) : (
      <FileQuestion aria-hidden className="size-3.5" />
    );
  return (
    <Badge tone={DOC_STATUS_TONE[status]} icon={icon}>
      {DOCUMENT_STATUS_LABEL[status]}
    </Badge>
  );
}
