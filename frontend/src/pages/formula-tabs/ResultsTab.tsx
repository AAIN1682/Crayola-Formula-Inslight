import { useEffect, useState } from 'react';
import { fetchRecentAnalyses, fetchStoredAssessment, screeningRunFromStored } from '../../api/formulaBackend';
import type { ScreeningRun } from '../../types/domain';
import { useFormulaDetail, useFormulaPageActions } from '../FormulaDetailsPage';
import { Card } from '../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../components/ui/States';
import { PrecheckResult } from '../../components/screening/PrecheckResult';

export function ResultsTab() {
  const { formula } = useFormulaDetail();
  const { openEdit } = useFormulaPageActions();
  const [run, setRun] = useState<ScreeningRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchRecentAnalyses(formula.id, 1)
      .then(async (analyses) => {
        const latest = analyses[0];
        if (!latest) {
          if (!cancelled) setRun(null);
          return;
        }
        const assessment = await fetchStoredAssessment(latest.assessmentId);
        if (!cancelled) setRun(screeningRunFromStored(assessment, formula));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setRun(null);
        setError(cause instanceof Error ? cause.message : 'The latest result could not be opened.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formula]);

  if (loading && !run) {
    return (
      <Card>
        <LoadingState label="Loading the latest result…" rows={5} />
      </Card>
    );
  }

  if (error && !run) {
    return (
      <Card>
        <ErrorState title="The latest result could not be opened" message={error} />
      </Card>
    );
  }

  if (!run) {
    return (
      <Card>
        <EmptyState
          variant="shield"
          title="No saved assessment yet"
          message="Run an assessment. Earlier runs stay on the History tab with the version they were saved under."
        />
      </Card>
    );
  }

  return <PrecheckResult formula={formula} run={run} onEditFormula={openEdit} />;
}
