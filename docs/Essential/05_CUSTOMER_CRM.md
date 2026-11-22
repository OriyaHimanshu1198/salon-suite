# 05 Customer CRM
Customer profiles and booking history.

## Current Implementation
**Table:** `customers`
```sql
id, first_name, last_name, phone (UNIQUE), email, dob, address, tags,
preferred_staff_id, allergies, formula_notes, notes,
whatsapp_opt_in, marketing_opt_in, consent_at,
loyalty_points, total_spend_pence, visit_count, last_visit_at, created_at
```

**Features (Done):**
- C1: Profile (name, phone, email, DOB, address, tags).
- C2: Preferences & safety (preferred stylist, formula/colour notes, allergies, general notes).
- C3: Visit history (past/upcoming appointments, total spend, visit count, last visit).
- C4: Consent flags (WhatsApp opt-in, marketing opt-in, consent timestamp).
- C5: Dedupe on phone (booking reuses existing profile).
- C6: Loyalty points (1 per £1 on completed visits).
- C7: CSV export; hard erase endpoint (GDPR).
- C8: Segments (Lapsed 90d, VIP, Colour clients).

**Admin API:** `/api/admin/customers` (list, search, segments), `/api/admin/customers/:id` (profile + history + notifications), POST/PATCH/DELETE (owner only for erase).

## Gaps vs Target Platform
| Target Requirement | Current State | Gap |
|--------------------|---------------|-----|
| Full name | Split first/last | OK |
| Email, Phone, Birthday | ✅ | OK |
| Booking history | ✅ (appointments join) | OK |
| Treatment history | ✅ (appointment_items) | OK |
| Assigned staff member | ✅ (preferred_staff_id) | OK |
| Total completed visits | ✅ (visit_count) | OK |
| Total customer spending | ✅ (total_spend_pence) | OK |
| Last visit | ✅ (last_visit_at) | OK |
| Favourite treatments | ❌ | Need aggregation from appointment_items |
| Loyalty progress | ⚠️ Points only | Need visit-based (5 visits = £10) |
| Reward history | ❌ | Need loyalty_transactions table |
| Marketing preferences | ⚠️ Single flag | Need separate email_opt_in, sms_opt_in |
| Consent records | ⚠️ Timestamp only | Need source, version, wording, channel, withdrawn_at |

## Required Schema Changes
```sql
-- Favourite treatments (materialised view or cached column)
ALTER TABLE customers ADD COLUMN favourite_treatments TEXT DEFAULT '[]'; -- JSON array of service_ids

-- Loyalty: visit-based transactions (see 06_LOYALTY_AND_REWARDS.md)
-- Marketing: split consent
ALTER TABLE customers ADD COLUMN email_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN sms_opt_in INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customers ADD COLUMN email_consent_at TEXT;
ALTER TABLE customers ADD COLUMN sms_consent_at TEXT;
ALTER TABLE customers ADD COLUMN email_consent_source TEXT;  -- 'booking', 'website', 'in_salon', 'import'
ALTER TABLE customers ADD COLUMN sms_consent_source TEXT;
ALTER TABLE customers ADD COLUMN email_consent_version TEXT;
ALTER TABLE customers ADD COLUMN sms_consent_version TEXT;
ALTER TABLE customers ADD COLUMN email_withdrawn_at TEXT;
ALTER TABLE customers ADD COLUMN sms_withdrawn_at TEXT;

-- Treatwell linkage (see 04_BOOKING_AND_TREATWELL.md)
-- treatwell_mappings table handles this
```

## Duplicate Management
- **Identity Key:** Normalised phone (digits only, E.164-ish).
- **Matching:** Exact phone → auto-merge on booking. Fuzzy (email, name+DOB) → review queue.
- **Process:** `treatwell_mappings` with `confidence` score. Admin confirms/rejects/merges.
- **Merge:** Preserve all history; update FKs; audit log.

## API Extensions Needed
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/customers/:id/favourites` | Computed favourite treatments |
| GET | `/api/admin/customers/:id/loyalty` | Loyalty transaction ledger |
| GET | `/api/admin/customers/:id/consent` | Detailed consent history |
| POST | `/api/admin/customers/:id/merge` | Merge with another customer (owner only) |
| GET | `/api/admin/customers/duplicates` | Potential duplicate pairs for review |

## GDPR / PECR Compliance
- **Erase:** `DELETE /api/admin/customers/:id` (owner only) — cascades appointments, notifications, waitlist, packages.
- **Export:** `GET /api/admin/customers/export.csv` — all profile + history.
- **Consent:** Separate tracking per channel; withdrawal respected immediately.
- **Retention:** Audit log retained indefinitely; personal data erasable on request.