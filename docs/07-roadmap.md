# Roadmap

## Phase 1 — Foundation (this build)

- [x] Schema, migrations, seed data
- [x] Auth, roles, sessions, rate limits
- [x] Availability engine + conflict detection
- [x] Public site: services, staff, offers, booking wizard, lookup, cancel, waitlist
- [x] Admin: dashboard, calendar, clients, services, staff, rota, time off, offers, site content, messages, reports, settings
- [x] WhatsApp outbox with templates, retries, `wa.me` and Cloud API adapter
- [x] Audit log, CSV export, backup script

## Phase 2 — Daily-driver polish (next 2 weeks)

- [ ] Drag-and-drop rota
- [ ] Two-way WhatsApp inbox (read replies, reply from the app)
- [ ] Card deposits via Stripe Checkout
- [ ] Email channel alongside WhatsApp (nodemailer adapter)
- [ ] PWA install for staff tablets
- [ ] Calendar sync (ICS feed + Google Calendar push)
- [ ] Recurring appointments (every N weeks)

## Phase 3 — Growth (month 2)

- [ ] Multi-branch with per-branch rota and pricing
- [ ] Online gift vouchers
- [ ] Package deals ("6 cuts for the price of 5")
- [ ] Automated win-back campaign for lapsed clients
- [ ] Review capture + Google review deep link
- [ ] Inventory: colour stock deducted per service formula
- [ ] Payroll export from commission report

## Phase 4 — Scale (quarter 2)

- [ ] Postgres migration path (same schema, `pg` adapter)
- [ ] Queue worker split (BullMQ/Redis) for messaging
- [ ] Public API keys for partner integrations
- [ ] Multi-language site content
- [ ] Mobile apps (React Native) over the same API

## Definition of done (per feature)

1. Documented in `01-features.md` with an ID.
2. API contract in `04-api.md`.
3. Server-side validation with a friendly message.
4. Permission check.
5. Audit row on mutation.
6. Works at 375 px width and by keyboard.
7. Seed data still loads (`npm run reset`).

## Known limits of v1

- Single process, single SQLite file — fine to roughly 20 staff / 2,000 bookings a month.
- WhatsApp Cloud API needs approved templates for proactive messages.
- No payment processing; deposits are recorded, not charged.
- No email sending out of the box.
