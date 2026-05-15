# POS System — Kenya VAT Engine Prompt (v2)
# For use with Cursor, GitHub Copilot, Claude Code, or any IDE AI agent

---

## CONTEXT

You are building a Point of Sale (POS) system for a Kenyan retail shop.
The shop sells 3,033 items across 44 product categories.
You must implement Kenya VAT correctly per the VAT Act 2013 (KRA First & Second Schedule).

### Seed data file
The pre-classified inventory is in `vendor_inventory_with_VAT.xlsx`. It contains:
- Sheet 1 "Inventory with VAT" — all 3,033 items with vat_class, vat_rate, vat_amount_kes,
  net_price_excl_vat_kes already calculated. Use this as your product import source.
- Sheet 2 "Category Tax Summary" — 44 categories with item counts and VAT totals.
- Sheet 3 "VAT Guide & POS Notes" — edge case notes and eTIMS compliance reminders.

Import this file to seed the products and category_vat tables. Do not recalculate
classifications from scratch — the file reflects the official KRA schedule.

---

## KENYA VAT RULES — READ THIS CAREFULLY

Kenya has three VAT treatments. Every product must be assigned exactly one.
The most important distinction is between Exempt and Zero-Rated — both show 0% to
the customer, but they have completely different implications for your accounting:

### 1. Standard Rated — 16%
- Default rate for all goods not listed in the KRA schedules.
- All retail selling prices in Kenya are VAT-INCLUSIVE. Never store a price as
  VAT-exclusive unless it is an intermediate accounting value.
- Extract VAT from an inclusive price using:
    vat_amount = selling_price * 0.16 / 1.16
    net_price  = selling_price / 1.16
- Send tax type code "VAT" to eTIMS per line item.

### 2. Zero-Rated — 0%
- Customer pays no VAT.
- YOU CAN claim back input VAT on supplier invoices for these goods.
  This means when your supplier charges you VAT on a zero-rated product,
  you are entitled to a refund of that VAT from KRA. Track supplier VAT
  on these categories separately in your accounts payable flow.
- KRA Second Schedule items in this inventory:
    Rice (milled)                    ref: 0039.11.65
    Maize/wheat/cassava flour        ref: 0022.12.00
    Milk & cream (not concentrated)  ref: 0015.12.00
    Edible vegetable cooking oils    ref: 0009–0016
    Ordinary plain bread only        ref: 0013.12.02
- Send tax type code "ZERO" to eTIMS per line item.

### 3. Exempt — 0%
- Customer pays no VAT.
- YOU CANNOT claim back input VAT on supplier invoices for these goods.
  Even if your supplier charges you VAT, you absorb it as a cost — it is
  not recoverable. Do not attempt to offset it against output VAT.
- KRA First Schedule items in this inventory:
    Beans & legumes                  ref: 0004–0006
    Sugar & salt                     ref: 0025.11.00
    Unprocessed cereals              ref: 0025.11.00
    Fresh eggs                       ref: 0022.11.00
    Edible vegetables, fruits, nuts  ref: 0023–0024
    Baby & adult diapers             ref: 0142.11.00
    Infant formula & baby food       ref: 0039.11.62, 0039.11.70
    Food supplements                 ref: 0039.11.84
    Natural/tap water (not bottled)  ref: 0095.11.00
- Send tax type code "NONTAXABLE" to eTIMS per line item.

---

## CATEGORY → VAT MAPPING TABLE

Use this as seed data for the category_vat table.

```
Category                    | VAT Class    | Rate | eTIMS Code  | Notes
----------------------------|--------------|------|-------------|------------------------------------------
Rice                        | Zero-Rated   | 0%   | ZERO        | Milled rice only
Flour & Grains              | Zero-Rated   | 0%   | ZERO        | Maize/wheat/cassava flour
Dairy & Milk                | Zero-Rated   | 0%   | ZERO        | Fresh/pasteurized only. Flavoured = 16%
Cooking Oil                 | Zero-Rated   | 0%   | ZERO        | Edible vegetable oils only
Beans & Legumes             | Exempt       | 0%   | NONTAXABLE  | Unprocessed
Sugar & Salt                | Exempt       | 0%   | NONTAXABLE  |
Cereals & Breakfast         | Exempt       | 0%   | NONTAXABLE  | Unprocessed cereals
Dates & Dry Fruits          | Exempt       | 0%   | NONTAXABLE  | Unprocessed
Nuts & Dry Fruits           | Exempt       | 0%   | NONTAXABLE  | Unprocessed
Infant Formula & Baby Food  | Exempt       | 0%   | NONTAXABLE  | KRA ref 0039.11.62, 0039.11.70
Baby Products               | Exempt       | 0%   | NONTAXABLE  | KRA ref 0039.11.70, 0142.11.00
Diapers & Baby Products     | Exempt       | 0%   | NONTAXABLE  | KRA ref 0142.11.00
Health & Supplements        | Exempt       | 0%   | NONTAXABLE  | Food supplements KRA ref 0039.11.84
Water                       | SPLIT        | —    | —           | ⚠ See per-item override note below
Cakes & Baked Goods         | Standard 16% | 16%  | VAT         | ⚠ Plain bread items = override to ZERO
Beverages & Juices          | Standard 16% | 16%  | VAT         |
Energy Drinks               | Standard 16% | 16%  | VAT         |
Biscuits & Snacks           | Standard 16% | 16%  | VAT         |
Chocolate & Confectionery   | Standard 16% | 16%  | VAT         |
Tea & Coffee                | Standard 16% | 16%  | VAT         | Unprocessed green tea leaf = Exempt
Pasta & Noodles             | Standard 16% | 16%  | VAT         |
Canned & Tinned Food        | Standard 16% | 16%  | VAT         |
Condiments & Spreads        | Standard 16% | 16%  | VAT         |
Sauces & Condiments         | Standard 16% | 16%  | VAT         |
Tomato Paste & Sauce        | Standard 16% | 16%  | VAT         |
Spices & Seasoning          | Standard 16% | 16%  | VAT         |
Baking Ingredients          | Standard 16% | 16%  | VAT         |
Cooking Fat & Ghee          | Standard 16% | 16%  | VAT         |
Bar Soap                    | Standard 16% | 16%  | VAT         |
Detergents & Cleaning       | Standard 16% | 16%  | VAT         |
Bleach & Disinfectant       | Standard 16% | 16%  | VAT         |
Household & Cleaning        | Standard 16% | 16%  | VAT         |
Washing Powder & Detergent  | Standard 16% | 16%  | VAT         |
Personal Care & Hygiene     | Standard 16% | 16%  | VAT         |
Shampoo & Hair Care         | Standard 16% | 16%  | VAT         |
Skin Care & Lotions         | Standard 16% | 16%  | VAT         |
Perfumes & Fragrances       | Standard 16% | 16%  | VAT         |
Tissue & Paper Products     | Standard 16% | 16%  | VAT         |
Candles & Matches           | Standard 16% | 16%  | VAT         |
Stationery & School         | Standard 16% | 16%  | VAT         |
Electrical Items            | Standard 16% | 16%  | VAT         |
Motor Oil & Non-Food        | Standard 16% | 16%  | VAT         |
Services & Charges          | Standard 16% | 16%  | VAT         | Unless specifically listed as exempt
Other - General Merchandise | Standard 16% | 16%  | VAT         | Verify individual items with KRA
```

### ⚠ Per-item override rules (handle in products table, not category_vat)

The following categories contain items that DO NOT follow the category default.
The products table must have a `vat_class_id` column that overrides the category
default when set. The import script must apply these overrides during seeding:

1. Water category (currently seeded as Exempt by default):
   - Items with "mineral", "sparkling", or "bottled" in the name → Standard 16%
   - Items that are tap/county/natural water supply → Exempt
   - Action: flag in UI as "VAT override required" and require manual confirmation
     per product before it goes live on the till.

2. Cakes & Baked Goods category (seeded as Standard 16%):
   - Items that are plain ordinary bread (sliced loaf, plain rolls) → Zero-Rated
   - Cakes, pastries, buns, mandazi, doughnuts → remain Standard 16%
   - Action: any product name containing "bread" or "loaf" should prompt a
     confirmation dialog asking the operator to confirm Zero-Rated override.

3. Dairy & Milk category (seeded as Zero-Rated):
   - Fresh/pasteurized milk → Zero-Rated (correct default)
   - Flavoured milk drinks, yoghurt-based drinks → Standard 16%
   - Plain yoghurt → confirm with KRA; treat as Standard 16% unless confirmed exempt.

---

## DATABASE SCHEMA

```sql
-- Seed data: three rows
CREATE TABLE vat_classes (
  id          INTEGER PRIMARY KEY,
  code        TEXT NOT NULL UNIQUE,   -- 'STANDARD', 'ZERO', 'EXEMPT'
  label       TEXT NOT NULL,          -- 'Standard 16%', 'Zero-Rated', 'Exempt'
  rate        DECIMAL(5,4) NOT NULL,  -- 0.1600, 0.0000, 0.0000
  etims_code  TEXT NOT NULL,          -- 'VAT', 'ZERO', 'NONTAXABLE'
  kra_ref     TEXT,
  can_claim_input_vat BOOLEAN NOT NULL DEFAULT FALSE
  -- TRUE only for ZERO; FALSE for both STANDARD and EXEMPT
  -- STANDARD collects output VAT; EXEMPT absorbs supplier VAT as cost
);

-- 44 rows — one per category
CREATE TABLE category_vat (
  id           INTEGER PRIMARY KEY,
  category     TEXT UNIQUE NOT NULL,
  vat_class_id INTEGER NOT NULL REFERENCES vat_classes(id),
  has_overrides BOOLEAN NOT NULL DEFAULT FALSE,
  notes        TEXT
);

-- 3,033 rows from vendor_inventory_with_VAT.xlsx
CREATE TABLE products (
  id                   INTEGER PRIMARY KEY,
  name                 TEXT NOT NULL,
  category             TEXT NOT NULL,
  unit                 TEXT,
  cost_price_kes       DECIMAL(12,2),
  selling_price_kes    DECIMAL(12,2) NOT NULL,  -- Always VAT-INCLUSIVE
  stock_balance        DECIMAL(10,2) DEFAULT 0,
  vat_class_id         INTEGER REFERENCES vat_classes(id),
  -- NULL means inherit from category_vat; set explicitly to override
  vat_override_reason  TEXT,
  -- Required when vat_class_id is set explicitly, e.g. "bottled water = 16%"
  etims_item_code      TEXT
  -- KRA eTIMS item classification code if known
);

-- One row per receipt
CREATE TABLE sales (
  id           INTEGER PRIMARY KEY,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cashier_id   INTEGER,
  etims_receipt_no  TEXT,          -- Assigned by eTIMS after submission
  etims_qr_code     TEXT,
  total_incl_kes    DECIMAL(12,2),
  total_vat_kes     DECIMAL(12,2),
  total_exempt_kes  DECIMAL(12,2),
  total_zero_kes    DECIMAL(12,2),
  submitted_to_etims BOOLEAN DEFAULT FALSE
);

-- One row per product per sale
CREATE TABLE sale_lines (
  id              INTEGER PRIMARY KEY,
  sale_id         INTEGER NOT NULL REFERENCES sales(id),
  product_id      INTEGER NOT NULL REFERENCES products(id),
  product_name    TEXT NOT NULL,      -- Snapshot at time of sale
  qty             DECIMAL(10,3) NOT NULL,
  unit_price_incl DECIMAL(12,2) NOT NULL,  -- VAT-inclusive, snapshot at time of sale
  vat_rate        DECIMAL(5,4) NOT NULL,   -- Snapshot at time of sale
  etims_code      TEXT NOT NULL,           -- 'VAT', 'ZERO', or 'NONTAXABLE'
  vat_amount      DECIMAL(12,2) NOT NULL,  -- Per unit: unit_price_incl * rate / (1+rate)
  net_amount      DECIMAL(12,2) NOT NULL,  -- Per unit: unit_price_incl - vat_amount
  line_total_incl DECIMAL(12,2) NOT NULL,  -- qty * unit_price_incl
  line_vat_total  DECIMAL(12,2) NOT NULL   -- qty * vat_amount
);
```

### Seed SQL for vat_classes

```sql
INSERT INTO vat_classes (id, code, label, rate, etims_code, can_claim_input_vat) VALUES
  (1, 'STANDARD', 'Standard 16%', 0.1600, 'VAT',         FALSE),
  (2, 'ZERO',     'Zero-Rated',   0.0000, 'ZERO',        TRUE),
  (3, 'EXEMPT',   'Exempt',       0.0000, 'NONTAXABLE',  FALSE);
```

---

## VAT CALCULATION FUNCTIONS

```python
from decimal import Decimal, ROUND_HALF_UP

def get_effective_vat_class(product: dict, db) -> dict:
    """
    Returns the effective VAT class for a product.
    Checks product-level override first, then falls back to category default.
    """
    if product.get('vat_class_id'):
        return db.query_one("SELECT * FROM vat_classes WHERE id = ?", product['vat_class_id'])
    return db.query_one("""
        SELECT vc.* FROM vat_classes vc
        JOIN category_vat cv ON cv.vat_class_id = vc.id
        WHERE cv.category = ?
    """, product['category'])


def calculate_line_vat(unit_price_incl: float, qty: float, vat_rate: float) -> dict:
    """
    All prices are VAT-inclusive (standard Kenyan retail practice).
    Extracts the VAT component and net price from the inclusive price.

    Args:
        unit_price_incl: the shelf/till price including VAT
        qty: quantity sold
        vat_rate: 0.16 for standard, 0.0 for zero/exempt

    Returns a dict with all values needed for sale_lines row and eTIMS submission.
    """
    price = Decimal(str(unit_price_incl))
    quantity = Decimal(str(qty))
    rate = Decimal(str(vat_rate))

    if rate == 0:
        vat_amount = Decimal('0.00')
        net_amount = price
    else:
        vat_amount = (price * rate / (1 + rate)).quantize(Decimal('0.01'), ROUND_HALF_UP)
        net_amount = (price - vat_amount).quantize(Decimal('0.01'), ROUND_HALF_UP)

    line_total_incl = (price * quantity).quantize(Decimal('0.01'), ROUND_HALF_UP)
    line_vat_total  = (vat_amount * quantity).quantize(Decimal('0.01'), ROUND_HALF_UP)

    return {
        "unit_price_incl": float(price),
        "vat_amount":      float(vat_amount),
        "net_amount":      float(net_amount),
        "line_total_incl": float(line_total_incl),
        "line_vat_total":  float(line_vat_total),
    }


def calculate_receipt_totals(sale_lines: list) -> dict:
    """
    Aggregates VAT across all lines for receipt footer and eTIMS submission.
    sale_lines: list of dicts, each must have:
        line_total_incl, line_vat_total, vat_rate, etims_code
    """
    total_incl  = sum(Decimal(str(l['line_total_incl'])) for l in sale_lines)
    total_vat   = sum(Decimal(str(l['line_vat_total']))  for l in sale_lines)
    total_zero  = sum(
        Decimal(str(l['line_total_incl'])) for l in sale_lines
        if l['etims_code'] == 'ZERO'
    )
    total_exempt = sum(
        Decimal(str(l['line_total_incl'])) for l in sale_lines
        if l['etims_code'] == 'NONTAXABLE'
    )
    total_taxable_incl = sum(
        Decimal(str(l['line_total_incl'])) for l in sale_lines
        if l['etims_code'] == 'VAT'
    )
    total_taxable_net = (total_taxable_incl - total_vat)

    def r(d): return float(d.quantize(Decimal('0.01'), ROUND_HALF_UP))

    return {
        "total_incl_kes":      r(total_incl),
        "total_vat_kes":       r(total_vat),
        "total_zero_kes":      r(total_zero),
        "total_exempt_kes":    r(total_exempt),
        "total_taxable_net_kes": r(total_taxable_net),
        # For eTIMS submission payload:
        "etims_taxable_amount": r(total_taxable_net),
        "etims_tax_amount":     r(total_vat),
        "etims_zero_amount":    r(total_zero),
        "etims_exempt_amount":  r(total_exempt),
    }
```

---

## RECEIPT FORMAT (KRA eTIMS Compliant)

```
========================================
        RECEIPT / TAX INVOICE
========================================
Shop Name
KRA PIN: P00XXXXXXXXX
eTIMS Device No: CXXXXXXXXX
----------------------------------------
Item                    Qty  Amount(KES)
----------------------------------------
Kensos Tomato Paste      1      1,050.00  [V]
Anfac Rice 10Kg          2      4,800.00  [Z]
Softcare Diapers XL      1      2,100.00  [E]
----------------------------------------
Taxable (A)  Net:  905.17  VAT: 144.83
Zero-Rated (B)           4,800.00
Exempt (C)               2,100.00
----------------------------------------
Total VAT (16% on A)       144.83
TOTAL                    7,950.00
========================================
[V]=Taxable 16%  [Z]=Zero-Rated  [E]=Exempt
eTIMS Receipt No: XXXXXXXXXXXXXXXX
QR: [QR CODE]
Date: DD/MM/YYYY  HH:MM
========================================
```

### Receipt printing rules
- Every line item must show its VAT code tag [V], [Z], or [E].
- The VAT breakdown section must show the net taxable amount separately from
  the VAT amount — KRA requires this distinction for audit purposes.
- Zero-Rated and Exempt totals must be shown as separate lines.
- The eTIMS receipt number must appear on every printed receipt.
- Do not print a receipt before eTIMS submission is confirmed — if the network
  is down, queue the sale and submit when connectivity is restored. Print a
  "pending eTIMS" receipt only as a fallback, clearly marked as not yet
  KRA-verified.

---

## eTIMS INTEGRATION

### Registration
- Register at: https://etims.kra.go.ke
- Each device (till) gets a Device Serial Number (DSN) and a Unit Price (UP) code.
- Your KRA PIN must have an active VAT obligation on iTax.

### Per-sale submission payload (simplified)
Each sale must POST to the eTIMS API with at minimum:

```json
{
  "deviceNo": "CXXXXXXXXX",
  "receiptType": "S",
  "receiptDate": "YYYYMMDDHHMMSS",
  "items": [
    {
      "itemName": "Kensos Tomato Paste",
      "qty": 1,
      "unitPrice": 905.17,
      "taxType": "VAT",
      "taxAmount": 144.83,
      "totalAmount": 1050.00
    },
    {
      "itemName": "Anfac Rice 10Kg",
      "qty": 2,
      "unitPrice": 2400.00,
      "taxType": "ZERO",
      "taxAmount": 0.00,
      "totalAmount": 4800.00
    }
  ],
  "taxableAmount": 905.17,
  "taxAmount": 144.83,
  "zeroRatedAmount": 4800.00,
  "exemptAmount": 2100.00,
  "totalAmount": 7950.00
}
```

Note: unitPrice in the eTIMS payload is the NET (excl. VAT) price per unit, not
the inclusive shelf price. Always convert before submitting.

### VAT returns
- Filed monthly by the 20th of the following month via iTax: https://itax.kra.go.ke
- Your monthly VAT report should output: total output VAT collected (Standard 16%
  lines), total input VAT claimable (from supplier invoices on Zero-Rated purchases),
  and net VAT payable = output VAT minus claimable input VAT.
- Withholding VAT: 2% withheld by appointed agents. Flag sales to government
  entities or appointed withholding agents in the sales table.

---

## IMPLEMENTATION CHECKLIST

### Database setup
- [ ] Run vat_classes seed SQL (3 rows: STANDARD, ZERO, EXEMPT)
- [ ] Seed category_vat (44 rows from mapping table above)
- [ ] Import products from vendor_inventory_with_VAT.xlsx Sheet 1 (3,033 rows)
- [ ] Apply per-item overrides for Water category (bottled vs tap)
- [ ] Apply per-item overrides for Cakes & Baked Goods (plain bread → ZERO)
- [ ] Flag Dairy & Milk flavoured drink items for manual VAT class confirmation

### Till / sale flow
- [ ] On product scan/select, resolve effective VAT class (override → category → default)
- [ ] Call calculate_line_vat() per line — never calculate VAT in the UI layer
- [ ] Display [V]/[Z]/[E] tag per line item on the till screen
- [ ] Call calculate_receipt_totals() before finalising sale
- [ ] Save sale + sale_lines to DB atomically (single transaction)
- [ ] Submit to eTIMS API — store receipt number and QR code on the sales row
- [ ] Print receipt only after eTIMS confirmation (or queue if offline)

### Reporting
- [ ] Daily VAT summary: total output VAT by class
- [ ] Monthly VAT return report: output VAT, input VAT claimable, net payable
- [ ] Per-category VAT report for internal audit
- [ ] Flag any sales where eTIMS submission is still pending

### Testing
- [ ] Mixed cart: one item per VAT class — verify all three subtotals correct
- [ ] Zero stock item — should still be saleable if qty override allowed
- [ ] Refund/credit note — VAT must reverse correctly; submit credit note to eTIMS
- [ ] Offline sale queue — verify eTIMS submission on reconnect
- [ ] Water category override — bottled water correctly shows [V], tap shows [E]
- [ ] Bread override — plain bread shows [Z], cake shows [V]

---

## SOURCE
KRA VAT Act 2013 — First Schedule (Exempt) & Second Schedule (Zero-Rated)
Official KRA VAT guidance: https://www.kra.go.ke/individual/filing-paying/types-of-taxes/value-added-tax
eTIMS registration: https://etims.kra.go.ke
iTax returns: https://itax.kra.go.ke