import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileJson, Printer } from 'lucide-react';
import { useAsyncData } from '../hooks/useAsyncData';
import { useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { ErrorState, LoadingState } from '../components/ui/States';
import { Notice } from '../components/ui/DemoNotice';
import { FindingsList } from '../components/screening/FindingsList';
import { AssessmentResultsView } from '../components/screening/AssessmentResultsView';
import { ExposureReadiness } from '../components/screening/ExposureReadiness';
import { HistoricalComparisons } from '../components/screening/HistoricalComparisons';
import { NextActions } from '../components/screening/NextActions';
import { ReviewDecisionPanel } from '../components/screening/ReviewDecisionPanel';
import { RunScreeningDialog } from '../components/screening/RunScreeningDialog';
import { useToast } from '../components/ui/Toast';
import { downloadCsv, downloadJson, timestampedFilename } from '../utils/export';
import { SEVERITY_LABEL } from '../utils/formatting';

export function ScreeningResultsPage() {
  const { formulaId = '', runId = '' } = useParams();
  const services = useServices();
  const toast = useToast();
  const [retrying, setRetrying] = useState(false);
  const [runOpen, setRunOpen] = useState(false);

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
      { header: 'Assessment', value: () => (run.assessmentMode === 'scenario' ? 'Scenario assessment' : 'Evidence assessment') },
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
        run.assessmentMode === 'scenario'
          ? 'Scenario assessment. Results use illustrative thresholds and evidence; they are not AP/CL predictions.'
          : 'Internal assessment against configured checks. Not a certification, AP/CL decision, or acceptance probability.',
      assessmentBadge: run.assessmentMode === 'scenario' ? 'Scenario assessment' : 'Evidence assessment',
      assessmentMode: run.assessmentMode ?? run.formulaAssessment?.assessment_mode,
      provenance: run.formulaAssessment?.execution,
      run,
      formula: {
        id: formula.id,
        name: formula.name,
        version: formula.version,
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

      {run.legacySample ? (
        <Notice tone="warning" title="Legacy sample result">
          This stored result was produced by the previous demo rule engine. It is not an Azure assessment.
          Run Assessment again to generate a live, document-grounded result.
        </Notice>
      ) : null}

      {run.aiStatus === 'failed' ? (
        <Notice tone="danger" title="AI analysis unavailable">
          {run.formulaAssessment?.execution?.error_message || 'Azure generation did not succeed. Calculated checks are shown as a partial result.'}
        </Notice>
      ) : null}

      {run.formulaAssessment ? (
        <AssessmentResultsView
          run={run}
          formula={formula}
          isCurrent={isCurrent}
          decisions={decisions}
          retrying={retrying}
          onRerun={() => setRunOpen(true)}
          onRetry={() => {
            setRetrying(true);
            services
              .retryExplanation(run.id)
              .then(() => reload())
              .catch((cause: unknown) => {
                toast.error('Explanation was not retried', cause instanceof Error ? cause.message : 'Try again.');
              })
              .finally(() => setRetrying(false));
          }}
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="space-y-4 xl:col-span-2">
            <Card>
              <CardHeader title="Findings" description={`${run.findings.length} items from the configured checks.`} />
              <CardBody>
                <FindingsList findings={run.findings} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Exposure assessment readiness" />
              <CardBody>
                <ExposureReadiness inputs={run.exposureInputs} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Historical comparisons" />
              <CardBody>
                <HistoricalComparisons comparisons={run.comparisons} currentFormulaId={formula.id} />
              </CardBody>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Next actions" />
              <CardBody>
                <NextActions actions={run.nextActions} />
              </CardBody>
            </Card>
            <Card className="fi-no-print">
              <CardHeader title="Reviewer actions" />
              <CardBody>
                <ReviewDecisionPanel formulaId={formula.id} runId={run.id} isCurrent={isCurrent} decisions={decisions} />
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      <Notice tone="neutral" title="What this result is">
        This is an internal assessment against the configured checks for the selected markets. Illustrative
        evidence is not validated. It is not a certification and does not guarantee acceptance.
      </Notice>

      <RunScreeningDialog
        open={runOpen}
        formula={formula}
        onClose={() => setRunOpen(false)}
        onComplete={(next) => {
          setRunOpen(false);
          window.location.assign(`/formulas/${formula.id}/results/${next.id}`);
        }}
      />
    </div>
  );
}
