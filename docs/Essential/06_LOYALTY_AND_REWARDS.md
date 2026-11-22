# 06 Loyalty and Rewards
Visit-based loyalty and birthday discounts.

## Current Implementation
- **Points-based:** `customers.loyalty_points` = 1 point per £1 spent (completed visits).
- **Redemption:** Manual notes only; no structured reward system.
- **Birthday:** 15% discount auto-applied if appointment date within ±7 days of DOB; WhatsApp queued for eligible customers (WhatsApp + marketing opt-in).

## Target: Visit-Based Loyalty Programme
**Rules (Configurable via Settings):**
- Qualifying visits: 5 completed appointments.
- Reward: £10 off next visit.
- One visit per completed appointment (status = `completed`).
- Refunded/reversed transactions handled (visit deducted).
- Reward expiry: configurable (default 90 days).
- Minimum redemption spend: configurable (default £0).
- Manual adjustments allowed (add/remove visits, grant/expire rewards).

**Loyalty Transaction Ledger (New Table):**
```sql
CREATE TABLE loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('visit_earned', 'reward_unlocked', 'reward_redeemed', 'reward_expired', 'manual_adjust', 'visit_reversed')),
  visits_delta INTEGER NOT NULL DEFAULT 0,     -- +1 per completed visit, -1 on reversal
  reward_pence INTEGER NOT NULL DEFAULT 0,     -- +1000 when unlocked, -1000 when redeemed
  reference_id TEXT,                           -- appointment_id or package_purchase_id
  note TEXT NOT NULL DEFAULT '',
  balance_visits INTEGER NOT NULL,             -- running visit balance
  balance_rewards INTEGER NOT NULL,            -- running reward count (£10 units)
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_loyalty_customer ON loyalty_transactions(customer_id, created_at);
```

**Settings Keys:**
| Key | Default | Meaning |
|-----|---------|---------|
| `loyalty.visits_per_reward` | 5 | Completed visits needed per £10 reward |
| `loyalty.reward_value_pence` | 1000 | Value of each reward (£10) |
| `loyalty.reward_expiry_days` | 90 | Days until unlocked reward expires |
| `loyalty.min_redemption_spend_pence` | 0 | Minimum spend to use a reward |

**Logic Flow:**
1. Appointment status → `completed`:
   - Insert `loyalty_transactions` (type=`visit_earned`, visits_delta=+1).
   - If new visit balance % 5 == 0: insert `reward_unlocked` (reward_pence=+1000).
2. Appointment status → `cancelled`/`no_show` (was `completed`):
   - Insert `visit_reversed` (visits_delta=-1).
   - If reward was unlocked by that visit and not redeemed: insert `reward_expired` (reward_pence=-1000).
3. Redemption at booking/payment:
   - Check `balance_rewards > 0` AND `total_pence >= min_redemption_spend`.
   - Apply discount = `reward_value_pence` (capped at total).
   - Insert `reward_redeemed` (reward_pence=-1000).
4. Nightly job: expire rewards older than `reward_expiry_days` → `reward_expired`.

**Admin UI:**
- Customer profile → Loyalty tab: transaction ledger, visit balance, reward balance, expiry dates.
- Manual adjustment button (owner/manager): add/remove visits, grant/expire rewards.

## Target: Birthday Rewards Enhancement
**Current:** Auto 15% discount on appointment within window.
**Enhanced Rules (Configurable):**
- Discount: 15% (configurable `birthday.discount_pct`).
- Window: ±7 days around birthday (configurable `birthday.window_days`).
- Unique voucher code per customer per year (format: `BDAY-{cust_id_short}-{year}`).
- One redemption per customer per year.
- Minimum spend: configurable (`birthday.min_spend_pence`).
- Treatment exclusions: configurable list (`birthday.excluded_service_ids` JSON).
- Auto-queue WhatsApp 7 days before birthday (if WhatsApp + marketing opt-in).
- Voucher code stored in `birthday_vouchers` table.

**New Table:**
```sql
CREATE TABLE birthday_vouchers (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,           -- BDAY-ABC123-2026
  discount_pct INTEGER NOT NULL,
  window_start TEXT NOT NULL,          -- YYYY-MM-DD
  window_end TEXT NOT NULL,            -- YYYY-MM-DD
  min_spend_pence INTEGER NOT NULL DEFAULT 0,
  excluded_service_ids TEXT NOT NULL DEFAULT '[]', -- JSON array
  status TEXT NOT NULL DEFAULT 'active', -- active, redeemed, expired
  redeemed_at TEXT,
  redeemed_appointment_id TEXT REFERENCES appointments(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_bday_customer ON birthday_vouchers(customer_id, created_at);
```

**Nightly Job (`runBirthdayJob` extended):**
- For each customer with DOB in next 7 days + marketing opt-in:
  - Check no active voucher for current year.
  - Generate code, insert `birthday_vouchers`.
  - Queue WhatsApp with `{{voucher_code}}` placeholder.

**Redemption at Booking:**
- If appointment date within voucher window AND customer has active voucher:
  - Validate min spend, exclusions.
  - Apply discount % to eligible services.
  - Mark voucher `redeemed` with appointment_id.

## Database Migration (Additive)
```sql
-- Loyalty
ALTER TABLE customers ADD COLUMN loyalty_visits INTEGER NOT NULL DEFAULT 0;     -- running visit balance
ALTER TABLE customers ADD COLUMN loyalty_rewards INTEGER NOT NULL DEFAULT 0;    -- running reward balance (£10 units)

-- Birthday vouchers (new table, see above)
-- No ALTER needed for customers; voucher links by customer_id
```

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/customers/:id/loyalty` | Full transaction ledger + balances |
| POST | `/api/admin/customers/:id/loyalty/adjust` | Manual visit/reward adjustment (owner/manager) |
| GET | `/api/admin/birthday/vouchers` | List vouchers (filter: status, date range) |
| POST | `/api/admin/birthday/vouchers/generate` | Manual generate for customer |
| GET | `/api/public/birthday/validate` | Validate voucher code for booking (code, serviceIds, totalPence) |

## Settings Additions
```js
'birthday.min_spend_pence': '0',
'birthday.excluded_service_ids': '[]',
'loyalty.visits_per_reward': '5',
'loyalty.reward_value_pence': '1000',
'loyalty.reward_expiry_days': '90',
'loyalty.min_redemption_spend_pence': '0',
```