# Architecture

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Runtime | Node.js 24+ (built and tested on 26) | Already on the machine, no JVM/Python needed |
| HTTP | Express 5 | One dependency, boring and stable |
| Database | `node:sqlite` (built into Node) | Zero native builds, single file, trivial backup |
| Auth | `node:crypto` scrypt + HMAC-signed cookie | No external auth service |
| Frontend | Static HTML + vanilla ES modules | No bundler, no `npm run build`, instant edits |
| Styling | Hand-written CSS with custom properties | Design system without a framework |
| Messaging | WhatsApp Cloud API **or** `wa.me` deep links | Works offline, upgrades with a token |
| Scheduler | In-process `setInterval` (60 s tick) | No cron/queue infrastructure |

Deliberate trade-off: a single process means no horizontal scaling. For one salon that is the correct trade.

## 2. Folder map

```
salon-suite/
├── package.json
├── .env.example
├── README.md
├── docs/                    ← these documents
├── data/
│   └── salon.db             ← created on first run (gitignored)
├── scripts/
│   ├── backup.mjs
│   └── reset.mjs
├── server/
│   ├── index.js             ← app bootstrap, static hosting, scheduler
│   ├── db.js                ← schema, migrations, seed
│   ├── auth.js              ← hashing, sessions, guards
│   ├── util.js              ← dates, ids, validation helpers
│   ├── scheduling.js        ← availability + conflict engine
│   ├── whatsapp.js          ← templates, outbox, dispatch
│   └── routes/
│       ├── public.js        ← website + booking API (no auth)
│       └── admin.js         ← management API (auth)
└── public/
    ├── index.html           ← public salon website
    ├── admin.html           ← management console
    ├── css/site.css
    ├── css/admin.css
    └── js/
        ├── api.js
        ├── site.js
        └── admin.js
```

## 3. Request flow

```
Browser ──HTTP──> Express
                    ├─ /            → public/index.html  (static)
                    ├─ /admin       → admin.html         (static, guarded by client + API)
                    ├─ /api/public/*→ routes/public.js   (rate-limited, no auth)
                    └─ /api/admin/* → auth middleware → routes/admin.js
                                            │
                                            ├─ scheduling.js  (availability, conflicts)
                                            ├─ whatsapp.js    (queue, dispatch)
                                            └─ db.js          (node:sqlite)
```

Every admin mutation: **validate → authorise → write → audit → queue messages → respond**.

## 4. Scheduling model

A bookable slot for service `s`, staff `m`, at time `t` exists when **all** of these hold:

1. `t` is inside the salon's opening hours for that weekday.
2. A `shift` row exists for `m` on that date covering `[t, t + duration + buffer]`.
3. No `time_off` row for `m` overlaps that window.
4. No non-cancelled `appointment` for `m` overlaps that window (including buffers).
5. `m` has the required skill for every service in the basket.
6. `t` is at least `min_notice_minutes` in the future and not beyond the booking horizon.

Slots are generated on a grid of `slot_step_minutes` (default 15) between the day's earliest shift start and latest shift end.

Multi-service bookings are treated as one continuous block: `duration = Σ service.duration + max(buffer)`.

## 5. Data integrity rules

- `appointments` stores `start_at`/`end_at` as **UTC ISO-8601**; display converts to `salon.timezone`.
- Overlap is enforced twice: in `scheduling.js` (friendly error) and by a transaction-level re-check immediately before insert (race safety).
- `customers.phone` is unique and normalised to E.164-ish digits.
- Cancellations never delete rows; `status='cancelled'` plus `cancelled_at`.
- Deleting a service/staff member is a soft `active=0` when referenced by history.

## 6. Security model

| Threat | Control |
|---|---|
| Password theft | scrypt (N=16384) with per-user salt; constant-time compare |
| Session forgery | HMAC-SHA256 over `{uid,exp}` with `SESSION_SECRET` |
| XSS | All user text rendered via `textContent` / escaped template helper; no `innerHTML` with raw input |
| CSRF | `SameSite=Lax` cookie + `Origin` check on state-changing admin routes |
| SQL injection | Prepared statements only |
| Brute force | In-memory rate limiter: 8 login attempts / 15 min / IP |
| Enumeration | Login always returns the same message |
| Privilege escalation | `requireRole()` on every privileged route |
| Booking spam | 20 public bookings / hour / IP |
| Data loss | `npm run backup` + WAL mode |

Secrets live in `.env` (never committed): `SESSION_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`.

## 7. Availability performance

A 30-day availability query is one SQL pass per staff member over the date window, then pure in-memory interval maths. With 8 staff and 400 bookings the query stays under 10 ms locally; results are cached for 30 s per `(service, staff, month)` key.

## 8. Frontend architecture

Both frontends are plain ES modules sharing `api.js`:

- `api.js` — `request()` wrapper, error normalisation, `el()` helper, `escapeHtml`, money/date formatting.
- `site.js` — renders site content, service menu, offers, staff, then drives the 6-step booking wizard and lookup.
- `admin.js` — hash router (`#/dashboard`, `#/calendar`, `#/clients`, `#/staff`, `#/services`, `#/rota`, `#/offers`, `#/messages`, `#/settings`), each view a render function with its own fetch + handlers.

State is intentionally local to each view; no global store. A view re-renders from the API after every mutation, which keeps the UI honest about server truth.

## 9. Failure behaviour

| Failure | Behaviour |
|---|---|
| WhatsApp API down | Message stays `queued`, retried with exponential backoff up to 5 attempts, then `failed` with the error shown in the outbox |
| No WhatsApp credentials | Message is generated as a `wa.me` link; staff click to send from their own phone |
| DB locked | `busy_timeout=5000`, WAL mode; writes serialise |
| Invalid session | 401 → frontend redirects to login |
| Stale availability | Server re-validates on write and returns `409` with the conflicting slot |
