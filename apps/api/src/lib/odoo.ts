// Odoo JSON-RPC 2.0 client
// Auth: session cookie (/web/session/authenticate)
// Supports: product + inventory sync, transaction push

export interface OdooCredentials {
  url: string;      // e.g. http://localhost:8069
  db: string;       // database name
  login: string;
  password: string;
}

export interface OdooProduct {
  odooId: number;
  sku: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
  category: string;
  unit: string;
  taxRate: number;
  stock: number;
}

// In-process session cache — avoids re-authenticating on every sync
const sessionCache = new Map<string, { sessionId: string; expiresAt: number }>();

async function getOdooSession(creds: OdooCredentials): Promise<string> {
  const key = `${creds.url}:${creds.db}:${creds.login}`;
  const cached = sessionCache.get(key);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.sessionId;

  const resp = await fetch(`${creds.url}/web/session/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: { db: creds.db, login: creds.login, password: creds.password },
    }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) throw new Error(`Odoo auth HTTP ${resp.status}`);

  const data = await resp.json() as {
    result?: { uid?: number };
    error?: { data?: { message?: string } };
  };

  if (data.error) throw new Error(`Odoo auth: ${data.error.data?.message ?? 'Access Denied'}`);
  if (!data.result?.uid) throw new Error('Odoo auth: invalid credentials');

  const setCookie = resp.headers.get('set-cookie') ?? '';
  const match = setCookie.match(/session_id=([^;]+)/);
  if (!match) throw new Error('Odoo auth: no session cookie returned');

  // Cache for 1 hour (Odoo sessions last much longer)
  sessionCache.set(key, { sessionId: match[1], expiresAt: Date.now() + 3_600_000 });
  return match[1];
}

async function rpc<T>(
  creds: OdooCredentials,
  model: string,
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown>,
): Promise<T> {
  const sessionId = await getOdooSession(creds);

  const resp = await fetch(`${creds.url}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { model, method, args, kwargs } }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resp.ok) throw new Error(`Odoo RPC HTTP ${resp.status}`);

  const data = await resp.json() as { result?: T; error?: { data?: { message?: string } } };
  if (data.error) throw new Error(`Odoo RPC (${model}.${method}): ${data.error.data?.message ?? 'Unknown error'}`);
  return data.result as T;
}

export async function fetchOdooProducts(creds: OdooCredentials): Promise<OdooProduct[]> {
  // Fetch sale taxes once to resolve taxRate per product
  const taxes = await rpc<Array<{ id: number; amount: number }>>(
    creds, 'account.tax', 'search_read',
    [[['type_tax_use', '=', 'sale'], ['active', '=', true]]],
    { fields: ['id', 'amount'] },
  ).catch(() => [] as Array<{ id: number; amount: number }>);

  const taxRateMap = new Map(taxes.map((t) => [t.id, t.amount]));

  const PAGE = 200;
  const products: OdooProduct[] = [];
  let offset = 0;

  while (true) {
    const rows = await rpc<Array<Record<string, unknown>>>(
      creds, 'product.template', 'search_read',
      [[['active', '=', true], ['sale_ok', '=', true]]],
      {
        fields: ['id', 'name', 'list_price', 'standard_price', 'categ_id', 'uom_name', 'barcode', 'taxes_id', 'qty_available'],
        limit: PAGE,
        offset,
        order: 'id asc',
      },
    );

    if (rows.length === 0) break;

    for (const r of rows) {
      const name = String(r.name ?? '').trim();
      if (!name) continue;

      const id = Number(r.id);
      const barcode = r.barcode ? String(r.barcode).trim() : '';
      const sku = barcode || `ODOO-${id}`;

      const taxIds = Array.isArray(r.taxes_id) ? (r.taxes_id as number[]) : [];
      const taxRate = taxIds.reduce((max, tid) => Math.max(max, taxRateMap.get(tid) ?? 0), 0);

      const rawCateg = Array.isArray(r.categ_id) ? String(r.categ_id[1] ?? '') : '';
      const category = rawCateg.replace(/^All\s*\/\s*/i, '').replace(/\s*\/\s*/g, ' > ');

      products.push({
        odooId: id,
        sku,
        name,
        costPrice: Number(r.standard_price ?? 0),
        sellingPrice: Number(r.list_price ?? 0),
        category,
        unit: String(r.uom_name ?? 'Unit'),
        taxRate,
        stock: Number(r.qty_available ?? 0),
      });
    }

    if (rows.length < PAGE) break;
    offset += PAGE;
  }

  return products;
}

// Push a completed NomadBite transaction to Odoo as a POS order
// Fire-and-forget — caller should catch() this promise
export async function pushTransactionToOdoo(
  creds: OdooCredentials,
  tx: {
    id: string;
    totalAmount: number;
    paymentType: string;
    items: Array<{ sku: string; qty: number; unitPrice: number; name: string }>;
  },
): Promise<void> {
  const sessionId = await getOdooSession(creds);

  // Resolve product.product ids by barcode/sku
  const skus = tx.items.map((i) => i.sku).filter((s) => !s.startsWith('ODOO-'));
  let productMap = new Map<string, number>();

  if (skus.length > 0) {
    const prods = await rpc<Array<{ id: number; barcode: string }>>(
      creds, 'product.product', 'search_read',
      [[['barcode', 'in', skus]]],
      { fields: ['id', 'barcode'] },
    ).catch(() => []);
    productMap = new Map(prods.map((p) => [p.barcode, p.id]));
  }

  // Resolve ODOO-{id} style refs directly
  for (const item of tx.items) {
    if (item.sku.startsWith('ODOO-')) {
      const tmplId = parseInt(item.sku.replace('ODOO-', ''), 10);
      const variants = await rpc<Array<{ id: number }>>(
        creds, 'product.product', 'search_read',
        [[['product_tmpl_id', '=', tmplId]]],
        { fields: ['id'], limit: 1 },
      ).catch(() => []);
      if (variants[0]) productMap.set(item.sku, variants[0].id);
    }
  }

  const orderLines = tx.items
    .filter((i) => productMap.has(i.sku))
    .map((i) => [0, 0, {
      product_id: productMap.get(i.sku),
      qty: i.qty,
      price_unit: i.unitPrice,
      price_subtotal: i.qty * i.unitPrice,
      price_subtotal_incl: i.qty * i.unitPrice,
      name: i.name,
    }]);

  if (orderLines.length === 0) return;

  // Get the first POS config for the session
  const configs = await rpc<Array<{ id: number }>>(
    creds, 'pos.config', 'search_read', [[]], { fields: ['id'], limit: 1 },
  ).catch(() => [] as Array<{ id: number }>);

  if (!configs[0]) return;

  await fetch(`${creds.url}/web/dataset/call_kw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session_id=${sessionId}`,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'call',
      params: {
        model: 'pos.order',
        method: 'create',
        args: [{
          name: `NomadBite-${tx.id}`,
          amount_total: tx.totalAmount,
          amount_paid: tx.totalAmount,
          amount_return: 0,
          lines: orderLines,
          session_id: configs[0].id,
        }],
        kwargs: {},
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
}

export function parseOdooCredentials(raw: unknown): OdooCredentials | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (!c.url || !c.db || !c.login || !c.password) return null;
  return {
    url: String(c.url).replace(/\/$/, ''),
    db: String(c.db),
    login: String(c.login),
    password: String(c.password),
  };
}
