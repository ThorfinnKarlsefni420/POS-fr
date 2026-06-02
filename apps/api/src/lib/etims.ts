// KRA eTIMS v3 — Tax Invoice Management System (Kenya Revenue Authority)
// API spec: https://etims.kra.go.ke/documentation
//
// Required env vars (all blank until KRA registration is complete):
//   ETIMS_TAXPAYER_PIN     — your KRA PIN, e.g. P000000000A
//   ETIMS_DEVICE_SERIAL    — OSCU device serial assigned by KRA during registration
//   ETIMS_API_KEY          — cmcKey (initialization key) assigned by KRA
//   ETIMS_BRANCH_ID        — branch ID, default "00" (main branch)
//   ETIMS_TRADE_NAME       — legal business name to appear on tax invoices
//   ETIMS_ENVIRONMENT      — "sandbox" (default) or "production"
//
// While any of the required vars are missing, calls are no-ops and log a warning.
// Switch to production by setting ETIMS_ENVIRONMENT=production in .env.

const ETIMS_URLS = {
  production: 'https://etims-api.kra.go.ke/etims-api/saveTrnsSalesDtls',
  sandbox:    'https://etims-sbx-api.kra.go.ke/etims-api/saveTrnsSalesDtls',
};

export interface EtimsLineItem {
  itemName: string;
  quantity: number;
  unitPriceIncl: number;  // VAT-inclusive shelf price
  unitPriceNet: number;   // net excl. VAT
  vatAmount: number;      // per-unit VAT extracted from inclusive price
  taxType: string;        // 'VAT' | 'ZERO' | 'NONTAXABLE'
}

export interface EtimsInvoice {
  transactionId: string;
  storeId: string;
  totalAmount: number;
  taxAmount: number;
  totalZeroKes: number;
  totalExemptKes: number;
  paymentType: string;
  items: EtimsLineItem[];
  issuedAt: Date;
}

export interface EtimsResult {
  success: boolean;
  receiptNumber?: string;
  qrCode?: string;        // base64 / URL to embed on receipt
  errorMessage?: string;
}

// Map NomadBite payment type → KRA eTIMS pmtTyCd
function mapPaymentType(pt: string): string {
  switch (pt.toUpperCase()) {
    case 'CASH':           return '01';
    case 'CREDIT':         return '02';
    case 'CARD':           return '03';
    case 'BANK_TRANSFER':  return '04';
    case 'MPESA':          return '05';
    default:               return '01';
  }
}

// Map NomadBite etimsCode → KRA eTIMS vatCatCd (A=exempt, B=16%, C=zero-rated)
function mapTaxCategory(etimsCode: string): 'A' | 'B' | 'C' {
  switch (etimsCode) {
    case 'VAT':        return 'B';
    case 'ZERO':       return 'C';
    case 'NONTAXABLE': return 'A';
    default:           return 'B';
  }
}

// Format Date → "YYYYMMDD" as required by eTIMS
function toEtimsDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function submitEtimsInvoice(invoice: EtimsInvoice): Promise<EtimsResult> {
  const taxpayerPin  = process.env.ETIMS_TAXPAYER_PIN;
  const deviceSerial = process.env.ETIMS_DEVICE_SERIAL;
  const apiKey       = process.env.ETIMS_API_KEY;
  const branchId     = process.env.ETIMS_BRANCH_ID ?? '00';
  const tradeName    = process.env.ETIMS_TRADE_NAME ?? 'NomadBite';
  const env          = process.env.ETIMS_ENVIRONMENT === 'production' ? 'production' : 'sandbox';

  if (!taxpayerPin || !deviceSerial || !apiKey) {
    console.warn(
      '[eTIMS] Credentials not configured — skipping invoice for',
      invoice.transactionId,
      '| Set ETIMS_TAXPAYER_PIN, ETIMS_DEVICE_SERIAL, ETIMS_API_KEY to go live.',
    );
    return { success: false, errorMessage: 'eTIMS credentials not configured' };
  }

  // ── Tax amount breakdown by category ───────────────────────────────────────
  // B = Standard 16% VAT; C = Zero-rated; A = Exempt
  const standardGross = round2(invoice.totalAmount - invoice.totalZeroKes - invoice.totalExemptKes);
  const taxblAmtB     = round2(standardGross - invoice.taxAmount);  // net excl. VAT
  const taxblAmtC     = round2(invoice.totalZeroKes);
  const taxblAmtA     = round2(invoice.totalExemptKes);

  // ── Invoice sequence number ─────────────────────────────────────────────────
  // KRA requires a positive integer. We use a ms-precision timestamp mod 1B
  // to stay unique without a DB counter. A proper sequential counter is a
  // recommended upgrade before high-volume production use.
  const invcNo = Date.now() % 1_000_000_000;

  const salesDate = toEtimsDate(invoice.issuedAt);

  const body = {
    tpin:          taxpayerPin,
    bhfId:         branchId,
    invcNo,
    orgInvcNo:     0,
    cisInvcNo:     null,
    salesDt:       salesDate,
    stockRlsDt:    null,
    cnclReqDt:     null,
    cnclDt:        null,
    confmDt:       salesDate,
    pmtTyCd:       mapPaymentType(invoice.paymentType),
    rcptTyCd:      'S',          // S = Sale
    trdeNm:        tradeName,
    adrs:          null,
    topCd:         '1',          // 1 = New invoice
    taxblAmtA,
    taxblAmtB,
    taxblAmtC,
    taxblAmtD:     0,
    taxblAmtE:     0,
    taxRtA:        0,
    taxRtB:        16,
    taxRtC:        0,
    taxRtD:        0,
    taxRtE:        0,
    taxAmtA:       0,
    taxAmtB:       round2(invoice.taxAmount),
    taxAmtC:       0,
    taxAmtD:       0,
    taxAmtE:       0,
    totTaxblAmt:   round2(taxblAmtA + taxblAmtB + taxblAmtC),
    totTaxAmt:     round2(invoice.taxAmount),
    totAmt:        round2(invoice.totalAmount),
    prchrAcptcYn:  'N',
    remark:        null,
    regrNm:        'NomadBite',
    regrId:        deviceSerial,
    modrNm:        'NomadBite',
    modrId:        deviceSerial,
    itemList:      invoice.items.map((item, idx) => {
      const taxCat    = mapTaxCategory(item.taxType);
      const lineNet   = round2(item.unitPriceNet * item.quantity);
      const lineTax   = round2(item.vatAmount * item.quantity);
      const lineTotal = round2(item.unitPriceIncl * item.quantity);
      return {
        itemSeq:        idx + 1,
        itemCd:         item.itemName.slice(0, 20).replace(/\s+/g, '_').toUpperCase(),
        itemNm:         item.itemName,
        bcd:            null,
        pkgUnitCd:      'EA',
        qty:            item.quantity,
        qtyUnitCd:      'U',
        prc:            round2(item.unitPriceNet),
        splyAmt:        lineNet,
        dcRt:           0,
        dcAmt:          0,
        isrccCd:        null,
        isrccNm:        null,
        isrcRt:         null,
        isrcAmt:        null,
        vatCatCd:       taxCat,
        exciseTxCatCd:  null,
        taxblAmt:       taxCat === 'B' ? lineNet : lineTotal,
        taxAmt:         lineTax,
        totAmt:         lineTotal,
      };
    }),
  };

  const url = ETIMS_URLS[env];

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        tin:    taxpayerPin,
        bhfId:  branchId,
        cmcKey: apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[eTIMS] Network error submitting invoice', invoice.transactionId, ':', msg);
    return { success: false, errorMessage: `Network error: ${msg}` };
  }

  const data = await resp.json() as {
    resultCd: string;
    resultMsg: string;
    data?: {
      rcptNo?:     number;
      rcptSign?:   string;
      intrlData?:  string;
      qrCode?:     string;
      rcptDt?:     string;
    };
  };

  if (data.resultCd !== '000') {
    console.error(
      `[eTIMS] Invoice ${invoice.transactionId} rejected (${data.resultCd}): ${data.resultMsg}`,
    );
    return { success: false, errorMessage: `${data.resultCd}: ${data.resultMsg}` };
  }

  console.info(
    `[eTIMS] Invoice ${invoice.transactionId} accepted → receipt #${data.data?.rcptNo} (${env})`,
  );

  return {
    success:       true,
    receiptNumber: String(data.data?.rcptSign ?? data.data?.rcptNo ?? invcNo),
    qrCode:        data.data?.qrCode ?? data.data?.intrlData,
  };
}
