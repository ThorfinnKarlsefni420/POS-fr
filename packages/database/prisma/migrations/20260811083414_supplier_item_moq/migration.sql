-- ─── Supplier-specific MOQ: SupplierItem, Supplier.minOrderValue, PO.supplierId ───

-- 1. Supplier.minOrderValue
ALTER TABLE "Supplier" ADD COLUMN "minOrderValue" DECIMAL(12,2);

-- 2. SupplierItem
CREATE TABLE "SupplierItem" (
    "id"            TEXT          NOT NULL,
    "supplierId"    TEXT          NOT NULL,
    "itemId"        TEXT          NOT NULL,
    "supplierSku"   TEXT,
    "minOrderQty"   DECIMAL(12,3),
    "orderMultiple" DECIMAL(12,3),
    "leadTimeDays"  INTEGER,
    "isPreferred"   BOOLEAN       NOT NULL DEFAULT false,
    "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "SupplierItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupplierItem_supplierId_itemId_key" ON "SupplierItem"("supplierId", "itemId");
CREATE INDEX "SupplierItem_itemId_idx" ON "SupplierItem"("itemId");
ALTER TABLE "SupplierItem"
    ADD CONSTRAINT "SupplierItem_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierItem"
    ADD CONSTRAINT "SupplierItem_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. PurchaseOrder.supplierId
ALTER TABLE "PurchaseOrder" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "PurchaseOrder"
    ADD CONSTRAINT "PurchaseOrder_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Drop Item.minOrderQty — superseded by SupplierItem.minOrderQty (per-supplier, not per-item).
--    No production data to migrate: verified zero Items had this set before dropping.
ALTER TABLE "Item" DROP COLUMN "minOrderQty";
