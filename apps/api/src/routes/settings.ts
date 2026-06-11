import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';
import { SETTINGS_DEFINITIONS, parseValue, normalizeValue, getSettings } from '../lib/settings';

export const settingsRouter = new Hono();

settingsRouter.get('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  
  if (!storeId) {
    const defaultSettings: Record<string, any> = {};
    for (const key in SETTINGS_DEFINITIONS) {
      defaultSettings[key] = SETTINGS_DEFINITIONS[key].default;
    }
    return c.json(defaultSettings);
  }

  const settings = await getSettings(storeId);
  return c.json(settings);
});

settingsRouter.post('/', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  const body = await c.req.json<Record<string, unknown>>();
  await Promise.all(
    Object.entries(body).map(([key, value]) =>
      prisma.storeSetting.upsert({
        where: { storeId_key: { storeId, key } },
        update: { value: normalizeValue(key, value) },
        create: { storeId, key, value: normalizeValue(key, value) },
      })
    )
  );
  return c.json({ ok: true });
});
