import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { AgeGroup, Formula, ProductCategory, ReviewStatus, ScreeningStatus } from '../types/domain';
import type { FormulaFilters, FormulaRow } from '../types/services';
import { useAsyncData } from '../hooks/useAsyncData';
import { useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ActiveFilterChip } from '../components/ui/Filters';
import { TBody, Table, TableScroll, Td, Th, THead, Tr } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { FormulaFormDrawer } from '../components/formulas/FormulaFormDrawer';
import { SCREENING_STATUS_LABEL } from '../utils/formatting';
import { cn } from '../utils/cn';

const PENDING_REVIEW: ReviewStatus[] = ['not-started', 'in-review', 'awaiting-evidence', 'returned'];
const PAGE_SIZE = 10;

type Band = 'likely_ap' | 'at_risk' | 'likely_cl';
type BandFilter = 'all' | Band;

const BAND_LABEL: Record<Band, string> = {
  likely_ap: 'Likely AP',
  at_risk: 'At risk',
  likely_cl: 'Likely CL',
};

const BAND_STYLE: Record<Band, { bar: string; text: string }> = {
  likely_ap: { bar: 'bg-[#2f7d57]', text: 'text-[#2f7d57]' },
  at_risk: { bar: 'bg-[#9a6420]', text: 'text-[#9a6420]' },
  likely_cl: { bar: 'bg-[#b8323f]', text: 'text-[#b8323f]' },
};

const CATEGORY_DOT: Record<ProductCategory, string> = {
  Markers: 'bg-[#e84a8a]',
  Paints: 'bg-[#5aa9e6]',
  Crayons: 'bg-[#ee7a63]',
  'Modeling Compounds': 'bg-[#e6e6e6] ring-1 ring-line',
  'Future / Novelty Products': 'bg-[#6b4fc8]',
  Glue: 'bg-[#d9a93b]',
};

const AGE_SHORT: Record<AgeGroup, string> = {
  under_12: 'Under 12',
  '12_and_above': '12+',
};

interface LatestScore {
  score: number;
  band: Band;
  topIssue?: string;
  moreIssues: number;
}

interface SavedFinding {
  title?: string | null;
  status?: string | null;
  score_points?: number | null;
}

interface SavedRun {
  assessment_id?: string;
  input_snapshot?: { formula_id?: string };
  preliminary_assessment?: {
    risk_score?: { score?: number | null } | null;
    findings?: SavedFinding[] | null;
  } | null;
}

function bandForScore(score: number): Band {
  if (score >= 80) return 'likely_ap';
  if (score >= 50) return 'at_risk';
  return 'likely_cl';
}

/** Most recent scored assessment per formula, read from the saved assessment history. */
async function fetchLatestScores(): Promise<Record<string, LatestScore>> {
  try {
    const response = await fetch('/api/assessments');
    if (!response.ok) return {};
    const payload = (await response.json()) as { runs?: SavedRun[] };
    const scores: Record<string, LatestScore> = {};
    for (const run of [...(payload.runs ?? [])].reverse()) {
      const formulaId = run.input_snapshot?.formula_id;
      const score = run.preliminary_assessment?.risk_score?.score;
      if (!formulaId || scores[formulaId] || typeof score !== 'number') continue;
      const open = (run.preliminary_assessment?.findings ?? [])
        .filter((item) => (item.score_points ?? 0) > 0 && item.title)
        .sort((left, right) => (right.score_points ?? 0) - (left.score_points ?? 0));
      scores[formulaId] = {
        score,
        band: bandForScore(score),
        topIssue: open[0]?.title ?? undefined,
        moreIssues: Math.max(0, open.length - 1),
      };
    }
    return scores;
  } catch {
    return {};
  }
}

function stageFor(formula: Formula): { label: string; className: string } {
  if (formula.lifecycle === 'draft') return { label: 'Draft', className: 'border-transparent bg-[#eceef2] text-muted' };
  if (formula.lifecycle === 'archived') return { label: 'Archived', className: 'border-transparent bg-[#eceef2] text-muted' };
  if (formula.screeningStatus === 'not-screened') return { label: 'Not screened', className: 'border-line bg-surface text-muted' };
  if (formula.reviewStatus === 'complete') return { label: 'Review complete', className: 'border-transparent bg-[#e3f4ea] text-[#2f7d57]' };
  if (formula.reviewStatus === 'in-review') return { label: 'In review', className: 'border-transparent bg-[#e6e9fb] text-[#4450b8]' };
  return { label: 'Screened', className: 'border-ink/40 bg-surface text-ink' };
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function LikelihoodCell({ latest }: { latest?: LatestScore }) {
  if (!latest) return <span className="text-[13px] text-muted">Not assessed</span>;
  const style = BAND_STYLE[latest.band];
  return (
    <div className="flex items-center justify-end gap-3">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-[#e6e8ee]" aria-hidden>
        <span className={cn('block h-full rounded-full', style.bar)} style={{ width: `${latest.score}%` }} />
      </span>
      <span className="text-right leading-tight">
        <span className="block text-[13px] font-semibold text-ink tabular">{latest.score}%</span>
        <span className={cn('block whitespace-nowrap text-[11px]', style.text)}>{BAND_LABEL[latest.band]}</span>
      </span>
    </div>
  );
}

export function FormulaLibraryPage() {
  const services = useServices();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [screeningStatuses, setScreeningStatuses] = useState<ScreeningStatus[]>([]);
  const [onlyMissingEvidence, setOnlyMissingEvidence] = useState(false);
  const [onlyPendingReview, setOnlyPendingReview] = useState(false);
  const [bandFilter, setBandFilter] = useState<BandFilter>('all');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  /* Deep links from Overview metric cards pre-apply a filter. */
  useEffect(() => {
    const screening = searchParams.get('screening');
    const review = searchParams.get('review');
    const evidence = searchParams.get('evidence');
    if (screening) setScreeningStatuses([screening as ScreeningStatus]);
    if (evidence === 'missing') setOnlyMissingEvidence(true);
    if (review === 'pending') setOnlyPendingReview(true);
    if (screening || review || evidence) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const filters = useMemo<FormulaFilters>(
    () => ({
      screeningStatuses,
      reviewStatuses: onlyPendingReview ? PENDING_REVIEW : undefined,
      onlyMissingEvidence,
      sortKey: 'updatedAt',
      sortDirection: 'desc',
      page: 1,
      pageSize: 1000,
    }),
    [screeningStatuses, onlyMissingEvidence, onlyPendingReview],
  );

  const { data, loading, error, reload } = useAsyncData(
    async () => {
      const [list, scores] = await Promise.all([services.listFormulas(filters), fetchLatestScores()]);
      return { rows: list.items, scores };
    },
    [filters],
  );

  const rows: FormulaRow[] = data?.rows ?? [];
  const scores = data?.scores ?? {};
  const counts = useMemo(() => {
    const result: Record<BandFilter, number> = { all: rows.length, likely_ap: 0, at_risk: 0, likely_cl: 0 };
    for (const row of rows) {
      const band = scores[row.formula.id]?.band;
      if (band) result[band] += 1;
    }
    return result;
  }, [rows, scores]);

  const visible = bandFilter === 'all' ? rows : rows.filter((row) => scores[row.formula.id]?.band === bandFilter);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeFilters = [
    ...screeningStatuses.map((value) => ({
      label: `Screening: ${SCREENING_STATUS_LABEL[value]}`,
      clear: () => setScreeningStatuses((v) => v.filter((x) => x !== value)),
    })),
    ...(onlyMissingEvidence
      ? [{ label: 'Missing evidence only', clear: () => setOnlyMissingEvidence(false) }]
      : []),
    ...(onlyPendingReview ? [{ label: 'Review not complete', clear: () => setOnlyPendingReview(false) }] : []),
  ];

  const clearAll = () => {
    setScreeningStatuses([]);
    setOnlyMissingEvidence(false);
    setOnlyPendingReview(false);
    setBandFilter('all');
    setPage(1);
  };

  const pills: { key: BandFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'likely_ap', label: 'Likely AP' },
    { key: 'at_risk', label: 'At risk' },
    { key: 'likely_cl', label: 'Likely CL' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Latest Result"
        description="Formulas with assessment status."
        actions={
          <Button variant="primary" onClick={() => setFormOpen(true)} icon={<Plus aria-hidden className="size-4" />}>
            New Formula
          </Button>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="text-[15px] font-semibold text-ink">All formulas</h2>
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by AP likelihood">
            {pills.map((pill) => {
              const active = bandFilter === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setBandFilter(pill.key);
                    setPage(1);
                  }}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium transition-colors',
                    active ? 'border-ink bg-ink text-white' : 'border-line bg-surface text-ink hover:bg-canvas',
                  )}
                >
                  {pill.label}
                  <span className={cn('tabular', active ? 'text-white/70' : 'text-muted')}>{counts[pill.key]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-y border-line px-5 py-2.5">
            <span className="text-xs text-muted">Active filters:</span>
            {activeFilters.map((filter) => (
              <ActiveFilterChip key={filter.label} label={filter.label} onRemove={filter.clear} />
            ))}
            <button
              type="button"
              onClick={clearAll}
              className="ml-1 text-xs font-medium text-brand-500 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : null}

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingState label="Loading formulas…" rows={6} />
        ) : visible.length === 0 ? (
          <EmptyState
            variant="search"
            title="No formulas match these filters"
            message="Choose a different filter to see more formulas."
            action={<Button onClick={clearAll}>Clear filters</Button>}
          />
        ) : (
          <>
            <TableScroll className="px-5">
              <Table caption="Latest Result">
                <THead>
                  <tr>
                    <Th>Formula</Th>
                    <Th>Category</Th>
                    <Th>Ages</Th>
                    <Th>Stage</Th>
                    <Th className="text-right">AP likelihood</Th>
                    <Th>Top issue</Th>
                    <Th>Updated</Th>
                  </tr>
                </THead>
                <TBody>
                  {pageRows.map((row) => {
                    const { formula } = row;
                    const latest = scores[formula.id];
                    const stage = stageFor(formula);
                    return (
                      <Tr key={formula.id} onClick={() => navigate(`/formulas/${formula.id}`)}>
                        <Td>
                          <div className="flex min-w-0 items-center gap-3">
                            <span
                              aria-hidden
                              className={cn('size-3 shrink-0 rounded-full', CATEGORY_DOT[formula.category] ?? 'bg-muted')}
                            />
                            <div className="min-w-0 max-w-[220px]" title={formula.name}>
                              <div className="truncate text-[13px] font-semibold text-ink">{formula.name}</div>
                              <div className="truncate font-mono text-[11px] text-muted">{formula.id}</div>
                            </div>
                          </div>
                        </Td>
                        <Td className="whitespace-nowrap text-[13px]">{formula.category}</Td>
                        <Td className="whitespace-nowrap text-[13px]">
                          {formula.ageGroup ? AGE_SHORT[formula.ageGroup] : '—'}
                        </Td>
                        <Td>
                          <span
                            className={cn(
                              'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                              stage.className,
                            )}
                          >
                            {stage.label}
                          </span>
                        </Td>
                        <Td>
                          <LikelihoodCell latest={latest} />
                        </Td>
                        <Td className="text-[13px]" title={latest?.topIssue}>
                          {!latest ? (
                            <span className="text-muted">—</span>
                          ) : latest.topIssue ? (
                            <span className="flex max-w-[200px] items-baseline">
                              <span className="truncate">{latest.topIssue}</span>
                              {latest.moreIssues > 0 ? (
                                <span className="ml-1 shrink-0 text-[11px] text-muted">+{latest.moreIssues} more</span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-muted">No open issues</span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-[13px] text-muted">{formatUpdated(formula.updatedAt)}</Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </TableScroll>

            <Pagination
              page={currentPage}
              pageCount={pageCount}
              total={visible.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              itemLabel="formulas"
            />
          </>
        )}
      </Card>

      <FormulaFormDrawer
        open={formOpen}
        mode="create"
        onClose={() => setFormOpen(false)}
        onSaved={(formula) => navigate(`/formulas/${formula.id}`)}
      />
    </div>
  );
}
