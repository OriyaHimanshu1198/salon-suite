# 03 System Architecture
Frontend, backend and database structure.

## Backend
- **Framework:** Express 5 (ESM).
- **Runtime:** Node.js >= 22.5 (built-in `node:sqlite`, `node:crypto`).
- **Structure:**
  - `index.js` — bootstrap, static hosting, scheduler, error handling.
  - `db.js` — schema, migrations (`ensureColumn`), seed, settings, audit, password hashing.
  - `auth.js` — sessions (HMAC cookie), roles, rate limiting, CSRF (`sameOrigin`).
  - `util.js` — ids, dates, timezone, money, phone, validation, CSV.
  - `scheduling.js` — availability engine, booking validation, rota conflicts.
  - `bookings.js` — CRUD, status transitions, payments, dashboard, reports.
  - `whatsapp.js` — templates, queue, dispatch (API/link), retry, broadcast, opt-out.
  - `packages.js` — package plans, purchases, redemptions, birthdays, staff sales.
  - `routes/public.js` — public API (site, services, availability, bookings, waitlist, packages).
  - `routes/admin.js` — admin API (dashboard, appointments, clients, services, staff, rota, timeoff, website, offers, packages, reviews, sales, birthdays, messages, reports, settings, audit).

## Frontend
- **Public Site (`public/index.html` + `js/site.js`):**
  - Single-page load, data from `/api/public/site`.
  - Components: hero, offers, birthday band, services tabs/grid, packages, team, reviews, about/hours, booking wizard (6 steps), lookup.
  - `api.js` — `request()` wrapper, error handling, `el()` helper, `escapeHtml`, money/date formatting.
  - `site.js` — renders all sections, drives wizard state machine, handles booking submission.

- **Admin Console (`public/admin.html` + `js/admin.js`):**
  - Login screen → hash-router SPA (`#/dashboard`, `#/calendar`, `#/clients`, `#/packages`, `#/services`, `#/team`, `#/rota`, `#/sales`, `#/website`, `#/messages`, `#/reports`, `#/settings`).
  - `admin.js` — `render(view)` per route, `fetch()` via `api.js`, modals, toasts, CSV download triggers.
  - Shared `api.js` with public site.

## Database
- **Engine:** SQLite 3 (`node:sqlite` DatabaseSync).
- **File:** `data/salon.db` (gitignored).
- **PRAGMA:** `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
- **Helpers:** `q()` (all), `q1()` (get), `run()` (exec), `tx(fn)` (BEGIN IMMEDIATE / COMMIT / ROLLBACK).
- **Migrations:** `ensureColumn(table, column, ddl)` runs on boot for additive schema changes.
- **Timezone:** All timestamps stored UTC ISO-8601; display converts via `salon.timezone` setting.
- **Money:** Integer pence only; formatting in frontend.
- **Soft Deletes:** `active=0` for services/staff; appointments cancelled not deleted.
- **Audit:** Every mutation writes to `audit_log`.

## Data Flow
```
Browser → Express → Middleware (auth/rate-limit/same-origin)
              ├─ /api/public/* → public.js → scheduling.js / bookings.js / whatsapp.js / packages.js → db.js
              └─ /api/admin/*  → auth.js → admin.js  → (same) → db.js
              └─ /admin        → admin.html (SPA) → fetches /api/admin/*
              └─ /             → index.html      → fetches /api/public/site
```

## Scheduler
- `setInterval` (60s) in `index.js`:
  1. `runBirthdayJob()` — queues birthday WhatsApp for today's birthdays.
  2. `dispatchDue()` — sends queued notifications (WhatsApp API or generates `wa.me` links).
- Runs in-process; survives process restarts (jobs re-evaluate on boot).

## Security Controls
| Threat | Control |
|--------|---------|
| Password theft | scrypt (N=16384), per-user salt, constant-time compare |
| Session forgery | HMAC-SHA256 over `{uid,exp}` with `SESSION_SECRET` |
| XSS | `textContent`/`escapeHtml` only; no `innerHTML` with raw input |
| CSRF | `SameSite=Lax` cookie + `Origin` check on mutating admin routes |
| SQL Injection | Prepared statements only (`db.prepare()`) |
| Brute Force | In-memory rate limiter: 8 login/15min/IP |
| Enumeration | Generic login error message |
| Privilege Escalation | `requireRole()` on every privileged route |
| Booking Spam | 20 public bookings/hr/IP |
| Data Loss | `npm run backup` (timestamped DB copy), WAL mode |

## Scalability Notes
- Single process, single SQLite file → vertical scaling only.
- 30-day availability query: one SQL pass per staff + in-memory interval math (<10ms locally).
- Caching: 30s TTL per `(service, staff, month)` key.
- For multi-location or high volume: migrate to PostgreSQL, add read replicas, external job queue (Redis/Bull), CDN for static assets.