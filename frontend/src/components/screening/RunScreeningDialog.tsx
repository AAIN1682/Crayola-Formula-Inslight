import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Formula, ScreeningRun } from '../../types/domain';
import type { AssessmentMode } from '../../api/formulaBackend';
import { useServices } from '../../state/DemoDataProvider';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Notice } from '../ui/DemoNotice';
import { ScreeningBadge } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import { isLiveAzureAssessment } from '../../api/formulaBackend';
import { isUnresolvedIdentityError } from '../../utils/catalog';

export function RunScreeningDialog({
  open,
  formula,
  onClose,
  onComplete,
  onEditFormula,
}: {
  open: boolean;
  formula: Formula;
  onClose: () => void;
  onComplete?: (run: ScreeningRun) => void;
  onEditFormula?: () => void;
}) {
  const services = useServices();
  const toast = useToast();
  const [mode, setMode] = useState<AssessmentMode>(formula.preferredAssessmentMode ?? 'evidence');
  const [started, setStarted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [run, setRun] = useState<ScreeningRun | undefined>();
  const [error, setError] = useState<string | undefined>();

  const abortRef = useRef<AbortController | null>(null);
  const startedKeyRef = useRef('');

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      startedKeyRef.current = '';
      setRun(undefined);
      setError(undefined);
      setStarted(false);
      setMode(formula.preferredAssessmentMode ?? 'evidence');
      return;
    }
    if (!started) return;

    const key = `${formula.id}:${mode}:${attempt}`;
    if (startedKeyRef.current === key) return;
    startedKeyRef.current = key;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRun(undefined);
    setError(undefined);

    services
      .runScreening(formula.id, {
        signal: controller.signal,
        assessmentMode: mode,
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRun(result);
        const live = isLiveAzureAssessment(result.formulaAssessment);
        if (live) {
          toast.success(
            'Assessment complete',
            `${mode === 'scenario' ? 'Scenario assessment' : 'Evidence assessment'} stored for ${result.formulaVersion}. ${mode === 'scenario' ? 'Scenario evidence completeness' : 'Verified evidence coverage'} ${result.evidenceCompleteness}%.`,
          );
        } else {
          toast.error(
            'AI analysis unavailable',
            result.formulaAssessment?.execution?.error_message || result.summary,
          );
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'The screening run did not complete.');
      });
  }, [open, started, attempt, mode, formula.id, formula.preferredAssessmentMode, services, toast]);

  const finished = Boolean(run);
  const live = isLiveAzureAssessment(run?.formulaAssessment);
  const aiFailed = Boolean(run && !live);
  const identityError = isUnresolvedIdentityError(error);

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!started || finished || Boolean(error)}
      title={
        error
          ? 'Assessment did not finish'
          : live
            ? 'Assessment complete'
            : aiFailed
              ? 'AI analysis unavailable'
              : started
                ? 'Running assessment'
                : 'Run assessment'
      }
      description={`${formula.name} ${formula.version} · ${(formula.targetMarkets ?? []).join(', ') || 'No market selected'}`}
      footer={
        finished && run ? (
          <>
            <Button onClick={onClose}>Stay on this page</Button>
            <Button variant="primary" onClick={() => onComplete?.(run)}>
              View full result
            </Button>
          </>
        ) : error ? (
          identityError ? (
            <>
              <Button onClick={onClose}>Close</Button>
              <Button
                variant="primary"
                onClick={() => {
                  onClose();
                  onEditFormula?.();
                }}
              >
                Edit formula
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose}>Close</Button>
              <Button variant="primary" onClick={() => setAttempt((value) => value + 1)}>
                Try again
              </Button>
            </>
          )
        ) : started ? (
          <p className="text-xs text-muted">Analyzing the formula against the packaged source documents.</p>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={() => setStarted(true)}>
              Start {mode === 'scenario' ? 'scenario' : 'evidence'} assessment
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {!started && !error ? (
          <fieldset className="space-y-2">
            <legend className="text-[13px] font-medium text-ink">Assessment mode</legend>
            <label className="flex items-start gap-2 text-[13px] leading-6 text-ink">
              <input type="radio" name="assessment-mode" checked={mode === 'evidence'} onChange={() => setMode('evidence')} />
              <span>
                <span className="font-medium">Evidence assessment</span> — reviewed applicable rules and evidence only. Example thresholds are not verdicts.
              </span>
            </label>
            <label className="flex items-start gap-2 text-[13px] leading-6 text-ink">
              <input type="radio" name="assessment-mode" checked={mode === 'scenario'} onChange={() => setMode('scenario')} />
              <span>
                <span className="font-medium">Scenario assessment</span> — evaluates editable example thresholds. Not regulatory compliance or an AP/CL prediction.
              </span>
            </label>
          </fieldset>
        ) : null}

        {started && !finished && !error ? (
          <p className="text-sm text-ink">Analyzing formula and supporting documents…</p>
        ) : null}

        {error ? (
          <Notice tone="danger" title="The screening run did not complete">
            {error}
          </Notice>
        ) : null}

        {aiFailed && run ? (
          <Notice tone="danger" title="AI analysis unavailable">
            {run.formulaAssessment?.execution?.error_message || 'Azure generation did not succeed. Calculated checks are shown as a partial result.'}
          </Notice>
        ) : null}

        {finished && run ? (
          <div className="rounded-lg border border-line bg-canvas/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ScreeningBadge status={run.status} />
              <span className="text-[13px] text-muted tabular">
                {run.assessmentMode === 'scenario' ? 'Scenario assessment' : 'Evidence assessment'} · {run.assessmentMode === 'scenario' ? 'Scenario evidence completeness' : 'Verified evidence coverage'} {run.evidenceCompleteness}%
              </span>
            </div>
            <p className="mt-2 text-[13px] leading-6 text-ink">{run.summary}</p>
          </div>
        ) : null}

        <Notice tone="neutral" icon={<ShieldCheck aria-hidden className="size-4" />}>
          Configured checks for the selected markets. This is not a toxicity model, a regulatory evaluation,
          or a certification.
        </Notice>
      </div>
    </Modal>
  );
}
