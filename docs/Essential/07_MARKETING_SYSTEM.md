# 07 Marketing System
Email, SMS and customer consent.

## Current Implementation
- **WhatsApp Broadcast:** `/api/admin/broadcast` with segment (`marketing`, `vip`, `colour`, `nails`, `new`, `lapsed`, `consent`).
- **Templates:** `message_templates` table (key, name, body, enabled). Placeholders: `{{first_name}}`, `{{offer_title}}`, etc.
- **Consent:** `customers.whatsapp_opt_in` (transactional + marketing), `marketing_opt_in` (broadcast gate).
- **Opt-out:** Inbound `STOP` via webhook flips both to 0.
- **Throttle:** 1 msg/2s, batches of 50, quiet hours 08:00–20:00.
- **Tracking:** `notifications` table (status: queued/sent/failed, attempts, last_error, wa_link).

## Gaps vs Target Platform
| Target Requirement | Current State | Gap |
|--------------------|---------------|-----|
| Campaign Manager (create, template, segment, schedule, send) | ❌ | Ad-hoc broadcast only |
| Email Channel | ❌ | WhatsApp only |
| SMS Channel | ❌ | WhatsApp only |
| Delivery Tracking | ⚠️ WhatsApp only | Need email/SMS provider webhooks |
| Click Tracking | ❌ | No link wrapping |
| Booking Attribution | ❌ | No UTM/campaign_id on booking |
| Unsubscribe Management | ⚠️ WhatsApp STOP only | Need email/SMS unsubscribe endpoints |
| Campaign History | ⚠️ notifications table only | No campaign-level grouping |
| Consent per Channel | ⚠️ Single marketing_opt_in | Need email_opt_in, sms_opt_in separate |

## Required Schema Changes
```sql
-- Campaigns
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  template_id TEXT NOT NULL,           -- references message_templates or campaign_templates
  segment_key TEXT NOT NULL,           -- 'vip', 'lapsed', 'birthday_month', 'custom_sql'
  segment_sql TEXT,                    -- custom WHERE clause for custom_sql
  status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, sending, sent, paused
  scheduled_for TEXT,                  -- ISO timestamp
  sent_at TEXT,
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  delivered_count INTEGER NOT NULL DEFAULT 0,
  clicked_count INTEGER NOT NULL DEFAULT 0,
  booked_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_campaign_status ON campaigns(status, scheduled_for);

-- Campaign Templates (channel-specific)
CREATE TABLE campaign_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp')),
  subject TEXT,                        -- email only
  preheader TEXT,                      -- email only
  body TEXT NOT NULL,                  -- HTML for email, text for SMS/WhatsApp
  variables TEXT NOT NULL DEFAULT '[]', -- JSON array of placeholder names
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Campaign Sends (per-recipient tracking)
CREATE TABLE campaign_sends (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, sent, delivered, failed, bounced, clicked, booked
  provider_message_id TEXT,
  sent_at TEXT,
  delivered_at TEXT,
  clicked_at TEXT,
  booked_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_campaign_sends_campaign ON campaign_sends(campaign_id);
CREATE INDEX idx_campaign_sends_customer ON campaign_sends(customer_id);

-- Customer Consent (extends customers table - see 05_CUSTOMER_CRM.md)
-- email_opt_in, sms_opt_in, email_consent_at, sms_consent_at,
-- email_consent_source, sms_consent_source, email_consent_version, sms_consent_version,
-- email_withdrawn_at, sms_withdrawn_at

-- Unsubscribe Tokens
CREATE TABLE unsubscribe_tokens (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms')),
  token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  used_at TEXT
);
```

## Provider Integration (Pluggable)
```js
// server/providers/email.js
export async function sendEmail({ to, subject, html, text, campaignId, sendId }) { ... }
export function verifyWebhook(payload) { ... }

// server/providers/sms.js
export async function sendSMS({ to, body, campaignId, sendId }) { ... }
export function verifyWebhook(payload) { ... }
```
- Config via settings: `email.provider` (sendgrid|resend|mailgun), `sms.provider` (twilio|vonage).
- Webhooks: `/api/webhooks/email`, `/api/webhooks/sms` → update `campaign_sends`.

## Segment Builder
- Predefined: `vip`, `colour`, `nails`, `new` (30d), `lapsed` (90d), `marketing`, `birthday_month`, `has_package`.
- Custom SQL: Admin writes `WHERE` clause (validated against allow-list of columns).
- Preview: Shows count + sample 10 customers before send.

## Campaign Workflow
1. **Create:** Name, channel, template, segment, schedule (now or later).
2. **Preview:** Render template for sample recipients; show count.
3. **Schedule/Send:** Insert `campaign` row (status=`scheduled` or `sending`).
4. **Dispatch (scheduler tick):**
   - For each recipient: check consent, create `campaign_sends` (pending), call provider.
   - Update `campaign_sends` with provider response.
   - Throttle per provider limits.
5. **Track:** Webhooks update `delivered_at`, `clicked_at`.
6. **Attribution:** Booking flow reads `campaign_id` from session/cookie/UTM → links to `campaign_sends.booked_at`.
7. **Report:** Open rate, click rate, booking rate, revenue attributed.

## API Endpoints
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/admin/campaigns` | List campaigns (filter: status, channel) |
| POST | `/api/admin/campaigns` | Create campaign |
| GET | `/api/admin/campaigns/:id` | Campaign detail + sends summary |
| PATCH | `/api/admin/campaigns/:id` | Update (draft only) |
| POST | `/api/admin/campaigns/:id/schedule` | Set scheduled_for |
| POST | `/api/admin/campaigns/:id/send` | Send now (bypass schedule) |
| POST | `/api/admin/campaigns/:id/pause` | Pause sending |
| GET | `/api/admin/campaigns/:id/sends` | Paginated sends list |
| GET | `/api/admin/campaigns/:id/report` | Aggregated metrics |
| GET | `/api/admin/templates` | List campaign_templates |
| POST | `/api/admin/templates` | Create template |
| PATCH | `/api/admin/templates/:id` | Update template |
| GET | `/api/admin/segments/preview` | POST { segment_key, segment_sql } → { count, sample[] } |
| GET | `/api/public/unsubscribe/:token` | Landing page (email/SMS) |
| POST | `/api/public/unsubscribe/:token` | Confirm unsubscribe |

## Consent Compliance (UK GDPR + PECR)
- **Soft Opt-in:** Existing customers → can market similar services (email/SMS) if opt-out offered every time.
- **Explicit Consent:** New customers → must tick unticked box per channel.
- **Record:** Source (`booking`, `website`, `in_salon`, `import`), version (privacy policy version), timestamp.
- **Withdrawal:** One-click unsubscribe → immediate `*_withdrawn_at`, `*_opt_in=0`.
- **Transactional vs Marketing:** Booking confirmations/reminders always sent (legitimate interest). Marketing requires opt-in.
- **Treatwell Bookings:** Do NOT auto-opt-in to salon marketing. Separate consent capture required.

## Settings Additions
```js
'email.provider': 'sendgrid',
'email.api_key': '',           // in .env
'email.from_address': 'hello@lumiere-salon.co.uk',
'email.from_name': 'Lumière Hair & Beauty',
'sms.provider': 'twilio',
'sms.account_sid': '',         // in .env
'sms.auth_token': '',          // in .env
'sms.from_number': '+447700900123',
'marketing.utm_source': 'salon-suite',
'marketing.tracking_domain': 'track.lumiere-salon.co.uk', // optional custom domain
```