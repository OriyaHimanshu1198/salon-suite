# 01 Existing System Audit
Understand the current application.

## Current Technology Stack
- **Backend:** Node.js (>=22.5) with Express 5.1.0.
- **Frontend:** Static HTML + Vanilla ES Modules (no framework, no bundler). CSS Custom Properties design system.
- **Database:** SQLite using built-in `node:sqlite` (DatabaseSync, WAL mode, foreign keys enabled).
- **Authentication:** Custom scrypt (N=16384) password hashing + HMAC-SHA256 signed HttpOnly cookies (7-day sliding expiry).
- **Rate Limiting:** In-memory bucket per IP (login 8/15min, booking 20/hr, reads 240/min).
- **Scheduler:** In-process `setInterval` (60s tick) for WhatsApp dispatch and birthday job.
- **Integrations:** WhatsApp Cloud API (optional, env-gated); `wa.me` deep links as zero-setup fallback.

## Current Application Architecture
- **Single Process:** Node.js server handles API, static hosting, and scheduled jobs.
- **Data Persistence:** Single SQLite file (`data/salon.db`).
- **Folder Structure:**
  - `/server`: Backend logic (routes, db, utils, scheduling, WhatsApp, packages).
  - `/public`: Frontend assets (`index.html`, `admin.html`, CSS, JS modules).
  - `/docs`: Project documentation (overview, architecture, data-model, features, API, WhatsApp, rota, roadmap).
  - `/scripts`: Maintenance (seed.mjs, backup.mjs, reset.mjs).
- **Request Flow:**
  - `/` → `public/index.html` (public site).
  - `/admin` → `admin.html` (SPA, guarded by client-side auth + API middleware).
  - `/api/public/*` → `routes/public.js` (rate-limited, no auth).
  - `/api/admin/*` → `auth` middleware → `routes/admin.js`.
  - Every admin mutation: validate → authorise → write → audit → queue messages → respond.

## Existing Website Pages and Modules
- **Public Site (`index.html`):** Hero, offers strip, birthday band, services/prices, packages, team, reviews, about/contact/hours, 6-step booking wizard (service → staff → date → time → details → confirm), multi-service basket, booking lookup/cancel, waitlist join.
- **Admin Console (`admin.html`):** Login screen, sidebar navigation (Dashboard, Calendar, Clients, Packages, Services, Team, Rota, Sales, Website, Messages, Reports, Settings), hash-router views, modal system, toasts.
- **Booking Engine:** Real availability from `opening_hours` ∩ `shifts` \ `time_off` \ `appointments` (buffers included). Configurable slot grid (15 min default). Any-staff matching. Conflict guard (server re-validates on write).
- **WhatsApp Outbox:** Queued notifications with template rendering, retry policy (exponential backoff), `wa.me` click-to-send fallback, opt-out handling via webhook.
- **Rota Manager:** Weekly shifts per staff, copy-week, pattern template, conflict detection (shift overlap, time-off overlap, outside hours, unrostered bookings).
- **Package Management:** Pre-paid treatment packages (e.g., 5 paid + 1 free), online/salon purchase, redemption tracking, expiry handling, staff sales attribution.
- **Reviews:** Curated Google reviews + optional Places API sync.

## Existing Design System
- **Colour Palette (CSS Custom Properties):**
  - `--ink: #1d1620`, `--ink-soft: #3b303c`, `--muted: #6f6270`
  - `--cream: #faf6f1`, `--paper: #fffdfa`
  - `--plum: #4a2340`, `--plum-deep: #33162c`
  - `--gold: #b08a4f`, `--gold-soft: #e6d3b3`
  - `--rose: #e9c9c2`, `--line: #e9dfd5`
  - `--ok: #2f7d5d`, `--warn: #b4682a`, `--bad: #b3352f`
- **Typography:** Serif for headings (`--serif`: Iowan Old Style / Palatino / Georgia), Sans for UI (`--sans`: system-ui stack).
- **Spacing & Layout:** `--maxw: 1180px`, `--radius: 18px`, fluid clamp() sizing, mobile-first breakpoints (900px, 640px, 380px).
- **Components:** Buttons (primary, ghost, gold, danger, sm/block), Cards (services, staff, packages, reviews), Tabs, Calendar grid, Slot picker, Form fields (with validation states), Notice bar, Birthday band, Toast notifications.
- **Brand Mark:** "L" in plum/gold gradient circle.

## Existing Database Structure
**Core Tables:**
- `users` — auth (email, scrypt hash, role: owner/manager/reception/staff, staff_id FK).
- `staff` — profiles (name, title, bio, colour, commission %, employment_type, active).
- `services` — catalogue (name, category, duration_min, buffer_min, price_pence, deposit_pence, online_bookable, active).
- `staff_skills` — M:N staff ↔ services.
- `customers` — CRM (name, phone UNIQUE, email, DOB, address, tags, preferred_staff, allergies, formula_notes, notes, whatsapp_opt_in, marketing_opt_in, consent_at, loyalty_points, total_spend_pence, visit_count, last_visit_at).
- `appointments` — bookings (reference UNIQUE, customer_id, staff_id, start_at/end_at UTC, status, source, total_pence, deposit_pence, paid_pence, notes, internal_notes, cancelled_at, cancel_reason, reminder_sent_at, package_purchase_id, discount_pence).
- `appointment_items` — 1:N services per appointment (name_snapshot, duration_min, price_pence).
- `shifts` — rota (staff_id, work_date, start_time, end_time, break_min).
- `time_off` — leave (staff_id, start_date, end_date, type, status).
- `opening_hours` — per weekday (open_time, close_time, closed).
- `site_content` — key/value for public site copy.
- `offers` + `offer_services` — promotions (percent/amount/freebie, code, dates, linked services).
- `message_templates` — WhatsApp bodies with `{{placeholders}}`.
- `notifications` — outbox (customer_id, appointment_id, channel, template_key, to_phone, body, status, scheduled_for, sent_at, attempts, last_error, wa_link).
- `waitlist` — customer date-range requests.
- `package_plans` + `package_purchases` + `package_redemptions` — loyalty packages.
- `reviews` — Google reviews (author, rating, body, source, featured, sort_order).
- `settings` — key/value config (salon, booking, WhatsApp, loyalty, birthday, etc.).
- `audit_log` — every mutation (actor_id, actor_name, action, entity, entity_id, detail, ip, created_at).

## Existing Booking Workflow
1. Client selects services → basket totals duration + max buffer.
2. Client picks date → month calendar shows days with ≥1 slot.
3. Client picks time → slot grid shows available start times (first qualified staff).
4. Client enters details (name, phone, email, DOB optional) → POST `/api/public/bookings`.
5. Server: `serviceBundle` → `qualifiedStaff` → `assertBookable` (opening hours, shift, time-off, overlaps, notice/horizon) → `assertNoOverlap` (transaction re-check) → insert appointment + items → queue confirmation + 24h reminder → return reference.
6. Self-service cancel: reference + phone → cutoff check (24h default) → status=cancelled → queue cancellation notice.

## Existing Authentication and Permissions
- **Roles:** `owner` (all), `manager` (all except billing settings), `reception` (calendar, clients, messages, bookings), `staff` (own column, own clients, mark complete/no-show, add notes).
- **Guards:** `requireAuth` (valid session), `requireRole(...)` on routes. Staff restricted to own appointments for status changes.
- **Session:** HMAC-signed cookie (`ss_session`), 7-day expiry, sliding renewal.
- **CSRF:** `sameOrigin` middleware on mutating admin routes (Origin header check).
- **Rate Limits:** Login 8/15min/IP, Public booking 20/hr/IP, Public reads 240/min/IP.

## Existing Integrations
- **WhatsApp:**
  - Mode `link` (default): `wa.me` deep links, staff click to send.
  - Mode `api`: Cloud API (`WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` in `.env`), webhook for inbound STOP.
  - Templates: booking_confirmed, reminder_24h, booking_cancelled, booking_rescheduled, thank_you, waitlist_open, offer_broadcast, payment_receipt, birthday_offer, package_purchased, package_free_ready, package_complete.
  - Retry: 5 attempts (2m, 10m, 1h, 6h, give up).
  - Throttle: 1 msg/2s, batches of 50, quiet hours 08:00–20:00.
- **Google Reviews (optional):** Places API sync if `GOOGLE_PLACES_API_KEY` + `reviews.google_place_id` configured.

## Features That Can Be Reused
- SQLite schema & migrations pattern (`ensureColumn`).
- WhatsApp queue + template engine + dual-mode dispatch.
- Availability engine (`scheduling.js`) — solid, tested logic.
- Rota + time-off + conflict detection.
- Package system (plans, purchases, redemptions, expiry, staff sales).
- Customer CRM with consent flags, tags, formula notes, loyalty points.
- Audit logging on every mutation.
- Settings system with defaults.
- Seed data for realistic demo.

## Missing Features (Target Platform)
| Area | Missing |
|------|---------|
| Treatwell | No integration (import API, webhooks, CSV fallback, customer matching, dedupe). |
| Loyalty (Visit-based) | Current: points per £1. Target: 5 visits = £10 reward, configurable rules, transaction ledger. |
| Birthday | Current: 15% auto-discount + WhatsApp queue. Target: unique voucher codes, min spend, treatment exclusions, campaign scheduling. |
| Marketing | Current: broadcast to segments via WhatsApp only. Target: Email + SMS campaign manager (create, template, segment, schedule, track delivery/clicks/bookings, unsubscribe, history). Separate Email/SMS consent tracking. |
| Website Content | Current: `site_content` key/value + offers. Target: Draft/Preview/Publish/Schedule/Expire workflow, banners, announcements, staff profiles, treatment descriptions, images, loyalty info. Decouple from marketing dispatch. |
| Offer Management | Current: percent/amount, code, dates, linked services. Target: VIP/new customer offers, seasonal, redemption limits, usage reports, placement picker (site/email/SMS). |
| Announcements | Not implemented. Target: Draft/Publish/Schedule/Expire, display locations (hero, banner, footer). |
| Team Targets | Current: commission % per staff. Target: weekly/monthly targets, utilisation, rebooking rate, retail, retention, team targets. |
| Analytics | Current: daily revenue/services/staff, top clients, retention, CSV export. Target: Treatment profitability, customer segmentation (VIP/lapsed/new/retention), marketing attribution, AI Data Analyst (natural language queries → answers/charts/reports). |
| Security | Current: RBAC, audit, scrypt, rate limits. Target: explicit permissions matrix per role, PII field encryption, data retention policies. |

## Risks and Technical Limitations
1. **Single SQLite File:** Fine for single-location MVP. Horizontal scaling requires architecture change (PostgreSQL, read replicas).
2. **In-Process Scheduler:** `setInterval` stops if process restarts; no persistence across deployments. Acceptable for single salon.
3. **Treatwell API Access:** Unknown if authorised API/webhooks exist. Must investigate; build CSV import fallback first.
4. **No Payment Gateway:** Deposits recorded as amounts only. Stripe/PayPal integration needed for online payments.
5. **No Email/SMS Provider:** Marketing module requires SendGrid/Mailgun/Twilio or similar.
6. **No Image Storage:** Website content management needs image upload handling (local disk or S3-compatible).
7. **No Automated Tests:** Manual QA only. Regression risk as features grow.
8. **No CI/CD Pipeline:** Deploy process not documented.

## Recommended Development Roadmap
**Phase 1: Foundation & Treatwell (Weeks 1-3)**
- Investigate Treatwell Connect API access (official or CSV export).
- Build Treatwell import module: customer import, booking import, dedupe UI, import history/error log.
- Add `treatwell_imports` table + API endpoints.
- Extend customer matching (normalised phone/email, review queue for uncertain matches).

**Phase 2: Loyalty & Birthday Enhancement (Weeks 4-5)**
- Add `loyalty_transactions` table (earn/redeem/expire/adjust, visit-based).
- Implement 5-visit = £10 reward logic with config (min spend, expiry).
- Birthday: unique voucher codes, min spend, exclusions, scheduled dispatch.

**Phase 3: Marketing Campaign Manager (Weeks 6-8)**
- Add `campaigns`, `campaign_templates`, `campaign_sends` tables.
- Email provider integration (SendGrid/Resend) + SMS (Twilio/Vonage).
- Segment builder (SQL-based), scheduling, tracking pixels/links, attribution to bookings.
- Consent tracking per channel (email_opt_in, sms_opt_in, source, version, withdrawn_at).

**Phase 4: Website Content & Offer Expansion (Weeks 9-11)**
- Draft/Preview/Publish/Schedule/Expire workflow for `site_content` + new `announcements` table.
- Image upload handling (local `public/uploads/` + CDN-ready paths).
- Offer placement picker, redemption limits, usage reports.
- Announcement manager with display locations.

**Phase 5: Team Targets & Advanced Analytics (Weeks 12-14)**
- `staff_targets` table (weekly/monthly, revenue/services/retail/retention).
- Analytics views: treatment profitability, customer LTV, cohort retention, marketing ROI.
- Exportable charts (Chart.js) + CSV.

**Phase 6: AI Data Analyst (Weeks 15-16)**
- Read-only query builder over analytics views.
- Natural language → SQL (via LLM) with strict allow-list of tables/columns.
- Response: answer + chart config + CSV download.
- Guardrails: no PII exposure, row-level permissions, query timeout.

**Phase 7: Hardening & Documentation (Week 17)**
- Integration tests for critical paths.
- Mobile regression testing.
- Update all Essential docs with final schemas/APIs.
- Changelog finalised.

---

*This audit reflects the codebase as of 2026-11-22. Awaiting approval before any code modifications.*