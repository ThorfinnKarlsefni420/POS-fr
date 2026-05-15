-- ─── Phase 1: VAT Engine ─────────────────────────────────────────────────────
-- Kenya VAT Act 2013 — KRA First & Second Schedule
-- Three classes: STANDARD 16%, ZERO-RATED 0%, EXEMPT 0%

-- 1. VatClass lookup table (3 rows, IDs are stable constants)
CREATE TABLE "VatClass" (
    "id"               TEXT NOT NULL,
    "code"             TEXT NOT NULL,
    "label"            TEXT NOT NULL,
    "rate"             DECIMAL(5,4) NOT NULL,
    "etimsCode"        TEXT NOT NULL,
    "kraRef"           TEXT,
    "canClaimInputVat" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "VatClass_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VatClass_code_key" ON "VatClass"("code");

INSERT INTO "VatClass" ("id","code","label","rate","etimsCode","canClaimInputVat") VALUES
  ('vatcls_standard', 'STANDARD', 'Standard 16%', 0.1600, 'VAT',        false),
  ('vatcls_zero',     'ZERO',     'Zero-Rated',   0.0000, 'ZERO',       true),
  ('vatcls_exempt',   'EXEMPT',   'Exempt',       0.0000, 'NONTAXABLE', false);

-- 2. CategoryVat lookup table (44 rows — one per category)
CREATE TABLE "CategoryVat" (
    "id"           TEXT NOT NULL,
    "category"     TEXT NOT NULL,
    "vatClassId"   TEXT NOT NULL,
    "hasOverrides" BOOLEAN NOT NULL DEFAULT false,
    "notes"        TEXT,
    CONSTRAINT "CategoryVat_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CategoryVat_vatClassId_fkey" FOREIGN KEY ("vatClassId")
        REFERENCES "VatClass"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CategoryVat_category_key" ON "CategoryVat"("category");

INSERT INTO "CategoryVat" ("id","category","vatClassId","hasOverrides","notes") VALUES
  -- Zero-Rated (KRA Second Schedule)
  ('catv_rice',      'Rice',                        'vatcls_zero',     false, 'Milled rice only. KRA ref 0039.11.65'),
  ('catv_flour',     'Flour & Grains',              'vatcls_zero',     false, 'Maize/wheat/cassava flour. KRA ref 0022.12.00'),
  ('catv_dairy',     'Dairy & Milk',                'vatcls_zero',     true,  'Fresh/pasteurized only. Flavoured = 16%. KRA ref 0015.12.00'),
  ('catv_oil',       'Cooking Oil',                 'vatcls_zero',     false, 'Edible vegetable oils only. KRA ref 0009-0016'),
  -- Exempt (KRA First Schedule)
  ('catv_beans',     'Beans & Legumes',             'vatcls_exempt',   false, 'Unprocessed. KRA ref 0004-0006'),
  ('catv_sugar',     'Sugar & Salt',                'vatcls_exempt',   false, 'KRA ref 0025.11.00'),
  ('catv_cereals',   'Cereals & Breakfast',         'vatcls_exempt',   false, 'Unprocessed cereals. KRA ref 0025.11.00'),
  ('catv_dates',     'Dates & Dry Fruits',          'vatcls_exempt',   false, 'Unprocessed'),
  ('catv_nuts',      'Nuts & Dry Fruits',           'vatcls_exempt',   false, 'Unprocessed'),
  ('catv_infant',    'Infant Formula & Baby Food',  'vatcls_exempt',   false, 'KRA ref 0039.11.62, 0039.11.70'),
  ('catv_baby',      'Baby Products',               'vatcls_exempt',   false, 'KRA ref 0039.11.70, 0142.11.00'),
  ('catv_diapers',   'Diapers & Baby Products',     'vatcls_exempt',   false, 'KRA ref 0142.11.00'),
  ('catv_health',    'Health & Supplements',        'vatcls_exempt',   false, 'Food supplements. KRA ref 0039.11.84'),
  -- Water: SPLIT — defaults to Exempt; bottled/mineral/sparkling need per-item override
  ('catv_water',     'Water',                       'vatcls_exempt',   true,  'SPLIT: bottled/mineral/sparkling = Standard 16%. Tap/natural = Exempt. Requires per-item confirmation.'),
  -- Standard 16%
  ('catv_cakes',     'Cakes & Baked Goods',         'vatcls_standard', true,  'Plain bread/loaf override to Zero-Rated. KRA ref 0013.12.02'),
  ('catv_bev',       'Beverages & Juices',          'vatcls_standard', false, NULL),
  ('catv_energy',    'Energy Drinks',               'vatcls_standard', false, NULL),
  ('catv_biscuits',  'Biscuits & Snacks',           'vatcls_standard', false, NULL),
  ('catv_choc',      'Chocolate & Confectionery',   'vatcls_standard', false, NULL),
  ('catv_tea',       'Tea & Coffee',                'vatcls_standard', false, 'Unprocessed green tea leaf = Exempt'),
  ('catv_pasta',     'Pasta & Noodles',             'vatcls_standard', false, NULL),
  ('catv_canned',    'Canned & Tinned Food',        'vatcls_standard', false, NULL),
  ('catv_cond',      'Condiments & Spreads',        'vatcls_standard', false, NULL),
  ('catv_sauces',    'Sauces & Condiments',         'vatcls_standard', false, NULL),
  ('catv_tomato',    'Tomato Paste & Sauce',        'vatcls_standard', false, NULL),
  ('catv_spices',    'Spices & Seasoning',          'vatcls_standard', false, NULL),
  ('catv_baking',    'Baking Ingredients',          'vatcls_standard', false, NULL),
  ('catv_fat',       'Cooking Fat & Ghee',          'vatcls_standard', false, NULL),
  ('catv_soap',      'Bar Soap',                    'vatcls_standard', false, NULL),
  ('catv_deterg',    'Detergents & Cleaning',       'vatcls_standard', false, NULL),
  ('catv_bleach',    'Bleach & Disinfectant',       'vatcls_standard', false, NULL),
  ('catv_hhold',     'Household & Cleaning',        'vatcls_standard', false, NULL),
  ('catv_washing',   'Washing Powder & Detergent',  'vatcls_standard', false, NULL),
  ('catv_personal',  'Personal Care & Hygiene',     'vatcls_standard', false, NULL),
  ('catv_shampoo',   'Shampoo & Hair Care',         'vatcls_standard', false, NULL),
  ('catv_skin',      'Skin Care & Lotions',         'vatcls_standard', false, NULL),
  ('catv_perfume',   'Perfumes & Fragrances',       'vatcls_standard', false, NULL),
  ('catv_tissue',    'Tissue & Paper Products',     'vatcls_standard', false, NULL),
  ('catv_candles',   'Candles & Matches',           'vatcls_standard', false, NULL),
  ('catv_stat',      'Stationery & School',         'vatcls_standard', false, NULL),
  ('catv_elec',      'Electrical Items',            'vatcls_standard', false, NULL),
  ('catv_motor',     'Motor Oil & Non-Food',        'vatcls_standard', false, NULL),
  ('catv_svc',       'Services & Charges',          'vatcls_standard', false, 'Unless specifically listed as exempt'),
  ('catv_general',   'Other - General Merchandise', 'vatcls_standard', false, 'Verify individual items with KRA');

-- 3. New columns on Item
ALTER TABLE "Item"
    ADD COLUMN "vatClassId"           TEXT,
    ADD COLUMN "vatOverrideReason"    TEXT,
    ADD COLUMN "etimsItemCode"        TEXT,
    ADD COLUMN "needsVatConfirmation" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Item"
    ADD CONSTRAINT "Item_vatClassId_fkey"
        FOREIGN KEY ("vatClassId") REFERENCES "VatClass"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. New columns on LineItem (defaults safe for historical rows)
ALTER TABLE "LineItem"
    ADD COLUMN "vatRate"   DECIMAL(5,4)  NOT NULL DEFAULT 0,
    ADD COLUMN "etimsCode" TEXT          NOT NULL DEFAULT 'VAT',
    ADD COLUMN "vatAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "netAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Backfill historical LineItems: netAmount = soldPrice (VAT was never charged before)
UPDATE "LineItem" SET "netAmount" = "soldPrice";

-- 5. New columns on Transaction
ALTER TABLE "Transaction"
    ADD COLUMN "totalZeroKes"     DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "totalExemptKes"   DECIMAL(10,2) NOT NULL DEFAULT 0,
    ADD COLUMN "etimsReceiptNo"   TEXT,
    ADD COLUMN "etimsQrCode"      TEXT,
    ADD COLUMN "submittedToEtims" BOOLEAN NOT NULL DEFAULT false;

-- 6. Backfill: assign vatClassId to existing Items via category match (case-insensitive)
UPDATE "Item" i
SET "vatClassId" = cv."vatClassId"
FROM "CategoryVat" cv
WHERE LOWER(TRIM(i."category")) = LOWER(TRIM(cv."category"));

-- 7. Sync legacy taxRate from VatClass so old code reading taxRate stays consistent
UPDATE "Item" i
SET "taxRate" = (vc."rate" * 100)
FROM "VatClass" vc
WHERE vc."id" = i."vatClassId";

-- 8. Per-item override flags (items that need manual VAT confirmation in the UI)

-- Water: bottled/mineral/sparkling items should be Standard 16%, not Exempt
UPDATE "Item"
SET "needsVatConfirmation" = true
WHERE LOWER("category") = 'water'
  AND (
    LOWER("name") LIKE '%mineral%'
    OR LOWER("name") LIKE '%sparkling%'
    OR LOWER("name") LIKE '%bottled%'
  );

-- Cakes & Baked Goods: items likely to be Zero-Rated plain bread
UPDATE "Item"
SET "needsVatConfirmation" = true
WHERE LOWER("category") = 'cakes & baked goods'
  AND (LOWER("name") LIKE '%bread%' OR LOWER("name") LIKE '%loaf%');

-- Dairy & Milk: flavoured/yoghurt items may be Standard 16%
UPDATE "Item"
SET "needsVatConfirmation" = true
WHERE LOWER("category") = 'dairy & milk'
  AND (
    LOWER("name") LIKE '%flavour%'
    OR LOWER("name") LIKE '%yoghurt%'
    OR LOWER("name") LIKE '%yogurt%'
    OR LOWER("name") LIKE '%drinking%'
  );
