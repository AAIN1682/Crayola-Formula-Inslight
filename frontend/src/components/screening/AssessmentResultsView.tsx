import { useNavigate } from 'react-router-dom';
import { GitCompare, PlayCircle } from 'lucide-react';
import type { Formula, ReviewDecision, ScreeningRun } from '../../types/domain';
import { isLiveAzureAssessment } from '../../api/formulaBackend';
import { Badge, ScreeningBadge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card, CardBody } from '../ui/Card';
import { Notice } from '../ui/DemoNotice';
import { formatDateTime } from '../../utils/formatting';
import { PrecheckResult } from './PrecheckResult';

export function AssessmentResultsView({
  run,
  formula,
  isCurrent,
  onRerun,
}: {
  run: ScreeningRun;
  formula: Formula;
  isCurrent: boolean;
  onRerun: () => void;
  decisions?: ReviewDecision[];
}) {
  const assessment = run.formulaAssessment;
  const navigate = useNavigate();

  const live = isLiveAzureAssessment(assessment);
  const storedPreliminary = assessment?.preliminary_assessment;
  const hasChecks = Boolean(assessment?.llm_context.calculated_checks?.length || assessment?.llm_context.checks?.length);
  const preliminary = storedPreliminary && (live || storedPreliminary.risk_score || storedPreliminary.findings?.length || hasChecks)
    ? storedPreliminary
    : undefined;
  const prediction = preliminary?.preliminary_prediction;
  const content = assessment?.explanation.content;
  const recommendationRows = (content?.prioritized_actions?.length ? content.prioritized_actions : content?.recommendations?.length ? content.recommendations : null)
    ?? (storedPreliminary?.recommendations?.length ? storedPreliminary.recommendations : storedPreliminary?.next_actions ?? []).map((item) => ({
      action: item.action || '',
      rationale: item.reason || '',
      priority: item.priority || 'medium',
      related_check_ids: [] as string[],
      source_ids: [] as string[],
      requires_testing_or_review: item.fix_kind === 'lab_test',
      can_create_scenario: false,
    }));
  const priorities = (recommendationRows.length ? recommendationRows : run.nextActions.map((item) => ({
    action: item.label,
    rationale: item.detail,
    priority: 'medium',
    related_check_ids: [] as string[],
    can_create_scenario: false,
  }))).slice(0, 3);
  const summary = live ? content?.summary || run.summary : run.summary;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{formula.name} {run.formulaVersion}</Badge>
          <Badge tone="info">Preliminary assessment</Badge>
          <span className="text-[13px] text-muted">{formatDateTime(run.runAt)}</span>
          {(run.targetMarkets ?? []).map((item) => (
            <Badge key={item} tone="neutral">{item}</Badge>
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

      {preliminary ? (
        <PrecheckResult formula={formula} run={run} onEditFormula={() => navigate(`/formulas/${formula.id}`)} />
      ) : (
      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ScreeningBadge status={run.status} current={isCurrent} />
            <p className="text-sm font-medium text-ink">
              Preliminary AP/CL assessment: {prediction?.outcome === 'ap_leaning' ? 'AP-leaning' : prediction?.outcome === 'cl_leaning' ? 'CL-leaning' : 'Indeterminate'}
            </p>
          </div>
          <p className="text-[15px] leading-7 text-ink">{prediction?.basis || summary}</p>
          <p className="text-sm text-muted">
            AI assessment confidence: {prediction?.analysis_confidence || content?.analysis_confidence?.level || 'low'}. {prediction?.confidence_reason || content?.analysis_confidence?.basis}
          </p>
          <p className="max-w-4xl text-[15px] leading-7 text-ink">{summary}</p>
          {priorities[0] ? (
            <p className="text-[13px] leading-6 text-muted">
              Next: {priorities[0].action}. {priorities[0].rationale}
            </p>
          ) : null}
          <p className="text-sm text-muted">Preliminary internal assessment; not certification.</p>
        </CardBody>
      </Card>
      )}

      {!preliminary ? (
      <div className="grid gap-3 lg:grid-cols-3">
        {priorities.map((item, index) => (
          <Card key={`${item.action}-${index}`}>
            <CardBody className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-subtle">{item.priority || 'medium'}</p>
              <p className="text-sm font-medium text-ink">{item.action}</p>
              <p className="text-[13px] leading-6 text-muted">{item.rationale}</p>
            </CardBody>
          </Card>
        ))}
      </div>
      ) : null}

      <Notice tone="neutral" title="What this result is">
        This is an internal assessment against the configured checks for the selected markets. Illustrative evidence is not validated. It is not a certification and does not guarantee acceptance.
      </Notice>
    </div>
  );
}
