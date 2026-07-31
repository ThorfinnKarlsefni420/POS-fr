-- Barcode Phase 0: uniqueness + indexes for scan lookups.
--
-- Item.barcode: verified zero existing duplicates across all stores, safe to make
-- unique per store. Postgres unique indexes allow multiple NULLs, so items without
-- a barcode are unaffected.
CREATE UNIQUE INDEX "Item_storeId_barcode_key" ON "Item"("storeId", "barcode");

-- PackagingTier.barcode: NOT unique. Existing data has ~1276 tier rows (one store)
-- where a sibling tier on the same item (e.g. "Piece" and "Carton") shares the same
-- barcode — a pre-existing import data-quality issue, not something to silently
-- dedupe here. Index only, for lookup performance; see BARCODE_IMPLEMENTATION_PLAN.md.
CREATE INDEX "PackagingTier_barcode_idx" ON "PackagingTier"("barcode");
