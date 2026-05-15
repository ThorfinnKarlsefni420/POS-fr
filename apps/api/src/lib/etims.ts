// KRA eTIMS — Tax Invoice Management System
// Docs: https://etims.kra.go.ke
// Every COMPLETED transaction must be submitted. The response carries a QR code
// to print on the receipt. Until credentials are configured, calls are no-ops.

export interface EtimsLineItem {
  itemName: string;
  quantity: number;
  unitPriceIncl: number;  // VAT-inclusive shelf price
  unitPriceNet: number;   // net excl. VAT (sent to eTIMS as unitPrice)
  vatAmount: number;      // per-unit VAT extracted
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
  qrCode?: string;        // base64 PNG to embed on the receipt
  errorMessage?: string;
}

export async function submitEtimsInvoice(invoice: EtimsInvoice): Promise<EtimsResult> {
  const apiKey = process.env.ETIMS_API_KEY;
  const deviceSerial = process.env.ETIMS_DEVICE_SERIAL;
  const taxpayerPin = process.env.ETIMS_TAXPAYER_PIN;

  if (!apiKey || !deviceSerial || !taxpayerPin) {
    console.log('[eTIMS] not configured — skipping invoice submission for', invoice.transactionId);
    return { success: false, errorMessage: 'eTIMS credentials not configured' };
  }

  // TODO: replace with real KRA eTIMS endpoint and signing logic
  // The real request requires:
  // 1. Sign the invoice payload with the device private key (RSA)
  // 2. POST to https://etims-api.kra.go.ke/etims-api/saveInvoice
  // 3. Parse response: { resultCd, resultMsg, rcptSign, qrcodeUrl }
  const payload = {
    deviceSerialNum: deviceSerial,
    taxpayerPin,
    invoiceNum: invoice.transactionId,
    totalTaxAmount: invoice.taxAmount,
    totalAmount: invoice.totalAmount,
    paymentType: invoice.paymentType,
    invoiceDate: invoice.issuedAt.toISOString(),
    taxableAmount: invoice.items
      .filter((i) => i.taxType === 'VAT')
      .reduce((s, i) => s + i.unitPriceNet * i.quantity, 0),
    taxAmount: invoice.taxAmount,
    zeroRatedAmount: invoice.totalZeroKes,
    exemptAmount: invoice.totalExemptKes,
    itemList: invoice.items.map((i) => ({
      itemNm: i.itemName,
      qty: i.quantity,
      unitPrice: i.unitPriceNet,  // eTIMS requires net (excl. VAT) price
      taxType: i.taxType,
      taxAmount: i.vatAmount * i.quantity,
      totalAmount: i.unitPriceIncl * i.quantity,
    })),
  };

  console.log('[eTIMS] would submit invoice:', JSON.stringify(payload, null, 2));

  // Simulated success response shape — replace with real fetch() call
  return {
    success: true,
    receiptNumber: `KRA-${invoice.transactionId.slice(-8).toUpperCase()}`,
    qrCode: undefined,
  };
}
