import type { FindingRecord, Formula, MarketAssessment, RawMaterial, TargetMarket } from '../types/domain';
import type { EvidenceDocument } from '../types/domain';

export const UNCONFIGURED_MARKET_MESSAGE = 'Assessment criteria are not configured for this market.';

/** Rule ids that are actually configured for a market. Absent markets are not assessed. */
export const CONFIGURED_MARKET_RULES: Partial<Record<TargetMarket, readonly string[]>> = {
  US: ['DR-01', 'DR-02', 'DR-03', 'DR-04', 'DR-05', 'DR-06', 'DR-07', 'DR-08', 'DR-09'],
  EU: ['DR-01', 'DR-04', 'DR-05', 'DR-07', 'DR-09', 'EU-LAB'],
};

export function rulesForMarket(market: TargetMarket): readonly string[] | undefined {
  return CONFIGURED_MARKET_RULES[market];
}

function statusFromFindings(findings: FindingRecord[]): 'green' | 'amber' | 'red' {
  if (findings.some((finding) => finding.severity === 'high')) return 'red';
  if (findings.some((finding) => finding.severity === 'medium')) return 'amber';
  return 'green';
}

/** European Union criteria require a laboratory report for each colorant. United States criteria do not. */
export function europeanColorantLabFindings(
  formula: Formula,
  rawMaterials: RawMaterial[],
  documents: EvidenceDocument[],
): FindingRecord[] {
  const materialById = new Map(rawMaterials.map((material) => [material.id, material]));
  const findings: FindingRecord[] = [];
  for (const ingredient of formula.ingredients) {
    const material = ingredient.rawMaterialId ? materialById.get(ingredient.rawMaterialId) : undefined;
    if (!material || material.role !== 'Colorant') continue;
    const report = documents.find(
      (document) =>
        document.rawMaterialId === material.id &&
        document.type === 'Laboratory Report' &&
        document.status === 'available',
    );
    if (report) continue;
    findings.push({
      id: `EU-LAB-${material.id}`,
      ruleId: 'EU-LAB',
      severity: 'medium',
      scope: 'ingredient',
      reference: `${ingredient.name} (${material.id})`,
      concern: `Laboratory report for ${material.name} is not on file`,
      explanation:
        'European Union criteria in this workspace require a laboratory report for colorants. This check is not part of the United States criteria.',
      evidenceReference: 'No laboratory report on file',
      recommendedAction: 'Record a laboratory report for this colorant before the European Union criteria can be completed.',
      reviewState: 'open',
    });
  }
  return findings;
}

export function assessMarkets(
  markets: TargetMarket[],
  findings: FindingRecord[],
  extraByMarket: Partial<Record<TargetMarket, FindingRecord[]>>,
  usStatus: 'green' | 'amber' | 'red',
): { results: MarketAssessment[]; applicableFindings: FindingRecord[]; status: 'green' | 'amber' | 'red' } {
  const results: MarketAssessment[] = [];
  const applicable: FindingRecord[] = [];
  const seen = new Set<string>();

  for (const market of markets) {
    const rules = rulesForMarket(market);
    if (!rules) {
      results.push({
        market,
        status: 'not-assessed',
        message: UNCONFIGURED_MARKET_MESSAGE,
        findingIds: [],
      });
      continue;
    }
    const allowed = new Set(rules);
    const marketFindings = [
      ...findings.filter((finding) => allowed.has(finding.ruleId)),
      ...(extraByMarket[market] ?? []).filter((finding) => allowed.has(finding.ruleId)),
    ];
    for (const finding of marketFindings) {
      if (seen.has(finding.id)) continue;
      seen.add(finding.id);
      applicable.push(finding);
    }
    results.push({
      market,
      status: market === 'US' ? usStatus : statusFromFindings(marketFindings),
      findingIds: marketFindings.map((finding) => finding.id),
    });
  }

  const configured = results.filter((result) => result.status !== 'not-assessed');
  let status: 'green' | 'amber' | 'red' = 'green';
  if (configured.some((result) => result.status === 'red')) status = 'red';
  else if (configured.some((result) => result.status === 'amber') || configured.length === 0) status = 'amber';
  else if (results.some((result) => result.status === 'not-assessed')) status = 'amber';

  return { results, applicableFindings: applicable, status };
}
