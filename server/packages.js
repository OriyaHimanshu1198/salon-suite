import { q, q1, run, tx, getSetting, setSetting, audit } from './db.js';
import {
  id, nowIso, addDays, normalisePhone, zonedDate, todayIn, money,
  HttpError, ValidationError,
} from './util.js';
import { queue, internalAlert } from './whatsapp.js';
import crypto from 'node:crypto';

const tz = () => getSetting('salon.timezone') || 'Europe/London';

/* ══ plans ═══════════════════════════════════════════════════════════════ */

function hydratePlan(plan) {
  if (!plan) return null;
  let ids = [];
  try { ids = JSON.parse(plan.service_ids || '[]'); } catch { ids = []; }
  plan.serviceIds = ids;
  const services = ids.length
    ? q(`SELECT id,name,price_pence,duration_min FROM services WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids)
    : [];
  plan.services = services;
  plan.sessionsTotal = plan.sessions + plan.free_sessions;
  plan.valuePence = services.reduce((n, s) => n + s.price_pence, 0) * plan.sessions;
  plan.savingPence = Math.max(0, plan.valuePence - plan.price_pence);
  return plan;
}

export function listPlans({ onlineOnly = false, includeInactive = false } = {}) {
  const where = [];
  if (!includeInactive) where.push('active = 1');
  if (onlineOnly) where.push('online = 1');
  const rows = q(`SELECT * FROM package_plans ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY sort_order, name`);
  return rows.map(hydratePlan);
}

export function getPlan(planId) {
  return hydratePlan(q1('SELECT * FROM package_plans WHERE id = ?', planId));
}

/* ══ purchases ═══════════════════════════════════════════════════════════ */

export function expirePurchases() {
  run("UPDATE package_purchases SET status = 'expired' WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at < ?", nowIso());
}

function decoratePurchase(p) {
  const plan = q1('SELECT * FROM package_plans WHERE id = ?', p.plan_id);
  p.plan = hydratePlan(plan);
  p.sessions_left = Math.max(0, p.sessions_total - p.sessions_used);
  p.free_left = Math.max(0, p.sessions_total - Math.max(p.sessions_used, p.sessions_total - (plan?.free_sessions || 0)));
  p.paymentDue = Math.max(0, p.price_pence - p.paid_pence);
  p.expired = p.status === 'expired' || (p.expires_at && p.expires_at < nowIso() && p.status === 'active');
  p.redemptions = q('SELECT * FROM package_redemptions WHERE purchase_id = ? ORDER BY session_no', p.id);
  return p;
}

export function listPurchases({ status, customerId, search, limit = 200 } = {}) {
  expirePurchases();
  const where = [];
  const params = [];
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (customerId) { where.push('p.customer_id = ?'); params.push(customerId); }
  if (search) {
    where.push('(p.reference LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  return q(
    `SELECT p.*, c.first_name, c.last_name, c.phone, s.name AS sold_by_name
     FROM package_purchases p
     JOIN customers c ON c.id = p.customer_id
     LEFT JOIN staff s ON s.id = p.sold_by_staff_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY p.purchased_at DESC LIMIT ?`,
    ...params, Math.min(Number(limit) || 200, 500),
  ).map(decoratePurchase);
}

export function getPurchase(purchaseId) {
  expirePurchases();
  const p = q1(
    `SELECT p.*, c.first_name, c.last_name, c.phone, c.email, s.name AS sold_by_name
     FROM package_purchases p JOIN customers c ON c.id = p.customer_id
     LEFT JOIN staff s ON s.id = p.sold_by_staff_id WHERE p.id = ?`, purchaseId,
  );
  return p ? decoratePurchase(p) : null;
}

/** Packages a customer can still use, optionally narrowed to a service. */
export function usablePurchases(customerId, serviceId = null) {
  expirePurchases();
  const rows = q(
    `SELECT p.*, c.first_name, c.last_name FROM package_purchases p
     JOIN customers c ON c.id = p.customer_id
     WHERE p.customer_id = ? AND p.status = 'active' AND p.sessions_used < p.sessions_total
     ORDER BY p.expires_at`, customerId,
  ).map(decoratePurchase);
  if (!serviceId) return rows;
  return rows.filter((p) => p.plan?.serviceIds.includes(serviceId));
}

function findOrCreateCustomer(input) {
  const phone = normalisePhone(input.phone);
  if (phone.length < 10) throw new ValidationError({ phone: 'Enter a valid phone number' });
  const existing = q1('SELECT * FROM customers WHERE phone = ?', phone);
  if (existing) {
    if (input.firstName) run('UPDATE customers SET first_name = ? WHERE id = ?', input.firstName, existing.id);
    if (input.lastName) run('UPDATE customers SET last_name = ? WHERE id = ?', input.lastName, existing.id);
    if (input.email) run('UPDATE customers SET email = ? WHERE id = ?', input.email, existing.id);
    if (input.dateOfBirth) run('UPDATE customers SET dob = ? WHERE id = ?', input.dateOfBirth, existing.id);
    return q1('SELECT * FROM customers WHERE id = ?', existing.id);
  }
  const cid = id('cus');
  run(`INSERT INTO customers (id,first_name,last_name,phone,email,dob,whatsapp_opt_in,marketing_opt_in,
       consent_at,loyalty_points,total_spend_pence,visit_count,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,0,0,0,?)`,
    cid, input.firstName || 'Guest', input.lastName || '', phone, input.email || '', input.dateOfBirth || null,
    input.whatsappOptIn === false ? 0 : 1, input.marketingOptIn ? 1 : 0, nowIso(), nowIso());
  return q1('SELECT * FROM customers WHERE id = ?', cid);
}

export function generateQRCode() {
  return 'QR-' + crypto.randomBytes(8).toString('hex').toUpperCase();
}

export function purchasePackage({
  planId, customer = null, customerId = null, channel = 'online',
  soldByStaffId = null, soldByUserId = null, paidPence = 0, notes = '', actor = null, ip = '',
  customPackage = null, // { serviceId, serviceName, sessions, freeSessions, pricePence }
}) {
  let plan = null;
  let serviceId = null;
  let serviceName = null;
  let sessions = 0;
  let freeSessions = 0;
  let pricePence = 0;

  if (customPackage) {
    // Custom single-service package
    serviceId = customPackage.serviceId;
    serviceName = customPackage.serviceName;
    sessions = customPackage.sessions;
    freeSessions = customPackage.freeSessions;
    pricePence = customPackage.pricePence;
    plan = { id: null, name: `${serviceName} ×${sessions} + ${freeSessions} free`, sessions: sessions, free_sessions: freeSessions };
  } else {
    // Plan-based package
    plan = getPlan(planId);
    if (!plan || !plan.active) throw new HttpError(404, 'not_found', 'That package is not available');
    if (channel === 'online' && !plan.online) throw new HttpError(409, 'not_online', 'This package is sold in the salon only');
  }

  let cust = customerId ? q1('SELECT * FROM customers WHERE id = ?', customerId) : null;
  if (!cust && customer) cust = findOrCreateCustomer(customer);
  if (!cust) throw new ValidationError({ customer: 'A client is required' });

  // Ensure customer has QR code
  if (!cust.qr_code) {
    const qr = generateQRCode();
    run('UPDATE customers SET qr_code = ? WHERE id = ?', qr, cust.id);
    cust.qr_code = qr;
  }

  const now = nowIso();
  const purchaseId = id('pkg');
  const ref = `PKG-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  // No expiry per business rules
  const expiresAt = null;
  const paid = Math.max(0, Math.round(Number(paidPence) || 0));

  // All purchases are active immediately (no online purchasing)
  const status = 'active';
  const approvedAt = now;
  const approvedBy = actor?.id || soldByUserId;

  const totalSessions = sessions + freeSessions;
  const planIdForDb = plan.id; // null for custom packages

  run(`INSERT INTO package_purchases (id,reference,customer_id,plan_id,plan_name,sessions_total,sessions_used,
       price_pence,paid_pence,status,channel,sold_by_staff_id,sold_by_user_id,purchased_at,expires_at,
       approved_at,approved_by,notes,service_id)
       VALUES (?,?,?,?,?,?,0,?,?,?,?,?,?,?,?,?,?,?,?)`,
    purchaseId, ref, cust.id, planIdForDb, plan.name, totalSessions, pricePence, paid,
    status, channel, soldByStaffId, soldByUserId, now, expiresAt, approvedAt, approvedBy, notes, serviceId || null);

  queue({
    customerId: cust.id,
    templateKey: 'package_purchased',
    vars: {
      first_name: cust.first_name,
      package_name: plan.name,
      reference: ref,
      sessions: sessions,
      free: freeSessions,
      salon_name: getSetting('salon.name'),
    },
  });
  internalAlert(
    `In-salon package: ${cust.first_name} ${cust.last_name} bought ${plan.name} (${ref}) · ${money(plan.price_pence)}`,
    { customerId: cust.id },
  );
  audit({ actor, action: 'package.purchase', entity: 'package_purchase', entityId: purchaseId, detail: `${ref} ${plan.name}`, ip });

  return { purchase: getPurchase(purchaseId), reference: ref };
}

export function recordPackagePayment(purchaseId, { amountPence, method = 'card', actor = null, ip = '' }) {
  const p = q1('SELECT * FROM package_purchases WHERE id = ?', purchaseId);
  if (!p) throw new HttpError(404, 'not_found', 'Package not found');
  const amount = Math.max(0, Math.round(Number(amountPence) || 0));
  run('UPDATE package_purchases SET paid_pence = MIN(price_pence, paid_pence + ?), notes = ? WHERE id = ?',
    amount, `${p.notes}${p.notes ? ' · ' : ''}${money(amount)} ${method}`, purchaseId);
  audit({ actor, action: 'package.payment', entity: 'package_purchase', entityId: purchaseId, detail: `${amount} ${method}`, ip });
  return getPurchase(purchaseId);
}

export function cancelPurchase(purchaseId, { reason = '', actor = null, ip = '' } = {}) {
  const p = q1('SELECT * FROM package_purchases WHERE id = ?', purchaseId);
  if (!p) throw new HttpError(404, 'not_found', 'Package not found');
  run("UPDATE package_purchases SET status = 'cancelled', notes = ? WHERE id = ?",
    `${p.notes}${p.notes ? ' · ' : ''}Cancelled${reason ? `: ${reason}` : ''}`, purchaseId);
  audit({ actor, action: 'package.cancel', entity: 'package_purchase', entityId: purchaseId, detail: reason, ip });
  return getPurchase(purchaseId);
}

export function redeemSession({ purchaseId, appointmentId = null, note = '', actor = null, ip = '' }) {
  expirePurchases();
  const p = q1('SELECT * FROM package_purchases WHERE id = ?', purchaseId);
  if (!p) throw new HttpError(404, 'not_found', 'Package not found');
  if (p.status !== 'active') throw new HttpError(409, 'package_unavailable', `This package is ${p.status}`);
  if (p.sessions_used >= p.sessions_total) throw new HttpError(409, 'package_used', 'All sessions on this package are used');
  // No expiry check - packages have no expiry per business rules

  // Determine paid sessions and free sessions
  const paidSessions = p.plan_id
    ? q1('SELECT sessions FROM package_plans WHERE id = ?', p.plan_id)?.sessions
    : p.sessions_total - (p.free_sessions || 0);
  const freeSessions = p.plan_id
    ? q1('SELECT free_sessions FROM package_plans WHERE id = ?', p.plan_id)?.free_sessions
    : p.free_sessions || 0;
  const serviceId = p.service_id;

  let covered = [];
  if (appointmentId) {
    const items = q('SELECT * FROM appointment_items WHERE appointment_id = ?', appointmentId);
    if (serviceId) {
      covered = items.filter((i) => i.service_id === serviceId);
    } else if (p.plan_id) {
      const plan = getPlan(p.plan_id);
      covered = items.filter((i) => plan.serviceIds.includes(i.service_id));
    } else {
      covered = items;
    }
    if (!covered.length) {
      throw new HttpError(422, 'service_not_covered', 'This package does not cover the services on that appointment');
    }
  }

  const sessionNo = p.sessions_used + 1;
  const isFree = sessionNo > paidSessions;

  tx(() => {
    run('UPDATE package_purchases SET sessions_used = sessions_used + 1 WHERE id = ?', p.id);
    run(`INSERT INTO package_redemptions (id,purchase_id,appointment_id,session_no,is_free,note,redeemed_at,redeemed_by)
         VALUES (?,?,?,?,?,?,?,?)`,
      id('rdm'), p.id, appointmentId, sessionNo, isFree ? 1 : 0, note, nowIso(), actor?.id || null);
    if (appointmentId) {
      const value = covered.reduce((n, i) => n + i.price_pence, 0);
      run(`UPDATE appointments SET package_purchase_id = ?, discount_pence = discount_pence + ?,
           total_pence = MAX(total_pence - ?, 0), updated_at = ? WHERE id = ?`,
        p.id, value, value, nowIso(), appointmentId);
    }
    if (sessionNo >= p.sessions_total) {
      run("UPDATE package_purchases SET status = 'completed' WHERE id = ?", p.id);
    }
  });

  const after = getPurchase(p.id);
  const cust = q1('SELECT * FROM customers WHERE id = ?', p.customer_id);
  if (sessionNo === paidSessions + 1 && freeSessions > 0) {
    queue({
      customerId: p.customer_id,
      templateKey: 'package_free_ready',
      vars: {
        first_name: cust.first_name, package_name: p.plan_name,
        used: paidSessions, paid: paidSessions,
        booking_url: `${process.env.SITE_URL || `http://localhost:${process.env.PORT || 4321}`}/#book`,
      },
    });
  }
  if (after.status === 'completed') {
    queue({
      customerId: p.customer_id,
      templateKey: 'package_complete',
      vars: {
        first_name: cust.first_name, package_name: p.plan_name,
        booking_url: `${process.env.SITE_URL || `http://localhost:${process.env.PORT || 4321}`}/#book`,
      },
    });
    internalAlert(`Package complete: ${cust.first_name} ${cust.last_name} · ${p.plan_name} (${p.reference})`, { customerId: p.customer_id });
  }
  audit({ actor, action: 'package.redeem', entity: 'package_purchase', entityId: p.id, detail: `session ${sessionNo}${isFree ? ' (free)' : ''}`, ip });
  return { purchase: after, sessionNo, isFree, appointment: appointmentId ? q1('SELECT * FROM appointments WHERE id = ?', appointmentId) : null };
}

export function customerPackages(customerId) {
  return listPurchases({ customerId });
}

/* ══ birthday ════════════════════════════════════════════════════════════ */

/** Percent discount when the appointment date falls inside the birthday window, else 0. */
export function birthdayPercent(dob, startIso) {
  if (getSetting('birthday.enabled') !== '1' || !dob) return 0;
  const pct = Number(getSetting('birthday.discount_pct') || 0);
  const windowDays = Number(getSetting('birthday.window_days') || 7);
  if (!pct) return 0;
  const apptDate = zonedDate(startIso, tz());
  const md = String(dob).slice(5);
  for (let offset = -windowDays; offset <= windowDays; offset++) {
    if (addDays(apptDate, offset).slice(5) === md) return pct;
  }
  return 0;
}

export function birthdayDiscountPence(dob, startIso, grossPence) {
  const pct = birthdayPercent(dob, startIso);
  return pct ? Math.round((grossPence * pct) / 100) : 0;
}

/** Customers with a birthday in a month ('MM'); defaults to the current salon month. */
export function birthdaysInMonth(month = todayIn(tz()).slice(5, 7)) {
  return q(
    `SELECT id, first_name, last_name, phone, dob, whatsapp_opt_in, marketing_opt_in
     FROM customers WHERE dob IS NOT NULL AND substr(dob,6,2) = ?
     ORDER BY substr(dob,9,2), first_name`, month,
  );
}

/** Birthdays in the next `days` days, for the dashboard card. */
export function upcomingBirthdays(days = 7) {
  const today = todayIn(tz());
  const out = [];
  for (let offset = 0; offset <= days; offset++) {
    const md = addDays(today, offset).slice(5);
    for (const c of q('SELECT id,first_name,last_name,phone,dob FROM customers WHERE dob IS NOT NULL AND substr(dob,6,5) = ?', md)) {
      out.push({ ...c, date: addDays(today, offset), offset });
    }
  }
  return out;
}

/**
 * Daily WhatsApp job: greet today's birthdays with the discount offer.
 * Runs at most once per salon day unless `force` is passed.
 */
export function runBirthdayJob({ force = false } = {}) {
  const today = todayIn(tz());
  if (getSetting('birthday.enabled') !== '1') return { queued: 0, skipped: 'disabled' };
  if (!force && getSetting('birthday.last_run') === today) return { queued: 0, skipped: 'already_run' };
  const pct = Number(getSetting('birthday.discount_pct') || 0);
  const people = q(
    `SELECT * FROM customers WHERE dob IS NOT NULL AND substr(dob,6,5) = ?
       AND whatsapp_opt_in = 1 AND marketing_opt_in = 1`, today.slice(5),
  );
  let queued = 0;
  for (const c of people) {
    const already = q1(
      `SELECT 1 FROM notifications WHERE customer_id = ? AND template_key = 'birthday_offer'
         AND substr(created_at,1,4) = ?`, c.id, today.slice(0, 4),
    );
    if (already) continue;
    queue({
      customerId: c.id,
      templateKey: 'birthday_offer',
      vars: {
        first_name: c.first_name,
        birthday_discount: pct,
        booking_url: `${process.env.SITE_URL || `http://localhost:${process.env.PORT || 4321}`}/#book`,
        salon_name: getSetting('salon.name'),
      },
    });
    queued += 1;
  }
  setSetting('birthday.last_run', today);
  return { queued, audience: people.length, date: today };
}

/* ══ staff sales ═════════════════════════════════════════════════════════ */

export function salesReport({ date = null, from = null, to = null } = {}) {
  const startDate = date || from || todayIn(tz());
  const endDate = date || to || startDate;
  const staff = q('SELECT id,name,colour,commission_pct,title FROM staff WHERE active = 1 ORDER BY sort_order');
  const items = q(
    `SELECT ai.name_snapshot, ai.price_pence, a.staff_id, substr(a.start_at,1,10) AS day, a.id AS appointment_id
     FROM appointment_items ai JOIN appointments a ON a.id = ai.appointment_id
     WHERE a.status = 'completed' AND substr(a.start_at,1,10) BETWEEN ? AND ?`,
    startDate, endDate,
  );
  const appts = q(
    `SELECT a.id, a.staff_id, substr(a.start_at,1,10) AS day, a.paid_pence
     FROM appointments a WHERE a.status = 'completed' AND substr(a.start_at,1,10) BETWEEN ? AND ?`,
    startDate, endDate,
  );
  const pkgs = q(
    `SELECT p.*, substr(p.purchased_at,1,10) AS day FROM package_purchases p
     WHERE p.status != 'cancelled' AND substr(p.purchased_at,1,10) BETWEEN ? AND ?`,
    startDate, endDate,
  );

  const rows = staff.map((m) => {
    const mine = items.filter((i) => i.staff_id === m.id);
    const myAppts = appts.filter((a) => a.staff_id === m.id);
    const myPkgs = pkgs.filter((p) => p.sold_by_staff_id === m.id);
    const serviceRevenue = mine.reduce((n, i) => n + i.price_pence, 0);
    const packageRevenue = myPkgs.reduce((n, p) => n + p.paid_pence, 0);
    const byService = {};
    for (const i of mine) {
      byService[i.name_snapshot] ||= { name: i.name_snapshot, count: 0, revenue: 0 };
      byService[i.name_snapshot].count += 1;
      byService[i.name_snapshot].revenue += i.price_pence;
    }
    return {
      staffId: m.id,
      name: m.name,
      title: m.title,
      colour: m.colour,
      commissionPct: m.commission_pct,
      appointments: myAppts.length,
      servicesSold: mine.length,
      serviceRevenue,
      packagesSold: myPkgs.length,
      packageRevenue,
      packageValue: myPkgs.reduce((n, p) => n + p.price_pence, 0),
      totalRevenue: serviceRevenue + packageRevenue,
      commissionPence: Math.round((serviceRevenue * m.commission_pct) / 100),
      items: Object.values(byService).sort((a, b) => b.revenue - a.revenue),
      packages: myPkgs.map((p) => ({ reference: p.reference, planName: p.plan_name, paid: p.paid_pence, price: p.price_pence })),
    };
  });

  const totals = rows.reduce((acc, r) => ({
    servicesSold: acc.servicesSold + r.servicesSold,
    serviceRevenue: acc.serviceRevenue + r.serviceRevenue,
    appointments: acc.appointments + r.appointments,
    packagesSold: acc.packagesSold + r.packagesSold,
    packageRevenue: acc.packageRevenue + r.packageRevenue,
    totalRevenue: acc.totalRevenue + r.totalRevenue,
    commissionPence: acc.commissionPence + r.commissionPence,
  }), { servicesSold: 0, serviceRevenue: 0, appointments: 0, packagesSold: 0, packageRevenue: 0, totalRevenue: 0, commissionPence: 0 });

  const days = {};
  for (const a of appts) {
    days[a.day] ||= { date: a.day, appointments: 0, serviceRevenue: 0, packageRevenue: 0 };
    days[a.day].appointments += 1;
    days[a.day].serviceRevenue += a.paid_pence;
  }
  for (const p of pkgs) {
    days[p.day] ||= { date: p.day, appointments: 0, serviceRevenue: 0, packageRevenue: 0 };
    days[p.day].packageRevenue += p.paid_pence;
  }

  return {
    from: startDate,
    to: endDate,
    staff: rows,
    totals,
    days: Object.values(days).sort((a, b) => a.date.localeCompare(b.date)),
  };
}
