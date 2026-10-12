import { useEffect, useMemo, useState } from 'react';
import { Check, Download, Minus, X } from 'lucide-react';
import type { Formula, ScreeningRun } from '../../types/domain';
import type { PackageCheck, PreliminaryFinding } from '../../api/formulaBackend';
import { Button } from '../ui/Button';
import { ageGroupLabel } from '../../utils/audience';
import { downloadJson, timestampedFilename } from '../../utils/export';
import { formatDateTime } from '../../utils/formatting';

const POINTS: Record<string, number> = { critical: 26, high: 12, medium: 12, low: 5, informational: 5 };

function pointsFor(item: PreliminaryFinding): number {
  if (typeof item.score_points === 'number') return item.score_points;
  if (item.status === 'meets_rule' || item.status === 'not_applicable') return 0;
  const risk = String(item.risk_level || item.severity || 'low').toLowerCase();
  return POINTS[risk] ?? 5;
}

function bandFor(score: number): { band: string; label: string } {
  if (score >= 80) return { band: 'ap', label: 'AP' };
  if (score >= 50) return { band: 'at_risk', label: 'At risk' };
  return { band: 'likely_cl', label: 'Likely CL' };
}

function riskLabel(level?: string | null): string {
  if (level === 'critical') return 'Critical';
  if (level === 'high' || level === 'medium') return 'High';
  if (level === 'low' || level === 'informational') return 'Low';
  return '';
}

function findingTags(item: PreliminaryFinding): string {
  const parts: string[] = [];
  if (item.rule_id) parts.push('Rules');
  if (item.status !== 'does_not_meet_rule' && item.status !== 'meets_rule') parts.push('Evidence');
  return parts.join(' + ') || 'Assessment';
}

function fixLabel(kind?: string): string {
  if (kind === 'reformulate') return 'Reformulate';
  if (kind === 'lab_test') return 'Lab test';
  if (kind === 'supplier_request') return 'Supplier request';
  return 'Review';
}

function ruleTone(status: string): 'pass' | 'fail' | 'needs' | 'hidden' {
  if (status === 'pass' || status === 'satisfied' || status === 'available') return 'pass';
  if (status === 'fail') return 'fail';
  if (status === 'not_applicable') return 'hidden';
  return 'needs';
}

function ruleStatusLabel(tone: ReturnType<typeof ruleTone>): string {
  if (tone === 'pass') return 'Pass';
  if (tone === 'fail') return 'Fails';
  if (tone === 'hidden') return 'Not relevant';
  return 'Needs data';
}

function historyTitle(item: Record<string, unknown>, index: number): string {
  const value = item.name || item.formula_name || item.title || item.formula_id;
  return typeof value === 'string' && value.trim() ? value : `Reviewed formula ${index + 1}`;
}

function historyNote(item: Record<string, unknown>): string {
  const value = item.summary || item.note || item.narrative || item.outcome_note;
  return typeof value === 'string' ? value : '';
}

function historyOutcome(item: Record<string, unknown>): string {
  const value = item.outcome || item.decision || item.result;
  return typeof value === 'string' ? value : '';
}

export function PrecheckResult({
  formula,
  run,
  onEditFormula,
}: {
  formula: Formula;
  run: ScreeningRun;
  onEditFormula?: () => void;
}) {
  const assessment = run.formulaAssessment;
  const preliminary = assessment?.preliminary_assessment;
  const prediction = preliminary?.preliminary_prediction;
  const findings = useMemo(() => {
    return [...(preliminary?.findings ?? [])].sort((left, right) => pointsFor(right) - pointsFor(left));
  }, [preliminary]);
  const scored = findings.filter((item) => pointsFor(item) > 0);
  const board = preliminary?.risk_score;
  const baseScore = typeof board?.score === 'number'
    ? board.score
    : Math.max(0, Math.min(100, 100 - scored.reduce((sum, item) => sum + pointsFor(item), 0)));
  const names = new Map((assessment?.llm_context.materials ?? []).map((item) => [item.material_id, item.name]));
  const checks = useMemo(() => {
    const calculated = assessment?.llm_context.calculated_checks ?? assessment?.llm_context.checks ?? [];
    const evidence = assessment?.llm_context.evidence_checks ?? [];
    return [...calculated, ...evidence];
  }, [assessment]);
  const history = assessment?.llm_context.documented_history?.length
    ? assessment.llm_context.documented_history
    : assessment?.llm_context.historical_cases ?? [];

  const plan = useMemo(() => {
    const source = (preliminary?.recommendations?.length ? preliminary.recommendations : preliminary?.next_actions) ?? [];
    const rows = source.map((item, index) => ({
      id: item.related_finding_id ? `fix-${item.related_finding_id}-${index}` : `fix-${index}`,
      action: item.action,
      reason: item.reason || '',
      kind: item.fix_kind || 'review',
      points: typeof item.score_points === 'number' ? item.score_points : 0,
      relatedFindingId: item.related_finding_id || '',
    }));
    const covered = new Set(rows.map((item) => item.relatedFindingId).filter(Boolean));
    findings.forEach((item) => {
      const points = pointsFor(item);
      if (points <= 0 || covered.has(item.finding_id)) return;
      rows.push({
        id: `finding-${item.finding_id}`,
        action: item.required_action || item.title,
        reason: item.reason || '',
        kind: item.status === 'testing_required' ? 'lab_test' : item.status === 'needs_information' ? 'supplier_request' : 'review',
        points,
        relatedFindingId: item.finding_id,
      });
    });
    return rows.filter((item) => (item.action || '').trim());
  }, [preliminary, findings]);

  const [selected, setSelected] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [showAllRules, setShowAllRules] = useState(false);
  const [askOpen, setAskOpen] = useState(false);

  useEffect(() => {
    setSelected([]);
    setShowHidden(false);
    setShowAllRules(false);
    setAskOpen(false);
  }, [run.id]);

  const selectedPoints = useMemo(() => {
    const seen = new Set<string>();
    return plan.reduce((sum, item) => {
      if (!selected.includes(item.id)) return sum;
      const key = item.relatedFindingId || item.id;
      if (seen.has(key)) return sum;
      seen.add(key);
      return sum + item.points;
    }, 0);
  }, [plan, selected]);
  const previewScore = Math.max(0, Math.min(100, baseScore + selectedPoints));
  const baseBand = bandFor(baseScore);
  const previewBand = bandFor(previewScore);
  const headline = preliminary?.score_headline || preliminary?.assessment_summary || prediction?.basis || run.summary;
  const driver = board?.driver || (scored.length <= 1 ? 'The top issue drives the score.' : 'The top 2 issues drive most of the risk.');
  const confidence = prediction?.analysis_confidence || board?.confidence || 'low';
  const openIssues = board?.open_issues ?? scored.length;
  const dataGaps = board?.data_gaps ?? findings.filter((item) => item.status !== 'meets_rule' && item.status !== 'not_applicable' && item.status !== 'does_not_meet_rule').length;
  const similarCases = board?.similar_cases ?? history.length;

  const ruleRows = checks.map((item) => ({ item, tone: ruleTone(item.status) }));
  const visibleRules = ruleRows.filter((row) => showHidden || row.tone !== 'hidden');
  const rankedRules = [...visibleRules].sort((left, right) => {
    const order = { fail: 0, needs: 1, pass: 2, hidden: 3 };
    return order[left.tone] - order[right.tone];
  });
  const shownRules = showAllRules ? rankedRules : rankedRules.slice(0, 8);
  const passCount = ruleRows.filter((row) => row.tone === 'pass').length;
  const failCount = ruleRows.filter((row) => row.tone === 'fail').length;
  const needsCount = ruleRows.filter((row) => row.tone === 'needs').length;

  const toggle = (id: string) => {
    setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const addFinding = (findingId: string) => {
    const match = plan.find((item) => item.relatedFindingId === findingId);
    if (match) toggle(match.id);
  };

  const exportPack = () => {
    downloadJson(timestampedFilename(`${run.id}-precheck`, 'json'), {
      disclaimer: 'Preliminary internal assessment; not certification. The score is computed from issue risk ratings and is not a measured chance of an AP seal.',
      formula: { id: formula.id, name: formula.name, version: formula.version },
      risk_score: board ?? { score: baseScore, band: baseBand.band, band_label: baseBand.label },
      preliminary_assessment: preliminary ?? null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.14em] text-subtle uppercase">Pre-check result</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-full bg-brand-400" aria-hidden />
            <h3 className="text-xl font-semibold text-navy-800">{formula.name}</h3>
          </div>
          <p className="mt-1 text-[13px] text-muted">
            {formula.version} · {formula.category} · {ageGroupLabel(formula.ageGroup)} · Screened {formatDateTime(run.runAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={onEditFormula} disabled={!onEditFormula}>Edit formula</Button>
          <Button size="sm" onClick={() => setAskOpen((value) => !value)}>Ask PreSeal</Button>
          <Button size="sm" variant="primary" onClick={exportPack} icon={<Download aria-hidden className="size-3.5" />}>
            Export submission pack
          </Button>
        </div>
      </div>

      {askOpen ? (
        <p className="rounded-lg border border-line bg-canvas px-3 py-2 text-[13px] leading-6 text-muted">
          This result is the assessment. Use the findings and fix plan below, then edit the formula and run again. There is no separate chat.
        </p>
      ) : null}

      <section className="rounded-panel border border-line bg-white p-5 shadow-card">
        <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
          <div>
            <div className="flex items-end gap-3">
              <p className={`text-6xl leading-none font-semibold tracking-tight ${baseBand.band === 'ap' ? 'text-success' : baseBand.band === 'likely_cl' ? 'text-danger' : 'text-warning'}`}>
                {baseScore}%
              </p>
              <span className={`mb-1 rounded-full px-2.5 py-1 text-xs font-semibold ${baseBand.band === 'ap' ? 'bg-success-soft text-success' : baseBand.band === 'likely_cl' ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
                {baseBand.label}
              </span>
            </div>
            <p className="mt-3 text-sm font-medium text-ink">Chance of the AP seal on first submission</p>
            <p className="mt-1 text-[12px] leading-5 text-muted">Preliminary score from issue risk ratings. Not a measured chance of certification.</p>
          </div>
          <div>
            <p className="text-[15px] leading-6 text-ink">{headline}</p>
            <p className="mt-1 text-sm text-muted">{driver}</p>
            {failCount > 0 && !findings.some((item) => item.status === 'does_not_meet_rule') ? (
              <p className="mt-1 text-sm text-muted">A calculated check failed without a risk rating. It stays in rule checks and is not included in this score.</p>
            ) : null}
            <Gauge score={baseScore} />
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 sm:grid-cols-4">
          <Stat label="Confidence" value={confidence.charAt(0).toUpperCase() + confidence.slice(1)} />
          <Stat label="Similar past decisions" value={String(similarCases)} />
          <Stat label="Open issues" value={String(openIssues)} />
          <Stat label="Data gaps" value={String(dataGaps)} />
        </dl>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="rounded-panel border border-line bg-white p-4 shadow-card">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h4 className="text-base font-semibold text-navy-800">Why</h4>
              <p className="text-[12px] text-muted">Ranked by effect on the score</p>
            </div>
            {scored.length === 0 ? (
              <p className="text-sm text-muted">No open issue was rated.</p>
            ) : (
              <ol className="space-y-3">
                {scored.map((item, index) => {
                  const points = pointsFor(item);
                  const planned = plan.some((row) => row.relatedFindingId === item.finding_id && selected.includes(row.id));
                  return (
                    <li key={item.finding_id} className="rounded-xl border border-line px-3 py-3">
                      <div className="flex gap-3">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-xs font-semibold text-ink">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-6 font-medium text-ink">{item.title}</p>
                          {item.reason ? <p className="mt-1 text-[13px] leading-6 text-muted">{item.reason}</p> : null}
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
                            {riskLabel(item.risk_level || item.severity) ? (
                              <span className="rounded-full bg-neutral-soft px-2 py-0.5 font-medium text-ink">{riskLabel(item.risk_level || item.severity)}</span>
                            ) : null}
                            <span className="rounded-full bg-canvas px-2 py-0.5 text-muted">{findingTags(item)}</span>
                            <span className="font-semibold text-danger">−{points} pts</span>
                            <button type="button" className="font-medium text-brand-500 hover:underline" onClick={() => addFinding(item.finding_id)}>
                              {planned ? 'Remove from plan' : 'Add fix to plan'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section className="rounded-panel border border-line bg-white p-4 shadow-card">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="text-base font-semibold text-navy-800">Rule checks</h4>
              <p className="text-[12px] text-muted">{passCount} pass · {needsCount} need data · {failCount} fail</p>
            </div>
            {shownRules.length === 0 ? (
              <p className="text-sm text-muted">No calculated checks were returned for this run.</p>
            ) : (
              <ul className="divide-y divide-line">
                {shownRules.map(({ item, tone }) => (
                  <RuleRow key={item.check_id} item={item} tone={tone} name={names.get(item.material_id ?? '')} />
                ))}
              </ul>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {rankedRules.length > 8 ? (
                <Button size="sm" onClick={() => setShowAllRules((value) => !value)}>
                  {showAllRules ? 'Show fewer' : `Show all ${rankedRules.length}`}
                </Button>
              ) : null}
              {ruleRows.some((row) => row.tone === 'hidden') ? (
                <Button size="sm" onClick={() => setShowHidden((value) => !value)}>
                  {showHidden ? 'Hide not relevant' : 'Show not relevant'}
                </Button>
              ) : null}
            </div>
          </section>

          <section className="rounded-panel border border-line bg-white p-4 shadow-card">
            <h4 className="text-base font-semibold text-navy-800">Exposure for a young child</h4>
            <p className="mt-2 text-[13px] leading-6 text-muted">
              No supported daily-dose or safety-margin calculation is on file for {ageGroupLabel(formula.ageGroup)}. Ingredient concentrations stay on the formula record and are not drawn as an exposure chart.
            </p>
          </section>

          <section className="rounded-panel border border-line bg-white p-4 shadow-card">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h4 className="text-base font-semibold text-navy-800">Past decisions like this one</h4>
              <p className="text-[12px] text-muted">{history.length} similar formulas on file</p>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-muted">No similar reviewed formulas are on file. Past decisions are not estimated.</p>
            ) : (
              <ul className="space-y-2">
                {history.slice(0, 4).map((item, index) => (
                  <li key={String(item.formula_id || item.case_id || index)} className="rounded-lg border border-line px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-ink">{historyTitle(item, index)}</p>
                      {historyOutcome(item) ? <span className="shrink-0 rounded-full bg-neutral-soft px-2 py-0.5 text-[11px] font-semibold text-ink">{historyOutcome(item)}</span> : null}
                    </div>
                    {historyNote(item) ? <p className="mt-1 text-[13px] leading-6 text-muted">{historyNote(item)}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="rounded-panel border border-line bg-white p-4 shadow-card lg:sticky lg:top-4">
          <h4 className="text-base font-semibold text-navy-800">Fix plan</h4>
          <p className="mt-1 text-[13px] leading-6 text-muted">Pick the changes you would make. PreSeal estimates the new score.</p>
          <ul className="mt-3 space-y-3">
            {plan.length === 0 ? <li className="text-sm text-muted">No fix was returned.</li> : null}
            {plan.map((item) => (
              <li key={item.id} className="rounded-xl border border-line px-3 py-3">
                <label className="flex cursor-pointer gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selected.includes(item.id)}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="min-w-0">
                    <span className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-ink">{item.action}</span>
                      {item.points > 0 ? <span className="shrink-0 text-sm font-semibold text-success">+{item.points}</span> : null}
                    </span>
                    {item.reason ? <span className="mt-1 block text-[13px] leading-6 text-muted">{item.reason}</span> : null}
                    <span className="mt-2 inline-flex rounded-full bg-neutral-soft px-2 py-0.5 text-[11px] font-medium text-ink">{fixLabel(item.kind)}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted">Now</span>
              <span className="font-semibold text-ink">{baseScore}% <span className="font-medium text-warning">{baseBand.label}</span></span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted">With selected fixes</span>
              <span className="font-semibold text-ink">{previewScore}% <span className={previewBand.band === 'ap' ? 'text-success' : 'text-warning'}>{previewBand.label}</span></span>
            </div>
            <p className="text-[12px] leading-5 text-muted">Selected fixes update this preview only. Revise the formula before screening again.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="primary" onClick={onEditFormula} disabled={!onEditFormula}>Apply and rescreen</Button>
            <Button
              onClick={() => setSelected(selected.length === plan.length ? [] : plan.map((item) => item.id))}
              disabled={plan.length === 0}
            >
              {selected.length === plan.length && plan.length > 0 ? 'Clear' : 'Select all'}
            </Button>
          </div>
        </aside>
      </div>

      <p className="text-sm text-muted">Preliminary internal assessment; not certification.</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

function Gauge({ score }: { score: number }) {
  const marker = Math.max(0, Math.min(100, score));
  return (
    <div className="mt-4">
      <div className="relative pt-5">
        <p className="absolute top-0 text-[11px] font-semibold text-ink" style={{ left: `${marker}%`, transform: 'translateX(-50%)' }}>
          Now {marker}%
        </p>
        <div className="flex h-8 overflow-hidden rounded-md text-[10px] font-semibold tracking-wide">
          <div className="flex w-1/2 items-center justify-center bg-[#f6c7cb] text-[#8d3d49]">LIKELY CL</div>
          <div className="flex w-[30%] items-center justify-center bg-[#f6e3a6] text-[#8a6414]">AT RISK</div>
          <div className="flex w-1/5 items-center justify-center bg-[#b7e4c7] text-[#1d6b3a]">AP</div>
        </div>
        <span className="absolute top-5 h-8 w-0.5 bg-navy-800" style={{ left: `${marker}%` }} aria-hidden />
      </div>
      <div className="relative mt-1 h-4 text-[11px] text-muted">
        <span className="absolute left-0">0</span>
        <span className="absolute left-1/2 -translate-x-1/2">50</span>
        <span className="absolute left-[80%] -translate-x-1/2">80</span>
        <span className="absolute right-0">100</span>
      </div>
    </div>
  );
}

function RuleRow({ item, tone, name }: { item: PackageCheck; tone: ReturnType<typeof ruleTone>; name?: string }) {
  const title = name || item.material_id || item.document_type || item.requirement_id || item.check_id;
  const detail = item.message || item.gap_status || '';
  const source = item.document_type || item.region || 'Calculation';
  return (
    <li className="flex items-start justify-between gap-3 py-2.5">
      <div className="flex min-w-0 gap-2">
        <StatusIcon tone={tone} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">{title}</p>
          {detail ? <p className="text-[13px] leading-5 text-muted">{detail}</p> : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className={`text-[13px] font-semibold ${tone === 'pass' ? 'text-success' : tone === 'fail' ? 'text-danger' : tone === 'hidden' ? 'text-subtle' : 'text-warning'}`}>
          {ruleStatusLabel(tone)}
        </p>
        <p className="text-[11px] text-muted">{source}</p>
      </div>
    </li>
  );
}

function StatusIcon({ tone }: { tone: ReturnType<typeof ruleTone> }) {
  if (tone === 'pass') {
    return <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-success-soft text-success"><Check aria-hidden className="size-3" /></span>;
  }
  if (tone === 'fail') {
    return <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-danger-soft text-danger"><X aria-hidden className="size-3" /></span>;
  }
  if (tone === 'hidden') {
    return <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-subtle"><Minus aria-hidden className="size-3" /></span>;
  }
  return <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning"><Minus aria-hidden className="size-3" /></span>;
}
