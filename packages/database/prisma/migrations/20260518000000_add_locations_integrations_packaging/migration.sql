-- ─── Phase 2: Multi-Location, Packaging Tiers & Warehouse Integrations ──────

-- 1. New enums
CREATE TYPE "LocationType"    AS ENUM ('WAREHOUSE', 'SHELF', 'DISPLAY', 'TRANSIT', 'OTHER');
CREATE TYPE "IntegrationType" AS ENUM ('CSV', 'WEBHOOK', 'REST_API', 'ODOO', 'QUICKBOOKS', 'SAGE');
CREATE TYPE "SyncDirection"   AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "SyncStatus"      AS ENUM ('SUCCESS', 'PARTIAL', 'FAILED');

-- 2. New columns on Item (supplier info + pricing + reorder)
ALTER TABLE "Item"
    ADD COLUMN IF NOT EXISTS "sellingPrice"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "barcode"       TEXT,
    ADD COLUMN IF NOT EXISTS "supplierName"  TEXT,
    ADD COLUMN IF NOT EXISTS "supplierPhone" TEXT,
    ADD COLUMN IF NOT EXISTS "leadTimeDays"  INTEGER,
    ADD COLUMN IF NOT EXISTS "reorderPoint"  DECIMAL(12,3),
    ADD COLUMN IF NOT EXISTS "reorderQty"    DECIMAL(12,3);

-- 3. PackagingTier
CREATE TABLE "PackagingTier" (
    "id"                   TEXT          NOT NULL,
    "itemId"               TEXT          NOT NULL,
    "name"                 TEXT          NOT NULL,
    "level"                INTEGER       NOT NULL,
    "quantityInBase"       DECIMAL(12,3) NOT NULL,
    "costPrice"            DECIMAL(10,2) NOT NULL,
    "sellingPriceOverride" DECIMAL(10,2),
    "barcode"              TEXT,
    "isBaseUnit"           BOOLEAN       NOT NULL DEFAULT false,
    "createdAt"            TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "PackagingTier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PackagingTier_itemId_name_key"  ON "PackagingTier"("itemId", "name");
CREATE UNIQUE INDEX "PackagingTier_itemId_level_key" ON "PackagingTier"("itemId", "level");
ALTER TABLE "PackagingTier"
    ADD CONSTRAINT "PackagingTier_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. StockLocation
CREATE TABLE "StockLocation" (
    "id"          TEXT           NOT NULL,
    "storeId"     TEXT           NOT NULL,
    "name"        TEXT           NOT NULL,
    "type"        "LocationType" NOT NULL DEFAULT 'WAREHOUSE',
    "description" TEXT,
    "isActive"    BOOLEAN        NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3)   NOT NULL,
    CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StockLocation_storeId_name_key" ON "StockLocation"("storeId", "name");
ALTER TABLE "StockLocation"
    ADD CONSTRAINT "StockLocation_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. ItemStock
CREATE TABLE "ItemStock" (
    "id"         TEXT          NOT NULL,
    "itemId"     TEXT          NOT NULL,
    "locationId" TEXT          NOT NULL,
    "quantity"   DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt"  TIMESTAMP(3)  NOT NULL,
    CONSTRAINT "ItemStock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ItemStock_itemId_locationId_key" ON "ItemStock"("itemId", "locationId");
ALTER TABLE "ItemStock"
    ADD CONSTRAINT "ItemStock_itemId_fkey"
        FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "ItemStock_locationId_fkey"
        FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. StockTransfer
CREATE TABLE "StockTransfer" (
    "id"              TEXT          NOT NULL,
    "storeId"         TEXT          NOT NULL,
    "itemId"          TEXT          NOT NULL,
    "fromLocationId"  TEXT,
    "toLocationId"    TEXT,
    "quantityBase"    DECIMAL(12,3) NOT NULL,
    "packagingTierId" TEXT,
    "quantityInTier"  DECIMAL(12,3),
    "reason"          TEXT,
    "notes"           TEXT,
    "performedById"   TEXT,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "StockTransfer"
    ADD CONSTRAINT "StockTransfer_storeId_fkey"
        FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "StockTransfer_itemId_fkey"
        FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "StockTransfer_fromLocationId_fkey"
        FOREIGN KEY ("fromLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "StockTransfer_toLocationId_fkey"
        FOREIGN KEY ("toLocationId") REFERENCES "StockLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "StockTransfer_packagingTierId_fkey"
        FOREIGN KEY ("packagingTierId") REFERENCES "PackagingTier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. WarehouseIntegration
CREATE TABLE "WarehouseIntegration" (
    "id"            TEXT              NOT NULL,
    "storeId"       TEXT              NOT NULL,
    "name"          TEXT              NOT NULL,
    "type"          "IntegrationType" NOT NULL,
    "syncDirection" "SyncDirection"   NOT NULL DEFAULT 'INBOUND',
    "credentials"   JSONB             NOT NULL DEFAULT '{}',
    "fieldMappings" JSONB             NOT NULL DEFAULT '[]',
    "webhookSecret" TEXT,
    "isActive"      BOOLEAN           NOT NULL DEFAULT false,
    "lastSyncAt"    TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3)      NOT NULL,
    CONSTRAINT "WarehouseIntegration_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WarehouseIntegration_webhookSecret_key"   ON "WarehouseIntegration"("webhookSecret");
CREATE UNIQUE INDEX "WarehouseIntegration_storeId_name_key"    ON "WarehouseIntegration"("storeId", "name");
ALTER TABLE "WarehouseIntegration"
    ADD CONSTRAINT "WarehouseIntegration_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. IntegrationSyncLog
CREATE TABLE "IntegrationSyncLog" (
    "id"             TEXT         NOT NULL,
    "integrationId"  TEXT         NOT NULL,
    "status"         "SyncStatus" NOT NULL,
    "rowsProcessed"  INTEGER      NOT NULL DEFAULT 0,
    "rowsSucceeded"  INTEGER      NOT NULL DEFAULT 0,
    "rowsFailed"     INTEGER      NOT NULL DEFAULT 0,
    "errorMessage"   TEXT,
    "details"        JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntegrationSyncLog_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "IntegrationSyncLog"
    ADD CONSTRAINT "IntegrationSyncLog_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "WarehouseIntegration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
