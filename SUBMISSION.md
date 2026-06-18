# Assessment Submission Guide

Use this checklist to publish STOCKHAUS and submit all required links.

## Requirements checklist

| Requirement | Status in this repo |
|---|---|
| FastAPI backend | `backend/server.py` |
| React frontend | `frontend/src/` |
| PostgreSQL | `docker-compose.yml` + Render Postgres |
| Unique SKU / email, stock validation, auto deduct | Implemented + tested |
| Docker + Compose | `backend/Dockerfile`, `frontend/Dockerfile`, `docker-compose.yml` |
| Env vars (no hardcoded secrets) | `.env.example` |
| Public deployment | Follow steps below |

---

## Step 1 — Verify locally (5 min)

```bash
cd /Users/vaishnavivaishnav/Documents/projects/ethara_assessment
cp .env.example .env
docker compose up --build -d
```

Open http://localhost:3002 and log in with `admin@example.com` / `admin123`.

Run API tests:

```bash
source .venv/bin/activate
pip install pytest requests
REACT_APP_BACKEND_URL=http://localhost:8001 pytest backend/tests/ -v
```

All 14 tests should pass.

---

## Step 2 — Push to GitHub

1. Create a **new public repository** on GitHub (e.g. `inventory-order-management`).
2. In this folder:

```bash
git commit -m "Inventory & order management system — assessment submission"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

**GitHub repo link:** `https://github.com/YOUR_USERNAME/YOUR_REPO`

---

## Step 3 — Publish Docker images to Docker Hub

1. Create a free account at https://hub.docker.com
2. Create access token: Account Settings → Security → New Access Token
3. Log in and push:

```bash
export DOCKER_USER=your-dockerhub-username

docker login

# Backend (required for submission)
docker build -t $DOCKER_USER/stockhaus-backend:latest ./backend
docker push $DOCKER_USER/stockhaus-backend:latest

# Frontend (optional but recommended)
docker build \
  --build-arg REACT_APP_BACKEND_URL=https://YOUR-BACKEND.onrender.com \
  -t $DOCKER_USER/stockhaus-frontend:latest ./frontend
docker push $DOCKER_USER/stockhaus-frontend:latest
```

Or run: `./scripts/publish-docker.sh your-dockerhub-username`

**Docker image links:**

- Backend: `https://hub.docker.com/r/YOUR_USERNAME/stockhaus-backend`
- Frontend: `https://hub.docker.com/r/YOUR_USERNAME/stockhaus-frontend`

---

## Step 4 — Deploy backend on Render (free)

1. Sign up at https://render.com (connect GitHub).
2. **New → Blueprint** → select your repo → Render reads `render.yaml`.
3. When prompted, set:
   - `ADMIN_PASSWORD` — choose a secure password (you'll use this to log in)
   - `CORS_ORIGINS` — leave blank for now; update after frontend deploy
4. Wait for deploy (~5–10 min). Copy the backend URL.

**Test backend:**

```bash
curl https://YOUR-BACKEND.onrender.com/api/health
# Expected: {"status":"healthy","db":"ok"}
```

> Free Render services sleep after inactivity. First request may take 30–60 seconds.

---

## Step 5 — Deploy frontend on Vercel (free)

1. Sign up at https://vercel.com (connect GitHub).
2. **Add New Project** → import your repo.
3. Settings:
   - **Root Directory:** `frontend`
   - **Framework Preset:** Create React App
   - **Build Command:** `yarn build`
   - **Output Directory:** `build`
4. **Environment Variables:**

   | Name | Value |
   |---|---|
   | `REACT_APP_BACKEND_URL` | `https://YOUR-BACKEND.onrender.com` |

5. Deploy. Copy the Vercel URL (e.g. `https://your-app.vercel.app`).

---

## Step 6 — Connect frontend ↔ backend

1. In **Render** → your backend service → **Environment**:
   - Set `CORS_ORIGINS` = your Vercel URL (no trailing slash)
   - Example: `https://your-app.vercel.app`
2. **Manual Deploy** or wait for auto-redeploy.
3. Open the Vercel URL, log in, create a test order.

---

## Step 7 — Final submission template

Copy this into your assessment form:

```
GitHub Repository:
https://github.com/YOUR_USERNAME/YOUR_REPO

Docker Hub Images:
- Backend: https://hub.docker.com/r/YOUR_USERNAME/stockhaus-backend
- Frontend: https://hub.docker.com/r/YOUR_USERNAME/stockhaus-frontend

Live Application:
- Frontend: https://YOUR-APP.vercel.app
- Backend API: https://YOUR-BACKEND.onrender.com
- API Docs: https://YOUR-BACKEND.onrender.com/docs

Login credentials:
- Email: admin@example.com
- Password: (the ADMIN_PASSWORD you set on Render)

Local run:
git clone <repo>
cp .env.example .env
docker compose up --build
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Frontend shows network errors | Check `REACT_APP_BACKEND_URL` on Vercel; redeploy after changing |
| CORS errors in browser | Set `CORS_ORIGINS` on Render to exact Vercel URL |
| Backend 502 on first load | Render free tier waking up — wait 60s and retry |
| Login fails on production | Use `ADMIN_PASSWORD` from Render env, not local `.env` |
| Port 3000 in use locally | Default is now port **3002** (`FRONTEND_PORT` in `.env`) |
