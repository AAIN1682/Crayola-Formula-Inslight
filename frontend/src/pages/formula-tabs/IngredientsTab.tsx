import { Link } from 'react-router-dom';
import { AlertTriangle, Download } from 'lucide-react';
import { useFormulaDetail } from '../FormulaDetailsPage';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { CompositionChart } from '../../components/charts/CompositionChart';
import { Notice } from '../../components/ui/DemoNotice';
import { PrimaryCell, TBody, Table, TableScroll, Td, Th, THead, Tr } from '../../components/ui/Table';
import { downloadCsv, timestampedFilename } from '../../utils/export';
import { formatConcentration } from '../../utils/formatting';
import { CONCENTRATION_TOLERANCE, sumConcentrations, isTotalWithinTolerance } from '../../utils/validation';
import { useToast } from '../../components/ui/Toast';
import { formulationMaterial } from '../../data/formulationMaterials';
import type { Ingredient } from '../../types/domain';

const CAS_SUFFIX = /\s+—\s+(\d{2,7}-\d{2}-\d)$/;

function ingredientType(ingredient: Ingredient) {
  return ingredient.compositionType || formulationMaterial(ingredient.rawMaterialId ?? '')?.materialType || '';
}

function ingredientCas(ingredient: Ingredient) {
  return formulationMaterial(ingredient.rawMaterialId ?? '')?.casNumber || ingredient.name.match(CAS_SUFFIX)?.[1] || '';
}

export function IngredientsTab() {
  const detail = useFormulaDetail();
  const toast = useToast();
  const { formula, evidence } = detail;

  const counted = formula.ingredients.filter((ingredient) => ingredient.screeningRole !== 'contaminant_analyte' && ingredient.measurementKind !== 'content' && ingredient.measurementKind !== 'migration');
  const total = sumConcentrations(counted);
  const requiresBalance = formula.compositionCompleteness === 'complete';
  const balanced = !requiresBalance || isTotalWithinTolerance(total);

  const requirementsFor = (ingredientId: string) =>
    evidence.requirements.filter((requirement) => requirement.ingredientId === ingredientId);

  const exportIngredients = () => {
    downloadCsv(
      timestampedFilename(`${formula.id}-ingredients`, 'csv'),
      formula.ingredients,
      [
        { header: 'Ingredient', value: (row) => row.name.replace(CAS_SUFFIX, '') },
        { header: 'Ingredient type', value: (row) => ingredientType(row) },
        { header: 'CAS number', value: (row) => ingredientCas(row) },
        { header: 'Raw material', value: (row) => row.rawMaterialId ?? 'Not linked' },
        { header: '% W/W', value: (row) => row.concentration },
        { header: 'Supplier', value: (row) => row.supplier ?? '' },
        {
          header: 'Evidence complete',
          value: (row) => {
            const requirements = requirementsFor(row.id);
            if (requirements.length === 0) return 'No requirements';
            return `${requirements.filter((item) => item.satisfied).length}/${requirements.length}`;
          },
        },
        { header: 'Note', value: (row) => row.notes ?? '' },
      ],
    );
    toast.success('CSV downloaded', `${formula.ingredients.length} ingredient rows exported.`);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Ingredients"
            description={`${formula.ingredients.length} rows · composition total ${formatConcentration(total)}`}
            actions={
              <Button size="sm" onClick={exportIngredients} icon={<Download aria-hidden className="size-4" />}>
                Export CSV
              </Button>
            }
          />
          <TableScroll>
            <Table caption={`Ingredients for ${formula.name}`}>
              <THead>
                <tr>
                  <Th>Ingredient</Th>
                  <Th>Type</Th>
                  <Th>CAS number</Th>
                  <Th>Raw material</Th>
                  <Th className="text-right">% W/W</Th>
                  <Th>Supplier</Th>
                  <Th>Evidence</Th>
                </tr>
              </THead>
              <TBody>
                {formula.ingredients.map((ingredient) => {
                  const requirements = requirementsFor(ingredient.id);
                  const satisfied = requirements.filter((requirement) => requirement.satisfied).length;
                  const incomplete = !ingredient.rawMaterialId;
                  const unmapped = Boolean(ingredient.rawMaterialId && !/^[a-z][a-z0-9_]*$/.test(ingredient.rawMaterialId));
                  return (
                    <Tr key={ingredient.id} className={incomplete || unmapped ? 'bg-warning-soft/40' : undefined}>
                      <Td>
                        <PrimaryCell
                          title={
                            <span className="flex items-center gap-2">
                              {ingredient.name.replace(CAS_SUFFIX, '')}
                              {ingredient.addedInVersion === formula.version ? (
                                <Badge tone="info">New in {formula.version}</Badge>
                              ) : null}
                            </span>
                          }
                          subtitle={ingredient.notes}
                        />
                      </Td>
                      <Td className="text-muted">{ingredientType(ingredient) || '—'}</Td>
                      <Td className="whitespace-nowrap text-muted tabular">{ingredientCas(ingredient) || '—'}</Td>
                      <Td>
                        {unmapped ? (
                          <Badge tone="warning" icon={<AlertTriangle aria-hidden className="size-3.5" />}>
                            {ingredient.rawMaterialId} · remapping required
                          </Badge>
                        ) : ingredient.rawMaterialId ? (
                          <Link to={`/materials/${ingredient.rawMaterialId}`} className="fi-link tabular">
                            {ingredient.rawMaterialId}
                          </Link>
                        ) : (
                          <Badge tone="warning" icon={<AlertTriangle aria-hidden className="size-3.5" />}>
                            Not linked
                          </Badge>
                        )}
                      </Td>
                      <Td className="text-right tabular">{formatConcentration(ingredient.concentration)}</Td>
                      <Td className="text-muted">{ingredient.supplier ?? '—'}</Td>
                      <Td>
                        {requirements.length === 0 ? (
                          <span className="text-xs text-muted">Not verified</span>
                        ) : (
                          <Badge tone="neutral">
                            {satisfied}/{requirements.length} linked
                          </Badge>
                        )}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
              <tfoot className="border-t border-line bg-canvas/70">
                <tr>
                  <td className="px-4 py-2.5 text-[13px] font-medium text-ink" colSpan={4}>
                    Composition total
                  </td>
                  <td className="px-4 py-2.5 text-right text-[13px] font-semibold tabular">
                    <span className={balanced ? 'text-success' : 'text-warning'}>
                      {formatConcentration(total)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted" colSpan={2}>
                    {requiresBalance
                      ? balanced
                        ? `Within the shared ±${CONCENTRATION_TOLERANCE}% tolerance. Contaminants are excluded.`
                        : `Outside the shared ±${CONCENTRATION_TOLERANCE}% tolerance. Contaminants are excluded.`
                      : `Partial composition totals ${formatConcentration(total)}. A complete list must reach 100% within ±${CONCENTRATION_TOLERANCE}%.`}
                  </td>
                </tr>
              </tfoot>
            </Table>
          </TableScroll>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Composition" description="By recorded concentration." />
            <CardBody>
              <CompositionChart ingredients={formula.ingredients} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Intended use" />
            <CardBody className="space-y-3">
              <p className="text-[13px] leading-6 text-ink">{formula.intendedUse || 'Not recorded yet.'}</p>
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <div>
                  <dt className="text-xs text-muted">Physical form</dt>
                  <dd className="text-ink">{formula.physicalForm}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Intended age group</dt>
                  <dd className="text-ink">{formula.ageGroup}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>

      {formula.ingredients.some((ingredient) => !ingredient.rawMaterialId || (ingredient.rawMaterialId && !/^[a-z][a-z0-9_]*$/.test(ingredient.rawMaterialId))) ? (
        <Notice tone="warning" title="Some ingredient identities are unresolved">
          Highlighted rows are not in the US/EU catalog branch. An assessment keeps them and records a coverage gap for each one. Names are not matched by similarity.
        </Notice>
      ) : null}
    </div>
  );
}
