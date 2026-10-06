import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Download } from 'lucide-react';
import type { ProductCategory, SubmissionOutcome } from '../types/domain';
import { PRODUCT_CATEGORIES } from '../types/domain';
import type { SubmissionFilters } from '../types/services';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDemoSelector, useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ActiveFilterChip, FilterBar, MultiSelectFilter, SearchInput } from '../components/ui/Filters';
import { PrimaryCell, TBody, Table, TableScroll, Td, Th, THead, Tr } from '../components/ui/Table';
import { OutcomeBadge, Badge } from '../components/ui/Badge';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Drawer } from '../components/ui/Drawer';
import { Select } from '../components/ui/Field';
import { Notice } from '../components/ui/DemoNotice';
import { FormulaComparisonView } from '../components/formulas/FormulaComparisonView';
import { useToast } from '../components/ui/Toast';
import { downloadCsv, timestampedFilename } from '../utils/export';
import { formatDate, formatDateTime } from '../utils/formatting';
import { cn } from '../utils/cn';

const OUTCOMES: SubmissionOutcome[] = ['AP', 'CL', 'More Data Needed'];

const PERIOD_OPTIONS = [
  { value: '0', label: 'All periods' },
  { value: '6', label: 'Last 6 months' },
  { value: '12', label: 'Last 12 months' },
  { value: '24', label: 'Last 24 months' },
];

function SubmissionDrawer({
  submissionId,
  onClose,
}: {
  submissionId: string;
  onClose: () => void;
}) {
  const services = useServices();
  const formulas = useDemoSelector((state) => state.formulas);
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'detail' | 'compare'>(searchParams.get('compare') ? 'compare' : 'detail');
  const [compareFormulaId, setCompareFormulaId] = useState('');

  const { data, loading, error, reload } = useAsyncData(
    () => services.getSubmission(submissionId),
    [submissionId],
  );

  useEffect(() => {
    const requested = searchParams.get('compare');
    if (requested) {
      setCompareFormulaId(requested);
      setTab('compare');
    } else if (data?.currentFormula) {
      setCompareFormulaId((current) => current || (data.currentFormula?.id ?? ''));
    }
  }, [searchParams, data?.currentFormula]);

  const comparison = useAsyncData(
    () =>
      compareFormulaId
        ? services.compareFormulas(compareFormulaId, submissionId)
        : Promise.resolve(undefined),
    [compareFormulaId, submissionId],
  );

  const submission = data?.submission;

  return (
    <Drawer
      open
      onClose={() => {
        if (searchParams.get('compare')) setSearchParams({}, { replace: true });
        onClose();
      }}
      width="xl"
      eyebrow="Historical submission"
      title={submission ? `${submission.id} — ${submission.formulaName}` : submissionId}
      subtitle={
        submission
          ? `${submission.version} · submitted ${formatDate(submission.submittedAt)} · recorded outcome ${submission.outcome}`
          : undefined
      }
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : loading && !data ? (
        <LoadingState label="Loading submission…" rows={5} />
      ) : !submission ? null : (
        <div className="space-y-5">
          <div className="flex gap-1 border-b border-line">
            {(
              [
                ['detail', 'Submission detail'],
                ['compare', 'Compare with current formula'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                aria-current={tab === value ? 'true' : undefined}
                className={cn(
                  '-mb-px border-b-2 px-3 py-2 text-[13px] font-medium transition-colors',
                  tab === value
                    ? 'border-brand-500 text-brand-500'
                    : 'border-transparent text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'detail' ? (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                {[
                  ['Recorded outcome', submission.outcome],
                  ['Review rounds', String(submission.reviewRounds)],
                  ['Category', submission.category],
                  ['Closed', submission.closedAt ? formatDate(submission.closedAt) : '—'],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-lg border border-line bg-canvas/60 p-3">
                    <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">{label}</p>
                    <p className="mt-0.5 text-[13px] font-medium text-ink">{value}</p>
                  </div>
                ))}
              </div>

              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Submitted formula snapshot</h3>
                <TableScroll minWidth="min-w-[420px]">
                  <Table caption="Submitted composition">
                    <THead>
                      <tr>
                        <Th>Ingredient</Th>
                        <Th>Raw material</Th>
                        <Th className="text-right">Concentration</Th>
                      </tr>
                    </THead>
                    <TBody>
                      {submission.snapshot.map((row) => (
                        <Tr key={`${row.name}-${row.rawMaterialId ?? ''}`}>
                          <Td className="font-medium">{row.name}</Td>
                          <Td className="text-muted tabular">
                            {row.rawMaterialId ? (
                              <Link to={`/materials/${row.rawMaterialId}`} className="fi-link">
                                {row.rawMaterialId}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </Td>
                          <Td className="text-right tabular">{row.concentration}%</Td>
                        </Tr>
                      ))}
                    </TBody>
                  </Table>
                </TableScroll>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Timeline</h3>
                <ol className="space-y-0">
                  {submission.timeline.map((entry, index) => (
                    <li key={`${entry.date}-${entry.label}`} className="flex gap-3 pb-4 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span
                          className="mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-brand-400 bg-surface"
                          aria-hidden
                        />
                        {index < submission.timeline.length - 1 ? (
                          <span className="my-1 w-px flex-1 bg-line" aria-hidden />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-ink">{entry.label}</p>
                        <p className="text-[13px] text-muted">{entry.detail}</p>
                        <p className="text-xs text-subtle tabular">{formatDateTime(entry.date)}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Reviewer correspondence</h3>
                <ul className="space-y-2.5">
                  {submission.correspondence.map((message) => (
                    <li key={message.id} className="rounded-lg border border-line bg-surface p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-[13px] font-medium text-ink">{message.subject}</p>
                        <span className="text-xs text-muted tabular">{formatDate(message.date)}</span>
                      </div>
                      <p className="text-xs text-subtle">{message.from}</p>
                      <p className="mt-1.5 text-[13px] leading-6 text-muted">{message.body}</p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-subtle">
                  Synthetic correspondence generated for the demo history. No message was sent or received.
                </p>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Requested changes</h3>
                <ul className="list-disc space-y-1 pl-5 text-[13px] leading-6 text-muted">
                  {submission.requestedChanges.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="mb-2 text-[13px] font-semibold text-ink">Associated evidence</h3>
                {data.documents.length === 0 ? (
                  <p className="text-[13px] text-muted">No documents are linked to this submission.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.documents.map((document) => (
                      <li
                        key={document.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line px-3 py-2"
                      >
                        <span className="min-w-0 text-[13px] text-ink">{document.title}</span>
                        <Badge tone="neutral">{document.type}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex-1" htmlFor="compare-formula">
                  <span className="mb-1.5 block text-[13px] font-medium text-ink">
                    Compare against which current formula?
                  </span>
                  <Select
                    id="compare-formula"
                    value={compareFormulaId}
                    placeholder="Select a formula"
                    options={formulas.map((formula) => ({
                      value: formula.id,
                      label: `${formula.name} ${formula.version} (${formula.id})`,
                    }))}
                    onChange={(event) => setCompareFormulaId(event.target.value)}
                  />
                </label>
              </div>

              {!compareFormulaId ? (
                <EmptyState
                  variant="search"
                  title="Choose a formula to compare"
                  message="Pick any current formula to see shared, added, removed and concentration-changed ingredients."
                />
              ) : comparison.error ? (
                <ErrorState message={comparison.error} onRetry={comparison.reload} />
              ) : comparison.loading && !comparison.data ? (
                <LoadingState label="Building comparison…" rows={4} />
              ) : comparison.data ? (
                <FormulaComparisonView comparison={comparison.data} />
              ) : null}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function SubmissionHistoryPage() {
  const services = useServices();
  const navigate = useNavigate();
  const toast = useToast();
  const { submissionId } = useParams();

  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [outcomes, setOutcomes] = useState<string[]>([]);
  const [period, setPeriod] = useState('0');

  const filters = useMemo<SubmissionFilters>(
    () => ({
      query,
      categories: categories as ProductCategory[],
      outcomes: outcomes as SubmissionOutcome[],
      periodMonths: Number(period),
    }),
    [query, categories, outcomes, period],
  );

  const { data, loading, error, reload } = useAsyncData(() => services.listSubmissions(filters), [filters]);

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(timestampedFilename('submission-history', 'csv'), data, [
      { header: 'Submission ID', value: (row) => row.id },
      { header: 'Formula', value: (row) => row.formulaName },
      { header: 'Version', value: (row) => row.version },
      { header: 'Category', value: (row) => row.category },
      { header: 'Submitted', value: (row) => formatDate(row.submittedAt) },
      { header: 'Recorded outcome', value: (row) => row.outcome },
      { header: 'Review rounds', value: (row) => row.reviewRounds },
      { header: 'Main feedback theme', value: (row) => row.feedbackTheme },
    ]);
    toast.success('CSV downloaded', `${data.length} filtered submissions exported.`);
  };

  const activeFilters = [
    ...categories.map((value) => ({
      label: `Category: ${value}`,
      clear: () => setCategories((current) => current.filter((item) => item !== value)),
    })),
    ...outcomes.map((value) => ({
      label: `Outcome: ${value}`,
      clear: () => setOutcomes((current) => current.filter((item) => item !== value)),
    })),
    ...(period !== '0'
      ? [
          {
            label: PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? period,
            clear: () => setPeriod('0'),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Submission History"
        description="Synthetic record of past external submissions and the feedback they received. These are historical external outcomes — separate from the internal screening and review statuses tracked elsewhere."
        actions={
          <Button onClick={exportCsv} disabled={!data || data.length === 0} icon={<Download aria-hidden className="size-4" />}>
            Export CSV
          </Button>
        }
      />

      <Notice tone="neutral" title="Recorded outcomes describe the composition that was submitted">
        AP, CL and More Data Needed are outcomes recorded against a specific historical composition in this
        demo dataset. A historical acceptance does not establish acceptance of a modified formula.
      </Notice>

      <Card>
        <FilterBar>
          <SearchInput
            value={query}
            onChange={setQuery}
            label="Search submissions"
            placeholder="Search by submission ID, formula or theme…"
            className="w-full sm:w-72"
          />
          <MultiSelectFilter
            label="Category"
            options={PRODUCT_CATEGORIES.map((category) => ({ value: category, label: category }))}
            selected={categories}
            onChange={setCategories}
            width="w-44"
          />
          <MultiSelectFilter
            label="Outcome"
            options={OUTCOMES.map((outcome) => ({ value: outcome, label: outcome }))}
            selected={outcomes}
            onChange={setOutcomes}
            width="w-52"
          />
          <Select
            aria-label="Submission period"
            className="w-44"
            value={period}
            options={PERIOD_OPTIONS}
            onChange={(event) => setPeriod(event.target.value)}
          />
        </FilterBar>

        {activeFilters.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-2.5">
            <span className="text-xs text-muted">Active filters:</span>
            {activeFilters.map((filter) => (
              <ActiveFilterChip key={filter.label} label={filter.label} onRemove={filter.clear} />
            ))}
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategories([]);
                setOutcomes([]);
                setPeriod('0');
              }}
              className="ml-1 text-xs font-medium text-brand-500 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : null}

        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingState label="Loading submissions…" rows={6} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            variant="search"
            title="No submissions match these filters"
            message="Adjust the filters to see more of the synthetic submission history."
          />
        ) : (
          <TableScroll>
            <Table caption="Historical submissions">
              <THead>
                <tr>
                  <Th>Submission</Th>
                  <Th>Formula</Th>
                  <Th>Submitted</Th>
                  <Th>Recorded outcome</Th>
                  <Th className="text-right">Rounds</Th>
                  <Th>Main feedback theme</Th>
                  <Th className="text-right">Details</Th>
                </tr>
              </THead>
              <TBody>
                {data.map((submission) => (
                  <Tr key={submission.id} onClick={() => navigate(`/submissions/${submission.id}`)}>
                    <Td className="font-medium tabular">{submission.id}</Td>
                    <Td>
                      <PrimaryCell
                        title={submission.formulaName}
                        subtitle={`${submission.version} · ${submission.category}`}
                      />
                    </Td>
                    <Td className="whitespace-nowrap text-muted tabular">
                      {formatDate(submission.submittedAt)}
                    </Td>
                    <Td>
                      <OutcomeBadge outcome={submission.outcome} />
                    </Td>
                    <Td className="text-right tabular">{submission.reviewRounds}</Td>
                    <Td className="max-w-[240px] text-muted">{submission.feedbackTheme}</Td>
                    <Td className="text-right">
                      <Link
                        to={`/submissions/${submission.id}`}
                        onClick={(event) => event.stopPropagation()}
                        className="fi-link inline-flex items-center gap-1 text-[13px] font-medium"
                      >
                        Open
                        <ArrowRight aria-hidden className="size-3.5" />
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        )}
      </Card>

      {submissionId ? (
        <SubmissionDrawer submissionId={submissionId} onClose={() => navigate('/submissions')} />
      ) : null}
    </div>
  );
}
