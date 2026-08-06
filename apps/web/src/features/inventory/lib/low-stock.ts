import { Product } from '@/types/pos';

// Falls back to the old flat threshold (< 10) only for items with no
// reorderPoint set, so items without a configured minimum keep behaving as
// before. When reorderPoint is set, "low" matches the edit dialog's own
// wording: at or below the reorder point.
const DEFAULT_LOW_STOCK_THRESHOLD = 10;

export function isLowStock(p: Pick<Product, 'currentStock' | 'reorderPoint'>): boolean {
  if (p.currentStock <= 0) return false;
  if (p.reorderPoint != null) return p.currentStock <= p.reorderPoint;
  return p.currentStock < DEFAULT_LOW_STOCK_THRESHOLD;
}
