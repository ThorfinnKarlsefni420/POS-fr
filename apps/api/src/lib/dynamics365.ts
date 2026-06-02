// Microsoft Dynamics 365 Finance & Operations + Commerce API client
// Auth: Azure AD OAuth2 client credentials (service-to-service)
// Until credentials are configured in the integration, all calls are no-ops.

export interface D365Credentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  d365BaseUrl: string;        // e.g. https://myenv.operations.dynamics.com
  retailServerUrl?: string;   // e.g. https://myenv.commerce.dynamics.com
  channelId?: string;
}

export interface D365Product {
  sku: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  category: string;
  unit: string;
}

// In-process token cache — avoids a round-trip on every sync
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export async function getD365AccessToken(creds: D365Credentials): Promise<string> {
  const key = `${creds.tenantId}:${creds.clientId}`;
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const resp = await fetch(
    `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        scope: `${creds.d365BaseUrl}/.default`,
      }),
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`D365 auth failed (${resp.status}): ${text.slice(0, 200)}`);
  }

  const data = await resp.json() as { access_token: string; expires_in: number };
  tokenCache.set(key, { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 });
  return data.access_token;
}

// Pull released products from D365 OData (pages up to 5 000 items)
export async function fetchD365Products(creds: D365Credentials): Promise<D365Product[]> {
  const token = await getD365AccessToken(creds);

  const products: D365Product[] = [];
  let url: string | null =
    `${creds.d365BaseUrl}/data/ReleasedProducts` +
    `?$select=ItemNumber,ProductName,PurchasePrice,SalesPrice,PrimaryVendorId,UnitId` +
    `&$top=1000`;

  while (url) {
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) throw new Error(`D365 products fetch failed (${resp.status})`);

    const data = await resp.json() as {
      value: Array<Record<string, unknown>>;
      '@odata.nextLink'?: string;
    };

    for (const p of data.value ?? []) {
      const sku = String(p.ItemNumber ?? '').trim();
      if (!sku) continue;
      products.push({
        sku,
        name: String(p.ProductName ?? sku),
        costPrice: Number(p.PurchasePrice ?? 0),
        sellingPrice: Number(p.SalesPrice ?? 0),
        category: String(p.PrimaryVendorId ?? ''),
        unit: String(p.UnitId ?? 'pc'),
      });
    }

    url = data['@odata.nextLink'] ?? null;
  }

  return products;
}

// Pull on-hand inventory quantities for a list of SKUs
export async function fetchD365Inventory(
  creds: D365Credentials,
  skus: string[],
): Promise<Map<string, number>> {
  if (skus.length === 0) return new Map();
  const token = await getD365AccessToken(creds);
  const map = new Map<string, number>();

  // D365 OData has a URL length limit — batch into groups of 50
  for (let i = 0; i < skus.length; i += 50) {
    const batch = skus.slice(i, i + 50);
    const filter = batch.map((s) => `ItemNumber eq '${s.replace(/'/g, "''")}'`).join(' or ');
    const url =
      `${creds.d365BaseUrl}/data/InventOnHandV2` +
      `?$select=ItemNumber,PhysicalInventory&$filter=${encodeURIComponent(filter)}`;

    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    });
    if (!resp.ok) continue; // skip batch on error; log handled by caller

    const data = await resp.json() as { value: Array<Record<string, unknown>> };
    for (const row of data.value ?? []) {
      const sku = String(row.ItemNumber ?? '').trim();
      if (sku) map.set(sku, Number(row.PhysicalInventory ?? 0));
    }
  }

  return map;
}

// Push a completed NomadBite transaction back to D365 Retail Server
// Fire-and-forget — caller should catch() this promise
export async function pushTransactionToD365(
  creds: D365Credentials,
  tx: {
    id: string;
    totalAmount: number;
    paymentType: string;
    items: Array<{ sku: string; qty: number; unitPrice: number }>;
  },
): Promise<void> {
  if (!creds.retailServerUrl || !creds.channelId) return;

  const token = await getD365AccessToken(creds);

  const resp = await fetch(`${creds.retailServerUrl}/Commerce/Transactions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      OUN: creds.channelId,
    },
    body: JSON.stringify({
      Id: tx.id,
      ChannelId: Number(creds.channelId),
      GrossAmount: tx.totalAmount,
      NetAmount: tx.totalAmount,
      PaymentTypeId: tx.paymentType,
      SalesLines: tx.items.map((i) => ({
        ItemId: i.sku,
        Quantity: i.qty,
        Price: i.unitPrice,
        NetAmount: i.qty * i.unitPrice,
      })),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    throw new Error(`D365 transaction push failed (${resp.status})`);
  }
}

export interface D365PurchaseOrder {
  referenceNo: string;
  vendorAccountNumber: string;
  currencyCode?: string;
  deliveryDate?: string;    // ISO datetime string e.g. "2026-06-01T00:00:00Z"
  dataAreaId?: string;      // D365 legal entity, e.g. "USMF"
  lines: Array<{
    lineNumber: number;
    itemNumber: string;     // SKU
    quantity: number;
    unitPrice: number;
    unit?: string;
  }>;
}

export interface D365GoodsReceipt {
  purchaseOrderNumber: string;  // D365-assigned PO number from pushPurchaseOrderToD365
  receiptNumber: string;        // our internal ref (GR-<poId>-<ts>)
  receiptDate: string;          // ISO datetime string
  dataAreaId?: string;
  lines: Array<{
    lineNumber: number;
    itemNumber: string;
    receivedQty: number;
  }>;
}

// Push a NomadBite purchase order to D365 as a PurchaseOrderHeadersV2 + lines.
// Returns the D365-assigned PurchaseOrderNumber.
// Fire-and-forget — caller should catch() this promise.
export async function pushPurchaseOrderToD365(
  creds: D365Credentials,
  po: D365PurchaseOrder,
): Promise<string> {
  const token = await getD365AccessToken(creds);

  const headerResp = await fetch(`${creds.d365BaseUrl}/data/PurchaseOrderHeadersV2`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      PurchaseOrderName: po.referenceNo,
      OrderVendorAccountNumber: po.vendorAccountNumber,
      CurrencyCode: po.currencyCode ?? 'KES',
      ...(po.deliveryDate && { RequestedDeliveryDate: po.deliveryDate }),
      ...(po.dataAreaId && { dataAreaId: po.dataAreaId }),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!headerResp.ok) {
    const text = await headerResp.text();
    throw new Error(`D365 PO header push failed (${headerResp.status}): ${text.slice(0, 200)}`);
  }

  const headerData = await headerResp.json() as { PurchaseOrderNumber: string };
  const poNumber = headerData.PurchaseOrderNumber;

  await Promise.allSettled(
    po.lines.map((line) =>
      fetch(`${creds.d365BaseUrl}/data/PurchaseOrderLineDetails`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          PurchaseOrderNumber: poNumber,
          LineNumber: line.lineNumber,
          ItemNumber: line.itemNumber,
          OrderedPurchaseQuantity: line.quantity,
          PurchasePrice: line.unitPrice,
          ...(line.unit && { PurchaseUnitSymbol: line.unit }),
        }),
        signal: AbortSignal.timeout(15_000),
      }).then((r) => {
        if (!r.ok) console.error(`[D365] PO line ${line.lineNumber} (${line.itemNumber}) failed (${r.status})`);
      })
    )
  );

  return poNumber;
}

// Push a goods receipt to D365 against a previously-pushed PO.
// Fire-and-forget — caller should catch() this promise.
export async function pushGoodsReceiptToD365(
  creds: D365Credentials,
  receipt: D365GoodsReceipt,
): Promise<void> {
  const token = await getD365AccessToken(creds);

  const resp = await fetch(`${creds.d365BaseUrl}/data/PurchaseOrderProductReceipts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      PurchaseOrderNumber: receipt.purchaseOrderNumber,
      ProductReceiptNumber: receipt.receiptNumber,
      TransactionDate: receipt.receiptDate,
      ...(receipt.dataAreaId && { dataAreaId: receipt.dataAreaId }),
      Lines: receipt.lines.map((l) => ({
        LineNumber: l.lineNumber,
        ItemNumber: l.itemNumber,
        ReceiveNow: l.receivedQty,
      })),
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`D365 goods receipt push failed (${resp.status}): ${text.slice(0, 200)}`);
  }
}

export function parseD365Credentials(raw: unknown): D365Credentials | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (!c.tenantId || !c.clientId || !c.clientSecret || !c.d365BaseUrl) return null;
  return {
    tenantId: String(c.tenantId),
    clientId: String(c.clientId),
    clientSecret: String(c.clientSecret),
    d365BaseUrl: String(c.d365BaseUrl).replace(/\/$/, ''),
    retailServerUrl: c.retailServerUrl ? String(c.retailServerUrl).replace(/\/$/, '') : undefined,
    channelId: c.channelId ? String(c.channelId) : undefined,
  };
}
