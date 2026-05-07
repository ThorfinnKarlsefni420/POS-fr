import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
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

const app = new Hono();

app.use('*', logger());

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'];

app.use('*', cors({ origin: allowedOrigins }));

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

app.get('/api/health', (c) => c.json({ status: 'ok', db: 'postgres', port: 3001 }));

const PORT = Number(process.env.PORT ?? 3001);
serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`\n  NomadBite API running on http://localhost:${PORT}\n`);
});
