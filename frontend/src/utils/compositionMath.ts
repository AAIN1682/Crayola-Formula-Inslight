export const COMPOSITION_TOLERANCE = 0.0005;

export function parsePercent(text: string): number {
  const value = Number.parseFloat(text.trim());
  return Number.isFinite(value) ? value : NaN;
}

export function compositionTotal(rows: { pct: string }[]): number {
  return rows.reduce((sum, row) => {
    const value = parsePercent(row.pct);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function compositionIsComplete(total: number): boolean {
  return Math.abs(total - 100) <= COMPOSITION_TOLERANCE;
}

/** Put the rounding gap on the largest-percentage row (prototype rebalance). */
export function rebalancePercentages<T extends { pct: string }>(rows: T[]): T[] {
  if (rows.length === 0) return rows;
  const total = compositionTotal(rows);
  const gap = 100 - total;
  if (Math.abs(gap) <= COMPOSITION_TOLERANCE) return rows;

  let targetIndex = 0;
  let highest = -Infinity;
  rows.forEach((row, index) => {
    const value = parsePercent(row.pct);
    if (Number.isFinite(value) && value > highest) {
      highest = value;
      targetIndex = index;
    }
  });

  return rows.map((row, index) => {
    if (index !== targetIndex) return row;
    const current = parsePercent(row.pct);
    const next = (Number.isFinite(current) ? current : 0) + gap;
    return { ...row, pct: next.toFixed(3) };
  });
}
