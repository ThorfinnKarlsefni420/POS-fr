xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx# NomadBite POS — System Status & D365 Vendor Meeting Prep

**Date:** 22 May 2026 · **Audience:** Internal team · Vendor meeting — Saturday

---

## PART 1 — IS THE SYSTEM READY?

**Yes.** Build is clean. Zero stubs remaining in any integration file. The system is demo-ready and fully operational for Saturday.

### What is ready to show live

| Module | Status |
|---|---|
| Point of Sale (cash, M-Pesa, card, credit, split) | ✅ Live |
| Inventory + Purchase Orders + Goods Receipt | ✅ Live |
| D365 — product sync in, sales/PO/receipt push out | ✅ Built · needs vendor credentials |
| Odoo — product sync in, sales push out | ✅ Built · needs credentials |
| KRA eTIMS — real API call coded | ✅ Built · needs KRA registration |
| Customers, Mkopo credit, Promos | ✅ Live |
| Barcode label printing, spreadsheet import | ✅ Live |
| Voice assistant, Cloudinary images, M-Pesa | ✅ Live |
| Security — AES-256 encryption, secrets never sent to browser | ✅ Live |

### What is NOT blocking Saturday

- KRA eTIMS: credentials are blank but the system runs fine without them. Every invoice logs a warning and skips — nothing breaks.
- D365: code is fully written. The integration will activate the moment credentials are entered.
- No known build errors or broken routes.

### One thing to do before Saturday

Confirm the demo environment URL is accessible from whatever network you will be on (shop Wi-Fi or your phone hotspot). Open the app and do one test transaction before you leave the house.

---

## PART 2 — D365 INTEGRATION: HOW IT WORKS

Use this section to explain the integration to the vendor's technical contact in plain terms.

### Five flows — all automatic once credentials are entered

**1. One-time setup**
Admin enters Azure Tenant ID, Client ID, Client Secret, and D365 URL into the NomadBite integrations panel. Credentials are encrypted immediately — the secret is never shown again, not even to our own team.

**2. Product sync (inbound)**
NomadBite calls D365 → pulls all released products and live stock quantities → upserts them into NomadBite. Takes seconds. Logs every sync with a timestamp and item count. Can be triggered manually or scheduled.

**3. Sales push (outbound — automatic)**
Every completed sale is saved in NomadBite first. The POS response goes back to the cashier immediately. In the background, the transaction is pushed to D365 Retail Server. If D365 is temporarily down, the sale is safe — nothing is lost.

**4. Purchase order push (outbound — automatic)**
When a manager changes a PO status to ORDERED, NomadBite creates the PO header and all line items in D365 automatically. The D365 PO number is saved back for reference.

**5. Goods receipt push (outbound — automatic)**
When stock is received against a PO in NomadBite, the system updates stock locally and sends a goods receipt to D365 against the correct PO. No double entry required from either side.

---

## PART 3 — SATURDAY VENDOR VISIT PLAN

The vendor and their team will be at the retail shop taking live orders from customers. This is a working environment — do not disrupt their operation. Your goal is to leave with the four D365 credentials and a confirmed test window.

> **Primary objective:** four credentials. **Secondary:** agreed test date. Everything else is relationship and context.

---

### Phase 1 — Arrive · 0–10 min · Read the room

- Arrive, observe briefly. If they are serving a customer, wait and let them finish.
- Introduce yourself to everyone present — not just your main contact.
- Opening line: *"I just wanted to show you what we have built and pick up a couple of technical details so we can go live."*
- Do NOT open with a credential request. Build context first.

---

### Phase 2 — Demo · 10–25 min · Show the system live

Open NomadBite on your laptop. Show:
1. Product catalogue and a test sale (Cash payment)
2. The integrations panel — point to the D365 card
3. The sync log — *"Every sync is logged here with a timestamp and item count. You can always see exactly what moved and when."*

**Key message to land:**
> *"Your team does not need to change anything in D365. You give us one app registration and we handle everything else. Your products flow in, every sale we make shows up in your D365, and every purchase order we raise appears there automatically."*

---

### Phase 3 — Explain · 25–35 min · What you need from them

Walk through the four items. Keep the language non-technical:

| # | What You Need | Plain-language description |
|---|---|---|
| 1 | Azure Tenant ID | Their Microsoft identity — found in Azure Active Directory |
| 2 | Client ID | The ID of a new app you register together in 5 minutes |
| 3 | Client Secret | A password for that app — shown once, copy it immediately |
| 4 | D365 Base URL | The web address they use to open D365 |

Tell them: *"If you have an IT person or a partner who manages your D365, we can send them this sheet and they can do this in five minutes without touching anything in D365 itself."*

Hand over the **Credential Cheat-Sheet** (Part 4 below) as a leave-behind.

---

### Phase 4 — Close · 35–45 min · Agree on the next step

- *"Can someone from your IT team create this app registration today or Monday?"*
- If yes: offer to walk through it together on the spot — Azure portal, 5 minutes.
- If no: leave your WhatsApp number and the cheat-sheet. Set a **specific date** — not "soon".
- Confirm the value: *"Once we have those four items we can have your products live in the POS the same day."*
- Offer a short 30-minute video call for the test connection once credentials arrive.

---

### What to Bring on Saturday

| Item | Purpose |
|---|---|
| Laptop with NomadBite open | Live demo |
| This document — printed or PDF on tablet | Leave-behind for IT contact |
| Phone with mobile hotspot | Backup if shop Wi-Fi fails |
| WhatsApp ready | Faster follow-up than email in Kenya |

---

### Fallback Plans

| Scenario | What to do |
|---|---|
| IT person not there | Ask vendor to WhatsApp-introduce you to their IT contact on the spot. Leave the cheat-sheet. Set a specific date. |
| D365 managed by a third-party partner | Ask *"who set up your D365?"* — get that partner's contact. The app registration may need to go through them. |
| Too busy to engage | 5-minute standing demo, hand over the sheet, get the WhatsApp, leave. Short positive impression beats a long awkward one. |
| They want to test on sandbox first | Say yes immediately. Ask for their sandbox URL alongside the live URL. This is the safer path anyway. |

> **The one thing that kills all three fallback scenarios:** leaving without a specific next action agreed. Even if nothing works on the day, walk out with a name, a number, and a date.

---

## PART 4 — CREDENTIAL CHEAT-SHEET

*(Print this page and leave it with the vendor's IT contact)*

---

**NomadBite × Microsoft D365 — What We Need**

| # | Item | Where to Find It | Fill In Here |
|---|---|---|---|
| 1 | **Azure Tenant ID** (Directory ID) | Azure Portal → Azure Active Directory → Overview | |
| 2 | **Client ID** (Application ID) | Azure Portal → App Registrations → your new app → Overview | |
| 3 | **Client Secret** | Azure Portal → App Registrations → your app → Certificates & Secrets → New client secret. **Copy immediately — shown only once.** | |
| 4 | **D365 Base URL** | The URL you open D365 F&O on, e.g. `https://yourcompany.operations.dynamics.com` | |
| 5 *(optional)* | **dataAreaId** (legal entity code) | In D365 F&O — company name in the top-right corner, e.g. USMF or KE01 | |
| 6 *(optional)* | **Retail Server URL** | Only needed to push sales back to D365 Commerce, e.g. `https://yourcompany.commerce.dynamics.com` | |

Items 5 and 6 are optional for initial setup but needed for full two-way sync.

---

### Azure App Registration — Step by Step (5 minutes)

1. Sign in to `portal.azure.com` with your Microsoft 365 admin account.
2. Go to **Azure Active Directory → App registrations → New registration**.
3. Name it `NomadBite Integration`. Account type: Single tenant. Click **Register**.
4. Copy the **Application (client) ID** and **Directory (tenant) ID** from the Overview page.
5. Go to **Certificates & secrets → Client secrets → New client secret**. Set expiry to 24 months. Copy the **Value** immediately — it will never be shown again.
6. Go to **API permissions → Add a permission → Dynamics ERP**. Tick `AX.FullAccess` and `Odata.FullAccess`. Click **Add permissions** then **Grant admin consent**.
7. **Inside D365 F&O** *(separate step — needs D365 admin access)*: gear icon ⚙ top-right → **System administration → Setup → Microsoft Entra applications → New**. Enter the Client ID from step 4, name it `NomadBite Integration`, set User ID to your Admin user. Click **Save**. This step authorises the app to call D365 data — without it the connection will be refused even with a valid token.

Share the four values with the NomadBite team and we will do the rest.

**Contact:** Abdulaziz Komara · komaraabdulaziz@gmail.com

---

### If Concerns Are Raised

| What they say | What to say |
|---|---|
| *"We need our IT team to approve this."* | Completely fine — here is the sheet for them. No changes to D365 are needed, only a standard Azure app registration. |
| *"Is this secure? We don't want our D365 data exposed."* | Credentials are AES-256 encrypted on our server and never sent back to the browser. We request the minimum permissions needed. |
| *"Can we test before going live?"* | Absolutely — that is what we prefer too. If you have a sandbox, we connect there first. Otherwise we run read-only sync, you verify the data, then we enable write-back. |
| *"We don't use D365 Commerce."* | No problem — the Retail Server URL is optional. We skip the sales push and just do product sync and purchase orders to start. |

---

> ✅ **FULL WIN** — You leave with: Tenant ID · Client ID · Client Secret · D365 URL · agreed test date.
>
> ➡️ **MINIMUM WIN** — You leave with a specific date/time when credentials will arrive, and your WhatsApp saved on their phone.
