# Data Model

SQLite (WAL). All timestamps are **UTC ISO-8601 strings** (`2026-05-04T09:30:00.000Z`). Local dates are `YYYY-MM-DD`, local clock times `HH:MM`.

## 1. Entity map

```
users ──1:1── staff
staff ──M:N── services            (staff_skills)
staff ──1:N── shifts              (rota)
staff ──1:N── time_off
customers ──1:N── appointments ──1:N── appointment_items ──N:1── services
appointments ──1:N── notifications
offers ──M:N── services           (offer_services)
customers ──1:N── waitlist
settings (key/value) · site_content (key/value) · message_templates · audit_log
```

## 2. Schema

```sql
-- ── People ────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('owner','manager','reception','staff')),
  staff_id      TEXT REFERENCES staff(id) ON DELETE SET NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE staff (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  title           TEXT NOT NULL DEFAULT 'Stylist',
  bio             TEXT NOT NULL DEFAULT '',
  phone           TEXT NOT NULL DEFAULT '',
  email           TEXT NOT NULL DEFAULT '',
  colour          TEXT NOT NULL DEFAULT '#C084FC',
  employment_type TEXT NOT NULL DEFAULT 'full_time',   -- full_time | part_time | freelance
  commission_pct  REAL NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL
);

CREATE TABLE staff_skills (
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

-- ── Catalogue ─────────────────────────────────────────────────────────────
CREATE TABLE services (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  category         TEXT NOT NULL DEFAULT 'Hair',
  description      TEXT NOT NULL DEFAULT '',
  duration_min     INTEGER NOT NULL,          -- hands-on time
  buffer_min       INTEGER NOT NULL DEFAULT 10,-- cleanup/turnaround
  price_pence      INTEGER NOT NULL,          -- integer money, never float
  deposit_pence    INTEGER NOT NULL DEFAULT 0,
  online_bookable  INTEGER NOT NULL DEFAULT 1,
  active           INTEGER NOT NULL DEFAULT 1,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL
);

-- ── Clients ───────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id                  TEXT PRIMARY KEY,
  first_name          TEXT NOT NULL,
  last_name           TEXT NOT NULL DEFAULT '',
  phone               TEXT NOT NULL UNIQUE,   -- digits only, identity key
  email               TEXT NOT NULL DEFAULT '',
  dob                 TEXT,
  address             TEXT NOT NULL DEFAULT '',
  tags                TEXT NOT NULL DEFAULT '', -- comma list: VIP,Colour
  preferred_staff_id  TEXT REFERENCES staff(id) ON DELETE SET NULL,
  allergies           TEXT NOT NULL DEFAULT '',
  formula_notes       TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  whatsapp_opt_in     INTEGER NOT NULL DEFAULT 1,
  marketing_opt_in    INTEGER NOT NULL DEFAULT 0,
  consent_at          TEXT,
  loyalty_points      INTEGER NOT NULL DEFAULT 0,
  total_spend_pence   INTEGER NOT NULL DEFAULT 0,
  visit_count         INTEGER NOT NULL DEFAULT 0,
  last_visit_at       TEXT,
  created_at          TEXT NOT NULL
);

-- ── Bookings ──────────────────────────────────────────────────────────────
CREATE TABLE appointments (
  id                 TEXT PRIMARY KEY,
  reference          TEXT NOT NULL UNIQUE,     -- e.g. LS-7K3Q
  customer_id        TEXT NOT NULL REFERENCES customers(id),
  staff_id           TEXT NOT NULL REFERENCES staff(id),
  start_at           TEXT NOT NULL,            -- UTC
  end_at             TEXT NOT NULL,            -- UTC, includes buffer
  status             TEXT NOT NULL DEFAULT 'confirmed'
                     CHECK (status IN ('pending','confirmed','arrived','completed','no_show','cancelled')),
  source             TEXT NOT NULL DEFAULT 'online'
                     CHECK (source IN ('online','phone','walkin','instagram','admin')),
  total_pence        INTEGER NOT NULL DEFAULT 0,
  deposit_pence      INTEGER NOT NULL DEFAULT 0,
  deposit_method     TEXT NOT NULL DEFAULT '',
  paid_pence         INTEGER NOT NULL DEFAULT 0,
  notes              TEXT NOT NULL DEFAULT '',
  internal_notes     TEXT NOT NULL DEFAULT '',
  cancelled_at       TEXT,
  cancel_reason      TEXT NOT NULL DEFAULT '',
  reminder_sent_at   TEXT,
  created_by         TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_appt_staff_time ON appointments(staff_id, start_at);
CREATE INDEX idx_appt_customer   ON appointments(customer_id, start_at);
CREATE INDEX idx_appt_status     ON appointments(status, start_at);

CREATE TABLE appointment_items (
  id             TEXT PRIMARY KEY,
  appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id     TEXT NOT NULL REFERENCES services(id),
  name_snapshot  TEXT NOT NULL,
  duration_min   INTEGER NOT NULL,
  price_pence    INTEGER NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0
);

-- ── Rota ──────────────────────────────────────────────────────────────────
CREATE TABLE shifts (
  id         TEXT PRIMARY KEY,
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  work_date  TEXT NOT NULL,                    -- YYYY-MM-DD local
  start_time TEXT NOT NULL,                    -- HH:MM
  end_time   TEXT NOT NULL,
  break_min  INTEGER NOT NULL DEFAULT 0,
  notes      TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (staff_id, work_date, start_time)
);
CREATE INDEX idx_shifts_date ON shifts(work_date);

CREATE TABLE time_off (
  id         TEXT PRIMARY KEY,
  staff_id   TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'holiday',   -- holiday|sick|training|unpaid
  reason     TEXT NOT NULL DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'approved',  -- pending|approved|declined
  created_at TEXT NOT NULL
);

-- ── Website ───────────────────────────────────────────────────────────────
CREATE TABLE opening_hours (
  weekday    INTEGER PRIMARY KEY CHECK (weekday BETWEEN 0 AND 6), -- 0=Sunday
  open_time  TEXT,
  close_time TEXT,
  closed     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE site_content (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT ''
);

CREATE TABLE offers (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'percent',  -- percent | amount | freebie
  value       REAL NOT NULL DEFAULT 0,
  code        TEXT NOT NULL DEFAULT '',
  starts_on   TEXT,
  ends_on     TEXT,
  banner      TEXT NOT NULL DEFAULT '',
  emoji       TEXT NOT NULL DEFAULT '✨',
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE offer_services (
  offer_id   TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, service_id)
);

-- ── Messaging ─────────────────────────────────────────────────────────────
CREATE TABLE message_templates (
  key       TEXT PRIMARY KEY,   -- booking_confirmed, reminder_24h, ...
  name      TEXT NOT NULL,
  body      TEXT NOT NULL,
  enabled   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE notifications (
  id             TEXT PRIMARY KEY,
  customer_id    TEXT REFERENCES customers(id) ON DELETE SET NULL,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  channel        TEXT NOT NULL DEFAULT 'whatsapp',
  template_key   TEXT NOT NULL,
  to_phone       TEXT NOT NULL,
  body           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'queued',  -- queued|sent|failed|cancelled
  scheduled_for  TEXT NOT NULL,
  sent_at        TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  last_error     TEXT NOT NULL DEFAULT '',
  wa_link        TEXT NOT NULL DEFAULT '',
  created_at     TEXT NOT NULL
);
CREATE INDEX idx_notif_due ON notifications(status, scheduled_for);

-- ── Waitlist ──────────────────────────────────────────────────────────────
CREATE TABLE waitlist (
  id          TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_id  TEXT REFERENCES services(id) ON DELETE SET NULL,
  staff_id    TEXT REFERENCES staff(id) ON DELETE SET NULL,
  from_date   TEXT NOT NULL,
  to_date     TEXT NOT NULL,
  notes       TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'waiting',  -- waiting|notified|booked|expired
  created_at  TEXT NOT NULL
);

-- ── Ops ───────────────────────────────────────────────────────────────────
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE audit_log (
  id         TEXT PRIMARY KEY,
  actor_id   TEXT,
  actor_name TEXT NOT NULL DEFAULT 'system',
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  detail     TEXT NOT NULL DEFAULT '',
  ip         TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
```

## 3. Settings keys (defaults)

| Key | Default | Meaning |
|---|---|---|
| `salon.name` | Lumière Hair & Beauty | Brand name |
| `salon.timezone` | Europe/London | Display + rota timezone |
| `salon.currency` | GBP | Display only |
| `booking.slot_step_minutes` | 15 | Slot grid |
| `booking.min_notice_minutes` | 120 | No bookings closer than this |
| `booking.horizon_days` | 60 | How far ahead clients can book |
| `booking.cancellation_notice_hours` | 24 | Client self-service cutoff |
| `booking.auto_confirm` | 1 | Online bookings start `confirmed` |
| `whatsapp.mode` | link | `link` (wa.me) or `api` (Cloud API) |
| `whatsapp.reminder_hours` | 24 | Reminder lead time |
| `whatsapp.sender_name` | Lumière | Sign-off in messages |
| `reviews.url` | — | Link used in thank-you messages |
| `loyalty.points_per_pound` | 1 | Earn rate |

## 4. Money

All money is **integer pence**. Formatting happens in the frontend only (`£45.00`). This avoids float drift in commission and revenue sums.

## 5. Seed data

`npm run seed` (also automatic on first boot) creates:
- 1 owner, 1 manager, 1 receptionist, 4 stylist logins.
- 7 staff (5 stylists, 2 therapists) with skills.
- 18 services across Hair, Colour, Treatments, Nails, Brows.
- 24 clients with varied tags and consent flags.
- ~60 appointments spread across the past 30 days and next 14 days.
- 4 weeks of rota shifts, 2 time-off entries, 3 offers, 8 templates.

Login: `owner@lumiere.test` / `salon123`.
