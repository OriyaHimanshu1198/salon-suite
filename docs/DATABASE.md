# Salon Suite — Database Reference

**Engine:** SQLite through Node's built-in `node:sqlite` (`DatabaseSync`)
**File:** `data/salon.db` by default; override with `SALON_DB`
**Baseline:** 22 November 2026
**Schema source:** `server/db.js`

---

## 1. Connection and pragmas

```js
new DatabaseSync(DB_PATH)
PRAGMA journal_mode = WAL
PRAGMA foreign_keys = ON
PRAGMA busy_timeout = 5000
```

- WAL means `salon.db-wal` and `salon.db-shm` may exist beside the database.
- Foreign keys are enforced, so deletion rules below matter.
- Schema creation uses `CREATE TABLE IF NOT EXISTS` and runs on every boot.
- Two columns are added by an ad-hoc migration if missing:
  `appointments.discount_pence` and `appointments.package_purchase_id`.
- There is no migration-version table. New columns should be added with the same
  `ensureColumn(table, column, ddl)` helper in `server/db.js`.
- The database is opened once per process; queries use prepared statements via
  `q`, `q1`, `run`, and transactions via `tx()` (`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`).

---

## 2. Entity relationship overview

```
staff ──< users (optional staff_id)
  │
  ├──< staff_skills >── services
  ├──< shifts
  ├──< time_off
  └──< appointments >── customers
        │                  │
        ├──< appointment_items >── services
        ├──< notifications (optional)
        └──< package_redemptions (optional)

package_plans ──< package_purchases >── customers
                       │
                       └──< package_redemptions

offers ──< offer_services >── services

customers ──< waitlist
customers ──< notifications
customers ──< appointments

settings        (key/value)
site_content    (key/value)
message_templates (key/value rows)
opening_hours   (one row per weekday)
reviews         (standalone)
audit_log       (standalone)
```

Cardinality in words:

- One staff member has many shifts, time-off rows, appointments and skills.
- One customer has many appointments, notifications, waitlist entries and package purchases.
- One appointment has many appointment items (one per service booked).
- One package plan has many purchases; one purchase has many redemptions.
- A redemption optionally points at an appointment; an appointment optionally records the package
  purchase that discounted it.
- Services relate to staff through `staff_skills` and to offers through `offer_services`.

---

## 3. Tables

### 3.1 `staff`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `stf_…` |
| `name` | TEXT | NOT NULL | |
| `title` | TEXT | NOT NULL, `'Stylist'` | Job title shown publicly |
| `bio` | TEXT | NOT NULL, `''` | |
| `phone` | TEXT | NOT NULL, `''` | |
| `email` | TEXT | NOT NULL, `''` | |
| `colour` | TEXT | NOT NULL, `'#C084FC'` | Accent used in UI and rota |
| `employment_type` | TEXT | NOT NULL, `'full_time'` | `full_time`, `part_time`, `freelance` |
| `commission_pct` | REAL | NOT NULL, `0` | Used by staff sales report |
| `active` | INTEGER | NOT NULL, `1` | Deactivation is `0`, never delete |
| `sort_order` | INTEGER | NOT NULL, `0` | |
| `created_at` | TEXT | NOT NULL | UTC ISO |

### 3.2 `users`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `usr_…` |
| `email` | TEXT | NOT NULL, UNIQUE | Login identity |
| `password_hash` | TEXT | NOT NULL | `scrypt$<salt>$<hash>` |
| `name` | TEXT | NOT NULL | Display name |
| `role` | TEXT | NOT NULL, CHECK `owner`/`manager`/`reception`/`staff` | |
| `staff_id` | TEXT | FK `staff(id)` ON DELETE SET NULL | Links login to a stylist |
| `active` | INTEGER | NOT NULL, `1` | Checked at login |
| `last_login_at` | TEXT | nullable | Updated on login |
| `created_at` | TEXT | NOT NULL | |

No user-management UI exists; accounts come from the seed.

### 3.3 `services`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `svc_…` |
| `name` | TEXT | NOT NULL | |
| `category` | TEXT | NOT NULL, `'Hair'` | Public tab grouping |
| `description` | TEXT | NOT NULL, `''` | |
| `duration_min` | INTEGER | NOT NULL | Summed for a multi-service booking |
| `buffer_min` | INTEGER | NOT NULL, `10` | **Maximum** buffer is used for availability |
| `price_pence` | INTEGER | NOT NULL | Integer pence |
| `deposit_pence` | INTEGER | NOT NULL, `0` | Recorded, not charged online |
| `online_bookable` | INTEGER | NOT NULL, `1` | Stored but not enforced by public availability |
| `active` | INTEGER | NOT NULL, `1` | Inactive services are hidden |
| `sort_order` | INTEGER | NOT NULL, `0` | |
| `created_at` | TEXT | NOT NULL | |

### 3.4 `staff_skills`

| Column | Type | Constraints |
|---|---|---|
| `staff_id` | TEXT | FK `staff(id)` ON DELETE CASCADE, PK part |
| `service_id` | TEXT | FK `services(id)` ON DELETE CASCADE, PK part |

Composite primary key `(staff_id, service_id)`. A staff member must have rows for **every** service
in a booking to be offered for it.

### 3.5 `customers`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `cus_…` |
| `first_name` | TEXT | NOT NULL | |
| `last_name` | TEXT | NOT NULL, `''` | |
| `phone` | TEXT | NOT NULL, UNIQUE | Digits only; identity key |
| `email` | TEXT | NOT NULL, `''` | |
| `dob` | TEXT | nullable | `YYYY-MM-DD`; drives birthday logic |
| `address` | TEXT | NOT NULL, `''` | |
| `tags` | TEXT | NOT NULL, `''` | Comma-separated (`VIP,Colour`) |
| `preferred_staff_id` | TEXT | FK `staff(id)` ON DELETE SET NULL | |
| `allergies` | TEXT | NOT NULL, `''` | |
| `formula_notes` | TEXT | NOT NULL, `''` | Colour formulas |
| `notes` | TEXT | NOT NULL, `''` | |
| `whatsapp_opt_in` | INTEGER | NOT NULL, `1` | |
| `marketing_opt_in` | INTEGER | NOT NULL, `0` | |
| `consent_at` | TEXT | nullable | Refreshed when either consent flag changes |
| `loyalty_points` | INTEGER | NOT NULL, `0` | Accrued, never redeemed |
| `total_spend_pence` | INTEGER | NOT NULL, `0` | Updated on completion |
| `visit_count` | INTEGER | NOT NULL, `0` | Updated on completion |
| `last_visit_at` | TEXT | nullable | Updated on completion |
| `created_at` | TEXT | NOT NULL | |

### 3.6 `appointments`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `apt_…` |
| `reference` | TEXT | NOT NULL, UNIQUE | `LS-XXXX` |
| `customer_id` | TEXT | NOT NULL, FK `customers(id)` | No cascade; GDPR erase handles children |
| `staff_id` | TEXT | NOT NULL, FK `staff(id)` | No cascade |
| `start_at` | TEXT | NOT NULL | UTC ISO |
| `end_at` | TEXT | NOT NULL | UTC ISO |
| `status` | TEXT | NOT NULL, `'confirmed'`, CHECK `pending`/`confirmed`/`arrived`/`completed`/`no_show`/`cancelled` | |
| `source` | TEXT | NOT NULL, `'online'`, CHECK `online`/`phone`/`walkin`/`instagram`/`admin` | |
| `total_pence` | INTEGER | NOT NULL, `0` | After discount |
| `deposit_pence` | INTEGER | NOT NULL, `0` | Recorded amount |
| `deposit_method` | TEXT | NOT NULL, `''` | Overwritten by payment recording |
| `paid_pence` | INTEGER | NOT NULL, `0` | Accumulates payments |
| `notes` | TEXT | NOT NULL, `''` | Client-visible notes |
| `internal_notes` | TEXT | NOT NULL, `''` | Staff-only |
| `cancelled_at` | TEXT | nullable | |
| `cancel_reason` | TEXT | NOT NULL, `''` | |
| `reminder_sent_at` | TEXT | nullable | |
| `created_by` | TEXT | nullable | User or staff id |
| `created_at` | TEXT | NOT NULL | |
| `updated_at` | TEXT | NOT NULL | |
| `discount_pence` | INTEGER | NOT NULL, `0` | Added by migration |
| `package_purchase_id` | TEXT | nullable | Added by migration; **no FK declared** |

Indexes:

- `idx_appt_staff_time (staff_id, start_at)`
- `idx_appt_customer (customer_id, start_at)`
- `idx_appt_status (status, start_at)`

### 3.7 `appointment_items`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `itm_…` |
| `appointment_id` | TEXT | NOT NULL, FK `appointments(id)` ON DELETE CASCADE | |
| `service_id` | TEXT | NOT NULL, FK `services(id)` | No cascade |
| `name_snapshot` | TEXT | NOT NULL | Preserves the service name at booking time |
| `duration_min` | INTEGER | NOT NULL | Snapshot |
| `price_pence` | INTEGER | NOT NULL | Snapshot |
| `sort_order` | INTEGER | NOT NULL, `0` | Booking order |

Index: `idx_items_appt (appointment_id)`.

### 3.8 `shifts`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `sft_…` |
| `staff_id` | TEXT | NOT NULL, FK `staff(id)` ON DELETE CASCADE | |
| `work_date` | TEXT | NOT NULL | `YYYY-MM-DD` |
| `start_time` | TEXT | NOT NULL | `HH:MM` salon-local |
| `end_time` | TEXT | NOT NULL | `HH:MM` salon-local |
| `break_min` | INTEGER | NOT NULL, `0` | Used in utilisation, **not** availability |
| `notes` | TEXT | NOT NULL, `''` | |
| `created_at` | TEXT | NOT NULL | |

Unique `(staff_id, work_date, start_time)`; index `idx_shifts_date (work_date)`.

### 3.9 `time_off`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `tof_…` |
| `staff_id` | TEXT | NOT NULL, FK `staff(id)` ON DELETE CASCADE | |
| `start_date` | TEXT | NOT NULL | Inclusive |
| `end_date` | TEXT | NOT NULL | Inclusive |
| `type` | TEXT | NOT NULL, `'holiday'` | Free text (`holiday`, `training`, …) |
| `reason` | TEXT | NOT NULL, `''` | |
| `status` | TEXT | NOT NULL, `'approved'` | `pending`, `approved`, `declined` |
| `created_at` | TEXT | NOT NULL | |

Only `approved` rows remove availability.

### 3.10 `opening_hours`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `weekday` | INTEGER | PK | `0` Sunday … `6` Saturday |
| `open_time` | TEXT | nullable | `HH:MM` |
| `close_time` | TEXT | nullable | `HH:MM` |
| `closed` | INTEGER | NOT NULL, `0` | `1` means closed |

One row per weekday; seeded with Sunday closed.

### 3.11 `site_content`

| Column | Type | Constraints |
|---|---|---|
| `key` | TEXT | PK |
| `value` | TEXT | NOT NULL, `''` |

Known keys: `hero_kicker`, `hero_title`, `hero_sub`, `about_title`, `about_body`, `address`, `phone`,
`email`, `instagram`, `facebook`, `tiktok`, `google`, `youtube`, `whatsapp`, `booking_policy`,
`footer_note`, `review_url`. Any additional key is accepted by the API and ignored by the renderer.

### 3.12 `offers`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `off_…` |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | NOT NULL, `''` | |
| `kind` | TEXT | NOT NULL, `'percent'` | `percent`, `amount`, `freebie` |
| `value` | REAL | NOT NULL, `0` | Percent or pounds, depending on kind |
| `code` | TEXT | NOT NULL, `''` | Promo code |
| `starts_on` | TEXT | nullable | `YYYY-MM-DD` |
| `ends_on` | TEXT | nullable | `YYYY-MM-DD` |
| `banner` | TEXT | NOT NULL, `''` | |
| `emoji` | TEXT | NOT NULL, `'✨'` | |
| `active` | INTEGER | NOT NULL, `1` | |
| `created_at` | TEXT | NOT NULL | |

### 3.13 `offer_services`

| Column | Type | Constraints |
|---|---|---|
| `offer_id` | TEXT | FK `offers(id)` ON DELETE CASCADE, PK part |
| `service_id` | TEXT | FK `services(id)` ON DELETE CASCADE, PK part |

### 3.14 `message_templates`

| Column | Type | Constraints / default |
|---|---|---|
| `key` | TEXT | PK |
| `name` | TEXT | NOT NULL |
| `body` | TEXT | NOT NULL |
| `enabled` | INTEGER | NOT NULL, `1` |

Seeded keys are listed in §6.3.

### 3.15 `notifications`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `ntf_…` |
| `customer_id` | TEXT | FK `customers(id)` ON DELETE SET NULL | |
| `appointment_id` | TEXT | FK `appointments(id)` ON DELETE SET NULL | |
| `channel` | TEXT | NOT NULL, `'whatsapp'` | `whatsapp` or `internal` |
| `template_key` | TEXT | NOT NULL | |
| `to_phone` | TEXT | NOT NULL | Empty for internal alerts |
| `body` | TEXT | NOT NULL | Rendered message |
| `status` | TEXT | NOT NULL, `'queued'` | Stored: `queued`, `sent`, `failed`. Link mode returns `manual` without changing the row |
| `scheduled_for` | TEXT | NOT NULL | UTC ISO |
| `sent_at` | TEXT | nullable | |
| `attempts` | INTEGER | NOT NULL, `0` | |
| `last_error` | TEXT | NOT NULL, `''` | |
| `wa_link` | TEXT | NOT NULL, `''` | Click-to-send URL |
| `created_at` | TEXT | NOT NULL | |

Index `idx_notif_due (status, scheduled_for)` supports dispatch.

### 3.16 `waitlist`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `wat_…` |
| `customer_id` | TEXT | NOT NULL, FK `customers(id)` ON DELETE CASCADE | |
| `service_id` | TEXT | FK `services(id)` ON DELETE SET NULL | |
| `staff_id` | TEXT | FK `staff(id)` ON DELETE SET NULL | Null means any |
| `from_date` | TEXT | NOT NULL | |
| `to_date` | TEXT | NOT NULL | |
| `notes` | TEXT | NOT NULL, `''` | |
| `status` | TEXT | NOT NULL, `'waiting'` | `waiting`, `notified` in current code |
| `created_at` | TEXT | NOT NULL | |

### 3.17 `package_plans`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `ppl_…` |
| `name` | TEXT | NOT NULL | |
| `description` | TEXT | NOT NULL, `''` | |
| `service_ids` | TEXT | NOT NULL, `'[]'` | JSON array of service IDs |
| `sessions` | INTEGER | NOT NULL, `5` | Paid sessions |
| `free_sessions` | INTEGER | NOT NULL, `1` | Bonus sessions at the end |
| `price_pence` | INTEGER | NOT NULL, `0` | |
| `validity_days` | INTEGER | NOT NULL, `180` | |
| `emoji` | TEXT | NOT NULL, `'🎁'` | |
| `active` | INTEGER | NOT NULL, `1` | Available to sell |
| `online` | INTEGER | NOT NULL, `1` | Visible on the public site |
| `sort_order` | INTEGER | NOT NULL, `0` | |
| `created_at` | TEXT | NOT NULL | |

### 3.18 `package_purchases`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `pkgp_…` |
| `reference` | TEXT | NOT NULL, UNIQUE | `PKG-XXXX` |
| `customer_id` | TEXT | NOT NULL, FK `customers(id)` ON DELETE CASCADE | |
| `plan_id` | TEXT | NOT NULL, FK `package_plans(id)` | No cascade |
| `plan_name` | TEXT | NOT NULL, `''` | Snapshot |
| `sessions_total` | INTEGER | NOT NULL | Paid + free at purchase time |
| `sessions_used` | INTEGER | NOT NULL, `0` | |
| `price_pence` | INTEGER | NOT NULL, `0` | Snapshot of plan price |
| `paid_pence` | INTEGER | NOT NULL, `0` | |
| `status` | TEXT | NOT NULL, `'active'` | `active`, `completed`, `expired`, `cancelled` |
| `channel` | TEXT | NOT NULL, `'online'` | `online` or `staff` |
| `sold_by_staff_id` | TEXT | FK `staff(id)` ON DELETE SET NULL | Null for online / unlinked users |
| `sold_by_user_id` | TEXT | nullable | |
| `purchased_at` | TEXT | NOT NULL | |
| `expires_at` | TEXT | nullable | |
| `notes` | TEXT | NOT NULL, `''` | Payment lines appended |

Indexes: `idx_pkg_customer (customer_id, status)`, `idx_pkg_sold (sold_by_staff_id, purchased_at)`.

### 3.19 `package_redemptions`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `rdm_…` |
| `purchase_id` | TEXT | NOT NULL, FK `package_purchases(id)` ON DELETE CASCADE | |
| `appointment_id` | TEXT | FK `appointments(id)` ON DELETE SET NULL | Optional |
| `session_no` | INTEGER | NOT NULL | 1-based |
| `is_free` | INTEGER | NOT NULL, `0` | True when `session_no > plan.sessions` |
| `note` | TEXT | NOT NULL, `''` | |
| `redeemed_at` | TEXT | NOT NULL | |
| `redeemed_by` | TEXT | nullable | User id or `seed` |

Index `idx_redemption_purchase (purchase_id)`.

### 3.20 `reviews`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `rev_…` |
| `author` | TEXT | NOT NULL | |
| `rating` | INTEGER | NOT NULL, `5` | 1–5 enforced by route |
| `body` | TEXT | NOT NULL, `''` | |
| `source` | TEXT | NOT NULL, `'google'` | Display label and sync matching |
| `reviewed_at` | TEXT | nullable | `YYYY-MM-DD` |
| `featured` | INTEGER | NOT NULL, `1` | Show on the public site |
| `sort_order` | INTEGER | NOT NULL, `0` | |
| `created_at` | TEXT | NOT NULL | |

### 3.21 `settings`

| Column | Type | Constraints |
|---|---|---|
| `key` | TEXT | PK |
| `value` | TEXT | NOT NULL |

String values only. Defaults are inserted on boot when missing; see §5.

### 3.22 `audit_log`

| Column | Type | Constraints / default | Notes |
|---|---|---|---|
| `id` | TEXT | PK | `aud_…` |
| `actor_id` | TEXT | nullable | User id |
| `actor_name` | TEXT | NOT NULL, `'system'` | Snapshot |
| `action` | TEXT | NOT NULL | e.g. `appointment.create` |
| `entity` | TEXT | NOT NULL | e.g. `appointment` |
| `entity_id` | TEXT | nullable | |
| `detail` | TEXT | NOT NULL, `''` | |
| `ip` | TEXT | NOT NULL, `''` | |
| `created_at` | TEXT | NOT NULL | |

Index `idx_audit_created (created_at)`.

---

## 4. Relationship and deletion rules

| Parent → child | Rule | Consequence |
|---|---|---|
| `staff` → `users` | `ON DELETE SET NULL` | Deleting staff leaves the login unlinked |
| `staff` → `staff_skills`, `shifts`, `time_off` | `ON DELETE CASCADE` | Staff hard delete removes these |
| `services` → `staff_skills`, `offer_services` | `ON DELETE CASCADE` | |
| `customers` → `appointments` | no cascade | Customer cannot be deleted while appointments exist |
| `customers` → `notifications` | `SET NULL` | Message history survives client deletion |
| `customers` → `waitlist`, `package_purchases` | `CASCADE` | |
| `appointments` → `appointment_items` | `CASCADE` | |
| `appointments` → `notifications` | `SET NULL` | |
| `appointments` → `package_redemptions` | `SET NULL` | Redemption history survives |
| `package_purchases` → `package_redemptions` | `CASCADE` | |
| `package_plans` → `package_purchases` | no cascade | Plans are deactivated, not deleted |

Operationally:

- Staff and services are deactivated (`active = 0`), not deleted, through the UI.
- Package plans are deactivated and set offline; purchases remain valid.
- Appointments are cancelled by status change, never deleted.
- The GDPR erase endpoint manually deletes notifications, waitlist rows, appointment items,
  appointments and the customer inside one transaction (owner only).

**Integrity caveats in the current schema**

1. `appointments.package_purchase_id` has no foreign key.
2. `appointments.customer_id` and `appointments.staff_id` have no `ON DELETE` action, so a raw
   `DELETE FROM customers` fails while appointments exist. This is intentional for the app path but
   means ad-hoc SQL must clear children first.
3. `appointment_items.service_id` has no cascade; services cannot be hard-deleted once booked.

---

## 5. Settings reference

`SETTING_DEFAULTS` in `server/db.js`; stored as strings. Missing keys are inserted on boot.

| Key | Default | Read by |
|---|---|---|
| `salon.name` | `Lumière Hair & Beauty` | Public site, messages, admin |
| `salon.timezone` | `Europe/London` | All local date/time conversion |
| `salon.currency` | `GBP` | Display metadata |
| `salon.country_code` | `44` | WhatsApp number normalisation |
| `booking.slot_step_minutes` | `15` | Availability grid |
| `booking.min_notice_minutes` | `120` | Earliest online start |
| `booking.horizon_days` | `60` | Furthest online start |
| `booking.cancellation_notice_hours` | `24` | Online cancellation cutoff |
| `booking.auto_confirm` | `1` | New booking status |
| `booking.max_services` | `4` | Public basket cap |
| `rota.block_break` | `0` | Stored, currently unused |
| `whatsapp.mode` | `link` | `link` or `api` |
| `whatsapp.reminder_hours` | `24` | Reminder scheduling |
| `whatsapp.sender_name` | `Lumière` | Message copy |
| `whatsapp.quiet_start` | `08:00` | Stored, currently unused |
| `whatsapp.quiet_end` | `20:00` | Stored, currently unused |
| `reviews.url` | `''` | Stored |
| `reviews.google_url` | `https://g.page/r/lumiere-salon/review` | Review CTA |
| `reviews.google_place_id` | `''` | Google sync |
| `reviews.headline` | `Loved on Google` | Public section |
| `reviews.min_rating` | `4` | Public filter |
| `loyalty.points_per_pound` | `1` | Completion accrual |
| `site.notice_active` | `1` | Notice bar |
| `site.notice_text` | Christmas gift-card copy | Notice bar |
| `site.notice_link` | `#offers` | Notice bar |
| `site.notice_link_text` | `See offers` | Notice bar |
| `site.notice_tone` | `gold` | `gold` or `plum` |
| `packages.enabled` | `1` | Public package section |
| `packages.headline` | `Treatment packages` | Public section |
| `birthday.enabled` | `1` | Birthday band, discount, job |
| `birthday.discount_pct` | `15` | Discount and message |
| `birthday.window_days` | `7` | Discount window |
| `birthday.last_run` | `''` | Once-per-day job guard |

`session.secret` is generated and stored outside this default list; it is never returned by the
settings API.

---

## 6. Seed data

`seedIfEmpty()` runs only when `users` is empty. `npm run reset` deletes the database files and
reseeds. Dates in the seed are relative to the day the seed runs, so the demo always has recent and
upcoming appointments.

### 6.1 Staff

Seven staff: Anya Petrova, Marcus Reid, Priya Shah, Chloe Bennett, Jade Okafor, Sofia Rossi,
Liam Doyle. Five are full-time; Sofia and Liam are part-time. Each has a distinct accent colour and a
commission rate between 18% and 32%.

### 6.2 Services

Nineteen services across `Hair`, `Colour`, `Treatments`, `Nails` and `Brows`. Prices range from
£10.00 (fringe trim) to £160.00 (balayage). Deposits are £20 for services over £80, otherwise zero.

### 6.3 Users and templates

| Email | Role | Staff link |
|---|---|---|
| `owner@lumiere.test` | owner | — |
| `manager@lumiere.test` | manager | — |
| `reception@lumiere.test` | reception | — |
| `anya@lumiere.test` | staff | `stf_anya` |
| `priya@lumiere.test` | staff | `stf_priya` |

All use password `salon123`.

Seeded templates: `booking_confirmed`, `reminder_24h`, `booking_cancelled`,
`booking_rescheduled`, `thank_you`, `waitlist_open`, `offer_broadcast`, `payment_receipt`,
`birthday_offer`, `package_purchased`, `package_free_ready`, `package_complete`.
`internal_alert` is used by code but is **not** in the seeded template table.

### 6.4 Clients, appointments and packages

- 24 clients with tags, opt-ins, birthdays (some around the seed date) and formula notes.
- Shifts from three weeks back to four weeks forward, 30-minute breaks.
- Three time-off rows: Chloe approved, Liam approved, Jade pending.
- Three offers: Midweek Colour Club (20%), First Visit Cut (£10), Gel + Pedicure (£15).
- Five package plans: Cut ×5+1, Blow Dry ×5+1, Gel ×5+1, Roots ×4+1, Deep Conditioning ×5+1.
- Eight package purchases covering active, completed and cancelled states, with redemption rows.
- Six Google reviews, ratings 4–5.
- Appointments for 21 days back and 13 days forward, with completed, no-show, cancelled and upcoming
  statuses, plus matching appointment items.
- Customer stats rolled up from completed appointments.
- Four sent notification rows so the outbox is not empty.

---

## 7. Data conventions

| Concern | Rule |
|---|---|
| Money | Integer pence; never floats in the database |
| Timestamps | UTC ISO 8601 strings |
| Calendar dates | `YYYY-MM-DD` in salon timezone |
| Times of day | `HH:MM` local |
| Booleans | `0` / `1` |
| Phone | Digits only; UK leading `0` retained |
| Tags | Comma-separated string |
| Service lists | JSON array text in `package_plans.service_ids` |
| Status fields | Validated by route code, not by CHECK constraints except appointments |
| Snapshots | `appointment_items` and `package_purchases.plan_name` preserve historical values |
| Deletion | Soft deactivate for catalogue data; status change for bookings |

---

## 8. Query and reporting notes

- Dashboard and report day filters use string comparisons on UTC ISO timestamps in some queries,
  not salon-local boundaries. A booking late in the London evening can fall into the next UTC day.
- Staff sales service revenue sums `appointment_items.price_pence`; the daily series uses
  `appointments.paid_pence`. These can differ.
- Package revenue in staff rows counts `paid_pence` for purchases with a matching
  `sold_by_staff_id`. Online purchases have `sold_by_staff_id = NULL` and are excluded from staff
  rows but included in daily package revenue.
- Utilisation uses rostered minutes minus `break_min`, but availability does not subtract the break,
  so utilisation can exceed 100% in edge cases.
- `expirePurchases()` is lazy: it updates stale `active` purchases whenever purchases are read,
  checked or redeemed. There is no scheduled expiry job.

---

## 9. Backup, reset and safety

| Task | Command | Behaviour |
|---|---|---|
| Backup | `npm run backup` | Copies `data/salon.db` to `backups/salon-<UTC timestamp>.db`; keeps newest 30 |
| Reset | `npm run reset` | Deletes `salon.db`, `-wal`, `-shm` and reseeds |
| Seed | `npm run seed` | Seeds only if `users` is empty |
| Health | `GET /health` | Returns `ok`, database path and WhatsApp mode |

Backups are plain file copies. Stop writes or accept WAL consistency implications; the script does
not run SQLite's online backup API. There is no automatic backup schedule in the application.

Both `backup.mjs` and `reset.mjs` hard-code `data/salon.db`; they do not honour `SALON_DB`. If you
run with a custom database path, copy and reset that file manually.

---

## 10. Changing the schema safely

1. Add the `CREATE TABLE`/`CREATE INDEX` statement to `SCHEMA` for new databases.
2. Add an `ensureColumn(...)` call for new columns on existing databases.
3. Add new setting keys to `SETTING_DEFAULTS` so they are inserted on boot.
4. Update `DATABASE.md` and any affected `FEATURES.md`/`WORKFLOW.md` sections in the same change.
5. Test both paths: a fresh database (`npm run reset`) and an existing database with the old schema.
6. Back up before running migrations against real data.

There is no down-migration support; keep changes additive.
