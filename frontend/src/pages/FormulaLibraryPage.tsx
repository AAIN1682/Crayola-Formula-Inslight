import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, Copy, MoreHorizontal, Plus, RotateCcw, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import type { Formula, ProductCategory } from '../types/domain';
import { PRODUCT_CATEGORIES } from '../types/domain';
import type { FormulaFilters, FormulaRow, FormulaSortKey, SortDirection } from '../types/services';
import { useAsyncData, useAsyncAction } from '../hooks/useAsyncData';
import { useServices } from '../state/DemoDataProvider';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { Pagination } from '../components/ui/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import {
  formatLibraryScore,
  SCREENING_BAND_LABEL,
  topIssueLabel,
  type LatestRunSummary,
  type ScreeningBand,
} from '../utils/libraryScreeningDisplay';
import '../styles/preseal-portfolio.css';

const BANDS: ScreeningBand[] = ['all', 'likely-ap', 'at-risk', 'likely-cl', 'not-screened'];

function formatStage(formula: Formula): string {
  if (formula.lifecycle === 'draft') return 'Draft';
  if (formula.reviewStatus === 'complete') return 'Review complete';
  if (formula.reviewStatus === 'in-review') return 'In review';
  if (formula.screeningStatus !== 'not-screened') return 'Screened';
  return 'Draft';
}

function formatAge(formula: Formula): string {
  const match = formula.intendedAgeDetail?.match(/(\d+\+)/);
  return match ? match[1] : formula.ageGroup === '12_and_above' ? '12+' : 'Under 12';
}

function formatUpdated(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

function scoreTone(summary?: LatestRunSummary | null): 'ap' | 'risk' | 'cl' | 'neutral' {
  switch (summary?.displayStatus) {
    case 'pass-leaning':
      return 'ap';
    case 'at-risk':
      return 'risk';
    case 'likely-cl':
      return 'cl';
    default:
      return 'neutral';
  }
}

function RowActions({
  row,
  onOpen,
  onOpenResult,
  onDuplicate,
  onDuplicateVersion,
  onArchive,
  onRestore,
  onDelete,
}: {
  row: FormulaRow;
  onOpen: () => void;
  onOpenResult: () => void;
  onDuplicate: () => void;
  onDuplicateVersion: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const archived = row.formula.lifecycle === 'archived';

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [open]);

  return (
    <div className="relative flex justify-end" onClick={(event) => event.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={`Actions for ${row.formula.name}`}
        aria-expanded={open}
        className="flex size-8 items-center justify-center rounded-md border border-transparent text-[var(--ps-ink-3)] hover:bg-[var(--ps-sunken)]"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-full right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-[var(--ps-line)] bg-white py-1 shadow-lg"
        >
          <button type="button" role="menuitem" onClick={onOpen} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-slate-50">
            <SquareArrowOutUpRight className="size-3.5" aria-hidden />
            Open
          </button>
          {row.latestRunSummary?.runId ? (
            <button type="button" role="menuitem" onClick={onOpenResult} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-slate-50">
              View latest result
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={onDuplicate} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-slate-50">
            <Copy className="size-3.5" aria-hidden />
            Duplicate as new formula
          </button>
          <button type="button" role="menuitem" onClick={onDuplicateVersion} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-slate-50">
            Duplicate as new version
          </button>
          {archived ? (
            <>
              <button type="button" role="menuitem" onClick={onRestore} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-slate-50">
                <RotateCcw className="size-3.5" aria-hidden />
                Restore
              </button>
              <button type="button" role="menuitem" onClick={onDelete} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-700 hover:bg-red-50">
                <Trash2 className="size-3.5" aria-hidden />
                Delete permanently
              </button>
            </>
          ) : (
            <button type="button" role="menuitem" onClick={onArchive} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-red-700 hover:bg-red-50">
              <Archive className="size-3.5" aria-hidden />
              Archive
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function FormulaLibraryPage() {
  const services = useServices();
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(() => searchParams.get('q') ?? '');
  const [band, setBand] = useState<ScreeningBand>(() => (searchParams.get('band') as ScreeningBand) || 'all');
  const [categories, setCategories] = useState<string[]>(() => searchParams.getAll('category'));
  const [includeArchived, setIncludeArchived] = useState(() => searchParams.get('archived') === '1');
  const [onlyMissingEvidence, setOnlyMissingEvidence] = useState(false);
  const [onlyPendingReview, setOnlyPendingReview] = useState(false);
  const [sortKey] = useState<FormulaSortKey>('updatedAt');
  const [sortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(() => Number.parseInt(searchParams.get('page') ?? '1', 10) || 1);

  const [archiveTarget, setArchiveTarget] = useState<Formula | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Formula | undefined>();

  useEffect(() => {
    const review = searchParams.get('review');
    const evidence = searchParams.get('evidence');
    if (evidence === 'missing') setOnlyMissingEvidence(true);
    if (review === 'pending') setOnlyPendingReview(true);
    if (review || evidence) {
      const next = new URLSearchParams(searchParams);
      next.delete('review');
      next.delete('evidence');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (band !== 'all') params.set('band', band);
    for (const category of categories) params.append('category', category);
    if (includeArchived) params.set('archived', '1');
    if (page > 1) params.set('page', String(page));
    setSearchParams(params, { replace: true });
  }, [query, band, categories, includeArchived, page, setSearchParams]);

  const filters = useMemo<FormulaFilters>(
    () => ({
      query,
      categories: categories as ProductCategory[],
      screeningBand: band,
      onlyMissingEvidence,
      reviewStatuses: onlyPendingReview ? ['not-started', 'in-review', 'awaiting-evidence', 'returned'] : undefined,
      lifecycle: includeArchived ? ['draft', 'active', 'archived'] : ['draft', 'active'],
      sortKey,
      sortDirection,
      page,
      pageSize: 10,
    }),
    [query, categories, band, onlyMissingEvidence, onlyPendingReview, includeArchived, sortKey, sortDirection, page],
  );

  const { data, loading, error, reload } = useAsyncData(() => services.listFormulas(filters), [filters]);

  const duplicate = useAsyncAction(async (formula: Formula) => {
    const copy = await services.duplicateFormula(formula.id);
    toast.success('Formula duplicated', `${copy.name} was created as a draft.`);
    navigate(`/formulas/${copy.id}`);
  });

  const duplicateVersion = useAsyncAction(async (formula: Formula) => {
    const copy = await services.duplicateFormulaVersion(formula.id);
    toast.success('New version created', `${copy.name} is now ${copy.version}.`);
    navigate(`/formulas/${copy.id}/edit`);
  });

  const archive = useAsyncAction(async (formula: Formula) => {
    await services.archiveFormula(formula.id);
    setArchiveTarget(undefined);
    toast.success('Formula archived', `${formula.name} is hidden from the default library view.`);
    reload();
  });

  const restore = useAsyncAction(async (formula: Formula) => {
    await services.restoreFormula(formula.id);
    toast.success('Formula restored', `${formula.name} is back in the library.`);
    reload();
  });

  const remove = useAsyncAction(async (formula: Formula) => {
    await services.deleteFormula(formula.id);
    setDeleteTarget(undefined);
    toast.success('Formula deleted', `${formula.name} was removed.`);
    reload();
  });

  const summary = data?.summary;
  const bandCount = (key: keyof NonNullable<typeof summary>) => summary?.[key] ?? 0;

  const openRow = (row: FormulaRow) => {
    if (row.latestRunSummary?.runId) {
      navigate(`/formulas/${row.formula.id}/results/${row.latestRunSummary.runId}`);
      return;
    }
    navigate(`/formulas/${row.formula.id}`);
  };

  return (
    <div className="ps-portfolio">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold tracking-widest text-[var(--ps-ink-3)] uppercase">Portfolio</p>
          <h1 className="text-[28px] font-semibold text-[var(--ps-ink)]">Formula Library</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--ps-ink-2)]">
            Every formula gets a pre-check here before it goes to the ACMI toxicologist at Duke.
          </p>
        </div>
        <Link
          to="/screening/new"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-[#2b43c6] px-4 text-sm font-medium text-white"
        >
          <Plus className="size-4" aria-hidden />
          New screening
        </Link>
      </header>

      <section className="ps-kpis" aria-label="Summary">
        <div className="ps-kpi">
          <div className="ps-kpi-label">
            <span className="ps-kpi-dot bg-slate-400" aria-hidden />
            In pipeline
          </div>
          <div className="ps-kpi-num">{summary?.total ?? data?.total ?? '—'}</div>
          <div className="ps-kpi-cap">formulas in development or review</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">
            <span className="ps-kpi-dot bg-ap" aria-hidden />
            Likely AP
          </div>
          <div className="ps-kpi-num">{bandCount('likelyAp')}</div>
          <div className="ps-kpi-cap">ready, or one small fix away</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">
            <span className="ps-kpi-dot bg-risk" aria-hidden />
            At risk
          </div>
          <div className="ps-kpi-num">{bandCount('atRisk')}</div>
          <div className="ps-kpi-cap">likely to need another review round</div>
        </div>
        <div className="ps-kpi">
          <div className="ps-kpi-label">
            <span className="ps-kpi-dot bg-cl" aria-hidden />
            Likely CL
          </div>
          <div className="ps-kpi-num">{bandCount('likelyCl')}</div>
          <div className="ps-kpi-cap">would need warning labels as is</div>
        </div>
      </section>

      <section className="ps-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--ps-line)] pb-3">
          <input
            className="h-9 min-w-[200px] flex-1 rounded-md border border-[var(--ps-line-2)] px-3 text-sm"
            placeholder="Search by name or code…"
            value={query}
            aria-label="Search formulas"
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <select
            className="h-9 rounded-md border border-[var(--ps-line-2)] px-2 text-sm"
            aria-label="Filter by category"
            value={categories[0] ?? ''}
            onChange={(event) => {
              setCategories(event.target.value ? [event.target.value] : []);
              setPage(1);
            }}
          >
            <option value="">All categories</option>
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="h-9 rounded-md border border-[var(--ps-line-2)] px-3 text-sm"
            onClick={() => {
              setIncludeArchived((value) => !value);
              setPage(1);
            }}
          >
            {includeArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>

        <div className="ps-panel-head">
          <h2>All formulas</h2>
          <div className="ps-filters" role="group" aria-label="Filter by likelihood">
            {BANDS.map((key) => (
              <button
                key={key}
                type="button"
                className={`ps-fchip ${band === key ? 'on' : ''}`}
                aria-pressed={band === key}
                onClick={() => {
                  setBand(key);
                  setPage(1);
                }}
              >
                {SCREENING_BAND_LABEL[key]}{' '}
                <span className="n">
                  {key === 'all'
                    ? summary?.total ?? data?.total ?? 0
                    : key === 'likely-ap'
                      ? bandCount('likelyAp')
                      : key === 'at-risk'
                        ? bandCount('atRisk')
                        : key === 'likely-cl'
                          ? bandCount('likelyCl')
                          : bandCount('notScreened')}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingState label="Loading formulas…" rows={6} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            variant="search"
            title="No formulas match these filters"
            message="Try a different search or band filter."
            action={
              <Link to="/screening/new" className="text-sm font-medium text-[#2b43c6] underline">
                New screening
              </Link>
            }
          />
        ) : (
          <>
            <div className="ps-tbl-wrap">
              <table className="ps-tbl">
                <caption className="sr-only">Formula library</caption>
                <thead>
                  <tr>
                    <th>Formula</th>
                    <th>Category</th>
                    <th>Ages</th>
                    <th>Stage</th>
                    <th className="num">AP likelihood</th>
                    <th>Top issue</th>
                    <th>Updated</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => {
                    const score = formatLibraryScore(row.latestRunSummary);
                    const tone = scoreTone(row.latestRunSummary);
                    const hasRun = Boolean(row.latestRunSummary?.runId);
                    return (
                      <tr key={row.formula.id} onClick={() => openRow(row)}>
                        <td>
                          <div className="ps-fcell">
                            <span
                              className="ps-sw"
                              style={{ backgroundColor: row.formula.productColor ?? '#3B82F6' }}
                              aria-hidden
                            />
                            <div className="min-w-0">
                              <div className="truncate font-medium text-[var(--ps-ink)]">{row.formula.name}</div>
                              <div className="ps-mono ps-muted truncate">
                                {row.formula.formulaCode || row.formula.id}
                                {row.latestRunSummary?.outdated ? ' · Outdated' : ''}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>{row.formula.category}</td>
                        <td>{formatAge(row.formula)}</td>
                        <td>{formatStage(row.formula)}</td>
                        <td className="num">
                          {score.barWidth != null ? (
                            <>
                              <div className="ps-lk">
                                <div className="ps-lk-bar">
                                  <i className={`bg-${tone}`} style={{ width: `${score.barWidth}%` }} />
                                </div>
                                <span className="font-semibold tabular-nums">{score.text}</span>
                              </div>
                              <div className={`text-[11px] tx-${tone}`}>
                                {row.latestRunSummary?.scoreLabel ?? (tone === 'ap' ? 'Likely AP' : tone === 'risk' ? 'At risk' : tone === 'cl' ? 'Likely CL' : 'Not screened')}
                              </div>
                            </>
                          ) : (
                            <span className="ps-muted">—</span>
                          )}
                        </td>
                        <td className="ps-issue ps-muted">{topIssueLabel(row.latestRunSummary, hasRun)}</td>
                        <td className="ps-muted whitespace-nowrap">{formatUpdated(row.formula.updatedAt)}</td>
                        <td>
                          <RowActions
                            row={row}
                            onOpen={() => navigate(`/formulas/${row.formula.id}`)}
                            onOpenResult={() =>
                              row.latestRunSummary?.runId &&
                              navigate(`/formulas/${row.formula.id}/results/${row.latestRunSummary.runId}`)
                            }
                            onDuplicate={() => void duplicate.run(row.formula)}
                            onDuplicateVersion={() => void duplicateVersion.run(row.formula)}
                            onArchive={() => setArchiveTarget(row.formula)}
                            onRestore={() => void restore.run(row.formula)}
                            onDelete={() => setDeleteTarget(row.formula)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={data.page}
              pageCount={data.pageCount}
              total={data.total}
              pageSize={data.pageSize}
              onPageChange={setPage}
              itemLabel="formulas"
            />
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive this formula?"
        body={
          <>
            <strong>{archiveTarget?.name}</strong> will be hidden from the default library view. Screening runs are kept.
          </>
        }
        confirmLabel="Archive formula"
        pending={archive.pending}
        onCancel={() => setArchiveTarget(undefined)}
        onConfirm={() => archiveTarget && void archive.run(archiveTarget)}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete this archived formula?"
        body={
          <>
            <strong>{deleteTarget?.name}</strong> will be removed permanently. This cannot be undone.
          </>
        }
        confirmLabel="Delete formula"
        pending={remove.pending}
        onCancel={() => setDeleteTarget(undefined)}
        onConfirm={() => deleteTarget && void remove.run(deleteTarget)}
      />
    </div>
  );
}
