/**
 * GS1 GTIN check-digit validation (EAN-8, UPC-A, EAN-13, ITF-14/GTIN-14).
 *
 * Advisory only: most barcodes in this system are internal supplier codes that
 * are NOT a standard GTIN length (see BARCODE_IMPLEMENTATION_PLAN.md — production
 * data is entirely 7-digit codes). A non-GTIN-length or non-numeric value is not
 * an error; it simply has no checksum to validate. Only a value that claims a
 * standard GTIN length but fails the checksum is flagged.
 */

export type GtinSymbology = 'EAN-8' | 'UPC-A' | 'EAN-13' | 'ITF-14';

const SYMBOLOGY_BY_LENGTH: Record<number, GtinSymbology> = {
  8: 'EAN-8',
  12: 'UPC-A',
  13: 'EAN-13',
  14: 'ITF-14',
};

export interface BarcodeValidation {
  symbology: GtinSymbology | null; // null = not a recognized GTIN length — not an error
  valid: boolean;                  // false only when symbology is set AND checksum fails
}

// GS1 Modulo-10 check digit: from right to left over the data digits (excluding
// the check digit), weight 3 then 1, alternating, starting with 3.
export function computeGtinCheckDigit(dataDigits: string): number {
  let sum = 0;
  for (let i = 0; i < dataDigits.length; i++) {
    const digit = Number(dataDigits[dataDigits.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function validateBarcode(code: string): BarcodeValidation {
  const trimmed = code.trim();
  const symbology = SYMBOLOGY_BY_LENGTH[trimmed.length];
  if (!symbology || !/^\d+$/.test(trimmed)) {
    return { symbology: null, valid: true };
  }
  const body = trimmed.slice(0, -1);
  const checkDigit = Number(trimmed[trimmed.length - 1]);
  return { symbology, valid: checkDigit === computeGtinCheckDigit(body) };
}
