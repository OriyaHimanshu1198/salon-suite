# 11 Development Roadmap
Development phases and testing.

## Phase Overview
| Phase | Focus | Duration | Dependencies |
|-------|-------|----------|--------------|
| 1 | Foundation & Treatwell | 3 weeks | None |
| 2 | Loyalty & Birthday Enhancement | 2 weeks | Phase 1 (customer matching) |
| 3 | Marketing Campaign Manager | 3 weeks | Phase 2 (consent fields) |
| 4 | Website Content & Offer Expansion | 3 weeks | Phase 1 |
| 5 | Team Targets & Advanced Analytics | 3 weeks | Phase 3 (campaign data) |
| 6 | AI Data Analyst | 2 weeks | Phase 5 (analytics views) |
| 7 | Hardening & Documentation | 1 week | All phases |

**Total: ~17 weeks**

---

## Phase 1: Foundation & Treatwell (Weeks 1-3)

### Week 1: Treatwell Investigation + Import Foundation
- [ ] Contact Treatwell / review partner docs for API access.
- [ ] Design `TreatwellAdapter` interface (API, CSV, Manual).
- [ ] Create `treatwell_imports` + `treatwell_mappings` tables (migration).
- [ ] Build CSV parser for Treatwell export format (customers + bookings).
- [ ] Admin UI: Import page (upload → preview → confirm).
- [ ] Customer matching: exact phone → auto; fuzzy → review queue.

### Week 2: Booking Import + Dedupe UI
- [ ] Implement booking import (creates appointments with `source='treatwell'`).
- [ ] Dedupe review UI: side-by-side comparison, confirm/reject/merge.
- [ ] Merge logic: preserve all history, update FKs, audit log.
- [ ] Import history table with error details per row.
- [ ] Settings: Treatwell connection status, last sync timestamp.

### Week 3: Integration Hardening
- [ ] Automated scheduled import (if API/webhook available).
- [ ] Webhook handler for real-time updates (if API).
- [ ] Conflict resolution: Treatwell booking modified → update local.
- [ ] Two-way sync design doc (for future).
- [ ] Tests: import idempotency, duplicate handling, rollback.
- [ ] Update 04_BOOKING_AND_TREATWELL.md with final schema/API.

**Deliverable:** Treatwell imports working (CSV fallback minimum), customer matching reviewed, no data loss.

---

## Phase 2: Loyalty & Birthday Enhancement (Weeks 4-5)

### Week 4: Visit-Based Loyalty
- [ ] Create `loyalty_transactions` table (migration).
- [ ] Add `loyalty_visits`, `loyalty_rewards` to `customers`.
- [ ] Implement visit earning on `completed` status.
- [ ] Implement reward unlock at configurable threshold (default 5).
- [ ] Implement redemption at booking/payment (discount applied).
- [ ] Implement reversal on cancellation/no-show.
- [ ] Nightly expiry job for unredeemed rewards.
- [ ] Admin: Loyalty tab on customer profile (ledger, balances, manual adjust).
- [ ] Settings: visits_per_reward, reward_value, expiry_days, min_spend.

### Week 5: Birthday Vouchers
- [ ] Create `birthday_vouchers` table (migration).
- [ ] Extend `runBirthdayJob`: generate unique codes, queue WhatsApp.
- [ ] Voucher validation at booking (min spend, exclusions, window).
- [ ] Redemption tracking (mark voucher used, link appointment).
- [ ] Settings: min_spend, excluded_services, discount_pct, window_days.
- [ ] Admin: Voucher list (filter status/date), manual generate.
- [ ] Public API: validate voucher code for booking wizard.

**Deliverable:** 5-visit = £10 reward working; birthday vouchers with unique codes; all configurable.

---

## Phase 3: Marketing Campaign Manager (Weeks 6-8)

### Week 6: Core Campaign Engine + Email Provider
- [ ] Create `campaigns`, `campaign_templates`, `campaign_sends` tables.
- [ ] Email provider abstraction (SendGrid first).
- [ ] Webhook endpoints for delivery/click/bounce events.
- [ ] Segment builder (predefined + custom SQL preview).
- [ ] Campaign CRUD + preview (render for sample recipients).
- [ ] Scheduler integration: dispatch due campaigns on tick.

### Week 7: SMS + Tracking + Attribution
- [ ] SMS provider abstraction (Twilio).
- [ ] Link wrapping for click tracking (short domain or signed URLs).
- [ ] Booking attribution: read `campaign_id` from session/UTM → update `campaign_sends.booked_at`.
- [ ] Unsubscribe tokens + landing pages (email/SMS).
- [ ] Consent fields on customers (email_opt_in, sms_opt_in, source, version, withdrawn_at).

### Week 8: Reporting + Compliance
- [ ] Campaign report: sent, delivered, opened, clicked, booked, revenue.
- [ ] Dashboard widgets: recent campaigns, performance summary.
- [ ] GDPR/PECR audit: consent records, withdrawal flow, soft opt-in logic.
- [ ] Settings: provider keys, from addresses, tracking domain.
- [ ] Tests: send throttling, bounce handling, unsubscribe immediate effect.

**Deliverable:** Full email/SMS/WhatsApp campaign manager with tracking, attribution, and consent compliance.

---

## Phase 4: Website Content & Offer Expansion (Weeks 9-11)

### Week 9: Content Workflow + Media
- [ ] Extend `site_content`: status, scheduled_for, expires_on, updated_at.
- [ ] Create `content_blocks`, `announcements`, `media` tables.
- [ ] Image upload endpoint (local + S3 config), resize, WebP, EXIF strip.
- [ ] Rich text editor (TipTap) for blocks/announcements.
- [ ] Draft/Preview/Publish/Schedule/Expire workflow.

### Week 10: Public API + Homepage Assembly
- [ ] Public endpoints: `/announcements`, `/content-blocks` (published only).
- [ ] Scheduler: auto-publish scheduled, auto-expire expired.
- [ ] Homepage rendering from blocks (hero, about, stats, loyalty, footer).
- [ ] Announcement display by location (hero, banner, footer, popup).
- [ ] Staff profile images + bio management for public site.

### Week 11: Offers & Announcements Polish
- [ ] Offer placement picker (site, email, SMS).
- [ ] Offer redemption limits + usage reports.
- [ ] Announcement types + priority ordering.
- [ ] Media library UI (grid, search, delete).
- [ ] Preview secret for unauthenticated stakeholder review.
- [ ] Update 08_WEBSITE_CONTENT_MANAGEMENT.md with final schema/API.

**Deliverable:** Full CMS with workflow, media, announcements, offers; decoupled from marketing.

---

## Phase 5: Team Targets & Advanced Analytics (Weeks 12-14)

### Week 12: Targets + Retail + Costs
- [ ] Create `staff_targets`, `team_targets`, `retail_sales`, `service_costs` tables.
- [ ] Admin: Target setting (weekly/monthly per staff + team).
- [ ] Admin: Retail sale recording (product, price, cost, staff, customer).
- [ ] Admin: Service cost entry (product + time cost).
- [ ] Sales report extended: retail revenue, profit margins.

### Week 13: Analytics Modules
- [ ] `analytics.js`: treatmentAnalytics, customerAnalytics, staffAnalytics, marketingAnalytics, cohortRetention.
- [ ] Treatment: popularity, revenue, avg price, repeat rate, profitability.
- [ ] Customer: new/returning/VIP/inactive, retention cohorts, LTV, frequency.
- [ ] Staff: vs targets, rebooking rate, retail, retention, utilisation.
- [ ] Marketing: campaign ROI, birthday voucher conversion, loyalty redemption.
- [ ] API endpoints with date filters, CSV export.

### Week 14: Dashboards + Visualisation
- [ ] Admin dashboard widgets: KPI cards, charts (Chart.js).
- [ ] Staff performance page (individual + team).
- [ ] Customer insights page (segments, cohorts).
- [ ] Treatment profitability page.
- [ ] Marketing attribution page.
- [ ] Export all reports to CSV.

**Deliverable:** Complete analytics suite with targets, retail, costs, charts, exports.

---

## Phase 6: AI Data Analyst (Weeks 15-16)

### Week 15: Query Engine + Guardrails
- [ ] Allow-list of tables/columns for LLM access.
- [ ] Natural language → SQL (structured prompt, few-shot examples).
- [ ] Query validation: read-only, no PII unless owner, timeout 5s, limit 1000 rows.
- [ ] Result formatting: answer text + Chart.js config + CSV.

### Week 16: UI + Testing
- [ ] Admin chat interface (sidebar or modal).
- [ ] Example queries, history, favourite queries.
- [ ] Role-based access (owner/manager only).
- [ ] Adversarial testing: injection attempts, PII leakage, expensive queries.
- [ ] Documentation: example questions, limitations.

**Deliverable:** Working AI analyst for business questions (owner/manager only).

---

## Phase 7: Hardening & Documentation (Week 17)

### Testing
- [ ] Integration tests: booking flow, loyalty, birthday, campaigns, imports.
- [ ] Mobile regression: public site + admin at 380/640/900px.
- [ ] Load test: 30-day availability query < 120ms p95.
- [ ] Security audit: headers, rate limits, auth, SQL injection, XSS.

### Documentation
- [ ] Update all 12 Essential docs with final schemas, APIs, settings.
- [ ] API reference (OpenAPI/Swagger if useful).
- [ ] Deployment guide (systemd, nginx, SSL, backups).
- [ ] Operations runbook (common tasks, troubleshooting).
- [ ] Changelog finalised (12_CHANGELOG.md).

### Deploy Prep
- [ ] `.env.production` template.
- [ ] Backup/restore verified.
- [ ] Monitoring: health endpoint, log aggregation.

**Deliverable:** Production-ready v1.1 with full feature set.

---

## Development Workflow Rules (Per Master Prompt)
For **every phase**:
1. Inspect existing functionality.
2. Explain proposed changes.
3. Identify affected files.
4. Explain database changes.
5. Implement approved changes.
6. Test existing functionality.
7. Test new functionality.
8. Check mobile responsiveness.
9. Report completed work.
10. Update documentation.

**No large unrelated changes. No next phase until current reviewed.**

---

## Risk Mitigation
| Risk | Mitigation |
|------|------------|
| Treatwell API unavailable | CSV import built first; adapter pattern allows swap |
| SQLite scaling limits | Single-location MVP; document migration path to Postgres |
| Email/SMS provider costs | Configurable; start with free tiers (SendGrid 100/day, Twilio trial) |
| AI hallucination | Strict allow-list, read-only, row limits, owner-only access |
| Scope creep | Phase gates; no new features without approval |

---

## Success Criteria (v1.1)
- Treatwell imports (CSV) working daily.
- 5-visit loyalty live; birthday vouchers sending.
- Email/SMS/WhatsApp campaigns with attribution.
- Full CMS with draft/publish/schedule.
- Staff targets + analytics dashboards.
- AI analyst answering top 10 business questions.
- All mobile responsive, accessible, tested.
- Documentation complete.