import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Archive, Copy, MoreHorizontal, Plus, SquareArrowOutUpRight } from 'lucide-react';
import type { Formula, ProductCategory, ReviewStatus, ScreeningStatus } from '../types/domain';
import { PRODUCT_CATEGORIES } from '../types/domain';
import type { FormulaFilters, FormulaRow, FormulaSortKey, SortDirection } from '../types/services';
import { useAsyncData, useAsyncAction } from '../hooks/useAsyncData';
import { useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ActiveFilterChip, FilterBar, MultiSelectFilter, SearchInput } from '../components/ui/Filters';
import {
  PrimaryCell,
  SortableTh,
  TBody,
  Table,
  TableScroll,
  Td,
  Th,
  THead,
  Tr,
} from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { ScreeningBadge } from '../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { FormulaFormDrawer } from '../components/formulas/FormulaFormDrawer';
import { SCREENING_STATUS_LABEL } from '../utils/formatting';

const SCREENING_OPTIONS: ScreeningStatus[] = ['green', 'amber', 'red', 'not-screened'];
const PENDING_REVIEW: ReviewStatus[] = ['not-started', 'in-review', 'awaiting-evidence', 'returned'];

function RowActions({
  row,
  onOpen,
  onDuplicate,
  onArchive,
}: {
  row: FormulaRow;
  onOpen: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
}) {
  const [open, setOpen] = useState(false);

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
        className="flex size-8 items-center justify-center rounded-lg border border-transparent text-muted transition-colors hover:border-line hover:bg-surface hover:text-ink"
      >
        <MoreHorizontal aria-hidden className="size-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="fi-animate-in absolute top-full right-0 z-30 mt-1 w-44 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-raised"
        >
          <button
            type="button"
            role="menuitem"
            onClick={onOpen}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-brand-50"
          >
            <SquareArrowOutUpRight aria-hidden className="size-3.5 text-muted" />
            Open
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onDuplicate}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink transition-colors hover:bg-brand-50"
          >
            <Copy aria-hidden className="size-3.5 text-muted" />
            Duplicate
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={onArchive}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-danger transition-colors hover:bg-danger-soft"
          >
            <Archive aria-hidden className="size-3.5" />
            Archive
          </button>
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

  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [screeningStatuses, setScreeningStatuses] = useState<string[]>([]);
  const [onlyMissingEvidence, setOnlyMissingEvidence] = useState(false);
  const [onlyPendingReview, setOnlyPendingReview] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sortKey, setSortKey] = useState<FormulaSortKey>('updatedAt');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [page, setPage] = useState(1);

  const [formOpen, setFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Formula | undefined>();

  /* Deep links from Overview metric cards pre-apply a filter. */
  useEffect(() => {
    const screening = searchParams.get('screening');
    const review = searchParams.get('review');
    const evidence = searchParams.get('evidence');
    if (screening) setScreeningStatuses([screening]);
    if (evidence === 'missing') setOnlyMissingEvidence(true);
    if (review === 'pending') setOnlyPendingReview(true);
    if (screening || review || evidence) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const filters = useMemo<FormulaFilters>(
    () => ({
      query,
      categories: categories as ProductCategory[],
      screeningStatuses: screeningStatuses as ScreeningStatus[],
      reviewStatuses: onlyPendingReview ? PENDING_REVIEW : undefined,
      onlyMissingEvidence,
      lifecycle: includeArchived ? ['draft', 'active', 'archived'] : undefined,
      sortKey,
      sortDirection,
      page,
      pageSize: 10,
    }),
    [
      query,
      categories,
      screeningStatuses,
      onlyMissingEvidence,
      onlyPendingReview,
      includeArchived,
      sortKey,
      sortDirection,
      page,
    ],
  );

  const { data, loading, error, reload } = useAsyncData(() => services.listFormulas(filters), [filters]);

  const handleSort = useCallback(
    (key: FormulaSortKey) => {
      setPage(1);
      if (key === sortKey) {
        setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDirection(key === 'updatedAt' ? 'desc' : 'asc');
      }
    },
    [sortKey],
  );

  const duplicate = useAsyncAction(async (formula: Formula) => {
    const copy = await services.duplicateFormula(formula.id);
    toast.success('Formula duplicated', `${copy.name} was created as a draft.`);
    navigate(`/formulas/${copy.id}`);
  });

  const archive = useAsyncAction(async (formula: Formula) => {
    await services.archiveFormula(formula.id);
    setArchiveTarget(undefined);
    toast.success('Formula archived', `${formula.name} is hidden from the default library view.`);
  });

  const activeFilters = [
    ...categories.map((value) => ({
      label: `Category: ${value}`,
      clear: () => setCategories((v) => v.filter((x) => x !== value)),
    })),
    ...screeningStatuses.map((value) => ({
      label: `Screening: ${SCREENING_STATUS_LABEL[value as ScreeningStatus]}`,
      clear: () => setScreeningStatuses((v) => v.filter((x) => x !== value)),
    })),
    ...(onlyMissingEvidence
      ? [{ label: 'Missing evidence only', clear: () => setOnlyMissingEvidence(false) }]
      : []),
    ...(onlyPendingReview ? [{ label: 'Review not complete', clear: () => setOnlyPendingReview(false) }] : []),
    ...(includeArchived ? [{ label: 'Including archived', clear: () => setIncludeArchived(false) }] : []),
  ];

  const clearAll = () => {
    setQuery('');
    setCategories([]);
    setScreeningStatuses([]);
    setOnlyMissingEvidence(false);
    setOnlyPendingReview(false);
    setIncludeArchived(false);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Formula Library"
        description="Formulas with assessment status."
        actions={
          <Button variant="primary" onClick={() => setFormOpen(true)} icon={<Plus aria-hidden className="size-4" />}>
            New Formula
          </Button>
        }
      />

      <Card>
        <FilterBar>
          <SearchInput
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            label="Search formulas by name or ID"
            placeholder="Search by formula name or ID…"
            className="w-full sm:w-72"
          />
          <MultiSelectFilter
            label="Category"
            options={PRODUCT_CATEGORIES.map((category) => ({ value: category, label: category }))}
            selected={categories}
            onChange={(values) => {
              setCategories(values);
              setPage(1);
            }}
            width="w-44"
          />
          <MultiSelectFilter
            label="Screening"
            options={SCREENING_OPTIONS.map((status) => ({ value: status, label: SCREENING_STATUS_LABEL[status] }))}
            selected={screeningStatuses}
            onChange={(values) => {
              setScreeningStatuses(values);
              setPage(1);
            }}
            width="w-44"
          />
          <Button
            size="sm"
            variant={includeArchived ? 'subtle' : 'ghost'}
            onClick={() => {
              setIncludeArchived((value) => !value);
              setPage(1);
            }}
          >
            {includeArchived ? 'Hide archived' : 'Show archived'}
          </Button>
        </FilterBar>

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
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
        ) : !data || data.items.length === 0 ? (
          <EmptyState
            variant="search"
            title="No formulas match these filters"
            message="Try a different search term, or clear the filters to see the whole library."
            action={
              <div className="flex items-center gap-2">
                <Button onClick={clearAll}>Clear filters</Button>
                <Button variant="primary" onClick={() => setFormOpen(true)}>
                  New Formula
                </Button>
              </div>
            }
          />
        ) : (
          <>
            <TableScroll>
              <Table caption="Formula library">
                <THead>
                  <tr>
                    <SortableTh columnKey="name" activeKey={sortKey} direction={sortDirection} onSort={handleSort}>
                      Formula
                    </SortableTh>
                    <SortableTh columnKey="version" activeKey={sortKey} direction={sortDirection} onSort={handleSort}>
                      Version
                    </SortableTh>
                    <SortableTh
                      columnKey="screeningStatus"
                      activeKey={sortKey}
                      direction={sortDirection}
                      onSort={handleSort}
                    >
                      Screening
                    </SortableTh>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </THead>
                <TBody>
                  {data.items.map((row) => (
                    <Tr key={row.formula.id} onClick={() => navigate(`/formulas/${row.formula.id}`)}>
                      <Td>
                        <PrimaryCell title={row.formula.name} subtitle={row.formula.id} />
                      </Td>
                      <Td className="whitespace-nowrap tabular">{row.formula.version}</Td>
                      <Td>
                        <ScreeningBadge
                          status={row.formula.screeningStatus}
                          current={row.formula.screeningCurrent}
                        />
                      </Td>
                      <Td>
                        <RowActions
                          row={row}
                          onOpen={() => navigate(`/formulas/${row.formula.id}`)}
                          onDuplicate={() => void duplicate.run(row.formula)}
                          onArchive={() => setArchiveTarget(row.formula)}
                        />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </TableScroll>

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
      </Card>

      <FormulaFormDrawer
        open={formOpen}
        mode="create"
        onClose={() => setFormOpen(false)}
        onSaved={(formula) => navigate(`/formulas/${formula.id}`)}
      />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archive this formula?"
        body={
          <>
            <strong>{archiveTarget?.name}</strong> will be hidden from the default library view. You can bring
            it back with the “Show archived” control. Its screening runs are kept.
          </>
        }
        confirmLabel="Archive formula"
        pending={archive.pending}
        onCancel={() => setArchiveTarget(undefined)}
        onConfirm={() => archiveTarget && void archive.run(archiveTarget)}
      />
    </div>
  );
}
