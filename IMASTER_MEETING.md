# iMaster Integration — Meeting Reference

**Date:** 2026-05-26  
**Purpose:** Bidirectional sync between iMaster (master inventory/ERP) and NomadBite POS (online sales channel)

**Relationship:** NomadBite is an **online storefront extension of iMaster** — we sell their catalogue online, and every sale we make must flow back to them as an order so they can fulfil and deduct stock.

---

## The Two Data Flows

```
iMaster ──────────────────────────────────► NomadBite POS
         INBOUND: catalogue, prices, stock
         (keeps our shelves in sync)

NomadBite POS ────────────────────────────► iMaster
              OUTBOUND: sales orders
              (so they deduct stock & fulfil)
```

---

## Our System — What You Need to Know Going In

### Current State
- **54 items** live in the database across 17 categories
- Primary key for items: **`sku`** — this is what drives all upserts
- Stock tracked on `currentStock` (decimal, supports fractional units e.g. 0.5 KG)
- Every completed sale creates a `Transaction` with `LineItem` records (itemId, qty, price)
- We have Kenya VAT engine built-in (16% standard, zero-rated, exempt)

### Integration Framework Already Built
Adding iMaster needs:
1. A new `IMASTER` type in the `IntegrationType` enum
2. A new `imaster.ts` adapter file
3. Inbound + outbound cases in the sync route

Everything else (upsert logic, sync logging, UI, credential encryption, error handling) is already generic and reusable.

---

## Questions to Ask — INBOUND (iMaster → Us)

### Item Identity — CRITICAL
- [ ] What is their **unique identifier** per item? (internal ID, SKU, barcode?)
- [ ] Is it stable — does it ever change for the same product?
- [ ] If an item is discontinued, do they delete it or just flag it inactive?

### Connectivity
- [ ] REST API, SOAP/XML, direct DB connection, or file export?
- [ ] **Base URL** of the API?
- [ ] **Auth method** — OAuth2, API key, basic auth, IP whitelist?
- [ ] Is there a **sandbox/staging environment**?

### Real-Time vs Batch
- [ ] Do they **push via webhook** when prices/stock change, or do we poll?
- [ ] If polling — recommended interval? Any rate limits?
- [ ] If webhooks — which events? (price change, stock change, new item, item deleted?)
- [ ] Acceptable latency for a price change to appear on our POS?

### Fields They Expose
- [ ] **Cost price** and **selling price** as separate fields?
- [ ] Is the price **ex-VAT or inclusive**? (we need ex-VAT — our engine handles VAT)
- [ ] **Stock quantity** — single total or per-warehouse/location?
- [ ] **Unit of measure** (KG, PCS, carton)?
- [ ] **Categories** — do they match our structure or need mapping?
- [ ] **Barcode** field?
- [ ] **Expiry date / manufacturing date**?
- [ ] **Reorder point / reorder quantity**?
- [ ] Any VAT/tax classification per item?

---

## Questions to Ask — OUTBOUND (Us → iMaster)

This is the more critical direction — every online sale we make needs to land in their system.

### Order Format
- [ ] What **endpoint** do we POST sales orders to?
- [ ] What is their **expected order payload** — what fields are required?
  - Order reference / our transaction ID?
  - Line items: SKU + quantity + price?
  - Customer info (name, phone)?
  - Payment method (Cash, M-Pesa, Card)?
  - Total amount, VAT amount?
- [ ] Do they return an **iMaster order ID** we should store for reference?

### Timing
- [ ] Should we push the order **immediately on sale completion** (real-time)?
- [ ] Or can we **batch** (e.g. every 15 minutes, or end of day)?
- [ ] What happens if our push **fails** — do they have a retry endpoint or idempotency key support?

### Stock Deduction
- [ ] When we push a sale, does iMaster **automatically deduct stock** on their end?
- [ ] Or do they expect a **separate stock adjustment call**?
- [ ] What happens if we sell something that iMaster shows as out of stock?

### Order Statuses
- [ ] Do they want to send us **status updates** back? (e.g. order confirmed, packed, dispatched)
- [ ] Do we need to handle **cancellations / refunds** being pushed back to them?

---

## Field Mapping Cheat Sheet

Fill in the iMaster column live during the meeting:

### Inbound (Catalogue Sync)
| iMaster Field | Our Field | Notes |
|---|---|---|
| ? | `sku` | Must be stable unique ID |
| ? | `name` | Product display name |
| ? | `costPrice` | Ex-VAT buying cost, KES |
| ? | `sellingPrice` | Their retail price, KES |
| ? | `currentStock` | Decimal, supports fractions |
| ? | `category` | Free text string |
| ? | `unit` | "KG", "PCS", "LTR" etc. |
| ? | `barcode` | Optional |
| ? | `expiryDate` | Optional, ISO datetime |
| ? | `reorderPoint` | Optional, decimal |

### Outbound (Order Push)
| Our Field | iMaster Field | Notes |
|---|---|---|
| `transaction.id` | ? | Our unique order reference |
| `transaction.createdAt` | ? | Sale timestamp |
| `lineItem.item.sku` | ? | Item identifier |
| `lineItem.quantity` | ? | Decimal qty sold |
| `lineItem.soldPrice` | ? | Actual price charged |
| `lineItem.vatAmount` | ? | VAT per line (we calculate this) |
| `transaction.totalAmount` | ? | Order total |
| `transaction.taxAmount` | ? | Total VAT |
| `transaction.paymentType` | ? | CASH / MPESA / CARD |
| `customer.name` | ? | Optional, if they need it |
| `customer.phone` | ? | Optional |

---

## How Our Upsert Works (Inbound)

Every sync: `upsert WHERE storeId + sku`
- SKU exists → **update** price, stock, name, category, unit
- SKU new → **create** item

iMaster can safely send the full catalogue every sync — idempotent, no duplicates.

---

## How Our Order Push Works (Outbound)

On every completed `Transaction`:
1. Collect all `LineItem` records (sku, qty, price, VAT)
2. Build order payload in iMaster's expected format
3. POST to their orders endpoint
4. Store their returned order ID on our `Transaction` (need to add `imasterOrderId` field)
5. Log success/failure — retry on failure

---

## Sync Modes Available

| Mode | Direction | How it works |
|---|---|---|
| Webhook (receive) | Inbound | iMaster POSTs to us on change |
| REST API poll | Inbound | We call their API on a schedule |
| Webhook (push) | Outbound | We POST to their endpoint on each sale |
| Batch push | Outbound | We send a bundle of orders periodically |

---

## Red Flags to Watch For

- **Unstable SKUs** — if their item IDs change, we get duplicate items on our end
- **VAT-inclusive prices** — we need ex-VAT; our engine adds VAT; double-counting will break receipts
- **No idempotency on order push** — if our POST retries, will they create duplicate orders?
- **Stock not deducted on order receipt** — means iMaster stock and our stock diverge
- **No sandbox** — insist on one; don't test against their live inventory
- **No order failure handling** — what do we do if a sale goes through on our POS but the push to iMaster fails?

---

## What to Walk Away With

| # | Item | Why |
|---|---|---|
| 1 | Their API docs / schema | So we know exact field names and types |
| 2 | Sample catalogue payload (10–20 items) | To validate our field mapping |
| 3 | Sample order payload they expect | To build the outbound push correctly |
| 4 | Sandbox credentials | To test without touching live data |
| 5 | Confirmation: push or poll for inbound? | Determines adapter architecture |
| 6 | Confirmation: real-time or batch for outbound? | Determines when/how we trigger the push |
| 7 | Their order endpoint URL + auth | So we can start building immediately after |

With all 7, the full bidirectional adapter can be built in one session.
