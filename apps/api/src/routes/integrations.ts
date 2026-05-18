import { Hono } from 'hono';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';
import { runSync, parseCsv, resolvePath, FieldMapping } from '../lib/sync-engine';

export const integrationsRouter = new Hono();

// ── List integrations ─────────────────────────────────────────────────────────

integrationsRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const integrations = await prisma.warehouseIntegration.findMany({
    where: { storeId },
    include: { _count: { select: { syncLogs: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return c.json(integrations.map((i) => ({
    id: i.id,
    name: i.name,
    type: i.type,
    syncDirection: i.syncDirection,
    isActive: i.isActive,
    lastSyncAt: i.lastSyncAt,
    webhookSecret: i.webhookSecret,
    credentials: i.credentials,
    fieldMappings: i.fieldMappings,
    syncCount: i._count.syncLogs,
    createdAt: i.createdAt,
  })));
});

// ── Create integration ────────────────────────────────────────────────────────

integrationsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<{
    name: string;
    type: string;
    syncDirection?: string;
    credentials?: Record<string, unknown>;
    fieldMappings?: FieldMapping[];
    isActive?: boolean;
  }>();

  if (!body.name?.trim()) return c.json({ error: 'name is required' }, 400);
  if (!body.type) return c.json({ error: 'type is required' }, 400);

  const webhookSecret = body.type === 'WEBHOOK'
    ? randomBytes(24).toString('hex')
    : null;

  const integration = await prisma.warehouseIntegration.create({
    data: {
      storeId,
      name: body.name.trim(),
      type: body.type as never,
      syncDirection: (body.syncDirection ?? 'INBOUND') as never,
      credentials: (body.credentials ?? {}) as never,
      fieldMappings: (body.fieldMappings ?? []) as never,
      webhookSecret,
      isActive: body.isActive ?? false,
    },
  });

  return c.json(integration, 201);
});

// ── Update integration ────────────────────────────────────────────────────────

integrationsRouter.patch('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.warehouseIntegration.findUnique({ where: { id } });
  if (!existing) return c.json({ error: 'Integration not found' }, 404);

  const body = await c.req.json<{
    name?: string;
    credentials?: Record<string, unknown>;
    fieldMappings?: FieldMapping[];
    isActive?: boolean;
    syncDirection?: string;
  }>();

  const updated = await prisma.warehouseIntegration.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.credentials !== undefined && { credentials: body.credentials as never }),
      ...(body.fieldMappings !== undefined && { fieldMappings: body.fieldMappings as never }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      ...(body.syncDirection !== undefined && { syncDirection: body.syncDirection as never }),
    },
  });

  return c.json(updated);
});

// ── Delete integration ────────────────────────────────────────────────────────

integrationsRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.warehouseIntegration.findUnique({ where: { id } });
  if (!existing) return c.json({ error: 'Integration not found' }, 404);
  await prisma.warehouseIntegration.delete({ where: { id } });
  return c.json({ ok: true });
});

// ── Sync logs ─────────────────────────────────────────────────────────────────

integrationsRouter.get('/:id/logs', async (c) => {
  const id = c.req.param('id');
  const limit = Math.min(Number(c.req.query('limit') ?? 20), 100);

  const logs = await prisma.integrationSyncLog.findMany({
    where: { integrationId: id },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return c.json(logs);
});

// ── Trigger manual sync ───────────────────────────────────────────────────────

integrationsRouter.post('/:id/sync', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const id = c.req.param('id');
  const integration = await prisma.warehouseIntegration.findUnique({ where: { id } });
  if (!integration) return c.json({ error: 'Integration not found' }, 404);
  if (integration.storeId !== storeId) return c.json({ error: 'Forbidden' }, 403);

  const mappings = integration.fieldMappings as FieldMapping[];
  let rows: Record<string, unknown>[] = [];
  let fetchError: string | null = null;

  const body = await c.req.json<{ rows?: Record<string, unknown>[]; csvText?: string }>().catch(() => ({}));

  if (body.rows) {
    // Rows sent directly (CSV pre-parsed client-side)
    rows = body.rows;
  } else if (body.csvText) {
    rows = parseCsv(body.csvText);
  } else if (['REST_API', 'ODOO', 'QUICKBOOKS', 'SAGE'].includes(integration.type)) {
    // Fetch from remote URL
    const creds = integration.credentials as Record<string, string>;
    const url = creds.url;
    if (!url) {
      fetchError = 'No URL configured for this integration.';
    } else {
      try {
        const headers: Record<string, string> = { 'Accept': 'application/json' };
        if (creds.authHeader && creds.authValue) {
          headers[creds.authHeader] = creds.authValue;
        }
        const resp = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        const data = await resp.json();
        const resolved = resolvePath(data, creds.responsePath ?? '');
        rows = Array.isArray(resolved) ? resolved : [];
        if (rows.length === 0 && !creds.responsePath) {
          fetchError = `Response is not an array. Set a Response Path (e.g. "items" or "data.products").`;
        }
      } catch (e) {
        fetchError = (e as Error).message;
      }
    }
  }

  if (fetchError) {
    const log = await prisma.integrationSyncLog.create({
      data: {
        integrationId: id,
        status: 'FAILED',
        rowsProcessed: 0,
        rowsSucceeded: 0,
        rowsFailed: 0,
        errorMessage: fetchError,
      },
    });
    return c.json({ ok: false, log });
  }

  const result = await runSync(prisma as never, storeId, mappings, rows);
  const status = result.rowsFailed === 0 ? 'SUCCESS' : result.rowsSucceeded > 0 ? 'PARTIAL' : 'FAILED';

  const log = await prisma.integrationSyncLog.create({
    data: {
      integrationId: id,
      status: status as never,
      rowsProcessed: result.rowsProcessed,
      rowsSucceeded: result.rowsSucceeded,
      rowsFailed: result.rowsFailed,
      errorMessage: result.errors.length > 0 ? result.errors.slice(0, 5).join(' | ') : null,
      details: result.errors.length > 0 ? { errors: result.errors } as never : undefined,
    },
  });

  await prisma.warehouseIntegration.update({
    where: { id },
    data: { lastSyncAt: new Date() },
  });

  return c.json({ ok: true, result, log });
});

// ── Inbound webhook (no auth — secret in URL) ─────────────────────────────────

integrationsRouter.post('/webhook/:secret', async (c) => {
  const secret = c.req.param('secret');

  const integration = await prisma.warehouseIntegration.findUnique({
    where: { webhookSecret: secret },
  });

  if (!integration || integration.type !== 'WEBHOOK' || !integration.isActive) {
    return c.json({ error: 'Invalid or inactive webhook' }, 404);
  }

  const body = await c.req.json<unknown>().catch(() => ({}));
  const mappings = integration.fieldMappings as FieldMapping[];

  // Accept array directly or wrapped in a key
  let rows: Record<string, unknown>[];
  if (Array.isArray(body)) {
    rows = body;
  } else if (body && typeof body === 'object') {
    // Try common envelope keys
    const wrapped = (body as Record<string, unknown>);
    const candidate = wrapped.items ?? wrapped.products ?? wrapped.data ?? wrapped.rows;
    rows = Array.isArray(candidate) ? candidate : [wrapped];
  } else {
    rows = [];
  }

  const result = await runSync(prisma as never, integration.storeId, mappings, rows);
  const status = result.rowsFailed === 0 ? 'SUCCESS' : result.rowsSucceeded > 0 ? 'PARTIAL' : 'FAILED';

  await prisma.integrationSyncLog.create({
    data: {
      integrationId: integration.id,
      status: status as never,
      rowsProcessed: result.rowsProcessed,
      rowsSucceeded: result.rowsSucceeded,
      rowsFailed: result.rowsFailed,
      errorMessage: result.errors.slice(0, 5).join(' | ') || null,
    },
  });

  await prisma.warehouseIntegration.update({
    where: { id: integration.id },
    data: { lastSyncAt: new Date() },
  });

  return c.json({ ok: true, rowsProcessed: result.rowsProcessed, rowsSucceeded: result.rowsSucceeded });
});
