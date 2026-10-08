import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileJson, Printer } from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import { useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader, DataPoint } from '../components/ui/Card';
import { Badge, ScreeningBadge } from '../components/ui/Badge';
import { ErrorState, LoadingState } from '../components/ui/States';
import { Notice } from '../components/ui/DemoNotice';
import { FindingsList } from '../components/screening/FindingsList';
import { ExposureReadiness } from '../components/screening/ExposureReadiness';
import { HistoricalComparisons } from '../components/screening/HistoricalComparisons';
import { NextActions } from '../components/screening/NextActions';
import { ReviewDecisionPanel } from '../components/screening/ReviewDecisionPanel';
import { useToast } from '../components/ui/Toast';
import { downloadCsv, downloadJson, timestampedFilename } from '../utils/export';
import { SCREENING_STATUS_HINT, SEVERITY_LABEL, formatDateTime } from '../utils/formatting';

const STATUS_TONE = {
  green: 'border-success-line bg-success-soft',
  amber: 'border-warning-line bg-warning-soft',
  red: 'border-danger-line bg-danger-soft',
} as const;

function metricText(value: number | null) {
  return value == null ? '—' : `${value}%`;
}

export function ScreeningResultsPage() {
  const { formulaId = '', runId = '' } = useParams();
  const services = useServices();
  const toast = useToast();

  const { data, loading, error, reload } = useAsyncData(
    () => services.getScreeningResult(runId),
    [runId],
  );

  if (error) {
    return (
      <Card>
        <ErrorState title="This screening result could not be opened" message={error} onRetry={reload} />
      </Card>
    );
  }

  if (loading && !data) {
    return (
      <Card>
        <LoadingState label="Loading screening result…" rows={6} />
      </Card>
    );
  }

  if (!data) return null;

  const { run, formula, isCurrent, decisions } = data;

  const exportFindings = () => {
    downloadCsv(timestampedFilename(`${run.id}-findings`, 'csv'), run.findings, [
      { header: 'Severity', value: (row) => SEVERITY_LABEL[row.severity] },
      { header: 'Rule', value: (row) => row.ruleId },
      { header: 'Scope', value: (row) => row.scope },
      { header: 'Reference', value: (row) => row.reference },
      { header: 'Concern', value: (row) => row.concern },
      { header: 'Explanation', value: (row) => row.explanation },
      { header: 'Evidence reference', value: (row) => row.evidenceReference },
      { header: 'Recommended action', value: (row) => row.recommendedAction },
      { header: 'Review status', value: (row) => row.reviewState },
    ]);
    toast.success('Findings exported', `${run.findings.length} rows written to CSV.`);
  };

  const exportJson = () => {
    downloadJson(timestampedFilename(`${run.id}-result`, 'json'), {
      disclaimer:
        'Internal assessment from Affine Formula Intelligence. Illustrative evidence is not validated. This is not a certification or an external acceptance.',
      assessmentRequest: run.assessmentRequest,
      marketResults: run.marketResults,
      run,
      formula: {
        id: formula.id,
        name: formula.name,
        version: formula.version,
        category: formula.category,
        ageGroup: formula.ageGroup,
        recordedAgeGroup: formula.recordedAgeGroup,
        targetMarkets: formula.targetMarkets,
        physicalForm: formula.physicalForm,
        ingredients: formula.ingredients,
      },
      resultIsCurrent: isCurrent,
      decisions,
    });
    toast.success('Result exported', `${run.id} written to JSON.`);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Assessment Results"
        description={
          <>
            Assessment results for{' '}
            <Link to={`/formulas/${formula.id}`} className="fi-link font-medium">
              {formula.name}
            </Link>{' '}
            {run.formulaVersion}.
          </>
        }
        actions={
          <div className="fi-no-print flex flex-wrap gap-2">
            <Button onClick={exportFindings} icon={<Download aria-hidden className="size-4" />}>
              Findings CSV
            </Button>
            <Button onClick={exportJson} icon={<FileJson aria-hidden className="size-4" />}>
              Result JSON
            </Button>
            <Button onClick={() => window.print()} icon={<Printer aria-hidden className="size-4" />}>
              Print summary
            </Button>
          </div>
        }
      />

      <Link
        to={`/formulas/${formulaId}/screening`}
        className="fi-no-print fi-link inline-flex items-center gap-1.5 text-[13px] font-medium"
      >
        <ArrowLeft aria-hidden className="size-3.5" />
        Back to the formula&rsquo;s screening history
      </Link>

      <Card className={`border ${STATUS_TONE[run.status]}`}>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <ScreeningBadge status={run.status} current={isCurrent} />
                <Badge tone="neutral">{run.id}</Badge>
              </div>
              <p className="mt-2.5 max-w-3xl text-sm leading-6 text-ink">{run.summary}</p>
              <p className="mt-1.5 text-[13px] text-muted">{SCREENING_STATUS_HINT[run.status]}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-4 border-t border-line/60 pt-4 sm:grid-cols-4">
            <DataPoint
              label="Evidence completeness"
              value={`${run.evidenceCompleteness}%`}
              hint={`${run.presentEvidenceCount} of ${run.requiredEvidenceCount} required documents`}
            />
            <DataPoint
              label="Target markets"
              value={(run.targetMarkets ?? []).join(', ') || '—'}
            />
            <DataPoint label="Age group" value={run.ageGroup === '12_and_above' ? '12 years and above' : run.ageGroup === 'under_12' ? 'Under 12 years' : '—'} />
            <DataPoint label="Run timestamp" value={formatDateTime(run.runAt)} />
            <DataPoint label="Formula version" value={run.formulaVersion} />
            <DataPoint
              label="Result currency"
              value={isCurrent ? 'Current' : 'Outdated'}
              hint={isCurrent ? 'Matches the saved composition' : 'The formula changed after this run'}
            />
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {(run.marketResults ?? []).map((result) => (
          <div key={result.market} className="rounded-lg border border-line bg-surface px-4 py-3">
            <p className="text-sm font-semibold text-ink">{result.market}</p>
            <p className="mt-1 text-sm text-muted">
              {result.status === 'not-assessed'
                ? result.message
                : result.status === 'green'
                  ? 'Meets the configured checks for this market'
                  : result.status === 'red'
                    ? 'Does not meet the configured checks for this market'
                    : 'Additional information is required for this market'}
            </p>
          </div>
        ))}
      </div>

      <Notice tone="neutral" title="What this result is">
        This is an internal assessment against the configured checks for the selected markets. Illustrative
        evidence is not validated. It is not a certification and does not guarantee acceptance.
      </Notice>

      {run.referenceAssessment ? (
        <Card>
          <CardHeader
            title="Reference assessment"
            description={`Catalog ${run.referenceAssessment.reference_data_version}. Coverage and pass rate describe the calculated checks. They are not an acceptance probability.`}
          />
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <DataPoint
                label="Concentration coverage"
                value={metricText(run.referenceAssessment.metrics.concentration.coverage)}
                hint={`${run.referenceAssessment.metrics.concentration.passed} passed, ${run.referenceAssessment.metrics.concentration.failed} failed, ${run.referenceAssessment.metrics.concentration.not_assessed} not assessed`}
              />
              <DataPoint
                label="Concentration pass rate"
                value={metricText(run.referenceAssessment.metrics.concentration.pass_rate)}
              />
              <DataPoint
                label="Evidence coverage"
                value={metricText(run.referenceAssessment.metrics.evidence.coverage)}
                hint={`${run.referenceAssessment.metrics.evidence.not_assessed} not assessed`}
              />
              <DataPoint
                label="Explanation"
                value={run.referenceAssessment.explanation_source === 'azure' ? 'Azure OpenAI' : 'Standard'}
                hint={
                  run.referenceAssessment.explanation_source === 'standard'
                    ? 'The AI explanation is unavailable. Calculated checks were kept.'
                    : 'Explanation only. It does not change the checks.'
                }
              />
            </dl>
            <p className="text-sm leading-6 text-ink">{run.referenceAssessment.explanation.summary}</p>
            {run.referenceAssessment.explanation.alerts.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-[13px] leading-6 text-muted">
                {run.referenceAssessment.explanation.alerts.map((alert) => (
                  <li key={alert}>{alert}</li>
                ))}
              </ul>
            ) : null}
            {run.referenceAssessment.missing_documents.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Missing documents</p>
                <ul className="mt-2 space-y-2">
                  {run.referenceAssessment.missing_documents.map((item) => (
                    <li key={`${item.requirement_id}-${item.market}`} className="text-[13px] leading-6 text-muted">
                      <span className="font-medium text-ink">{item.ingredient_name}</span> · {item.document_type} ·{' '}
                      {item.status === 'pending_review' ? 'Pending review' : 'Not on file'}
                      {item.linked_document_ids.length ? ` · ${item.linked_document_ids.join(', ')}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {run.referenceAssessment.configuration_gaps.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">No configured criterion</p>
                <ul className="mt-2 list-disc pl-5 text-[13px] leading-6 text-muted">
                  {run.referenceAssessment.configuration_gaps.map((gap) => (
                    <li key={`${gap.market}-${gap.ingredient_id}`}>
                      {gap.ingredient_name} · {gap.market}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {run.referenceAssessment.historical_cases.length > 0 ? (
              <div>
                <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Historical reference cases</p>
                <ul className="mt-2 space-y-2">
                  {run.referenceAssessment.historical_cases.map((item) => (
                    <li key={item.case_id} className="text-[13px] leading-6 text-muted">
                      <span className="font-medium text-ink">{item.name}</span> · {item.case_id} · {item.internal_outcome}.{' '}
                      {item.reviewer_note}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Card>
            <CardHeader
              title="Findings"
              description={`${run.findings.length} item${run.findings.length === 1 ? '' : 's'} from the configured checks.`}
            />
            <CardBody>
              <FindingsList findings={run.findings} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Exposure assessment readiness"
              description="Which inputs an assessment would need, and whether this workspace has them."
            />
            <CardBody>
              <ExposureReadiness inputs={run.exposureInputs} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Historical comparisons"
              description="Synthetic submissions that share raw materials with this composition."
            />
            <CardBody>
              <HistoricalComparisons comparisons={run.comparisons} currentFormulaId={formula.id} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Next actions" description="Derived from the findings in this run." />
            <CardBody>
              <NextActions actions={run.nextActions} />
            </CardBody>
          </Card>

          <Card className="fi-no-print">
            <CardHeader
              title="Reviewer actions"
              description="Record an internal review decision for this run."
            />
            <CardBody>
              <ReviewDecisionPanel
                formulaId={formula.id}
                runId={run.id}
                isCurrent={isCurrent}
                decisions={decisions}
              />
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
