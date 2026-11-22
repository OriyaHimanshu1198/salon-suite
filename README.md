# Salon Suite

[![Node.js](https://img.shields.io/badge/Node.js-22%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5-blue.svg)](https://expressjs.com/)
[![SQLite](https://img.shields.io/badge/SQLite-3-orange.svg)](https://sqlite.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A complete, self-hosted salon management platform combining a public booking website, staff management console, treatment packages, WhatsApp notifications, and business analytics — all in one lightweight Node.js application.

---

## 🎯 Overview

Salon Suite replaces paper diaries, WhatsApp groups, and scattered spreadsheets with a single integrated system:

| Area | What it handles |
|------|-----------------|
| **Public Website** | Services, team, live availability, 6-step booking wizard, offers, self-service cancel |
| **Admin Console** | Dashboard, calendar, clients, packages, sales, rota, messages, reports, settings |
| **Packages** | In-store sales (plan-based or single-service), QR verification, staff redemption |
| **WhatsApp** | Confirmations, 24h reminders, cancellations, broadcasts, birthday offers |
| **Treatwell** | CSV import for customers & bookings, duplicate detection, mapping review |
| **Analytics** | Revenue, utilisation, per-staff performance, CSV exports |

---

## ✨ Features

### 🌐 Public Booking Website
- Service menu with categories, prices, durations
- Team profiles with specialities
- Live availability computed from shifts, services, existing bookings
- 6-step booking wizard (service → stylist → date → time → details → confirm)
- Multi-service basket (summed duration + max buffer)
- Self-service lookup & cancel (reference + phone)
- Waitlist with date-range + service/staff preference
- Mobile-first, accessible (WCAG AA), no JS framework

### 📅 Admin Dashboard
- **Today view** — timeline per stylist, colour-coded by status
- **KPIs** — revenue, bookings, utilisation, no-show rate, new clients
- **Quick actions** — new booking, block time, mark arrived/complete/no-show
- **Upcoming birthdays** — next 7 days

### 👥 Client Management (CRM)
- Profiles: name, phone (unique), email, DOB, address, tags
- Preferences: preferred stylist, colour formulas, allergies, notes
- Visit history: past/upcoming appointments, total spend, visit count, last visit
- Consent tracking: WhatsApp opt-in, marketing opt-in, consent timestamps
- Segments: VIP, Colour, Nails, New (30d), Lapsed (90d)
- Duplicate detection (phone/email normalisation)
- GDPR: CSV export, hard erase endpoint

### 🎁 Treatment Packages (In-Store Only)
- **Plan-based**: pre-defined (e.g., "Cut ×5 + 1 free")
- **Single-service**: any active service as 5 paid + 1 free
- No expiry, treatment-locked (cannot swap)
- QR code per customer for verification
- Staff redemption: scan QR → select package → confirm completion
- Audit trail: every purchase, redemption, reversal, correction

### 📱 WhatsApp Notifications
| Mode | How it works |
|------|--------------|
| **Click-to-send (default)** | Staff click "Send" → opens `wa.me` link with pre-filled message |
| **Cloud API** | Automatic send via Meta WhatsApp Business API |

**Templates:** booking_confirmed, reminder_24h, booking_cancelled, booking_rescheduled, thank_you, waitlist_open, offer_broadcast, payment_receipt, birthday_offer, package_purchased, package_free_ready, package_complete

**Compliance:** inbound `STOP` flips opt-in flags; broadcasts throttled (1 msg/2s, quiet hours 08:00–20:00)

### 🎂 Birthday Automation
- 15% discount (configurable) valid ±7 days around birthday
- Auto-queued WhatsApp for customers with marketing opt-in
- Runs daily via in-process scheduler

### 🗓️ Rota & Time-Off
- Weekly shifts per staff member (start/end, break, notes)
- Copy week, pattern fill from recent history
- Conflict detection: double-booking, leave overlap, outside hours, unrostered bookings
- Time-off types: holiday, sick, training, unpaid (pending/approved/declined)

### 📊 Reports & Analytics
- Revenue by day / service / staff
- Utilisation (booked minutes ÷ rostered minutes)
- Commission (completed revenue × commission %)
- Top clients by spend / visits
- CSV exports: appointments, clients, sales

### 🔐 Security & Auth
- **scrypt** (N=16384) password hashing + per-user salt
- **HMAC-SHA256** signed HttpOnly cookies (7-day sliding)
- **Roles:** owner / manager / reception / staff (server-enforced)
- **Rate limits:** login 8/15min, booking 20/hr, reads 240/min
- **CSP, HSTS, X-Frame-Options, CSRF** (Origin check)
- **Audit log** on every mutation

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Browser                                 │
│  Public Site (index.html)    Admin Console (admin.html)      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTPS
┌──────────────────────────▼──────────────────────────────────┐
│                    Express 5 Server                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ /api/public │  │ /api/admin  │  │ Static files        │  │
│  │ (no auth)   │  │ (auth+RBAC) │  │ (public/, admin.html)│  │
│  └──────┬──────┘  └──────┬──────┘  └─────────────────────┘  │
│         │                │                                    │
│         ▼                ▼                                    │
│  ┌─────────────────────────────────────────────────────┐     │
│  │              Business Logic Modules                  │     │
│  │  scheduling.js  │  bookings.js  │  whatsapp.js      │     │
│  │  packages.js    │  treatwell.js   │  auth.js        │     │
│  └────────────────────┬────────────────────────────────┘     │
│                       │                                      │
│                       ▼                                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │              SQLite (WAL mode, FKs)                  │     │
│  │  data/salon.db  (single file, trivial backup)        │     │
│  └─────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**Stack:**
- **Runtime:** Node.js 22+ (ES Modules, built-in SQLite)
- **HTTP:** Express 5
- **Database:** `node:sqlite` (DatabaseSync, WAL, FKs)
- **Frontend:** Vanilla ES Modules, CSS Custom Properties
- **Scheduler:** In-process `setInterval` (60s tick)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 22+
- npm 10+

### Install & Run
```bash
git clone https://github.com/your-username/salon-suite.git
cd salon-suite
npm install
npm run dev          # http://localhost:4321 (with --watch)
# or
npm start            # production mode
```

### Demo Login
| Email | Role | Password |
|-------|------|----------|
| `owner@lumiere.test` | Owner | `salon123` |
| `manager@lumiere.test` | Manager | `salon123` |
| `reception@lumiere.test` | Reception | `salon123` |
| `anya@lumiere.test` | Stylist | `salon123` |

---

## ⚙️ Configuration

### Environment Variables
Copy `.env.example` to `.env` and edit:

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `PORT` | `4321` | No | HTTP port |
| `SESSION_SECRET` | auto-generated | **Yes (prod)** | 32+ char hex for cookie signing |
| `WHATSAPP_TOKEN` | — | Cloud API only | Meta Cloud API token |
| `WHATSAPP_PHONE_ID` | — | Cloud API only | Meta phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | — | Cloud API only | Webhook verify token |
| `SITE_URL` | `http://localhost:4321` | No | Used in WhatsApp links |

### Salon Settings (via Admin → Settings)
| Setting | Default | Description |
|---------|---------|-------------|
| `salon.name` | Lumière Hair & Beauty | Brand name |
| `salon.timezone` | Europe/London | Display + rota timezone |
| `booking.slot_step_minutes` | 15 | Slot grid |
| `booking.min_notice_minutes` | 120 | Min booking lead time |
| `booking.horizon_days` | 60 | How far ahead to book |
| `whatsapp.mode` | link | `link` or `api` |
| `packages.default_sessions` | 5 | Paid sessions per package |
| `packages.default_free` | 1 | Complimentary sessions |

---

## 📦 Package Business Rules

1. **In-store only** — no online purchase/checkout
2. **5 paid + 1 free** — configurable via settings
2. **Complimentary unlocked after 5th completion** — not on booking
3. **No expiry** — packages never expire
4. **Treatment-locked** — only the purchased service
5. **QR verification** — customer shows code, staff scans
6. **Staff redemption** — explicit confirmation after treatment
7. **Audit trail** — every action logged
8. **No online approval** — staff sales active immediately

---

## 🔌 API Reference

### Public Endpoints (`/api/public/*`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/site` | Full site data (services, staff, offers, hours) |
| GET | `/services` | Active services list |
| GET | `/staff` | Active staff list |
| GET | `/availability` | Slots for service+staff+date |
| GET | `/availability/month` | Day counts for month view |
| POST | `/bookings` | Create booking (customer + serviceIds + start) |
| GET | `/bookings/:ref` | Lookup by reference + phone |
| POST | `/bookings/:ref/cancel` | Self-service cancel |
| POST | `/waitlist` | Join waitlist |
| GET | `/packages` | Services available as packages |
| GET | `/packages/customer/:id` | Customer's active packages |
| POST | `/packages/purchase` | **Removed** (in-store only) |

### Admin Endpoints (`/api/admin/*` — requires auth + RBAC)
| Method | Endpoint | Roles |
|--------|----------|-------|
| GET | `/dashboard` | all |
| GET/POST | `/appointments` | all / desk |
| PATCH | `/appointments/:id` | desk |
| POST | `/appointments/:id/status` | all |
| GET/POST/PATCH/DELETE | `/customers` | all / desk / owner |
| GET | `/customers/export.csv` | desk |
| GET/POST/PATCH/DELETE | `/services` | all / manage |
| GET/POST/PATCH/DELETE | `/staff` | all / manage |
| GET/POST/PATCH/DELETE | `/rota` | all / manage |
| GET/POST/PATCH/DELETE | `/timeoff` | all / manage |
| GET/POST/PATCH/DELETE | `/offers` | all / manage |
| GET/POST/PATCH/DELETE | `/packages` (purchases) | all / desk |
| POST | `/package-purchases` | desk (in-store sale) |
| GET | `/verify/qr/:code` | desk |
| POST | `/verify/qr/:code/redeem` | desk |
| GET/POST | `/treatwell/*` | manage |
| GET/POST | `/broadcast` | manage |
| GET | `/reports` | manage |
| GET | `/sales/export.csv` | manage |
| GET | `/settings` / PATCH | all / owner |

---

## 💾 Database

**File:** `data/salon.db` (SQLite 3, WAL mode, FKs)

**Key Tables:**
| Table | Purpose |
|-------|---------|
| `users` | Auth (email, scrypt hash, role, staff_id) |
| `staff` | Profiles, skills, commission, colour |
| `services` | Catalogue (duration, price, buffer, deposit) |
| `customers` | CRM (phone unique, consent, loyalty, tags) |
| `appointments` | Bookings (UTC times, status, source, payments) |
| `appointment_items` | 1:N services per appointment |
| `shifts` | Rota (staff, date, start/end, break) |
| `time_off` | Leave (type, status, dates) |
| `packages` (plans, purchases, redemptions) | Treatment packages |
| `notifications` | WhatsApp outbox (queue, retry, status) |
| `treatwell_imports` / `mappings` | CSV import audit |
| `audit_log` | Every mutation |
| `settings` | Key/value config |

---

## 📜 Scripts

```bash
npm start       # Run server
npm run dev     # Run with --watch (auto-reload)
npm run seed    # Seed empty database
npm run reset   # Wipe & reseed demo data
npm run backup  # Timestamped DB copy to backups/
```

---

## 🚀 Deployment

See [DEPLOYMENT.md](DEPLOYMENT.md) for production guide covering:
- Systemd service
- Nginx reverse proxy + SSL (Let's Encrypt)
- WhatsApp webhook registration
- Automated backups (cron)
- Logs & monitoring
- Docker alternative

---

## 📁 Project Structure

```
salon-suite/
├── .env.example          # Environment template
├── .gitignore
├── LICENSE               # MIT
├── CHANGELOG.md          # Version history
├── CONTRIBUTING.md       # Contribution guide
├── DEPLOYMENT.md         # Production guide
├── SECURITY.md           # Security policy
├── package.json
├── MASTER_PROMPT.md      # Project specification
├── docs/                 # Full documentation
│   ├── 00-overview.md
│   ├── 01-features.md
│   ├── 02-architecture.md
│   ├── 03-data-model.md
│   ├── 04-api.md
│   ├── 05-whatsapp.md
│   ├── 06-rota.md
│   ├── 07-roadmap.md
│   └── Essential/        # Audit, design, roadmap, etc.
├── public/
│   ├── index.html        # Public site
│   ├── admin.html        # Admin shell
│   ├── css/site.css      # Public styles
│   ├── css/admin.css     # Admin styles
│   └── js/
│       ├── api.js        # Fetch wrapper, formatting
│       ├── site.js       # Public site logic
│       └── admin.js      # Admin console (hash-router)
├── scripts/
│   ├── seed.mjs
│   ├── reset.mjs
│   └── backup.mjs
└── server/
    ├── index.js          # Bootstrap, static, scheduler
    ├── db.js             # Schema, migrations, seed
    ├── auth.js           # Sessions, roles, rate-limit
    ├── util.js           # Timezone, validation, CSV
    ├── scheduling.js     # Availability engine
    ├── bookings.js       # CRUD, status, reports
    ├── whatsapp.js       # Templates, queue, dispatch
    ├── packages.js       # Packages, purchases, QR
    ├── treatwell.js      # CSV import, matching
    └── routes/
        ├── public.js     # Public API
        └── admin.js      # Admin API
```

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

1. Fork → branch → changes → test (`npm run dev`)
2. `node --check server/*.js public/js/*.js` (syntax)
3. Clear commits, open PR

---

## 🔒 Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting and security features.

- scrypt + HMAC cookies
- Rate limiting, CSP, CSRF
- Prepared statements only
- GDPR/PECR compliance

---

## 📄 License

MIT License — see [LICENSE](LICENSE)

---

## 🙏 Acknowledgements

- Built for independent salons needing a self-hosted, privacy-first alternative to SaaS platforms
- Inspired by real salon workflows: paper diaries, WhatsApp chaos, and Treatwell dependency