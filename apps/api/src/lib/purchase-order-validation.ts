import { prisma } from './prisma';

// Shared by every path that can create or modify PO lines (today: create-PO;
// future: edit-PO, automated reordering) so the rule lives in exactly one place.

export interface POValidationLine {
  itemId: string;
  tierId?: string | null;
  orderedQty: number;
  unitCost: number;
}

export interface POValidationResult {
  ok: boolean;
  error?: string;
  violations: string[];
}

const EPSILON = 1e-6;

function isMultipleOf(value: number, multiple: number): boolean {
  const remainder = value % multiple;
  return remainder < EPSILON || multiple - remainder < EPSILON;
}

export async function validatePurchaseOrderLines(
  supplierId: string,
  lines: POValidationLine[]
): Promise<POValidationResult> {
  if (lines.length === 0) return { ok: true, violations: [] };

  const [supplier, items, supplierItems] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, name: true, minOrderValue: true },
    }),
    prisma.item.findMany({
      where: { id: { in: lines.map((l) => l.itemId) } },
      select: { id: true, name: true, packagingTiers: { select: { id: true, quantityInBase: true } } },
    }),
    prisma.supplierItem.findMany({
      where: { supplierId, itemId: { in: lines.map((l) => l.itemId) } },
    }),
  ]);

  if (!supplier) return { ok: false, error: 'Supplier not found', violations: [] };

  const itemMap = new Map(items.map((i) => [i.id, i]));
  const termsMap = new Map(supplierItems.map((si) => [si.itemId, si]));

  const violations: string[] = [];
  let totalValue = 0;

  for (const line of lines) {
    totalValue += line.orderedQty * line.unitCost;

    const item = itemMap.get(line.itemId);
    const terms = item ? termsMap.get(line.itemId) : undefined;
    if (!item || !terms) continue; // no known purchasing terms for this supplier+item — nothing to enforce

    // orderedQty is in whatever tier the line was placed in (e.g. "3 cartons");
    // convert to base units before comparing, since MOQ/orderMultiple are always base-unit.
    const tier = line.tierId ? item.packagingTiers.find((t) => t.id === line.tierId) : null;
    const baseQty = tier ? line.orderedQty * Number(tier.quantityInBase) : line.orderedQty;

    if (terms.minOrderQty != null && baseQty < Number(terms.minOrderQty) - EPSILON) {
      violations.push(
        `${item.name}: ordered ${baseQty}, ${supplier.name}'s minimum is ${Number(terms.minOrderQty)}`
      );
    }

    if (terms.orderMultiple != null && Number(terms.orderMultiple) > 0) {
      const multiple = Number(terms.orderMultiple);
      if (!isMultipleOf(baseQty, multiple)) {
        violations.push(
          `${item.name}: ordered ${baseQty}, must be ordered in multiples of ${multiple} for ${supplier.name}`
        );
      }
    }
  }

  if (supplier.minOrderValue != null && totalValue < Number(supplier.minOrderValue) - EPSILON) {
    violations.push(
      `Order total KES ${totalValue.toLocaleString()} is below ${supplier.name}'s minimum order value of KES ${Number(supplier.minOrderValue).toLocaleString()}`
    );
  }

  if (violations.length === 0) return { ok: true, violations: [] };

  return {
    ok: false,
    error: `Purchase order does not meet ${supplier.name}'s requirements: ${violations.join('; ')}`,
    violations,
  };
}
