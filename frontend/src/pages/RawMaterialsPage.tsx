import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Download, Eye } from 'lucide-react';
import type { RawMaterialFilters } from '../types/services';
import { useAsyncData } from '../hooks/useAsyncData';
import { useDemoSelector, useServices } from '../state/DemoDataProvider';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ActiveFilterChip, FilterBar, MultiSelectFilter, SearchInput } from '../components/ui/Filters';
import { PrimaryCell, TBody, Table, TableScroll, Td, Th, THead, Tr } from '../components/ui/Table';
import { Badge, DocumentStatusBadge, OutcomeBadge } from '../components/ui/Badge';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States';
import { Notice } from '../components/ui/DemoNotice';
import { DocumentPreviewDrawer } from '../components/evidence/DocumentPreviewDrawer';
import { useToast } from '../components/ui/Toast';
import { downloadCsv, timestampedFilename } from '../utils/export';
import { formatConcentration, formatDate } from '../utils/formatting';

function CompletenessBar({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-neutral-soft" aria-hidden>
        <span
          className={value === 100 ? 'block h-full bg-success' : 'block h-full bg-warning'}
          style={{ width: `${value}%` }}
        />
      </span>
      <span className="text-[13px] text-ink tabular">{value}%</span>
    </span>
  );
}

function MaterialDrawer({ materialId, onClose }: { materialId: string; onClose: () => void }) {
  const services = useServices();
  const [previewId, setPreviewId] = useState<string | undefined>();
  const { data, loading, error, reload } = useAsyncData(
    () => services.getRawMaterial(materialId),
    [materialId],
  );

  const material = data?.material;

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="lg"
        eyebrow="Raw material"
        title={material?.name ?? materialId}
        subtitle={material ? `${material.id} · ${material.supplier} · ${material.role}` : undefined}
        footer={<Button onClick={onClose}>Close</Button>}
      >
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingState label="Loading material…" rows={4} />
        ) : !material || !data ? null : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{material.role}</Badge>
              <Badge tone="neutral">
                Used in {material.usageCount} active {material.usageCount === 1 ? 'formula' : 'formulas'}
              </Badge>
              {material.requiresExpertAssessment ? (
                <Badge tone="danger">Routed to expert assessment</Badge>
              ) : null}
              {material.demoConcentrationCeiling !== undefined ? (
                <Badge tone="warning" title="Internal demo threshold, not a regulatory limit">
                  Demo ceiling {material.demoConcentrationCeiling}%
                </Badge>
              ) : null}
            </div>

            <section>
              <h3 className="text-[13px] font-semibold text-ink">Summary</h3>
              <p className="mt-1 text-[13px] leading-6 text-muted">{material.summary}</p>
              <p className="mt-1.5 text-[13px] leading-6 text-muted">{material.usageNote}</p>
            </section>

            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Evidence completeness</h3>
              <CompletenessBar value={material.evidenceCompleteness} />
              {data.gaps.length > 0 ? (
                <ul className="mt-2.5 list-disc space-y-1 pl-5 text-[13px] leading-6 text-warning">
                  {data.gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-[13px] text-success">
                  No evidence gaps were found for this material.
                </p>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Documents</h3>
              {data.documents.length === 0 ? (
                <p className="text-[13px] text-muted">No documents are recorded for this material.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {data.documents.map((document) => (
                    <li
                      key={document.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-ink">{document.title}</p>
                        <p className="text-xs text-muted tabular">
                          {document.type} · {formatDate(document.issuedDate)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <DocumentStatusBadge status={document.status} />
                        <Button size="sm" variant="ghost" onClick={() => setPreviewId(document.id)}>
                          <Eye aria-hidden className="size-4" />
                          Preview
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Linked formulas</h3>
              {data.usedIn.length === 0 ? (
                <p className="text-[13px] text-muted">This material is not used in any current formula.</p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {data.usedIn.map((usage) => (
                    <li
                      key={usage.formulaId}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <Link to={`/formulas/${usage.formulaId}`} className="fi-link text-[13px] font-medium">
                        {usage.formulaName} {usage.version}
                      </Link>
                      <span className="text-[13px] text-muted tabular">
                        {formatConcentration(usage.concentration)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="mb-2 text-[13px] font-semibold text-ink">Historical usage</h3>
              {data.historicalUsage.length === 0 ? (
                <p className="text-[13px] text-muted">
                  This material does not appear in any historical submission in the demo dataset.
                </p>
              ) : (
                <ul className="divide-y divide-line rounded-lg border border-line">
                  {data.historicalUsage.map((usage) => (
                    <li
                      key={usage.submissionId}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/submissions/${usage.submissionId}`}
                          className="fi-link text-[13px] font-medium"
                        >
                          {usage.formulaName}
                        </Link>
                        <p className="text-xs text-muted tabular">
                          {usage.submissionId} · {formatDate(usage.submittedAt)}
                        </p>
                      </div>
                      <OutcomeBadge outcome={usage.outcome} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Notice tone="neutral">
              Material identifiers, suppliers and thresholds in this catalog are fictional. Nothing here
              describes a verified safety property of a real material.
            </Notice>
          </div>
        )}
      </Drawer>

      <DocumentPreviewDrawer documentId={previewId} onClose={() => setPreviewId(undefined)} />
    </>
  );
}

export function RawMaterialsPage() {
  const services = useServices();
  const navigate = useNavigate();
  const toast = useToast();
  const { materialId } = useParams();
  const allMaterials = useDemoSelector((state) => state.rawMaterials);

  const [query, setQuery] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [onlyWithGaps, setOnlyWithGaps] = useState(false);

  const roleOptions = useMemo(
    () =>
      Array.from(new Set(allMaterials.map((material) => material.role)))
        .sort()
        .map((role) => ({ value: role, label: role })),
    [allMaterials],
  );

  const supplierOptions = useMemo(
    () =>
      Array.from(new Set(allMaterials.map((material) => material.supplier)))
        .sort()
        .map((supplier) => ({ value: supplier, label: supplier })),
    [allMaterials],
  );

  const filters = useMemo<RawMaterialFilters>(
    () => ({ query, roles, suppliers, onlyWithGaps }),
    [query, roles, suppliers, onlyWithGaps],
  );

  const { data, loading, error, reload } = useAsyncData(
    () => services.listRawMaterials(filters),
    [filters],
  );

  const exportCsv = () => {
    if (!data) return;
    downloadCsv(timestampedFilename('raw-materials', 'csv'), data, [
      { header: 'Material ID', value: (row) => row.id },
      { header: 'Name', value: (row) => row.name },
      { header: 'Supplier', value: (row) => row.supplier },
      { header: 'Functional role', value: (row) => row.role },
      { header: 'Documents', value: (row) => row.documentCount },
      { header: 'Available documents', value: (row) => row.availableDocumentCount },
      { header: 'Evidence completeness %', value: (row) => row.evidenceCompleteness },
      { header: 'Formulas using', value: (row) => row.usageCount },
    ]);
    toast.success('CSV downloaded', `${data.length} materials exported.`);
  };

  const activeFilters = [
    ...roles.map((value) => ({
      label: `Role: ${value}`,
      clear: () => setRoles((current) => current.filter((item) => item !== value)),
    })),
    ...suppliers.map((value) => ({
      label: `Supplier: ${value}`,
      clear: () => setSuppliers((current) => current.filter((item) => item !== value)),
    })),
    ...(onlyWithGaps ? [{ label: 'With evidence gaps', clear: () => setOnlyWithGaps(false) }] : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Raw Materials"
        description="Catalog of materials referenced by the formulas in this workspace, with the supporting documents the demo checks look for. Identifiers and suppliers are fictional."
        actions={
          <Button onClick={exportCsv} disabled={!data || data.length === 0} icon={<Download aria-hidden className="size-4" />}>
            Export CSV
          </Button>
        }
      />

      <Card>
        <FilterBar>
          <SearchInput
            value={query}
            onChange={setQuery}
            label="Search raw materials"
            placeholder="Search by material, ID or supplier…"
            className="w-full sm:w-72"
          />
          <MultiSelectFilter label="Role" options={roleOptions} selected={roles} onChange={setRoles} width="w-52" />
          <MultiSelectFilter
            label="Supplier"
            options={supplierOptions}
            selected={suppliers}
            onChange={setSuppliers}
            width="w-56"
          />
          <Button
            size="sm"
            variant={onlyWithGaps ? 'subtle' : 'ghost'}
            onClick={() => setOnlyWithGaps((value) => !value)}
          >
            {onlyWithGaps ? 'Showing gaps only' : 'Show evidence gaps only'}
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
              onClick={() => {
                setQuery('');
                setRoles([]);
                setSuppliers([]);
                setOnlyWithGaps(false);
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
          <LoadingState label="Loading raw materials…" rows={6} />
        ) : !data || data.length === 0 ? (
          <EmptyState
            variant="search"
            title="No materials match these filters"
            message="Try a different search term or clear the filters."
          />
        ) : (
          <TableScroll>
            <Table caption="Raw material catalog">
              <THead>
                <tr>
                  <Th>Material</Th>
                  <Th>Supplier</Th>
                  <Th>Functional role</Th>
                  <Th className="text-right">Documents</Th>
                  <Th>Evidence completeness</Th>
                  <Th className="text-right">Formulas using</Th>
                </tr>
              </THead>
              <TBody>
                {data.map((material) => (
                  <Tr key={material.id} onClick={() => navigate(`/materials/${material.id}`)}>
                    <Td>
                      <PrimaryCell
                        title={
                          <span className="flex flex-wrap items-center gap-2">
                            {material.name}
                            {material.requiresExpertAssessment ? (
                              <Badge tone="danger">Expert assessment</Badge>
                            ) : null}
                          </span>
                        }
                        subtitle={material.id}
                      />
                    </Td>
                    <Td className="text-muted">{material.supplier}</Td>
                    <Td className="whitespace-nowrap text-muted">{material.role}</Td>
                    <Td className="text-right tabular">
                      {material.availableDocumentCount}/{material.documentCount}
                    </Td>
                    <Td>
                      <CompletenessBar value={material.evidenceCompleteness} />
                    </Td>
                    <Td className="text-right tabular">{material.usageCount}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </TableScroll>
        )}
      </Card>

      {materialId ? (
        <MaterialDrawer materialId={materialId} onClose={() => navigate('/materials')} />
      ) : null}
    </div>
  );
}
