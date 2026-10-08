import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { useFormulaDetail } from '../FormulaDetailsPage';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge, ScreeningBadge, SeverityBadge } from '../../components/ui/Badge';
import { TBody, Table, TableScroll, Td, Th, THead, Tr } from '../../components/ui/Table';
import { EmptyState } from '../../components/ui/States';
import { Notice } from '../../components/ui/DemoNotice';
import { RunScreeningDialog } from '../../components/screening/RunScreeningDialog';
import { postComparison, usesPackageCatalog } from '../../api/formulaBackend';
import { Field, Select } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { formatDateTime, formatRelative } from '../../utils/formatting';

export function ScreeningTab() {
  const detail = useFormulaDetail();
  const toast = useToast();
  const [runOpen, setRunOpen] = useState(false);
  const [previousId, setPreviousId] = useState('');
  const [currentId, setCurrentId] = useState('');
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<Awaited<ReturnType<typeof postComparison>> | null>(null);
  const { formula, runs, latestRun } = detail;

  const comparable = runs.filter((run) => run.formulaAssessment);
  const previousRuns = runs.filter((run) => run.id !== latestRun?.id);

  const compareVersions = () => {
    const previous = comparable.find((run) => run.id === previousId)?.formulaAssessment?.input_snapshot;
    const current = comparable.find((run) => run.id === currentId)?.formulaAssessment?.input_snapshot;
    if (!previous || !current) {
      toast.error('Choose two assessed versions', 'Each version needs a completed assessment.');
      return;
    }
    setComparing(true);
    postComparison({ ...previous, generate_explanation: false }, { ...current, generate_explanation: false })
      .then((result) => setComparison(result))
      .catch((cause: unknown) => {
        toast.error('Comparison was not completed', cause instanceof Error ? cause.message : 'Try again.');
      })
      .finally(() => setComparing(false));
  };

  return (
    <div className="space-y-4">
      {latestRun ? (
        <Card>
          <CardHeader
            title="Latest screening result"
            description={`Run on ${formatDateTime(latestRun.runAt)} against ${latestRun.formulaVersion}`}
            actions={
              <Link
                to={`/formulas/${formula.id}/results/${latestRun.id}`}
                className="fi-link inline-flex items-center gap-1 text-[13px] font-medium"
              >
                Open full result
                <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            }
          />
          <CardBody className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <ScreeningBadge status={latestRun.status} current={formula.screeningCurrent} />
              <Badge tone={latestRun.legacySample || latestRun.evidenceCompleteness !== 100 ? 'warning' : 'success'}>
                {latestRun.legacySample ? 'Legacy sample' : `Verified evidence ${latestRun.evidenceCompleteness}%`}
              </Badge>
              <Badge tone="neutral">
                {latestRun.findings.length} finding{latestRun.findings.length === 1 ? '' : 's'}
              </Badge>
              <Badge tone="neutral">
                {latestRun.nextActions.length} next action{latestRun.nextActions.length === 1 ? '' : 's'}
              </Badge>
            </div>

            <p className="text-[13px] leading-6 text-ink">{latestRun.summary}</p>

            {latestRun.findings.length > 0 ? (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {latestRun.findings.slice(0, 4).map((finding) => (
                  <li key={finding.id} className="flex flex-wrap items-start gap-3 px-3.5 py-2.5">
                    <SeverityBadge severity={finding.severity} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-ink">{finding.concern}</p>
                      <p className="text-xs text-muted">{finding.reference}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}

            {latestRun.legacySample ? (
              <Notice tone="warning" title="Legacy sample result">
                This stored result is not an Azure assessment. Run Assessment to generate a live result from the
                backend documents.
              </Notice>
            ) : !formula.screeningCurrent ? (
              <Notice tone="warning" title="This result is outdated">
                Reassessment required. Run the assessment again for a current result.
              </Notice>
            ) : null}
          </CardBody>
        </Card>
      ) : (
        <Card>
          <EmptyState
            variant="shield"
            title="This formula has not been screened yet"
            message="Run an assessment to record the configured checks for the selected markets and age group."
            action={
              <Button variant="primary" onClick={() => setRunOpen(true)} icon={<PlayCircle aria-hidden className="size-4" />}>
                Run Assessment
              </Button>
            }
          />
        </Card>
      )}

      <Card>
        <CardHeader
          title="Previous simulated runs"
          description="Earlier results recorded in this workspace. Superseded runs are marked outdated."
        />
        {previousRuns.length === 0 ? (
          <EmptyState title="No earlier runs" message="Only the latest run is recorded for this formula." />
        ) : (
          <TableScroll>
            <Table caption="Previous screening runs">
              <THead>
                <tr>
                  <Th>Run</Th>
                  <Th>Version</Th>
                  <Th>Result</Th>
                  <Th>Evidence</Th>
                  <Th>Findings</Th>
                  <Th>Run at</Th>
                  <Th className="text-right">Open</Th>
                </tr>
              </THead>
              <TBody>
                {previousRuns.map((run) => (
                  <Tr key={run.id}>
                    <Td className="tabular">{run.id}</Td>
                    <Td className="tabular">{run.formulaVersion}</Td>
                    <Td>
                      <ScreeningBadge status={run.status} current={!run.outdated} />
                    </Td>
                    <Td className="tabular">{run.evidenceCompleteness}%</Td>
                    <Td className="tabular">{run.findings.length}</Td>
                    <Td className="whitespace-nowrap text-muted tabular" title={formatDateTime(run.runAt)}>
                      {formatRelative(run.runAt)}
                    </Td>
                    <Td className="text-right">
                      <Link
                        to={`/formulas/${formula.id}/results/${run.id}`}
                        className="fi-link text-[13px] font-medium"
                      >
                        Open
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        )}
      </Card>

      {usesPackageCatalog(formula) && comparable.length >= 2 ? (
        <Card>
          <CardHeader
            title="Compare assessed versions"
            description="Each version is assessed on its own snapshot. The comparison does not predict acceptance."
          />
          <CardBody className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Previous version">
                <Select
                  value={previousId}
                  onChange={(event) => setPreviousId(event.target.value)}
                  options={comparable.map((run) => ({ value: run.id, label: `${run.formulaVersion} · ${formatDateTime(run.runAt)}` }))}
                  placeholder="Select a version"
                />
              </Field>
              <Field label="Current version">
                <Select
                  value={currentId}
                  onChange={(event) => setCurrentId(event.target.value)}
                  options={comparable.map((run) => ({ value: run.id, label: `${run.formulaVersion} · ${formatDateTime(run.runAt)}` }))}
                  placeholder="Select a version"
                />
              </Field>
            </div>
            <Button onClick={compareVersions} loading={comparing} disabled={!previousId || !currentId || previousId === currentId}>
              Compare versions
            </Button>
            {comparison ? (
              <div className="space-y-2 text-[13px] leading-6 text-muted">
                <p className="text-ink">{comparison.explanation.content.summary}</p>
                {comparison.changes.added_ingredients.map((item) => (
                  <p key={`add-${item.material_id}`}>Added: {item.material_id}</p>
                ))}
                {comparison.changes.removed_ingredients.map((item) => (
                  <p key={`remove-${item.material_id}`}>Removed: {item.material_id}</p>
                ))}
                {comparison.changes.concentration_changes.map((item) => (
                  <p key={`qty-${item.material_id}`}>
                    {item.material_id}: {item.previous_percent}% to {item.current_percent}% ({item.delta_percentage_points} percentage points)
                  </p>
                ))}
                {comparison.changes.context_changes.map((item) => (
                  <p key={item.field}>
                    {item.field}: {JSON.stringify(item.previous)} to {JSON.stringify(item.current)}
                  </p>
                ))}
                {comparison.changes.finding_changes.map((item) => (
                  <p key={item.check_id}>
                    {item.check_id}: {item.previous_status ?? 'none'} to {item.current_status ?? 'none'}
                  </p>
                ))}
                {comparison.changes.evidence_changes.map((item) => (
                  <p key={`ev-${item.check_id}`}>
                    Evidence {item.check_id}: {item.previous_status ?? 'none'} to {item.current_status ?? 'none'}
                  </p>
                ))}
                {comparison.explanation.status === 'unavailable' ? (
                  <Notice tone="warning" title="AI explanation unavailable">
                    The calculated comparison is still shown.
                  </Notice>
                ) : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <RunScreeningDialog open={runOpen} formula={formula} onClose={() => setRunOpen(false)} />
    </div>
  );
}
