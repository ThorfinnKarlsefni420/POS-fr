// Kenya VAT Act 2013 — KRA compliant VAT calculation
// All shelf prices are VAT-inclusive (standard Kenyan retail practice).
// VAT is extracted from inclusive prices; never added on top.

export type VatClassCode = 'STANDARD' | 'ZERO' | 'EXEMPT';

export interface VatClassData {
  id: string;
  code: VatClassCode;
  rate: number;       // 0.16 for STANDARD, 0.00 for ZERO/EXEMPT
  etimsCode: string;  // 'VAT' | 'ZERO' | 'NONTAXABLE'
}

const STANDARD_DEFAULT: VatClassData = {
  id: 'vatcls_standard',
  code: 'STANDARD',
  rate: 0.16,
  etimsCode: 'VAT',
};

// Resolve effective VAT class: item override → category default → Standard 16% fallback.
// Pass pre-loaded data to avoid N+1 queries in the caller.
export function resolveVatClass(
  itemVatClass: VatClassData | null | undefined,
  categoryVatClass: VatClassData | null | undefined,
): VatClassData {
  return itemVatClass ?? categoryVatClass ?? STANDARD_DEFAULT;
}

export interface LineVatResult {
  vatRate: number;    // 0.16 or 0.00
  etimsCode: string;  // 'VAT' | 'ZERO' | 'NONTAXABLE'
  vatAmount: number;  // per-unit VAT extracted from inclusive price
  netAmount: number;  // per-unit net excl. VAT
  lineTotalIncl: number;
  lineVatTotal: number;
}

export function calcLineVat(
  unitPriceIncl: number,
  qty: number,
  vc: VatClassData,
): LineVatResult {
  const vatAmount = vc.rate > 0
    ? round2(unitPriceIncl * vc.rate / (1 + vc.rate))
    : 0;
  return {
    vatRate:       vc.rate,
    etimsCode:     vc.etimsCode,
    vatAmount,
    netAmount:     round2(unitPriceIncl - vatAmount),
    lineTotalIncl: round2(unitPriceIncl * qty),
    lineVatTotal:  round2(vatAmount * qty),
  };
}

export interface ReceiptTotals {
  totalInclKes:   number;
  totalVatKes:    number;  // output VAT collected (Standard 16% lines)
  totalZeroKes:   number;  // Zero-Rated line totals
  totalExemptKes: number;  // Exempt line totals
}

export function calcReceiptTotals(lines: LineVatResult[]): ReceiptTotals {
  let totalIncl = 0, totalVat = 0, totalZero = 0, totalExempt = 0;
  for (const l of lines) {
    totalIncl += l.lineTotalIncl;
    totalVat  += l.lineVatTotal;
    if (l.etimsCode === 'ZERO')       totalZero   += l.lineTotalIncl;
    if (l.etimsCode === 'NONTAXABLE') totalExempt += l.lineTotalIncl;
  }
  return {
    totalInclKes:   round2(totalIncl),
    totalVatKes:    round2(totalVat),
    totalZeroKes:   round2(totalZero),
    totalExemptKes: round2(totalExempt),
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
