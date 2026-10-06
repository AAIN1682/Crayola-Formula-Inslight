import { ArrowDownRight, ArrowUpRight, Minus, Plus } from 'lucide-react';
import type { FormulaComparison, IngredientDiffKind } from '../../types/services';
import { Badge } from '../ui/Badge';
import { InfoTooltip } from '../ui/Tooltip';
import { Notice } from '../ui/DemoNotice';
import { TBody, Table, TableScroll, Td, Th, THead, Tr } from '../ui/Table';
import { formatConcentration } from '../../utils/formatting';
import { cn } from '../../utils/cn';

const KIND_META: Record<
  IngredientDiffKind,
  { label: string; tone: 'success' | 'info' | 'warning' | 'neutral'; color: string }
> = {
  shared: { label: 'Shared', tone: 'neutral', color: '#CBD5E1' },
  added: { label: 'Added', tone: 'info', color: '#2E86C1' },
  removed: { label: 'Removed', tone: 'warning', color: '#B45309' },
  changed: { label: 'Concentration changed', tone: 'warning', color: '#0D9488' },
};

/** Compact bar showing how much of the composition is shared versus changed. */
function OverlapBar({ comparison }: { comparison: FormulaComparison }) {
  const parts: { kind: IngredientDiffKind; value: number }[] = [
    { kind: 'shared', value: comparison.sharedCount - comparison.changedCount },
    { kind: 'changed', value: comparison.changedCount },
    { kind: 'added', value: comparison.addedCount },
    { kind: 'removed', value: comparison.removedCount },
  ];
  const total = parts.reduce((sum, part) => sum + Math.max(part.value, 0), 0) || 1;

  return (
    <div className="space-y-2.5">
      <div
        className="flex h-2.5 overflow-hidden rounded-full bg-neutral-soft"
        role="img"
        aria-label={parts.map((part) => `${KIND_META[part.kind].label}: ${part.value}`).join(', ')}
      >
        {parts
          .filter((part) => part.value > 0)
          .map((part) => (
            <span
              key={part.kind}
              style={{ width: `${(part.value / total) * 100}%`, backgroundColor: KIND_META[part.kind].color }}
            />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
        {parts.map((part) => (
          <li key={part.kind} className="flex items-center gap-1.5 text-xs">
            <span
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: KIND_META[part.kind].color }}
              aria-hidden
            />
            <span className="text-muted">{KIND_META[part.kind].label}</span>
            <span className="font-semibold text-ink tabular">{Math.max(part.value, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FormulaComparisonView({ comparison }: { comparison: FormulaComparison }) {
  const { currentFormula, submission, rows } = comparison;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-brand-200 bg-info-soft p-3">
          <p className="text-[11px] font-semibold tracking-wide text-brand-500 uppercase">Current formula</p>
          <p className="mt-0.5 text-[13px] font-medium text-ink">
            {currentFormula.name} {currentFormula.version}
          </p>
          <p className="text-xs text-muted tabular">
            {currentFormula.id} · {currentFormula.ingredients.length} ingredients
          </p>
        </div>
        <div className="rounded-lg border border-line bg-canvas p-3">
          <p className="text-[11px] font-semibold tracking-wide text-subtle uppercase">
            Historical submission
          </p>
          <p className="mt-0.5 text-[13px] font-medium text-ink">
            {submission.formulaName} {submission.version}
          </p>
          <p className="text-xs text-muted tabular">
            {submission.id} · {submission.snapshot.length} ingredients · recorded outcome {submission.outcome}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-line p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-ink">Composition overlap</p>
          <span className="inline-flex items-center gap-1 text-xs text-muted">
            Demo ingredient-overlap score
            <span className="font-semibold text-ink tabular">{comparison.overlapScore}%</span>
            <InfoTooltip label="How the demo ingredient-overlap score is calculated" align="right">
              Shared raw materials ÷ distinct raw materials across both records ={' '}
              {comparison.sharedCount} ÷ {comparison.distinctCount} = {comparison.overlapScore}%. It describes
              composition overlap only and says nothing about whether a formula would be accepted.
            </InfoTooltip>
          </span>
        </div>
        <OverlapBar comparison={comparison} />
      </div>

      <TableScroll minWidth="min-w-[640px]">
        <Table caption="Ingredient differences between the current formula and the historical submission">
          <THead>
            <tr>
              <Th>Ingredient</Th>
              <Th>Raw material</Th>
              <Th className="text-right">Current</Th>
              <Th className="text-right">Historical</Th>
              <Th className="text-right">Change</Th>
              <Th>Status</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((row) => (
              <Tr
                key={row.key}
                className={cn(
                  row.kind === 'added' && 'bg-info-soft/50',
                  row.kind === 'removed' && 'bg-warning-soft/40',
                  row.kind === 'changed' && 'bg-accent-50/60',
                )}
              >
                <Td className="font-medium">{row.name}</Td>
                <Td className="text-muted tabular">{row.rawMaterialId ?? '—'}</Td>
                <Td className="text-right tabular">
                  {row.currentConcentration === undefined
                    ? '—'
                    : formatConcentration(row.currentConcentration)}
                </Td>
                <Td className="text-right tabular">
                  {row.comparisonConcentration === undefined
                    ? '—'
                    : formatConcentration(row.comparisonConcentration)}
                </Td>
                <Td className="text-right tabular">
                  {row.kind === 'changed' && row.delta !== undefined ? (
                    <span className={row.delta > 0 ? 'text-accent-600' : 'text-warning'}>
                      {row.delta > 0 ? (
                        <ArrowUpRight aria-hidden className="mr-0.5 inline size-3.5" />
                      ) : (
                        <ArrowDownRight aria-hidden className="mr-0.5 inline size-3.5" />
                      )}
                      {row.delta > 0 ? '+' : ''}
                      {row.delta}%
                    </span>
                  ) : row.kind === 'added' ? (
                    <Plus aria-hidden className="inline size-3.5 text-brand-400" />
                  ) : row.kind === 'removed' ? (
                    <Minus aria-hidden className="inline size-3.5 text-warning" />
                  ) : (
                    '—'
                  )}
                </Td>
                <Td>
                  <Badge tone={KIND_META[row.kind].tone}>{KIND_META[row.kind].label}</Badge>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </TableScroll>

      {submission.findings.length > 0 ? (
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">Historical findings</p>
          <ul className="space-y-2">
            {submission.findings.map((finding) => (
              <li key={finding.title} className="rounded-lg border border-line bg-surface p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={
                      finding.severity === 'high'
                        ? 'danger'
                        : finding.severity === 'medium'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {finding.severity}
                  </Badge>
                  <p className="text-[13px] font-medium text-ink">{finding.title}</p>
                </div>
                <p className="mt-1 text-[13px] leading-6 text-muted">{finding.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Notice tone="warning" title="Historical acceptance does not establish acceptance of this formula">
        The recorded outcome applies to the exact composition submitted at the time. Every difference above
        needs its own assessment in the current formula.
      </Notice>
    </div>
  );
}
