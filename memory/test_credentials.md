# Test Credentials

## Admin (JWT)
- Email: `admin@example.com`
- Password: `admin123`
- Role: admin

## Auth Endpoints
- `POST /api/auth/login` — body `{ "email": "...", "password": "..." }` → returns `{ access_token, token_type, user }`
- `GET /api/auth/me` — `Authorization: Bearer <access_token>` → returns current user

## Sample Data Seeded
- 6 sample products (SKUs: WM-001, KB-002, MN-003, HB-004, HP-005, WC-006)
- 3 sample customers (ops@acme.com, purchasing@globex.io, orders@initech.co)
