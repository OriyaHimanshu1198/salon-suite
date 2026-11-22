# Salon Suite — Project Overview

**Status:** Working v1 implementation (single salon, single process)
**Documentation baseline:** 22 November 2026
**Primary audience:** Developers and maintainers extending the existing system

This document describes the application **as implemented**. It is not a product wish list. Where the
code stores a value but does not yet act on it, that is called out explicitly and repeated in
`FUTURE_ROADMAP.md`.

---

## 1. What the application is

Salon Suite is a self-hosted salon management system with two front ends served by one Node process:

| Surface | URL | Purpose |
|---|---|---|
| Public website | `/` | Services, prices, team, offers, reviews, packages, live availability, booking, booking lookup/cancel |
| Management console | `/admin` | Diary, clients, packages, services, team, rota, sales, website content, messages, reports, settings |
| Health check | `/health` | Returns server status, database path and WhatsApp mode |
| WhatsApp webhook | `/api/webhooks/whatsapp` | Cloud API verification and inbound `STOP`/`START` handling |

The public site and the console share the same database and the same availability engine. There is
no separate booking service and no cached availability table.

---

## 2. Technology stack

| Layer | Implementation |
|---|---|
| Runtime | Node.js **22.5+** (uses the built-in `node:sqlite` module) |
| HTTP server | Express **5.1** |
| Database | SQLite via `node:sqlite` (`DatabaseSync`), WAL mode, foreign keys on, 5 s busy timeout |
| Frontend | Vanilla ES modules, no framework, no bundler, no build step |
| Styling | Two hand-written stylesheets: `public/css/site.css`, `public/css/admin.css` |
| Auth | scrypt password hashes, HMAC-SHA256 signed session cookie |
| Messaging | WhatsApp outbox with click-to-send `wa.me` links by default; optional Meta Cloud API adapter |
| Dependencies | `express` only |

The only runtime configuration required is Node 22.5+ and `npm install`.

---

## 3. Repository map

```
salon-suite/
├─ server/
│  ├─ index.js          Express bootstrap, security headers, static hosting, webhook, background loop
│  ├─ env.js            Loads .env without a dependency
│  ├─ db.js             Schema, ad-hoc migrations, settings defaults, password hashing, demo seed
│  ├─ auth.js           Session signing/reading, role guards, rate limiting, same-origin check
│  ├─ util.js           IDs, references, timezone maths, money, phone, validation, CSV
│  ├─ scheduling.js     Service bundles, qualified staff, availability, booking assertions, rota conflicts
│  ├─ bookings.js       Booking create/status/reschedule/payment, dashboard and report aggregates
│  ├─ packages.js       Package plans, purchases, redemptions, birthday logic, staff sales report
│  ├─ whatsapp.js       Templates, outbox, reminders, broadcasts, Cloud API, inbound opt-out
│  └─ routes/
│     ├─ auth.js        /api/auth/login, logout, me
│     ├─ public.js      /api/public/* and the public site payload
│     └─ admin.js       /api/admin/* (all authenticated; role gates per route)
├─ public/
│  ├─ index.html        Public site shell
│  ├─ admin.html        Console shell and login screen
│  ├─ js/api.js         fetch wrapper, money/date formatting, safe HTML templating, toasts
│  ├─ js/site.js        Public rendering + five-step booking wizard + packages + lookup
│  ├─ js/admin.js       Hash-router console views and modals
│  └─ css/              site.css, admin.css
├─ scripts/
│  ├─ seed.mjs          Seed only when the users table is empty
│  ├─ reset.mjs         Delete data/salon.db* and reseed
│  └─ backup.mjs        Copy the database to backups/, keep the newest 30
├─ data/
│  └─ salon.db          Created on first boot (override with SALON_DB)
├─ docs/                Existing numbered specs plus this documentation set
├─ .env.example
├─ package.json
└─ README.md
```

---

## 4. Runtime topology and request flow

```
Browser
  │
  ├─ GET /                  → express.static(public) → index.html → site.js
  ├─ GET /admin             → admin.html → admin.js
  ├─ GET /api/public/site   → publicRouter → publicSite() → SQLite
  ├─ POST /api/public/...   → publicRouter → scheduling/bookings/packages → SQLite
  └─ GET/POST /api/admin/*  → sameOrigin → requireAuth → role gate → route → module → SQLite
```

Startup sequence in `server/index.js`:

1. Load `.env`.
2. Open the SQLite database (creating `data/` if needed), enable WAL and foreign keys.
3. Execute `CREATE TABLE IF NOT EXISTS` schema statements.
4. Run ad-hoc column migrations for older databases.
5. Insert any missing setting defaults.
6. Seed the demo salon if the `users` table is empty.
7. Start Express on `PORT` (default `4321`).
8. Run the birthday job once immediately. A 60-second interval then runs the birthday job and
   dispatches due WhatsApp messages. `dispatchDue()` has no separate immediate call.

The background interval calls:

- `runBirthdayJob()` — queues birthday offers at most once per salon day.
- `dispatchDue()` — sends due WhatsApp messages when the Cloud API is configured.

---

## 5. Frontend architecture

### 5.1 Public site (`public/js/site.js`)

Single module with a local `state` object. Boot calls `GET /api/public/site` once, then renders:

- Header/brand, hero copy and stats
- Notice bar (dismissal stored in `localStorage` keyed by message text)
- Birthday band
- Offers strip
- Service tabs and service cards
- Package cards and inline package reservation form
- Team cards
- Reviews and aggregate rating
- Opening hours, contact details and social links
- Booking wizard shell and the lookup panel

The booking wizard has five steps:

1. **Services** — choose up to four services.
2. **Stylist** — a named stylist or "any".
3. **Date & time** — month availability, then slots.
4. **Details** — name, phone, email, date of birth, notes, marketing consent.
5. **Confirmed** — reference, appointment summary, WhatsApp link.

Re-render strategy: the wizard body and tab hosts are replaced with cloned empty nodes before
re-rendering, so delegated listeners are not double-bound.

### 5.2 Management console (`public/js/admin.js`)

A hash router. `#/dashboard`, `#/calendar`, `#/clients`, `#/packages`, `#/services`, `#/team`,
`#/rota`, `#/sales`, `#/website`, `#/messages`, `#/reports`, `#/settings`.

- Login screen posts to `/api/auth/login`; successful session is an HttpOnly cookie.
- `showApp()` hides navigation items for `staff` (`team`, `rota`, `settings`, `sales`) and
  `reception` (`settings`, `sales`). This is cosmetic; the server enforces permissions.
- Each view fetches its own data and writes into `#view`.
- Modals are built with `openModal()` into `#modalRoot`; Escape or backdrop closes them.
- `statusBadge()` maps statuses to CSS classes.
- Toasts are appended to `#toasts`.

### 5.3 Shared helpers (`public/js/api.js`)

- `api(path, { method, body })` — JSON fetch with `credentials: 'same-origin'`; throws `ApiError`
  carrying `status`, `code`, `fields`, `alternatives`.
- `money`, `moneyShort`, `longDate`, `shortDate`, `todayStr`, `addDaysStr`, `weekStartStr`,
  `titleCase`, `initials`, `debounce`.
- `html` tagged template escapes interpolations; `raw()` opts out deliberately.
- `$`, `$$`, `on()` (delegated events), `toast()`.

No client-side routing library, state library, or component framework is used.

---

## 6. Backend module responsibilities

| Module | Owns |
|---|---|
| `db.js` | Schema, migrations, settings, audit writer, password hashing, seed |
| `auth.js` | Cookie signing, session validation, role middleware, rate-limit buckets, origin check |
| `util.js` | IDs (`cus_…`, `apt_…`), booking reference `LS-XXXX`, timezone conversion, money, validation, CSV |
| `scheduling.js` | Service bundle maths, qualified staff, availability/month availability, bookability assertions, overlap guard, rota conflict detection |
| `bookings.js` | Customer upsert, booking creation, status transitions and side effects, reschedule, payment recording, dashboard, period report |
| `packages.js` | Plans, purchases, expiry, payments, session redemption, birthday discount/job, staff sales report |
| `whatsapp.js` | Template rendering, outbox rows, reminders, cancellation/reschedule/thank-you, waitlist notices, Cloud API send, retries, segments, broadcast, inbound opt-out |
| `routes/public.js` | Public payload and public write endpoints |
| `routes/admin.js` | Console endpoints and role gates |

---

## 7. Data conventions

| Concern | Convention |
|---|---|
| Money | Integer **pence** everywhere. Formatting to `£` happens in the UI or `money()` |
| Timestamps | UTC ISO strings (`2026-11-22T10:30:00.000Z`) |
| Calendar dates | `YYYY-MM-DD` strings in the salon timezone |
| Times of day | `HH:MM` strings for shifts and opening hours |
| Timezone | `salon.timezone`, default `Europe/London`; rendering uses `Intl` |
| Phone numbers | Digits only after `normalisePhone()`; phone is the customer identity key |
| Tags | Comma-separated string (`VIP,Colour`) |
| Plan services | JSON array string in `package_plans.service_ids` |
| Booleans | SQLite integers `0`/`1` |
| Deactivation | `active = 0` for staff/services/plans/offers; status changes for bookings |
| Deletion | Appointments are never deleted on cancellation; only GDPR erase removes a client and their appointments |

---

## 8. Roles and permissions

Roles are stored on `users.role` and enforced server-side.

### 8.1 Role intent

| Role | Intended use |
|---|---|
| `owner` | Full access, including settings, GDPR erase, sales, audit |
| `manager` | Day-to-day management; no owner-only settings or client erasure |
| `reception` | Front desk: bookings, clients, payments, messages |
| `staff` | Own appointments and own time-off requests; read access to shared records |

### 8.2 Effective permission matrix

| Capability | Owner | Manager | Reception | Staff |
|---|---|---|---|---|
| View dashboard, calendar, clients, packages, services, team, rota, website data, messages | Yes | Yes | Yes | Yes (nav hides team/rota/sales/settings) |
| Create/edit appointments | Yes | Yes | Yes | No (status only, own appointments) |
| Change appointment status | Yes | Yes | Yes | Own appointments only |
| Record appointment payment | Yes | Yes | Yes | No |
| Create/edit clients | Yes | Yes | Yes | No |
| Erase client (GDPR) | Yes | No | No | No |
| Export clients CSV | Yes | Yes | Yes | Yes (route has no role gate) |
| Manage services | Yes | Yes | No | No |
| Manage staff records | Yes | Yes | No | No |
| Manage rota and shifts | Yes | Yes | No | No |
| Approve time off | Yes | Yes | No | No |
| Request time off | Yes | Yes | Yes | Yes (forced `pending`) |
| Manage site content, notice, hours, offers | Yes | Yes | No | No |
| Manage package plans | Yes | Yes | No | No |
| Sell/redeem/record payment for packages | Yes | Yes | Yes | No |
| Cancel a package purchase | Yes | Yes | No | No |
| Manage reviews and Google sync | Yes | Yes | No | No |
| View sales and reports | Yes | Yes | No | No |
| View/export appointments CSV | Yes | Yes | No | No |
| View audit log | Yes | Yes | No | No |
| Change settings | Yes | No | No | No |
| Read settings JSON | Yes | Yes | Yes | Yes (session secret removed) |
| Send/retry/mark messages | Yes | Yes | Yes | Send only; retry/mark-sent desk roles |
| Broadcast campaign | Yes | Yes | No | No |

Notes:

- All `/api/admin/*` routes require authentication. Many `GET` routes have no additional role gate,
  so a staff account can read shared lists even when the navigation item is hidden.
- The `staff` role can only change the status of an appointment assigned to their own `staff_id`.
- `users` rows are seeded; there is no user-management screen or password-reset flow.
- The client and appointment CSV routes are currently shadowed by parameterised routes and return
  404; the sales CSV works. See §12.

---

## 9. Configuration and operations

### 9.1 Environment variables

| Variable | Default | Effect |
|---|---|---|
| `PORT` | `4321` | HTTP port |
| `SESSION_SECRET` | generated and stored in `settings` | Cookie signing key |
| `SALON_DB` | `data/salon.db` | Database path |
| `SITE_URL` | `http://localhost:PORT` | Base URL used in WhatsApp booking links |
| `WHATSAPP_TOKEN` | — | Meta Cloud API token |
| `WHATSAPP_PHONE_ID` | — | Meta phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | — | Webhook verification token |
| `WHATSAPP_API_VERSION` | `v21.0` | Graph API version |
| `GOOGLE_PLACES_API_KEY` | — | Enables Google review sync when a place ID is also set |

Salon identity, booking rules, reminders, reviews, loyalty and birthday settings are stored in the
`settings` table and edited in the console.

### 9.2 npm scripts

| Script | Behaviour |
|---|---|
| `npm start` | Start the server |
| `npm run dev` | Start with `node --watch` |
| `npm run seed` | Seed only if the database has no users |
| `npm run reset` | Delete `salon.db`, `-wal`, `-shm`, then reseed |
| `npm run backup` | Copy the database to `backups/salon-<timestamp>.db`, keep newest 30 |

### 9.3 Demo accounts

All seeded accounts use password `salon123`:

| Email | Role | Linked staff |
|---|---|---|
| `owner@lumiere.test` | owner | — |
| `manager@lumiere.test` | manager | — |
| `reception@lumiere.test` | reception | — |
| `anya@lumiere.test` | staff | Anya Petrova |
| `priya@lumiere.test` | staff | Priya Shah |

---

## 10. Security posture

Implemented:

- scrypt password hashes with per-password salt and timing-safe comparison.
- HMAC-SHA256 signed session payloads; cookie is `HttpOnly`, `SameSite=Lax`, 7-day expiry.
- `requireAuth` on all admin routes and `requireRole` on sensitive mutations.
- Same-origin check for mutating `/api/admin` requests when an `Origin` header is present.
- Rate limits: login 8 per 15 minutes per IP; public booking 20 per hour; public reads 240 per minute;
  WhatsApp webhook 120 per minute. Buckets are in memory and reset on restart.
- CSP: `default-src 'self'`, scripts only from self, inline styles allowed, framing denied.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `X-Frame-Options: DENY`.
- Parameterised SQL throughout.
- Field-level validation with `requireFields`.
- Audit rows for mutations, logins and key reads that change state.
- No stack traces or internal messages for 5xx responses.

Not implemented (see roadmap):

- CSRF tokens (origin check and SameSite are the current controls).
- Password change/reset, MFA, session revocation list, per-user session rotation.
- Persistent/distributed rate limiting.
- Encryption at rest beyond the host filesystem.
- Automated dependency or security scanning.

---

## 11. Current scope

**In scope and implemented**

- Single salon, single timezone, GBP display, English copy.
- Public site content, services, staff, hours, offers, reviews, notice bar, social links.
- Multi-service online booking with live availability and conflict checks.
- Booking lookup and self-service cancellation.
- Admin diary, appointment statuses, notes, payments, package redemption.
- Client book with tags, preferences, allergies, formula notes, history, consent, GDPR erase.
- Team records, skills, weekly rota, copy week, pattern fill, time off, conflict warnings.
- Treatment packages: plans, online reservation, in-salon sale, payments, sessions, free sessions,
  expiry, cancellation, staff sales attribution.
- Birthday discount at booking and a daily WhatsApp birthday job.
- Curated reviews and optional Google Places sync.
- WhatsApp outbox, templates, reminders, broadcasts, click-to-send and Cloud API modes.
- Dashboard, sales report, period report, sales CSV, audit log, settings. (The client and
  appointment CSV links exist but are currently shadowed; see §12.)

**Deliberately not implemented**

- Card payments, deposits charged online, refunds.
- Email/SMS delivery.
- Payroll, inventory/stock, gift cards, memberships.
- Multi-branch, multi-currency, multi-language.
- Recurring appointments and bookable rooms/chairs.
- Two-way WhatsApp chat inbox.
- Native mobile apps.
- Public waitlist form (the API exists; the public site does not expose it).
- Loyalty point redemption (points accrue only).

---

## 12. Known implementation gaps

These are verified in the current code and should be read before extending the system:

1. **CSV route shadowing.** `GET /api/admin/customers/:id` is registered before
   `GET /api/admin/customers/export.csv`, and `GET /api/admin/appointments/:id` before
   `GET /api/admin/appointments/export.csv`. Express matches the parameterised route first, so the
   two CSV URLs currently return a 404. The sales CSV is unaffected.
2. **`services.online_bookable` is stored but not enforced.** The public site and availability
   engine return all `active` services.
3. **Shift breaks do not reduce availability.** `break_min` is stored and used in utilisation
   totals, but `availability()` does not subtract a break window. `rota.block_break` is unused.
4. **WhatsApp quiet hours are unused.** `whatsapp.quiet_start` and `whatsapp.quiet_end` exist but no
   code reads them.
5. **Loyalty points accrue but cannot be redeemed.** `customers.loyalty_points` increases on
   completion; there is no redemption endpoint or UI.
6. **Online package sales are not credited to a staff member.** `salesReport()` only counts package
   purchases whose `sold_by_staff_id` matches a staff row, so online purchases (and sales by users
   without a linked staff record) are absent from staff totals while still appearing in daily
   package revenue.
7. **Some reporting buckets use UTC dates.** Dashboard day bounds and report filters compare
   `substr(start_at, 1, 10)` / `date + 'T00:00Z'`, not salon-local day boundaries.
8. **Sales report revenue bases differ.** Staff `serviceRevenue` sums appointment item prices;
   the daily series uses `paid_pence`.
9. **No user administration.** Staff records and login accounts are separate; only seeded accounts
   exist and there is no password change.
10. **No automated tests, linter, or CI configuration** is present in the repository.

The roadmap proposes fixes and extensions in priority order.

---

## 13. Documentation map

| Document | Use it for |
|---|---|
| `PROJECT_OVERVIEW.md` (this file) | Stack, layout, roles, operations, known gaps |
| `DESIGN_GUIDELINES.md` | Colours, typography, components, responsive and accessibility rules |
| `WORKFLOW.md` | End-to-end business flows and state transitions |
| `DATABASE.md` | Tables, columns, relationships, settings, seed data |
| `FEATURES.md` | Feature register with implementation status and endpoints |
| `FUTURE_ROADMAP.md` | Verified gaps and proposed work, prioritised |
| `CHANGELOG.md` | Current build baseline and documentation changes |
| `00-overview.md` … `08-extras.md` | Earlier product/architecture specs; useful background, but where they disagree with this set, the code and this set win |

### Maintenance rule

When behaviour changes, update the relevant document in the same change:

- New/changed endpoint → `FEATURES.md` and, if structural, `PROJECT_OVERVIEW.md`.
- New/changed table or setting → `DATABASE.md`.
- New/changed user flow → `WORKFLOW.md`.
- New/changed token or component → `DESIGN_GUIDELINES.md`.
- Every release → `CHANGELOG.md`, and move completed roadmap items out of `FUTURE_ROADMAP.md`.
