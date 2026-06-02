-- Add rounding precision to PackagingTier
-- Defaults to 0.001 (3 decimal places) which matches the existing Decimal(12,3) stock column precision.
ALTER TABLE "PackagingTier"
    ADD COLUMN IF NOT EXISTS "roundingPrecision" DECIMAL(10,6) NOT NULL DEFAULT 0.001;
