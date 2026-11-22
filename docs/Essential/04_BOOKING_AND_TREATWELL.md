# 04 Booking and Treatwell Integration
Bookings and Treatwell integration.

## Current Booking System (Implemented)
- **Engine:** `scheduling.js` — real availability from `opening_hours` ∩ `shifts` \ `time_off` \ `appointments`.
- **Slot Grid:** Configurable step (default 15 min), service duration + max buffer.
- **Multi-Service:** Single continuous block (sum durations + max buffer).
- **Any-Staff Matching:** Returns first qualified stylist free at that time.
- **Conflict Guard:** Server re-validates on write (`assertBookable` + `assertNoOverlap` in transaction).
- **Statuses:** `pending`, `confirmed`, `arrived`, `completed`, `no_show`, `cancelled`.
- **Sources:** `online`, `phone`, `walkin`, `instagram`, `admin`.
- **Deposits:** Recorded amount + method; balance shown.
- **Cancellation Policy:** Per-salon notice window (default 24h) enforced for client self-service.
- **Waitlist:** Date-range per customer/service/staff; notified when slot frees.
- **Packages:** Pre-paid sessions redeemed against appointments (discount applied automatically).

## Treatwell Connect — Current State
- **Integration:** None exists.
- **Booking Source:** Salon currently uses Treatwell Connect externally.
- **Data Flow:** Manual entry or phone booking only.

## Treatwell Integration Requirements
1. **Customer Imports:** Import Treatwell client records → match/merge with local `customers` (phone/email normalisation).
2. **Booking Imports:** Import Treatwell bookings → create `appointments` with `source='treatwell'`.
3. **Customer Matching:** Normalise phone (E.164) and email; suggest matches; require manual review for uncertain pairs.
4. **Duplicate Detection:** UI review queue for potential duplicates before merge.
5. **Booking History:** Preserve imported booking history in `appointments`.
6. **Profile Updates:** Sync changes (name, phone, email, notes) bidirectionally where possible.
7. **Import History:** Log every import (file, rows, created/updated/skipped, errors).
8. **Error Reporting:** Per-row validation errors surfaced in UI.

## Investigation Needed
- **API Access:** Does Treatwell offer authorised API, webhooks, or scheduled exports (CSV/SFTP)?
- **Authentication:** OAuth? API keys? IP whitelisting?
- **Rate Limits:** Requests/minute, daily quotas.
- **Webhook Events:** `booking.created`, `booking.updated`, `booking.cancelled`, `client.updated`?
- **Data Scope:** Full history or future-only? Which fields exposed?
- **Sandbox/Dev Environment:** Available for testing?

## Fallback Strategy (If No API)
- **CSV Import Module:** Admin upload → parse → preview → confirm → import.
- **Scheduled Export:** Treatwell → email/SFTP → watched folder → auto-import.
- **Manual Trigger:** "Import from Treatwell" button in admin.

## Integration Architecture (Future-Proof)
```
Treatwell Adapter Interface
├─ listCustomers(since?)
├─ listBookings(since?)
├─ getCustomer(id)
├─ getBooking(id)
└─ pushBooking(appointment)  // if 2-way sync ever available

Implementations:
├─ TreatwellAPIAdapter   (when API credentials exist)
├─ TreatwellCSVAdapter   (fallback: parse exported CSVs)
└─ TreatwellManualAdapter (fallback: admin upload)
```
- CRM logic unchanged; only adapter swaps.
- All imports write to `treatwell_imports` audit table.

## Database Additions Needed
```sql
CREATE TABLE treatwell_imports (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('customers','bookings')),
  source TEXT NOT NULL DEFAULT 'csv',  -- 'api' | 'csv' | 'manual'
  filename TEXT,
  rows_total INTEGER NOT NULL,
  rows_created INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '[]',   -- JSON array
  status TEXT NOT NULL DEFAULT 'completed',
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE treatwell_mappings (
  id TEXT PRIMARY KEY,
  local_customer_id TEXT NOT NULL REFERENCES customers(id),
  treatwell_customer_id TEXT NOT NULL,
  treatwell_email TEXT,
  treatwell_phone TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,  -- 1.0 = exact match, <1.0 = review needed
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'rejected'
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
```

## API Endpoints Needed
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/treatwell/status` | Connection status, last sync |
| POST | `/api/admin/treatwell/import/customers` | Trigger customer import |
| POST | `/api/admin/treatwell/import/bookings` | Trigger booking import |
| POST | `/api/admin/treatwell/import/csv` | Upload CSV file |
| GET | `/api/admin/treatwell/imports` | Import history |
| GET | `/api/admin/treatwell/mappings` | Pending duplicate matches |
| POST | `/api/admin/treatwell/mappings/:id/confirm` | Confirm a match |
| POST | `/api/admin/treatwell/mappings/:id/reject` | Reject a match |
| POST | `/api/admin/treatwell/mappings/:id/merge` | Merge duplicate customers |

## Compliance
- Never scrape Treatwell.
- Respect API terms of service.
- Store only data necessary for salon operations.
- GDPR: Treatwell data = salon's processor data; same retention rules.