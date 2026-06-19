CREATE TABLE "InventoryAnomaly" (
  "id"         TEXT         NOT NULL,
  "storeId"    TEXT         NOT NULL,
  "sourceId"   TEXT         NOT NULL,
  "name"       TEXT         NOT NULL,
  "reason"     TEXT         NOT NULL,
  "notes"      TEXT         NOT NULL,
  "resolved"   BOOLEAN      NOT NULL DEFAULT false,
  "resolvedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryAnomaly_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InventoryAnomaly_storeId_idx"          ON "InventoryAnomaly"("storeId");
CREATE INDEX "InventoryAnomaly_storeId_resolved_idx" ON "InventoryAnomaly"("storeId", "resolved");

ALTER TABLE "InventoryAnomaly"
  ADD CONSTRAINT "InventoryAnomaly_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
