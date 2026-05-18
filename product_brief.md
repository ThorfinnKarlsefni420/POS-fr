# Product Data — Uploaded Dataset Brief

> **This is real vendor data uploaded by the user.**
> The file `products.xlsx` contains **1,707 product rows** from a Kenyan wholesale/retail store.
> Use this data as ground truth when filling, enriching, or processing product records.

---

## What Is Already Filled

| Column | Filled Rows | Notes |
|--------|-------------|-------|
| DB Name | 1,707 / 1,707 | System key — unique internal code. **Never edit.** |
| Category | 1,707 / 1,707 | Product category. Mostly accurate; verify obvious mismatches. |
| Base Unit | 1,107 / 1,707 | Unit type (Piece, Kilogram, Litre, etc.) |
| Base Cost (KES) | 1,107 / 1,707 | Wholesale cost per base unit |
| Base Sell (KES) | 1,107 / 1,707 | Retail sell price per base unit |
| Base Stock | 1,107 / 1,707 | Current units in stock |
| L1 Pack Name | 334 / 1,707 | Intermediate pack (Outer, Dozen, Box…) |
| L1 Qty (in Base) | 113 / 1,707 | How many base units per L1 pack |
| L1 Cost (KES) | 334 / 1,707 | Cost of one L1 pack |
| L1 Sell (KES) | 334 / 1,707 | Sell price of one L1 pack |
| L2 Pack Name | 1,200 / 1,707 | Outer carton/bag (Carton, Bale, Bag…) |
| L2 Qty (in L1) | 506 / 1,707 | How many L1 packs per L2 pack |
| L2 Cost (KES) | 1,200 / 1,707 | Cost of one L2 pack |
| L2 Sell (KES) | 1,200 / 1,707 | Sell price of one L2 pack |

## What Is Empty (needs filling)

| Column | Filled Rows | Action |
|--------|-------------|--------|
| Correct Product Name | 0 / 1,707 | Derive from DB Name — clean & standardise |
| Brand | 0 / 1,707 | Infer from product name / known brands |
| VAT % | 0 / 1,707 | 0% basic food, 16% everything else (Kenya) |
| Barcode | 0 / 1,707 | EAN-13 if known |
| Reorder Point | 0 / 1,707 | Optional — minimum base-unit stock trigger |
| Lead Time (days) | 0 / 1,707 | Optional — supplier lead time |

---

## Top Categories in This Dataset

| Category | Products |
|----------|----------|
| Other - General Merchandise | 370 |
| Staples - Rice | 124 |
| Cooking Oil | 109 |
| Staples - Flour & Ugali | 101 |
| Staples - Pasta & Noodles | 98 |
| Baby Care - Diapers | 66 |
| Beverages - Juice & Drinks | 57 |
| Tomato Paste & Sauce | 44 |
| Baby Care - Infant Formula | 40 |
| Dairy - Milk | 40 |
| Personal Care - Hair Care | 39 |
| Snacks - Cakes & Donuts | 35 |
| Condiments - Honey & Spreads | 35 |
| Beverages - Soda | 32 |
| Beverages - Tea | 31 |

---

## Representative Sample Rows

These rows show what well-filled records look like:

| DB Name | Category | Base Unit | Base Cost | Base Sell | L1 Pack | L1 Qty | L2 Pack | L2 Qty | L2 Cost |
|---------|----------|-----------|-----------|-----------|---------|--------|---------|--------|---------|
| Blue Band Vanilla 1kg | Cooking - Fats & Margarine | Piece | 436.67 | 500.00 | Outer of 48 | 48 | Carton of 24 | 24 | 5,500 |
| Colgate Red Toothpaste 100ml | Tomato Paste & Sauce | Piece | 125.00 | 150.00 | Dozen of 72 | 72 | Carton of 72 | 72 | 9,000 |
| Daawat Basmati Rice 5Kg | Staples - Rice | 5 Kilogram | 1,118.75 | 1,225.00 | 10 Kilogram | 10 | Bag of 8 | 8 | 6,500 |
| Dettol Bar Soap | Personal Care - Soap | Piece | 44.44 | 52.78 | Dozen | — | Carton | — | 3,200 |
| ABU WALAD BISC STT | Snacks - Biscuits & Cookies | Piece | 44.79 | 50.00 | Dozen | — | Carton | — | 2,150 |

---

## Packaging Logic (reference)

```
BASE UNIT  = smallest individually sold unit  (e.g. 1 Piece, 1 Kg)
L1 PACK    = first grouping above base        (e.g. Dozen = 12 base units)
L2 PACK    = grouping above L1               (e.g. Carton = 20 L1 packs)

L1 Qty  = number of BASE units in one L1 pack
L2 Qty  = number of L1 packs in one L2 pack
```

Many DB Names encode pack sizes directly — use these to infer L1/L2 quantities:

| DB Name pattern | Meaning |
|----------------|---------|
| `AJAB 24*1KG` | 24 units of 1 Kg → L2 Qty = 24 |
| `BROOKSIDE 6*2.5KG` | 6 units → L2 Qty = 6 |
| `ALWAYS 16*7 BLUE` | 16 units → L2 Qty = 16 |
| `AL SHAFAA OLIVE 12*1LTR` | 12 units → L2 Qty = 12 |

---

## Key Rules

- **Column A (DB Name) is read-only** — never modify it
- Numeric columns (costs, quantities) must stay numeric — no "N/A" or text
- Prices are in **KES (Kenyan Shillings)**
- Kenya VAT: **0%** for basic foodstuffs (rice, flour, cooking oil, milk, sugar, salt, bread, infant formula); **16%** for everything else
- Save output as `.xlsx` — not `.csv`