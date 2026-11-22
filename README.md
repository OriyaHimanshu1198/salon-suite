# Lumière — Salon Suite

A complete salon management system: public booking website, diary, client book, team and
rota management, WhatsApp messaging, website content editor, offers and reporting.

Built with Node 22+ (no native modules), Express 5 and Node's built-in SQLite. The frontend
is plain ES modules — no build step, no framework, no bundler.

```
npm install
npm start
```

| What | Where |
| --- | --- |
| Public website & booking | http://localhost:4321 |
| Management console | http://localhost:4321/admin |
| Health check | http://localhost:4321/health |

**Demo logins** — password `salon123` for all:

| Email | Role |
| --- | --- |
| `owner@lumiere.test` | Owner — everything, including settings and reports |
| `manager@lumiere.test` | Manager — everything except settings |
| `reception@lumiere.test` | Reception — diary, clients, messages |
| `anya@lumiere.test` | Stylist — own diary and rota |

## What's inside

- **Public site** — services menu with prices, team profiles, opening hours, live
  availability, a five-step booking wizard, offers, and self-service lookup/cancel.
- **Diary** — day view per stylist, status flow (pending → confirmed → arrived → completed,
  plus no-show and cancelled), notes, colour formulas and payment capture.
- **Clients** — search, segments, visit history, message history, allergies and formula
  notes, GDPR erase, CSV export.
- **Team & rota** — staff records with per-service skills and commission, weekly rota grid,
  copy week, pattern fill, time off, and advisory conflict detection (double-booking,
  leave, over-long shifts, days off).
- **WhatsApp** — templated confirmations, reminders, cancellations and broadcasts. Runs in
  click-to-send mode (`wa.me` links with a "Mark sent" step) or Meta Cloud API mode when
  credentials are present. Inbound `STOP` is honoured.
- **Website editor** — hero copy, about text, contact details, opening hours and offers,
  all editable without touching code.
- **Reports** — revenue, utilisation, average ticket, no-shows, per-stylist and per-service
  breakdowns, top clients, CSV exports.

## Configuration

Copy `.env.example` to `.env` and edit as needed.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4321` | HTTP port |
| `SESSION_SECRET` | random per boot | Cookie signing key — set it for stable sessions |
| `WHATSAPP_MODE` | `link` | `link` (wa.me) or `api` (Cloud API) |
| `WHATSAPP_TOKEN` | — | Meta Cloud API token |
| `WHATSAPP_PHONE_ID` | — | Meta phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | — | Webhook verification token |

Salon name, timezone, currency, booking rules and reminder lead time live in
**Settings** inside the console and are stored in the database.

## Scripts

| Command | Does |
| --- | --- |
| `npm start` | Run the server |
| `npm run dev` | Run with `--watch` (restarts on file changes) |
| `npm run seed` | Seed an empty database |
| `npm run reset` | Wipe and rebuild the demo database |
| `npm run backup` | Copy the SQLite database to `backups/` |

Data lives in `data/salon.db` (SQLite, WAL mode).

## Layout

```
server/
  index.js        Express bootstrap, CSP, static hosting, WhatsApp dispatch loop
  db.js           Schema, settings defaults, password hashing, seed data
  scheduling.js   Availability maths, booking rules, rota conflicts
  bookings.js     Create/status/reschedule, dashboard and report aggregates
  whatsapp.js     Templates, outbox, broadcast, inbound webhook handling
  auth.js         Signed-cookie sessions, roles, rate limiting, same-origin checks
  util.js         Timezone helpers, validation, CSV
  routes/         public.js and admin.js endpoint groups
public/
  index.html      Public site
  admin.html      Management console shell
  js/api.js       fetch wrapper, formatting, safe HTML templating
  js/site.js      Booking wizard and public page
  js/admin.js     Hash-router console views
  css/            site.css, admin.css
docs/             Feature specs, architecture, data model, API, WhatsApp, rota, roadmap
scripts/          seed, reset, backup
```

## Design notes

- **Money** is stored as integer pence; no floating point.
- **Times** are stored as UTC ISO strings and rendered in the salon's timezone
  (`Europe/London` by default).
- **Cancellations never delete** — an appointment becomes `cancelled`, preserving history.
- **Availability** is computed from opening hours, shifts, service durations and buffers,
  and existing appointments. The same engine serves the public site and the console, so
  the two can never disagree.
- **Auth** uses scrypt password hashes and HMAC-signed cookies; roles are enforced
  server-side, not just by hiding buttons.

## Documentation

| File | Contents |
| --- | --- |
| `docs/00-overview.md` | Product summary and scope |
| `docs/01-features.md` | Feature specification |
| `docs/02-architecture.md` | Runtime, modules, request flow |
| `docs/03-data-model.md` | Tables, columns, settings keys |
| `docs/04-api.md` | Every endpoint and payload |
| `docs/05-whatsapp.md` | Templates, modes, opt-in, webhooks |
| `docs/06-rota.md` | Shifts, conflicts, time off rules |
| `docs/07-roadmap.md` | Deliberate omissions and next steps |
