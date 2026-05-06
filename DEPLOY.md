# NomadBite POS — Deployment Guide

This app has three pieces that need to be deployed:

| Piece | What it is | Where to deploy |
|---|---|---|
| **Database** | PostgreSQL | Supabase |
| **API** | Hono.js Node server (`apps/api`) | Render |
| **Web app** | React + Vite SPA (`apps/web`) | Vercel |

Deploy them in this order: Database → API → Web app.

---

## Step 1 — Database (Supabase)

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Click **New project**. Choose a name (e.g. `nomadbite-pos`), set a strong database password, pick a region close to Kenya (e.g. `eu-central-1` or `ap-southeast-1`).
3. Wait ~2 minutes for provisioning.
4. Go to **Settings → Database → Connection string**.
5. Select the **Transaction Pooler** tab and copy the connection string. It looks like:
   ```
   postgresql://postgres.xxxxxxxxxx:YOUR_PASSWORD@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
   > Use port **6543** (Transaction Pooler), not the direct connection port 5432. This handles connection pooling correctly for a Node.js server.

6. On your local machine, run the database migrations against Supabase:
   ```bash
   cd /path/to/POS-fr
DATABASE_URL="<your_supabase_connection_string>" \
   npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
   ```
   You should see:
   ```
   3 migrations found in prisma/migrations
   All migrations have been applied.
   ```

7. Seed the SUPERADMIN user if it wasn't created by the migration (check first):
   ```bash
   # If the output is 0 rows, run the INSERT below
   DATABASE_URL="<supabase_url>" psql "<supabase_url>" \
     -c "SELECT id FROM \"User\" WHERE role = 'SUPERADMIN';"

   # Only if missing:
   DATABASE_URL="<supabase_url>" psql "<supabase_url>" \
     -c "INSERT INTO \"User\" (id, name, pin, role, \"createdAt\", \"updatedAt\") \
         VALUES ('superadmin_1', 'Super Admin', '9999', 'SUPERADMIN', NOW(), NOW());"
   ```

**Keep the Supabase connection string safe — you'll need it in the next step.**

---

## Step 2 — API (Render)

1. Go to [render.com](https://render.com) and sign up (GitHub login is easiest).
2. Click **New → Web Service** and connect this GitHub repository.
3. Set the following:
   - **Root Directory**: `apps/api`
   - **Runtime**: `Node`
   - **Build Command**: `npm install --include=dev && npm run build`
   - **Start Command**: `npm run start`
4. Under **Environment Variables**, add:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Your Supabase connection string from Step 1 |
   | `PORT` | `3001` |
   | `NODE_ENV` | `production` |
   | `CORS_ORIGIN` | *(leave blank for now — fill in after Step 3)* |

5. Click **Create Web Service**. The first deploy takes about 2 minutes.
6. Render will assign a URL that looks like:
   ```
   https://nomadbite-api.onrender.com
   ```
7. Test the API is alive by opening:
   ```
   https://your-render-url.onrender.com/api/health
   ```
   You should get: `{"status":"ok","db":"postgres","port":3001}`

> **Note:** The free tier spins down after 15 minutes of inactivity. The first request after idle takes ~30 seconds to wake up. Upgrade to a paid plan ($7/mo) to avoid this.

**Keep this Render URL — you'll need it in the next step.**

---

## Step 3 — Web App (Vercel)

1. Go to [vercel.com](https://vercel.com) and sign up (GitHub login).
2. Click **Add New → Project** and import this repository.
3. Vercel will detect the monorepo. Set:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Vite *(auto-detected)*
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Under **Environment Variables**, add:

   | Variable | Value |
   |---|---|
   | `VITE_API_URL` | `https://your-railway-url.up.railway.app/api` |

5. Click **Deploy**. Wait ~1 minute.
6. Copy the Vercel URL — it will look like:
   ```
   https://nomadbite-pos.vercel.app
   ```

---

## Step 4 — Wire CORS (connect API to web app)

Now that both are deployed, go back to Render and set the CORS variable so the API accepts requests from Vercel:

1. Render → your web service → **Environment**
2. Set `CORS_ORIGIN` to your Vercel URL:
   ```
   https://nomadbite-pos.vercel.app
   ```
   Multiple domains (e.g. custom domain + vercel.app) are comma-separated:
   ```
   https://pos.yourdomain.com,https://nomadbite-pos.vercel.app
   ```
3. Click **Save Changes** — Render will automatically redeploy.

---

## Step 5 — Smoke test

Open your Vercel URL and verify:

- [ ] Login screen loads with user cards
- [ ] Log in as **Super Admin** (PIN: `9999`) → should go to SuperAdmin dashboard
- [ ] Log in as a cashier → should land on POS
- [ ] Add items to cart, checkout with Cash → sale completes, receipt appears
- [ ] Open **Returns** tab → recent transaction visible

If login fails with "Cannot reach API", the `VITE_API_URL` is wrong — double-check it points to your Render domain.

---

## Custom Domain (optional)

**Vercel:** Project → Settings → Domains → Add your domain → follow DNS instructions.

**Render:** Web Service → Settings → Custom Domains → follow DNS instructions. Then add the custom domain to `CORS_ORIGIN` in Render.

---

## Environment variable reference

### `apps/api/.env` (local) / Render Environment Variables (production)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | API port (default `3001`) |
| `NODE_ENV` | No | Set to `production` in prod |
| `CORS_ORIGIN` | No | Comma-separated allowed frontend URLs. Defaults to localhost in dev. |

### `apps/web/.env.local` (local) / Vercel Variables (production)

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | No | Full API base URL including `/api`. Defaults to `http://localhost:3001/api` in dev. |

---

## Running locally

```bash
# Install all dependencies
npm install

# Start API (port 3001) and web app (port 5173) together
npm run dev

# Or separately:
npm run dev:api
npm run dev:web
```

The local API reads from `apps/api/.env`. The web app reads from `apps/web/.env.local` if present, otherwise defaults to `http://localhost:3001/api`.

---

## Re-deploying after code changes

- **API changes:** Push to GitHub → Render auto-deploys (if connected to GitHub). Or trigger manually in the Render dashboard.
- **Web changes:** Push to GitHub → Vercel auto-deploys.
- **Schema changes:** Add a new migration file under `packages/database/prisma/migrations/`, then run `prisma migrate deploy` against the Supabase URL (same command as Step 1 above).

---

## Accounts to create

| Service | URL | What for |
|---|---|---|
| Supabase | supabase.com | Managed PostgreSQL database |
| Render | render.com | API hosting |
| Vercel | vercel.com | Web app hosting |

All three have free tiers sufficient for a single-store operation.
