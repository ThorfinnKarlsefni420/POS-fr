# NomadBite POS — System Overview

A Point of Sale and inventory management system built for NomadBite, a Kenyan grocery/retail business. It runs on a laptop or tablet at the counter and handles selling, stock tracking, cash management, and reporting.

---

## What the system does

### 1. Selling (POS)
The main screen is a product catalog. A cashier taps items to add them to a cart, adjusts quantities, and checks out.

- Items are searched by name or SKU (in case the barcode scanner fails)
- Each item has its own tax rate (food = 0%, non-food = 16%) — tax is shown as a separate line in the cart
- The system allows a sale to go through even if stock hits zero (negative stock), rather than blocking the cashier. The item is flagged for a recount instead
- Supported payment types: Cash, Card, M-Pesa

### 2. Pricing
Every item has two prices:

| Field | Meaning |
|---|---|
| Cost Price | What NomadBite paid the supplier (wholesale) |
| NomadBite Price | What the customer pays = Cost Price + Service Fee % |

The service fee percentage is set by the admin and applied across all items. The admin can change the % and recalculate all prices in one click.

### 3. Inventory
The inventory page lists every item and its current stock level. From here you can:

- **Import items** from an Excel or CSV spreadsheet (bulk upload, up to thousands of items)
  - Option to clear all existing inventory before importing, or merge/update only what changed
- **Adjust stock manually** — for breakage, theft, expiry, or restocking — with a reason code logged each time
- **Returns** — when a customer returns an item, you choose whether to add it back to stock (undamaged) or not (damaged/defective)

### 4. Shifts & Cash Management
Before a cashier starts selling, they open a shift by entering the starting cash in the drawer. During the shift they can log:

- **Pay-in** — cash added to the drawer for non-sale reasons (e.g. change top-up)
- **Pay-out** — cash taken out for non-sale reasons (e.g. buying supplies)

When the shift ends, the cashier counts the physical cash and enters the amount. The system compares it against the expected total and shows the variance.

### 5. Users & Roles
There are two roles:

| Role | What they can do |
|---|---|
| Admin | Everything — settings, inventory, reports, voids, refunds |
| Cashier | Sell, process returns, log cash movements |

Sensitive actions (voids, refunds, large discounts) require an Admin PIN to proceed.

### 6. Reports
The reports page covers:

- **Sales report** — revenue, transaction count, payment method breakdown, top products, daily totals
- **Shift report** — per-shift cash reconciliation
- **Inventory report** — total stock value, low-stock and out-of-stock lists, stock by category, recent adjustments
- Sales data can be exported as a CSV

---

## How it is built

```
NomadBite POS (monorepo)
├── apps/web      → React frontend (what the cashier sees)
├── apps/api      → Backend API server
└── packages/database → Database schema
```

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS, Zustand (state), TanStack Query (data fetching), shadcn/ui |
| Backend | Hono (lightweight Node.js server) |
| Database | PostgreSQL 17 (runs in Docker) accessed via Prisma ORM |

The frontend talks to the backend over a REST API. The backend reads and writes to a PostgreSQL database.

---

## How to run it

**Prerequisites:** Node.js, Docker

```bash
# 1. Start the database
docker start nomadbitepOS

# 2. Start the API (Terminal 1)
cd apps/api && npm run dev      # runs on http://localhost:3001

# 3. Start the frontend (Terminal 2)
cd apps/web && npm run dev      # runs on http://localhost:5173
```

Open `http://localhost:5173` in a browser.

---

## Data flow for a sale

```
Cashier taps item → added to cart
Cashier hits Checkout → cart sent to API
API writes transaction to database
API deducts stock from each item
API returns result (including any stock warnings)
Frontend shows receipt / next sale
```

---

## Key business rules

- Stock can go negative — sales are never blocked, but negative items are flagged
- Every price change is recorded (original price vs sold price) for accurate profit reporting
- Every stock movement has a reason — sales, adjustments, returns, and damaged goods are all logged separately
- Tax is per item, not per order
- Service fee is the business markup on top of supplier cost — it is not a government tax
