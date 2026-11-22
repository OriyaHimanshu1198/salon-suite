# WhatsApp Messaging

## 1. Two modes, one queue

Every message is a row in `notifications`. How it leaves the building depends on `whatsapp.mode`:

| Mode | Trigger | Behaviour |
|---|---|---|
| `link` (default) | Staff clicks **Send** | API returns a `https://wa.me/<number>?text=<encoded>` link; the phone opens WhatsApp with the message ready. Zero cost, zero setup. |
| `api` | Scheduler tick | `POST https://graph.facebook.com/v21.0/<PHONE_ID>/messages` with a template or text body. Requires `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_ID`. |

Mode is chosen automatically: if both env vars exist, `api`; otherwise `link`. Staff can override in Settings.

## 2. Templates

Stored in `message_templates`, editable in **Messages → Templates**. Placeholders use `{{snake_case}}`.

| Key | When | Body (default) |
|---|---|---|
| `booking_confirmed` | Booking created/confirmed | `Hi {{first_name}}, your {{service_list}} at {{salon_name}} is confirmed for {{date}} at {{time}} with {{staff_name}}. Ref {{reference}}. Reply STOP to opt out.` |
| `reminder_24h` | `reminder_hours` before start | `Reminder: {{service_list}} tomorrow at {{time}} with {{staff_name}} at {{salon_name}}. Ref {{reference}}. See you then! 💫` |
| `booking_cancelled` | Status → cancelled | `Hi {{first_name}}, your {{date}} {{time}} appointment has been cancelled. Ref {{reference}}. Call {{salon_phone}} to rebook.` |
| `booking_rescheduled` | Time changed | `Hi {{first_name}}, your appointment has moved to {{date}} at {{time}} with {{staff_name}}. Ref {{reference}}.` |
| `thank_you` | Status → completed | `Thank you {{first_name}}! We hope you love the {{service_list}}. Leave a review: {{review_url}} — rebook anytime: {{booking_url}}` |
| `waitlist_open` | Slot frees up | `Good news {{first_name}} — we have a {{service_list}} slot on {{date}} at {{time}}. Book: {{booking_url}}` |
| `offer_broadcast` | Campaign | `{{offer_title}} — {{offer_description}} {{offer_code_line}} Book: {{booking_url}} Reply STOP to opt out.` |
| `payment_receipt` | Payment recorded | `Payment of {{amount}} received for {{date}}. Balance: {{balance}}. Thank you!` |

Rendering replaces known keys and leaves unknown placeholders untouched (so staff can spot a typo instead of seeing a blank).

## 3. Lifecycle

```
create booking
   ├─ booking_confirmed   → sent immediately
   └─ reminder_24h        → scheduled_for = start − reminder_hours (min: now + 60s)

status: cancelled
   ├─ booking_cancelled   → immediate
   ├─ staff alert         → immediate (internal, channel='internal')
   └─ waitlist_open       → immediate to matching waiting clients (max 5)

status: completed
   ├─ thank_you           → immediate
   └─ loyalty points + spend counters updated

tick (every 60 s)
   └─ notifications WHERE status='queued' AND scheduled_for <= now → send
```

## 4. Retry policy

| Attempt | Delay before next try |
|---|---|
| 1 | 2 min |
| 2 | 10 min |
| 3 | 60 min |
| 4 | 6 h |
| 5 | give up → `failed` |

`last_error` stores the provider message. The outbox shows a **Retry** button that resets `attempts` to 0.

## 5. Consent & compliance

- `customers.whatsapp_opt_in` gates **all** automated sends except booking confirmations the client just made themselves (transactional).
- `customers.marketing_opt_in` additionally gates `offer_broadcast`.
- Consent changes are timestamped in `consent_at`.
- Inbound `STOP` / `UNSUBSCRIBE` on the webhook flips both flags to 0 and replies with a confirmation.
- Broadcasts are throttled: 1 message per 2 seconds, batches of 50, and never sent outside 08:00–20:00 salon time.
- Every message ends with an opt-out line when it is marketing.

## 6. Cloud API setup (optional)

1. Create a Meta app → WhatsApp → get a test number and permanent token.
2. Put in `.env`:
   ```
   WHATSAPP_TOKEN=EAAG...
   WHATSAPP_PHONE_ID=1234567890
   WHATSAPP_VERIFY_TOKEN=pick-a-random-string
   ```
3. Register the webhook URL `https://your-domain/api/webhooks/whatsapp` and subscribe to `messages`.
4. Restart. `GET /api/admin/settings` now reports `whatsappMode: "api"`.

**Template approval:** the Cloud API only allows free-form text within 24 h of the client's last message. For reminders and marketing, submit the equivalent templates in Meta Business Manager. The adapter sends free-form text in sandbox mode and can be switched to named templates via `settings.whatsapp.use_named_templates`.

## 7. Without the API (most salons start here)

The outbox becomes a **task list**:

1. Booking created → row appears with a green **WhatsApp** button.
2. Reception taps it → WhatsApp opens on their phone with the message pre-filled → tap send.
3. They tap **Mark sent** in the app so the log stays truthful.

This is deliberately manual: it needs no business verification, no template approval, and works on day one.

## 8. Internal alerts

`channel='internal'` rows are not sent anywhere. They render in the admin **Messages → Alerts** tab (new booking, cancellation, no-show, failed send) so the team sees operational events without a separate notification system.

## 9. Testing

```bash
# generate a message without sending
npm run wa:preview -- booking_confirmed appointment=<id>

# inspect the queue
sqlite3 data/salon.db "select template_key,status,to_phone,scheduled_for from notifications order by created_at desc limit 10;"
```
