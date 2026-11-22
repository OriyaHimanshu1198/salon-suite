# Salon Suite — Feature Register

**Baseline:** 22 November 2026
**Status legend**

| Status | Meaning |
|---|---|
| **Done** | Implemented and reachable in the current UI |
| **Partial** | Implemented but with a verified limitation or unused setting |
| **API only** | Backend exists; no current UI surface |
| **Not built** | Described in earlier specs or the roadmap, absent from the code |

Every feature below is verified against `server/` and `public/js/`. Endpoints are listed without the
`/api` prefix only where the section heading makes it obvious; the full path is in §14.

---

## 1. Public website

| ID | Feature | Implementation | Status |
|---|---|---|---|
| P1 | Salon identity and hero | `GET /api/public/site` supplies name, hero kicker/title/sub, about copy, contact details | Done |
| P2 | Notice bar | `site.notice_*` settings; two tones; dismissal per message text in `localStorage` | Done |
| P3 | Service menu with category tabs | Active services grouped by category; price, duration, description | Done |
| P4 | Team showcase | Active staff with title, bio, accent colour and initials avatar | Done |
| P5 | Opening hours | One row per weekday; closed days render in red | Done |
| P6 | Offers strip | Active offers inside their date window, with code, value and linked services | Done |
| P7 | Reviews section | Featured reviews at or above `reviews.min_rating`; average and count; hidden when empty | Done |
| P8 | Package showcase | Active + online plans, saving calculation, session dots, included services | Done |
| P9 | Package reservation | Inline form; creates an unpaid online purchase; shows `PKG-XXXX` | Done |
| P10 | Social links | Instagram, Facebook, TikTok, Google, YouTube, WhatsApp; empty keys omitted | Done |
| P11 | Birthday band | Shown when enabled and percentage is non-zero | Done |
| P12 | Booking wizard | Five steps: services → stylist → date/time → details → confirmation | Done |
| P13 | Multi-service basket | Up to four services; duration and price summed; max buffer used | Done |
| P14 | Live availability | Month counts and day slots from the same engine the console uses | Done |
| P15 | Booking lookup | Reference + phone; shows appointment detail and balance | Done |
| P16 | Self-service cancellation | Enforced notice window; returns `refundDue` informationally | Done |
| P17 | Waitlist form | Backend supports join and cancellation notices | API only |
| P18 | Public reschedule | No endpoint; clients must cancel and rebook | Not built |
| P19 | Online card payment / deposit | No payment provider; deposits are recorded only | Not built |
| P20 | Email or SMS confirmation | WhatsApp only | Not built |

**Public endpoint summary**

```
GET  /api/public/site
GET  /api/public/services
GET  /api/public/staff
GET  /api/public/reviews
GET  /api/public/packages
POST /api/public/packages/:planId/purchase
GET  /api/public/availability
GET  /api/public/availability/month
POST /api/public/bookings
GET  /api/public/bookings/:reference
POST /api/public/bookings/:reference/cancel
POST /api/public/waitlist
```

---

## 2. Booking engine

| ID | Feature | Implementation | Status |
|---|---|---|---|
| B1 | Service bundles | Unique services, summed duration and price, maximum buffer, summed deposits | Done |
| B2 | Qualified staff matching | `staff_skills` must cover every service; active staff only | Done |
| B3 | Shift-based windows | Salon opening hours plus the staff member's shifts for the day | Done |
| B4 | Approved time off | Removes all windows for the affected dates | Done |
| B5 | Appointment blocking | Non-cancelled appointments subtract from free windows | Done |
| B6 | Slot stepping | `booking.slot_step_minutes`, default 15 | Done |
| B7 | Notice and horizon | `booking.min_notice_minutes` (120) and `booking.horizon_days` (60) | Done |
| B8 | Conflict guard | Transactional overlap re-check before insert; returns `slot_taken` | Done |
| B9 | Alternative suggestions | Up to six alternative starts on conflict or unavailable slot | Done |
| B10 | Booking reference | `LS-` plus four unambiguous characters | Done |
| B11 | Auto-confirm | `booking.auto_confirm` decides `confirmed` vs `pending` | Done |
| B12 | Birthday discount | Applied at booking from DOB and `birthday.window_days` | Done |
| B13 | Break-aware availability | `break_min` is stored but not subtracted from availability | Partial |
| B14 | Online-bookable flag | `services.online_bookable` is stored but not enforced | Partial |
| B15 | Recurring appointments | No model or endpoint | Not built |
| B16 | Rooms/chairs as resources | Staff are the only bookable resource | Not built |

---

## 3. Management console shell and access

| ID | Feature | Implementation | Status |
|---|---|---|---|
| A1 | Login | `POST /api/auth/login`, scrypt verify, signed HttpOnly cookie | Done |
| A2 | Session check | `GET /api/auth/me` | Done |
| A3 | Logout | `POST /api/auth/logout` clears the cookie | Done |
| A4 | Hash router | `#/dashboard`, `#/calendar`, `#/clients`, `#/packages`, `#/services`, `#/team`, `#/rota`, `#/sales`, `#/website`, `#/messages`, `#/reports`, `#/settings` | Done |
| A5 | Role-based navigation | Staff hide team/rota/sales/settings; reception hides sales/settings | Done |
| A6 | Server-side role gates | `canDesk` (owner/manager/reception), `canManage` (owner/manager), `canOwner` | Done |
| A7 | Global search | Customers and appointments, minimum two characters, eight results each | Done |
| A8 | Toasts and modals | Shared helpers; Escape/backdrop close; focus handling | Done |
| A9 | User administration | Accounts are seed-only; no create/edit/password reset | Not built |
| A10 | CSRF tokens | Origin check and SameSite cookie are the current controls | Not built |

---

## 4. Dashboard and diary

| ID | Feature | Implementation | Status |
|---|---|---|---|
| D1 | Daily KPIs | Takings, projected, bookings, completed, no-shows, new clients, utilisation, unread alerts | Done |
| D2 | Day appointment list | Status, client, services, staff, time, total | Done |
| D3 | Day navigation | Previous/next and date picker | Done |
| D4 | Quick status actions | Arrived, complete, no-show from the dashboard | Done |
| D5 | Upcoming birthdays | Next seven days | Done |
| D6 | Team sales snapshot | Staff sales report for the selected day | Done |
| D7 | Birthday job trigger | `POST /birthdays/run`, optional `force` | Done |
| D8 | Calendar view | One column per active staff member, shift window, appointment cards | Done |
| D9 | New booking modal | Client search, services, stylist, date, availability-driven time | Done |
| D10 | Appointment modal | Notes, internal notes, payment, package redemption, details | Done |
| D11 | Drag-and-drop diary | Not implemented | Not built |

---

## 5. Appointments

| ID | Feature | Implementation | Status |
|---|---|---|---|
| AP1 | List and filter | Date range, staff, status, text search | Done |
| AP2 | Detail | Items, staff, customer, notes, payment totals, discount | Done |
| AP3 | Create from console | `POST /appointments`, source `admin`, status default `confirmed` | Done |
| AP4 | Reschedule | `PATCH /appointments/:id` with start/staff/services; re-validates availability | Done |
| AP5 | Status changes | `POST /appointments/:id/status`; staff limited to own appointments | Done |
| AP6 | Completion side effects | Visit count, spend, loyalty points, last visit, auto-record unpaid total | Done |
| AP7 | Payment recording | `POST /appointments/:id/payment`; adds to `paid_pence` | Done |
| AP8 | Cancellation side effects | Cancellation message, internal alert, waitlist notices | Done |
| AP9 | Appointment CSV | Route exists but is shadowed by `/appointments/:id` | Partial |
| AP10 | Refunds | No refund processing | Not built |

---

## 6. Clients and CRM

| ID | Feature | Implementation | Status |
|---|---|---|---|
| C1 | Client list | Search by name, phone or email; limit 200 default, 500 max | Done |
| C2 | Segments | all, vip, colour, nails, new, lapsed, marketing, consent | Done |
| C3 | Create client | First name and phone required; duplicate phone rejected | Done |
| C4 | Edit client | Contact, DOB, address, tags, preferred staff, allergies, formula, notes, consents | Done |
| C5 | Client detail | Profile, appointment history, notifications, next appointment, packages | Done |
| C6 | Consent tracking | `consent_at` refreshed when either opt-in changes | Done |
| C7 | GDPR erase | Owner only; transactional delete of client and dependent rows | Done |
| C8 | Client CSV | Route exists but is shadowed by `/customers/:id` | Partial |
| C9 | Loyalty accrual | Points on completion at `loyalty.points_per_pound` | Done |
| C10 | Loyalty redemption | No endpoint or UI | Not built |
| C11 | Client merge | Duplicate phones are blocked, not merged | Not built |
| C12 | Marketing automation | Manual broadcasts only | Not built |

---

## 7. Services and team

| ID | Feature | Implementation | Status |
|---|---|---|---|
| S1 | Service list | Active and inactive, grouped by category | Done |
| S2 | Create/update service | Name, category, description, duration, buffer, price, deposit, online flag, order | Done |
| S3 | Deactivate service | `DELETE /services/:id` sets `active = 0` | Done |
| S4 | Staff list | Active and inactive, skills, commission, login link | Done |
| S5 | Create/update staff | Profile, colour, employment type, commission, skills, order | Done |
| S6 | Deactivate staff | `DELETE /staff/:id` sets `active = 0` | Done |
| S7 | Staff photo upload | Initials avatars and accent colours only | Not built |
| S8 | Payroll export | Commission shown in sales only | Not built |

---

## 8. Rota and time off

| ID | Feature | Implementation | Status |
|---|---|---|---|
| R1 | Weekly rota | Monday-start week; shifts, leave, conflicts, opening hours | Done |
| R2 | Shift create/update | Start before end; overlapping shifts rejected | Done |
| R3 | Shift delete | Allowed; response warns about affected bookings | Done |
| R4 | Copy week | Copies shifts by weekday offset; skips duplicates | Done |
| R5 | Pattern fill | Uses the previous 28 days to create missing shifts | Done |
| R6 | Time-off request | Any signed-in user; staff requests forced to `pending` | Done |
| R7 | Time-off approval | Owner/manager sets pending/approved/declined | Done |
| R8 | Conflict warnings | Shift overlap, leave overlap, outside hours, unrostered booking | Done |
| R9 | Drag-and-drop rota | Not implemented | Not built |
| R10 | Break-aware booking | Breaks affect utilisation but not availability | Partial |

---

## 9. Treatment packages

| ID | Feature | Implementation | Status |
|---|---|---|---|
| K1 | Plan list | Active/inactive, covered services, sessions, price, validity | Done |
| K2 | Create/update plan | Paid sessions, free sessions, price, validity, emoji, online flag, order | Done |
| K3 | Deactivate plan | Sets `active = 0` and `online = 0`; purchases continue | Done |
| K4 | Public reservation | Creates unpaid `online` purchase, queues message, alerts team | Done |
| K5 | In-salon sale | `staff` channel, records seller and optional payment | Done |
| K6 | Purchase list and detail | Status filter, customer, plan, sessions, paid, expiry | Done |
| K7 | Payment recording | Capped at plan price; appends note | Done |
| K8 | Redemption | Optional appointment link; discounts covered item; free-session messaging | Done |
| K9 | Completion | Marks `completed` after all sessions; queues message and alert | Done |
| K10 | Expiry | Lazy expiry on read/check/redeem | Done |
| K11 | Cancellation | Owner/manager only; used sessions remain used | Done |
| K12 | Online sale attribution | Online purchases have no staff seller and are excluded from staff rows | Partial |
| K13 | Gift vouchers | Not implemented | Not built |

---

## 10. Reviews

| ID | Feature | Implementation | Status |
|---|---|---|---|
| V1 | Public review display | Featured reviews at/above minimum rating; average and count | Done |
| V2 | Curation | Add, edit, delete, feature toggle, sort order | Done |
| V3 | Google Places sync | Optional; requires API key and place ID; matches source/author/body | Done |
| V4 | Automatic review requests | Thank-you message includes a review link | Done |
| V5 | Review moderation workflow | No pending/approved state beyond `featured` | Not built |

---

## 11. Website content, notice, hours and offers

| ID | Feature | Implementation | Status |
|---|---|---|---|
| W1 | Site content editor | Hero, about, contact, policy, footer, social keys | Done |
| W2 | Live preview | `GET /preview` returns the public payload | Done |
| W3 | Notice bar editor | Active, text, link, link text, tone | Done |
| W4 | Opening hours editor | Per weekday open/close/closed | Done |
| W5 | Offers CRUD | Percent/amount/freebie, code, dates, banner, emoji, linked services | Done |
| W6 | Social links | Six keys; handle-to-URL conversion in the public script | Done |
| W7 | Page builder / multiple pages | Single-page site only | Not built |
| W8 | Media library / image upload | No uploads; staff colours and emoji only | Not built |

---

## 12. Messaging

| ID | Feature | Implementation | Status |
|---|---|---|---|
| M1 | Template library | Twelve seeded templates; edit body; enable flag | Done |
| M2 | Outbox | Queue, filter by status, inspect body and recipient | Done |
| M3 | Click-to-send mode | `wa.me` link plus manual "Mark sent" | Done |
| M4 | Cloud API mode | Sends via Graph API when token and phone ID are set | Done |
| M5 | Retries | Backoff 2/10/60/360/1440 minutes; fails after five attempts | Done |
| M6 | Automatic messages | Confirmation, reminder, cancellation, reschedule, thank-you, packages, birthday | Done |
| M7 | Internal alerts | Channel `internal`; dashboard unread count | Done |
| M8 | Broadcast | Segment selection, offer payload, 200-customer cap | Done |
| M9 | Segments | all, marketing, vip, lapsed, new, colour, nails, birthday_month | Done |
| M10 | Inbound opt-out/in | Webhook handles STOP/UNSUBSCRIBE/CANCEL and START/YES/SUBSCRIBE | Done |
| M11 | Two-way inbox | Inbound messages are not stored as conversations | Not built |
| M12 | Quiet hours | Settings exist but are not applied | Partial |
| M13 | Email/SMS channels | Not implemented | Not built |
| M14 | Delivery receipts | Not implemented | Not built |

---

## 13. Sales, reports, settings and operations

| ID | Feature | Implementation | Status |
|---|---|---|---|
| F1 | Staff sales report | Date or range; service revenue, package revenue, commission, breakdown | Done |
| F2 | Sales CSV | `/sales/export.csv` | Done |
| F3 | Period report | Totals, daily revenue, staff revenue/visits, top services, top clients, utilisation | Done |
| F4 | Dashboard aggregates | Daily KPIs and team sales | Done |
| F5 | Audit log | Mutations, logins and key actions; owner/manager read | Done |
| F6 | Settings read | All defaults merged, session secret removed, WhatsApp mode flags | Done |
| F7 | Settings write | Owner only; only keys in `SETTING_DEFAULTS` | Done |
| F8 | Health check | `/health` returns status, DB path, WhatsApp mode | Done |
| F9 | Backup script | File copy, newest 30 kept | Done |
| F10 | Seed/reset scripts | Seed only when empty; reset deletes and reseeds | Done |
| F11 | Birthday job | Startup + 60-second loop, once per salon day | Done |
| F12 | WhatsApp dispatch loop | 60-second loop, up to 25 due messages in API mode (no immediate dispatch call at boot) | Done |
| F13 | Automated tests | None in the repository | Not built |
| F14 | Linter / CI | None in the repository | Not built |
| F15 | Scheduled backups | Script exists; no scheduler | Partial |
| F16 | Multi-branch | Single salon and timezone | Not built |
| F17 | Multi-currency | GBP display | Not built |
| F18 | PWA / offline | Not implemented | Not built |

---

## 14. Endpoint appendix

### 14.1 Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/public/site` | Full public payload |
| GET | `/api/public/services` | Active services |
| GET | `/api/public/staff` | Active staff and skills |
| GET | `/api/public/reviews` | Qualifying reviews and aggregate |
| GET | `/api/public/packages` | Online, active plans |
| POST | `/api/public/packages/:planId/purchase` | Reserve a package |
| GET | `/api/public/availability` | Day slots |
| GET | `/api/public/availability/month` | Month counts |
| POST | `/api/public/bookings` | Create a booking |
| GET | `/api/public/bookings/:reference` | Look up with phone |
| POST | `/api/public/bookings/:reference/cancel` | Cancel with phone |
| POST | `/api/public/waitlist` | Join waitlist |

### 14.2 Auth

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Sign in |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/auth/me` | Current user |

### 14.3 Admin — dashboard, diary, clients

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/admin/dashboard` | auth | Day KPIs, appointments, birthdays, team sales |
| GET | `/api/admin/search` | auth | Global search |
| GET | `/api/admin/appointments` | auth | List/filter |
| GET | `/api/admin/appointments/:id` | auth | Detail |
| POST | `/api/admin/appointments` | desk | Create |
| PATCH | `/api/admin/appointments/:id` | desk | Notes or reschedule |
| POST | `/api/admin/appointments/:id/status` | auth + own-staff check | Status change |
| POST | `/api/admin/appointments/:id/payment` | desk | Record payment |
| GET | `/api/admin/customers` | auth | List/search/segment |
| GET | `/api/admin/customers/:id` | auth | Detail |
| POST | `/api/admin/customers` | desk | Create |
| PATCH | `/api/admin/customers/:id` | desk | Update |
| DELETE | `/api/admin/customers/:id` | owner | GDPR erase |
| GET | `/api/admin/customers/export.csv` | auth | Intended CSV; currently shadowed |
| GET | `/api/admin/appointments/export.csv` | manage | Intended CSV; currently shadowed |

### 14.4 Admin — catalogue, rota, website

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/admin/services` | auth | List |
| POST | `/api/admin/services` | manage | Create |
| PATCH | `/api/admin/services/:id` | manage | Update |
| DELETE | `/api/admin/services/:id` | manage | Deactivate |
| GET | `/api/admin/staff` | auth | List |
| POST | `/api/admin/staff` | manage | Create |
| PATCH | `/api/admin/staff/:id` | manage | Update |
| DELETE | `/api/admin/staff/:id` | manage | Deactivate |
| GET | `/api/admin/rota` | auth | Week view |
| POST | `/api/admin/rota` | manage | Create shift |
| PATCH | `/api/admin/rota/:id` | manage | Update shift |
| DELETE | `/api/admin/rota/:id` | manage | Delete shift |
| POST | `/api/admin/rota/copy` | manage | Copy week |
| POST | `/api/admin/rota/template` | manage | Pattern fill |
| GET | `/api/admin/timeoff` | auth | List |
| POST | `/api/admin/timeoff` | auth | Request |
| PATCH | `/api/admin/timeoff/:id` | manage | Approve/decline |
| GET | `/api/admin/site` | auth | Public payload |
| GET | `/api/admin/preview` | auth | Public payload |
| PATCH | `/api/admin/site` | manage | Content |
| PATCH | `/api/admin/notice` | manage | Notice bar |
| PATCH | `/api/admin/hours` | manage | Opening hours |
| GET | `/api/admin/offers` | auth | List |
| POST | `/api/admin/offers` | manage | Create |
| PATCH | `/api/admin/offers/:id` | manage | Update |
| DELETE | `/api/admin/offers/:id` | manage | Deactivate |

### 14.5 Admin — packages, reviews, sales, messages

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/admin/packages` | auth | Plans |
| POST | `/api/admin/packages` | manage | Create plan |
| PATCH | `/api/admin/packages/:id` | manage | Update plan |
| DELETE | `/api/admin/packages/:id` | manage | Deactivate plan |
| GET | `/api/admin/package-purchases` | auth | Purchases |
| POST | `/api/admin/package-purchases` | desk | Sell |
| GET | `/api/admin/package-purchases/:id` | auth | Detail |
| POST | `/api/admin/package-purchases/:id/payment` | desk | Payment |
| POST | `/api/admin/package-purchases/:id/redeem` | desk | Redeem |
| POST | `/api/admin/package-purchases/:id/cancel` | manage | Cancel |
| GET | `/api/admin/customers/:id/packages` | auth | Client packages |
| GET | `/api/admin/reviews` | auth | List |
| POST | `/api/admin/reviews` | manage | Create |
| PATCH | `/api/admin/reviews/:id` | manage | Update |
| DELETE | `/api/admin/reviews/:id` | manage | Delete |
| POST | `/api/admin/reviews/sync` | manage | Google sync |
| GET | `/api/admin/sales` | manage | Staff sales |
| GET | `/api/admin/sales/export.csv` | manage | Sales CSV |
| GET | `/api/admin/birthdays` | auth | Upcoming |
| POST | `/api/admin/birthdays/run` | manage | Run job |
| GET | `/api/admin/notifications` | auth | Outbox |
| POST | `/api/admin/notifications/:id/send` | auth | Send |
| POST | `/api/admin/notifications/:id/retry` | desk | Retry |
| POST | `/api/admin/notifications/:id/mark-sent` | desk | Mark sent |
| GET | `/api/admin/templates` | auth | Templates |
| PUT | `/api/admin/templates/:key` | manage | Update template |
| POST | `/api/admin/broadcast` | manage | Broadcast |
| GET | `/api/admin/segments` | auth | Segment list |

### 14.6 Admin — reporting, settings, audit

| Method | Path | Gate | Purpose |
|---|---|---|---|
| GET | `/api/admin/reports` | manage | Period report |
| GET | `/api/admin/settings` | auth | Settings |
| PATCH | `/api/admin/settings` | owner | Update settings |
| GET | `/api/admin/audit` | manage | Audit log |

### 14.7 System

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Health and WhatsApp mode |
| GET | `/api/webhooks/whatsapp` | Meta verification |
| POST | `/api/webhooks/whatsapp` | Inbound messages and opt-outs |

---

## 15. Deliberately absent

The following are **not** in the current build and should not be described as existing behaviour:

- Card payments, online deposits, refunds, gift cards, memberships.
- Email/SMS delivery, two-way chat, delivery receipts.
- Payroll, stock/inventory, room or chair booking.
- Recurring appointments, public reschedule, public waitlist UI.
- Loyalty redemption, client merge, marketing automation.
- Multi-branch, multi-currency, multi-language.
- Native apps, PWA, offline mode.
- User administration, password reset, MFA, CSRF tokens.
- Automated tests, linter, CI, scheduled backups.
