# Feature Register

Every feature has an ID so tickets, commits and tests can reference it.
Status legend: **DONE** = shipped in this build, **NEXT** = designed, not built.

---

## A. Public website (website management)

| ID | Feature | Detail | Status |
|---|---|---|---|
| A1 | Live service menu | Categories, name, description, duration, price, "from" pricing, online-bookable flag | DONE |
| A2 | Staff showcase | Name, job title, bio, specialities, colour accent | DONE |
| A3 | Offers & promotions | Banner, title, description, % or £ value, promo code, start/end dates, linked services | DONE |
| A4 | Editable site content | Hero headline, sub-headline, about text, address, phone, email, Instagram, booking policy | DONE |
| A5 | Opening hours display | Per-weekday open/close, "Closed" rendering | DONE |
| A6 | Booking wizard | Service → stylist (or "any") → date → time → details → confirm | DONE |
| A7 | Multi-service basket | Add several treatments; duration and price sum; availability uses total duration | DONE |
| A8 | Booking lookup | Find a booking by reference + phone number | DONE |
| A9 | Self-service cancel | Client cancels own booking before the cut-off window | DONE |
| A10 | Waitlist join | No slot works → join waitlist for a date range | DONE |
| A11 | Responsive + accessible | Mobile-first, keyboard bookable, reduced-motion respected | DONE |
| A12 | SEO basics | Title/meta description from site content, semantic headings, Open Graph tags | DONE |

**Acceptance (A6):** a client can complete a booking in ≤ 6 taps after choosing a service; the confirmation screen shows a reference and a WhatsApp button pre-filled with the details.

## B. Booking engine

| ID | Feature | Detail | Status |
|---|---|---|---|
| B1 | Real availability | Derived from opening hours ∩ staff shift ∩ no time off ∩ no overlap − buffer | DONE |
| B2 | Slot grid | Configurable step (default 15 min), service duration + cleanup buffer | DONE |
| B3 | Any-staff matching | Returns the first stylist free at that time, labelled | DONE |
| B4 | Conflict guard | Server rejects overlapping bookings and out-of-rota slots even if the UI is stale | DONE |
| B5 | Statuses | `pending`, `confirmed`, `arrived`, `completed`, `no_show`, `cancelled` | DONE |
| B6 | Reschedule | Move a booking, re-validating availability | DONE |
| B7 | Deposit tracking | Record amount + method; show balance due | DONE |
| B8 | Booking source | `online`, `phone`, `walkin`, `instagram` for reporting | DONE |
| B9 | Cancellation policy | Per-salon notice window (default 24 h) enforced for client self-service | DONE |
| B10 | Recurring appointments | Repeat every N weeks (max 12) | NEXT |
| B11 | Resources beyond staff | Rooms/chairs as bookable resources | NEXT |

## C. Client book (CRM)

| ID | Feature | Detail | Status |
|---|---|---|---|
| C1 | Client profile | Name, phone (unique), email, DOB, address, tags | DONE |
| C2 | Preferences & safety | Preferred stylist, formula/colour notes, allergies, general notes | DONE |
| C3 | Visit history | Past and upcoming appointments, total spend, visit count, last visit | DONE |
| C4 | Consent flags | `whatsapp_opt_in`, `marketing_opt_in`, consent timestamp | DONE |
| C5 | Dedupe | Phone number is the identity key; booking reuses an existing profile | DONE |
| C6 | Loyalty points | 1 point per £1 on completed visits, redeemable as notes | DONE |
| C7 | Data export/erase | CSV export; hard erase endpoint for GDPR requests | DONE |
| C8 | Segments | "Lapsed 90 days", "VIP", "Colour clients" for campaigns | DONE |

## D. Staff & rota

| ID | Feature | Detail | Status |
|---|---|---|---|
| D1 | Staff record | Name, title, bio, phone, email, colour, employment type, commission % | DONE |
| D2 | Skills matrix | Which services each staff member can perform | DONE |
| D3 | Weekly rota | Shifts per staff per date with start/end time, break, notes | DONE |
| D4 | Copy week | Duplicate a week's shifts forward | DONE |
| D5 | Conflict detection | Overlapping shifts, shift vs approved time off, shift outside opening hours | DONE |
| D6 | Time off | Requests with type (holiday/sick/training), status, approval | DONE |
| D7 | Rota → availability | Approved time off and missing shifts remove bookable slots | DONE |
| D8 | Utilisation report | Booked minutes ÷ rostered minutes per staff per week | DONE |
| D9 | Commission report | Completed revenue × commission % per staff per period | DONE |
| D10 | Drag-and-drop rota | Visual drag of shift blocks | NEXT |

## E. WhatsApp notifications

| ID | Feature | Detail | Status |
|---|---|---|---|
| E1 | Template library | Editable per-salon message bodies with `{{placeholders}}` | DONE |
| E2 | Booking confirmation | Sent on create (online or desk) | DONE |
| E3 | 24h reminder | Auto-queued when a booking is confirmed | DONE |
| E4 | Cancellation notice | To client, and an internal alert to the assigned stylist | DONE |
| E5 | Reschedule notice | Old and new time in one message | DONE |
| E6 | Post-visit thank-you | Queued on `completed`, with review link and rebook nudge | DONE |
| E7 | Waitlist opening | When a slot frees up, notify matching waitlist entries | DONE |
| E8 | Campaign broadcast | Send an offer to a filtered segment, rate-limited | DONE |
| E9 | Outbox | Every message with status `queued → sent → failed`, retry | DONE |
| E10 | Click-to-send | Zero-credential mode: opens `wa.me` deep link with text pre-filled | DONE |
| E11 | Cloud API adapter | If `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` set, send automatically | DONE |
| E12 | Opt-out handling | `STOP` keyword via webhook flips consent off | DONE |
| E13 | Delivery log per client | Timeline on the client profile | DONE |
| E14 | Two-way chat inbox | Read replies inside the app | NEXT |

**Acceptance (E3):** a booking made for tomorrow 10:00 produces a reminder row scheduled for today 10:00 (or booking time + 1 min if that is later) and never sends twice.

## F. Management dashboard

| ID | Feature | Detail | Status |
|---|---|---|---|
| F1 | Today view | Timeline per stylist, colour-coded by status | DONE |
| F2 | KPIs | Today's revenue, bookings, utilisation, no-show rate, new clients | DONE |
| F3 | Quick actions | New booking, block time, mark arrived/complete/no-show | DONE |
| F4 | Reports | Revenue by day/service/staff, top clients, retention | DONE |
| F5 | Audit log | Who changed what, when | DONE |
| F6 | CSV export | Appointments, clients, revenue | DONE |
| F7 | Notifications bell | Unread internal alerts | NEXT |

## G. Platform & security

| ID | Feature | Detail | Status |
|---|---|---|---|
| G1 | Auth | Email + password, scrypt hashing, signed HttpOnly session cookie | DONE |
| G2 | Roles | owner / manager / reception / staff with route guards | DONE |
| G3 | Session expiry | 7 days, sliding renewal, logout everywhere | DONE |
| G4 | Input validation | Every write validated; friendly field errors | DONE |
| G5 | SQL safety | Parameterised statements only | DONE |
| G6 | Rate limiting | Login and public booking endpoints | DONE |
| G7 | Audit trail | `audit_log` rows for every mutation | DONE |
| G8 | Backup | `npm run backup` copies the DB with a timestamp | DONE |
| G9 | Seed data | Realistic demo salon so the UI is never empty | DONE |
| G10 | Timezone safety | All timestamps stored UTC, rendered in salon timezone | DONE |
