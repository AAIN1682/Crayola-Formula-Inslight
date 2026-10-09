import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GitCompare, PlayCircle } from 'lucide-react';
import type { Formula, ScreeningRun, SourceReviewDraft } from '../../types/domain';
import type { PackageAssessment, PackageCheck } from '../../api/formulaBackend';
import { isLiveAzureAssessment, screeningStatusCopy } from '../../api/formulaBackend';
import { Badge, ScreeningBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody, CardHeader, DataPoint } from '../ui/Card';
import { Notice } from '../ui/DemoNotice';
import { Drawer } from '../ui/Drawer';
import { Field, TextArea, TextInput } from '../ui/Field';
import { useServices } from '../../state/DemoDataProvider';
import { useToast } from '../ui/Toast';
import { uid } from '../../utils/ids';
import { formatDateTime } from '../../utils/formatting';
import { ReviewDecisionPanel } from './ReviewDecisionPanel';
import { ExposureReadiness } from './ExposureReadiness';
import { HistoricalComparisons } from './HistoricalComparisons';

function supportLabel(level?: string) {
  if (level === 'substantial') return 'Substantial';
  if (level === 'partial') return 'Partial';
  return 'Insufficient';
}

function statusLabel(status: string, documentType?: string) {
  if (status === 'fail') return 'Fail';
  if (status === 'pass') return 'Pass';
  if (status === 'missing') return 'Missing evidence';
  if (status === 'needs_review') return 'Awaiting review';
  if (status === 'mismatched') return documentType === 'coa' ? 'Batch mismatch' : 'Mismatched';
  if (status === 'satisfied' || status === 'available') return 'Pass';
  if (status === 'not_assessed') return 'Not assessed';
  if (status === 'needs_test_data') return 'Needs test data';
  if (status === 'applicability_unknown') return 'Applicability unknown';
  if (status === 'source_review_required') return 'Source review required';
  if (status === 'no_matching_rule') return 'No matching rule';
  if (status === 'not_applicable') return 'Not applicable';
  return 'Not assessed';
}

export function AssessmentResultsView({
  run,
  formula,
  isCurrent,
  decisions,
  retrying,
  onRetry,
  onRerun,
}: {
  run: ScreeningRun;
  formula: Formula;
  isCurrent: boolean;
  decisions: { id: string; formulaId: string; runId: string; decision: 'request-evidence' | 'review-complete' | 'return-for-changes'; note: string; decidedById: string; decidedAt: string }[];
  retrying: boolean;
  onRetry: () => void;
  onRerun: () => void;
}) {
  const assessment = run.formulaAssessment;
  const navigate = useNavigate();
  const [tab, setTab] = useState<'findings' | 'recommendations' | 'sources'>('findings');
  const [region, setRegion] = useState<string>('all');
  const [openCheck, setOpenCheck] = useState<string | null>(null);
  const [scenarioCheck, setScenarioCheck] = useState<PackageCheck | null>(null);
  const [reviewDoc, setReviewDoc] = useState<string | null>(null);
  const [sourceId, setSourceId] = useState<string | null>(null);

  const live = isLiveAzureAssessment(assessment);
  const mode = run.assessmentMode ?? assessment?.assessment_mode ?? 'evidence';
  const metrics = assessment?.metrics;
  const support = assessment?.assessment_support ?? metrics?.assessment_support;
  const content = assessment?.explanation.content;
  const checks = useMemo(() => {
    const calculated = assessment?.llm_context.calculated_checks ?? assessment?.llm_context.checks ?? [];
    const evidence = (assessment?.llm_context.evidence_checks ?? []).filter((item) => item.status !== 'not_applicable');
    const rows = [...calculated, ...evidence];
    return region === 'all' ? rows : rows.filter((item) => item.region === region);
  }, [assessment, region]);
  const names = new Map((assessment?.llm_context.materials ?? []).map((item) => [item.material_id, item.name]));
  const priorities = (content?.prioritized_actions ?? content?.recommendations ?? run.nextActions.map((item) => ({
    action: item.label,
    rationale: item.detail,
    priority: 'medium',
    related_check_ids: [],
    can_create_scenario: false,
  }))).slice(0, 3);
  const summary = live ? content?.summary || run.summary : run.summary;
  const aiStatus = run.aiStatus === 'succeeded' ? 'Azure succeeded' : run.aiStatus === 'failed' ? 'AI analysis unavailable' : run.legacySample ? 'Legacy sample' : 'Not requested';
  const passRate = metrics?.check_pass_rate_percent;
  const passCopy = metrics?.evaluated_checks
    ? metrics.check_pass_rate_copy
    : 'No checks evaluated.';
  const evidenceCopy = metrics?.evidence_coverage_partial
    ? `Partial: ${metrics.evidence_satisfied ?? 0} of ${metrics.evidence_applicable_count ?? 0} applicable requirements satisfied.`
    : `${metrics?.evidence_satisfied ?? run.presentEvidenceCount} of ${metrics?.evidence_applicable_count ?? run.requiredEvidenceCount} applicable requirements satisfied.`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{formula.name} {run.formulaVersion}</Badge>
          <Badge tone={mode === 'scenario' ? 'warning' : 'info'}>{mode === 'scenario' ? 'Scenario assessment' : 'Evidence assessment'}</Badge>
          <span className="text-[13px] text-muted">{formatDateTime(run.runAt)}</span>
          {(run.targetMarkets ?? []).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setRegion((current) => (current === item ? 'all' : item))}
              className={`rounded-full border px-2.5 py-0.5 text-xs ${region === item ? 'border-brand-500 text-brand-500' : 'border-line text-muted'}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="fi-no-print flex flex-wrap gap-2">
          <Button onClick={onRerun} icon={<PlayCircle aria-hidden className="size-4" />}>
            Re-run Assessment
          </Button>
          <Button onClick={() => navigate(`/formulas/${formula.id}/screening`)} icon={<GitCompare aria-hidden className="size-4" />}>
            Compare Versions
          </Button>
        </div>
      </div>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ScreeningBadge status={run.status} current={isCurrent} />
            <p className="text-sm font-medium text-ink">{assessment?.screening_status_label || screeningStatusCopy(assessment?.screening_status || '', mode)}</p>
          </div>
          <p className="max-w-3xl text-sm leading-6 text-ink">{summary}</p>
          {priorities[0] ? (
            <p className="text-[13px] leading-6 text-muted">
              Next: {priorities[0].action}. {priorities[0].rationale}
            </p>
          ) : null}
          <p className="text-xs text-muted">AI execution: {aiStatus}. This is not a certification.</p>
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardBody>
            <DataPoint
              label={metrics?.check_pass_rate_label || (mode === 'scenario' ? 'Configured concentration-check pass rate' : 'Check pass rate')}
              value={passRate == null ? 'No checks evaluated' : `${passRate}%`}
              hint={passCopy ?? undefined}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <DataPoint
              label={metrics?.evidence_coverage_label || (mode === 'scenario' ? 'Scenario evidence completeness' : 'Verified evidence coverage')}
              value={metrics?.evidence_coverage_percent == null ? '—' : `${metrics.evidence_coverage_percent}%`}
              hint={evidenceCopy}
            />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <DataPoint
              label="Assessment support"
              value={supportLabel(support?.level)}
              hint={support?.basis}
            />
          </CardBody>
        </Card>
      </div>
      <p className="text-xs leading-5 text-muted">
        {mode === 'scenario'
          ? 'Results use illustrative thresholds and evidence; they are not AP/CL predictions.'
          : metrics?.rule_evaluation_coverage_copy}{' '}
        Passed {metrics?.passed_checks ?? 0}. Failed {metrics?.failed_checks ?? 0}. Needs test data {metrics?.needs_test_data_checks ?? 0}. Applicability or source review {(metrics?.applicability_unknown_checks ?? 0) + (metrics?.source_review_required_checks ?? 0)}. Missing evidence {metrics?.evidence_missing ?? 0}. Awaiting review {metrics?.evidence_needs_review ?? 0}. Mismatched {metrics?.evidence_mismatched ?? 0}.
        {metrics?.concentration_passed_checks != null && mode === 'scenario'
          ? ` Concentration checks: ${metrics.concentration_passed_checks} pass, ${metrics.concentration_failed_checks ?? 0} fail.`
          : ''}
      </p>

      <div className="grid gap-3 lg:grid-cols-3">
        {priorities.map((item, index) => (
          <Card key={`${item.action}-${index}`}>
            <CardBody className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{item.priority || 'medium'}</p>
              <p className="text-sm font-medium text-ink">{item.action}</p>
              <p className="text-[13px] leading-6 text-muted">{item.rationale}</p>
              <Button
                onClick={() => {
                  const related = item.related_check_ids?.[0];
                  if (related) {
                    setTab('findings');
                    setOpenCheck(related);
                  } else {
                    setTab('recommendations');
                  }
                }}
              >
                Open detail
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      <div className="flex gap-1 border-b border-line">
        {(['findings', 'recommendations', 'sources'] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={`-mb-px border-b-2 px-3.5 py-2.5 text-[13px] font-medium capitalize ${tab === item ? 'border-brand-500 text-brand-500' : 'border-transparent text-muted'}`}
          >
            {item === 'sources' ? 'Sources & Evidence' : item}
          </button>
        ))}
      </div>

      {tab === 'findings' ? (
        <Card>
          <CardHeader title="Findings" description="Failed checks are separate from gaps that could not be assessed." />
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="text-xs uppercase tracking-wide text-subtle">
                <tr>
                  <th className="pb-2 font-medium">Ingredient / check</th>
                  <th className="pb-2 font-medium">Entered</th>
                  <th className="pb-2 font-medium">Limit or gap</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Priority</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {checks.map((item) => (
                  <tr key={item.check_id} className={item.status === 'fail' ? 'bg-danger-soft/30' : item.status === 'not_assessed' ? 'bg-warning-soft/20' : undefined}>
                    <td className="py-2.5 pr-3">{names.get(item.material_id ?? '') ?? item.material_id ?? item.requirement_id ?? item.check_id} · {item.region}</td>
                    <td className="py-2.5 pr-3">{item.actual == null ? '—' : `${item.actual}%`}</td>
                    <td className="py-2.5 pr-3">{item.threshold == null ? item.message : `${item.threshold}${item.unit ? ` ${item.unit}` : ''}`}</td>
                    <td className="py-2.5 pr-3">{statusLabel(item.status, item.document_type)}</td>
                    <td className="py-2.5 pr-3">{item.priority || (item.status === 'fail' ? 'high' : 'medium')}</td>
                    <td className="py-2.5">
                      <Button onClick={() => setOpenCheck(item.check_id)}>View details</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ) : null}

      {tab === 'recommendations' ? (
        <div className="space-y-3">
          {(content?.prioritized_actions ?? content?.recommendations ?? []).map((item, index) => {
            const related = (assessment?.llm_context.calculated_checks ?? []).find((check) => item.related_check_ids?.includes(check.check_id) && check.threshold != null && check.status === 'fail');
            return (
              <Card key={`${item.action}-${index}`}>
                <CardBody className="space-y-2">
                  <p className="text-sm font-medium text-ink">{item.action}</p>
                  <p className="text-[13px] leading-6 text-muted">{item.rationale}</p>
                  <p className="text-xs text-muted">
                    {item.requires_testing_or_review ? 'Requires testing or review. ' : ''}
                    {item.source_ids?.length ? `Sources: ${item.source_ids.join(', ')}` : 'No fabricated source citation.'}
                  </p>
                  {related ? (
                    <Button onClick={() => setScenarioCheck(related)}>Create scenario</Button>
                  ) : null}
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : null}

      {tab === 'sources' ? (
        <Card>
          <CardHeader title="Sources & Evidence" description="Present—awaiting review is distinct from missing." />
          <CardBody className="space-y-3">
            {(assessment?.llm_context.evidence_checks ?? []).map((item) => (
              <div key={item.check_id} className="rounded-lg border border-line px-3.5 py-2.5 text-[13px] leading-6">
                <p className="font-medium text-ink">
                  {item.requirement_id} · {item.document_type} · {statusLabel(item.status, item.document_type)}
                </p>
                <p className="text-muted">
                  {item.material_id
                    ? `${names.get(item.material_id) ?? item.material_id}${formula.ingredients.find((row) => row.rawMaterialId === item.material_id)?.batchId ? ` / batch ${formula.ingredients.find((row) => row.rawMaterialId === item.material_id)?.batchId}` : ''}`
                    : `${formula.name} ${formula.version}`}
                  {item.region ? ` · ${item.region}` : ''}
                </p>
                <p className="text-muted">{item.message}</p>
                <p className="text-muted">{item.status === 'needs_review' ? 'Review existing document.' : item.action}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(item.document_ids ?? []).map((documentId) => (
                    <Button key={documentId} onClick={() => setSourceId(documentId)}>
                      View source
                    </Button>
                  ))}
                  {(item.document_ids ?? []).map((documentId) => (
                    <Button key={`rev-${documentId}`} onClick={() => setReviewDoc(documentId)}>
                      Record review draft
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <details className="rounded-card border border-line bg-surface px-5 py-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">Analysis details, limitations, and execution metadata</summary>
        <div className="mt-3 space-y-2 text-[13px] leading-6 text-muted">
          <p>{content?.assessment_support_explanation || support?.basis}</p>
          {(content?.limitations ?? []).map((item) => (
            <p key={item}>{item}</p>
          ))}
          {assessment ? (
            <p>
              Dataset {assessment.data_version} · provider {assessment.execution?.llm_provider} · {assessment.execution?.deployment} · response {assessment.execution?.response_id || '—'} · tokens {assessment.execution?.usage?.total_tokens ?? '—'} · {assessment.execution?.latency_ms ?? '—'} ms
            </p>
          ) : null}
          {assessment && (run.aiStatus === 'failed' || assessment.explanation.status === 'failed') ? (
            <Button onClick={onRetry} loading={retrying}>
              Retry AI Analysis
            </Button>
          ) : null}
        </div>
      </details>

      <details className="rounded-card border border-line bg-surface px-5 py-4">
        <summary className="cursor-pointer text-sm font-medium text-ink">Reviewer actions, exposure readiness, and historical comparisons</summary>
        <div className="mt-4 space-y-4">
          <ReviewDecisionPanel formulaId={formula.id} runId={run.id} isCurrent={isCurrent} decisions={decisions} />
          <ExposureReadiness inputs={run.exposureInputs} />
          <HistoricalComparisons comparisons={run.comparisons} currentFormulaId={formula.id} />
        </div>
      </details>

      <FindingDrawer
        check={checks.find((item) => item.check_id === openCheck)}
        assessment={assessment}
        names={names}
        onClose={() => setOpenCheck(null)}
      />
      <CreateScenarioDrawer
        open={Boolean(scenarioCheck)}
        formula={formula}
        check={scenarioCheck}
        onClose={() => setScenarioCheck(null)}
        onCreated={(id) => {
          setScenarioCheck(null);
          navigate(`/formulas/${id}`);
        }}
      />
      <SourceReviewDrawer documentId={reviewDoc} onClose={() => setReviewDoc(null)} />
      <SourceRecordDrawer
        documentId={sourceId}
        documents={assessment?.llm_context.documents ?? []}
        excerpt={assessment?.llm_context.source_excerpts?.find((item) => item.document_id === sourceId)?.relevant_text}
        onClose={() => setSourceId(null)}
      />
    </div>
  );
}

function SourceRecordDrawer({
  documentId,
  documents,
  excerpt,
  onClose,
}: {
  documentId: string | null;
  documents: PackageAssessment['llm_context']['documents'];
  excerpt?: string;
  onClose: () => void;
}) {
  const record = documents.find((item) => item.document_id === documentId);
  return (
    <Drawer open={Boolean(documentId)} onClose={onClose} title={record?.document_id || 'Source'} subtitle={record?.role}>
      {record ? (
        <div className="space-y-3 text-[13px] leading-6 text-ink">
          <p>{record.summary || excerpt || 'No summary is stored for this record.'}</p>
          <p className="text-muted">
            {record.document_type} · {record.review_status || 'unreviewed'}
            {record.batch_id ? ` · batch ${record.batch_id}` : ''}
            {record.version_id ? ` · ${record.formula_id} ${record.version_id}` : ''}
            {record.dataset_version ? ` · ${record.dataset_version}` : ''}
          </p>
          {record.structured_content ? (
            <pre className="overflow-x-auto rounded-lg bg-canvas p-3 text-xs text-muted">{JSON.stringify(record.structured_content, null, 2)}</pre>
          ) : null}
          {record.provenance !== 'synthetic_scenario' ? (
            <a className="fi-link" href={`/api/documents/${record.document_id}`} target="_blank" rel="noreferrer">
              Open registered file
            </a>
          ) : (
            <p className="text-muted">Scenario record. It is not an uploaded laboratory or supplier file.</p>
          )}
        </div>
      ) : null}
    </Drawer>
  );
}

function FindingDrawer({
  check,
  assessment,
  names,
  onClose,
}: {
  check?: PackageCheck;
  assessment?: PackageAssessment;
  names: Map<string, string>;
  onClose: () => void;
}) {
  const explanation = assessment?.explanation.content.finding_explanations?.find((item) => item.check_id === check?.check_id);
  const excerpt = assessment?.llm_context.source_excerpts?.find((item) => (check?.document_ids ?? []).includes(item.document_id));
  return (
    <Drawer open={Boolean(check)} onClose={onClose} title={check ? statusLabel(check.status) : ''} subtitle={check ? `${names.get(check.material_id ?? '') ?? check.material_id} · ${check.region}` : undefined}>
      {check ? (
        <div className="space-y-3 text-[13px] leading-6 text-ink">
          <p>{explanation?.explanation || check.message}</p>
          <p className="text-muted">Entered: {check.actual == null ? '—' : `${check.actual}%`}. Limit: {check.threshold ?? 'gap'} {check.unit || ''}.</p>
          <p className="text-muted">{check.action}</p>
          {excerpt ? <p className="rounded-lg bg-canvas p-3 text-muted">{excerpt.relevant_text}</p> : null}
        </div>
      ) : null}
    </Drawer>
  );
}

function CreateScenarioDrawer({
  open,
  formula,
  check,
  onClose,
  onCreated,
}: {
  open: boolean;
  formula: Formula;
  check: PackageCheck | null;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const services = useServices();
  const toast = useToast();
  const target = check?.threshold ?? 0;
  const materialId = check?.material_id;
  const proposed = formula.ingredients.map((item) => {
    if (item.rawMaterialId !== materialId) return { ...item };
    return { ...item, concentration: target };
  });
  const pigmentDelta = (formula.ingredients.find((item) => item.rawMaterialId === materialId)?.concentration ?? 0) - target;
  const water = proposed.find((item) => item.rawMaterialId === 'water');
  if (water) water.concentration = Number((water.concentration + pigmentDelta).toFixed(4));
  const total = proposed.reduce((sum, item) => sum + item.concentration, 0);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Create scenario"
      subtitle="Draft copy only. The original formula is not overwritten."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!confirmed || Math.abs(total - 100) > 0.01}
            onClick={() => {
              services
                .createFormula({
                  name: `${formula.name} — scenario`,
                  category: formula.category,
                  ageGroup: formula.ageGroup,
                  targetMarkets: formula.targetMarkets,
                  physicalForm: formula.physicalForm,
                  intendedUse: formula.intendedUse,
                  ownerId: formula.ownerId,
                  reviewerId: formula.reviewerId,
                  version: 'v1.0',
                  lifecycle: 'draft',
                  evidenceIds: [...formula.evidenceIds],
                  preferredAssessmentMode: 'scenario',
                  scenarioOfFormulaId: formula.id,
                  ingredients: proposed.map((item) => ({
                    name: item.name,
                    rawMaterialId: item.rawMaterialId,
                    concentration: item.concentration,
                    batchId: item.batchId,
                    evidenceIds: item.evidenceIds,
                  })),
                })
                .then((created) => {
                  toast.success('Scenario draft created', 'Run Assessment in scenario mode to compare with the original.');
                  onCreated(created.id);
                })
                .catch((cause: unknown) => {
                  toast.error('Scenario was not created', cause instanceof Error ? cause.message : 'Try again.');
                });
            }}
          >
            Create draft
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px] leading-6">
        <p className="text-muted">Proposed quantity uses the configured example threshold. This is not a recommended legal limit.</p>
        <ul className="space-y-1">
          {proposed.map((item) => {
            const original = formula.ingredients.find((row) => row.id === item.id)?.concentration;
            const changed = original !== item.concentration;
            return (
              <li key={item.id} className={changed ? 'font-medium text-ink' : 'text-muted'}>
                {item.name}: {original}% → {item.concentration}%
              </li>
            );
          })}
        </ul>
        <p className={Math.abs(total - 100) > 0.01 ? 'text-danger' : 'text-muted'}>Composition total {total.toFixed(2)}%</p>
        <label className="flex items-start gap-2 text-ink">
          <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
          Confirm rebalancing before creating the draft.
        </label>
      </div>
    </Drawer>
  );
}

function SourceReviewDrawer({ documentId, onClose }: { documentId: string | null; onClose: () => void }) {
  const services = useServices();
  const toast = useToast();
  const [status, setStatus] = useState('extracted_unverified');
  const [applicability, setApplicability] = useState('');
  const [note, setNote] = useState('');

  return (
    <Drawer
      open={Boolean(documentId)}
      onClose={onClose}
      title="Source review draft"
      subtitle="Browser-local only. Packaged documents stay unverified and dummy rules are not promoted."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              if (!documentId) return;
              const draft: SourceReviewDraft = {
                id: uid('REV'),
                documentId,
                applicability,
                reviewStatus: status,
                reviewerId: 'local-user',
                reviewedAt: new Date().toISOString(),
                note,
                previousValue: 'unverified',
              };
              services
                .saveSourceReviewDraft(draft)
                .then(() => {
                  toast.success('Review draft saved', 'This does not change packaged source files or enable dummy rules.');
                  onClose();
                })
                .catch((cause: unknown) => {
                  toast.error('Draft was not saved', cause instanceof Error ? cause.message : 'Try again.');
                });
            }}
          >
            Save draft
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Notice tone="warning" title="Local draft only">
          Extraction accuracy, document applicability, and approval as a decision rule are separate steps.
        </Notice>
        <Field label="Document">{documentId}</Field>
        <Field label="Applicability">
          <TextInput value={applicability} onChange={(event) => setApplicability(event.target.value)} />
        </Field>
        <Field label="Review status">
          <TextInput value={status} onChange={(event) => setStatus(event.target.value)} />
        </Field>
        <Field label="Note">
          <TextArea value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}
