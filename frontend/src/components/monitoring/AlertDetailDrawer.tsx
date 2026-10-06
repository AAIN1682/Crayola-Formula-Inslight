import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCheck, UserPlus } from 'lucide-react';
import { useAsyncAction, useAsyncData } from '../../hooks/useAsyncData';
import { useDemoSelector, useServices } from '../../state/DemoDataProvider';
import { Drawer } from '../ui/Drawer';
import { Button } from '../ui/Button';
import { AlertStatusBadge, Badge, ScreeningBadge } from '../ui/Badge';
import { Field, Select, TextArea } from '../ui/Field';
import { ErrorState, LoadingState } from '../ui/States';
import { Notice } from '../ui/DemoNotice';
import { useToast } from '../ui/Toast';
import { ALERT_TYPE_LABEL, formatDate, formatDateTime } from '../../utils/formatting';

export function AlertDetailDrawer({ alertId, onClose }: { alertId: string; onClose: () => void }) {
  const services = useServices();
  const toast = useToast();
  const people = useDemoSelector((state) => state.people);
  const [assignee, setAssignee] = useState('');
  const [note, setNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);

  const { data, loading, error, reload } = useAsyncData(
    () => services.getMonitoringAlert(alertId),
    [alertId],
  );

  const acknowledge = useAsyncAction(async () => {
    await services.updateMonitoringAlert(alertId, { status: 'acknowledged' });
    toast.success('Alert acknowledged', 'It stays on the list until it is resolved.');
  });

  const assign = useAsyncAction(async () => {
    if (!assignee) return;
    await services.updateMonitoringAlert(alertId, { assignedToId: assignee });
    toast.success('Reviewer assigned', people.find((person) => person.id === assignee)?.name);
  });

  const createTask = useAsyncAction(async () => {
    await services.updateMonitoringAlert(alertId, {
      status: 'acknowledged',
      createReassessmentTask: true,
    });
    toast.success(
      'Reassessment task created',
      'Affected formulas were moved into review with a date 14 days from now.',
    );
  });

  const resolve = useAsyncAction(async () => {
    if (note.trim().length < 10) {
      setNoteTouched(true);
      return;
    }
    await services.updateMonitoringAlert(alertId, { status: 'resolved', resolutionNote: note });
    toast.success('Alert resolved', 'The resolution note was recorded in the activity history.');
    setNote('');
    setNoteTouched(false);
  });

  const noteError =
    noteTouched && note.trim().length < 10 ? 'A resolution note of at least 10 characters is required.' : undefined;

  const alert = data?.alert;

  return (
    <Drawer
      open
      onClose={onClose}
      width="lg"
      eyebrow={alert ? ALERT_TYPE_LABEL[alert.type] : 'Monitoring alert'}
      title={alert?.title ?? alertId}
      subtitle={alert ? `${alert.id} · raised ${formatDateTime(alert.createdAt)}` : undefined}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingState label="Loading alert…" rows={4} />
      ) : !alert || !data ? null : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <AlertStatusBadge status={alert.status} />
            <Badge
              tone={alert.severity === 'high' ? 'danger' : alert.severity === 'medium' ? 'warning' : 'info'}
            >
              {alert.severity} severity
            </Badge>
            {alert.simulated ? <Badge tone="accent">Simulated demo alert</Badge> : null}
            {alert.dueDate ? <Badge tone="neutral">Due {formatDate(alert.dueDate)}</Badge> : null}
          </div>

          <section>
            <h3 className="text-[13px] font-semibold text-ink">What changed</h3>
            <p className="mt-1 text-[13px] leading-6 text-muted">{alert.whatChanged}</p>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-ink">Source reference</h3>
            <p className="mt-1 text-[13px] leading-6 text-muted">{alert.sourceReference}</p>
            <p className="mt-1 text-xs text-subtle">
              This workspace is not connected to any live regulatory or supplier feed. Sources are synthetic.
            </p>
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-ink">Why these formulas matched</h3>
            <p className="mt-1 text-[13px] leading-6 text-muted">{alert.matchReason}</p>
            {data.material ? (
              <Link to={`/materials/${data.material.id}`} className="fi-link mt-1 inline-block text-[13px]">
                {data.material.id} · {data.material.name}
              </Link>
            ) : null}
          </section>

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink">
              Affected formulas ({data.affectedFormulas.length})
            </h3>
            {data.affectedFormulas.length === 0 ? (
              <p className="text-[13px] text-muted">No active formulas are affected.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {data.affectedFormulas.map((formula) => (
                  <li key={formula.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                    <div className="min-w-0">
                      <Link to={`/formulas/${formula.id}`} className="fi-link text-[13px] font-medium">
                        {formula.name}
                      </Link>
                      <p className="text-xs text-muted tabular">
                        {formula.id} · {formula.version}
                      </p>
                    </div>
                    <ScreeningBadge status={formula.screeningStatus} current={formula.screeningCurrent} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-[13px] font-semibold text-ink">Suggested review action</h3>
            <p className="mt-1 text-[13px] leading-6 text-muted">{alert.suggestedAction}</p>
          </section>

          {alert.resolutionNote ? (
            <Notice tone="success" title="Resolution note">
              {alert.resolutionNote}
            </Notice>
          ) : null}

          <section className="space-y-3 border-t border-line pt-4">
            <h3 className="text-[13px] font-semibold text-ink">Actions</h3>

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void acknowledge.run()}
                loading={acknowledge.pending}
                disabled={alert.status !== 'open'}
                icon={<CheckCheck aria-hidden className="size-4" />}
              >
                Acknowledge
              </Button>
              <Button
                onClick={() => void createTask.run()}
                loading={createTask.pending}
                disabled={alert.status === 'resolved' || data.affectedFormulas.length === 0}
                icon={<CalendarClock aria-hidden className="size-4" />}
              >
                Create reassessment task
              </Button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
              <Field label="Assign reviewer" htmlFor="alert-assignee" className="min-w-56 flex-1">
                <Select
                  id="alert-assignee"
                  value={assignee || (alert.assignedToId ?? '')}
                  placeholder="Unassigned"
                  options={people.map((person) => ({
                    value: person.id,
                    label: `${person.name} · ${person.role}`,
                  }))}
                  onChange={(event) => setAssignee(event.target.value)}
                />
              </Field>
              <Button
                onClick={() => void assign.run()}
                loading={assign.pending}
                disabled={!assignee || assignee === alert.assignedToId}
                icon={<UserPlus aria-hidden className="size-4" />}
              >
                Assign
              </Button>
            </div>

            <Field
              label="Resolution note"
              htmlFor="alert-note"
              required
              error={noteError}
              hint="Required before an alert can be resolved."
            >
              <TextArea
                id="alert-note"
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onBlur={() => setNoteTouched(true)}
                invalid={Boolean(noteError)}
                placeholder="Describe what was checked and why this alert can be closed…"
                disabled={alert.status === 'resolved'}
              />
            </Field>
            <Button
              variant="primary"
              onClick={() => void resolve.run()}
              loading={resolve.pending}
              disabled={alert.status === 'resolved'}
            >
              Resolve with note
            </Button>
          </section>
        </div>
      )}
    </Drawer>
  );
}
