# NomadBite POS — Team Status Report
**Date:** 22 May 2026  
**Author:** Abdulaziz Komara  
**Audience:** Internal team + vendor meeting prep

---

## What We Built

NomadBite is a full Point-of-Sale and inventory management system built for the Kenyan market. It runs in the browser, talks to a cloud database, and can connect to external accounting/ERP systems your vendors already use.

Think of it as three layers:

```
[ Cashier / Manager (Browser) ]
          ↓  ↑
[ API Server (Hono / Node) ]
          ↓  ↑
[ Database (PostgreSQL / Supabase) ]
          ↓  ↑
[ External Systems: D365 · Odoo · KRA eTIMS ]
```

---

## Features — What Works Today

### Point of Sale
- Product catalogue with search and category filters
- Cart with quantity control, discounts, and promo codes
- Payment methods: **Cash, M-Pesa, Card, Credit (Mkopo), Split payments**
- Checkout modal with receipt generation
- Voice assistant for hands-free item lookup

### Inventory
- Full stock tracking per item across multiple locations
- Packaging tiers — e.g. sell a bottle, receive a crate (auto-converts on goods receipt)
- Purchase Orders: create → order → receive, with partial receipt support
- Stock adjustments with reason codes (restock, damaged, expired, recount, etc.)
- Barcode label printing
- Spreadsheet import (vendor catalogue format or generic CSV/Excel)

### Customers & Credit
- Customer profiles with purchase history
- Mkopo (credit sales) — track balances, record payments, generate statements
- Credit sale reports per customer

### Reports
- Shift reports — sales, payments breakdown, cash variance
- Mkopo (credit) reports
- Inventory valuation

### Admin
- Multi-store architecture — one system, many locations
- Staff roles: Superadmin, Admin, Cashier
- Promo engine — percent off, fixed off, BOGO
- Store settings, VAT classes per category

### Integrations
| System | Status | What It Does |
|---|---|---|
| **Microsoft D365 F&O** | ✅ Built | Sync products + inventory in; push sales transactions, POs, and goods receipts out |
| **Odoo** | ✅ Built | Sync products + stock in; push sales transactions out |
| **KRA eTIMS** | ✅ Built (awaiting credentials) | Submit tax invoices to Kenya Revenue Authority |
| **CSV / Webhook** | ✅ Built | Generic inbound sync from any system |
| **Cloudinary** | ✅ Built | Product image hosting |
| **AssemblyAI** | ✅ Built | Voice assistant transcription |
| **M-Pesa** | ✅ Built | Mobile money payment processing |

---

## System By the Numbers

| Metric | Count |
|---|---|
| Database models | 28 |
| API routes (files) | 17 |
| Frontend feature modules | 9 |
| Total source files | 122 |
| Lines in database schema | 602 |
| Integration types supported | 7 |

---

## The D365 Integration — How It Works End to End

This is the key piece for your vendor conversation.

### 1. Credentials Setup (one time)
The store admin goes to **Admin → Integrations**, adds a D365 integration, and enters:
- Azure Tenant ID, Client ID, Client Secret
- D365 base URL

Credentials are **encrypted at rest** (AES-256-GCM) — they are never stored in plain text in the database, and the secret is never sent back to the browser after it is saved.

### 2. Product Sync (inbound)
When you trigger a sync, the system:
1. Gets an OAuth2 token from Azure AD (cached for 1 hour)
2. Pulls all released products from D365 `/data/ReleasedProducts`
3. Pulls live on-hand inventory from D365 `/data/InventOnHandV2`
4. Upserts every product into NomadBite — if it exists, update it; if not, create it
5. Writes a sync log with timestamp, items synced, and any errors

This can be triggered manually or scheduled.

### 3. Sales Push (outbound, automatic)
Every time a transaction completes at the POS:
- NomadBite records the sale in its own database first (customer never waits)
- Then **silently** pushes the transaction to D365 Retail Server in the background
- If D365 is unreachable, the sale is still saved — nothing breaks for the cashier

### 4. Purchase Order Push (outbound, automatic)
When a manager marks a PO status as **ORDERED**:
- NomadBite creates the PO header and all lines in D365 automatically
- The D365 PO number is saved back into the NomadBite PO for reference

### 5. Goods Receipt Push (outbound, automatic)
When stock is received against a PO in NomadBite:
- Stock is updated in NomadBite immediately
- A goods receipt is pushed to D365 against the correct PO
- Both systems stay in sync without anyone doing double entry

---

## Security Model

| Concern | How It Is Handled |
|---|---|
| Credentials at rest | AES-256-GCM encrypted in database |
| Credentials over the wire | Secrets are never returned to the browser after saving |
| Webhook endpoints | 192-bit random secret embedded in URL; returns 404 (not 403) on mismatch to avoid enumeration |
| API auth | Store-scoped middleware — no cross-store data leakage |
| KRA eTIMS keys | Stored in server environment variables, not database |

---

## Reliability

- All external pushes (D365, Odoo, eTIMS) are **fire-and-forget** — a slow or down vendor system never blocks a sale
- Failed syncs are logged to `IntegrationSyncLog` with the error message
- Webhook receiver validates secrets before processing any payload
- Database writes use Prisma transactions where stock + adjustment must both succeed or both fail
- Token and session caches avoid hammering external auth endpoints on every request

**Known limitation:** If D365 is down when a PO is pushed, it will not retry automatically. A manual re-trigger is needed. Retry logic is a planned next step.

---

## What Is Not Built Yet (Next Steps)

### High Priority
1. **Automatic retry queue** — if D365/Odoo push fails, queue it and retry with backoff
2. **KRA eTIMS go-live** — credentials are blank; needs registration at etims.kra.go.ke
3. **D365 PO number visible in UI** — the D365 PO number is stored in notes text; needs its own field and display

### Medium Priority
4. **Scheduled sync** — currently sync is manual trigger; add a cron (e.g. nightly at 2am)
5. **Vendor portal** — let vendors see their POs and confirm delivery online
6. **Low-stock alerts** — email/SMS when an item falls below reorder level
7. **QuickBooks / Sage connectors** — schema and routes are stubbed; logic not written yet

### Lower Priority
8. **Offline mode** — currently requires internet; progressive web app (PWA) caching
9. **Multi-currency** — system is KES-first; USD/USD cross-border not supported

---

## For the Vendor Meeting

**Key message:** The system can connect directly to your D365 environment. Once you give us the Azure app credentials (Tenant ID, Client ID, Client Secret, and your D365 URL), we handle everything else:

- Your products flow into our POS automatically
- Every sale we make shows up in your D365 as a transaction
- Every purchase order we raise appears in your D365 immediately
- When we receive goods, your D365 is updated — no manual reconciliation

**What we need from the vendor:**
1. Azure AD app registration with `user_impersonation` or `/.default` scope on their D365 resource
2. Their D365 base URL (e.g. `https://theircompany.operations.dynamics.com`)
3. Confirmation of their `dataAreaId` (legal entity code, e.g. `USMF`)
4. A test/sandbox environment to validate the connection before going live

**What they do not need to change:** Nothing on their D365 side beyond creating an app registration. We use standard OData v4 endpoints that ship with every D365 F&O instance.

---

## Stack Summary (for technical questions)

| Layer | Technology |
|---|---|
| Frontend | React + Vite + TypeScript + Tailwind |
| API | Hono (Node.js) |
| Database | PostgreSQL via Supabase |
| ORM | Prisma |
| Hosting | Vercel (frontend + API) |
| External Auth | Azure AD OAuth2 (D365), Odoo JSON-RPC session |
| Encryption | Node.js `crypto` — AES-256-GCM |

---

*Report generated from codebase state as of 22 May 2026.*
