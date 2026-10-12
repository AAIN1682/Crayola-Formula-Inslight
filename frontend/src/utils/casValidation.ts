/** CAS Registry format: up to 7 digits, hyphen, 2 digits, hyphen, 1 check digit. */
const CAS_PATTERN = /^(\d{2,7})-(\d{2})-(\d)$/;

function casCheckDigit(digits: string): number {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    sum += Number(digits[digits.length - 1 - index]) * (index + 1);
  }
  return sum % 10;
}

export function normalizeCas(value: string): string {
  return value.trim();
}

export function isValidCas(value: string): boolean {
  const text = normalizeCas(value);
  if (!text) return false;
  const match = CAS_PATTERN.exec(text);
  if (!match) return false;
  const body = `${match[1]}${match[2]}`;
  const check = Number(match[3]);
  return casCheckDigit(body) === check;
}

export function casValidationMessage(value: string): string | undefined {
  const text = normalizeCas(value);
  if (!text) return undefined;
  if (CAS_PATTERN.test(text) && !isValidCas(text)) {
    return 'CAS check digit is invalid.';
  }
  if (!CAS_PATTERN.test(text)) {
    return 'Use CAS format: digits-digits-digit (e.g. 7732-18-5).';
  }
  return undefined;
}
