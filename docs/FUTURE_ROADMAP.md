# Salon Suite — Future Roadmap

**Baseline:** 22 November 2026
**Nature of this document:** prioritised proposals based on verified gaps in the current code. Nothing
here is implemented unless it also appears in `FEATURES.md` as **Done**. Dates are deliberately
omitted; order is by risk and dependency, not by calendar.

---

## 1. How to use this roadmap

- **P0** items are correctness or data-trust issues. Fix before adding new surface area.
- **P1** items remove daily friction or close a security/operations gap.
- **P2** items are growth features that need product decisions.
- **P3** items are larger bets that change the architecture.
- Each item states the current behaviour, the target behaviour, and the files likely involved.
- When an item ships, move it to `CHANGELOG.md`, mark it **Done** in `FEATURES.md`, and remove or
  rewrite the entry here.

**Guardrails for every change**

- Keep the no-build-step frontend and the `express`-only dependency set unless a decision explicitly
  changes them.
- Do not redesign the existing UI; extend the tokens and components in `DESIGN_GUIDELINES.md`.
- Preserve integer-pence money, UTC storage, salon-local rendering and soft deactivation.
- Add a migration helper for every schema change; never rewrite existing tables in place.
- Update the relevant document in the same change.

---

## 2. P0 — Correctness and trust

### P0.1 Fix shadowed CSV routes

**Current:** `GET /api/admin/customers/:id` is registered before
`GET /api/admin/customers/export.csv`, and `GET /api/admin/appointments/:id` before
`GET /api/admin/appointments/export.csv`. Express matches the parameterised route first, so both CSV
links return 404. `sales/export.csv` is unaffected.

**Target:** Register static export routes before parameterised routes, or constrain `:id` with a
pattern. Verify each link downloads a file with the expected headers.

**Files:** `server/routes/admin.js`, `public/js/admin.js` (link targets), `docs/FEATURES.md`.

**Acceptance:** All three CSV exports return `200` with `text/csv` and a non-empty header row; a
request for a genuinely unknown ID still returns `404`.

### P0.2 Make breaks reduce availability

**Current:** `shifts.break_min` is stored and subtracted from rostered minutes in utilisation, but
`availability()` treats the whole shift as free. `rota.block_break` exists and is unused. A client
can be booked across a stylist's break, and utilisation can exceed 100%.

**Target:** Split each shift into free windows around a break of `break_min`, at a defined position
(start, middle, or configurable). Either implement `rota.block_break = 1` as the switch or remove
the setting and always block. Apply the same rule to month availability, day availability and
`assertBookable()`.

**Files:** `server/scheduling.js`, `server/db.js` (setting default), `docs/WORKFLOW.md`.

**Acceptance:** A booking that would overlap the break is rejected with `slot_taken` or excluded
from slots; a fully booked day with breaks cannot report utilisation above 100%.

### P0.3 Enforce `services.online_bookable`

**Current:** The column exists, is editable, and is returned by the API, but the public site and
availability engine include every active service.

**Target:** Decide the meaning: hide from the public menu, block online booking, or both. Apply it
consistently in `publicSite()`, `/api/public/services`, availability, and `assertBookable()`. Keep
admin booking able to use non-bookable services if that is the intended distinction.

**Files:** `server/routes/public.js`, `server/scheduling.js`, `public/js/site.js`,
`docs/FEATURES.md`.

**Acceptance:** A service with `online_bookable = 0` cannot be selected or booked online, while the
console behaviour is explicit and documented.

### P0.4 Make package sales attribution and revenue consistent

**Current:** `salesReport()` only counts package purchases whose `sold_by_staff_id` matches a staff
row. Online purchases and sales by users without a linked staff record have `NULL` and disappear
from staff rows and totals, while still appearing in daily package revenue. Service revenue also
uses item prices in staff rows but `paid_pence` in the daily series.

**Target:** Choose one reporting basis and apply it everywhere. Options:

- Attribute online sales to an "Online" pseudo-row and unlinked sales to the signed-in user's name.
- Report package revenue separately from commissionable service revenue.
- Use `paid_pence` consistently, or item value consistently, and label the difference.

**Files:** `server/packages.js`, `server/bookings.js`, `public/js/admin.js`, `docs/WORKFLOW.md`.

**Acceptance:** The sum of staff rows equals the reported total; online and unlinked sales are
visible somewhere; commission is calculated only on the intended base.

### P0.5 Use salon-local boundaries in reports

**Current:** Some dashboard and report filters compare UTC ISO strings (`substr(start_at, 1, 10)`,
`date + 'T00:00Z'`) rather than salon-local day boundaries. Late-evening London appointments can
fall into the next UTC day.

**Target:** Compute day/week/month bounds with the existing timezone helpers (`zonedToUtc`,
`todayIn`, `addDays`) and compare full timestamps. Add tests around a 23:30 London appointment and a
British Summer Time transition.

**Files:** `server/bookings.js`, `server/packages.js`, `server/routes/admin.js`.

**Acceptance:** A booking at 23:30 Europe/London appears on the correct local date in dashboard,
sales and reports; totals match the day list.

### P0.6 Apply or remove quiet hours

**Current:** `whatsapp.quiet_start` and `whatsapp.quiet_end` exist but no code reads them.

**Target:** Either defer `scheduled_for` into the next allowed window before dispatch, or delete the
settings and document that messages send at any hour. If implemented, define behaviour for messages
that become due during quiet hours and for reminders whose window would be missed.

**Files:** `server/whatsapp.js`, `server/db.js`, settings UI, `docs/WORKFLOW.md`.

**Acceptance:** No WhatsApp message is dispatched inside quiet hours in API mode, or the settings no
longer exist and the docs say so.

### P0.7 Decide the loyalty model

**Current:** Points accrue on completion at `loyalty.points_per_pound`, but there is no redemption
endpoint, UI, expiry or liability reporting. The settings screen exposes the accrual rate.

**Target:** Either implement redemption (points-to-value conversion, minimum spend, audit, reversal
on cancellation) or explicitly label the programme as accrual-only and remove the implication that
points can be spent. If redemption is added, define rounding and whether points are refunded when a
completed appointment is later cancelled.

**Files:** `server/bookings.js`, `server/packages.js` or a new loyalty module, `public/js/admin.js`,
`docs/FEATURES.md`.

**Acceptance:** The documented behaviour matches the UI and API; no screen implies an unavailable
redemption path.

---

## 3. P1 — Daily-driver polish and safety

### P1.1 Automated tests and CI

There are no tests, linter or CI configuration. Start with high-value integration tests against a
temporary SQLite file:

- Availability: open/closed days, time off, buffers, notice/horizon, multi-service max buffer.
- Booking: overlap rejection, alternatives, birthday discount, reference uniqueness.
- Status transitions: completion side effects, cancellation waitlist notices.
- Packages: expiry, free-session boundary, redemption discount, completion.
- Auth: role gates for each sensitive route.
- Reporting: local-day boundaries and staff totals reconciliation.

Add a syntax/lint check and run it in CI. Keep the test database isolated with `SALON_DB`.

### P1.2 Schema migration tracking

`ensureColumn()` handles two columns today. Add a `schema_migrations` table and ordered migration
functions so future changes are repeatable and auditable. Test fresh install and upgrade paths.

### P1.3 User administration and password lifecycle

Accounts are seed-only. Add owner-only user management: create, edit role, link to staff, deactivate,
reset password, force sign-out. Add a password-change flow for the signed-in user. Consider a
session version column to invalidate cookies after a password change.

### P1.4 CSRF hardening

The current controls are `SameSite=Lax`, an origin check on mutating admin requests, and JSON-only
bodies. Add a per-session CSRF token or double-submit cookie for defence in depth, especially if
non-JSON form posts are ever introduced.

### P1.5 Scheduled backups and restore drill

`npm run backup` exists but nothing schedules it and there is no restore procedure. Add a documented
schedule (host cron/Task Scheduler), retention policy, integrity check (`PRAGMA integrity_check`),
and a tested restore runbook. Prefer SQLite's online backup API over a raw file copy under WAL.

### P1.6 Public waitlist UI

The API supports joining and notification, but the public site has no form. Add a compact "Can't
find a time?" form on the booking step, with service, date range, optional stylist and consent. Show
a clear confirmation and avoid exposing other clients' entries.

### P1.7 Public reschedule

Clients can cancel but not move an appointment. Add a reschedule flow that reuses `reschedule()`
with the same notice window and phone verification, or explicitly keep cancel-and-rebook and remove
any copy that implies rescheduling is self-service.

### P1.8 Email channel

Add a provider-agnostic adapter (for example nodemailer) behind the existing notification model.
Store channel per notification, honour opt-ins per channel, and keep WhatsApp as the default. Add
templates for confirmation, reminder and cancellation.

### P1.9 Drag-and-drop rota

The rota is form-driven. Add drag-to-move and drag-to-resize with conflict validation on drop. Keep
the form as the accessible fallback and do not bypass `shiftOverlap()`.

### P1.10 Recurring appointments

Add a recurrence rule to the booking model, materialise occurrences with individual references, and
define what happens when one occurrence is moved or cancelled. This affects availability, reporting
and messaging; design before building.

### P1.11 PWA for staff tablets

Add a manifest, icons and a service worker for the console shell. Cache static assets only; never
cache API responses containing client data. Provide an offline "reconnecting" state rather than
pretending writes succeeded.

### P1.12 Calendar sync

Publish an ICS feed per staff member and optionally push to Google Calendar. Treat the app as the
source of truth; imports create conflicts that the current model cannot reconcile.

### P1.13 Accessibility and responsive audit

Run a keyboard and screen-reader pass across the wizard, modals, rota and tables. Verify focus
trapping in modals, error association, table headers, contrast of gold-on-cream text, and touch
target sizes at 375 px. Fix issues in the existing component classes rather than adding new ones.

---

## 4. P2 — Growth features

### P2.1 Online deposits and card payments

Integrate a provider (for example Stripe Checkout) for deposits or full prepayment. Requirements:
idempotent webhook handling, reconciliation against `paid_pence`, refunds, failure states, and a
clear distinction between "deposit recorded" and "deposit charged". This is the largest change to
the booking transaction and needs a state machine.

### P2.2 Gift vouchers and gift cards

Sell and redeem vouchers with a code, balance, expiry and audit trail. Decide whether vouchers are
products, payment methods, or both. Reuse the package purchase/redemption patterns where possible,
but keep liabilities reportable.

### P2.3 Memberships and subscriptions

Recurring plans with monthly billing, included services and rollover rules. Requires a billing
provider, dunning states, and a clear interaction with packages and loyalty.

### P2.4 Two-way WhatsApp inbox

Persist inbound messages, thread them by customer, allow replies from the console, and show delivery
status. Add explicit consent handling and a retention policy. This turns the outbox into a channel
with its own data model and operational load.

### P2.5 Marketing automation

Triggered journeys (first visit, lapsed, birthday, aftercare) with frequency caps and suppression
rules. Build on segments, but add a send log per customer to prevent duplicate campaigns.

### P2.6 Client merge and duplicate management

Phone is the identity key and duplicates are blocked. Add a reviewed merge flow for clients created
with a second number, preserving appointments, packages, notes and consent history.

### P2.7 Inventory and retail

Track retail stock, colour usage and supplier orders. Keep it separate from service pricing; do not
overload `services`.

### P2.8 Payroll and commission runs

Commission is currently a report field. Add pay periods, adjustments, export and lock states. Define
whether package revenue is commissionable before building.

### P2.9 Review request automation and moderation

Send review requests automatically after completion with a delay, track who was asked, and add a
pending/approved state for imported reviews. Keep Google sync optional.

### P2.10 Multi-language and multi-currency

The code assumes English and GBP. Introduce locale and currency settings, format money through a
single helper, and translate message templates. This touches every screen and report.

---

## 5. P3 — Architectural bets

### P3.1 Multi-branch

Per-branch staff, services, rota, pricing, opening hours, reporting and public pages. This changes
almost every table and query; design a branch scope before adding more single-salon features.

### P3.2 Bookable resources beyond staff

Rooms, chairs and equipment with their own calendars and constraints. The current availability
engine is staff-centric; generalising it is a significant refactor.

### P3.3 Native or installable staff app

Only justified if the PWA proves insufficient. Would require an API versioning strategy and a
mobile-friendly auth flow.

### P3.4 Event-driven integrations

Webhooks or an outbox for CRM, accounting and marketing tools. Requires idempotency keys, retries,
and a stable public contract.

---

## 6. Explicitly not planned (for now)

These are reasonable product ideas but conflict with the current scope or architecture. Revisit only
with a deliberate decision:

- A visual page builder or multiple public pages.
- A general-purpose form builder.
- A full accounting ledger.
- A plugin marketplace.
- Real-time collaborative editing.

---

## 7. Suggested order

1. P0.1 CSV routes, P0.5 local dates, P0.4 reporting reconciliation.
2. P0.2 breaks, P0.3 online flag, P0.6 quiet hours, P0.7 loyalty decision.
3. P1.1 tests/CI, P1.2 migrations, P1.5 backups.
4. P1.3 users, P1.4 CSRF.
5. P1.6 waitlist UI, P1.7 reschedule, P1.8 email.
6. P1.9 rota drag-and-drop, P1.10 recurring, P1.11 PWA, P1.12 calendar sync.
7. P2 items in business-value order.
8. P3 only after a written architecture decision.

---

## 8. Definition of done for roadmap work

- [ ] Behaviour matches `WORKFLOW.md`; the document is updated in the same change.
- [ ] New tables/columns/settings are in `DATABASE.md` and have a migration path.
- [ ] New endpoints and UI are in `FEATURES.md`.
- [ ] New tokens or components are in `DESIGN_GUIDELINES.md`.
- [ ] `CHANGELOG.md` has an entry.
- [ ] Works on a fresh database and an upgraded database.
- [ ] Role gates and validation are tested.
- [ ] No new dependency or build step without an explicit decision.
- [ ] Existing public and admin flows still pass their checks.
