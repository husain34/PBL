# 🚀 Deployment Guide — PBL Finance App

**Stack:** React + Vite (client) → Vercel | Express + Node.js (server) → Render | Supabase (DB)

---

## Phase 1 — Push to GitHub

> Both Render and Vercel deploy directly from GitHub. Do this first.

### 1.1 — Initialize & Push

```bash
# From d:\PBL
git init        # skip if already a git repo
git add .
git commit -m "initial commit"
```

Go to [github.com/new](https://github.com/new) and create a **new empty repo** (no README).

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git branch -M main
git push -u origin main
```

### 1.2 — Verify `.gitignore`

Make sure your `.gitignore` at the root contains at least:

```
node_modules/
server/.env
client/.env
client/.env.local
```

> [!CAUTION]
> Never push `.env` files. Your Supabase keys and JWT secret must stay local.

---

## Phase 2 — Deploy Server on Render

### 2.1 — Create Render Account & New Web Service

1. Go to [render.com](https://render.com) → **Sign Up** (use GitHub)
2. Click **New +** → **Web Service**
3. Connect your GitHub repo
4. Configure the service:

| Setting | Value |
|---|---|
| **Name** | `pbl-server` (or any name) |
| **Root Directory** | `server` |
| **Environment** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |
| **Instance Type** | Free |

### 2.2 — Add Environment Variables on Render

In the Render dashboard → **Environment** tab, add these:

| Key | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Your Supabase anon/public key |
| `JWT_SECRET` | A long random string (e.g., run `openssl rand -hex 32`) |
| `FRONTEND_URL` | *(leave blank for now — fill in after Vercel deploy)* |

> [!NOTE]
> `PORT` is set automatically by Render. Do NOT add it manually.

### 2.3 — Deploy

Click **Create Web Service**. Render will:
1. Pull your code from GitHub
2. Run `npm install`
3. Start with `node server.js`

Wait for the status to show **Live** (takes ~2 min).

**Copy your Render URL** — it looks like `https://pbl-server.onrender.com`

---

## Phase 3 — Deploy Client on Vercel

### 3.1 — Create Vercel Account & New Project

1. Go to [vercel.com](https://vercel.com) → **Sign Up** (use GitHub)
2. Click **Add New Project** → Import your GitHub repo
3. Configure:

| Setting | Value |
|---|---|
| **Root Directory** | `client` |
| **Framework Preset** | Vite *(auto-detected)* |
| **Build Command** | `npm run build` *(auto-filled)* |
| **Output Directory** | `dist` *(auto-filled)* |

### 3.2 — Add Environment Variables on Vercel

Before clicking Deploy, go to **Environment Variables** and add:

| Key | Value |
|---|---|
| `VITE_API_URL` | `https://pbl-server.onrender.com` *(your Render URL)* |

> [!IMPORTANT]
> Vite only exposes variables prefixed with `VITE_` to the browser. Do NOT use any other prefix.

### 3.3 — Deploy

Click **Deploy**. Vercel will build and deploy your React app.

**Copy your Vercel URL** — it looks like `https://pbl-finance.vercel.app`

---

## Phase 4 — Wire Them Together

### 4.1 — Update `FRONTEND_URL` on Render

1. Go back to Render → your Web Service → **Environment**
2. Add/update: `FRONTEND_URL` = `https://pbl-finance.vercel.app` *(your Vercel URL)*
3. Click **Save Changes** → Render will auto-redeploy

This tells your Express server to allow CORS requests from your Vercel frontend.

---

## Phase 5 — Verify Everything Works

### ✅ Checklist

- [ ] Visit your Vercel URL — login page loads
- [ ] Register / login — JWT is issued correctly
- [ ] Portfolio page loads stock data from Yahoo Finance
- [ ] No CORS errors in browser DevTools (F12 → Console)
- [ ] Income/Expense pages save to Supabase

### 🔍 Debug Tips

| Problem | Fix |
|---|---|
| CORS error | Check `FRONTEND_URL` on Render exactly matches Vercel URL (no trailing slash) |
| API calls fail | Check `VITE_API_URL` in Vercel env vars is your exact Render URL |
| Server crashes on Render | Check Render logs — likely a missing env var |
| Render URL works but is slow first request | Render free tier **spins down** after 15 min of inactivity. First request takes ~30s to wake up. |

---

## Quick Reference — Environment Variables

### `server/.env` (local dev only)
```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
JWT_SECRET=your_super_secret_jwt_key
FRONTEND_URL=http://localhost:5173
```

### `client/.env.local` (local dev only)
```env
VITE_API_URL=http://localhost:5000
```

### Render (production server)
```
SUPABASE_URL, SUPABASE_ANON_KEY, JWT_SECRET, FRONTEND_URL (Vercel URL)
```

### Vercel (production client)
```
VITE_API_URL (Render URL)
```

---

> [!TIP]
> Any future code changes — just `git push origin main` and both Render and Vercel will **auto-redeploy** automatically.
