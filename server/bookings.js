import { q, q1, run, tx, audit, getSetting } from './db.js';
import { assertBookable, assertNoOverlap, serviceBundle } from './scheduling.js';
import {
  reference, nowIso, normalisePhone, utcToZoned, zonedDate, HttpError,
  ValidationError, addDays, id,
} from './util.js';
import {
  queueConfirmation, queueReminder, queueCancellation, queueReschedule,
  queueThankYou, internalAlert, buildLink,
} from './whatsapp.js';
import { birthdayPercent } from './packages.js';

const tz = () => getSetting('salon.timezone') || 'Europe/London';

export function upsertCustomer(input, { actor = null } = {}) {
  const phone = normalisePhone(input.phone);
  if (phone.length < 10) {
    throw new ValidationError({ phone: 'Enter a valid phone number' });
  }
  const existing = q1('SELECT * FROM customers WHERE phone = ?', phone);
  if (existing) {
    if (input.firstName && input.firstName !== existing.first_name) {
      run('UPDATE customers SET first_name = ? WHERE id = ?', input.firstName, existing.id);
    }
    if (input.lastName && input.lastName !== existing.last_name) {
      run('UPDATE customers SET last_name = ? WHERE id = ?', input.lastName, existing.id);
    }
    if (input.email && input.email !== existing.email) {
      run('UPDATE customers SET email = ? WHERE id = ?', input.email, existing.id);
    }
    if (input.notes && input.notes !== existing.notes) {
      run('UPDATE customers SET notes = ? WHERE id = ?', input.notes, existing.id);
    }
    if (input.dateOfBirth && input.dateOfBirth !== existing.dob) {
      run('UPDATE customers SET dob = ? WHERE id = ?', input.dateOfBirth, existing.id);
    }
    return q1('SELECT * FROM customers WHERE id = ?', existing.id);
  }
  const cid = id('cus');
  run(
    `INSERT INTO customers (id,first_name,last_name,phone,email,dob,notes,whatsapp_opt_in,marketing_opt_in,
       consent_at,loyalty_points,total_spend_pence,visit_count,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,0,0,?)`,
    cid, input.firstName || 'Guest', input.lastName || '', phone, input.email || '',
    input.dateOfBirth || null, input.notes || '',
    input.whatsappOptIn === false ? 0 : 1,
    input.marketingOptIn ? 1 : 0,
    input.marketingOptIn || input.whatsappOptIn !== false ? nowIso() : null,
    nowIso(),
  );
  if (actor) audit({ actor, action: 'customer.create', entity: 'customer', entityId: cid, detail: input.firstName || '' });
  return q1('SELECT * FROM customers WHERE id = ?', cid);
}

export function createBooking({
  serviceIds, staffId = 'any', start, customer, notes = '', internalNotes = '',
  source = 'online', status = null, depositPence = 0, depositMethod = '', actor = null, ip = '',
}) {
  const bundle = serviceBundle(serviceIds);
  const slot = assertBookable({ serviceIds, staffId, startIso: start });
  const cust = upsertCustomer(customer, { actor });
  const chosenStaff = slot.staff;
  const finalStatus = status || (getSetting('booking.auto_confirm') === '1' ? 'confirmed' : 'pending');
  const apptId = id('apt');
  const ref = reference();
  const now = nowIso();
  const birthdayPct = birthdayPercent(cust.dob, slot.startAt);
  const birthdayDiscount = birthdayPct ? Math.round((bundle.pricePence * birthdayPct) / 100) : 0;
  const totalPence = Math.max(0, bundle.pricePence - birthdayDiscount);

  tx(() => {
    assertNoOverlap({ staffId: chosenStaff.id, startAt: slot.startAt, endAt: slot.endAt });
    run(
      `INSERT INTO appointments (id,reference,customer_id,staff_id,start_at,end_at,status,source,total_pence,
         discount_pence,deposit_pence,deposit_method,paid_pence,notes,internal_notes,cancelled_at,cancel_reason,created_at,updated_at,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,NULL,'',?,?,?)`,
      apptId, ref, cust.id, chosenStaff.id, slot.startAt, slot.endAt, finalStatus, source,
      totalPence, birthdayDiscount, depositPence, depositMethod, notes, internalNotes, now, now, actor?.id || null,
    );
    bundle.services.forEach((svc, index) => {
      run(
        `INSERT INTO appointment_items (id,appointment_id,service_id,name_snapshot,duration_min,price_pence,sort_order)
         VALUES (?,?,?,?,?,?,?)`,
        id('itm'), apptId, svc.id, svc.name, svc.duration_min, svc.price_pence, index,
      );
    });
  });

  audit({ actor, action: 'appointment.create', entity: 'appointment', entityId: apptId, detail: `${ref} ${bundle.services.map((s) => s.name).join(' + ')}`, ip });

  queueConfirmation(apptId);
  queueReminder(apptId);
  internalAlert(
    `New ${source} booking: ${cust.first_name} ${cust.last_name} · ${bundle.services.map((s) => s.name).join(' + ')} · ${zonedDate(slot.startAt, tz())} ${utcToZoned(slot.startAt, tz()).time} with ${chosenStaff.name}`,
    { appointmentId: apptId, customerId: cust.id },
  );

  const appointment = getAppointment(apptId);
  const notif = q1("SELECT * FROM notifications WHERE appointment_id = ? AND template_key = 'booking_confirmed' ORDER BY created_at DESC LIMIT 1", apptId);
  return {
    appointment,
    reference: ref,
    birthday: { percent: birthdayPct, discountPence: birthdayDiscount },
    whatsappLink: notif?.wa_link || buildLink(cust.phone, notif?.body || ''),
  };
}

export function getAppointment(appointmentId) {
  const a = q1(
    `SELECT a.*, c.first_name, c.last_name, c.phone, c.email, c.notes AS customer_notes,
            c.allergies, c.formula_notes, c.tags,
            s.name AS staff_name, s.colour AS staff_colour, s.title AS staff_title
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN staff s ON s.id = a.staff_id
     WHERE a.id = ?`, appointmentId,
  );
  if (!a) return null;
  a.items = q('SELECT * FROM appointment_items WHERE appointment_id = ? ORDER BY sort_order', appointmentId);
  a.balancePence = a.total_pence - a.paid_pence;
  a.date = zonedDate(a.start_at, tz());
  a.time = utcToZoned(a.start_at, tz()).time;
  a.endTime = utcToZoned(a.end_at, tz()).time;
  return a;
}

export function getByReference(ref, phone) {
  const a = q1('SELECT * FROM appointments WHERE reference = ?', String(ref || '').toUpperCase());
  if (!a) return null;
  if (phone && normalisePhone(phone) !== q1('SELECT phone FROM customers WHERE id = ?', a.customer_id)?.phone) {
    return null;
  }
  return getAppointment(a.id);
}

export function listAppointments({ from, to, staffId, status, customerId, q: search, limit = 300 }) {
  const where = [];
  const params = [];
  if (from) { where.push('a.start_at >= ?'); params.push(from); }
  if (to) { where.push('a.start_at <= ?'); params.push(to); }
  if (staffId) { where.push('a.staff_id = ?'); params.push(staffId); }
  if (status) { where.push('a.status = ?'); params.push(status); }
  if (customerId) { where.push('a.customer_id = ?'); params.push(customerId); }
  if (search) {
    where.push('(a.reference LIKE ? OR c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  const rows = q(
    `SELECT a.*, c.first_name, c.last_name, c.phone, s.name AS staff_name, s.colour AS staff_colour
     FROM appointments a
     JOIN customers c ON c.id = a.customer_id
     JOIN staff s ON s.id = a.staff_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY a.start_at LIMIT ?`,
    ...params, limit,
  );
  for (const row of rows) {
    row.items = q('SELECT * FROM appointment_items WHERE appointment_id = ? ORDER BY sort_order', row.id);
    row.date = zonedDate(row.start_at, tz());
    row.time = utcToZoned(row.start_at, tz()).time;
    row.endTime = utcToZoned(row.end_at, tz()).time;
    row.balancePence = row.total_pence - row.paid_pence;
  }
  return rows;
}

export function setStatus(appointmentId, status, { reason = '', actor = null, ip = '' } = {}) {
  const allowed = ['pending', 'confirmed', 'arrived', 'completed', 'no_show', 'cancelled'];
  if (!allowed.includes(status)) {
    throw new ValidationError({ status: 'unknown status' });
  }
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a) throw new HttpError(404, 'not_found', 'Booking not found');
  if (a.status === status) return getAppointment(appointmentId);

  run('UPDATE appointments SET status = ?, updated_at = ? WHERE id = ?', status, nowIso(), appointmentId);

  if (status === 'cancelled') {
    run('UPDATE appointments SET cancelled_at = ?, cancel_reason = ? WHERE id = ?', nowIso(), reason, appointmentId);
    queueCancellation(appointmentId, reason);
  } else if (status === 'confirmed') {
    const existing = q1("SELECT 1 FROM notifications WHERE appointment_id = ? AND template_key = 'reminder_24h'", appointmentId);
    if (!existing) queueReminder(appointmentId);
  } else if (status === 'completed') {
    const already = q1("SELECT 1 FROM notifications WHERE appointment_id = ? AND template_key = 'thank_you'", appointmentId);
    if (!already) queueThankYou(appointmentId);
    const cust = q1('SELECT * FROM customers WHERE id = ?', a.customer_id);
    const rate = Number(getSetting('loyalty.points_per_pound') || 1);
    run(
      `UPDATE customers SET visit_count = visit_count + 1,
         total_spend_pence = total_spend_pence + ?,
         loyalty_points = loyalty_points + ?,
         last_visit_at = ?
       WHERE id = ?`,
      a.total_pence, Math.floor((a.total_pence / 100) * rate), a.start_at, cust.id,
    );
    run("UPDATE appointments SET paid_pence = CASE WHEN paid_pence = 0 THEN total_pence ELSE paid_pence END WHERE id = ?", appointmentId);
  } else if (status === 'no_show') {
    internalAlert(`No-show: ${getAppointment(appointmentId).first_name} at ${utcToZoned(a.start_at, tz()).time}`, { appointmentId, customerId: a.customer_id });
  }

  audit({ actor, action: `appointment.${status}`, entity: 'appointment', entityId: appointmentId, detail: reason, ip });
  return getAppointment(appointmentId);
}

export function reschedule(appointmentId, { start, staffId = null, serviceIds = null, actor = null, ip = '' }) {
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a) throw new HttpError(404, 'not_found', 'Booking not found');
  const items = q('SELECT * FROM appointment_items WHERE appointment_id = ? ORDER BY sort_order', appointmentId);
  const ids = serviceIds?.length ? serviceIds : items.map((i) => i.service_id);
  const slot = assertBookable({ serviceIds: ids, staffId: staffId || a.staff_id, startIso: start });
  const bundle = serviceBundle(ids);

  tx(() => {
    assertNoOverlap({ staffId: slot.staff.id, startAt: slot.startAt, endAt: slot.endAt, ignoreAppointmentId: appointmentId });
    run('UPDATE appointments SET start_at = ?, end_at = ?, staff_id = ?, total_pence = ?, updated_at = ? WHERE id = ?',
      slot.startAt, slot.endAt, slot.staff.id, bundle.pricePence, nowIso(), appointmentId);
    run('DELETE FROM appointment_items WHERE appointment_id = ?', appointmentId);
    bundle.services.forEach((svc, index) => {
      run(`INSERT INTO appointment_items (id,appointment_id,service_id,name_snapshot,duration_min,price_pence,sort_order)
           VALUES (?,?,?,?,?,?,?)`, id('itm'), appointmentId, svc.id, svc.name, svc.duration_min, svc.price_pence, index);
    });
  });

  queueReschedule(appointmentId);
  audit({ actor, action: 'appointment.reschedule', entity: 'appointment', entityId: appointmentId, detail: slot.startAt, ip });
  return getAppointment(appointmentId);
}

export function recordPayment(appointmentId, { amountPence, method = 'card', actor = null, ip = '' }) {
  const a = q1('SELECT * FROM appointments WHERE id = ?', appointmentId);
  if (!a) throw new HttpError(404, 'not_found', 'Booking not found');
  const amount = Math.max(0, Math.round(Number(amountPence) || 0));
  run('UPDATE appointments SET paid_pence = ?, deposit_method = ?, updated_at = ? WHERE id = ?',
    a.paid_pence + amount, method, nowIso(), appointmentId);
  audit({ actor, action: 'appointment.payment', entity: 'appointment', entityId: appointmentId, detail: `${amount} ${method}`, ip });
  return getAppointment(appointmentId);
}

export function dashboard(date) {
  const zone = tz();
  const start = `${date}T00:00:00.000Z`;
  const end = `${addDays(date, 1)}T00:00:00.000Z`;
  const dayAppointments = q(
    `SELECT a.*, c.first_name, c.last_name, c.phone, s.name AS staff_name, s.colour AS staff_colour
     FROM appointments a JOIN customers c ON c.id = a.customer_id JOIN staff s ON s.id = a.staff_id
     WHERE a.start_at >= ? AND a.start_at < ? AND a.status != 'cancelled'
     ORDER BY a.start_at`, start, end,
  );
  for (const row of dayAppointments) {
    row.items = q('SELECT * FROM appointment_items WHERE appointment_id = ?', row.id);
    row.time = utcToZoned(row.start_at, zone).time;
    row.endTime = utcToZoned(row.end_at, zone).time;
  }
  const revenue = dayAppointments.filter((a) => a.status === 'completed').reduce((n, a) => n + a.paid_pence, 0);
  const projected = dayAppointments.reduce((n, a) => n + a.total_pence, 0);
  const noShows = dayAppointments.filter((a) => a.status === 'no_show').length;
  const completed = dayAppointments.filter((a) => a.status === 'completed').length;
  const shifts = q('SELECT * FROM shifts WHERE work_date = ?', date);
  const rosteredMin = shifts.reduce((n, s) => {
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    return n + (eh * 60 + em) - (sh * 60 + sm) - s.break_min;
  }, 0);
  const bookedMin = dayAppointments.reduce((n, a) => n + (new Date(a.end_at) - new Date(a.start_at)) / 60000, 0);
  const newClients = q1(`SELECT COUNT(*) AS n FROM customers WHERE substr(created_at,1,10) = ?`, date)?.n || 0;
  const unread = q1("SELECT COUNT(*) AS n FROM notifications WHERE channel='internal' AND status='queued'")?.n || 0;

  return {
    date,
    kpis: {
      revenuePence: revenue,
      projectedPence: projected,
      bookings: dayAppointments.length,
      completed,
      noShows,
      newClients,
      utilisation: rosteredMin ? Math.round((bookedMin / rosteredMin) * 100) : 0,
      unreadAlerts: unread,
    },
    appointments: dayAppointments,
    staff: q('SELECT * FROM staff WHERE active = 1 ORDER BY sort_order'),
    shifts,
  };
}

export function report(from, to) {
  const rows = q(
    `SELECT a.*, s.name AS staff_name, c.first_name, c.last_name
     FROM appointments a JOIN staff s ON s.id = a.staff_id JOIN customers c ON c.id = a.customer_id
     WHERE substr(a.start_at,1,10) BETWEEN ? AND ?`, from, to,
  );
  const completed = rows.filter((a) => a.status === 'completed');
  const revenue = completed.reduce((n, a) => n + a.paid_pence, 0);
  const cancelled = rows.filter((a) => a.status === 'cancelled').length;
  const noShows = rows.filter((a) => a.status === 'no_show').length;

  const byDay = {};
  for (const a of completed) {
    const d = a.start_at.slice(0, 10);
    byDay[d] = (byDay[d] || 0) + a.paid_pence;
  }

  const byStaff = {};
  for (const a of completed) {
    byStaff[a.staff_name] ||= { name: a.staff_name, revenue: 0, visits: 0 };
    byStaff[a.staff_name].revenue += a.paid_pence;
    byStaff[a.staff_name].visits += 1;
  }

  const byService = q(
    `SELECT ai.name_snapshot AS name, COUNT(*) AS count, SUM(ai.price_pence) AS revenue
     FROM appointment_items ai JOIN appointments a ON a.id = ai.appointment_id
     WHERE a.status = 'completed' AND substr(a.start_at,1,10) BETWEEN ? AND ?
     GROUP BY ai.name_snapshot ORDER BY revenue DESC LIMIT 10`, from, to,
  );

  const topClients = q(
    `SELECT c.id, c.first_name, c.last_name, COUNT(*) AS visits, SUM(a.paid_pence) AS spend
     FROM appointments a JOIN customers c ON c.id = a.customer_id
     WHERE a.status = 'completed' AND substr(a.start_at,1,10) BETWEEN ? AND ?
     GROUP BY c.id ORDER BY spend DESC LIMIT 8`, from, to,
  );

  const shifts = q('SELECT * FROM shifts WHERE work_date BETWEEN ? AND ?', from, to);
  const rosteredMin = shifts.reduce((n, s) => {
    const [sh, sm] = s.start_time.split(':').map(Number);
    const [eh, em] = s.end_time.split(':').map(Number);
    return n + (eh * 60 + em) - (sh * 60 + sm) - s.break_min;
  }, 0);
  const bookedMin = completed.reduce((n, a) => n + (new Date(a.end_at) - new Date(a.start_at)) / 60000, 0);

  return {
    from, to,
    totals: {
      revenuePence: revenue,
      bookings: rows.length,
      completed: completed.length,
      cancelled,
      noShows,
      averagePence: completed.length ? Math.round(revenue / completed.length) : 0,
      utilisation: rosteredMin ? Math.round((bookedMin / rosteredMin) * 100) : 0,
    },
    byDay: Object.entries(byDay).sort().map(([date, revenuePence]) => ({ date, revenuePence })),
    byStaff: Object.values(byStaff).sort((a, b) => b.revenue - a.revenue),
    byService,
    topClients,
  };
}
