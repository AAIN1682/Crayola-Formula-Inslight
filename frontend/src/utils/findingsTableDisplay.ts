import type { Formula } from '../types/domain';
import type { PackageAssessment, PackageCheck } from '../api/formulaBackend';

export interface MaterialDisplayInfo {
  name: string;
  cas?: string | null;
}

export function buildMaterialDisplayMap(assessment?: PackageAssessment): Map<string, MaterialDisplayInfo> {
  const map = new Map<string, MaterialDisplayInfo>();
  for (const item of assessment?.llm_context.materials ?? []) {
    map.set(item.material_id, { name: item.name, cas: item.cas });
  }
  for (const row of assessment?.llm_context.formula?.ingredients ?? []) {
    const key = row.material_id ?? row.name;
    if (!key) continue;
    map.set(key, {
      name: row.name ?? key,
      cas: row.cas ?? map.get(key)?.cas,
    });
  }
  return map;
}

export function resolveMaterialDisplay(
  materialId: string | null | undefined,
  map: Map<string, MaterialDisplayInfo>,
): MaterialDisplayInfo {
  if (!materialId) return { name: 'Formula' };
  return map.get(materialId) ?? { name: materialId };
}

export function declaredConcentrationPercent(
  materialId: string | null | undefined,
  assessment?: PackageAssessment,
  formula?: Formula,
): number | null {
  if (!materialId) return null;
  const fromContext = assessment?.llm_context.formula?.ingredients?.find(
    (row) => row.material_id === materialId || row.name === materialId,
  )?.concentration_percent;
  if (typeof fromContext === 'number' && Number.isFinite(fromContext)) return fromContext;
  const fromFormula = formula?.ingredients.find(
    (row) => row.rawMaterialId === materialId || row.name === materialId,
  )?.concentration;
  if (typeof fromFormula === 'number' && Number.isFinite(fromFormula)) return fromFormula;
  return null;
}

export function enteredPercentLabel(
  check: PackageCheck,
  assessment?: PackageAssessment,
  formula?: Formula,
): string {
  if (check.actual != null && Number.isFinite(Number(check.actual))) {
    return `${check.actual}%`;
  }
  const declared = declaredConcentrationPercent(check.material_id, assessment, formula);
  if (declared != null) return `${declared}%`;
  return '—';
}

export interface GroupedFindingRow {
  key: string;
  checks: PackageCheck[];
  markets: string[];
  materialId: string | null;
  status: string;
  documentType?: string;
  checkKind?: string;
  representative: PackageCheck;
}

function groupKey(check: PackageCheck): string {
  const scope = check.document_type ?? check.check_kind ?? check.reason_code ?? 'calc';
  return [
    check.material_id ?? check.requirement_id ?? check.check_id,
    check.status,
    scope,
    check.message?.slice(0, 120) ?? '',
  ].join('|');
}

export function groupFindingChecks(checks: PackageCheck[]): GroupedFindingRow[] {
  const buckets = new Map<string, PackageCheck[]>();
  for (const check of checks) {
    const key = groupKey(check);
    const list = buckets.get(key) ?? [];
    list.push(check);
    buckets.set(key, list);
  }
  return [...buckets.values()].map((items) => {
    const representative = items[0];
    const markets = [...new Set(items.map((item) => item.region).filter(Boolean))].sort();
    return {
      key: groupKey(representative),
      checks: items,
      markets,
      materialId: representative.material_id,
      status: representative.status,
      documentType: representative.document_type,
      checkKind: representative.check_kind,
      representative,
    };
  });
}
