import type { AgeGroup, TargetMarket } from '../types/domain';
import { AGE_GROUP_LABEL, TARGET_MARKETS } from '../types/domain';

const ENTIRELY_UNDER_12 = new Set(['3+', '4+', '6+', '8+', 'under_12']);
const ENTIRELY_12_AND_ABOVE = new Set(['12+', '12_and_above']);

export interface MappedAge {
  ageGroup?: AgeGroup;
  recordedAgeGroup?: string;
  needsSelection: boolean;
}

/** Map a stored age only when the old range sits entirely inside one audience category. */
export function mapLegacyAge(value: string | undefined): MappedAge {
  if (!value) return { needsSelection: true };
  if (value === 'under_12' || value === '12_and_above') {
    return { ageGroup: value, needsSelection: false };
  }
  if (ENTIRELY_UNDER_12.has(value)) {
    return { ageGroup: 'under_12', recordedAgeGroup: value, needsSelection: false };
  }
  if (ENTIRELY_12_AND_ABOVE.has(value)) {
    return { ageGroup: '12_and_above', recordedAgeGroup: value, needsSelection: false };
  }
  return { recordedAgeGroup: value, needsSelection: true };
}

export function ageGroupLabel(value: AgeGroup | undefined): string {
  if (!value) return 'Age group required';
  return AGE_GROUP_LABEL[value];
}

export function marketLabel(code: TargetMarket): string {
  return TARGET_MARKETS.find((market) => market.code === code)?.label ?? code;
}

export function sameMarkets(left: TargetMarket[] | undefined, right: TargetMarket[] | undefined): boolean {
  const a = [...(left ?? [])].sort().join(',');
  const b = [...(right ?? [])].sort().join(',');
  return a === b;
}
