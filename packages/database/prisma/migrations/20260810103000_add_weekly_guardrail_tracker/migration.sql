CREATE TABLE "WeeklyGuardrailEntry" (
  "id"                  TEXT           NOT NULL,
  "storeId"             TEXT           NOT NULL,
  "weekStart"           TIMESTAMP(3)   NOT NULL,
  "revenue"             DECIMAL(12,2)  NOT NULL DEFAULT 0,
  "cogs"                DECIMAL(12,2)  NOT NULL DEFAULT 0,
  "avgInventoryValue"   DECIMAL(12,2)  NOT NULL DEFAULT 0,
  "deliverySubsidyCost" DECIMAL(12,2)  NOT NULL DEFAULT 0,
  "marketingSpend"      DECIMAL(12,2)  NOT NULL DEFAULT 0,
  "firstOrderRevenue"   DECIMAL(12,2)  NOT NULL DEFAULT 0,
  "newCustomers"        INTEGER        NOT NULL DEFAULT 0,
  "notes"               TEXT,
  "createdAt"           TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "WeeklyGuardrailEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WeeklyGuardrailEntry_storeId_weekStart_key" ON "WeeklyGuardrailEntry"("storeId", "weekStart");
CREATE INDEX "WeeklyGuardrailEntry_storeId_weekStart_idx"        ON "WeeklyGuardrailEntry"("storeId", "weekStart");

ALTER TABLE "WeeklyGuardrailEntry"
  ADD CONSTRAINT "WeeklyGuardrailEntry_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReorderCohort" (
  "id"                   TEXT           NOT NULL,
  "storeId"              TEXT           NOT NULL,
  "cohortStartDate"      TIMESTAMP(3)   NOT NULL,
  "newCustomersInCohort" INTEGER        NOT NULL DEFAULT 0,
  "reorderedCount"       INTEGER,
  "notes"                TEXT,
  "createdAt"            TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3)   NOT NULL,
  CONSTRAINT "ReorderCohort_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReorderCohort_storeId_cohortStartDate_key" ON "ReorderCohort"("storeId", "cohortStartDate");
CREATE INDEX "ReorderCohort_storeId_cohortStartDate_idx"        ON "ReorderCohort"("storeId", "cohortStartDate");

ALTER TABLE "ReorderCohort"
  ADD CONSTRAINT "ReorderCohort_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
