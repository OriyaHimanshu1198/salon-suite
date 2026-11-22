# Rota & Availability

## 1. Three layers of truth

| Layer | Table | Question it answers |
|---|---|---|
| Salon is open | `opening_hours` | "Do we trade on Monday?" |
| Person is working | `shifts` | "Is Anya in on Monday, and 09:00–17:00?" |
| Person is unavailable | `time_off` | "Is Anya on holiday that week?" |
| Chair is free | `appointments` | "Is 10:30 already taken?" |

A slot is bookable only when all four agree. This is why the website cannot advertise a time nobody can work.

## 2. Shift rules

- A shift is `(staff_id, work_date, start_time, end_time, break_min)`.
- Shifts may not overlap **for the same person on the same day** — enforced by the API (409 `shift_overlap`).
- A shift outside the salon's opening hours raises a **warning**, not an error (salons do pre-open prep).
- `break_min` is subtracted when computing capacity and utilisation, and blocks the middle of the shift for bookings only if `settings.rota.block_break = 1` (default 0 — breaks are flexible in practice).
- Deleting a shift does **not** cancel existing bookings. It surfaces them as `unrostered` warnings in the rota view so the manager can resolve them deliberately.

## 3. Conflict detection

`GET /api/admin/rota?week=...` returns a `conflicts[]` array alongside the grid:

| Code | Meaning | Suggested fix |
|---|---|---|
| `shift_overlap` | Two shifts for one person overlap | Trim or merge |
| `timeoff_overlap` | Shift falls inside approved leave | Remove shift or decline leave |
| `outside_hours` | Shift starts/ends outside opening hours | Extend hours or adjust |
| `unrostered_booking` | A booking exists on a day with no matching shift | Add a shift |
| `over_capacity` | Booked minutes exceed shift minutes | Add staff or move bookings |
| `no_skill` | Booking's service is not in that staff member's skills | Reassign |

Conflicts are advisory in the UI and blocking only where noted (overlap).

## 4. Availability algorithm

```
slots(serviceIds, staffId, date):
  dur      = Σ duration(serviceIds)
  buffer   = max(buffer(serviceIds))
  block    = dur + buffer
  step     = settings.booking.slot_step_minutes      // 15
  notice   = settings.booking.min_notice_minutes     // 120
  horizon  = settings.booking.horizon_days           // 60

  if date is closed                      → []
  candidates = staff where (staffId = any or id = staffId)
                 and has all skills
                 and has a shift that date
  for each candidate m:
    windows = shift(m, date) minus time_off(m, date) minus booked(m, date)
    for t in grid(windows, step):
      if t >= now + notice and t <= now + horizon
         and [t, t+block) fits inside one free window:
            emit { start:t, end:t+dur, staffId:m }
  dedupe by start (keep first staff), sort ascending
```

Notes:

- `end` returned to the client is the **service end**, not including buffer; buffer stays internal so the next slot can start on time.
- The same person may serve back-to-back bookings with zero gap if buffer = 0.
- "Any staff" returns one slot per start time with the chosen stylist's name, so the client still sees who they got.
- Availability is cached 30 s per `(serviceIds, staffId, month)`.

## 5. Rota UI

```
            Mon 4      Tue 5      Wed 6      Thu 7      Fri 8      Sat 9     Sun 10
 Anya      09-17      09-17      OFF        11-19      09-17      09-15      OFF
 Marcus    10-18      OFF        10-18      10-18      10-18      09-16      OFF
 Priya     OFF        09-17      09-17      09-17      09-17      09-17      OFF
 ...
 [ Copy week →]  [ Apply default pattern]   Conflicts: 2 ⚠
```

- Click a cell → add shift (`start`, `end`, `break`, `notes`).
- Click a shift → edit or delete.
- **Copy week** duplicates into the next week, skipping cells that already have shifts.
- **Apply default pattern** uses each staff member's saved `default_start` / `default_end` / `default_days` (settings per staff, stored in `settings` as `rota.default.<staffId>`).

## 6. Time off

- Requested by staff, approved by manager/owner.
- Only `approved` leave blocks availability.
- Leave spans whole dates (`start_date`..`end_date`, inclusive) — partial days are handled as a shift edit instead.
- Approving leave that clashes with a shift returns the clashing shifts so the manager can act immediately.

## 7. Capacity & utilisation

```
rostered_minutes = Σ (shift_minutes − break_min) for the period
booked_minutes   = Σ appointment service minutes (status not cancelled/no_show)
utilisation      = booked_minutes / rostered_minutes
```

Reported per staff member per week on the dashboard and in `GET /api/admin/reports`.

## 8. Fairness checks (v1.1)

Designed, not built: flag staff whose Saturday count or late finishes exceed the team average by 20%, and warn when a stylist works 6+ consecutive days.

## 9. Edge cases

| Case | Handling |
|---|---|
| Booking made, then shift deleted | Booking survives; rota view flags `unrostered_booking` |
| Two clients book the last slot simultaneously | Second request fails the in-transaction re-check → 409 with alternatives |
| DST change night | All maths in UTC; local dates converted with the salon timezone |
| Staff works across midnight | Not supported in v1 (shift must end same day) |
| Service longer than the shift | No slots emitted; rota shows `over_capacity` if booked |
