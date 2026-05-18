# Vendor Product Catalogue — IDE Agent Fill Instructions

## Overview
`products.xlsx` contains **1,707 product rows** extracted from a vendor fill sheet.
Your task is to populate the **yellow (must-fill)** columns for each product using known product data, web lookups, or inference from the DB Name.

---

## Column Reference

| # | Column | Colour | Action Required |
|---|--------|--------|----------------|
| A | **DB Name** | 🔵 Blue | **DO NOT EDIT** — system key |
| B | **Category** | 🟢 Green | Pre-filled. Correct only if clearly wrong |
| C | **Correct Product Name** | 🟡 Yellow | **FILL IN** — standard market name (e.g. "Ariel Washing Powder 1Kg") |
| D | **Brand** | 🟡 Yellow | **FILL IN** — manufacturer/brand name (e.g. "Procter & Gamble") |
| E | **VAT %** | 🟢 Green | Confirm — 0 or 16 for Kenya |
| F | **Base Unit** | 🟢 Green | Confirm unit type (Piece, Kilogram, Litre, etc.) |
| G | **Base Cost (KES)** | 🟢 Green | Confirm — wholesale cost per base unit |
| H | **Base Sell (KES)** | 🟢 Green | Confirm — retail sell price per base unit |
| I | **Base Stock** | 🟢 Green | Current units in stock (already filled) |
| J | **Barcode** | 🟡 Yellow | **FILL IN** — EAN-13 or EAN-8 barcode if known |
| K | **L1 Pack Name** | 🟢 Green | Intermediate pack name (e.g. Outer, Box, Dozen) |
| L | **L1 Qty (in Base)** | 🟡 Yellow | **FILL / CONFIRM** — how many base units in one L1 pack |
| M | **L1 Cost (KES)** | 🟢 Green | Cost of one L1 pack |
| N | **L1 Sell (KES)** | 🟢 Green | Sell price of one L1 pack |
| O | **L1 Stock** | 🟢 Green | Current L1 pack stock |
| P | **L2 Pack Name** | 🟢 Green | Outer carton/bag name (e.g. Carton, Bale, Bag) |
| Q | **L2 Qty (in L1)** | 🟡 Yellow | **FILL / CONFIRM** — how many L1 packs in one L2 pack |
| R | **L2 Cost (KES)** | 🟢 Green | Cost of one L2 pack |
| S | **L2 Sell (KES)** | 🟢 Green | Sell price of one L2 pack |
| T | **L2 Stock** | 🟢 Green | Current L2 pack stock |
| U | **Reorder Point** | 🟡 Yellow | Optional — minimum base-unit stock before reorder |
| V | **Lead Time (days)** | 🟡 Yellow | Optional — supplier lead time in days |

---

## Packaging Logic

```
BASE UNIT  = smallest individual sellable unit  (e.g. 1 Piece, 1 Kg, 1 Litre)
L1 PACK    = first grouping above base           (e.g. Dozen = 12 base units)
L2 PACK    = grouping above L1                   (e.g. Carton = 20 L1 packs)

L1 Qty  = number of BASE units per L1 pack
L2 Qty  = number of L1 packs per L2 pack
          (system multiplies automatically: total base = L1 Qty × L2 Qty)
```

**Examples from the original fill guide:**
- `Sparoni Spaghetti 500g` → Base=Piece | no L1 | L2=Carton, L2 Qty=20
- `Colgate 35g (dozen pack)` → Base=Piece | L1=Dozen, L1 Qty=12 | L2=Carton of 6, L2 Qty=6
- `Cooking Oil 5L` → Base=Piece | no L1 | L2=Carton of 4, L2 Qty=4
- `Rice 5Kg bag` → Base=5Kg | no L1 | L2=Bag of 8, L2 Qty=8

---

## Fill Strategy

### Priority order for each row
1. **Column C (Correct Product Name)** — derive from DB Name; remove codes, standardise spelling.  
   Example: `"BAHAR M BIG ELBOW STT"` → `"Bahar Macaroni Big Elbow 500g"`
2. **Column D (Brand)** — infer from product name or known brand databases.
3. **Column L (L1 Qty)** — many rows have an orange pre-fill from the DB Name pattern (e.g. `6*24` → 6). Confirm or correct.
4. **Column Q (L2 Qty)** — same as above; confirm pattern-extracted values.
5. **Column J (Barcode)** — fill from GS1 databases or known product catalogues where possible.
6. **Columns U/V (Reorder / Lead Time)** — fill based on category norms if known.

### Inferring quantities from DB Names
Many DB Names encode pack sizes in the format `QTY*SIZE`:
- `AJAB 24*1KG` → 24 units of 1 Kg → L2 Qty = 24 (if L2 is the carton)
- `BROOKSIDE 6*2.5KG` → 6 units → L2 Qty = 6
- `ALWAYS 16*7 BLUE` → 16 units → L2 Qty = 16

### Kenya VAT rules (Column E)
- **0%** — basic foodstuffs: maize flour, wheat flour, rice, bread, milk, cooking oil, sugar, salt, infant formula
- **16%** — most other goods (beverages, personal care, household, snacks, etc.)
- When blank, default based on category.

---

## Output Rules

- Save as `.xlsx` — **do NOT save as .csv**
- **Do NOT** add, remove, or rename columns
- **Do NOT** edit Column A (DB Name)
- Leave a cell blank rather than guessing if data is truly unknown
- Numeric cells (costs, quantities) must remain numeric — no text like "N/A"

---

## Category Summary (for context)

| Category | Count |
|----------|-------|
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
| *(and 70+ more categories)* | … |

Total: **1,707 products**