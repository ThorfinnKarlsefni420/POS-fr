# Inventory Data Audit Standards

This document describes the rules applied when converting raw inventory data (`realData.txt`) into the NomadBite product import format (`realData-import.csv`). It covers how items are structured, how base units are determined, and how edge cases are handled.

---

## 1. Data Structure

Each product in the source file can have multiple rows — one per unit of measure (UOM). Rows for the same product share an `ITEM_ID`. The system groups all rows by `ITEM_ID` and maps them to a single import row with up to three packaging tiers:

| Column | Meaning |
|---|---|
| Base Unit | The smallest sellable unit (e.g. PCS, KG, LTR) |
| L1 Pack | First packaging tier (e.g. DOZ = 12 PCS) |
| L2 Pack | Second packaging tier (e.g. CTN = 4 DOZ) |

Tiers are ordered by `UOM_RATIO` ascending. L2 Qty in L1 is computed as `floor(L2_ratio / L1_ratio)`.

---

## 2. Base Unit Classification

The audit first determines whether the item has a valid, known base unit.

### 2a. Explicit PCS base

If any row for the item has `UOM_RATIO = 1` and the UOM is not a bulk packaging name (see §3), it is accepted as the base unit without further checks. Examples: `PCS`, `KG`, `LTR`, `ML`.

### 2b. Bulk UOM at ratio 1 — requires classification

The following UOM names are considered "bulk packaging" identifiers:

```
CTN  OUT  BAL  DOZ  JRC  BAG  TM  HL  HLT
```

When one of these appears with `UOM_RATIO = 1`, the system cannot assume it is the base unit without additional validation. The classification rules below apply in order.

---

## 3. Bulk UOM Classification Rules

### Rule 1 — JRC (Jerry Can)

A `JRC` at ratio 1 is always accepted as a valid single unit regardless of size or product name. Jerry cans are counted individually in the NomadBite system.

### Rule 2 — Large BAG (≥ 10 kg)

A `BAG` at ratio 1 is accepted as a valid single unit if the product name encodes a weight of **10 kg or more** (e.g. `PEMBE FLOUR 10KG BAG`). Bags with no parseable weight, or weight below 10 kg, are not auto-classified.

### Rule 3 — Water carton size check

If the product name contains `WATER` and the UOM is `CTN`, `BAL`, `OUT`, `HL`, or `HLT` at ratio 1, the item is only valid if the product name encodes a volume of **5 litres or more**.

| Example | Result |
|---|---|
| `GLACIER WATER 5LTR CTN` | Valid single unit |
| `DRIFT WATER 500ML CTN` | Skipped (under 5 L) |
| `BLUE FALLS WATER 1.5LTR CTN` | Skipped (under 5 L) |

### Rule 4 — Ratio inferred from product name

When none of the above rules apply, the system attempts to extract the pack count from the product name. Three name formats are recognised:

#### Format 1 — Count before `*`, measurement unit after second number

The number before `*` is the pack count. Applies even when the count is embedded directly in the product name (no space required before it).

```
INDOMIE 20*120GMS       → 20 per carton
DAIMA 18*500ML          → 18 per carton
WEETABIX 50*37G         → 50 per carton
KAYSALT30*200GR         → 30 per carton  (count embedded in brand name)
KSL WHITE MINT 12*1KG   → 12 per carton
```

#### Format 2 — Size embedded before `*`, count after

When an alphabetic character immediately precedes the first number (meaning the number is part of the product name, not a standalone count), the number **after** `*` is the pack count.

```
LISHA MILK500*12        → 12 per carton  ("500" is part of "MILK500")
```

The distinction from Format 1 is the absence of a measurement unit after the second number. If a unit is present, Format 1 takes precedence regardless of embedding.

#### Suffix format — `*N` or `*Npcs` at end of name

A trailing `*N` (optionally followed by `PCS`, `PK`, `PACK`, `UNITS`, `BAGS`) is treated as the pack count.

```
TOP CHIPS*24pcs         → 24 per carton
PBISCO*24PCS            → 24 per carton
CLUB GLUCOSE 72PK*4     → 4 per carton
APC*125*100TAPLETS      → 125 per carton  ("*" before standalone "125")
```

When a ratio is successfully inferred:
- A synthetic `PCS` base row is created with `cost = bulk_cost / inferred_ratio`
- The bulk UOM row is promoted to L1 with `ratio = inferred_ratio`

### Rule 5 — Unclassifiable (skipped)

If none of the four rules above resolve the base unit, the item is **omitted** from the import file. This covers:

- Products with no size or count information in the name
- Items where `UOM_RATIO = 0` (corrupt source data)
- Items that only have packaging-level rows (all ratios > 1, no base row)

---

## 4. Summary of Decision Flow

```
Item rows grouped by ITEM_ID
        │
        ▼
Has PCS (or non-bulk) row at ratio=1?
  YES → use as base ──────────────────────────────────────► Import
  NO
        │
        ▼
Has BULK_UOM at ratio=1?
  NO  → no base row at all ───────────────────────────────► Skip
  YES
        │
        ▼
UOM = JRC?
  YES → valid single unit ────────────────────────────────► Import
        │
        ▼
UOM = BAG and name encodes ≥ 10 kg?
  YES → valid single unit ────────────────────────────────► Import
        │
        ▼
Name contains WATER and UOM in {CTN,BAL,OUT,HL,HLT}?
  YES → volume ≥ 5 L?
          YES → valid single unit ──────────────────────────► Import
          NO  → water carton too small ──────────────────────► Skip
        │
        ▼
Infer ratio from product name (Formats 1, 2, Suffix)?
  YES → synthesise PCS base row ──────────────────────────► Import
  NO  → ratio unknown ────────────────────────────────────► Skip
```

---

## 5. BULK_UOM Normalisation

Any bulk packaging UOM (`CTN`, `OUT`, `BAL`, etc.) that ends up as the **base row** (ratio = 1) after passing all classification rules is renamed to `PCS` in the output. This applies to JRC and large-BAG items that are valid single units.

---

## 6. Source

- Conversion script: `scripts/convert-realdata.mjs`
- Ratio inference function: `apps/api/src/scripts/parse-lungalunga.ts` → `inferRatioFromName()`
- Test coverage: `apps/api/tests/inventory-data.test.ts`
