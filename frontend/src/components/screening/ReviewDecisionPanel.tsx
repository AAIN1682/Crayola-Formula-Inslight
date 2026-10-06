import { useState } from 'react';
import { CheckCircle2, FileQuestion, RotateCcw } from 'lucide-react';
import type { ReviewDecision, ReviewDecisionKind } from '../../types/domain';
import { useServices, useDemoSelector } from '../../state/DemoDataProvider';
import { useAsyncAction } from '../../hooks/useAsyncData';
import { Button } from '../ui/Button';
import { Field, RadioCard, TextArea } from '../ui/Field';
import { Badge } from '../ui/Badge';
import { Notice } from '../ui/DemoNotice';
import { useToast } from '../ui/Toast';
import { REVIEW_DECISION_LABEL, formatDateTime } from '../../utils/formatting';

const OPTIONS: { value: ReviewDecisionKind; label: string; description: string; icon: typeof CheckCircle2 }[] = [
  {
    value: 'request-evidence',
    label: 'Request more evidence',
    description: 'Sets the internal review status to “Awaiting evidence”.',
    icon: FileQuestion,
  },
  {
    value: 'review-complete',
    label: 'Mark internal review complete',
    description: 'Records that your team has finished its internal review of this run.',
    icon: CheckCircle2,
  },
  {
    value: 'return-for-changes',
    label: 'Return for formulation changes',
    description: 'Sends the formula back to the owner for a revised composition.',
    icon: RotateCcw,
  },
];

export function ReviewDecisionPanel({
  formulaId,
  runId,
  isCurrent,
  decisions,
}: {
  formulaId: string;
  runId: string;
  isCurrent: boolean;
  decisions: ReviewDecision[];
}) {
  const services = useServices();
  const toast = useToast();
  const people = useDemoSelector((state) => state.people);
  const [decision, setDecision] = useState<ReviewDecisionKind>('request-evidence');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  const noteError = touched && note.trim().length < 10 ? 'A review note of at least 10 characters is required.' : undefined;

  const save = useAsyncAction(async () => {
    if (note.trim().length < 10) {
      setTouched(true);
      return;
    }
    await services.saveReviewDecision({ formulaId, runId, decision, note });
    toast.success('Review decision recorded', REVIEW_DECISION_LABEL[decision]);
    setNote('');
    setTouched(false);
  });

  return (
    <div className="space-y-4">
      {!isCurrent ? (
        <Notice tone="warning" title="This result is no longer current">
          The formula changed after this run. Recording a decision here is still possible, but re-running
          screening first gives the reviewer an up-to-date result.
        </Notice>
      ) : null}

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-[13px] font-medium text-ink">Decision</legend>
        {OPTIONS.map((option) => (
          <RadioCard
            key={option.value}
            name="review-decision"
            checked={decision === option.value}
            onSelect={() => setDecision(option.value)}
            label={option.label}
            description={option.description}
            icon={<option.icon aria-hidden className="size-4 text-muted" />}
          />
        ))}
      </fieldset>

      <Field
        label="Review note"
        htmlFor="review-note"
        required
        error={noteError}
        hint="Recorded against the formula activity history so the reasoning stays with the record."
      >
        <TextArea
          id="review-note"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => setTouched(true)}
          invalid={Boolean(noteError)}
          placeholder="Explain what you reviewed and what happens next…"
        />
      </Field>

      <Button variant="primary" onClick={() => void save.run()} loading={save.pending}>
        Record decision
      </Button>

      {decisions.length > 0 ? (
        <div className="border-t border-line pt-4">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-subtle uppercase">
            Decisions on this run
          </p>
          <ul className="space-y-2.5">
            {decisions.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-line bg-canvas/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      entry.decision === 'review-complete'
                        ? 'success'
                        : entry.decision === 'return-for-changes'
                          ? 'danger'
                          : 'warning'
                    }
                  >
                    {REVIEW_DECISION_LABEL[entry.decision]}
                  </Badge>
                  <span className="text-xs text-muted tabular">{formatDateTime(entry.decidedAt)}</span>
                </div>
                <p className="mt-1.5 text-[13px] leading-6 text-ink">{entry.note}</p>
                <p className="mt-1 text-xs text-subtle">
                  {people.find((person) => person.id === entry.decidedById)?.name ?? 'Demo user'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
