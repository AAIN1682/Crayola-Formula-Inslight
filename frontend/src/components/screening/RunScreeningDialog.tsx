import { useEffect, useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Formula, ScreeningRun } from '../../types/domain';
import { useServices } from '../../state/DemoDataProvider';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Notice } from '../ui/DemoNotice';
import { ScreeningBadge } from '../ui/Badge';
import { useToast } from '../ui/Toast';
import { isLiveAzureAssessment } from '../../api/formulaBackend';

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
      return;
    }

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
      })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRun(result);
        const live = isLiveAzureAssessment(result.formulaAssessment);
        if (live) {
          toast.success(
            'Assessment complete',
            `Azure analysis stored for ${result.formulaVersion}. Verified evidence coverage ${result.evidenceCompleteness}%.`,
          );
        } else {
          toast.error(
            'AI analysis failed',
            result.formulaAssessment?.execution?.error_message || result.summary,
          );
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(cause instanceof Error ? cause.message : 'The screening run did not complete.');
      });
  }, [open, attempt, formula.id, services, toast]);

  const finished = Boolean(run);
  const live = isLiveAzureAssessment(run?.formulaAssessment);
  const aiFailed = Boolean(run && !live);

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={finished || Boolean(error)}
      title={error ? 'Assessment did not finish' : live ? 'Assessment complete' : finished ? 'AI analysis failed' : 'Running assessment'}
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
          <p className="text-xs text-muted">Analyzing the formula against the packaged source documents.</p>
        )
      }
    >
      <div className="space-y-4">
        {!finished && !error ? (
          <p className="text-sm text-ink">Analyzing formula and supporting documents…</p>
        ) : null}

        {error ? (
          <Notice tone="danger" title="The screening run did not complete">
            {error}
          </Notice>
        ) : null}

        {aiFailed && run ? (
          <Notice tone="danger" title="AI analysis failed">
            {run.formulaAssessment?.execution?.error_message || 'Azure generation did not succeed. Calculated checks are shown as a partial result.'}
          </Notice>
        ) : null}

        {finished && run ? (
          <div className="rounded-lg border border-line bg-canvas/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <ScreeningBadge status={run.status} />
              <span className="text-[13px] text-muted tabular">
                Verified evidence coverage {run.evidenceCompleteness}%
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
