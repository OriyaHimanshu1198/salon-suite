import { q, q1, run, getSetting } from './db.js';
import {
  nowIso, utcToZoned, waNumber, addMinutes, money, HttpError, id, todayIn,
} from './util.js';

const tz = () => getSetting('salon.timezone') || 'Europe/London';
const siteUrl = () => process.env.SITE_URL || `http://localhost:${process.env.PORT || 4321}`;

export function template(key) {
  return q1('SELECT * FROM message_templates WHERE key = ? AND enabled = 1', key);
}

export function render(templateKey, vars) {
  const tpl = template(templateKey);
  if (!tpl) return null;
  return tpl.body.replace(/\{\{(\w+)\}\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
}

export function appointmentVars(appointmentId) {
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a) return null;
  const customer = q1('SELECT * FROM customers WHERE id = ?', a.customer_id);
  const staff = q1('SELECT * FROM staff WHERE id = ?', a.staff_id);
  const items = q('SELECT * FROM appointment_items WHERE appointment_id = ? ORDER BY sort_order', appointmentId);
  const when = utcToZoned(a.start_at, tz());
  return {
    first_name: customer?.first_name || 'there',
    last_name: customer?.last_name || '',
    service_list: items.map((i) => i.name_snapshot).join(' + '),
    staff_name: staff?.name || 'our team',
    date: new Date(a.start_at).toLocaleDateString('en-GB', {
      timeZone: tz(), weekday: 'short', day: 'numeric', month: 'short',
    }),
    time: when.time,
    reference: a.reference,
    salon_name: getSetting('salon.name'),
    salon_phone: q1("SELECT value FROM site_content WHERE key = 'phone'")?.value || '',
    review_url: getSetting('reviews.url') || 'https://g.page/r/review',
    booking_url: `${siteUrl()}/#book`,
    amount: money(a.paid_pence),
    balance: money(a.total_pence - a.paid_pence),
    offer_title: '', offer_description: '', offer_code_line: '',
  };
}

export function buildLink(phone, body) {
  const country = getSetting('salon.country_code') || '44';
  return `https://wa.me/${waNumber(phone, country)}?text=${encodeURIComponent(body)}`;
}

/** Create one outbox row. Returns the notification id. */
export function queue({
  customerId = null, appointmentId = null, templateKey, when = null,
  channel = 'whatsapp', toPhone = null, body = null, vars = null,
}) {
  const target = toPhone
    || q1('SELECT phone FROM customers WHERE id = ?', customerId)?.phone
    || '';
  const text = body ?? render(templateKey, vars || (appointmentId ? appointmentVars(appointmentId) : {}));
  if (!text) return null;
  const scheduled = when || nowIso();
  const notifId = id('ntf');
  run(
    `INSERT INTO notifications (id,customer_id,appointment_id,channel,template_key,to_phone,body,status,
       scheduled_for,attempts,last_error,wa_link,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,0,'',?,?)`,
    notifId, customerId, appointmentId, channel, templateKey, target, text, 'queued', scheduled,
    channel === 'whatsapp' ? buildLink(target, text) : '', nowIso(),
  );
  return notifId;
}

export function internalAlert(text, { appointmentId = null, customerId = null } = {}) {
  run(
    `INSERT INTO notifications (id,customer_id,appointment_id,channel,template_key,to_phone,body,status,
       scheduled_for,attempts,last_error,wa_link,created_at)
     VALUES (?,?,?,'internal','internal_alert','',?,'queued',?,0,'','',?)`,
    id('ntf'), customerId, appointmentId, text, nowIso(), nowIso(),
  );
}

export function queueReminder(appointmentId) {
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a || a.status === 'cancelled') return null;
  const hours = Number(getSetting('whatsapp.reminder_hours') || 24);
  const due = addMinutes(a.start_at, -hours * 60);
  const when = new Date(Math.max(new Date(due).getTime(), Date.now() + 60_000)).toISOString();
  return queue({ customerId: a.customer_id, appointmentId, templateKey: 'reminder_24h', when });
}

export function queueConfirmation(appointmentId) {
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a) return null;
  return queue({ customerId: a.customer_id, appointmentId, templateKey: 'booking_confirmed' });
}

export function queueCancellation(appointmentId, reason = '') {
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a) return null;
  const vars = appointmentVars(appointmentId);
  queue({ customerId: a.customer_id, appointmentId, templateKey: 'booking_cancelled', vars });
  const staff = q1('SELECT name FROM staff WHERE id = ?', a.staff_id);
  internalAlert(
    `Cancelled: ${vars.first_name} ${vars.last_name} · ${vars.service_list} · ${vars.date} ${vars.time} with ${staff?.name}${reason ? ` · ${reason}` : ''}`,
    { appointmentId, customerId: a.customer_id },
  );
  notifyWaitlist(appointmentId);
}

export function queueReschedule(appointmentId) {
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a) return null;
  queue({ customerId: a.customer_id, appointmentId, templateKey: 'booking_rescheduled' });
}

export function queueThankYou(appointmentId) {
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a) return null;
  queue({ customerId: a.customer_id, appointmentId, templateKey: 'thank_you' });
}

export function notifyWaitlist(appointmentId) {
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a) return null;
  const date = utcToZoned(a.start_at, tz()).date;
  const entries = q(
    `SELECT w.*, c.first_name, c.phone FROM waitlist w JOIN customers c ON c.id = w.customer_id
     WHERE w.status = 'waiting' AND w.from_date <= ? AND w.to_date >= ?
       AND (w.staff_id IS NULL OR w.staff_id = ?)
     ORDER BY w.created_at LIMIT 5`,
    date, date, a.staff_id,
  );
  for (const entry of entries) {
    const vars = appointmentVars(appointmentId);
    vars.first_name = entry.first_name;
    queue({
      customerId: entry.customer_id, appointmentId, templateKey: 'waitlist_open',
      toPhone: entry.phone, vars,
    });
    run("UPDATE waitlist SET status = 'notified' WHERE id = ?", entry.id);
  }
}

/* ── delivery ───────────────────────────────────────────────────────────── */

export function whatsappMode() {
  const configured = Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
  const mode = getSetting('whatsapp.mode') || 'link';
  if (mode === 'api' && !configured) return 'link';
  return mode;
}

async function sendViaCloudApi(toPhone, body) {
  const version = process.env.WHATSAPP_API_VERSION || 'v21.0';
  const phoneId = process.env.WHATSAPP_PHONE_ID;
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: waNumber(toPhone, getSetting('salon.country_code') || '44'),
      type: 'text',
      text: { preview_url: false, body },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `WhatsApp API ${res.status}`);
  return data;
}

const BACKOFF_MIN = [2, 10, 60, 360, 1440];

export async function sendNotification(notifId, { force = false } = {}) {
  const n = q1('SELECT * FROM notifications WHERE id = ?', notifId);
  if (!n) throw new HttpError(404, 'not_found', 'Message not found');
  if (n.status === 'sent' && !force) return { status: 'sent', link: n.wa_link };

  if (whatsappMode() !== 'api') {
    return { status: 'manual', link: n.wa_link || buildLink(n.to_phone, n.body) };
  }

  try {
    await sendViaCloudApi(n.to_phone, n.body);
    run("UPDATE notifications SET status='sent', sent_at=?, attempts=attempts+1, last_error='' WHERE id=?", nowIso(), notifId);
    return { status: 'sent' };
  } catch (err) {
    const attempts = n.attempts + 1;
    const retryAt = addMinutes(nowIso(), BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)]);
    const status = attempts >= 5 ? 'failed' : 'queued';
    run('UPDATE notifications SET attempts=?, last_error=?, status=?, scheduled_for=? WHERE id=?',
      attempts, String(err.message || err), status, retryAt, notifId);
    if (status === 'failed') internalAlert(`WhatsApp failed for ${n.to_phone}: ${err.message}`);
    return { status, error: String(err.message || err) };
  }
}

export async function dispatchDue(limit = 25) {
  if (whatsappMode() !== 'api') return { sent: 0, mode: 'link' };
  const due = q(
    `SELECT id FROM notifications WHERE status='queued' AND channel='whatsapp'
     AND scheduled_for <= ? ORDER BY scheduled_for LIMIT ?`, nowIso(), limit,
  );
  let sent = 0;
  for (const row of due) {
    const out = await sendNotification(row.id);
    if (out.status === 'sent') sent += 1;
  }
  return { sent, mode: 'api' };
}

/* ── campaigns ──────────────────────────────────────────────────────────── */

export const SEGMENTS = {
  all: '1=1',
  marketing: 'marketing_opt_in = 1 AND whatsapp_opt_in = 1',
  vip: "tags LIKE '%VIP%'",
  lapsed: 'last_visit_at IS NOT NULL AND last_visit_at < ?',
  new: 'created_at > ?',
  colour: "tags LIKE '%Colour%' OR formula_notes != ''",
  nails: "tags LIKE '%Nails%'",
  birthday_month: 'dob IS NOT NULL AND substr(dob,6,2) = ?',
};

export function segmentCustomers(segment = 'all', limit = 200) {
  const clause = SEGMENTS[segment] || SEGMENTS.all;
  const params = [];
  if (segment === 'lapsed') params.push(addMinutes(nowIso(), -90 * 24 * 60).toISOString().slice(0, 10));
  if (segment === 'new') params.push(addMinutes(nowIso(), -30 * 24 * 60).toISOString().slice(0, 10));
  if (segment === 'birthday_month') params.push(todayIn(tz()).slice(5, 7));
  return q(
    `SELECT * FROM customers WHERE ${clause} AND whatsapp_opt_in = 1 ORDER BY created_at DESC LIMIT ?`,
    ...params, limit,
  );
}

export function broadcast({ offerId, segment = 'marketing', templateKey = 'offer_broadcast' }) {
  const offer = offerId ? q1('SELECT * FROM offers WHERE id = ?', offerId) : null;
  const customers = segmentCustomers(segment);
  let queued = 0;
  for (const c of customers) {
    const codeLine = offer?.code ? `Use code ${offer.code}.` : '';
    const text = render(templateKey, {
      first_name: c.first_name,
      offer_title: offer ? `${offer.emoji} ${offer.title}` : 'A little something for you',
      offer_description: offer?.description || '',
      offer_code_line: codeLine,
      salon_name: getSetting('salon.name'),
      booking_url: `${siteUrl()}/#book`,
    });
    if (!text) continue;
    queue({ customerId: c.id, templateKey, toPhone: c.phone, body: text });
    queued += 1;
  }
  return { queued, audience: customers.length };
}

/** Mark a manually-sent WhatsApp message as sent. */
export function markSent(notifId) {
  run("UPDATE notifications SET status='sent', sent_at=? WHERE id=?", nowIso(), notifId);
}

/** Inbound STOP handling from the Cloud API webhook. */
export function handleInbound({ from, text }) {
  const body = String(text || '').trim().toUpperCase();
  const phone = String(from || '').replace(/[^\d]/g, '').replace(/^44/, '0');
  const customer = q1('SELECT * FROM customers WHERE phone = ?', phone);
  if (!customer) return { handled: false };
  if (['STOP', 'UNSUBSCRIBE', 'CANCEL'].includes(body)) {
    run('UPDATE customers SET whatsapp_opt_in = 0, marketing_opt_in = 0, consent_at = ? WHERE id = ?', nowIso(), customer.id);
    return { handled: true, action: 'opted_out' };
  }
  if (['START', 'YES', 'SUBSCRIBE'].includes(body)) {
    run('UPDATE customers SET whatsapp_opt_in = 1, consent_at = ? WHERE id = ?', nowIso(), customer.id);
    return { handled: true, action: 'opted_in' };
  }
  return { handled: true, action: 'logged' };
}
