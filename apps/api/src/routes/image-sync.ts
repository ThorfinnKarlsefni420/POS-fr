import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { getStoreContext } from '../middleware/store-context';
import { searchProductImage } from '../lib/image-search';
import { uploadUrlToCloudinary } from '../lib/cloudinary-server';

export const imageSyncRouter = new Hono();

interface SyncStatus {
  total: number;
  processed: number;
  success: number;
  failed: number;
  isRunning: boolean;
  lastItem?: string;
}

// Global in-memory status (simplified for this demo)
let syncStatus: Record<string, SyncStatus> = {};

imageSyncRouter.get('/status', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);
  
  return c.json(syncStatus[storeId] || { isRunning: false, processed: 0, total: 0 });
});

imageSyncRouter.post('/start', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (!storeId) return c.json({ error: 'storeId required' }, 400);

  if (syncStatus[storeId]?.isRunning) {
    return c.json({ error: 'Sync already in progress' }, 400);
  }

  // Get items without images
  const items = await prisma.item.findMany({
    where: {
      storeId,
      OR: [
        { imageUrl: null },
        { imageUrl: '' }
      ]
    },
    select: { id: true, name: true }
  });

  if (items.length === 0) {
    return c.json({ message: 'No items need image sync' });
  }

  // Initialize status
  syncStatus[storeId] = {
    total: items.length,
    processed: 0,
    success: 0,
    failed: 0,
    isRunning: true
  };

  // Start background process (don't await)
  (async () => {
    for (const item of items) {
      if (!syncStatus[storeId] || !syncStatus[storeId].isRunning) break;

      try {
        const imageUrl = await searchProductImage(item.name);
        
        if (imageUrl) {
          const cloudinaryUrl = await uploadUrlToCloudinary(imageUrl, `item_${item.id}`);
          
          if (cloudinaryUrl) {
            await prisma.item.update({
              where: { id: item.id },
              data: { imageUrl: cloudinaryUrl }
            });
            syncStatus[storeId].success++;
          } else {
            syncStatus[storeId].failed++;
          }
        } else {
          syncStatus[storeId].failed++;
        }
      } catch (error) {
        console.error(`Failed to sync image for ${item.name}:`, error);
        syncStatus[storeId].failed++;
      }

      syncStatus[storeId].processed++;
      syncStatus[storeId].lastItem = item.name;

      // Rate limiting: wait 2 seconds between items
      // 2000 items * 2 seconds = 4000 seconds (~1 hour)
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (syncStatus[storeId]) {
      syncStatus[storeId].isRunning = false;
    }
  })();

  return c.json({ message: 'Sync started', total: items.length });
});

imageSyncRouter.post('/stop', async (c) => {
  const { storeId } = await getStoreContext(c);
  if (storeId && syncStatus[storeId]) {
    syncStatus[storeId].isRunning = false;
  }
  return c.json({ message: 'Sync stopped' });
});
