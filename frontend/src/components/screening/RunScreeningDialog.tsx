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

    const key = `${formula.id}:${formula.version}:${attempt}`;
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
  }, [open, started, attempt, formula.id, formula.version, services, toast]);

  const finished = Boolean(run);
  const live = isLiveAzureAssessment(run?.formulaAssessment);
  const aiFailed = Boolean(run && !live);
  const identityError = isUnresolvedIdentityError(error);
  const preliminary = run?.formulaAssessment?.preliminary_assessment;
  const prediction = preliminary?.preliminary_prediction;
  const aiFindings = (preliminary?.findings ?? []).slice(0, 3);
  const fallbackFindings = aiFindings.length > 0 ? [] : (run?.findings ?? []).slice(0, 3);
  const missing = preliminary?.missing_documents ?? [];
  const actions = preliminary?.next_actions ?? [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      dismissible={!started || finished || Boolean(error)}
      title={
        error
          ? 'Assessment did not finish'
          : aiFailed
            ? 'AI assessment failed'
            : live
              ? 'Preliminary assessment'
              : started
                ? 'Running assessment'
                : 'Run assessment'
      }
      description={`${formula.name} ${formula.version} · ${(formula.targetMarkets ?? []).join(', ') || 'No region selected'}`}
      footer={
        finished && run ? (
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
            <Button onClick={() => navigate(`/formulas/${formula.id}/screening`)}>Compare versions</Button>
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

        {finished && run ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold tracking-wide text-subtle uppercase">Preliminary AP/CL assessment</p>
              <p className="mt-1 text-lg font-semibold text-navy-800">{predictionLabel(prediction?.outcome)}</p>
              <p className="text-muted">{prediction?.basis || run.summary}</p>
            </div>
            <div>
              <p className="text-xs font-semibold tracking-wide text-subtle uppercase">AI assessment confidence</p>
              <p className="mt-1 capitalize">{prediction?.analysis_confidence || 'low'}</p>
              <p className="text-muted">{prediction?.confidence_reason || 'Confidence describes support for this assessment, not a measured chance of certification.'}</p>
            </div>
            <p>{preliminary?.assessment_summary || run.summary}</p>
            {aiFindings.length > 0 || fallbackFindings.length > 0 ? (
              <ul className="space-y-2">
                {aiFindings.map((item) => (
                  <li key={item.finding_id} className="rounded-lg border border-line px-3 py-2">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted">{item.reason}</p>
                  </li>
                ))}
                {fallbackFindings.map((item) => (
                  <li key={item.id} className="rounded-lg border border-line px-3 py-2">
                    <p className="font-medium">{item.concern}</p>
                    <p className="text-sm text-muted">{item.explanation}</p>
                  </li>
                ))}
              </ul>
            ) : null}
            {missing.length > 0 ? (
              <div>
                <p className="font-medium">Missing documents or information</p>
                <ul className="mt-1 list-disc pl-5 text-muted">
                  {missing.slice(0, 3).map((item) => (
                    <li key={`${item.title}-${item.document_type}`}>{item.title || item.document_type}: {item.reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {actions[0] ? (
              <p>
                <span className="font-medium">Next: </span>
                {actions[0].action}. {actions[0].reason}
              </p>
            ) : null}
            {prediction?.numeric_estimate != null ? (
              <p className="text-sm text-muted">
                Uncalibrated AI estimate {prediction.numeric_estimate}. This is not a measured acceptance probability.
              </p>
            ) : null}
          </div>
        ) : null}

        <Notice tone="neutral" icon={<ShieldCheck aria-hidden className="size-4" />}>
          Preliminary internal assessment; not certification.
        </Notice>
      </div>
    </Modal>
  );
}
