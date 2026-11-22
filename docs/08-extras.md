# Extras: notice bar, social, Google reviews, packages, staff sales, birthdays

This document specifies the second feature set. It is written before implementation and is the
authority for the schema, rules and endpoints added in this round.

---

## 1. Notice bar

A single-line announcement across the top of the public site, above the header.

| Setting | Default | Meaning |
| --- | --- | --- |
| `site.notice_active` | `1` | Show the bar |
| `site.notice_text` | Christmas gift cards… | Message |
| `site.notice_link` | `#offers` | Where "read more" goes (anchor or URL) |
| `site.notice_link_text` | `See offers` | Link label |
| `site.notice_tone` | `gold` | `gold` or `plum` |

Rules:

- Rendered server-side data, client-side dismissed state kept in `localStorage` keyed by the
  notice text, so editing the message makes it appear again.
- Hidden entirely when `site.notice_active` is `0` or the text is blank.
- Editable in **Admin → Website → Notice bar**.

## 2. Social media links

Content keys (editable in **Admin → Website**):

| Key | Example |
| --- | --- |
| `instagram` | `@lumiere.salon` (already exists) |
| `facebook` | `lumierehairbeauty` |
| `tiktok` | `@lumiere.salon` |
| `google` | Google Business profile URL |
| `youtube` | channel handle (optional) |
| `whatsapp` | `447700900123` (digits, for `wa.me`) |

Rules:

- Empty keys are not rendered — no dead icons.
- Links appear in the footer and in the "Visit us" card.
- `instagram` / `tiktok` handles are normalised to `https://instagram.com/<handle>` etc.
  `google`, `facebook` and `youtube` accept a full URL or a handle.

## 3. Google reviews

A "What clients say" section on the public site, backed by a `reviews` table.

```sql
CREATE TABLE reviews (
  id          TEXT PRIMARY KEY,
  author      TEXT NOT NULL,
  rating      INTEGER NOT NULL DEFAULT 5,   -- 1..5
  body        TEXT NOT NULL DEFAULT '',
  source      TEXT NOT NULL DEFAULT 'google',
  reviewed_at TEXT,                          -- YYYY-MM-DD
  featured    INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);
```

Settings:

| Key | Default | Meaning |
| --- | --- | --- |
| `reviews.google_url` | profile URL | "Read all reviews on Google" |
| `reviews.headline` | Loved on Google | Section heading |
| `reviews.min_rating` | `4` | Hide reviews below this on the site |

Rules:

- Only `featured = 1` and `rating >= reviews.min_rating` are shown publicly.
- The aggregate (average + count) is computed from the visible set and displayed as stars.
- Admin can add, edit, hide and delete reviews in **Admin → Website → Reviews**.
- `POST /api/admin/reviews/sync` refreshes from the Google Places API **only** when
  `GOOGLE_PLACES_API_KEY` and `reviews.google_place_id` are configured; otherwise it returns a
  clear "not configured" message and the curated reviews remain. No key is required to use the
  feature.

## 4. Treatment packages (loyalty)

"Pay for five treatments, the sixth is free." A customer can hold several packages at once.

### 4.1 Tables

```sql
CREATE TABLE package_plans (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  service_ids   TEXT NOT NULL DEFAULT '[]',  -- JSON array
  sessions      INTEGER NOT NULL DEFAULT 5,  -- paid sessions
  free_sessions INTEGER NOT NULL DEFAULT 1,  -- bonus sessions at the end
  price_pence   INTEGER NOT NULL DEFAULT 0,
  validity_days INTEGER NOT NULL DEFAULT 180,
  emoji         TEXT NOT NULL DEFAULT '🎁',
  active        INTEGER NOT NULL DEFAULT 1,
  online        INTEGER NOT NULL DEFAULT 1,  -- buyable on the website
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE package_purchases (
  id                TEXT PRIMARY KEY,
  reference         TEXT NOT NULL UNIQUE,    -- PKG-7K3Q
  customer_id       TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL REFERENCES package_plans(id),
  plan_name         TEXT NOT NULL DEFAULT '', -- snapshot
  sessions_total    INTEGER NOT NULL,         -- sessions + free_sessions
  sessions_used     INTEGER NOT NULL DEFAULT 0,
  price_pence       INTEGER NOT NULL DEFAULT 0,
  paid_pence        INTEGER NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'active',  -- active|completed|cancelled|expired
  channel           TEXT NOT NULL DEFAULT 'online',  -- online|staff
  sold_by_staff_id  TEXT REFERENCES staff(id) ON DELETE SET NULL,
  sold_by_user_id   TEXT,
  purchased_at      TEXT NOT NULL,
  expires_at        TEXT,
  notes             TEXT NOT NULL DEFAULT ''
);

CREATE TABLE package_redemptions (
  id             TEXT PRIMARY KEY,
  purchase_id    TEXT NOT NULL REFERENCES package_purchases(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  session_no     INTEGER NOT NULL,
  is_free        INTEGER NOT NULL DEFAULT 0,
  note           TEXT NOT NULL DEFAULT '',
  redeemed_at    TEXT NOT NULL,
  redeemed_by    TEXT
);
```

`appointments` gains:

| Column | Type | Meaning |
| --- | --- | --- |
| `discount_pence` | INTEGER default 0 | Birthday or package discount applied |
| `package_purchase_id` | TEXT | Set when a session was redeemed against this appointment |

### 4.2 Rules

- `sessions_total = sessions + free_sessions`. Sessions `1..sessions` are paid; the remaining
  ones are the free bonus sessions. The UI shows them as filled dots, with gold dots for free.
- `expires_at = purchased_at + validity_days`. A read-time sweep marks lapsed purchases
  `expired`; expired purchases cannot be redeemed.
- A session can be redeemed when: status is `active`, not expired, `sessions_used < sessions_total`,
  and the appointment contains a service covered by the plan.
- Redeeming sets the covered appointment item's value as `discount_pence`, so the client pays
  nothing for that treatment. The appointment keeps its item history.
- Redeeming the first free session queues a WhatsApp message: "your next treatment is on us".
- When `sessions_used = sessions_total` the purchase becomes `completed`.
- Purchases are never deleted; cancelling sets `status = cancelled`.
- `paid_pence < price_pence` shows as **Payment due** in admin; payment is recorded by staff
  (card/cash/transfer). Online purchase reserves the package immediately.

### 4.3 Purchase channels

| Channel | Who | Endpoint |
| --- | --- | --- |
| `online` | Client on the website | `POST /api/public/packages/:planId/purchase` |
| `staff` | Reception/manager selling at the desk | `POST /api/admin/package-purchases` |

Both create the same record; the staff channel records `sold_by_staff_id`, which feeds staff sales.

### 4.4 Admin surface

- **Packages** view: plan cards with edit/create, plus a purchases table (client, plan,
  progress, payment, expiry, actions).
- Appointment modal: "Use a package session" lists the client's usable packages for the
  services on the appointment.
- Client modal: package list with progress and a "Sell package" action.

## 5. Staff daily sales

The question this answers: *how much did each person sell today?*

`GET /api/admin/sales?date=YYYY-MM-DD` returns, per active staff member:

| Field | Meaning |
| --- | --- |
| `servicesSold` | Completed appointment items performed that day |
| `serviceRevenue` | Sum of those item prices (pence) |
| `appointments` | Completed appointments |
| `packagesSold` | Packages sold by that staff member that day |
| `packageRevenue` | Package payments taken that day |
| `totalRevenue` | `serviceRevenue + packageRevenue` |
| `commissionPence` | `serviceRevenue × commission_pct / 100` |
| `items` | Per-service breakdown for the day |

Rules:

- "Sold" for services means **completed** appointments performed by that staff member.
- Packages are attributed to `sold_by_staff_id` and the purchase date.
- A range form (`from`/`to`) returns the same shape plus a per-day series.
- CSV: `GET /api/admin/sales/export.csv?date=…`.
- Dashboard shows a compact "Today by team" card; the **Sales** view is the full breakdown.

## 6. Birthday offers

### 6.1 Settings

| Key | Default | Meaning |
| --- | --- | --- |
| `birthday.enabled` | `1` | Enable the discount and the card |
| `birthday.discount_pct` | `15` | Percent off a birthday booking |
| `birthday.window_days` | `7` | Days either side of the birthday |
| `birthday.last_run` | — | Date the daily WhatsApp job last ran |

### 6.2 Rules

- `customers.dob` already exists; it becomes editable in the client form and the public booking
  form (optional).
- A booking whose `dob` falls within `window_days` of the appointment date gets
  `discount_pence = round(gross × pct / 100)`. `total_pence` is stored net.
- The public site shows a "Birthday treat" card whenever `birthday.enabled = 1`.
- The booking confirmation shows the discount line when it applied.
- Admin sees a "Birthdays this week" card on the dashboard and a `birthday` client segment.
- Daily job (once per calendar day, driven by the existing dispatch loop): queue a
  `birthday_offer` WhatsApp to clients whose birthday is today, with WhatsApp + marketing
  consent, skipping anyone already messaged this year. `birthday.last_run` prevents reruns.
- The Messages broadcast segment `birthday_month` targets everyone with a birthday this month.

## 7. Responsive requirements

- No horizontal scrolling at 360 px on the public site or the console.
- Notice bar, hero, offers, packages, reviews, booking wizard and footer stack cleanly.
- Tables in the console scroll inside their card, never the page.
- Touch targets ≥ 40 px on primary actions.
- Verified in the browser at 390 × 844 and 768 × 1024.

## 8. New endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/public/packages` | — | Active online plans |
| POST | `/api/public/packages/:planId/purchase` | — | Buy/reserve a package |
| GET | `/api/admin/packages` | staff | Plans + purchase counts |
| POST | `/api/admin/packages` | manage | Create plan |
| PATCH | `/api/admin/packages/:id` | manage | Edit plan |
| DELETE | `/api/admin/packages/:id` | manage | Deactivate plan |
| GET | `/api/admin/package-purchases` | staff | Purchases list/filter |
| POST | `/api/admin/package-purchases` | desk | Sell a package |
| POST | `/api/admin/package-purchases/:id/payment` | desk | Record payment |
| POST | `/api/admin/package-purchases/:id/redeem` | desk | Use a session |
| POST | `/api/admin/package-purchases/:id/cancel` | manage | Cancel |
| GET | `/api/admin/reviews` | staff | All reviews |
| POST | `/api/admin/reviews` | manage | Add review |
| PATCH | `/api/admin/reviews/:id` | manage | Edit/hide |
| DELETE | `/api/admin/reviews/:id` | manage | Delete |
| POST | `/api/admin/reviews/sync` | manage | Pull from Google (optional) |
| GET | `/api/admin/sales` | manage | Daily/per-staff sales |
| GET | `/api/admin/sales/export.csv` | manage | CSV |
| GET | `/api/admin/birthdays` | staff | Birthdays this month |

## 9. Seed additions

- 5 package plans (cut, blow-dry, gel, roots, deep conditioning).
- 6 Google reviews (4–5 stars).
- 8 package purchases across clients, some part-used, one completed, one payment due.
- Social handles and an active notice bar.
- Birthday months arranged so several clients have birthdays in the current month.
