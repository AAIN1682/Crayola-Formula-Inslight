/**
 * Deterministic-ish identifier helpers. IDs stay stable and human-readable so that
 * relationships across the demo dataset remain easy to follow.
 */

let counter = 0;

function suffix(): string {
  counter += 1;
  const random = Math.random().toString(36).slice(2, 6);
  return `${Date.now().toString(36)}${counter.toString(36)}${random}`;
}

export function uid(prefix: string): string {
  return `${prefix}-${suffix()}`;
}

/**
 * Produces the next sequential ID for a prefix, e.g. `FML-1019`, by inspecting
 * existing IDs rather than relying on array length.
 */
export function nextSequentialId(prefix: string, existing: string[], start = 1001): string {
  const pattern = new RegExp(`^${prefix}-(\\d+)$`);
  let max = start - 1;
  for (const id of existing) {
    const match = pattern.exec(id);
    if (match) {
      const value = Number.parseInt(match[1] as string, 10);
      if (Number.isFinite(value) && value > max) max = value;
    }
  }
  return `${prefix}-${max + 1}`;
}

/** Bumps `v2.3` to `v2.4`; falls back to appending `.1` for unexpected shapes. */
export function nextVersion(version: string): string {
  const match = /^v?(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return `${version}.1`;
  const major = Number.parseInt(match[1] as string, 10);
  const minor = Number.parseInt(match[2] as string, 10);
  return `v${major}.${minor + 1}`;
}

/** Small stable string hash, used where the demo needs repeatable variation. */
export function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}
