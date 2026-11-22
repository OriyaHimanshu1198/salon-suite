# Changelog

All notable changes to Salon Suite are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses semantic versioning as
declared in `package.json`.

**Important:** the repository has no tagged releases or release dates recorded. The `1.0.0` entry
below describes the current code baseline, not a dated launch. Add a dated entry for every future
change.

---

## [Unreleased]

### Added — 22 November 2026

- `docs/PROJECT_OVERVIEW.md` — stack, repository map, request flow, roles, configuration, security
  posture, scope and verified implementation gaps.
- `docs/DESIGN_GUIDELINES.md` — colour tokens, typography, layout, components, responsive rules,
  accessibility and a consistency checklist.
- `docs/WORKFLOW.md` — public booking, availability algorithm, appointment lifecycle, packages,
  birthdays, reviews, website content, clients, rota, messaging, reporting and settings.
- `docs/DATABASE.md` — every table and column, relationships and deletion rules, settings defaults,
  seed data, conventions, reporting caveats and migration guidance.
- `docs/FEATURES.md` — feature register with implementation status and the full endpoint appendix.
- `docs/FUTURE_ROADMAP.md` — prioritised correctness fixes, operational work and growth proposals.
- `docs/CHANGELOG.md` — this file.

### Changed

- Documentation only. No source code, stylesheet, template, database schema, seed data or runtime
  configuration was modified.

### Fixed

- Nothing in this change. The documentation records existing issues rather than resolving them; see
  `FUTURE_ROADMAP.md` P0.

### Notes

- The seven new files sit alongside the earlier numbered specifications (`00-overview.md` through
  `08-extras.md`). Where the two sets disagree, the current code and the new documents take
  precedence.
- Verified implementation gaps are listed in `PROJECT_OVERVIEW.md` §12 and tracked in
  `FUTURE_ROADMAP.md`.

---

## [1.0.0] — Current build baseline

No release date is recorded in the repository. `package.json` declares `"version": "1.0.0"`.

### Public website

- Single-page salon site served at `/` with editable hero, about, contact and footer content.
- Notice bar with gold and plum tones and per-message dismissal.
- Service menu grouped by category with prices and durations.
- Team profiles with accent colours, titles and bios.
- Opening hours with closed-day rendering.
- Time-limited offers with promo codes and linked services.
- Curated reviews with aggregate rating and optional Google Places sync.
- Treatment package showcase and inline online reservation.
- Birthday promotion band and automatic birthday discount at booking.
- Social links for Instagram, Facebook, TikTok, Google, YouTube and WhatsApp.
- Five-step booking wizard with multi-service basket and live availability.
- Booking lookup and self-service cancellation with a notice window.

### Booking and diary

- Shared availability engine for public and console bookings.
- Qualified-staff matching through `staff_skills`.
- Shift and approved-time-off awareness.
- Notice period, booking horizon, slot stepping and conflict re-check.
- Alternative slot suggestions on conflict.
- Booking references in the `LS-XXXX` format.
- Appointment statuses: pending, confirmed, arrived, completed, no-show, cancelled.
- Reschedule, notes, internal notes, payment recording and package redemption.
- Dashboard KPIs, day list, team sales and upcoming birthdays.
- Calendar view with one column per active staff member.

### Clients and team

- Client book with search, segments, tags, preferences, allergies, formula notes and consent flags.
- Appointment history, notification history, next appointment and package summary.
- Owner-only GDPR erasure.
- Staff records with skills, commission, employment type, colour and optional login link.
- Weekly rota with shift creation, copy week, pattern fill, time-off requests and approvals.
- Rota conflict warnings for overlaps, leave, outside-hours and unrostered bookings.

### Packages

- Package plans with paid sessions, free sessions, covered services, price and validity.
- Online reservation and in-salon sale.
- Payment recording capped at the plan price.
- Session redemption with optional appointment discounting.
- Free-session and completion messaging.
- Lazy expiry and owner/manager cancellation.
- Staff sales attribution where a linked staff member exists.

### Messaging

- WhatsApp outbox with twelve seeded templates.
- Click-to-send `wa.me` mode and optional Meta Cloud API mode.
- Automatic confirmation, reminder, cancellation, reschedule, thank-you, package and birthday
  messages.
- Internal alerts surfaced on the dashboard.
- Segment broadcasts with a 200-customer cap.
- Retry backoff and manual mark-sent.
- Inbound webhook for STOP/START style opt-outs and opt-ins.

### Reporting and operations

- Staff sales report with service and package revenue, commission and breakdowns.
- Sales CSV export.
- Period report with daily revenue, staff performance, top services, top clients and utilisation.
- Audit log for mutations, logins and key actions.
- Settings read for all roles (session secret removed) and owner-only writes.
- Health check, seed, reset and backup scripts.
- Birthday job and WhatsApp dispatch loop every 60 seconds.

### Known issues in this baseline

- Client and appointment CSV routes are shadowed by parameterised routes and return 404.
- `services.online_bookable` is stored but not enforced.
- Shift breaks do not reduce availability; `rota.block_break` is unused.
- WhatsApp quiet hours are stored but unused.
- Loyalty points accrue but cannot be redeemed.
- Online package sales are excluded from staff sales rows.
- Some reporting uses UTC rather than salon-local day boundaries.
- Staff service revenue and daily service revenue use different bases.
- No user administration, password reset or MFA.
- No automated tests, linter or CI configuration.
- No scheduled backup.

---

## Versioning policy

| Change type | Version bump |
|---|---|
| Breaking API, schema or data-format change | Major |
| New feature, endpoint, table or user-visible behaviour | Minor |
| Bug fix, copy change, styling correction, documentation | Patch |

Until a release process exists, use `[Unreleased]` for work in progress and add a dated section when
the build is deployed.

---

## How to update this file

Add a short entry under `[Unreleased]` in the same change as the code:

```markdown
### Added
- Public waitlist form on the booking step.

### Changed
- Availability now subtracts shift breaks.

### Fixed
- Client and appointment CSV exports return files instead of 404.
```

Rules:

- Write for a reader who needs to know what changed and whether it affects them.
- Reference the affected document when behaviour, schema or design changes.
- Do not list internal refactors unless they change behaviour or operations.
- Move items out of `FUTURE_ROADMAP.md` when they ship.
- Never rewrite past entries; add a correction note instead.
