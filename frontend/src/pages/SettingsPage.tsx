import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, RotateCcw, Rows3, UserRound } from 'lucide-react';
import type { TableDensity } from '../types/domain';
import { useAsyncAction } from '../hooks/useAsyncData';
import { useDataVersion, useDemoState, useServices, useSettings } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Field, RadioCard, Select } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/Modal';
import { Notice } from '../components/ui/DemoNotice';
import { useToast } from '../components/ui/Toast';
import { PERSISTENCE_DESCRIPTION, STORAGE_KEY, lastSavedAt } from '../state/persistence';
import { formatDateTime } from '../utils/formatting';

export function SettingsPage() {
  const services = useServices();
  const settings = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const dataset = useDemoState();
  const dataVersion = useDataVersion();
  const people = dataset.people;

  /* Selectors must return stable values, so the counts are derived here instead. */
  const counts = useMemo(
    () => [
      ['Formulas', dataset.formulas.length],
      ['Raw materials', dataset.rawMaterials.length],
      ['Documents', dataset.documents.length],
      ['Submissions', dataset.submissions.length],
      ['Alerts', dataset.alerts.length],
      ['Screening runs', dataset.runs.length],
      ['Activity events', dataset.activities.length],
    ],
    [dataset],
  ) as [string, number][];

  const savedAt = useMemo(() => lastSavedAt(), [dataVersion]);

  const [confirmReset, setConfirmReset] = useState(false);

  const update = useAsyncAction(async (patch: Parameters<typeof services.updateSettings>[0]) => {
    await services.updateSettings(patch);
    toast.success('Settings updated');
  });

  const reset = useAsyncAction(async () => {
    await services.resetDemoData();
    setConfirmReset(false);
    toast.success('Demo data reset', 'The original seed dataset was restored.');
    navigate('/');
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings & Demo Data"
        description="Preferences for this demo workspace and controls for the locally stored dataset. There is no sign-in and nothing here changes any real system."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Demo user"
            description="Sets which person is recorded as the actor on new activity entries."
            icon={<UserRound aria-hidden className="size-4" />}
          />
          <CardBody className="space-y-4">
            <Field label="Current demo user" htmlFor="current-user">
              <Select
                id="current-user"
                value={settings.currentUserId}
                options={people.map((person) => ({
                  value: person.id,
                  label: `${person.name} · ${person.role}`,
                }))}
                onChange={(event) => void update.run({ currentUserId: event.target.value })}
              />
            </Field>

            <Field
              label="Default reviewer"
              htmlFor="default-reviewer"
              hint="Pre-selected as the assigned reviewer when a new formula is created."
            >
              <Select
                id="default-reviewer"
                value={settings.defaultReviewerId}
                options={people.map((person) => ({
                  value: person.id,
                  label: `${person.name} · ${person.role}`,
                }))}
                onChange={(event) => void update.run({ defaultReviewerId: event.target.value })}
              />
            </Field>

            <Notice tone="neutral">
              Switching the demo user only changes the name recorded against new activity. It is not
              authentication and grants no permissions.
            </Notice>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Table density"
            description="Applies to every table in the workspace."
            icon={<Rows3 aria-hidden className="size-4" />}
          />
          <CardBody className="space-y-2.5">
            {(
              [
                ['comfortable', 'Comfortable', 'More vertical space in table rows. Best for reading.'],
                ['compact', 'Compact', 'Tighter rows so more records fit on screen.'],
              ] as [TableDensity, string, string][]
            ).map(([value, label, description]) => (
              <RadioCard
                key={value}
                name="table-density"
                checked={settings.tableDensity === value}
                onSelect={() => void update.run({ tableDensity: value })}
                label={label}
                description={description}
              />
            ))}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Demo data"
          description="Where your changes are stored, and how to start over."
          icon={<Database aria-hidden className="size-4" />}
        />
        <CardBody className="space-y-4">
          <p className="max-w-3xl text-[13px] leading-6 text-muted">{PERSISTENCE_DESCRIPTION}</p>

          <dl className="grid grid-cols-2 gap-4 rounded-lg border border-line bg-canvas/60 p-4 sm:grid-cols-4 lg:grid-cols-7">
            {counts.map(([label, value]) => (
              <div key={label}>
                <dt className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{label}</dt>
                <dd className="mt-0.5 text-lg leading-6 font-semibold text-navy-800 tabular">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="danger"
              onClick={() => setConfirmReset(true)}
              icon={<RotateCcw aria-hidden className="size-4" />}
            >
              Reset demo data
            </Button>
            <span className="text-xs text-muted">
              Storage key <code className="rounded bg-neutral-soft px-1 py-0.5 font-mono">{STORAGE_KEY}</code>
              {savedAt ? ` · last saved ${formatDateTime(savedAt)}` : ' · nothing saved yet'}
            </span>
          </div>
        </CardBody>
      </Card>

      <Notice tone="neutral" title="About this demo workspace">
        Formula Insight is a front-end demonstration by Affine Analytics. All formulas, raw materials,
        documents, findings, thresholds, references and historical outcomes are synthetic. Screening results
        are internal only and are not ACMI certifications, approvals, or safety assessments.
      </Notice>

      <ConfirmDialog
        open={confirmReset}
        title="Reset demo data?"
        body={
          <>
            Every change you have made — new formulas, drafts, screening runs, review decisions, alerts and
            activity — will be discarded and the original seed dataset restored. This cannot be undone.
          </>
        }
        confirmLabel="Reset demo data"
        pending={reset.pending}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void reset.run()}
      />
    </div>
  );
}
