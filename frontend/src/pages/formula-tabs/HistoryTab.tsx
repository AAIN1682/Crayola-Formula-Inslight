import { useEffect, useState } from 'react';
import { fetchRecentAnalyses, fetchStoredAssessment, screeningRunFromStored } from '../../api/formulaBackend';
import type { RecentAnalysis } from '../../types/services';
import type { ScreeningRun } from '../../types/domain';
import { useFormulaDetail, useFormulaPageActions } from '../FormulaDetailsPage';
import { Card, CardBody } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { PrecheckResult } from '../../components/screening/PrecheckResult';
import { assessmentOutcomeLabel, formatDateTime } from '../../utils/formatting';

export function HistoryTab() {
  const { formula } = useFormulaDetail();
  const { openEdit } = useFormulaPageActions();
  const [rows, setRows] = useState<RecentAnalysis[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [run, setRun] = useState<ScreeningRun | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingRun, setLoadingRun] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setLoadingList(true);
    setError('');
    fetchRecentAnalyses(formula.id, 50)
      .then((analyses) => {
        if (cancelled) return;
        setRows(analyses);
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
  }, [formula.id]);

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

  if (rows.length === 0) {
    return (
      <Card>
        <EmptyState
          variant="shield"
          title="No saved assessment yet"
          message="Each assessment is stored here with the formula version it was run against."
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="space-y-2">
          <p className="text-sm font-semibold text-navy-800">Saved analyses</p>
          <ul className="divide-y divide-line rounded-lg border border-line">
            {rows.map((row) => {
              const selected = row.assessmentId === selectedId;
              return (
                <li key={row.assessmentId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(row.assessmentId)}
                    className={`flex w-full flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-left ${selected ? 'bg-brand-50' : 'hover:bg-canvas'}`}
                  >
                    <span>
                      <span className="block text-sm font-medium text-ink">{row.version || 'Version not recorded'}</span>
                      <span className="block text-[12px] text-muted">{row.createdAt ? formatDateTime(row.createdAt) : 'Saved result'}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold text-ink">
                        {assessmentOutcomeLabel(row.band) || row.headline || 'Saved result'}
                      </span>
                      <span className="block text-[12px] capitalize text-muted">
                        Confidence {row.confidence || 'not rated'}
                      </span>
                    </span>
                  </button>
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
