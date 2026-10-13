import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import type { Formula, ScreeningRun } from '../../types/domain';
import { useServices } from '../../state/DemoDataProvider';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Notice } from '../ui/DemoNotice';
import { useToast } from '../ui/Toast';
import { isLiveAzureAssessment } from '../../api/formulaBackend';
import { isUnresolvedIdentityError } from '../../utils/catalog';
import { PrecheckResult } from './PrecheckResult';

function predictionLabel(outcome?: string) {
  if (outcome === 'ap_leaning') return 'AP-leaning';
  if (outcome === 'cl_leaning') return 'CL-leaning';
  return 'Indeterminate';
}

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
  const navigate = useNavigate();
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
      return;
    }
    if (!started) return;

    // Excludes formula.version: each run advances the stored version, which must not start another run.
    const key = `${formula.id}:${attempt}`;
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
        assessmentMode: 'evidence',
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRun(result);
        const live = isLiveAzureAssessment(result.formulaAssessment);
        if (live) {
          const outcome = predictionLabel(result.formulaAssessment?.preliminary_assessment?.preliminary_prediction?.outcome);
          toast.success('Assessment complete', `${outcome} preliminary assessment stored for ${result.formulaVersion}.`);
        } else {
          toast.error(
            'AI assessment failed',
            result.formulaAssessment?.execution?.error_message || result.summary,
          );
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'The screening run did not complete.');
      });
  }, [open, started, attempt, formula.id, services, toast]);

  const finished = Boolean(run);
  const live = isLiveAzureAssessment(run?.formulaAssessment);
  const aiFailed = Boolean(run && !live);
  const identityError = isUnresolvedIdentityError(error);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size={finished && live ? 'wide' : 'xl'}
      dismissible={!started || finished || Boolean(error)}
      title={
        error
          ? 'Assessment did not finish'
          : aiFailed
            ? 'AI assessment failed'
            : live
              ? 'Pre-check result'
              : started
                ? 'Running assessment'
                : 'Run assessment'
      }
      description={`${formula.name} ${formula.version} · ${(formula.targetMarkets ?? []).join(', ') || 'No region selected'}`}
      footer={
        finished && run && live ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => onComplete?.(run)}>
              View full result
            </Button>
          </>
        ) : finished && run ? (
          <>
            <Button onClick={onClose}>Close</Button>
            <Button onClick={() => navigate(`/formulas/${formula.id}/evidence`)}>Upload documents</Button>
            <Button onClick={() => navigate(`/formulas/${formula.id}/evidence`)}>Review evidence</Button>
            <Button
              onClick={() => {
                onClose();
                onEditFormula?.();
              }}
            >
              Edit as new version
            </Button>
            <Button onClick={() => navigate(`/formulas/${formula.id}/history`)}>Compare versions</Button>
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
          <p className="text-sm text-muted">Retrieving rules, calculations, and document evidence, then requesting the assessment.</p>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" onClick={() => setStarted(true)}>
              Run assessment
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4 text-[15px] leading-7 text-ink">
        {!started && !error ? (
          <p>
            This runs one preliminary assessment of the saved {formula.version} record for the selected regions. Missing documents stay as uncertainty. Invalid numbers are reported as field errors.
          </p>
        ) : null}

        {started && !finished && !error ? (
          <p>Assessing {formula.name} {formula.version}…</p>
        ) : null}

        {error ? (
          <Notice tone="danger" title="The screening run did not complete">
            {error}
          </Notice>
        ) : null}

        {aiFailed && run ? (
          <Notice tone="danger" title="AI assessment failed">
            {run.formulaAssessment?.execution?.error_message || 'Azure did not return a validated assessment. Calculated checks were kept and were not replaced with a success result.'}
          </Notice>
        ) : null}

        {finished && run && live ? (
          <PrecheckResult
            formula={formula}
            run={run}
            onEditFormula={() => {
              onClose();
              onEditFormula?.();
            }}
          />
        ) : null}

        {finished && run && !live ? (
          <div className="space-y-4">
            <p>{run.summary}</p>
          </div>
        ) : null}

        {!(finished && live) ? (
          <Notice tone="neutral" icon={<ShieldCheck aria-hidden className="size-4" />}>
            Preliminary internal assessment; not certification.
          </Notice>
        ) : null}
      </div>
    </Modal>
  );
}
