import { Router } from 'express';
import { q, q1, run, getSetting } from '../db.js';
import { rateLimit } from '../auth.js';
import { availability, monthAvailability } from '../scheduling.js';
import {
  createBooking, getByReference, setStatus,
} from '../bookings.js';
import {
  requireFields, HttpError, normalisePhone, todayIn, addDays, utcToZoned, zonedDate, id,
} from '../util.js';
import { queue } from '../whatsapp.js';
import { listPlans, purchasePackage } from '../packages.js';

export const publicRouter = Router();

const tz = () => getSetting('salon.timezone') || 'Europe/London';

const bookingLimiter = rateLimit({ windowMs: 60 * 60_000, max: 20, key: 'public-booking' });
const readLimiter = rateLimit({ windowMs: 60_000, max: 240, key: 'public-read' });

publicRouter.use(readLimiter);

export function publicSite() {
  const today = todayIn(tz());
  const services = q('SELECT * FROM services WHERE active = 1 ORDER BY sort_order');
  const staff = q('SELECT id,name,title,bio,colour,sort_order FROM staff WHERE active = 1 ORDER BY sort_order');
  const skills = q('SELECT staff_id, service_id FROM staff_skills');
  for (const member of staff) {
    member.serviceIds = skills.filter((s) => s.staff_id === member.id).map((s) => s.service_id);
  }
  const offers = q(
    `SELECT * FROM offers WHERE active = 1
       AND (starts_on IS NULL OR starts_on <= ?) AND (ends_on IS NULL OR ends_on >= ?)
     ORDER BY created_at DESC`, today, today,
  );
  const offerLinks = q('SELECT * FROM offer_services');
  for (const offer of offers) {
    offer.serviceIds = offerLinks.filter((l) => l.offer_id === offer.id).map((l) => l.service_id);
  }
  const content = {};
  for (const row of q('SELECT key, value FROM site_content')) content[row.key] = row.value;

  const minRating = Number(getSetting('reviews.min_rating') || 4);
  const reviewRows = q(
    `SELECT id, author, rating, body, source, reviewed_at FROM reviews
     WHERE featured = 1 AND rating >= ? ORDER BY sort_order, reviewed_at DESC`, minRating,
  );
  const reviewCount = reviewRows.length;
  const reviewAverage = reviewCount
    ? Math.round((reviewRows.reduce((n, r) => n + r.rating, 0) / reviewCount) * 10) / 10
    : 0;

  return {
    salon: {
      name: getSetting('salon.name'),
      timezone: tz(),
      currency: getSetting('salon.currency'),
      cancellationHours: Number(getSetting('booking.cancellation_notice_hours') || 24),
    },
    content,
    notice: {
      active: getSetting('site.notice_active') === '1' && Boolean(getSetting('site.notice_text')),
      text: getSetting('site.notice_text') || '',
      link: getSetting('site.notice_link') || '',
      linkText: getSetting('site.notice_link_text') || '',
      tone: getSetting('site.notice_tone') || 'gold',
    },
    birthday: {
      enabled: getSetting('birthday.enabled') === '1',
      percent: Number(getSetting('birthday.discount_pct') || 0),
      windowDays: Number(getSetting('birthday.window_days') || 7),
    },
    reviews: {
      headline: getSetting('reviews.headline') || 'Loved on Google',
      googleUrl: getSetting('reviews.google_url') || '',
      average: reviewAverage,
      count: reviewCount,
      items: reviewRows,
    },
    packages: getSetting('packages.enabled') === '1' ? listPlans({ onlineOnly: true }) : [],
    hours: q('SELECT * FROM opening_hours ORDER BY weekday'),
    offers,
    services,
    staff,
    categories: [...new Set(services.map((s) => s.category))],
  };
}

publicRouter.get('/site', (req, res) => res.json(publicSite()));

publicRouter.get('/services', (req, res) => {
  res.json(q('SELECT * FROM services WHERE active = 1 ORDER BY sort_order'));
});

publicRouter.get('/staff', (req, res) => {
  res.json(q('SELECT id,name,title,bio,colour FROM staff WHERE active = 1 ORDER BY sort_order'));
});

publicRouter.get('/reviews', (req, res) => {
  const site = publicSite();
  res.json(site.reviews);
});

publicRouter.get('/packages', (req, res) => {
  // Return active packages for display (customer view)
  const packages = q('SELECT id,name,category,description,duration_min,price_pence FROM services WHERE active = 1 AND online_bookable = 1 ORDER BY sort_order');
  res.json({ packages });
});

publicRouter.get('/packages/customer/:customerId', (req, res) => {
  // Return customer's active packages with usage
  const customerId = req.params.customerId;
  const purchases = q(
    `SELECT p.*, pl.name AS plan_name, s.name AS service_name
     FROM package_purchases p
     LEFT JOIN package_plans pl ON pl.id = p.plan_id
     LEFT JOIN services s ON s.id = p.service_id
     WHERE p.customer_id = ? AND p.status = 'active'
     ORDER BY p.purchased_at DESC`, customerId
  );
  for (const p of purchases) {
    p.sessions_left = Math.max(0, p.sessions_total - p.sessions_used);
    p.paid_left = Math.max(0, (p.sessions_total - (p.free_sessions || 0)) - Math.min(p.sessions_used, p.sessions_total - (p.free_sessions || 0)));
    p.free_unlocked = p.sessions_used >= (p.sessions_total - (p.free_sessions || 0)) && p.sessions_used < p.sessions_total;
    p.redemptions = q('SELECT * FROM package_redemptions WHERE purchase_id = ? ORDER BY session_no', p.id);
  }
  res.json({ packages: purchases });
});

publicRouter.get('/availability', (req, res, next) => {
  const serviceIds = String(req.query.serviceIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  const staffId = req.query.staffId || 'any';
  const date = String(req.query.date || todayIn(tz()));
  if (!serviceIds.length) return next(new HttpError(422, 'validation_failed', 'serviceIds is required'));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return next(new HttpError(422, 'validation_failed', 'date must be YYYY-MM-DD'));
  res.json(availability({ serviceIds, staffId, date }));
});

publicRouter.get('/availability/month', (req, res, next) => {
  const serviceIds = String(req.query.serviceIds || '').split(',').map((s) => s.trim()).filter(Boolean);
  const staffId = req.query.staffId || 'any';
  const month = String(req.query.month || todayIn(tz()).slice(0, 7));
  if (!serviceIds.length) return next(new HttpError(422, 'validation_failed', 'serviceIds is required'));
  if (!/^\d{4}-\d{2}$/.test(month)) return next(new HttpError(422, 'validation_failed', 'month must be YYYY-MM'));
  res.json(monthAvailability({ serviceIds, staffId, month }));
});

publicRouter.post('/bookings', bookingLimiter, (req, res, next) => {
  const body = req.body || {};
  requireFields(body, {
    start: { required: true },
    serviceIds: { required: true },
  });
  const customer = body.customer || {};
  requireFields(customer, {
    firstName: { required: true, maxLen: 60 },
    phone: { required: true, type: 'phone' },
    email: { type: 'email' },
  });
  if (!Array.isArray(body.serviceIds) || body.serviceIds.length === 0) {
    return next(new HttpError(422, 'validation_failed', 'Choose at least one service', { fields: { serviceIds: 'required' } }));
  }
  if (body.serviceIds.length > Number(getSetting('booking.max_services') || 4)) {
    return next(new HttpError(422, 'validation_failed', 'Too many services in one booking', { fields: { serviceIds: 'max 4' } }));
  }
  const result = createBooking({
    serviceIds: body.serviceIds,
    staffId: body.staffId || 'any',
    start: body.start,
    customer,
    notes: body.notes || '',
    source: 'online',
    ip: req.ip,
  });
  res.status(201).json(result);
});

publicRouter.get('/bookings/:reference', (req, res, next) => {
  const phone = req.query.phone;
  if (!phone) return next(new HttpError(422, 'validation_failed', 'phone is required to look up a booking'));
  const appointment = getByReference(req.params.reference, phone);
  if (!appointment) return next(new HttpError(404, 'not_found', 'No booking found with that reference and phone number.'));
  res.json({ appointment });
});

publicRouter.post('/bookings/:reference/cancel', (req, res, next) => {
  const { phone, reason = '' } = req.body || {};
  if (!phone) return next(new HttpError(422, 'validation_failed', 'phone is required'));
  const appointment = getByReference(req.params.reference, phone);
  if (!appointment) return next(new HttpError(404, 'not_found', 'No booking found.'));
  if (appointment.status === 'cancelled') return res.json({ ok: true, alreadyCancelled: true });
  const noticeHours = Number(getSetting('booking.cancellation_notice_hours') || 24);
  const cutoff = new Date(appointment.start_at).getTime() - noticeHours * 3_600_000;
  if (Date.now() > cutoff) {
    return next(new HttpError(409, 'too_late', `Online cancellation closes ${noticeHours} hours before the appointment. Please call the salon.`));
  }
  setStatus(appointment.id, 'cancelled', { reason: reason || 'Cancelled by client online' });
  res.json({ ok: true, refundDue: appointment.deposit_pence > 0 });
});

publicRouter.post('/waitlist', bookingLimiter, (req, res, next) => {
  const body = req.body || {};
  requireFields(body, {
    firstName: { required: true, maxLen: 60 },
    phone: { required: true, type: 'phone' },
    fromDate: { required: true, type: 'date' },
    toDate: { required: true, type: 'date' },
  });
  const phone = normalisePhone(body.phone);
  let customer = q1('SELECT * FROM customers WHERE phone = ?', phone);
  if (!customer) {
    const cid = id('cus');
    run(`INSERT INTO customers (id,first_name,last_name,phone,email,whatsapp_opt_in,marketing_opt_in,consent_at,created_at)
         VALUES (?,?,?,?,?,1,0,?,?)`, cid, body.firstName, body.lastName || '', phone, body.email || '', new Date().toISOString(), new Date().toISOString());
    customer = q1('SELECT * FROM customers WHERE id = ?', cid);
  }
  run(`INSERT INTO waitlist (id,customer_id,service_id,staff_id,from_date,to_date,notes,status,created_at)
       VALUES (?,?,?,?,?,?,?,'waiting',?)`,
    id('wlt'), customer.id, body.serviceId || null, body.staffId || null,
    body.fromDate, body.toDate, body.notes || '', new Date().toISOString());
  queue({
    customerId: customer.id, templateKey: 'waitlist_joined',
    body: `Hi ${body.firstName}, you are on our waitlist for ${body.fromDate} to ${body.toDate}. We will message you the moment something opens up. — ${getSetting('salon.name')}`,
    toPhone: phone,
  });
  res.status(201).json({ ok: true });
});
