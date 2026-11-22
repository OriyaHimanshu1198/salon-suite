# API Reference

Base URL: `http://localhost:4321`. All bodies are JSON. All errors share one shape:

```json
{ "error": "validation_failed", "message": "Phone number is required", "fields": { "phone": "required" } }
```

Auth uses an HttpOnly cookie (`ss_session`) set by `POST /api/auth/login`. Admin endpoints return `401` when it is missing or expired.

---

## 1. Auth

| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/api/auth/login` | `{email, password}` | Sets cookie. 8 attempts / 15 min / IP |
| POST | `/api/auth/logout` | — | Clears cookie |
| GET | `/api/auth/me` | — | `{user, salon}` or 401 |

`user` = `{id, name, email, role, staffId}`.

## 2. Public (no auth, rate-limited)

| Method | Path | Query / Body | Returns |
|---|---|---|---|
| GET | `/api/public/site` | — | `{salon, content, hours, offers, services, staff, categories}` |
| GET | `/api/public/services` | — | Active, bookable services |
| GET | `/api/public/staff` | — | Active staff with `serviceIds[]` |
| GET | `/api/public/availability` | `?serviceIds=a,b&staffId=any&date=2026-05-04` | `{date, slots:[{start, end, staffId, staffName}]}` |
| GET | `/api/public/availability/month` | `?serviceIds=a,b&staffId=any&month=2026-05` | `{month, days:[{date, count}]}` |
| POST | `/api/public/bookings` | see below | `201 {appointment, reference, whatsappLink}` |
| GET | `/api/public/bookings/:reference` | `?phone=07700...` | Booking summary (phone must match) |
| POST | `/api/public/bookings/:reference/cancel` | `{phone, reason?}` | `{ok, refundDue}` |
| POST | `/api/public/waitlist` | `{firstName, phone, serviceId?, staffId?, fromDate, toDate, notes?}` | `201 {ok}` |

**Booking payload**

```json
{
  "serviceIds": ["svc_colour", "svc_cut"],
  "staffId": "stf_anya",
  "start": "2026-05-04T09:30:00.000Z",
  "customer": {
    "firstName": "Maya", "lastName": "Khan",
    "phone": "07700900123", "email": "maya@example.com",
    "marketingOptIn": true, "notes": "Sensitive scalp"
  },
  "notes": "Parking at rear"
}
```

**Validation rules**

- `serviceIds` 1–4 items, all active and bookable.
- `start` must be one of the computed slots (±0 s), inside opening hours and ≥ `min_notice_minutes` ahead.
- `phone` normalised to digits; must be 10–15 digits.
- `staffId` may be `"any"` → the engine picks the first qualified free stylist.

**409 responses**

```json
{ "error": "slot_taken", "message": "That time was just booked. Please pick another.", "alternatives": ["2026-05-04T10:00:00.000Z"] }
```

## 3. Admin — dashboard & calendar

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/admin/dashboard` | `?date=2026-05-04` | KPIs + today's appointments + unread messages |
| GET | `/api/admin/appointments` | `?from&to&staffId&status&q` | Appointments with customer + items |
| POST | `/api/admin/appointments` | booking payload + `{status, source, depositPence}` | Created appointment |
| PATCH | `/api/admin/appointments/:id` | `{start?, staffId?, serviceIds?, notes?, internalNotes?}` | Re-validated move |
| POST | `/api/admin/appointments/:id/status` | `{status, reason?}` | Updated; queues follow-up messages |
| POST | `/api/admin/appointments/:id/payment` | `{amountPence, method}` | Records payment, updates balance |

Statuses: `pending`, `confirmed`, `arrived`, `completed`, `no_show`, `cancelled`.
Side effects: `confirmed` queues the reminder; `cancelled` queues the cancellation notice + waitlist alert; `completed` awards loyalty points, updates spend/visit counts, queues thank-you.

## 4. Admin — clients

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/customers` | `?q&segment&limit` — `segment` ∈ `all,vip,lapsed,new,colour,marketing` |
| GET | `/api/admin/customers/:id` | Profile + appointments + notifications + stats |
| POST | `/api/admin/customers` | Create; 409 on duplicate phone |
| PATCH | `/api/admin/customers/:id` | Partial update incl. consent flags |
| DELETE | `/api/admin/customers/:id` | GDPR erase (also removes appointments' PII link) |
| GET | `/api/admin/customers/export.csv` | Download all clients |

## 5. Admin — services & staff

| Method | Path | Notes |
|---|---|---|
| GET/POST | `/api/admin/services` | List / create |
| PATCH/DELETE | `/api/admin/services/:id` | Update / soft-deactivate |
| GET/POST | `/api/admin/staff` | List (with skills + weekly hours) / create |
| PATCH/DELETE | `/api/admin/staff/:id` | Update / deactivate |
| PUT | `/api/admin/staff/:id/skills` | `{serviceIds: []}` |

## 6. Admin — rota

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/rota` | `?week=2026-05-04` (any date in week) → grid + conflicts |
| POST | `/api/admin/rota` | `{staffId, date, start, end, breakMin?, notes?}` → 409 on overlap |
| PATCH | `/api/admin/rota/:id` | Edit a shift |
| DELETE | `/api/admin/rota/:id` | Remove a shift |
| POST | `/api/admin/rota/copy` | `{fromWeek, toWeek}` duplicate forward |
| POST | `/api/admin/rota/template` | `{week}` apply each staff member's default pattern |
| GET/POST | `/api/admin/timeoff` | List / request |
| PATCH | `/api/admin/timeoff/:id` | `{status}` approve or decline |

## 7. Admin — website & offers

| Method | Path | Notes |
|---|---|---|
| GET/PATCH | `/api/admin/site` | `site_content` key/value patch |
| GET/PATCH | `/api/admin/hours` | Array of 7 `{weekday, open, close, closed}` |
| GET/POST | `/api/admin/offers` | List / create |
| PATCH/DELETE | `/api/admin/offers/:id` | Update / delete |
| GET | `/api/admin/preview` | Renders the public payload for a preview pane |

## 8. Admin — messaging

| Method | Path | Notes |
|---|---|---|
| GET | `/api/admin/notifications` | `?status&limit&customerId` |
| POST | `/api/admin/notifications/:id/send` | Send now (API mode) or return the `wa.me` link |
| POST | `/api/admin/notifications/:id/retry` | Reset attempts, requeue |
| GET/PUT | `/api/admin/templates` | Read / update template bodies |
| POST | `/api/admin/broadcast` | `{offerId, segment, templateKey}` → queues a campaign |
| POST | `/api/webhooks/whatsapp` | Cloud API verification + inbound `STOP` handling |

## 9. Admin — reports & settings

| Method | Path | Query | Returns |
|---|---|---|---|
| GET | `/api/admin/reports` | `?from&to` | Revenue by day/service/staff, utilisation, no-show rate, top clients |
| GET | `/api/admin/audit` | `?limit` | Recent audit rows |
| GET/PATCH | `/api/admin/settings` | — | All settings as a flat object |

## 10. Status codes

| Code | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Malformed JSON or missing field |
| 401 | Not signed in |
| 403 | Signed in, wrong role |
| 404 | Unknown id or reference |
| 409 | Conflict — duplicate phone, overlapping shift, slot taken |
| 422 | Validation failed (`fields` populated) |
| 429 | Rate limited (`Retry-After` header) |
| 500 | Unexpected — logged, generic message returned |
