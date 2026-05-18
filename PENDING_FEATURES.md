# Pending Features — NomadBite POS

## Phase B — Multi-Location Stock ✅ COMPLETE

Split `Item.currentStock` across named physical locations (warehouse, shelf, display fridge, etc.) per store.

**Schema additions:**
- `StockLocation` — named locations per store with type (WAREHOUSE / SHELF / DISPLAY / TRANSIT / OTHER)
- `ItemStock` — quantity per item per location in base units; unique on `(itemId, locationId)`
- `StockTransfer` — full audit trail of every movement: supplier receive, shelf replenishment, disposal

**Invariant:** `Item.currentStock` always equals the sum of all `ItemStock.quantity` rows for that item.
Items without any `ItemStock` rows use `currentStock` as "unallocated" stock (backwards compatible).

**API additions:**
- `GET/POST /api/locations` — store's location list + create
- `PATCH/DELETE /api/locations/:id` — update / soft-deactivate
- `GET /api/products/:id/stock` — per-location breakdown + unallocated
- `POST /api/products/:id/stock/transfer` — move qty between locations (or receive from supplier / dispose)
- `GET /api/transfers` — paginated transfer history for store

**Frontend additions:**
- Locations Manager panel in Inventory page (new "Locations" sub-tab)
- Per-location stock table inside the item editor → Stock tab
- Transfer dialog: pick from-location, to-location, qty, tier, reason
- Shelf replenishment quick-action: items with warehouse stock but low shelf stock

---

## Phase C — Warehouse Integration Plugin ✅ COMPLETE

Pluggable connector so the POS can sync stock data with external systems.

**Integration types:** CSV file upload, Generic webhook receiver, REST API polling, Odoo, QuickBooks, SAGE

**Schema additions:**
- `WarehouseIntegration` — per-store integration config: type, credentials (JSON), syncDirection, fieldMappings (JSON), lastSyncAt
- `IntegrationSyncLog` — history of sync runs with status and row counts

**API additions:**
- `GET/POST /api/integrations` — list / create integration config
- `PATCH/DELETE /api/integrations/:id` — update / remove
- `POST /api/integrations/:id/sync` — trigger manual sync
- `GET /api/integrations/:id/logs` — sync history
- `POST /api/integrations/webhook/:secret` — receive inbound webhook payload

**Frontend additions:**
- Integrations panel in Inventory or Admin page
- Setup wizard: select type → configure credentials → map fields → test → activate
- Field mapper UI: upload sample row, drag-map external fields to internal fields
- Sync status dashboard: last run, rows synced, errors

---

## Phase D — Comprehensive Item Editor Polish ✅ COMPLETE

Already partially delivered in Phase A (tabbed drawer). Remaining items:

- **Supplier tab**: supplier name, phone, lead time days, reorder point, reorder quantity
- **Barcode tab**: item-level barcode + per-tier barcodes (editable in one place)
- **History tab**: stock adjustment log, recent transfers, price change log per item
- Full-screen sheet mode (replace Dialog with Sheet for more space on desktop)

---

## Other Pending Items

### Multi-currency / FX rates
Display prices in USD / EUR alongside KES for tourist-facing stores.

### Supplier Management
- Dedicated Suppliers page (beyond the basic name field on items)
- Purchase orders: create PO → receive → auto-update warehouse stock
- Supplier performance: lead time tracking, price history

### Low-Stock Reorder Alerts
- Per-item reorder point configuration
- Alert badge when shelf stock drops below reorder point
- One-click "Create PO" from alert

### eTIMS / KRA Integration (Phase 2)
- Full eTIMS invoice submission via KRA API
- eTIMS receipt QR codes on printed receipts
- Monthly VAT return summary export

### Mobile App / PWA
- Installable PWA for cashier tablets
- Offline-first with background sync queue (foundation already in place)
- Camera-based barcode scanning

### Loyalty & Customer Profiles
- Customer registration (phone number)
- Points system tied to transactions
- Customer purchase history

### Multi-Store Stock Transfer
- SUPERADMIN-initiated transfers between stores
- Inter-store transfer requests and approval workflow
