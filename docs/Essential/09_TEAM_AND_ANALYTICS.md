# 09 Team and Analytics
Staff targets and treatment analysis.

## Current Implementation
**Staff Table:** `staff` (name, title, bio, colour, employment_type, commission_pct, active, sort_order).
**Rota:** `shifts` + `time_off` + conflict detection.
**Sales Reporting:** `packages.salesReport()` — per staff: appointments, services sold, service revenue, packages sold, package revenue, total revenue, commission, breakdown by service.
**CSV Export:** `/api/admin/sales/export.csv`.
**Dashboard KPIs:** Today's revenue, bookings, utilisation, no-show rate, new clients.
**Utilisation Report:** Booked minutes ÷ rostered minutes per staff per week.
**Commission Report:** Completed revenue × commission %.

## Gaps vs Target Platform
| Target Requirement | Current State | Gap |
|--------------------|---------------|-----|
| Staff Profiles | ✅ | OK |
| Roles & Permissions | ✅ (auth roles) | OK |
| Working Schedules | ✅ (shifts) | OK |
| Assigned Appointments | ✅ | OK |
| Completed Treatments | ✅ | OK |
| Revenue Attribution | ✅ (salesReport) | OK |
| Individual Targets | ❌ | Need targets table |
| Team Targets | ❌ | Need team targets |
| Rebooking Rate | ❌ | Need computation |
| Retail Sales | ❌ | No retail tracking |
| Customer Retention | ⚠️ (lapsed segment) | Need cohort analysis |
| Appointment Utilisation | ✅ (utilisation report) | OK |
| Treatment Profitability | ❌ | Need cost data |
| Marketing Analytics | ⚠️ (broadcast only) | Need campaign tracking |
| AI Data Analyst | ❌ | Future phase |

## Required Schema Changes
```sql
-- Staff Targets
CREATE TABLE staff_targets (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  period TEXT NOT NULL CHECK (period IN ('weekly','monthly')), -- e.g. '2026-W01', '2026-01'
  target_revenue_pence INTEGER NOT NULL DEFAULT 0,
  target_services INTEGER NOT NULL DEFAULT 0,
  target_rebooking_rate REAL,         -- 0.0-1.0
  target_retail_pence INTEGER NOT NULL DEFAULT 0,
  target_new_clients INTEGER NOT NULL DEFAULT 0,
  target_utilisation REAL,            -- 0.0-1.0
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (staff_id, period)
);
CREATE INDEX idx_targets_staff_period ON staff_targets(staff_id, period);

-- Team Targets
CREATE TABLE team_targets (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL CHECK (period IN ('weekly','monthly')),
  target_revenue_pence INTEGER NOT NULL DEFAULT 0,
  target_services INTEGER NOT NULL DEFAULT 0,
  target_rebooking_rate REAL,
  target_retail_pence INTEGER NOT NULL DEFAULT 0,
  target_new_clients INTEGER NOT NULL DEFAULT 0,
  target_utilisation REAL,
  created_by TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (period)
);

-- Retail Sales (products sold)
CREATE TABLE retail_sales (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_pence INTEGER NOT NULL,
  cost_pence INTEGER NOT NULL DEFAULT 0,
  sold_at TEXT NOT NULL,
  created_by TEXT
);
CREATE INDEX idx_retail_staff_date ON retail_sales(staff_id, sold_at);
CREATE INDEX idx_retail_customer ON retail_sales(customer_id);

-- Treatment Costs (for profitability)
CREATE TABLE service_costs (
  service_id TEXT PRIMARY KEY REFERENCES services(id) ON DELETE CASCADE,
  cost_pence INTEGER NOT NULL DEFAULT 0,      -- product cost per service
  time_cost_pence INTEGER NOT NULL DEFAULT 0, -- staff time cost (optional)
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
```

## Analytics Modules

### 1. Treatment Analytics
- Most/least popular (by count).
- Revenue per treatment.
- Average price.
- Repeat booking rate (same service within 90d).
- Profitability: `revenue - (cost_pence * count)` per service.

### 2. Customer Analytics
- New customers (first visit in period).
- Returning customers (≥2 visits).
- VIP (tag + spend threshold).
- Inactive (no visit 90d/180d/365d).
- Retention: cohort analysis (month of first visit → % returning month 1, 2, 3...).
- Average customer spend (LTV).
- Visit frequency (days between visits).

### 3. Staff Analytics
- Revenue vs target.
- Service count vs target.
- Rebooking rate: `appointments where same customer returns within 90d / completed appointments`.
- Retail sales vs target.
- Customer retention (their clients returning).
- Utilisation: booked min / rostered min (accounts for holidays, part-time).

### 4. Marketing Analytics
- Campaign: sent, delivered, opened, clicked, booked, revenue.
- Birthday voucher: sent, redeemed, revenue.
- Loyalty: rewards unlocked, redeemed, expired.
- Attribution: booking source + campaign_id.

## Computation Helpers (New in `server/analytics.js`)
```js
export function treatmentAnalytics({ from, to }) { ... }
export function customerAnalytics({ from, to }) { ... }
export function staffAnalytics({ from, to, staffId }) { ... }
export function marketingAnalytics({ from, to }) { ... }
export function cohortRetention({ from, to }) { ... }
export function staffTargets({ period, staffId }) { ... }  // compares actual vs target
```

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/analytics/treatments` | Treatment analytics (from, to) |
| GET | `/api/admin/analytics/customers` | Customer analytics |
| GET | `/api/admin/analytics/staff` | Staff analytics (filter staffId) |
| GET | `/api/admin/analytics/marketing` | Marketing analytics |
| GET | `/api/admin/analytics/cohorts` | Cohort retention matrix |
| GET | `/api/admin/targets` | List targets (filter period, staffId) |
| POST | `/api/admin/targets` | Create/update staff target |
| PATCH | `/api/admin/targets/:id` | Update target |
| GET | `/api/admin/targets/team` | Team target for period |
| POST | `/api/admin/targets/team` | Set team target |
| POST | `/api/admin/retail` | Record retail sale |
| GET | `/api/admin/retail` | List retail sales |
| GET | `/api/admin/service-costs` | List service costs |
| PATCH | `/api/admin/service-costs/:serviceId` | Update cost |

## AI Data Analyst (Future - Phase 6)
**Interface:** Natural language → SQL → Results.
**Guardrails:**
- Read-only allow-list: `appointments`, `appointment_items`, `customers`, `services`, `staff`, `campaign_sends`, `loyalty_transactions`, `birthday_vouchers`, `retail_sales`, `service_costs`.
- No PII in results (mask phone/email unless role=owner).
- Query timeout: 5s.
- Row limit: 1000.
- Output: Answer text + Chart.js config (bar, line, pie) + CSV download.

**Example Queries:**
- "Which treatment is most popular this month?"
- "Which staff member is ahead of target?"
- "Show me customers who haven't visited in 90 days."
- "Compare this month's revenue to last month."
- "Which promotion generated the most bookings?"

## Settings Additions
```js
'analytics.retention_windows': '30,90,180',  -- days for inactive definition
'analytics.cohort_months': '12',             -- how many cohorts to show
'targets.default_weekly_revenue_pence': '0',
'targets.default_monthly_revenue_pence': '0',
```