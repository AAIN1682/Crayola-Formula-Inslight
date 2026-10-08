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
import { formatDateTime, formatRelative } from '../../utils/formatting';

export function ScreeningTab() {
  const detail = useFormulaDetail();
  const [runOpen, setRunOpen] = useState(false);
  const { formula, runs, latestRun } = detail;

  const previousRuns = runs.filter((run) => run.id !== latestRun?.id);

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
              <Badge tone={latestRun.evidenceCompleteness === 100 ? 'success' : 'warning'}>
                Evidence {latestRun.evidenceCompleteness}%
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

            {!formula.screeningCurrent ? (
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

      <RunScreeningDialog open={runOpen} formula={formula} onClose={() => setRunOpen(false)} />
    </div>
  );
}
