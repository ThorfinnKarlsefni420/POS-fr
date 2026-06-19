# Inventory Data Audit Standards

This document describes the rules applied when converting raw inventory data (`realData.txt`) into the NomadBite product import format (`realData-import.csv`). It covers how items are structured, how base units are determined, and how edge cases are handled.

---

## 1. Data Structure

Each product in the source file can have multiple rows — one per unit of measure (UOM). Rows for the same product share an `ITEM_ID`. The system groups all rows by `ITEM_ID` and maps them to a single import row with up to three packaging tiers:

| Column | Meaning |
|---|---|
| Base Unit | The smallest sellable unit (PCS) |
| L1 Pack | First packaging tier (e.g. OUT = 30 PCS) |
| L2 Pack | Second packaging tier (e.g. CTN = 20 OUT) |

Tiers are ordered by `UOM_RATIO` ascending. L2 Qty in L1 is computed as `L2_ratio ÷ L1_ratio`.

---

## 2. Base Unit Classification

### 2a. Explicit PCS base (kept as-is)

If any row for the item has `UOM_RATIO = 1` and the UOM is not a bulk packaging name (see §3), it is used as the base unit without modification. Examples: `PCS`, `KG`, `LTR`, `ML`.

### 2b. Bulk UOM at ratio 1 — synthesise PCS base

The following UOM names are considered bulk packaging identifiers:

```
CTN  OUT  BAL  DOZ  JRC  BAG  TM  HL  HLT
```

When one of these appears with `UOM_RATIO = 1`, a PCS base row is synthesised using the universal ratio rule (§3).

---

## 3. Universal Rule — 1 Bulk Pack = 30 PCS

Every bulk packaging unit is treated as containing **30 PCS**, regardless of product type, size, or any count that may be encoded in the product name. This ensures consistent pricing and stock tracking across all items.

When this rule is applied:

- A `PCS` base row is synthesised:
  - `Base Cost = bulk_cost ÷ 30`
  - `Base Sell = bulk_sell ÷ 30`
  - `Base Stock = source_stock × 30`
- The original bulk UOM becomes **L1** with `Qty in Base = 30`
- **L2 tier**:
  - If the source data contains a second bulk tier above the base (e.g. BAL above OUT), it becomes L2 with its ratio scaled relative to PCS (`source_ratio × 30`), and `Qty in L1 = scaled_ratio ÷ 30`
  - If only one bulk tier exists in source, a synthetic outer **CTN** is created as L2 with `Qty in L1 = 20` (20 inner packs per outer carton), `L2 Cost = L1_cost × 20`

| Example | PCS cost | L1 | L2 |
|---|---|---|---|
| `5 TEA 50G GINGER` OUT=1 (cost 350) | 11.67 | OUT qty=30 cost=350 | CTN qty=20 cost=7000 (synth) |
| `WEETABIX 50*37G` CTN=1 (cost 860) | 28.67 | CTN qty=30 cost=860 | CTN qty=20 cost=17200 (synth) |
| `BABY JOY NO 2` OUT=1 BAL=3 source | 28.80 | OUT qty=30 | BAL qty=3 (3×OUT = 90 PCS) |

---

## 4. Anomaly (skipped)

An item is omitted from the import file only when **no base row can be identified at all**:

- `UOM_RATIO = 0` for all rows (corrupt or missing source data)
- All rows have ratio > 1 with no base-level row present

These items have no usable cost, price, or ratio and cannot be priced or tiered.

---

## 5. Summary of Decision Flow

```
Item rows grouped by ITEM_ID
        │
        ▼
Has non-bulk row at ratio=1 (PCS/KG/LTR)?
  YES → use as base, keep tiers as-is ────────────────────► Import
  NO
        │
        ▼
Has BULK_UOM at ratio=1?
  NO  → ratio=0 or all rows > 1 ─────────────────────────► Skip (anomaly)
  YES
        │
        ▼
Apply universal rule: 1 bulk pack = 30 PCS
  Synthesise PCS base (cost ÷ 30)
  L1 = original bulk UOM (qty 30)
  L2 = source second tier (ratio × 30) OR synthetic CTN (qty 20)
                                                          ► Import
```

---

## 6. Source

- Conversion script: `scripts/convert-realdata.mjs`
- Test coverage: `apps/api/tests/inventory-data.test.ts`
