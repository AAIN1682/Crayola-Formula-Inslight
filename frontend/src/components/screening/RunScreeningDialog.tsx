import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Formula, ScreeningRun } from '../../types/domain';
import { SCREENING_STAGES } from '../../types/services';
import { useServices } from '../../state/DemoDataProvider';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { ProgressStepper, type StepDescriptor, type StepState } from '../ui/Stepper';
import { Notice } from '../ui/DemoNotice';
import { ScreeningBadge } from '../ui/Badge';
import { useToast } from '../ui/Toast';

const STAGE_DETAIL: Record<string, string> = {
  'Validate formula inputs': 'Checks required fields, ingredient links and the composition total.',
  'Check illustrative rules': 'Applies the demo rule set to each ingredient and to the formula as a whole.',
  'Check exposure-data readiness': 'Records which assessment inputs are available and which are not assessed.',
  'Retrieve historical comparisons': 'Finds synthetic submissions with overlapping raw materials.',
  'Prepare review summary': 'Assembles findings, next actions and the result summary.',
};

const STEPS: StepDescriptor[] = SCREENING_STAGES.map((stage) => ({
  id: stage,
  label: stage,
  description: STAGE_DETAIL[stage],
}));

export function RunScreeningDialog({
  open,
  formula,
  onClose,
  onComplete,
}: {
  open: boolean;
  formula: Formula;
  onClose: () => void;
  onComplete?: (run: ScreeningRun) => void;
}) {
  const services = useServices();
  const toast = useToast();
  const [stageIndex, setStageIndex] = useState(-1);
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
      setStageIndex(-1);
      setRun(undefined);
      setError(undefined);
      return;
    }

    const key = `${formula.id}:${attempt}`;
    if (startedKeyRef.current === key) return;
    startedKeyRef.current = key;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStageIndex(0);
    setRun(undefined);
    setError(undefined);

    services
      .runScreening(formula.id, {
        signal: controller.signal,
        onStage: (_stage, index) => setStageIndex(index),
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setStageIndex(SCREENING_STAGES.length);
        setRun(result);
        toast.success(
          `Screening complete — ${result.status.toUpperCase()}`,
          `${result.presentEvidenceCount} of ${result.requiredEvidenceCount} required documents on file.`,
        );
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'The screening run did not complete.');
      });
  }, [open, attempt, formula.id, services, toast]);

  const stateFor = (_step: StepDescriptor, index: number): StepState => {
    if (error && index === stageIndex) return 'error';
    if (index < stageIndex) return 'done';
    if (index === stageIndex) return 'active';
    return 'pending';
  };

  const finished = Boolean(run);

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={finished || Boolean(error)}
      title={finished ? 'Assessment complete' : 'Running assessment'}
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
          <>
            <Button onClick={onClose}>Close</Button>
            <Button variant="primary" onClick={() => setAttempt((value) => value + 1)}>
              Try again
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted">This usually takes a couple of seconds.</p>
        )
      }
    >
      <div className="space-y-4">
        <ProgressStepper steps={STEPS} stateFor={stateFor} />

        {error ? (
          <Notice tone="danger" title="The screening run did not complete">
            {error}
          </Notice>
        ) : null}

        {finished && run ? (
          <div className="rounded-lg border border-line bg-canvas/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ScreeningBadge status={run.status} />
              <span className="text-[13px] text-muted tabular">
                Evidence completeness {run.evidenceCompleteness}%
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
