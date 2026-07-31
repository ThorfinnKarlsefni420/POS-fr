-- Performance indexes for reports, dashboards, and product search.
--
-- Transaction/Shift/LineItem/InventoryAdjustment/StockTransfer previously had
-- no secondary indexes at all (only primary keys) — every report query
-- (reports.ts: /sales, /vat, /profit, /shifts) filters Transaction/Shift by
-- storeId + a date range, and every product history/adjustment lookup filters
-- by itemId. Without indexes these are full table scans that grow linearly
-- with total transaction volume across all stores.
CREATE INDEX "Transaction_storeId_createdAt_idx" ON "Transaction"("storeId", "createdAt");
CREATE INDEX "Shift_storeId_startTime_idx" ON "Shift"("storeId", "startTime");
CREATE INDEX "LineItem_transactionId_idx" ON "LineItem"("transactionId");
CREATE INDEX "LineItem_itemId_idx" ON "LineItem"("itemId");
CREATE INDEX "InventoryAdjustment_itemId_createdAt_idx" ON "InventoryAdjustment"("itemId", "createdAt");
CREATE INDEX "StockTransfer_itemId_createdAt_idx" ON "StockTransfer"("itemId", "createdAt");
CREATE INDEX "StockTransfer_storeId_idx" ON "StockTransfer"("storeId");

-- Item catalog listing (GET /products) filters by storeId and orders by category.
CREATE INDEX "Item_storeId_category_idx" ON "Item"("storeId", "category");

-- Trigram index so ILIKE/`contains` search on product name/sku (superadmin
-- cross-store search, POS catalog search) can use an index instead of a
-- sequential scan — a plain btree index cannot accelerate substring matches.
-- Not represented in schema.prisma: GIN + operator classes aren't expressible
-- without the `postgresqlExtensions` preview feature, so this is a hand-written
-- migration only, same pattern as 20260727000000_barcode_indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX "Item_name_trgm_idx" ON "Item" USING GIN ("name" gin_trgm_ops);
CREATE INDEX "Item_sku_trgm_idx" ON "Item" USING GIN ("sku" gin_trgm_ops);
