# STOCKHAUS — Inventory & Order Management System

Production-ready, containerized full-stack inventory & order management platform.

- **Frontend**: React 19, Tailwind, shadcn/ui, Phosphor icons (Swiss/high-contrast UI)
- **Backend**: FastAPI (Python 3.11) + SQLAlchemy 2.0 async + JWT auth
- **Database**: PostgreSQL 16
- **Containerization**: Docker + Docker Compose (3 services)

## Features

- JWT admin login (seeded admin from env)
- Products CRUD with unique SKU + stock tracking
- Customers CRUD with unique email
- Orders with multi-product line items, automatic total calculation, automatic stock deduction, and stock validation (orders rejected when inventory is insufficient)
- Order cancellation restores stock
- Dashboard with totals, revenue, and low-stock alerts
- Sample data is seeded on first boot for instant demoing

## Quick Start (Docker Compose)

```bash
cp .env.example .env       # edit secrets if you wish
docker compose up --build
```

Open:
- Frontend: http://localhost:3002 (override with `FRONTEND_PORT` in `.env`)
- Backend: http://localhost:8001/api/health
- API docs (Swagger): http://localhost:8001/docs

Default admin: `admin@example.com` / `admin123`

## API Surface

All routes are prefixed with `/api`.

| Method | Path                  | Auth | Purpose |
| ------ | --------------------- | ---- | ------- |
| POST   | /api/auth/login       | no   | Email + password → JWT |
| GET    | /api/auth/me          | yes  | Current user |
| GET    | /api/products         | yes  | List products |
| POST   | /api/products         | yes  | Create product (unique SKU) |
| GET    | /api/products/{id}    | yes  | Get one |
| PUT    | /api/products/{id}    | yes  | Update |
| DELETE | /api/products/{id}    | yes  | Delete |
| GET    | /api/customers        | yes  | List customers |
| POST   | /api/customers        | yes  | Create (unique email) |
| GET    | /api/customers/{id}   | yes  | Get one |
| DELETE | /api/customers/{id}   | yes  | Delete |
| GET    | /api/orders           | yes  | List orders |
| POST   | /api/orders           | yes  | Place order (validates stock, deducts inventory, computes total) |
| GET    | /api/orders/{id}      | yes  | Order details (line items) |
| DELETE | /api/orders/{id}      | yes  | Cancel order (restores stock) |
| GET    | /api/dashboard        | yes  | Aggregate stats + low-stock list |

## Business Rules

- Product SKUs are unique; SKUs are normalised to uppercase.
- Customer emails are unique; emails are normalised to lowercase.
- Product quantity cannot be negative (enforced at API boundary).
- Orders are rejected (HTTP 400) when any line requests more units than are in stock.
- Order total is calculated by the backend — clients cannot override it.
- Stock is deducted atomically when an order is placed and restored on cancellation.

## Local Development (without Docker)

Backend:
```bash
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/inventory_db \
JWT_SECRET=dev-secret \
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Frontend:
```bash
cd frontend
yarn install
REACT_APP_BACKEND_URL=http://localhost:8001 yarn start
```

## Deployment (free tiers)

### Backend (Render — recommended)

1. Push this repo to GitHub.
2. In [Render](https://render.com), create a **Blueprint** from `render.yaml`, or manually:
   - **Web Service** → Docker, root `backend/`, Dockerfile `backend/Dockerfile`
   - **PostgreSQL** database (free tier)
3. Set environment variables:
   - `DATABASE_URL` — from Render Postgres (auto-converted to async driver)
   - `JWT_SECRET` — long random string
   - `ADMIN_EMAIL` / `ADMIN_PASSWORD` — login credentials
   - `CORS_ORIGINS` — your frontend URL (e.g. `https://your-app.vercel.app`)
   - `SEED_SAMPLE_DATA=true`
4. Note your backend URL, e.g. `https://stockhaus-api.onrender.com`

### Frontend (Vercel or Netlify)

**Vercel**
1. Import the repo; set **Root Directory** to `frontend`.
2. Framework: Create React App. Build: `yarn build`. Output: `build`.
3. Environment variable: `REACT_APP_BACKEND_URL=https://your-backend.onrender.com`
4. Deploy. `vercel.json` handles SPA routing.

**Netlify**
1. Base directory: `frontend`. Build: `yarn build`. Publish: `build`.
2. Set `REACT_APP_BACKEND_URL` in site env vars.
3. `netlify.toml` handles SPA redirects.

### Verify deployment

- Backend health: `GET https://<backend>/api/health`
- Swagger docs: `https://<backend>/docs`
- Login on frontend with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- Create a test order to confirm CORS and API connectivity

### Docker Hub (optional)

```bash
docker build -t <user>/inventory-backend ./backend && docker push <user>/inventory-backend
```
