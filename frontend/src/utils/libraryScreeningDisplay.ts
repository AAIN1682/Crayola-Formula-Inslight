import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Loader2,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type LibraryDisplayStatus =
  | 'not-screened'
  | 'pass-leaning'
  | 'at-risk'
  | 'likely-cl'
  | 'screening-failed'
  | 'running';

export type ScreeningBand = 'all' | 'likely-ap' | 'at-risk' | 'likely-cl' | 'not-screened';

export interface LatestRunSummary {
  runId: string;
  assessmentId: string;
  lastScreenedAt?: string | null;
  displayStatus: LibraryDisplayStatus;
  outdated: boolean;
  scoreValue?: number | null;
  scoreKind: 'numeric_estimate' | 'rule_based' | 'none';
  scoreLabel?: string | null;
  topIssue?: string | null;
  extraIssues: number;
}

export interface FormulaLibrarySummaryCounts {
  total: number;
  likelyAp: number;
  atRisk: number;
  likelyCl: number;
  notScreened: number;
}

export const LIBRARY_STATUS_LABEL: Record<LibraryDisplayStatus, string> = {
  'not-screened': 'Not screened',
  'pass-leaning': 'Pass-leaning',
  'at-risk': 'At risk',
  'likely-cl': 'Likely CL',
  'screening-failed': 'Screening failed',
  running: 'Running',
};

export const SCREENING_BAND_LABEL: Record<ScreeningBand, string> = {
  all: 'All',
  'likely-ap': 'Likely AP',
  'at-risk': 'At risk',
  'likely-cl': 'Likely CL',
  'not-screened': 'Not screened',
};

export function libraryStatusIcon(status: LibraryDisplayStatus): LucideIcon {
  switch (status) {
    case 'pass-leaning':
      return CheckCircle2;
    case 'at-risk':
      return AlertTriangle;
    case 'likely-cl':
      return XCircle;
    case 'screening-failed':
      return AlertOctagon;
    case 'running':
      return Loader2;
    case 'not-screened':
    default:
      return CircleDashed;
  }
}

export function libraryStatusTone(status: LibraryDisplayStatus): 'neutral' | 'success' | 'warning' | 'danger' | 'info' {
  switch (status) {
    case 'pass-leaning':
      return 'success';
    case 'at-risk':
      return 'warning';
    case 'likely-cl':
    case 'screening-failed':
      return 'danger';
    case 'running':
      return 'info';
    default:
      return 'neutral';
  }
}

export function formatLibraryScore(summary?: LatestRunSummary | null): { text: string; barWidth: number | null; hint?: string } {
  if (!summary || summary.scoreKind !== 'numeric_estimate' || summary.scoreValue == null) {
    return { text: '-', barWidth: null };
  }
  const value = summary.scoreValue;
  return { text: `${value}%`, barWidth: Math.min(100, Math.max(0, value)), hint: 'model estimate' };
}

export function topIssueLabel(summary: LatestRunSummary | undefined, hasRun: boolean): string {
  if (!hasRun) return '-';
  if (!summary?.topIssue) return 'No open issues';
  if (summary.extraIssues > 0) return `${summary.topIssue} +${summary.extraIssues} more`;
  return summary.topIssue;
}
