# QA Test Plan — Salon Suite

**Version:** 1.0  
**Date:** 2024-11-22  
**Scope:** Full regression + new feature validation for v1.0

---

## 1. Test Environment

| Item | Value |
|------|-------|
| **Server** | Node.js 22+, Express 5, SQLite (WAL) |
| **Frontend** | Vanilla ES Modules, CSS Custom Properties |
| **URL (dev)** | http://localhost:4321 |
| **Admin URL** | http://localhost:4321/admin |
| **Health Check** | http://localhost:4321/health |

### Demo Accounts
| Email | Role | Password |
|-------|------|----------|
| owner@lumiere.test | Owner | salon123 |
| manager@lumiere.test | Manager | salon123 |
| reception@lumiere.test | Reception | salon123 |
| anya@lumiere.test | Stylist | salon123 |

---

## 2. Test Categories

### 2.1 Public Website (http://localhost:4321)

| ID | Area | Test Case | Expected | Pass/Fail |
|----|------|-----------|----------|-----------|
| PW-01 | Homepage | Load `/` — hero, services, team, offers, reviews, hours, footer | All sections render, no console errors | |
| PW-02 | Navigation | Click nav links (Services, Team, Reviews, About, Book) | Smooth scroll to correct section | |
| PW-03 | Mobile Nav | Resize to <640px → open hamburger menu | Menu opens/closes, links work | |
| PW-04 | Services | View services grid, filter by category tabs | Correct services per category, prices shown | |
| PW-05 | Offers | Active offers display with emoji, code, dates | Only current offers shown | |
| PW-06 | Booking Wizard - Step 1 | Select service(s) → Continue | Basket shows selected services, total price/duration | |
| PW-07 | Booking Wizard - Step 2 | Select stylist or "Any" → Continue | Only qualified stylists shown | |
| PW-08 | Booking Wizard - Step 3 | Select date on calendar → Continue | Only dates with availability enabled | |
| PW-09 | Booking Wizard - Step 4 | Select time slot → Continue | Slots from availability engine | |
| PW-10 | Booking Wizard - Step 5 | Enter name, phone, email, DOB, notes → Continue | Validation works, required fields enforced | |
| PW-11 | Booking Wizard - Step 6 | Confirm → Submit | Creates booking, shows reference, WhatsApp button | |
| PW-12 | Multi-service Booking | Add 2+ services → check total duration/price | Sum of durations + max buffer, sum of prices | |
| PW-13 | Booking Lookup | Enter valid reference + phone → Find | Shows booking details, cancel option | |
| PW-14 | Booking Cancel (Self) | Cancel >24h before → Success | Status=cancelled, WhatsApp queued | |
| PW-15 | Booking Cancel (Late) | Cancel <24h before → Blocked | Error: "Online cancellation closes 24h before" | |
| PW-16 | Waitlist | Join waitlist for date range → Success | Entry created, WhatsApp queued | |
| PW-17 | Responsive | Test at 380px, 640px, 900px, 1400px | No horizontal scroll, layouts adapt | |
| PW-18 | Accessibility | Tab through booking wizard | Focus visible, logical order, labels work | |
| PW-19 | SEO | View page source | Meta tags, Open Graph, semantic HTML | |

### 2.2 Admin Console (http://localhost:4321/admin)

| ID | Area | Test Case | Expected | Pass/Fail |
|----|------|-----------|----------|-----------|
| AD-01 | Login | Valid credentials → Dashboard | Redirects, shows today's KPIs | |
| AD-02 | Login (Invalid) | Wrong password → Error | "Please sign in" generic message | |
| AD-03 | Login (Rate Limit) | 9 failed attempts → Blocked | 429 error, retry after 15min | |
| AD-04 | Logout | Click Sign out → Login screen | Session destroyed, redirect to login | |
| AD-05 | Sidebar Nav | Click each nav item | Correct view loads, active highlight | |
| AD-06 | Mobile Sidebar | Resize <900px → Hamburger menu | Sidebar toggles | |

#### Dashboard
| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| AD-10 | Today's timeline | Shows appointments per stylist, colour-coded | |
| AD-11 | KPIs | Revenue, bookings, utilisation, no-show rate, new clients | |
| AD-12 | Upcoming birthdays | Next 7 days listed | |
| AD-13 | Team sales | Per-staff revenue for today | |
| AD-14 | Quick actions | New booking, block time, mark arrived/complete/no-show | |

#### Calendar
| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| AD-20 | Week view | 7 days, appointments per stylist | |
| AD-21 | Create booking | Fill form → Creates appointment | |
| AD-22 | Edit booking | Change time/staff/services → Validates availability | |
| AD-23 | Status transitions | Pending→Confirmed→Arrived→Completed/No-show/Cancelled | |
| AD-24 | Cancel booking | Sets status=cancelled, queues WhatsApp | |
| AD-25 | Reschedule | Drag or edit → Re-validates slot | |
| AD-26 | Payment recording | Add payment → Updates paid_pence, balance | |

#### Clients
| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| AD-30 | List clients | Search, filter by segment (VIP, Lapsed, etc.) | |
| AD-31 | View client | Profile, history, notifications, upcoming | |
| AD-32 | Create client | Form validation, duplicate phone blocked | |
| AD-33 | Edit client | Update fields, consent flags | |
| AD-34 | Delete client (Owner) | Cascades appointments, notifications, waitlist | |
| AD-35 | Export CSV | Downloads clients.csv with correct columns | |

#### Packages (Admin)
| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| AD-40 | List purchases | Filter by status, client, search | |
| AD-41 | Sell package (Plan) | Select plan, client, payment → Active immediately | |
| AD-42 | Sell package (Service) | Select service → 5+1 free, custom price | |
| AD-43 | Record payment | Add payment → Updates paid_pence, balance | |
| AD-44 | Redeem session | Select purchase, appointment → Deducts session | |
| AD-45 | Free session unlock | After 5th paid → WhatsApp queued | |
| AD-46 | Cancel purchase | Status=cancelled, audit logged | |

#### Treatwell
| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| AD-50 | Import customers CSV | Preview → confirm → Creates/updates clients | |
| AD-51 | Import bookings CSV | Links to existing clients, creates appointments | |
| AD-52 | Mappings review | Pending/confirmed/rejected filters work | |
| AD-53 | Confirm mapping | Links Treatwell ID to local client | |
| AD-54 | Reject mapping | Creates new client on next import | |
| AD-55 | Merge clients | Preserves history, updates FKs | |

#### Rota & Time-Off
| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| AD-60 | Week view | Shifts, time-off, conflicts highlighted | |
| AD-61 | Add shift | Validates overlap, outside hours | |
| AD-62 | Copy week | Duplicates shifts to target week | |
| AD-63 | Pattern fill | Generates from recent history | |
| AD-64 | Time-off request | Staff=pending, Manager=approved | |
| AD-65 | Conflict detection | Shows double-booking, leave overlap, unrostered | |

#### Messages (WhatsApp)
| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| AD-70 | Outbox list | Status filters, retry button | |
| AD-71 | Send (Click-to-send) | Opens wa.me link, mark sent | |
| AD-72 | Templates | Edit placeholders, save | |
| AD-73 | Broadcast | Select segment + offer → Queues messages | |

#### Reports
| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| AD-80 | Revenue report | By day/service/staff, CSV export | |
| AD-81 | Sales report | Per staff, services, packages, commission | |
| AD-82 | CSV exports | Appointments, clients, sales download correctly | |

#### Settings
| ID | Test Case | Expected | Pass/Fail |
|----|-----------|----------|-----------|
| AD-90 | Salon info | Name, timezone, currency, phone, email | |
| AD-91 | Booking rules | Slot step, notice, horizon, cancellation | |
| AD-92 | WhatsApp | Mode (link/api), reminder hours, quiet hours | |
| AD-93 | Packages | Default sessions/free, require approval (removed) | |
| AD-94 | Birthday | Enabled, discount %, window days | |

#### Role Permissions
| ID | Role | Allowed | Denied | Pass/Fail |
|----|------|---------|--------|-----------|
| AD-100 | Owner | All | — | |
| AD-101 | Manager | All except session.secret, user mgmt | Billing settings | |
| AD-102 | Reception | Calendar, clients, messages, bookings, packages, offers | Settings, sales, reports | |
| AD-103 | Stylist | Own column, own clients, mark complete/no-show | Other staff columns, reports, settings | |

### 2.3 API Endpoints

| ID | Endpoint | Test | Expected | Pass/Fail |
|----|----------|------|----------|-----------|
| AP-01 | GET /api/public/site | No auth | Full site data | |
| AP-02 | GET /api/public/availability | serviceIds, date | Slots with staff | |
| AP-03 | POST /api/public/bookings | Valid payload | 201, reference, WhatsApp queued | |
| AP-04 | POST /api/public/bookings | Missing serviceIds | 422 validation error | |
| AP-05 | POST /api/public/bookings | Slot taken | 409 with alternatives | |
| AP-06 | GET /api/public/packages | No auth | Active plans/services | |
| AP-07 | GET /api/public/packages/customer/:id | Valid ID | Active packages with balances | |
| AP-08 | GET /api/admin/dashboard | Auth | KPIs, timeline, birthdays | |
| AP-09 | POST /api/admin/package-purchases | Plan + client | 201, active, audit logged | |
| AP-10 | POST /api/admin/package-purchases | Service + client | 201, custom package, 5+1 | |
| AP-11 | POST /api/admin/verify/qr/:code/redeem | Valid QR + purchaseId | Session deducted, discount applied | |
| AP-12 | POST /api/admin/treatwell/import/customers | CSV text | Created/updated counts | |
| AP-13 | Rate limiting | 21 login attempts | 429 after 8 | |
| AP-14 | CSRF | POST without Origin | 403 | |

### 2.4 Database & Integrity

| ID | Test | Expected | Pass/Fail |
|----|------|----------|-----------|
| DB-01 | Foreign keys | `PRAGMA foreign_keys=ON` enforced | |
| DB-02 | WAL mode | `PRAGMA journal_mode=WAL` | |
| DB-03 | Soft deletes | Appointments cancelled not deleted | |
| DB-04 | Audit log | Every mutation has entry | |
| DB-05 | Unique constraints | Phone, email, reference, QR code | |
| DB-05 | Seed data | 7 staff, 18 services, 24 clients, ~60 appointments | |

### 2.5 WhatsApp

| ID | Test | Expected | Pass/Fail |
|----|------|----------|-----------|
| WA-01 | Click-to-send | Opens wa.me with pre-filled message | |
| WA-02 | Booking confirmed | Queued on create, sent on click | |
| WA-03 | 24h reminder | Scheduled at booking - 24h | |
| WA-04 | Cancellation | Queued on cancel, sent | |
| WA-05 | Birthday | Runs daily, queues for today's birthdays | |
| WA-06 | STOP opt-in | Inbound STOP flips both flags to 0 | |
| WA-07 | Quiet hours | No sends 20:00–08:00 | |

### 2.6 Treatwell CSV Import

| ID | Test | Expected | Pass/Fail |
|----|------|----------|-----------|
| TW-01 | Customers CSV | Headers: first_name,last_name,email,phone,dob,address,notes | |
| TW-02 | Duplicate phone | Exact match → auto-update | |
| TW-03 | Fuzzy match | Name+email → pending mapping | |
| TW-04 | Bookings CSV | Links to local clients, creates appointments | |
| TW-05 | Mapping confirm | Links Treatwell ID to local client | |
| TW-06 | Merge clients | History preserved, FKs updated | |

### 2.7 Package Business Rules

| ID | Rule | Test | Expected | Pass/Fail |
|----|------|--------|----------|-----------|
| PK-01 | 5 paid + 1 free | Complete 5 paid → free unlocked | |
| PK-02 | Free unlock timing | After 5th paid completion | |
| PK-03 | Booking ≠ completion | Booking made → balance unchanged | |
| PK-04 | Payment ≠ completion | Payment recorded → balance unchanged | |
| PK-05 | Free treatment locked | Free session only for purchased service | |
| PK-06 | No expiry | Package created 1 year ago → still active | |
| PK-07 | Multiple packages | Client has 2 packages → independent balances | |
| PK-08 | QR verification | Scan QR → shows customer + eligible packages | |
| PK-09 | Staff redemption | Select package → confirm → balance -1 | |
| PK-10 | Free session WhatsApp | After 5th → "next one is on us" queued | |
| PK-11 | Package complete WhatsApp | All used → "package complete" queued | |
| PK-12 | Audit trail | Every action logged with actor, detail, IP | |

### 2.8 Security

| ID | Test | Expected | Pass/Fail |
|----|------|----------|-----------|
| SC-01 | Password hash | scrypt, not plaintext | |
| SC-02 | Session cookie | HttpOnly, SameSite=Lax, Secure (prod) | |
| SC-03 | Rate limiting | Login 8/15min, booking 20/hr | |
| SC-04 | CSP headers | Present, strict | |
| SC-05 | SQL injection | Parameterized queries only | |
| SC-06 | XSS | textContent/escapeHtml only | |
| SC-07 | CSRF | Origin check on mutating admin routes | |
| SC-08 | GDPR erase | Owner only, cascades all data | |
| SC-09 | Audit log | Every mutation logged | |
| SC-10 | Role enforcement | Server-side, not just UI | |

### 2.9 Mobile & Browser

| ID | Device/Browser | Test | Pass/Fail |
|----|----------------|------|-----------|
| MB-01 | Chrome Desktop | Full flow | |
| MB-02 | Firefox Desktop | Full flow | |
| MB-03 | Safari Desktop | Full flow | |
| MB-04 | Chrome Android | Booking wizard, admin | |
| MB-04 | Safari iPhone | Booking wizard, admin | |
| MB-05 | 380px width | No horizontal scroll | |
| MB-06 | 640px width | Tablet layout | |
| MB-07 | 900px width | Desktop layout | |
| MB-08 | PWA install | Manifest, icons, service worker (if added) | |

### 2.10 Performance

| ID | Metric | Target | Actual | Pass/Fail |
|----|--------|--------|--------|-----------|
| PF-01 | Health check | <100ms | | |
| PF-02 | /api/public/site | <200ms | | |
| PF-03 | 30-day availability | <120ms | | |
| PF-04 | Page load (Lighthouse) | LCP <2.5s, INP <200ms, CLS <0.1 | | |

---

## 3. Test Execution

### Pre-Test Setup
```bash
cd salon-suite
npm run reset          # Clean database with seed data
npm run dev            # Start server with --watch
```

### Execution Order
1. **Smoke Tests** (PW-01, AD-01, AP-01, DB-01) — 5 min
2. **Public Website** (PW-01 to PW-19) — 20 min
3. **Admin Console** (AD-01 to AD-94) — 30 min
4. **API & Database** (AP-01 to AP-14, DB-01 to DB-05) — 15 min
5. **WhatsApp & Treatwell** (WA-01 to WA-07, TW-01 to TW-06) — 15 min
6. **Package Rules** (PK-01 to PK-12) — 15 min
7. **Security** (SC-01 to SC-10) — 10 min
8. **Mobile/Browser** (MB-01 to MB-08) — 20 min
9. **Performance** (PF-01 to PF-04) — 5 min

**Total: ~2 hours for full regression**

---

## 4. Defect Tracking

| Defect ID | Severity | Area | Description | Steps to Reproduce | Status |
|-----------|----------|------|-------------|-------------------|--------|
| | | | | | |

---

## 4. Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Developer | | | |
| Product Owner | | | |

---

## 5. Known Limitations (v1.0)

| Limitation | Workaround |
|------------|------------|
| No PWA manifest/service worker | Add in v1.1 |
| No OTP auth for customers | Use Treatwell for guest booking |
| No email/SMS marketing | WhatsApp only |
| No content CMS (blocks, media) | Edit via Settings + site_content |
| No automated test suite | Manual QA only |
| No CI/CD pipeline | Manual deploy |
| Single SQLite file | Not horizontally scalable |

---

## 5. Test Data

### Seed Data (after `npm run reset`)
- **Staff:** 7 (Anya, Marcus, Priya, Chloe, Jade, Sofia, Liam)
- **Services:** 18 across Hair, Colour, Treatments, Nails, Brows
- **Clients:** 24 with varied tags, consent, birthdays
- **Appointments:** ~60 (past 21 days → next 13 days)
- **Shifts:** 4 weeks back → 5 weeks forward
- **Packages:** 5 plans (Cut×5, Blow×5, Gel×5, Roots×4, Deep×5)
- **Package Purchases:** 8 across clients
- **Offers:** 3 (Midweek Colour, First Visit Cut, Gel+Pedi)
- **Templates:** 11 WhatsApp templates

---

*End of QA Test Plan*