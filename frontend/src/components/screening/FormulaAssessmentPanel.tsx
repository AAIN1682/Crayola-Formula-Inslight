import type { PackageAssessment } from '../../api/formulaBackend';
import { isLiveAzureAssessment } from '../../api/formulaBackend';
import { Card, CardBody, CardHeader, DataPoint } from '../ui/Card';
import { Notice } from '../ui/DemoNotice';
import { Button } from '../ui/Button';

function metricText(value: number | null | undefined) {
  return value == null ? 'Not available' : `${value}%`;
}

export function FormulaAssessmentPanel({
  assessment,
  onRetryExplanation,
  retrying,
}: {
  assessment: PackageAssessment;
  onRetryExplanation?: () => void;
  retrying?: boolean;
}) {
  const explanation = assessment.explanation;
  const execution = assessment.execution;
  const live = isLiveAzureAssessment(assessment);
  const aiFailed = explanation.status === 'failed' || execution?.llm_status === 'failed';
  const content = explanation.content;
  const confidence = assessment.analysis_confidence ?? content.analysis_confidence;
  const statusLabel =
    assessment.screening_status === 'changes_required'
      ? 'Changes required'
      : assessment.screening_status === 'not_assessed'
        ? 'Not assessed'
        : 'Review required';
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink">
        Screening status: {statusLabel}. Assessed {assessment.input_snapshot.version_id} for {assessment.input_snapshot.regions.join(', ')} at {assessment.created_at}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardBody>
            <DataPoint label="Configured check pass rate" value={metricText(assessment.metrics.check_pass_rate_percent)} hint={assessment.metrics.metrics_note} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <DataPoint label="Verified evidence coverage" value={metricText(assessment.metrics.evidence_coverage_percent)} hint="Verified, in-scope, identity-matched evidence only. File count is not coverage." />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <DataPoint label="Failed checks" value={String(assessment.metrics.failed_checks)} hint={`${assessment.metrics.passed_checks} passed · ${assessment.metrics.not_assessed_checks} not assessed`} />
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <DataPoint
              label="Missing or unverified evidence"
              value={String(assessment.llm_context.evidence_checks.filter((item) => item.status !== 'available').length)}
              hint="Needs review and missing documents"
            />
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="AP acceptance probability" description="Not a certification probability." />
        <CardBody>
          <p className="text-sm font-medium text-ink">AP acceptance probability: Not estimable from available data.</p>
          <p className="mt-1 text-[13px] leading-6 text-muted">
            No validated acceptance model is available. Check pass rate and evidence coverage are not an acceptance probability.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="AI assessment confidence" description="Qualitative support for the narrative, not a calibrated probability of safety or certification." />
        <CardBody>
          {live && confidence ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-ink">{confidence.level} confidence</p>
              <p className="text-[13px] leading-6 text-muted">{confidence.basis}</p>
              {confidence.limiting_factors.length ? (
                <ul className="list-disc space-y-1 pl-5 text-[13px] leading-6 text-muted">
                  {confidence.limiting_factors.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <p className="text-[13px] leading-6 text-muted">
              AI assessment confidence is available only after a validated Azure response.
            </p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={live ? 'AI-generated analysis' : aiFailed ? 'AI analysis failed' : 'Calculated assessment'}
          description={
            live
              ? 'Validated Azure narrative. It does not change the calculated checks.'
              : 'Azure generation did not succeed or was not requested. Calculated checks remain below.'
          }
          actions={
            aiFailed && onRetryExplanation ? (
              <Button onClick={onRetryExplanation} loading={retrying}>
                Retry explanation
              </Button>
            ) : null
          }
        />
        <CardBody className="space-y-3">
          {aiFailed ? (
            <Notice tone="warning" title="AI analysis failed">
              {execution?.error_message || 'The calculated checks are still shown. This is not a successful Azure assessment.'}
            </Notice>
          ) : null}
          {live && content.summary ? <p className="text-sm leading-6 text-ink">{content.summary}</p> : null}
          {live && content.recommendations?.length ? (
            <ul className="space-y-2">
              {content.recommendations.map((item) => (
                <li key={item.action} className="text-[13px] leading-6 text-muted">
                  <span className="font-medium text-ink">{item.priority ? `${item.priority}: ` : ''}{item.action}</span>
                  {item.rationale ? ` ${item.rationale}` : ''}
                  {item.requires_testing_or_review ? ' Requires testing or review before any change is applied.' : ''}
                </li>
              ))}
            </ul>
          ) : null}
          {live && content.alerts?.length ? (
            <ul className="space-y-2">
              {content.alerts.map((alert) => (
                <li key={`${alert.title}-${alert.message}`} className="text-[13px] leading-6 text-muted">
                  <span className="font-medium text-ink">{alert.title}.</span> {alert.message}
                </li>
              ))}
            </ul>
          ) : null}
          {live && content.evidence_gaps?.length ? (
            <div>
              <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">Evidence gaps</p>
              <ul className="mt-2 space-y-2">
                {content.evidence_gaps.map((item) => (
                  <li key={`${item.requirement_id}-${item.status}`} className="text-[13px] leading-6 text-muted">
                    <span className="font-medium text-ink">{item.requirement_id} · {item.status}.</span> {item.explanation} {item.required_action}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {content.limitations?.length ? (
            <ul className="list-disc space-y-1 pl-5 text-[13px] leading-6 text-muted">
              {content.limitations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Evidence" description="Matched by material, batch, formula version, and region. A similar product category does not make a document applicable." />
        <CardBody>
          <ul className="space-y-2">
            {assessment.llm_context.evidence_checks.map((item) => (
              <li key={item.check_id} className="text-[13px] leading-6 text-muted">
                <span className="font-medium text-ink">
                  {item.status === 'available' ? 'Available' : item.status === 'needs_review' ? 'Needs review' : 'Missing'}
                </span>
                {' · '}
                {item.document_type} · {item.region}
                {item.material_id ? ` · ${item.material_id}` : ''}
                {item.document_ids?.length
                  ? item.document_ids.map((id) => (
                      <a key={id} className="fi-link ml-2" href={`/api/documents/${id}`} target="_blank" rel="noreferrer">
                        {id}
                      </a>
                    ))
                  : null}
                <span className="block">{item.message}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <details className="rounded-lg border border-line bg-surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">Analysis details</summary>
        <dl className="mt-3 grid gap-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">Provider</dt>
            <dd className="text-ink">{execution?.llm_provider ?? 'azure_openai'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Execution mode</dt>
            <dd className="text-ink">{execution?.execution_mode ?? 'live'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">LLM status</dt>
            <dd className="text-ink">{execution?.llm_status ?? explanation.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Deployment</dt>
            <dd className="text-ink">{execution?.deployment ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Response ID</dt>
            <dd className="text-ink tabular">{execution?.response_id ?? 'null'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Request ID</dt>
            <dd className="text-ink tabular">{execution?.request_id ?? 'null'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Latency</dt>
            <dd className="text-ink">{execution?.latency_ms == null ? '—' : `${execution.latency_ms} ms`}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Retrieved sources</dt>
            <dd className="text-ink">{execution?.retrieved_source_count ?? assessment.llm_context.source_excerpts?.length ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Input hash</dt>
            <dd className="break-all text-ink tabular">{execution?.input_hash ?? assessment.input_hash ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Data hash</dt>
            <dd className="break-all text-ink tabular">{execution?.data_hash ?? assessment.data_hash ?? '—'}</dd>
          </div>
        </dl>
        {assessment.llm_context.source_excerpts?.length ? (
          <ul className="mt-3 space-y-2">
            {assessment.llm_context.source_excerpts.map((excerpt) => (
              <li key={excerpt.source_id} className="text-[13px] leading-6 text-muted">
                <span className="font-medium text-ink">{excerpt.document_id}</span>
                {excerpt.filename ? ` · ${excerpt.filename}` : ''}
                {excerpt.page != null ? ` · page ${excerpt.page}` : ''}
                {' · '}
                {excerpt.review_status}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-muted">No relevant source excerpts were retrieved for this input.</p>
        )}
      </details>
    </div>
  );
}
