# STOCKHAUS — Inventory & Order Management System

## Problem Statement
Production-ready containerized inventory & order management system with React + FastAPI + PostgreSQL + Docker Compose + JWT admin auth.

## Architecture
- Backend: FastAPI + SQLAlchemy 2.0 async + asyncpg + PyJWT + bcrypt
- Frontend: React 19 + Tailwind + shadcn/ui + Phosphor icons
- DB: PostgreSQL 16
- Auth: JWT bearer (24h)

## Implemented (2026-02)
- JWT login + seeded admin
- Products CRUD with full e-commerce schema (25 fields: identity, copy, pricing, inventory, logistics, marketing, status)
- Customers CRUD with unique email
- Orders with multi-line, auto-totaling, stock validation/deduction
- Dashboard with per-product low-stock alerts, totals, revenue
- Sample seed data (6 products, 3 customers)
- Docker artifacts: backend Dockerfile, frontend Dockerfile (multi-stage + nginx), docker-compose.yml with named pg volume, README + .env.example
- **NEW** — Product variants (size × color) as child SKUs with own stock + pricing override; orders deduct variant stock when variant_id is supplied; variant table CRUD endpoints; inline UI inside product view dialog
- **NEW** — Order status workflow with 8 states (pending/confirmed/processing/shipped/delivered/cancelled/returned/refunded) and validated transition graph; PATCH `/api/orders/{id}/status`; inline "Advance →" select on orders list with idempotent stock restoration on cancel/return/refund
- **NEW** — CSV bulk import for products: `POST /api/products/import` (multipart) with per-row error reporting; "Import CSV" button on Products page

## Backlog
- P1: Product image upload to object storage
- P2: Variant grid generator (auto-generate every color×size combination)
- P2: CSV bulk import for customers + orders
- P2: Sales reports (margins, revenue by category, top SKUs)
- P2: Multi-warehouse stock locations
- P2: Customer order history page
