import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { warmUpDb } from './lib/prisma';
import { productsRouter } from './routes/products';
import { settingsRouter } from './routes/settings';
import { transactionsRouter } from './routes/transactions';
import { usersRouter } from './routes/users';
import { shiftsRouter } from './routes/shifts';
import { vendorsRouter } from './routes/vendors';
import { reportsRouter } from './routes/reports';
import { storesRouter } from './routes/stores';
import { superadminRouter } from './routes/superadmin';
import { mpesaRouter } from './routes/mpesa';
import { imageSyncRouter } from './routes/image-sync';
import { locationsRouter } from './routes/locations';
import { integrationsRouter } from './routes/integrations';
import { customersRouter } from './routes/customers';
import { purchaseOrdersRouter } from './routes/purchase-orders';
import { promosRouter } from './routes/promos';
import { voiceRouter } from './routes/voice';
import { suppliersRouter } from './routes/suppliers';
import { consignmentRouter } from './routes/consignment';

const app = new Hono();

app.use('*', logger());

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'];

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return origin;
    if (allowedOrigins.includes(origin)) return origin;
    if (origin.endsWith('.vercel.app')) return origin;
    return undefined;
  },
}));

app.route('/api/users', usersRouter);
app.route('/api/shifts', shiftsRouter);
app.route('/api/products', productsRouter);
app.route('/api/settings', settingsRouter);
app.route('/api/transactions', transactionsRouter);
app.route('/api/vendors', vendorsRouter);
app.route('/api/reports', reportsRouter);
app.route('/api/stores', storesRouter);
app.route('/api/superadmin', superadminRouter);
app.route('/api/mpesa', mpesaRouter);
app.route('/api/image-sync', imageSyncRouter);
app.route('/api/locations', locationsRouter);
app.route('/api/integrations', integrationsRouter);
app.route('/api/customers', customersRouter);
app.route('/api/purchase-orders', purchaseOrdersRouter);
app.route('/api/promos', promosRouter);
app.route('/api/voice', voiceRouter);
app.route('/api/suppliers', suppliersRouter);
app.route('/api/consignment', consignmentRouter);

app.get('/api/health', (c) => c.json({ status: 'ok', db: 'postgres', port: 3001 }));

app.notFound((c) => c.json({ error: 'Route not found' }, 404));

app.onError((err, c) => {
  console.error('[API Error]', c.req.url, err);
  return c.json({ error: err.message ?? 'Internal server error' }, 500);
});

const PORT = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n  NomadBite API running on http://localhost:${PORT}\n`);
  warmUpDb();
});
