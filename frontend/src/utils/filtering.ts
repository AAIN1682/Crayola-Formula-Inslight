import type { Paginated, SortDirection } from '../types/services';

export function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesQuery(query: string | undefined, haystack: (string | undefined)[]): boolean {
  const needle = normalize(query ?? '');
  if (!needle) return true;
  return haystack.some((value) => (value ? normalize(value).includes(needle) : false));
}

export function includesAny<T>(selected: T[] | undefined, value: T): boolean {
  if (!selected || selected.length === 0) return true;
  return selected.includes(value);
}

export function includesAnyOf<T>(selected: T[] | undefined, values: T[]): boolean {
  if (!selected || selected.length === 0) return true;
  return values.some((value) => selected.includes(value));
}

type Comparable = string | number | undefined;

export function compareValues(a: Comparable, b: Comparable, direction: SortDirection): number {
  const factor = direction === 'asc' ? 1 : -1;
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  if (typeof a === 'number' && typeof b === 'number') return (a - b) * factor;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }) * factor;
}

export function sortRows<T>(
  rows: T[],
  selector: (row: T) => Comparable,
  direction: SortDirection,
): T[] {
  return [...rows].sort((a, b) => compareValues(selector(a), selector(b), direction));
}

export function paginate<T>(rows: T[], page: number, pageSize: number): Paginated<T> {
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page: safePage,
    pageSize,
    pageCount,
  };
}

/** Toggles a value inside a multi-select filter array. */
export function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function withinPeriod(iso: string, months: number, now = new Date()): boolean {
  if (!months) return true;
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);
  return new Date(iso).getTime() >= cutoff.getTime();
}
