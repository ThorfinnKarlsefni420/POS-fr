# NomadBite — Hardware & Accounting Integrations

## Status

| # | Integration | Status | Needs before go-live |
|---|---|---|---|
| 1 | Barcode Scanner | ✅ Live | Nothing — plug and scan |
| 2 | Receipt Printer (ESC/POS) | 📋 Planned | QZ Tray or `node-thermal-printer` |
| 3 | Cash Drawer | 📋 Planned | Depends on receipt printer |
| 4 | Weighing Scale | 📋 Planned | Web Serial API or serial port route |
| 5 | M-Pesa Daraja (STK Push) | 🔧 Stubbed | Daraja credentials + public callback URL |
| 6 | KRA eTIMS | 🔧 Stubbed | KRA device credentials + signing |
| 7 | Accounting Export (Journal CSV) | ✅ Live | Nothing — download from reports |

**Legend:** ✅ Live · 🔧 Stubbed (code in place, credentials needed) · 📋 Planned (design documented, no code yet)

---

## Architecture overview

```
Browser (React + Vite)              API (Hono / Node.js)            External
─────────────────────               ────────────────────            ────────
Catalog ──[scan]──────────────────► (no round-trip needed)
        useBarcodeScanner hook
        matches SKU → addItem()

CheckoutModal ──[MPESA]──────────► POST /api/mpesa/stk-push ──────► Safaricom Daraja
                                   GET  /api/mpesa/status/:id ─────► Daraja query
                                   POST /api/mpesa/callback ◄───────  Safaricom webhook

POST /api/transactions ──────────► prisma.transaction.create()
                                   └─► submitEtimsInvoice() ────────► KRA eTIMS API
                                         (fire-and-forget)

GET /api/reports/export/journal ─► double-entry CSV ───────────────► QuickBooks / Xero
GET /api/reports/export/sales ──► line-item CSV

POST /api/vendors ───────────────► prisma.vendor.create()
                                   └─► sendVendorWelcome() ─────────► Twilio SendGrid (email)

```

---

## 1. Barcode Scanner ✅

**How it works**

USB and Bluetooth barcode scanners register as HID keyboard devices. They emit the barcode characters in rapid succession (<80 ms total) followed by an Enter keystroke. Normal human typing is much slower, so the hook distinguishes the two.

**Files changed**

| File | Change |
|---|---|
| `apps/web/src/hooks/use-barcode-scanner.ts` | New hook — listens on `document`, buffers rapid keystrokes, fires `onScan(barcode)` |
| `apps/web/src/features/pos/components/catalog.tsx` | Imports hook; on scan, matches `product.sku` and calls `addItem()` directly; falls back to filling the search box |

**Behaviour**

1. Scanner reads a barcode → hook fires `handleScan(code)`.
2. If the SKU matches a product with a price, it's added to the cart immediately — no search needed.
3. If there's no match, the code appears in the search box so the cashier can handle it manually.

**Config needed:** none. Works with any HID scanner out of the box.

---

## 2. Receipt Printer (ESC/POS Thermal) 📋

**Current state**

The checkout modal has a "Print" button that calls `window.print()`, which renders the on-screen receipt view via CSS `@media print`. This works for a standard inkjet/laser printer but not for a USB thermal printer.

**Path to real thermal printing**

Two options — pick one:

### Option A — QZ Tray (recommended for in-store POS)

QZ Tray is a small Java app installed on the POS machine. The browser connects to it over WebSocket and sends ESC/POS byte arrays.

1. Install QZ Tray on every POS machine: [qz.io](https://qz.io/download/)
2. Add the `qz-tray` npm package to the web app.
3. Replace `window.print()` in `checkout-modal.tsx`:

```ts
import qz from 'qz-tray';

await qz.websocket.connect();
const config = qz.configs.create(process.env.VITE_PRINTER_NAME);
const data = buildEscPosReceipt(receiptData); // ESC/POS byte array
await qz.print(config, data);
await qz.websocket.disconnect();
```

4. Add to `.env`: `VITE_PRINTER_NAME=EPSON_TM-T20III`

### Option B — API-side network printer

If the thermal printer is network-connected (Ethernet or Wi-Fi):

1. Add `node-thermal-printer` to `apps/api`:
   ```
   npm install node-thermal-printer
   ```
2. Create `POST /api/print` that accepts receipt JSON and sends ESC/POS bytes to the printer over TCP.
3. Add env vars: `PRINTER_HOST=192.168.1.100`, `PRINTER_PORT=9100`

---

## 3. Cash Drawer 📋

**Depends on:** Receipt printer (either option above).

**How it works**

Cash drawers connect to the receipt printer via an RJ-11 cable and are triggered by sending the ESC/POS `ESC p` command in the print job. No separate driver or USB connection needed.

**Implementation**

Add one line to the print job built in step 2 above:

```ts
// ESC p 0 25 250 — standard drawer kick pulse
data.unshift('\x1B\x70\x00\x19\xFA');
```

Trigger it on CASH payments only.

---

## 4. Weighing Scale 📋

**Schema is already ready**

The `Item` model has `isFractional: Boolean` and `currentStock: Decimal(12,3)`, so selling 0.250 kg works today.

**The gap**

Reading the weight from the scale hardware. Scales expose a serial port (RS-232 or USB-CDC) and stream ASCII strings like `ST,GS,+000.250kg\r\n`.

**Two options**

### Option A — Web Serial API (browser-native, Chrome/Edge only)

```ts
const port = await navigator.serial.requestPort();
await port.open({ baudRate: 9600 });
// read weight string from port.readable
```

Add a `useScale()` hook that streams weight into the quantity field when a fractional item is selected.

### Option B — API route

```ts
// GET /api/scale/weight
import { SerialPort } from 'serialport';
const port = new SerialPort({ path: process.env.SCALE_PORT, baudRate: 9600 });
// read one weight string, parse, return JSON
```

**Config needed:** `SCALE_PORT=/dev/ttyUSB0` (Linux) or `SCALE_PORT=COM3` (Windows)

---

## 5. M-Pesa Daraja (STK Push) 🔧

**How it works**

Instead of the cashier asking the customer to initiate payment manually, the system pushes a payment prompt directly to the customer's phone. The customer enters their M-Pesa PIN, and Safaricom calls the API webhook to confirm — at which point the transaction is marked complete.

**Files changed**

| File | Change |
|---|---|
| `apps/api/src/lib/mpesa.ts` | New — OAuth token fetch, `initiateSTKPush()`, `querySTKPushStatus()` |
| `apps/api/src/routes/mpesa.ts` | New — three endpoints (see below) |
| `apps/api/src/index.ts` | Mounts `mpesaRouter` at `/api/mpesa` |

**Endpoints**

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/mpesa/stk-push` | Initiates STK push to customer's phone |
| `GET` | `/api/mpesa/status/:checkoutRequestId` | Polls payment status (fallback if callback fails) |
| `POST` | `/api/mpesa/callback` | Safaricom calls this when payment succeeds or is cancelled |

**Activate**

1. Create an app at [developer.safaricom.co.ke](https://developer.safaricom.co.ke) → get Consumer Key + Secret.
2. Fill in `.env`:

```env
MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=your_key
MPESA_CONSUMER_SECRET=your_secret
MPESA_SHORTCODE=174379          # Safaricom sandbox shortcode
MPESA_PASSKEY=your_passkey
MPESA_CALLBACK_URL=https://xxxx.ngrok.io/api/mpesa/callback
```

3. For local dev, expose the API publicly:
   ```
   ngrok http 3001
   ```
   Paste the `https://xxxx.ngrok.io` URL as `MPESA_CALLBACK_URL`.

4. Update `checkout-modal.tsx` — replace the manual `awaitingConfirm` step for MPESA with a call to `POST /api/mpesa/stk-push`, then poll `GET /api/mpesa/status/:id` every 3 s until `paid: true`.

5. **Production:** swap `MPESA_ENV=production` and use a real shortcode. The callback URL must be a stable HTTPS domain.

**TODO in callback handler** (`apps/api/src/routes/mpesa.ts`)

The callback receives `CheckoutRequestID`. The `Transaction` model needs a `checkoutRequestId` column so the callback can look up and complete the right transaction.

```prisma
// Add to Transaction model in schema.prisma:
checkoutRequestId String?
```

---

## 6. KRA eTIMS 🔧

**What it is**

The Kenya Revenue Authority Tax Invoice Management System. From 2024, VAT-registered businesses must submit every invoice to KRA in real time. KRA returns a receipt signature and QR code that must appear on the printed receipt.

**Files changed**

| File | Change |
|---|---|
| `apps/api/src/lib/etims.ts` | New — `submitEtimsInvoice()` with full KRA payload structure |
| `apps/api/src/routes/transactions.ts` | Calls `submitEtimsInvoice()` fire-and-forget after every `COMPLETED` transaction |

**Current behaviour**

- If `ETIMS_API_KEY` is not set, the call is a no-op and logs a message. The POS continues working normally.
- If credentials are set, the payload is logged (real `fetch()` call is marked TODO).

**Activate**

1. Register the business and device at [etims.kra.go.ke](https://etims.kra.go.ke).
2. Obtain API key, device serial number, and taxpayer PIN.
3. Fill in `.env`:

```env
ETIMS_API_KEY=your_api_key
ETIMS_DEVICE_SERIAL=your_device_serial
ETIMS_TAXPAYER_PIN=P0512345678A
```

4. In `apps/api/src/lib/etims.ts`, replace the simulated response block with a real `fetch()` to KRA's endpoint:

```ts
const res = await fetch('https://etims-api.kra.go.ke/etims-api/saveInvoice', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apiKey': apiKey,
  },
  body: JSON.stringify(signPayload(payload, devicePrivateKey)),
});
const data = await res.json();
return {
  success: data.resultCd === '000',
  receiptNumber: data.rcptNo,
  qrCode: data.qrcodeUrl,
};
```

5. Once the QR code is returned, pass it back through the transaction response and embed it in the receipt view.

**Item tax rates**

`Item.taxRate` is already in the schema. Currently the eTIMS payload sends `taxRate: 0` as a placeholder — update `transactions.ts` to pull the real rate from the item record once eTIMS goes live.

---

## 7. Accounting Journal Export ✅

**How it works**

A double-entry journal CSV where every transaction produces:
- **Debit** the payment account (Cash, Card Receivable, M-Pesa Receivable, or Vendor Credit Receivable)
- **Credit** Sales Revenue (net of VAT)
- **Credit** VAT Payable (if `taxAmount > 0`)

**Endpoint**

```
GET /api/reports/export/journal?from=2026-05-01&to=2026-05-31
```

Returns a `.csv` file ready to import into QuickBooks (Company → Journal Entries → Import) or Xero (Manual Journals → Import).

**Chart of accounts used**

| Code | Account |
|---|---|
| `1010-Cash` | Cash sales |
| `1020-Card Receivable` | Card payments |
| `1030-M-Pesa Receivable` | M-Pesa payments |
| `1040-Vendor Credit Receivable` | Credit sales |
| `4000-Sales Revenue` | Revenue (net of VAT) |
| `2200-VAT Payable` | Output VAT |

**Existing endpoint**

```
GET /api/reports/export/sales?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Returns a line-item detail CSV (one row per product sold) useful for reconciling individual items.

---

## Environment variables — complete reference

Add these to `apps/api/.env`. All are optional until the feature is activated.

```env
# ── Email (Twilio SendGrid) ─────────────────────────────────────────────
SENDGRID_API_KEY=SG.xxx...
SENDGRID_FROM_EMAIL=onboarding@yourdomain.com
# Production sender:                  no-reply@yourdomain.com

# ── M-Pesa Daraja ─────────────────────────────────────────────────
MPESA_ENV=sandbox                # or: production
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=174379           # sandbox test shortcode
MPESA_PASSKEY=
MPESA_CALLBACK_URL=https://xxxx.ngrok.io/api/mpesa/callback

# ── KRA eTIMS ──────────────────────────────────────────────────────
ETIMS_API_KEY=
ETIMS_DEVICE_SERIAL=
ETIMS_TAXPAYER_PIN=

# ── Receipt Printer (future) ───────────────────────────────────────
# VITE_PRINTER_NAME=EPSON_TM-T20III     # QZ Tray printer name
# PRINTER_HOST=192.168.1.100            # network printer IP
# PRINTER_PORT=9100                     # network printer port (default 9100)

# ── Weighing Scale (future) ───────────────────────────────────────
# SCALE_PORT=/dev/ttyUSB0              # Linux
# SCALE_PORT=COM3                      # Windows
```

---

## What to do next

| Priority | Action |
|---|---|
| 1 | Add Daraja sandbox keys → test STK push end-to-end |
| 2 | Update `checkout-modal.tsx` to call `/api/mpesa/stk-push` instead of manual confirm |
| 3 | Add `checkoutRequestId` column to `Transaction` schema so the M-Pesa callback can close the right transaction |
| 4 | Register with KRA eTIMS → replace the stub `fetch()` call in `etims.ts` |
| 5 | Pull real `taxRate` from `Item` into the eTIMS payload |
| 6 | Choose receipt printer path (QZ Tray vs. network) → implement print job builder |
| 7 | Add cash drawer kick command to print job for CASH transactions |
