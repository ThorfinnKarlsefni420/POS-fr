# Vendor Onboarding Plan — Dynamics 365 + Somali Voice AI
_Date: 2026-05-21_

---

## Objective

Onboard a hesitant vendor running Microsoft Dynamics 365 Commerce by:
1. Syncing their full product/price/inventory dataset into NomadBite POS without disrupting their existing workflow
2. Pushing NomadBite sales back to D365 so their records stay consistent
3. Deploying a Somali-language ambient voice layer that surfaces product suggestions in real time — a capability D365 does not have

---

## Business Phases

### Phase 1 — Build trust, don't push migration (Week 1–2)

**Goal:** Make NomadBite feel like a complement, not a threat to D365.

- Run NomadBite POS in parallel with D365 — vendor keeps using D365 as-is
- Demonstrate the sync is invisible: their D365 data appears in NomadBite automatically
- Show them one concrete win early (KRA eTIMS compliance, offline mode, or shift reconciliation — pick whichever D365 does worst in their setup)
- Do not ask them to change anything yet

**Your pitch:** *"Keep using what you know. We sync in the background. If you don't like it after two weeks, nothing was broken."*

---

### Phase 2 — Set up the data bridge (Week 2–4)

Full technical detail in the implementation section below. Summary:

- Pull D365 product catalog, pricing, and inventory into NomadBite every 15–30 minutes via D365 OData API
- Use your existing `WarehouseIntegration` + `sync-engine` framework — add `DYNAMICS_365` as a new integration type
- Push every NomadBite transaction back to D365 via D365 Commerce Retail Transaction API
- Sync is bidirectional from day one so the vendor sees their data flowing both ways

**Questions to confirm before building:**
1. Does the vendor have D365 Commerce API credentials available, or does their IT team need to provision a service account?
2. Is their D365 instance cloud-hosted (Microsoft Azure-managed) or on-premise? This determines the auth flow.
3. Do they want agent-initiated polling (NomadBite polls D365 on a schedule) or webhook-driven (D365 pushes changes to NomadBite)? Start with polling — it requires no D365 config changes on their side.

---

### Phase 3 — Give them a visible win (Week 3–5)

Pick one thing NomadBite does demonstrably better than their D365 setup and make them feel it:

| Likely pain point in D365 | NomadBite advantage |
|---------------------------|---------------------|
| No offline capability | Offline mode with auto-sync queues |
| KRA eTIMS not integrated | Fire-and-forget eTIMS submission on every transaction |
| Shift reconciliation is manual | Shift close calculates variance automatically |
| No Somali voice support | Ambient voice layer (see Phase 4) |

Deploy the Somali voice layer during this phase — it is the strongest differentiator and the one D365 cannot match without a major custom build.

---

### Phase 4 — Gradual handover

Once the sync is stable and they have used NomadBite alongside D365 for a few weeks, propose:
1. D365 reduced to reporting-only (NomadBite becomes the transaction source of truth)
2. Eventually sunset D365 or keep it as a finance/ERP backend only (which is what D365 does best anyway)

---

## Technical Implementation

### Part A — D365 OData Integration

#### Schema change

Add `DYNAMICS_365` to the `IntegrationType` enum in `packages/database/prisma/schema.prisma`:

```prisma
enum IntegrationType {
  CSV
  WEBHOOK
  REST_API
  ODOO
  QUICKBOOKS
  SAGE
  DYNAMICS_365   // ← add this
}
```

The existing `WarehouseIntegration` model already holds `credentials` (JSON) and `fieldMappings` (JSON) — no new columns needed. The `credentials` JSON for a D365 integration will store:

```json
{
  "tenantId": "...",
  "clientId": "...",
  "clientSecret": "...",
  "d365BaseUrl": "https://{environment}.operations.dynamics.com",
  "retailServerUrl": "https://{environment}.commerce.dynamics.com",
  "channelId": "..."
}
```

#### Auth — Azure AD OAuth2 (client credentials)

D365 uses Azure AD service-to-service auth. Flow:

```
POST https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token
  grant_type=client_credentials
  client_id={clientId}
  client_secret={clientSecret}
  scope=https://{d365BaseUrl}/.default
```

Token is valid for 1 hour — cache it and refresh before expiry.

#### Pull: D365 → NomadBite (products + inventory)

Key D365 OData endpoints:

| Data | Endpoint |
|------|----------|
| Products | `GET /data/ReleasedProducts?$select=ItemNumber,ProductName,SalesPrice,CostPrice,InventColorId` |
| Inventory | `GET /data/InventOnHandV2?$filter=ItemNumber eq '{sku}'&$select=ItemNumber,PhysicalInventory` |
| Categories | `GET /data/EcoResProductCategoryHierarchyAssignments` |
| Price groups | `GET /data/PriceDiscTable?$filter=...` |

Mapping to NomadBite schema:

| D365 field | NomadBite field |
|------------|-----------------|
| `ItemNumber` | `sku` |
| `ProductName` | `name` |
| `CostPrice` | `costPrice` |
| `SalesPrice` | `sellingPrice` |
| `PhysicalInventory` | `currentStock` |
| Category assignment | `category` |

Use your existing `/api/products/import` endpoint (SKU-level upsert) — the sync engine just needs to fetch from D365 and POST to your own API. The `replace: false` mode means incremental upserts never destroy history.

#### Push: NomadBite → D365 (transactions)

After every `POST /api/transactions` succeeds, fire-and-forget a push to D365 Retail Server:

```
POST {retailServerUrl}/Commerce/Transactions/Create
{
  "TransactionId": "{nomadBiteTransactionId}",
  "ChannelId": "{channelId}",
  "Lines": [...],
  "TotalAmount": ...,
  "PaymentType": ...
}
```

Mirror the pattern already used for eTIMS in `apps/api/src/routes/transactions.ts:219-236` — fire-and-forget, catch errors, never block the POS response.

#### Sync schedule

Add a cron-style polling job in `apps/api/src/lib/sync-engine.ts`. Poll every 15 minutes for active D365 integrations. Log every sync to `IntegrationSyncLog` (already in the schema).

---

### Part B — Somali Voice AI Layer

#### What it does

Ambient microphone at the POS picks up Somali speech from customers and staff. The system:
1. Transcribes speech in real time (Whisper)
2. Extracts product intent from the transcription (Claude API)
3. Surfaces matching products as suggestions in the POS catalog UI — the cashier taps to add to cart

This gives the cashier a speed advantage and reduces missed sales when a customer mentions a product by its Somali name.

#### Technical stack

| Layer | Technology |
|-------|-----------|
| Audio capture | Browser `MediaRecorder` API (WebRTC, no install needed) |
| Speech-to-text | OpenAI Whisper API (`whisper-1` model, Somali `so` language code) |
| Intent extraction | Claude `claude-sonnet-4-6` with product catalog as context |
| Real-time delivery | WebSocket from API to POS frontend |
| Product matching | Fuzzy match against in-memory product list |

#### Architecture

```
[Browser mic] → [MediaRecorder, 5s chunks]
     ↓
[POST /api/voice/transcribe]   (new endpoint)
     ↓
[Whisper API → Somali text]
     ↓
[Claude API]
  System: "You are a Kenyan grocery store assistant. Given this Somali speech transcript,
           identify any product names, quantities, or requests mentioned.
           Return JSON: { products: [{ name, qty, confidence }] }"
     ↓
[Fuzzy match against store's product catalog]
     ↓
[WebSocket push to POS frontend]
     ↓
[Suggestion chips appear above catalog — cashier taps to add to cart]
```

#### New API endpoint

```
POST /api/voice/transcribe
  Body: { audioBase64: string, mimeType: string }
  Headers: X-User-Id, X-Store-Id

Returns: {
  transcript: string,
  suggestions: Array<{ productId, name, qty, confidence }>
}
```

#### Frontend integration

In `apps/web/src/features/pos/pos-page.tsx`, add a mic toggle button. While active:
- Stream 5-second audio chunks to `/api/voice/transcribe`
- Display returned `suggestions` as dismissible chips above the catalog grid
- Tapping a chip calls `cartStore.addItem()` directly

#### Somali product name mapping

D365 products likely have English names. Build a supplementary name alias table — either as a `notes` field on `Item` or a separate JSON config — mapping common Somali terms to SKUs:

```json
{
  "sonkor": "SUGAR-1KG",
  "bariis": "RICE-2KG",
  "caano": "MILK-500ML",
  "saliid": "COOKING-OIL-1L"
}
```

The Claude prompt includes this alias map so it can resolve Somali product names to catalog SKUs even when the catalog itself is in English.

---

## Immediate Next Steps

| Step | Owner | Blocker |
|------|-------|---------|
| Confirm D365 API credentials and instance type (cloud vs on-prem) | Vendor IT | Nothing — ask today |
| Add `DYNAMICS_365` to IntegrationType enum and migrate | Dev | Credentials |
| Build D365 OAuth token fetch + OData product pull | Dev | Credentials |
| Test upsert of D365 products into a staging store | Dev | Credentials |
| Stand up `/api/voice/transcribe` endpoint with Whisper | Dev | OpenAI API key |
| Build mic capture + suggestion UI in POS | Dev | Voice endpoint |
| Prepare Somali product alias map with vendor input | Dev + Vendor | Vendor cooperation |

---

## What Makes This Pitch Win

D365 Commerce is a powerful ERP but it is:
- Not optimised for small Kenyan retail (no offline mode, no eTIMS, no Somali UI)
- Expensive to customise
- Has no ambient voice capability in any Somali-speaking market context

NomadBite offers the vendor a path where D365 keeps doing finance/reporting (what it does well) while NomadBite owns the shop floor — faster, offline-capable, KRA-compliant, and the only POS in the market that understands what their customers are saying in Somali.

The sync bridge means they never have to choose between the two systems. That removes the biggest objection hesitant vendors have.
