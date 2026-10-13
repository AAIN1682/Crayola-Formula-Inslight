import { useEffect, useState } from 'react';
import { fetchRecentAnalyses, fetchStoredAssessment, screeningRunFromStored } from '../../api/formulaBackend';
import type { RecentAnalysis } from '../../types/services';
import type { ScreeningRun } from '../../types/domain';
import { useFormulaDetail, useFormulaPageActions } from '../FormulaDetailsPage';
import { Card, CardBody } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { PrecheckResult } from '../../components/screening/PrecheckResult';
import { assessmentOutcomeLabel, formatDateTime } from '../../utils/formatting';

interface VersionEvent {
  version: string;
  kind: 'created' | 'edited' | 'assessed' | string;
  at: string;
}

interface HistoryEntry {
  key: string;
  version: string;
  at: string;
  label: string;
  assessmentId?: string;
  band?: string;
  headline?: string;
  confidence?: string;
}

function eventLabel(kind: string) {
  if (kind === 'edited') return 'Edited';
  if (kind === 'created') return 'Created';
  if (kind === 'assessed') return 'Assessment';
  return 'Saved';
}

export function HistoryTab() {
  const { formula } = useFormulaDetail();
  const { openEdit } = useFormulaPageActions();
  const [rows, setRows] = useState<RecentAnalysis[]>([]);
  const [events, setEvents] = useState<VersionEvent[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [run, setRun] = useState<ScreeningRun | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    setError('');
    Promise.all([
      fetchRecentAnalyses(formula.id, 50),
      fetch(`/api/formulas/${encodeURIComponent(formula.id)}`).then(async (response) => {
        if (!response.ok) return [] as VersionEvent[];
        const body = await response.json();
        return Array.isArray(body.versionHistory) ? (body.versionHistory as VersionEvent[]) : [];
      }),
    ])
      .then(([analyses, history]) => {
        if (cancelled) return;
        setRows(analyses);
        setEvents(history);
        setSelectedId(analyses[0]?.assessmentId ?? '');
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'Saved results could not be loaded.');
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formula.id, formula.version, formula.updatedAt]);

  useEffect(() => {
    if (!selectedId) {
      setRun(null);
      return;
    }
    let cancelled = false;
    setLoadingRun(true);
    setError('');
    fetchStoredAssessment(selectedId)
      .then((assessment) => {
        if (!cancelled) setRun(screeningRunFromStored(assessment, formula));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setRun(null);
        setError(cause instanceof Error ? cause.message : 'That saved result could not be opened.');
      })
      .finally(() => {
        if (!cancelled) setLoadingRun(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId, formula]);

  if (loadingList && rows.length === 0) {
    return (
      <Card>
        <LoadingState label="Loading saved analyses…" rows={4} />
      </Card>
    );
  }

  if (error && rows.length === 0) {
    return (
      <Card>
        <ErrorState title="Saved analyses could not be opened" message={error} />
      </Card>
    );
  }

  const entries: HistoryEntry[] = [
    ...rows.map((row) => ({
      key: row.assessmentId,
      version: row.version || 'Version not recorded',
      at: row.createdAt || '',
      label: 'Assessment',
      assessmentId: row.assessmentId,
      band: row.band,
      headline: row.headline,
      confidence: row.confidence,
    })),
    ...events
      .filter((event) => event.kind !== 'assessed')
      .map((event) => ({
        key: `${event.kind}-${event.version}-${event.at}`,
        version: event.version,
        at: event.at,
        label: eventLabel(event.kind),
      })),
  ].sort((left, right) => (right.at || '').localeCompare(left.at || ''));

  if (entries.length === 0) {
    return (
      <Card>
        <EmptyState
          variant="shield"
          title="No saved assessment yet"
          message="Each edit and assessment is stored here with the version assigned by the server."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-2">
          <p className="text-sm font-semibold text-navy-800">Version history</p>
          <p className="text-[12px] text-muted">Current version {formula.version}. The server assigns a new version for each edit and each assessment.</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {entries.map((entry) => {
              const selected = Boolean(entry.assessmentId) && entry.assessmentId === selectedId;
              const content = (
                <>
                  <span>
                    <span className="block text-sm font-medium text-ink">{entry.version}</span>
                    <span className="block text-[12px] text-muted">{entry.at ? formatDateTime(entry.at) : 'Saved'}</span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold text-ink">
                      {entry.assessmentId
                        ? assessmentOutcomeLabel(entry.band) || entry.headline || 'Saved result'
                        : entry.label}
                    </span>
                    <span className="block text-[12px] capitalize text-muted">
                      {entry.assessmentId ? `Confidence ${entry.confidence || 'not rated'}` : 'Assigned by the server'}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={entry.key}>
                  {entry.assessmentId ? (
                    <button
                      type="button"
                      onClick={() => setSelectedId(entry.assessmentId || '')}
                      className={`flex w-full flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-left ${selected ? 'bg-brand-50' : 'hover:bg-canvas'}`}
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex w-full flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                      {content}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>

      {error ? (
        <Card>
          <ErrorState title="This result could not be opened" message={error} />
        </Card>
      ) : null}

      {loadingRun && !run ? (
        <Card>
          <LoadingState label="Loading the saved result…" rows={5} />
        </Card>
      ) : null}

      {run ? <PrecheckResult formula={formula} run={run} onEditFormula={openEdit} /> : null}
    </div>
  );
}
