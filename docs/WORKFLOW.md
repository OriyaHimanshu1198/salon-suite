# Salon Suite — Workflows and Business Logic

**Baseline:** 22 November 2026
**Scope:** The behaviour implemented in `server/` and `public/js/`. This document is the reference for
"what should happen" when changing or testing a flow.

---

## 1. Actors and entry points

| Actor | Entry point | Authentication |
|---|---|---|
| Client | `/` public site | None |
| Owner / manager / reception / staff | `/admin` | Email + password, signed cookie |
| WhatsApp Cloud API | `/api/webhooks/whatsapp` | Verify token / Meta signature not validated in app |
| Operator | npm scripts, `/health` | Host access |

Time is stored in UTC and interpreted in `salon.timezone` (default `Europe/London`). Dates shown to
users are `en-GB`. Money is integer pence.

---

## 2. Public booking flow

### 2.1 Page boot

1. `site.js` calls `GET /api/public/site`.
2. The response supplies salon identity, content, notice, birthday settings, reviews, packages,
   opening hours, offers, active services, active staff with skill IDs, and categories.
3. The page renders all sections, then binds the wizard and lookup.
4. If the request fails, the wizard body shows "Could not load the salon. Is the server running?".

### 2.2 Step 1 — Services

- Services are filtered by category tabs (`All` plus each category).
- Clicking a service toggles it in the basket.
- Maximum four services (client check; server also enforces `booking.max_services`, default 4).
- Totals:
  - Duration = sum of selected `duration_min`.
  - Price = sum of selected `price_pence`.
  - Buffer used by availability = **maximum** buffer among selected services (not the sum).
- At least one service is required to continue.

### 2.3 Step 2 — Stylist

- Options are "Any available" plus active staff.
- A named stylist is only offered if they can perform **every** selected service; the server also
  filters by `staff_skills`.
- Choosing "any" lets the availability engine assign the first qualified staff member free at each
  start time.

### 2.4 Step 3 — Date and time

Month view:

- `GET /api/public/availability/month?serviceIds=…&staffId=…&month=YYYY-MM`
- Past dates are returned with `count: 0`.
- Each future day is computed by calling the day availability function.
- Days with zero free slots are visually muted and disabled.

Day view:

- `GET /api/public/availability?serviceIds=…&staffId=…&date=YYYY-MM-DD`
- The response contains `date`, `durationMin`, `pricePence`, and `slots`.
- Each slot has `start` (UTC ISO), `end`, `staffId`, `staffName`.
- Slots are de-duplicated by start time; the first qualified staff member wins that time.
- Selecting a slot is required to continue.

### 2.5 Availability algorithm

Implemented in `server/scheduling.js`:

1. Build the service bundle:
   - Unique service IDs.
   - All services must exist and be `active`.
   - `durationMin` = sum of durations.
   - `bufferMin` = max buffer.
   - `pricePence` = sum of prices.
   - `depositPence` = sum of deposits.
2. Find qualified staff:
   - `active = 1`.
   - If a specific `staffId` is requested, that member only.
   - The member must have a `staff_skills` row for **all** selected services.
3. For each staff member:
   - Read shifts for the date.
   - If the member has approved time off covering the date, no windows.
   - Subtract every non-cancelled appointment that overlaps the day.
   - `break_min` is **not** subtracted from availability in the current implementation.
4. Generate candidate starts:
   - Step = `booking.slot_step_minutes` (default 15).
   - Block = duration + buffer.
   - Start must be at least `booking.min_notice_minutes` (default 120) from now.
   - Start must be within `booking.horizon_days` (default 60).
   - The whole block must fit inside a free window.
5. De-duplicate by start time across staff, sort ascending.

Opening hours are checked first: a closed weekday returns no slots. A staff member with no shift
also contributes nothing, even if the salon is open.

### 2.6 Step 4 — Details

Fields:

| Field | Required | Notes |
|---|---|---|
| First name | Yes | Max 60 characters server-side |
| Last name | No | |
| Mobile | Yes | Normalised to digits; 10–15 digits accepted |
| Email | No | Validated when present |
| Date of birth | No | Used for the birthday discount |
| Notes | No | Stored on the appointment |
| Marketing opt-in | Checkbox | Defaults to checked in the public wizard |

The client must choose a slot and provide first name and phone. The browser then posts:

```http
POST /api/public/bookings
{
  "serviceIds": ["svc_cut", "svc_blowdry"],
  "staffId": "any",
  "start": "2026-11-24T10:00:00.000Z",
  "customer": {
    "firstName": "Maya",
    "lastName": "Khan",
    "phone": "07700900121",
    "email": "maya@example.com",
    "dateOfBirth": "1992-11-24",
    "notes": "",
    "marketingOptIn": true
  },
  "notes": ""
}
```

### 2.7 Server-side booking sequence

`createBooking()` in `server/bookings.js`:

1. Build the service bundle.
2. `assertBookable()` re-validates:
   - Valid start time.
   - At least one qualified staff member.
   - Notice window and horizon.
   - Salon open that weekday.
   - A free window fits the full block.
   - On failure, throws 409 with up to six alternative starts where relevant.
3. `upsertCustomer()`:
   - Normalise phone; reject fewer than 10 digits.
   - Reuse the existing customer with that phone.
   - Update supplied name/email/notes/DOB.
   - Otherwise insert a new customer with WhatsApp opt-in default on and marketing opt-in from the
     request.
4. Determine status: `confirmed` when `booking.auto_confirm = 1` (default), else `pending`.
5. Compute birthday discount from the customer DOB and appointment start.
6. In a transaction:
   - `assertNoOverlap()` for the chosen staff member.
   - Insert the appointment.
   - Insert one `appointment_items` row per service, preserving order.
7. Audit `appointment.create`.
8. Queue a booking-confirmation message and a reminder.
9. Create an internal alert for the team.
10. Return the appointment, reference, birthday discount and a WhatsApp link.

Booking reference format: `LS-` plus four characters from an unambiguous alphabet
(`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`).

### 2.8 Step 5 — Confirmation

The confirmation screen shows:

- Success mark and "You're booked".
- Reference (large serif).
- Date, time, stylist, services, duration, total.
- Birthday discount when applied.
- A WhatsApp link when the outbox produced one.
- "Book another" resets the wizard.

The appointment is already persisted; the confirmation step does not call the API again.

---

## 3. Booking lifecycle

### 3.1 Allowed statuses

`pending`, `confirmed`, `arrived`, `completed`, `no_show`, `cancelled`.

`setStatus()` accepts any of these from any current status (apart from a same-status no-op). There is
no enforced transition graph beyond the UI only offering sensible next actions.

### 3.2 Side effects

| New status | Side effects |
|---|---|
| `pending` | Status only |
| `confirmed` | Queue a 24 h reminder if none exists for the appointment |
| `arrived` | Status only |
| `completed` | Queue thank-you if none exists; increment customer visit count; add appointment total to lifetime spend; add loyalty points (`floor(total_pence / 100 × points_per_pound)`); set last visit; if `paid_pence = 0`, set it to the total |
| `no_show` | Internal alert to the team |
| `cancelled` | Set `cancelled_at` and `cancel_reason`; queue cancellation message; internal alert; notify matching waitlist entries |

Every status change writes an audit row `appointment.<status>`.

### 3.3 Reschedule

Admin-only (`PATCH /api/admin/appointments/:id` with `start`, `staffId`, or `serviceIds`):

1. Rebuild the service bundle.
2. Re-run `assertBookable()` for the new time/staff.
3. In a transaction, update start/end/staff and total, delete old items, insert new items.
4. Re-check overlap ignoring the current appointment.
5. Queue a reschedule message and audit.

Current behaviour to be aware of: rescheduling sets `total_pence` to the new bundle price and does
not re-apply the birthday discount.

### 3.4 Payment recording

`POST /api/admin/appointments/:id/payment` with `amountPence` and `method`:

- Adds the amount to `paid_pence` (no upper clamp in `recordPayment`).
- Overwrites `deposit_method` with the chosen method.
- Audits `appointment.payment`.

Deposits are recorded amounts, not charged card transactions.

### 3.5 Client lookup and cancellation

Lookup:

```http
GET /api/public/bookings/LS-ABCD?phone=07700900121
```

- Reference is uppercased.
- Phone is normalised and must match the customer on the booking.
- Returns the full appointment view (items, staff, customer notes, balance).

Cancellation:

```http
POST /api/public/bookings/LS-ABCD/cancel
{ "phone": "07700900121", "reason": "..." }
```

- Already cancelled → `{ ok: true, alreadyCancelled: true }`.
- Online cancellation closes `booking.cancellation_notice_hours` (default 24) before the start.
- Too late → 409 `too_late`.
- Otherwise `setStatus(..., 'cancelled')` and return `refundDue` when a deposit was recorded.
- `refundDue` is informational; no refund is processed.

There is no public reschedule endpoint.

---

## 4. Waitlist

API only; the public site does not currently render a waitlist form.

Join:

```http
POST /api/public/waitlist
{
  "firstName": "Maya",
  "lastName": "Khan",
  "phone": "07700900121",
  "email": "maya@example.com",
  "serviceId": "svc_cut",
  "staffId": null,
  "fromDate": "2026-11-24",
  "toDate": "2026-11-30",
  "notes": ""
}
```

- Reuses a customer by phone or creates one with WhatsApp opt-in on.
- Inserts a `waitlist` row with status `waiting`.
- Queues a `waitlist_joined` message with a custom body (this key is not in the seeded template
  library, so the body is passed directly).

Notification on cancellation:

- `notifyWaitlist()` looks for `waiting` entries whose date range covers the appointment date and
  whose staff is null or the same staff member.
- Takes the five oldest.
- Queues `waitlist_open` for each and marks the entry `notified`.

---

## 5. Admin diary workflows

### 5.1 Dashboard

`GET /api/admin/dashboard?date=YYYY-MM-DD` returns:

- KPIs:
  - Takings = sum of `paid_pence` for completed appointments that day.
  - Projected = sum of `total_pence` for non-cancelled appointments.
  - Bookings = non-cancelled count.
  - Completed and no-show counts.
  - New clients created that date.
  - Utilisation = booked minutes ÷ rostered minutes, where rostered minutes subtract `break_min`.
  - Unread internal alerts (`channel = internal`, `status = queued`).
- The day's appointments, active staff and shifts.
- `birthdays`: customers with a birthday in the next seven days.
- `teamSales`: the staff sales report for that date.

Dashboard actions:

- Previous/next day and date picker.
- New booking.
- Mark arrived, complete, or no-show.
- Open the appointment modal.
- "Send today's wishes" runs the birthday job.

### 5.2 Calendar

- Uses the same dashboard payload.
- One column per active staff member.
- Shows the shift window or "Off".
- Appointment cards are colour-accented by staff colour.
- Clicking a card opens the appointment modal.
- Previous / Today / Next navigation.

### 5.3 New booking modal

1. Optional client search (debounced 250 ms) against `/api/admin/customers?q=…&limit=6`.
2. Selecting a result fills name/phone and records `customerId`.
3. Choose one or more services, a stylist (or any), a date, then a time.
4. Time options come from the public availability endpoint, so desk and online availability cannot
   disagree.
5. Submit posts to `/api/admin/appointments` with source `admin` and status `confirmed`.
6. The server merges the existing customer when `customerId` is supplied.

### 5.4 Appointment modal

Shows client, reference, source, time range, staff, services, total/paid/discount, customer notes,
allergies and formula notes.

Actions:

- Save appointment notes and internal notes (`PATCH /appointments/:id`).
- Record a payment.
- Use a package session when the client has an active package covering one of the appointment's
  services.

Redeeming from the modal:

1. Confirm.
2. `POST /api/admin/package-purchases/:id/redeem` with `appointmentId`.
3. The server checks the package covers at least one appointment service.
4. Covered item value is added to `discount_pence`, subtracted from `total_pence`, and the package
   ID is stored on the appointment.
5. The session is recorded; the package may complete.

---

## 6. Treatment package workflows

### 6.1 Plan model

A plan has:

- Name, description, emoji.
- Covered service IDs (JSON array).
- Paid sessions and free sessions.
- Price and validity days.
- `active` (available to sell) and `online` (visible on the public site).

Derived values in `hydratePlan()`:

- `sessionsTotal = sessions + free_sessions`.
- `valuePence = sum(covered service prices) × sessions`.
- `savingPence = max(0, valuePence − price_pence)`.

Free sessions are always the **last** sessions in the sequence.

### 6.2 Plan administration

- Create: `POST /api/admin/packages`.
- Update: `PATCH /api/admin/packages/:id`.
- Deactivate: `DELETE /api/admin/packages/:id` sets `active = 0`, `online = 0`.
  Existing purchases continue to work.
- Only owner/manager can manage plans.

### 6.3 Online purchase (reservation)

`POST /api/public/packages/:planId/purchase`:

1. Requires first name, phone, optional email.
2. Plan must exist, be active, and be `online`.
3. Customer is found by phone or created.
4. Purchase is created with:
   - `status = active`
   - `channel = online`
   - `paid_pence = 0`
   - `sold_by_staff_id = null`
   - `expires_at` = the salon date plus `validity_days`, stored at `23:59:59.000Z` (UTC).
5. Queue `package_purchased`.
6. Internal alert to the team.
7. Audit `package.purchase`.
8. Response includes `PKG-XXXX` reference and a compact purchase summary.

The public form hides its actions and shows a success panel. Payment is taken in the salon.

### 6.4 In-salon sale

`POST /api/admin/package-purchases`:

- Requires `planId` and either `customerId` or customer details.
- Channel is `staff`.
- `soldByStaffId` = supplied value or the signed-in user's linked staff ID.
- `soldByUserId` = signed-in user.
- Optional `paidPence` and notes.
- Same purchase, message, alert and audit path.

Because owners/managers/reception may not have a linked staff record, their sales can have
`sold_by_staff_id = null` and will not appear in per-staff sales totals.

### 6.5 Payment

`POST /api/admin/package-purchases/:id/payment`:

- Adds the amount, capped at the plan price (`MIN(price_pence, paid_pence + amount)`).
- Appends "£amount method" to notes.
- Audits `package.payment`.

### 6.6 Redemption

`POST /api/admin/package-purchases/:id/redeem` with optional `appointmentId`:

1. Expire stale purchases first.
2. Require `status = active`, sessions remaining, and not past expiry.
3. If an appointment is supplied, at least one appointment item must use a covered service.
4. `sessionNo = sessions_used + 1`; `isFree = sessionNo > plan.sessions`.
5. In a transaction:
   - Increment `sessions_used`.
   - Insert a `package_redemptions` row.
   - If linked to an appointment, discount the covered item value and reduce the total.
   - Mark the purchase `completed` when all sessions are used.
6. If this was the first free session, queue `package_free_ready`.
7. If the package completed, queue `package_complete` and send an internal alert.
8. Audit `package.redeem`.

### 6.7 Expiry

`expirePurchases()` runs lazily whenever purchases are listed, fetched, checked for usability, or
redeemed:

```sql
UPDATE package_purchases
SET status = 'expired'
WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < now
```

There is no separate scheduled expiry job.

### 6.8 Cancellation

`POST /api/admin/package-purchases/:id/cancel`:

- Sets `status = cancelled`.
- Appends the reason to notes.
- Sessions already used remain used.
- Owner/manager only.

---

## 7. Birthday workflow

### 7.1 Public promotion

`GET /api/public/site` includes:

```json
{
  "birthday": { "enabled": true, "percent": 15, "windowDays": 7 }
}
```

The public page shows the birthday band only when enabled and percent is non-zero.

### 7.2 Automatic booking discount

`birthdayPercent(dob, startIso)`:

1. Return 0 if disabled or no DOB.
2. Read percentage and window days.
3. Convert the appointment start to a salon date.
4. Compare the month-day of the DOB against every date from `−windowDays` to `+windowDays`.
5. Return the percentage on a match, else 0.

`createBooking()` applies `round(bundle.price × percent / 100)` as `discount_pence` and reduces
`total_pence`. The discount is shown on the confirmation and appointment modal.

### 7.3 Daily WhatsApp job

`runBirthdayJob()`:

- Exits if disabled.
- Unless forced, runs at most once per salon day (`birthday.last_run`).
- Selects customers whose DOB month-day is today **and** who have both
  `whatsapp_opt_in = 1` and `marketing_opt_in = 1`.
- Skips anyone who already has a `birthday_offer` notification created this calendar year.
- Queues `birthday_offer` with first name, discount percentage, booking URL and salon name.
- Stores `birthday.last_run`.

The server calls it at startup and every 60 seconds. The dashboard button calls
`POST /api/admin/birthdays/run`; passing `force: true` bypasses the once-per-day guard.

### 7.4 Birthday lists

- `upcomingBirthdays(days)` — dashboard card for the next N days.
- `birthdaysInMonth(month)` — customers with a birthday in a given `MM`.

---

## 8. Reviews workflow

### 8.1 Public display

`publicSite()` selects reviews where:

- `featured = 1`
- `rating >= reviews.min_rating` (default 4)

Ordered by `sort_order`, then newest `reviewed_at`.

The response includes:

- `headline` (default "Loved on Google").
- `googleUrl`.
- `average` rounded to one decimal.
- `count`.
- `items`.

The section is hidden when no reviews qualify.

### 8.2 Curation

Owner/manager can:

- Add a review (author, rating 1–5, body, date, source, featured).
- Edit any field.
- Delete.
- Toggle "Show on the website" via `featured`.

### 8.3 Google Places sync

`POST /api/admin/reviews/sync`:

- Requires `GOOGLE_PLACES_API_KEY` and `reviews.google_place_id`.
- Without them, returns `{ configured: false, synced: 0, message: ... }` and changes nothing.
- With them, calls the Places API v1 place endpoint with a field mask for reviews/rating/count.
- For each review:
  - Match on `source = google`, `author`, `body`.
  - Existing: update rating and date.
  - New: insert as featured, sort order 99.
- Returns `synced`, `configured`, `average`, `total`.
- Audits `review.sync`.

---

## 9. Website content, notice, offers and social links

### 9.1 Site content

`PATCH /api/admin/site` accepts `{ content: { key: string } }` (or a flat object). Every string value
is upserted into `site_content`, capped at 4,000 characters. The response is the full public site
payload.

Editable keys in the console:

`hero_kicker`, `hero_title` (allows `<em>`), `hero_sub`, `about_title`, `about_body`, `address`,
`phone`, `email`, `booking_policy`, `footer_note`, plus the six social keys.

### 9.2 Notice bar

`PATCH /api/admin/notice` maps:

| Body field | Setting |
|---|---|
| `active` | `site.notice_active` (`1`/`0`) |
| `text` | `site.notice_text` |
| `link` | `site.notice_link` |
| `linkText` | `site.notice_link_text` |
| `tone` | `site.notice_tone` (`gold` or `plum`) |

Strings are capped at 300 characters. The public bar only shows when active and text is non-empty.
Dismissal is per message text in `localStorage`.

### 9.3 Opening hours

`PATCH /api/admin/hours` accepts an array of `{ weekday, closed, open, close }`.

- Weekday 0–6 only.
- Closed days store null times.
- Upserts one row per weekday.
- Availability reads these rows for the salon's opening window.

### 9.4 Offers

CRUD at `/api/admin/offers`.

Fields: title, description, kind (`percent`, `amount`, `freebie`), value, code, start/end dates,
banner, emoji, active, linked service IDs.

Public payload includes only active offers whose date window contains today, with `serviceIds`.

### 9.5 Social links

Stored as site content keys: `instagram`, `facebook`, `tiktok`, `google`, `youtube`, `whatsapp`.

`site.js` converts handles to URLs and omits empty keys. Full URLs are respected for Facebook,
TikTok, Google and YouTube; Instagram and WhatsApp always use handle/number construction.

---

## 10. Client management

### 10.1 List and segments

`GET /api/admin/customers?q=&segment=&limit=`:

| Segment | Predicate |
|---|---|
| `all` | Everyone |
| `vip` | `tags LIKE '%VIP%'` |
| `colour` | `tags LIKE '%Colour%'` or formula notes present |
| `nails` | `tags LIKE '%Nails%'` |
| `new` | Created in the last 30 days |
| `lapsed` | Last visit older than 90 days |
| `marketing` | `marketing_opt_in = 1` |
| `consent` | `whatsapp_opt_in = 0` |

Search matches first name, last name, phone or email. Default limit 200, maximum 500.

### 10.2 Create and update

- First name and phone required; phone normalised.
- Duplicate phone returns 409 `duplicate_phone`.
- Updates can change name, phone, email, DOB, address, tags, preferred staff, allergies, formula
  notes, notes, WhatsApp consent and marketing consent.
- Changing either consent flag refreshes `consent_at`.

### 10.3 Client detail

Returns:

- Customer record plus preferred staff name.
- Appointments newest first, each with items, local date and time.
- Last 30 notifications.
- The next upcoming non-cancelled appointment.

The client modal adds package purchases and a "Sell a package" shortcut.

### 10.4 GDPR erase

Owner only. In one transaction:

1. Delete the client's notifications.
2. Delete their waitlist entries.
3. Delete appointment items for their appointments.
4. Delete their appointments.
5. Delete the customer.

Audit `customer.erase` with detail "GDPR erasure".

### 10.5 CSV export

The console links to `/api/admin/customers/export.csv`. The intended columns are first/last name,
phone, email, tags, visits, spend, last visit, WhatsApp opt-in, marketing opt-in.

**Current issue:** the parameterised `GET /customers/:id` route is registered first, so the export
URL is matched as an ID and returns 404. See `FUTURE_ROADMAP.md`.

---

## 11. Team and rota

### 11.1 Staff records

Fields: name, title, bio, phone, email, colour, employment type (`full_time`, `part_time`,
`freelance`), commission %, active, sort order, service skills.

- Create/update/deactivate: owner/manager.
- Deactivate sets `active = 0`; it does not delete history.
- A staff member may have a linked user account; the team view shows the login email when present.

### 11.2 Weekly rota

`GET /api/admin/rota?week=YYYY-MM-DD`:

- Week starts Monday.
- Returns seven dates, active staff with shifts and time off, conflict warnings, and opening hours.

Shift create/update:

- Start must be before end.
- Staff must exist.
- Overlapping shifts for the same person/date are rejected (409 `shift_overlap`).
- Break minutes and notes are stored.

Shift delete:

- Allowed even when bookings exist, but the response includes a warning listing affected booking
  references.
- Audit `rota.delete`.

Copy week:

- Copies shifts from one Monday-start week to another.
- Preserves weekday offset.
- Skips a shift when the same staff/date/start already exists.
- Returns `copied` and `skipped`.

Apply pattern:

- Looks at the previous 28 days of shifts.
- For each active staff member, takes the earliest start, latest end, and weekdays worked.
- Creates missing shifts for the target week with a 30-minute break and note "From pattern".

### 11.3 Time off

- Any authenticated user can request; `staff` requests are forced to `pending`, others default to
  `approved` unless a status is supplied.
- End date must be on or after start date.
- Response lists shifts that clash with the leave.
- Owner/manager can set `pending`, `approved`, or `declined`.
- Only approved leave removes availability.

### 11.4 Conflict detection

`rotaConflicts(weekStart, weekEnd)` reports:

| Code | Meaning |
|---|---|
| `shift_overlap` | Two shifts for the same person overlap |
| `timeoff_overlap` | A shift falls on approved leave |
| `outside_hours` | A shift starts before opening or ends after closing |
| `unrostered_booking` | An appointment is not fully contained in a shift |

Warnings are advisory; only overlapping shift creation is blocked.

### 11.5 Effect on availability

Availability uses shifts and approved time off. It does **not** currently carve out `break_min`, so
a client can be booked across a stylist's break.

---

## 12. Messaging workflows

### 12.1 Template rendering

- Templates live in `message_templates` with `key`, `name`, `body`, `enabled`.
- `{{placeholder}}` is replaced when the variable exists; unknown placeholders remain visible.
- Seeded templates: booking confirmation, reminder, cancellation, reschedule, thank-you, waitlist
  slot, offer broadcast, payment receipt, birthday offer, package purchased, free session ready,
  package complete.

### 12.2 Outbox

`queue()` inserts a notification row with:

- Customer/appointment links.
- Channel (`whatsapp` or `internal`).
- Template key.
- Recipient phone.
- Rendered body.
- Status `queued`.
- Scheduled time (now by default).
- A `wa.me` link for WhatsApp rows (built even when API mode is active).

Internal alerts use channel `internal`, template `internal_alert`, no phone and no link.

### 12.3 Automatic messages

| Trigger | Template | Timing |
|---|---|---|
| Booking created | `booking_confirmed` | Immediately |
| Booking created | `reminder_24h` | `start − whatsapp.reminder_hours` (default 24), but never earlier than now + 1 minute |
| Status confirmed | `reminder_24h` | If no reminder exists |
| Status cancelled | `booking_cancelled` | Immediately, plus internal alert and waitlist notices |
| Reschedule | `booking_rescheduled` | Immediately |
| Status completed | `thank_you` | Immediately, once |
| Package purchased | `package_purchased` | Immediately |
| First free package session | `package_free_ready` | Immediately |
| Package completed | `package_complete` | Immediately, plus internal alert |
| Birthday job | `birthday_offer` | Daily |
| Broadcast | `offer_broadcast` | Immediately queued |

### 12.4 Delivery modes

`whatsappMode()`:

- `api` only when the setting is `api` **and** `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID` exist.
- Otherwise `link`.

Link mode:

- `sendNotification()` returns `{ status: 'manual', link }`.
- The console shows a "WhatsApp ↗" link and a "Mark sent" button.

API mode:

- Sends a text message through the Graph API.
- On success: status `sent`, `sent_at`, attempts +1.
- On failure: attempts +1; retry scheduled with backoff `[2, 10, 60, 360, 1440]` minutes; status
  becomes `failed` at five attempts and an internal alert is created.

`dispatchDue()` runs every 60 seconds in API mode, sending up to 25 due queued WhatsApp messages.

### 12.5 Broadcast

`POST /api/admin/broadcast` with optional `offerId` and `segment` (default `marketing`):

1. Load the offer if supplied.
2. Select customers in the segment; all segment queries also require `whatsapp_opt_in = 1`.
3. Render `offer_broadcast` per customer with offer title, description, code line, salon name and
   booking URL.
4. Queue each message.
5. Return `queued` and `audience`.

Segments:

| Key | Audience |
|---|---|
| `all` | Everyone with WhatsApp opt-in |
| `marketing` | WhatsApp + marketing opt-in |
| `vip` | Tag contains `VIP` |
| `lapsed` | Last visit older than 90 days |
| `new` | Created in the last 30 days |
| `colour` | Colour tag or formula notes |
| `nails` | Nails tag |
| `birthday_month` | Birthday in the current month |

Limit: 200 customers per segment call.

### 12.6 Inbound webhook

`POST /api/webhooks/whatsapp` reads messages from the Meta payload and calls `handleInbound()`:

- Normalise the sender phone (strip non-digits, leading `44` → `0`).
- Find the customer.
- `STOP`, `UNSUBSCRIBE`, `CANCEL` → turn off WhatsApp and marketing consent, update consent time.
- `START`, `YES`, `SUBSCRIBE` → turn WhatsApp consent on.
- Anything else is logged as handled but not stored as a conversation.

The GET webhook verifies `hub.mode=subscribe` and the configured verify token.

### 12.7 Outbox administration

- Filter by status (`queued`, `sent`, `failed`).
- Open the pre-filled WhatsApp link.
- Mark sent manually.
- Retry failed messages (resets attempts, error and schedule).
- Edit template bodies.
- Queue broadcasts.

Quiet-hour settings exist but are not applied.

---

## 13. Sales and reporting

### 13.1 Staff sales report

`GET /api/admin/sales?date=` or `?from=&to=`:

- Completed appointment items drive service revenue.
- Completed appointments drive appointment counts.
- Non-cancelled package purchases drive package revenue.
- Rows are built for active staff only.
- Per staff:
  - `serviceRevenue` = sum of item prices.
  - `packageRevenue` = sum of `paid_pence` for purchases where `sold_by_staff_id` matches.
  - `totalRevenue` = service + package.
  - `commissionPence` = service revenue × commission % (packages are not commissioned here).
  - Service breakdown and package list.
- Totals sum the staff rows.
- Daily series:
  - Service revenue uses completed appointment `paid_pence`.
  - Package revenue uses all non-cancelled purchases, including online ones.

Known consequence: online package purchases and sales by users without a linked staff record appear
in the daily series but not in staff rows or totals.

### 13.2 Period report

`GET /api/admin/reports?from=&to=` (default last 30 days):

- Totals: revenue (completed `paid_pence`), bookings, completed, cancelled, no-shows, average ticket,
  utilisation.
- Revenue by day.
- Revenue and visits by staff.
- Top 10 services by item revenue.
- Top 8 clients by spend.
- Utilisation = completed booked minutes ÷ rostered minutes.

### 13.3 Dashboard team sales

The dashboard calls the staff sales report for the selected date and renders services, packages and
total per active staff member.

### 13.4 CSV exports

| Export | Endpoint | Status |
|---|---|---|
| Sales by staff | `GET /api/admin/sales/export.csv` | Works |
| Appointments | `GET /api/admin/appointments/export.csv` | Intended, currently shadowed by `/appointments/:id` |
| Clients | `GET /api/admin/customers/export.csv` | Intended, currently shadowed by `/customers/:id` |

---

## 14. Settings workflow

- `GET /api/admin/settings` returns all settings merged with defaults, minus `session.secret`, plus
  WhatsApp mode/configured flags and site URL.
- `PATCH /api/admin/settings` is owner-only.
- Only keys present in `SETTING_DEFAULTS` are accepted.
- `session.secret` is always skipped.

Settings that materially change behaviour:

| Key | Effect |
|---|---|
| `salon.name`, `salon.timezone`, `salon.currency`, `salon.country_code` | Identity, time rendering, WhatsApp number formatting |
| `booking.slot_step_minutes` | Availability granularity |
| `booking.min_notice_minutes` | Earliest online booking |
| `booking.horizon_days` | Furthest online booking |
| `booking.cancellation_notice_hours` | Online cancellation cutoff |
| `booking.auto_confirm` | Confirmed vs pending on create (not exposed in the settings UI) |
| `booking.max_services` | Public booking cap |
| `rota.block_break` | Stored, currently unused |
| `whatsapp.mode`, `whatsapp.reminder_hours`, `whatsapp.sender_name` | Messaging behaviour |
| `whatsapp.quiet_start`, `whatsapp.quiet_end` | Stored, currently unused |
| `reviews.*` | Public review section and Google sync |
| `loyalty.points_per_pound` | Points accrued on completion |
| `site.notice_*` | Notice bar |
| `packages.enabled`, `packages.headline` | Public package section |
| `birthday.enabled`, `birthday.discount_pct`, `birthday.window_days`, `birthday.last_run` | Birthday promotion and job |

The console's Settings view exposes a subset: salon identity, booking rules (except auto-confirm),
WhatsApp mode/reminder/sender, loyalty/reviews/packages, and birthday. Other defaults are reachable
through the API.

---

## 15. Error and edge-case reference

| Situation | Response |
|---|---|
| Missing/invalid fields | 422 `validation_failed` with `fields` |
| Not signed in | 401 `unauthorised` |
| Role cannot perform action | 403 `forbidden` |
| Unknown record | 404 `not_found` |
| Slot taken / no longer bookable | 409 `slot_taken`, often with `alternatives` |
| Too soon / too far / closed / no qualified staff | 409 `too_soon`, `too_far`, `closed`, `no_staff` |
| Too late to cancel online | 409 `too_late` |
| Duplicate phone | 409 `duplicate_phone` |
| Package unavailable/used/expired | 409 `package_unavailable`, `package_used`, `package_expired` |
| Package does not cover appointment services | 422 `service_not_covered` |
| Rate limit exceeded | 429 `rate_limited` with `Retry-After` |
| Unexpected server error | 500 `server_error`, generic message |

Additional edge cases:

- A booking for a service with no qualified staff is rejected with `no_staff`.
- A stale browser can submit a slot that has since been taken; the transaction re-check returns
  `slot_taken`.
- An appointment can be marked completed without payment; completion then records the full total as
  paid if nothing was paid.
- A package can be redeemed without an appointment; the session is consumed with no appointment
  discount.
- A plan can be deactivated while purchases remain active; those purchases still redeem until
  expiry or completion.
- Deleting a shift does not cancel its bookings; it returns a warning listing them.
- Erasing a client removes their appointment history; this is the only hard delete of appointments.
