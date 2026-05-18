# Product Catalogue Restructure — Full Implementation Spec

## Overview

Collapse the current flat DB (one row per packaging unit) into a proper product-family model:
one `Item` per product, with `PackagingTier` rows for each size/case level.

**Source data:** 3,033 vendor rows → collapsed into **1,707 product families**  
**Attached Excel:** `vendor_catalogue_phase1.xlsx` — Phase 1 vendor fill sheet (ready to send)

---

## Data model

### Current (flat)

```
items
  id            UUID PK
  name          TEXT          -- e.g. "SPARONI SP 20*500G"
  buyingPrice   DECIMAL
  sellingPrice  DECIMAL
  vat           INT
  uomId         TEXT          -- CT, PC, BL, OT, BG, KG ...
  itemsBalance  DECIMAL
  barCode       TEXT
  category      TEXT
```

### Target

```
items
  id              UUID PK
  vendorCode      TEXT UNIQUE   -- short stable key, slugified from name
  name            TEXT          -- clean canonical name e.g. "Sparoni Spaghetti Pasta 500g"
  brand           TEXT
  category        TEXT
  vat             INT           -- 0, 8, or 16
  baseUnit        TEXT          -- "Piece" | "Kilogram" | "Litre" | "Each"
  baseCostKES     DECIMAL
  baseSellKES     DECIMAL
  baseBarcode     TEXT
  currentStock    DECIMAL       -- always in base units
  reorderPoint    DECIMAL
  leadTimeDays    INT
  createdAt       TIMESTAMPTZ
  updatedAt       TIMESTAMPTZ

packaging_tiers
  id              UUID PK
  itemId          UUID FK → items.id  ON DELETE CASCADE
  level           INT           -- 1, 2, or 3
  name            TEXT          -- "Dozen", "Carton", "Bale"
  qtyInBase       INT           -- ALWAYS expressed in base units
                                -- level 1: direct qty
                                -- level 2: L1qty × L2qty  (system computes)
                                -- level 3: L1qty × L2qty × L3qty
  costKES         DECIMAL
  sellKES         DECIMAL
  barcode         TEXT
  createdAt       TIMESTAMPTZ

-- optional: keep old rows temporarily for audit
legacy_items
  id              UUID
  originalName    TEXT
  uomId           TEXT
  buyingPrice     DECIMAL
  sellingPrice    DECIMAL
  itemsBalance    DECIMAL
  migratedItemId  UUID FK → items.id
  migratedAt      TIMESTAMPTZ
```

### Key rule: `qtyInBase` calculation

```
Level 1 qtyInBase = L1QtyInBase          (e.g. 12)
Level 2 qtyInBase = L1QtyInBase × L2QtyInL1   (e.g. 12 × 24 = 288)
Level 3 qtyInBase = L1 × L2 × L3
```

---

## Phase 1 — Vendor fill Excel (`vendor_catalogue_phase1.xlsx`)

Already generated. Structure:

| Column group | Columns | Fill rule |
|---|---|---|
| Product info | Item Name, Category, ✏️ Correct Name, ✏️ Brand, VAT% | Yellow = vendor fills |
| Base unit | Base Unit, Base Cost, Base Sell, Base Stock, Base Barcode | Green = pre-filled |
| Level 1 | ✏️ L1 Pack Name, ✏️ L1 Qty in Base, L1 Cost, L1 Sell, L1 Stock | Mixed |
| Level 2 | ✏️ L2 Pack Name, ✏️ L2 Qty in L1, L2 Cost, L2 Sell, L2 Stock | Mixed |
| Ops | ✏️ Reorder Point, ✏️ Lead Time Days, Notes (auto) | Yellow / auto |

- 428 rows have a `Notes` column pre-filled with a quantity clue extracted from the product name (e.g. `"20*500G"` → _"Name suggests 20 units per pack — confirm L1 or L2 qty"_). Vendor only needs to tick/confirm.
- Category and VAT dropdowns are built into the sheet.

**Send to vendor → they return filled → run Phase 3 import.**

---

## Phase 2 — (Manual) Vendor returns the Excel

No code needed. Receive the filled `.xlsx` file.

---

## Phase 3 — Import pipeline

### Script: `scripts/import_vendor_catalogue.ts` (or `.py`)

**Input:** filled `vendor_catalogue_phase1.xlsx`, sheet `Products`

**Expected columns (in order):**

```
A  ItemName           (DB key — do not rename)
B  Category
C  CorrectName        (vendor filled)
D  Brand
E  VAT%
F  BaseUnit
G  BaseCostKES
H  BaseSellKES
I  BaseStock
J  BaseBarcode
K  L1Name
L  L1QtyInBase
M  L1CostKES
N  L1SellKES
O  L1Stock
P  L2Name
Q  L2QtyInL1
R  L2CostKES
S  L2SellKES
T  L2Stock
U  ReorderPoint
V  LeadTimeDays
W  Notes
```

### Import algorithm (row by row)

```typescript
for each row in sheet (skip rows 1-2 = headers):

  1. RESOLVE NAME
     canonicalName = row.CorrectName?.trim() || row.ItemName.trim()
     vendorCode    = slugify(row.ItemName)   // stable key from original DB name

  2. UPSERT ITEM
     ON CONFLICT (vendorCode) DO UPDATE
     item = {
       vendorCode,
       name:         canonicalName,
       brand:        row.Brand || null,
       category:     row.Category,
       vat:          parseInt(row['VAT%']) || 0,
       baseUnit:     row.BaseUnit || 'Piece',
       baseCostKES:  parseFloat(row.BaseCostKES) || null,
       baseSellKES:  parseFloat(row.BaseSellKES) || null,
       baseBarcode:  row.BaseBarcode || null,
       reorderPoint: parseFloat(row.ReorderPoint) || null,
       leadTimeDays: parseInt(row.LeadTimeDays) || null,
     }

  3. CONVERT & SET STOCK
     // Stock in the Excel is in the unit of each tier row (not base units)
     // Sum all tiers, convert to base:
     baseStock = 0
     if row.BaseStock:  baseStock += row.BaseStock
     if row.L1Stock && row.L1QtyInBase:
       baseStock += row.L1Stock * row.L1QtyInBase
     if row.L2Stock && row.L1QtyInBase && row.L2QtyInL1:
       baseStock += row.L2Stock * row.L1QtyInBase * row.L2QtyInL1

     item.currentStock = baseStock

  4. DELETE OLD PACKAGING TIERS for this item (full replace strategy)

  5. INSERT PACKAGING TIERS
     if row.L1Name is filled:
       qtyInBase_L1 = parseInt(row.L1QtyInBase)
       insert packaging_tier {
         itemId, level: 1,
         name:       row.L1Name,
         qtyInBase:  qtyInBase_L1,
         costKES:    row.L1CostKES,
         sellKES:    row.L1SellKES,
       }

     if row.L2Name is filled:
       qtyInBase_L2 = qtyInBase_L1 * parseInt(row.L2QtyInL1)
       insert packaging_tier {
         itemId, level: 2,
         name:       row.L2Name,
         qtyInBase:  qtyInBase_L2,
         costKES:    row.L2CostKES,
         sellKES:    row.L2SellKES,
       }

  6. ARCHIVE LEGACY ROWS
     INSERT INTO legacy_items (SELECT old rows WHERE name ILIKE '%' || itemName + '%')
     SET migratedItemId = new item.id

  7. LOG result: upserted / created / skipped
```

### Error handling

```
- Missing L1QtyInBase when L1Name is set → log warning, skip tier, continue
- Unparseable numeric → treat as null, log
- Duplicate vendorCode collision on different names → log error, skip row
- Empty CorrectName AND empty ItemName → skip row
```

### CLI usage

```bash
# Dry run (validates, prints summary, no DB writes)
npx ts-node scripts/import_vendor_catalogue.ts --file vendor_catalogue_phase1.xlsx --dry-run

# Live import
npx ts-node scripts/import_vendor_catalogue.ts --file vendor_catalogue_phase1.xlsx

# Scope to one category
npx ts-node scripts/import_vendor_catalogue.ts \
  --file vendor_catalogue_phase1.xlsx \
  --category "Staples - Rice"
```

### Expected output log

```
✔  Upserted:  1,612  items
✔  Created:     95   new items  
⚠  Warnings:   43   (missing L1 qty — tiers skipped)
✗  Errors:       2   (see import_errors.log)
   Total stock converted: 284,130 base units
```

---

## Phase 4 — Ongoing updates

The same Excel template (filtered to a category or supplier subset) is re-sent for updates.

The import script runs in **upsert mode** — `ON CONFLICT (vendorCode) DO UPDATE` — so re-importing is safe and idempotent.

To generate a filtered update sheet:

```bash
npx ts-node scripts/generate_vendor_sheet.ts \
  --category "Staples - Rice" \
  --output rice_update_$(date +%Y%m%d).xlsx
```

---

## API endpoints to add

```
POST   /api/admin/import-catalogue          # triggers Phase 3 script
GET    /api/admin/import-catalogue/status   # last run log
GET    /api/items/:id/packaging-tiers       # returns tiers for POS/receiving
PUT    /api/items/:id/packaging-tiers       # update tiers directly
```

### `GET /api/items/:id/packaging-tiers` response

```json
{
  "item": {
    "id": "uuid",
    "name": "Sparoni Spaghetti Pasta 500g",
    "baseUnit": "Piece",
    "baseCostKES": 85.00,
    "baseSellKES": 100.00,
    "currentStock": 1238
  },
  "tiers": [
    { "level": 1, "name": "Carton of 20", "qtyInBase": 20, "costKES": 1700, "sellKES": 2000 }
  ]
}
```

---

## Open questions (confirm before building Phase 3)

| # | Question | Default assumption |
|---|---|---|
| 1 | L2 Qty meaning: "how many L1 per L2" or "how many base per L2"? | **How many L1 per L2** (more natural for vendors) — system multiplies |
| 2 | Stock conversion on migration: auto-convert CT/BL stock to base units? | **Yes, auto-convert** using tier qty if available |
| 3 | First import scope: all 1,707 families or just 428 with qty clues? | **All 1,707** — but flag the 428 as high-confidence, others as needs-review |
| 4 | Legacy rows: hard delete after migration or keep in `legacy_items`? | **Keep in legacy_items** for 90 days, then archive |

---

## File map

```
vendor_catalogue_phase1.xlsx   ← send to vendor (Phase 1)
PRODUCT_CATALOGUE_SPEC.md      ← this file (IDE agent reference)

scripts/
  import_vendor_catalogue.ts   ← Phase 3 import (build this)
  generate_vendor_sheet.ts     ← Phase 4 re-export (build this)

db/migrations/
  001_add_packaging_tiers.sql  ← new table
  002_add_items_vendorcode.sql ← add vendorCode + new fields to items
  003_create_legacy_items.sql  ← archive table
```

---

## Migration SQL (starter)

```sql
-- 002_add_items_vendorcode.sql
ALTER TABLE items
  ADD COLUMN vendorCode    TEXT UNIQUE,
  ADD COLUMN brand         TEXT,
  ADD COLUMN baseUnit      TEXT DEFAULT 'Piece',
  ADD COLUMN baseCostKES   DECIMAL(12,2),
  ADD COLUMN baseSellKES   DECIMAL(12,2),
  ADD COLUMN baseBarcode   TEXT,
  ADD COLUMN currentStock  DECIMAL(12,3) DEFAULT 0,
  ADD COLUMN reorderPoint  DECIMAL(12,3),
  ADD COLUMN leadTimeDays  INT;

-- 001_add_packaging_tiers.sql
CREATE TABLE packaging_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itemId      UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  level       INT NOT NULL CHECK (level IN (1,2,3)),
  name        TEXT NOT NULL,
  qtyInBase   INT  NOT NULL CHECK (qtyInBase > 0),
  costKES     DECIMAL(12,2),
  sellKES     DECIMAL(12,2),
  barcode     TEXT,
  createdAt   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (itemId, level)
);

-- 003_create_legacy_items.sql
CREATE TABLE legacy_items (
  id              UUID,
  originalName    TEXT,
  uomId           TEXT,
  buyingPrice     DECIMAL(12,2),
  sellingPrice    DECIMAL(12,2),
  itemsBalance    DECIMAL(12,3),
  migratedItemId  UUID REFERENCES items(id),
  migratedAt      TIMESTAMPTZ DEFAULT now()
);
```

# Product Catalogue Restructure — Implementation Spec
_Last updated: consolidated from guure.xls + Vendor_list_prototype.xlsx + vendor_catalogue_phase1.xlsx_

---

## What changed from v1

| Area | v1 assumption | v2 (this spec) |
|---|---|---|
| Source of truth | vendor_catalogue_phase1.xlsx only | All 3 files merged; guure.xls is the authoritative DB export |
| Families | 1,707 (same) | 1,707 — confirmed stable |
| Barcode field | "from DB if present" | No barcodes in DB yet — vendor fills `BaseBarcode` |
| Pre-filled qty | 428 rows had name clues | **506 L2 qtys + 113 L1 qtys pre-filled** (from both name patterns AND verbose unit strings) |
| VAT source | blank, vendor fills | **Pre-filled from guure.xls** (0 or 16 for every row) |
| Excel file sent | vendor_catalogue_phase1.xlsx | **vendor_catalogue_final.xlsx** (this is the one to send) |
| Stock in Excel | per-tier stock shown | Same — base/L1/L2 stock all shown; import script converts to base units |

---

## Data sources and what each contributes

| File | Contributes |
|---|---|
| `guure.xls` | Canonical `Description` (DB key), `BuyingPrice`, `SellingPrice`, `VAT`, `ItemsBalance`, `UOM_ID` |
| `Vendor_list_prototype.xlsx` | Clean `ItemName`, `Category`, verbose `Unit` string (e.g. "Carton of 20"), `StockBalance` |
| `vendor_catalogue_phase1.xlsx` | Family grouping logic, tier structure (superseded by this spec) |

**Row alignment method:** guure.xls filtered to non-blank/non-whitespace descriptions = 3,033 rows, which align 1:1 positionally with Vendor_list_prototype.xlsx (also 3,033 rows). Verified: 0 price mismatches across all rows.

---

## Data model

### Current (flat — what exists in DB now)

```sql
items
  id            UUID PK
  name          TEXT          -- raw e.g. "SPARONI SP 20*500G"
  buyingPrice   DECIMAL
  sellingPrice  DECIMAL
  vat           INT           -- 0 or 16
  uomId         TEXT          -- CT, PC, BL, OT, BG, KG, PKT ...
  itemsBalance  DECIMAL
  barCode       TEXT          -- currently NULL for all rows
  category      TEXT
```

### Target

```sql
items
  id              UUID PK DEFAULT gen_random_uuid()
  vendorCode      TEXT UNIQUE NOT NULL   -- slugified from original DB description; stable key
  name            TEXT NOT NULL          -- clean canonical name from vendor
  brand           TEXT
  category        TEXT
  vat             INT  NOT NULL DEFAULT 0
  baseUnit        TEXT NOT NULL DEFAULT 'Piece'
  baseCostKES     DECIMAL(12,2)
  baseSellKES     DECIMAL(12,2)
  baseBarcode     TEXT
  currentStock    DECIMAL(12,3) NOT NULL DEFAULT 0  -- ALWAYS in base units
  reorderPoint    DECIMAL(12,3)
  leadTimeDays    INT
  createdAt       TIMESTAMPTZ DEFAULT now()
  updatedAt       TIMESTAMPTZ DEFAULT now()

packaging_tiers
  id          UUID PK DEFAULT gen_random_uuid()
  itemId      UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE
  level       INT  NOT NULL CHECK (level IN (1,2,3))
  name        TEXT NOT NULL          -- e.g. "Dozen", "Carton of 20", "Bale"
  qtyInBase   INT  CHECK (qtyInBase > 0)   -- nullable until vendor confirms
  costKES     DECIMAL(12,2)
  sellKES     DECIMAL(12,2)
  barcode     TEXT
  createdAt   TIMESTAMPTZ DEFAULT now()
  UNIQUE (itemId, level)

legacy_items                           -- archive of old flat rows
  id              UUID
  originalName    TEXT
  uomId           TEXT
  buyingPrice     DECIMAL(12,2)
  sellingPrice    DECIMAL(12,2)
  itemsBalance    DECIMAL(12,3)
  migratedItemId  UUID REFERENCES items(id)
  migratedAt      TIMESTAMPTZ DEFAULT now()
```

### qtyInBase calculation rule

```
L1 qtyInBase = L1QtyInBase
L2 qtyInBase = L1QtyInBase × L2QtyInL1        ← system computes; vendor provides each factor
L3 qtyInBase = L1 × L2 × L3
```

L2 Qty in the Excel means **"how many L1 packs per L2 pack"** — vendor fills naturally, system multiplies.

---

## The vendor Excel (`vendor_catalogue_final.xlsx`)

### Sheet structure

| Sheet | Purpose |
|---|---|
| `READ ME FIRST` | Plain-language instructions with colour guide and examples |
| `Products` | 1,707 rows — one per product family; vendor fills yellow/orange columns |
| `Summary` | Stats + category breakdown for vendor to scope the work |
| `_Lookups` | Hidden sheet; Category and VAT dropdowns |

### Column map (Products sheet)

| Col | Header | Colour | Fill rule | Vendor action |
|---|---|---|---|---|
| A | DB Name | 🔵 Blue | Locked | Do NOT edit |
| B | Category | 🟢 Green | From vendor_proto | Correct if wrong |
| C | ✏️ Clean Product Name | 🟡 Yellow | Empty | FILL — canonical product name |
| D | ✏️ Brand | 🟡 Yellow | Empty | FILL — e.g. "Unilever", "Nestlé" |
| E | VAT % | 🟢 Green | From guure.xls | Confirm |
| F | Base Unit | 🟢 Green | From vendor_proto verbose unit | Confirm |
| G | Base Cost (KES) | 🟢 Green | From guure.xls PC row | Confirm |
| H | Base Sell (KES) | 🟢 Green | From guure.xls PC row | Confirm |
| I | Base Stock | 🟢 Green | From guure.xls | Confirm |
| J | ✏️ Barcode | 🟡 Yellow | Empty | FILL if known |
| K | L1 Pack Name | 🟢 Green | From vendor_proto OT/BOX/DOZ row | Confirm |
| L | ✏️ L1 Qty in Base | 🟠 Orange | Pre-filled from unit_qty where available | Confirm or correct |
| M | L1 Cost (KES) | 🟢 Green | From guure.xls OT row | Confirm |
| N | L1 Sell (KES) | 🟢 Green | From guure.xls OT row | Confirm |
| O | L1 Stock | 🟢 Green | From guure.xls | Confirm |
| P | L2 Pack Name | 🟢 Green | From vendor_proto CT/BG/BL row | Confirm |
| Q | ✏️ L2 Qty in L1 | 🟠 Orange | Pre-filled from "Carton of N" or name pattern | Confirm or correct |
| R | L2 Cost (KES) | 🟢 Green | From guure.xls CT row | Confirm |
| S | L2 Sell (KES) | 🟢 Green | From guure.xls CT row | Confirm |
| T | L2 Stock | 🟢 Green | From guure.xls | Confirm |
| U | ✏️ Reorder Point | 🟡 Yellow | Empty | FILL — optional |
| V | ✏️ Lead Time (days) | 🟡 Yellow | Empty | FILL — optional |
| W | System Notes | Auto | Extracted clues | Read only — explains orange pre-fills |

### Pre-fill coverage

| Field | Pre-filled rows | Source |
|---|---|---|
| VAT% | 1,707 / 1,707 | guure.xls |
| Category | 1,707 / 1,707 | vendor_proto |
| Base cost/sell | 1,107 / 1,707 | guure.xls PC/KG rows |
| L2 cost/sell | 1,200 / 1,707 | guure.xls CT/BG/BL rows |
| L2 qty (orange) | **506 / 1,200** | verbose unit string + name pattern |
| L1 qty (orange) | **113 / 334** | verbose unit string + name pattern |
| Notes hint | 558 / 1,707 | auto-extracted |

---

## Phase 3 — Import pipeline

### Script: `scripts/import_vendor_catalogue.ts`

**Input:** returned `vendor_catalogue_final.xlsx`, sheet `Products`

**Column positions (1-indexed):**

```
A=1  DB_Name         (lookup key — do not rename)
B=2  Category
C=3  CorrectName
D=4  Brand
E=5  VAT%
F=6  BaseUnit
G=7  BaseCostKES
H=8  BaseSellKES
I=9  BaseStock
J=10 BaseBarcode
K=11 L1Unit
L=12 L1QtyInBase
M=13 L1CostKES
N=14 L1SellKES
O=15 L1Stock
P=16 L2Unit
Q=17 L2QtyInL1
R=18 L2CostKES
S=19 L2SellKES
T=20 L2Stock
U=21 ReorderPoint
V=22 LeadTimeDays
W=23 Notes          (ignored on import)
```

### Import algorithm

```typescript
// Sheet has 2 header rows; data starts row 3
for each data row (row >= 3):

  // 1. Resolve key and name
  dbName        = row.DB_Name.trim()
  vendorCode    = slugify(dbName)             // stable key from original DB name
  canonicalName = row.CorrectName?.trim() || dbName

  // 2. Parse numerics
  vat     = parseIntOrNull(row['VAT%'])
  l1qty   = parseIntOrNull(row.L1QtyInBase)
  l2qty   = parseIntOrNull(row.L2QtyInL1)

  // 3. Stock conversion to base units
  baseStock = parseFloatOrNull(row.BaseStock) ?? 0
  if (l1qty && row.L1Stock)
    baseStock += parseFloat(row.L1Stock) * l1qty
  if (l1qty && l2qty && row.L2Stock)
    baseStock += parseFloat(row.L2Stock) * l1qty * l2qty

  // 4. Upsert item
  item = await db.items.upsert({
    where:  { vendorCode },
    update: { name: canonicalName, brand, category, vat, baseUnit,
              baseCostKES, baseSellKES, baseBarcode,
              currentStock: baseStock, reorderPoint, leadTimeDays,
              updatedAt: now() },
    create: { vendorCode, name: canonicalName, brand, category, vat,
              baseUnit: row.BaseUnit || 'Piece',
              baseCostKES, baseSellKES, baseBarcode,
              currentStock: baseStock, reorderPoint, leadTimeDays }
  })

  // 5. Replace packaging tiers (full replace)
  await db.packagingTiers.deleteMany({ where: { itemId: item.id } })

  if (row.L1Unit) {
    await db.packagingTiers.create({
      itemId: item.id, level: 1,
      name: row.L1Unit,
      qtyInBase: l1qty ?? null,        // null if vendor left blank
      costKES: row.L1CostKES, sellKES: row.L1SellKES
    })
  }

  if (row.L2Unit) {
    const qtyInBase_L2 = (l1qty && l2qty) ? l1qty * l2qty : null
    await db.packagingTiers.create({
      itemId: item.id, level: 2,
      name: row.L2Unit,
      qtyInBase: qtyInBase_L2,
      costKES: row.L2CostKES, sellKES: row.L2SellKES
    })
  }

  // 6. Archive old flat rows
  await db.legacyItems.createMany({
    data: oldFlatRows
      .filter(r => slugify(r.name).startsWith(vendorCode.slice(0, 8)))
      .map(r => ({ ...r, migratedItemId: item.id }))
  })
```

### Error handling

| Condition | Action |
|---|---|
| `DB_Name` blank | Skip row, log warning |
| `CorrectName` blank | Use `DB_Name` as name, log info |
| L1/L2 qty missing but pack name present | Create tier with `qtyInBase = null`; log warning |
| Non-numeric in price/qty | Treat as null, log warning |
| Duplicate `vendorCode` collision | Log error, skip second row |

### CLI

```bash
# Validate only — no DB writes
npx ts-node scripts/import_vendor_catalogue.ts \
  --file vendor_catalogue_final.xlsx --dry-run

# Full import
npx ts-node scripts/import_vendor_catalogue.ts \
  --file vendor_catalogue_final.xlsx

# Single category
npx ts-node scripts/import_vendor_catalogue.ts \
  --file vendor_catalogue_final.xlsx --category "Staples - Rice"

# Show diff (what will change) without writing
npx ts-node scripts/import_vendor_catalogue.ts \
  --file vendor_catalogue_final.xlsx --diff
```

### Expected log

```
Reading vendor_catalogue_final.xlsx … 1707 rows
─────────────────────────────────────────────────
✔  Items upserted:            1,707
   ├─ created:                   95
   └─ updated:                1,612
✔  Packaging tiers created:   3,241
   ├─ L1 tiers:                 334  (113 with qty, 221 qty=null)
   └─ L2 tiers:               1,200  (506 with qty, 694 qty=null)
⚠  Warnings:                    915  (tiers created with null qty)
✗  Errors:                        0
   Total stock converted:  284,130 base units
─────────────────────────────────────────────────
```

---

## Phase 4 — Ongoing updates

The same template is reused for updates — import is idempotent.

```bash
# Generate filtered update sheet for one supplier
npx ts-node scripts/generate_vendor_sheet.ts \
  --category "Staples - Rice" \
  --output rice_$(date +%Y%m%d).xlsx
```

Useful follow-up query after first import — find items still needing qty:

```sql
SELECT i.name, i.category, pt.level, pt.name AS tier_name
FROM packaging_tiers pt
JOIN items i ON i.id = pt."itemId"
WHERE pt."qtyInBase" IS NULL
ORDER BY i.category, i.name;
```

---

## API endpoints

```
POST /api/admin/import-catalogue            triggers import pipeline
GET  /api/admin/import-catalogue/status     last run log + error count
GET  /api/items/:id/packaging-tiers         item + all tiers
PUT  /api/items/:id/packaging-tiers         replace tiers directly
GET  /api/items?category=X&hasNullQty=1     items still needing qty confirmation
```

### Response: `GET /api/items/:id/packaging-tiers`

```json
{
  "item": {
    "id": "uuid",
    "vendorCode": "sparoni-sp-20-500g",
    "name": "Sparoni Spaghetti Pasta 500g",
    "brand": "Sparoni",
    "category": "Staples - Pasta & Noodles",
    "vat": 16,
    "baseUnit": "Piece",
    "baseCostKES": 85.00,
    "baseSellKES": 100.00,
    "currentStock": 1238,
    "reorderPoint": 200,
    "leadTimeDays": 3
  },
  "tiers": [
    {
      "level": 2,
      "name": "Carton of 20",
      "qtyInBase": 20,
      "qtyConfirmed": true,
      "costKES": 1700.00,
      "sellKES": 2000.00
    }
  ]
}
```

---

## Migration SQL

```sql
-- 001_alter_items_add_columns.sql
ALTER TABLE items
  ADD COLUMN IF NOT EXISTS vendorCode    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS brand         TEXT,
  ADD COLUMN IF NOT EXISTS baseUnit      TEXT NOT NULL DEFAULT 'Piece',
  ADD COLUMN IF NOT EXISTS baseCostKES   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS baseSellKES   DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS baseBarcode   TEXT,
  ADD COLUMN IF NOT EXISTS currentStock  DECIMAL(12,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reorderPoint  DECIMAL(12,3),
  ADD COLUMN IF NOT EXISTS leadTimeDays  INT;

-- Backfill vendorCode before running import (run once)
UPDATE items
SET vendorCode = lower(
  regexp_replace(regexp_replace(name, '[^a-zA-Z0-9\s]', '', 'g'), '\s+', '-', 'g')
)
WHERE vendorCode IS NULL;

-- 002_create_packaging_tiers.sql
CREATE TABLE IF NOT EXISTS packaging_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId"    UUID NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  level       INT  NOT NULL CHECK (level IN (1,2,3)),
  name        TEXT NOT NULL,
  "qtyInBase" INT  CHECK ("qtyInBase" > 0),
  "costKES"   DECIMAL(12,2),
  "sellKES"   DECIMAL(12,2),
  barcode     TEXT,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  UNIQUE ("itemId", level)
);

CREATE INDEX IF NOT EXISTS idx_pt_itemid ON packaging_tiers("itemId");

-- 003_create_legacy_items.sql
CREATE TABLE IF NOT EXISTS legacy_items (
  id               UUID,
  "originalName"   TEXT,
  "uomId"          TEXT,
  "buyingPrice"    DECIMAL(12,2),
  "sellingPrice"   DECIMAL(12,2),
  "itemsBalance"   DECIMAL(12,3),
  "migratedItemId" UUID REFERENCES items(id),
  "migratedAt"     TIMESTAMPTZ DEFAULT now()
);
```

---

## File map

```
vendor_catalogue_final.xlsx      ← send to vendor NOW (replaces phase1 version)
PRODUCT_CATALOGUE_SPEC.md        ← this file (v2)

scripts/
  import_vendor_catalogue.ts     ← build: Phase 3 import
  generate_vendor_sheet.ts       ← build: Phase 4 re-export

db/migrations/
  001_alter_items_add_columns.sql
  002_create_packaging_tiers.sql
  003_create_legacy_items.sql
```

---

## Open questions — confirm before building Phase 3

| # | Question | Recommended default |
|---|---|---|
| 1 | Allow `qtyInBase = null` on tiers? | **Yes** — 915 tiers will have null qty until vendor confirms; flag via `qtyConfirmed` in API |
| 2 | Hard delete old flat `items` after migration? | **No** — archive to `legacy_items`, keep 90 days |
| 3 | First import scope | **All 1,707** — null-qty tiers still useful for name/price lookup |
| 4 | `vendorCode` key: from `DB_Name` (col A) or `CorrectName` (col C)? | **`DB_Name` (col A)** — immutable, survives re-sends |