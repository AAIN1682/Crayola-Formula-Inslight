const DEFAULT_PRODUCT_COLOR = '#3B82F6';

export function productColorHex(value: string | undefined | null): string {
  const v = (value ?? '').trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(v)) return v;
  return DEFAULT_PRODUCT_COLOR;
}

export { DEFAULT_PRODUCT_COLOR };
