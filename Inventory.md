# Inventory Management System — IDE Agent Prompt

## Context

I have a vendor inventory CSV (`vendor_inventory.csv`) with **3,033 items** across **44 product categories** for a retail/wholesale business in Kenya. The columns are:

| Column | Description |
|---|---|
| `item_name` | Product name including brand and size |
| `category` | Product category (e.g. Rice, Cooking Oil, Diapers) |
| `cost_price_kes` | Purchase/vendor price in KES |
| `selling_price_kes` | Retail selling price in KES |
| `unit` | Unit of sale (Carton, Bag, Piece, Jerrycan, etc.) |
| `stock_balance` | Current quantity in stock |
| `margin_kes` | Profit per unit in KES (derived) |
| `margin_pct` | Profit margin as % of selling price (derived) |

---

## What I Need You to Build

Build a simple, user-friendly **inventory management system** with three capabilities:

---

### 1. Bulk Upload (CSV Import)

- Accept a CSV file upload using the same column structure above
- Validate each row: check for missing `item_name`, `category`, negative prices, invalid `unit` values
- On conflicts (same `item_name` + `unit` already exists): ask user whether to **overwrite** or **skip**
- Show a clear summary after import: `X items added, Y skipped, Z errors`
- Provide a downloadable error report for failed rows
- Keep it simple — no need for complex deduplication logic

**Accepted units:** Carton, Bag, Piece, Pieces, Packet, Box, Jerrycan, Dozen, Bale, Outer, Kilogram, and variants like "Carton of 12", "Bag of 4"

---

### 2. Add Individual Item

A simple form with these fields:
- Item Name (text, required)
- Category (dropdown from existing categories + "Add new" option)
- Cost Price KES (number, required)
- Selling Price KES (number, required — must be ≥ cost price)
- Unit (dropdown from accepted units above)
- Stock Balance (number, default 0)

Auto-calculate and display margin (KES + %) before saving. Show a confirmation before adding.

---

### 3. Data Analysis Dashboard

Keep it simple — just these views:

**a) Overview Stats (top of page)**
- Total items, total categories, total stock value (sum of `cost_price_kes × stock_balance`), avg margin %

**b) Low / Out of Stock Alert**
- Table of items where `stock_balance = 0` or `stock_balance < 2`
- Columns: Item Name, Category, Unit, Stock Balance

**c) Top 10 Items by Margin %**
- Bar chart or simple table sorted by `margin_pct` descending

**d) Category Summary Table**
- One row per category: item count, avg cost price, avg selling price, avg margin %, total stock value
- Sortable by any column

**e) Price Outlier Flag**
- Items where `margin_pct < 5%` (possible pricing error) or `margin_pct > 60%` (unusually high)
- Simple table for review

---

## Tech Notes

- Load `vendor_inventory.csv` as the starting dataset
- Use a simple local data store (SQLite or in-memory dict/list) — no need for a full backend
- UI can be Streamlit, a simple React app, or a CLI with menus — whatever is fastest to run
- No login/auth required
- All prices in KES (Kenyan Shillings)

---

## Simplicity Rules

- No complex UI — plain tables and basic charts are fine
- Error messages should be human-readable (e.g. "Selling price can't be lower than cost price")
- Every action should have a clear confirm/cancel step
- The CSV export of the current inventory should always be available as a download button

---

Start by loading the CSV, showing the overview stats, and then present a simple menu/nav for the three sections above.