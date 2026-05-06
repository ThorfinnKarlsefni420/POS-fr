import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';

export const settingsRouter = new Hono();

const DEFAULTS: Record<string, string> = {
  serviceFeePercent: '5',
  storeName: 'NomadBite POS',
  cloudinaryCloudName: '',
  cloudinaryUploadPreset: '',
};

settingsRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) {
    return c.json({
      serviceFeePercent: Number(DEFAULTS.serviceFeePercent),
      storeName: DEFAULTS.storeName,
      cloudinaryCloudName: DEFAULTS.cloudinaryCloudName,
      cloudinaryUploadPreset: DEFAULTS.cloudinaryUploadPreset,
    });
  }
  const rows = await prisma.storeSetting.findMany({ where: { storeId } });
  const settings: Record<string, string> = { ...DEFAULTS };
  rows.forEach((r) => { settings[r.key] = r.value; });
  return c.json({
    serviceFeePercent: Number(settings.serviceFeePercent),
    storeName: settings.storeName,
    cloudinaryCloudName: settings.cloudinaryCloudName,
    cloudinaryUploadPreset: settings.cloudinaryUploadPreset,
  });
});

settingsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<Record<string, unknown>>();
  await Promise.all(
    Object.entries(body).map(([key, value]) =>
      prisma.storeSetting.upsert({
        where: { storeId_key: { storeId, key } },
        update: { value: String(value) },
        create: { storeId, key, value: String(value) },
      })
    )
  );
  return c.json({ ok: true });
});
