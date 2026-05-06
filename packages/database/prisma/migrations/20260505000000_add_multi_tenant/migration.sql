-- Add SUPERADMIN to Role enum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERADMIN';

-- CreateTable Store
CREATE TABLE "Store" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Store_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for Store.slug unique
CREATE UNIQUE INDEX "Store_slug_key" ON "Store"("slug");

-- Insert default store (backfill target)
INSERT INTO "Store" ("id", "name", "slug", "isActive", "createdAt", "updatedAt")
VALUES ('store_vendor_1', 'NomadBite Vendor 1', 'vendor-1', true, NOW(), NOW());

-- Add storeId columns as NULLABLE first so we can backfill
ALTER TABLE "User" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Item" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Shift" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Transaction" ADD COLUMN "storeId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "storeId" TEXT;
ALTER TABLE "StoreSetting" ADD COLUMN "storeId" TEXT;

-- Backfill all existing rows to the default store
UPDATE "User" SET "storeId" = 'store_vendor_1';
UPDATE "Item" SET "storeId" = 'store_vendor_1';
UPDATE "Shift" SET "storeId" = 'store_vendor_1';
UPDATE "Transaction" SET "storeId" = 'store_vendor_1';
UPDATE "Vendor" SET "storeId" = 'store_vendor_1';
UPDATE "StoreSetting" SET "storeId" = 'store_vendor_1';

-- Make storeId NOT NULL on tables that require it (not User — SUPERADMIN has no store)
ALTER TABLE "Item" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Shift" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Transaction" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "Vendor" ALTER COLUMN "storeId" SET NOT NULL;
ALTER TABLE "StoreSetting" ALTER COLUMN "storeId" SET NOT NULL;

-- Drop old unique constraint on Item.sku and StoreSetting.key
ALTER TABLE "Item" DROP CONSTRAINT IF EXISTS "Item_sku_key";
ALTER TABLE "StoreSetting" DROP CONSTRAINT IF EXISTS "StoreSetting_key_key";

-- Add composite unique constraints
CREATE UNIQUE INDEX "Item_storeId_sku_key" ON "Item"("storeId", "sku");
CREATE UNIQUE INDEX "StoreSetting_storeId_key_key" ON "StoreSetting"("storeId", "key");

-- Add foreign key constraints
ALTER TABLE "User" ADD CONSTRAINT "User_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Item" ADD CONSTRAINT "Item_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Shift" ADD CONSTRAINT "Shift_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StoreSetting" ADD CONSTRAINT "StoreSetting_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Insert SUPERADMIN user (no storeId)
INSERT INTO "User" ("id", "name", "pin", "role", "createdAt", "updatedAt")
VALUES ('superadmin_1', 'Super Admin', '9999', 'SUPERADMIN', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;
