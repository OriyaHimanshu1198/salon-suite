# Salon Suite — Overview

**Status:** v1 build (MVP complete, single-location)
**Owner:** Salon operator
**Purpose:** Run a hair/beauty salon end to end — the public website, the booking engine, the staff rota, the client book, and WhatsApp messaging — from one small, self-hosted application.

---

## 1. The problem

A salon typically runs on a paper diary, a WhatsApp group, and an Instagram page. That creates five recurring failures:

1. **Double bookings** — two stylists promise the same chair.
2. **No-shows** — nobody reminds the client, so the slot is wasted.
3. **Rota drift** — the published opening hours do not match who is actually working.
4. **Website rot** — prices, offers and treatments live in a PDF or a story that expires.
5. **No memory** — client preferences, allergies and spend history live in one person's head.

## 2. What this system does

| Area | Outcome |
|---|---|
| Public website | Live services, prices, staff, offers and a self-serve booking flow |
| Booking engine | Real availability from opening hours × rota × existing bookings |
| Client book | Contact details, preferences, allergies, visit history, spend, consent flags |
| Staff records | Skills, working pattern, time off, commission, colour coding |
| Rota builder | Weekly shifts per staff member, conflict detection, copy-forward |
| WhatsApp | Confirmations, 24h reminders, cancellations, waitlist and campaign broadcasts |
| Website manager | Edit hero copy, contact details and promotions without touching code |
| Management dashboard | Today's schedule, revenue, utilisation, no-show rate, top services |

## 3. Who uses it

| Role | Sees | Can do |
|---|---|---|
| **Owner** | Everything | All actions, settings, staff pay/commission, site content |
| **Manager** | Everything except billing settings | Schedule, rota, clients, campaigns |
| **Receptionist** | Calendar, clients, messages | Book, move, cancel, take payment notes |
| **Stylist / Therapist** | Own column of the calendar, own clients | View own day, mark complete/no-show, add notes |
| **Client (public)** | Website | Book, reschedule, cancel, join waitlist |

## 4. Design principles

- **One source of truth.** Availability is computed, never hand-typed. If the rota says 10:00–18:00 and there is a 45-minute colour at 10:00, the next slot is 11:00 (plus buffer).
- **Small footprint.** One Node process, one SQLite file, no build step, no external services required to run.
- **Graceful degradation.** WhatsApp works with zero credentials (click-to-send links) and upgrades to the official Cloud API when a token is supplied.
- **Nothing destructive.** Cancellations are status changes, not deletes. Every mutation is audit-logged.
- **Mobile-first staff UX.** The front desk is often a tablet.

## 5. Scope of v1

**In scope:** single salon, single timezone, GBP pricing, English copy, staff-level rota, per-service duration/price, multi-service bookings, deposits as recorded amounts (no card processing), WhatsApp outbox with templates, offers/promotions, public site content editing, CSV export.

**Out of scope (v1):** multi-branch, card payments/Stripe, payroll, stock/inventory, gift cards, native mobile apps, SMS/email providers (interfaces are stubbed), automated two-way WhatsApp chat.

## 6. Non-functional targets

- Public booking page: interactive in under 1.5 s on 4G, no JavaScript framework download.
- API p95 under 120 ms locally for a 30-day availability query.
- Data safety: nightly copy of the SQLite file (`npm run backup`), audit log retained indefinitely.
- Accessibility: keyboard-navigable booking flow, WCAG AA contrast on the public site.

## 7. Documents

| File | Contents |
|---|---|
| `01-features.md` | Feature register with IDs and acceptance criteria |
| `02-architecture.md` | Stack, folder map, request flow, security model |
| `03-data-model.md` | Full schema, relationships, indexes |
| `04-api.md` | Every endpoint, payload and response |
| `05-whatsapp.md` | Templates, opt-in rules, queue, Cloud API adapter |
| `06-rota.md` | Rota rules, conflict detection, availability maths |
| `07-roadmap.md` | Build order and what comes after v1 |
