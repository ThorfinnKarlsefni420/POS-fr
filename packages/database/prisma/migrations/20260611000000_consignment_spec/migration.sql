-- AlterEnum: add HYBRID to ConsignmentType
ALTER TYPE "ConsignmentType" ADD VALUE 'HYBRID';

-- AlterTable "Supplier": add hybridConfig column
ALTER TABLE "Supplier" ADD COLUMN "hybridConfig" JSONB;

-- AlterTable "ConsignmentSale": add snapshot columns with safe defaults for existing rows
ALTER TABLE "ConsignmentSale"
  ADD COLUMN "settlementType" "ConsignmentType" NOT NULL DEFAULT 'PERCENTAGE_COMMISSION',
  ADD COLUMN "settlementRate"  DECIMAL(10,4);
