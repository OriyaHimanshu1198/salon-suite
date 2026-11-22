import { Router } from 'express';
import { q, q1, run, tx, audit, getSetting, setSetting, allSettings, SETTING_DEFAULTS } from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { availability, rotaConflicts, shiftOverlap, nextAvailableDate } from '../scheduling.js';
import {
  createBooking, getAppointment, listAppointments, setStatus, reschedule,
  recordPayment, dashboard, report, upsertCustomer,
} from '../bookings.js';
import {
  queue, sendNotification, markSent, broadcast, segmentCustomers, SEGMENTS,
  whatsappMode, buildLink, template,
} from '../whatsapp.js';
import {
  requireFields, HttpError, ValidationError, normalisePhone, todayIn, addDays,
  startOfWeek, zonedDate, utcToZoned, csv, nowIso, money, pick, id,
} from '../util.js';
import { publicSite } from './public.js';
import {
  listPlans, getPlan, listPurchases, getPurchase, purchasePackage, recordPackagePayment,
  cancelPurchase, redeemSession, customerPackages, salesReport, upcomingBirthdays,
  birthdaysInMonth, runBirthdayJob,
} from '../packages.js';
import { generateQRCode } from '../packages.js';
import {
  importCustomers, importBookings, listImports, getImport, listMappings,
  confirmMapping, rejectMapping, mergeCustomers,
} from '../treatwell.js';

export const adminRouter = Router();

adminRouter.use(requireAuth);

const tz = () => getSetting('salon.timezone') || 'Europe/London';
const canDesk = requireRole('owner', 'manager', 'reception');
const canManage = requireRole('owner', 'manager');
const canOwner = requireRole('owner');

/* ══ dashboard ═══════════════════════════════════════════════════════════ */

adminRouter.get('/dashboard', (req, res) => {
  const date = String(req.query.date || todayIn(tz()));
  const data = dashboard(date);
  data.birthdays = upcomingBirthdays(7);
  data.teamSales = salesReport({ date });
  res.json(data);
});

adminRouter.get('/search', (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) return res.json({ customers: [], appointments: [] });
  const like = `%${term}%`;
  res.json({
    customers: q(`SELECT id, first_name, last_name, phone, tags FROM customers
                  WHERE first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? LIMIT 8`, like, like, like),
    appointments: q(`SELECT a.id, a.reference, a.start_at, a.status, c.first_name, c.last_name
                     FROM appointments a JOIN customers c ON c.id = a.customer_id
                     WHERE a.reference LIKE ? OR c.first_name LIKE ? OR c.phone LIKE ?
                     ORDER BY a.start_at DESC LIMIT 8`, like, like, like),
  });
});

/* ══ appointments ════════════════════════════════════════════════════════ */

adminRouter.get('/appointments', (req, res) => {
  const { from, to, staffId, status, q: search } = req.query;
  res.json(listAppointments({
    from: from || undefined, to: to || undefined, staffId: staffId || undefined,
    status: status || undefined, q: search || undefined,
  }));
});

adminRouter.get('/appointments/:id', (req, res, next) => {
  const appointment = getAppointment(req.params.id);
  if (!appointment) return next(new HttpError(404, 'not_found', 'Booking not found'));
  res.json({ appointment });
});

adminRouter.post('/appointments', canDesk, (req, res) => {
  const body = req.body || {};
  requireFields(body, { start: { required: true }, serviceIds: { required: true } });
  const customer = body.customer || {};
  if (body.customerId) {
    const existing = q1('SELECT * FROM customers WHERE id = ?', body.customerId);
    if (!existing) throw new HttpError(404, 'not_found', 'Client not found');
    Object.assign(customer, {
      firstName: customer.firstName || existing.first_name,
      lastName: customer.lastName || existing.last_name,
      phone: customer.phone || existing.phone,
      email: customer.email || existing.email,
    });
  }
  requireFields(customer, { firstName: { required: true }, phone: { required: true, type: 'phone' } });

  const result = createBooking({
    serviceIds: body.serviceIds,
    staffId: body.staffId || 'any',
    start: body.start,
    customer,
    notes: body.notes || '',
    internalNotes: body.internalNotes || '',
    source: body.source || 'admin',
    status: body.status || 'confirmed',
    depositPence: Math.round(Number(body.depositPence) || 0),
    depositMethod: body.depositMethod || '',
    actor: req.user,
    ip: req.ip,
  });
  res.status(201).json(result);
});

adminRouter.patch('/appointments/:id', canDesk, (req, res) => {
  const body = req.body || {};
  const a = q1('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!a) throw new HttpError(404, 'not_found', 'Booking not found');
  const moving = body.start || body.staffId || body.serviceIds;
  if (moving) {
    res.json({ appointment: reschedule(req.params.id, {
      start: body.start || a.start_at,
      staffId: body.staffId || a.staff_id,
      serviceIds: body.serviceIds || null,
      actor: req.user, ip: req.ip,
    }) });
    return;
  }
  const allowed = ['notes', 'internal_notes'];
  const map = { notes: 'notes', internalNotes: 'internal_notes' };
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined && allowed.includes(col)) {
      run(`UPDATE appointments SET ${col} = ?, updated_at = ? WHERE id = ?`, String(body[key]).slice(0, 2000), nowIso(), req.params.id);
    }
  }
  audit({ actor: req.user, action: 'appointment.update', entity: 'appointment', entityId: req.params.id, ip: req.ip });
  res.json({ appointment: getAppointment(req.params.id) });
});

adminRouter.post('/appointments/:id/status', (req, res) => {
  const { status, reason = '' } = req.body || {};
  if (!status) throw new ValidationError({ status: 'required' });
  const a = q1('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!a) throw new HttpError(404, 'not_found', 'Booking not found');
  if (req.user.role === 'staff' && a.staff_id !== req.user.staffId) {
    throw new HttpError(403, 'forbidden', 'You can only update your own appointments.');
  }
  res.json({ appointment: setStatus(req.params.id, status, { reason, actor: req.user, ip: req.ip }) });
});

adminRouter.post('/appointments/:id/payment', canDesk, (req, res) => {
  const { amountPence, method = 'card' } = req.body || {};
  requireFields(req.body || {}, { amountPence: { required: true, type: 'int', min: 0 } });
  res.json({ appointment: recordPayment(req.params.id, { amountPence, method, actor: req.user, ip: req.ip }) });
});

/* ══ clients ═════════════════════════════════════════════════════════════ */

const SEGMENT_WHERE = {
  all: '1=1',
  vip: "tags LIKE '%VIP%'",
  colour: "tags LIKE '%Colour%' OR formula_notes != ''",
  nails: "tags LIKE '%Nails%'",
  new: "created_at >= ?",
  lapsed: "last_visit_at IS NOT NULL AND last_visit_at < ?",
  marketing: 'marketing_opt_in = 1',
  consent: 'whatsapp_opt_in = 0',
};

adminRouter.get('/customers', (req, res) => {
  const term = String(req.query.q || '').trim();
  const segment = String(req.query.segment || 'all');
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const where = [];
  const params = [];
  const clause = SEGMENT_WHERE[segment] || SEGMENT_WHERE.all;
  if (segment === 'new') params.push(addDays(todayIn(tz()), -30));
  if (segment === 'lapsed') params.push(addDays(todayIn(tz()), -90));
  where.push(clause.replace('?', '?'));
  if (term) {
    where.push('(c.first_name LIKE ? OR c.last_name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)');
    const like = `%${term}%`;
    params.push(like, like, like, like);
  }
  const rows = q(
    `SELECT c.*, s.name AS preferred_staff_name
     FROM customers c LEFT JOIN staff s ON s.id = c.preferred_staff_id
     WHERE ${where.join(' AND ')} ORDER BY c.first_name LIMIT ?`,
    ...params, limit,
  );
  res.json({ customers: rows, segments: Object.keys(SEGMENTS).concat(['consent']) });
});

adminRouter.get('/customers/:id', (req, res, next) => {
  const customer = q1(`SELECT c.*, s.name AS preferred_staff_name FROM customers c
                       LEFT JOIN staff s ON s.id = c.preferred_staff_id WHERE c.id = ?`, req.params.id);
  if (!customer) return next(new HttpError(404, 'not_found', 'Client not found'));

  // Generate QR code if missing
  if (!customer.qr_code) {
    const qr = generateQRCode();
    run('UPDATE customers SET qr_code = ? WHERE id = ?', qr, customer.id);
    customer.qr_code = qr;
  }
  const appointments = q(
    `SELECT a.*, s.name AS staff_name, s.colour AS staff_colour FROM appointments a
     JOIN staff s ON s.id = a.staff_id WHERE a.customer_id = ? ORDER BY a.start_at DESC`, customer.id,
  );
  for (const a of appointments) {
    a.items = q('SELECT * FROM appointment_items WHERE appointment_id = ?', a.id);
    a.date = zonedDate(a.start_at, tz());
    a.time = utcToZoned(a.start_at, tz()).time;
  }
  const notifications = q(
    'SELECT * FROM notifications WHERE customer_id = ? ORDER BY created_at DESC LIMIT 30', customer.id,
  );
  const upcoming = appointments.filter((a) => new Date(a.start_at) > new Date() && a.status !== 'cancelled')
    .sort((x, y) => new Date(x.start_at) - new Date(y.start_at))[0] || null;
  res.json({ customer, appointments, notifications, upcoming });
});

adminRouter.post('/customers', canDesk, (req, res) => {
  const body = req.body || {};
  requireFields(body, {
    firstName: { required: true, maxLen: 60 },
    phone: { required: true, type: 'phone' },
    email: { type: 'email' },
  });
  const phone = normalisePhone(body.phone);
  if (q1('SELECT id FROM customers WHERE phone = ?', phone)) {
    throw new HttpError(409, 'duplicate_phone', 'A client with that phone number already exists.');
  }
  const cid = id('cus');
  run(
    `INSERT INTO customers (id,first_name,last_name,phone,email,dob,address,tags,preferred_staff_id,
       allergies,formula_notes,notes,whatsapp_opt_in,marketing_opt_in,consent_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    cid, body.firstName, body.lastName || '', phone, body.email || '', body.dob || null,
    body.address || '', body.tags || '', body.preferredStaffId || null,
    body.allergies || '', body.formulaNotes || '', body.notes || '',
    body.whatsappOptIn === false ? 0 : 1, body.marketingOptIn ? 1 : 0, nowIso(), nowIso(),
  );
  audit({ actor: req.user, action: 'customer.create', entity: 'customer', entityId: cid, detail: body.firstName, ip: req.ip });
  res.status(201).json({ customer: q1('SELECT * FROM customers WHERE id = ?', cid) });
});

adminRouter.patch('/customers/:id', canDesk, (req, res) => {
  const body = req.body || {};
  const existing = q1('SELECT * FROM customers WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'not_found', 'Client not found');
  const map = {
    firstName: 'first_name', lastName: 'last_name', email: 'email', dob: 'dob',
    address: 'address', tags: 'tags', preferredStaffId: 'preferred_staff_id',
    allergies: 'allergies', formulaNotes: 'formula_notes', notes: 'notes',
  };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); params.push(body[key] === '' ? null : String(body[key])); }
  }
  if (body.phone !== undefined) {
    const phone = normalisePhone(body.phone);
    if (phone.length < 10) throw new ValidationError({ phone: 'invalid' });
    const clash = q1('SELECT id FROM customers WHERE phone = ? AND id != ?', phone, req.params.id);
    if (clash) throw new HttpError(409, 'duplicate_phone', 'Another client already has that number.');
    sets.push('phone = ?'); params.push(phone);
  }
  if (body.whatsappOptIn !== undefined) {
    sets.push('whatsapp_opt_in = ?'); params.push(body.whatsappOptIn ? 1 : 0);
    sets.push('consent_at = ?'); params.push(nowIso());
  }
  if (body.marketingOptIn !== undefined) {
    sets.push('marketing_opt_in = ?'); params.push(body.marketingOptIn ? 1 : 0);
    sets.push('consent_at = ?'); params.push(nowIso());
  }
  if (!sets.length) return res.json({ customer: existing });
  params.push(req.params.id);
  run(`UPDATE customers SET ${sets.join(', ')} WHERE id = ?`, ...params);
  audit({ actor: req.user, action: 'customer.update', entity: 'customer', entityId: req.params.id, ip: req.ip });
  res.json({ customer: q1('SELECT * FROM customers WHERE id = ?', req.params.id) });
});

adminRouter.delete('/customers/:id', canOwner, (req, res) => {
  const existing = q1('SELECT * FROM customers WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'not_found', 'Client not found');
  tx(() => {
    run('DELETE FROM notifications WHERE customer_id = ?', req.params.id);
    run('DELETE FROM waitlist WHERE customer_id = ?', req.params.id);
    run('DELETE FROM appointment_items WHERE appointment_id IN (SELECT id FROM appointments WHERE customer_id = ?)', req.params.id);
    run('DELETE FROM appointments WHERE customer_id = ?', req.params.id);
    run('DELETE FROM customers WHERE id = ?', req.params.id);
  });
  audit({ actor: req.user, action: 'customer.erase', entity: 'customer', entityId: req.params.id, detail: 'GDPR erasure', ip: req.ip });
  res.json({ ok: true });
});

adminRouter.get('/customers/export.csv', (req, res) => {
  const rows = q('SELECT * FROM customers ORDER BY first_name');
  const body = csv(rows, [
    { label: 'First name', get: (r) => r.first_name },
    { label: 'Last name', get: (r) => r.last_name },
    { label: 'Phone', get: (r) => r.phone },
    { label: 'Email', get: (r) => r.email },
    { label: 'Tags', get: (r) => r.tags },
    { label: 'Visits', get: (r) => r.visit_count },
    { label: 'Spend', get: (r) => (r.total_spend_pence / 100).toFixed(2) },
    { label: 'Last visit', get: (r) => r.last_visit_at || '' },
    { label: 'WhatsApp opt-in', get: (r) => (r.whatsapp_opt_in ? 'yes' : 'no') },
    { label: 'Marketing opt-in', get: (r) => (r.marketing_opt_in ? 'yes' : 'no') },
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="clients.csv"');
  res.send(body);
});

/* ══ services ════════════════════════════════════════════════════════════ */

adminRouter.get('/services', (req, res) => {
  const services = q('SELECT * FROM services ORDER BY sort_order');
  const skills = q('SELECT staff_id, service_id FROM staff_skills');
  for (const svc of services) svc.staffIds = skills.filter((s) => s.service_id === svc.id).map((s) => s.staff_id);
  res.json({ services });
});

adminRouter.post('/services', canManage, (req, res) => {
  const body = req.body || {};
  requireFields(body, {
    name: { required: true, maxLen: 80 },
    durationMin: { required: true, type: 'int', min: 5, max: 480 },
    pricePence: { required: true, type: 'int', min: 0 },
  });
  const sid = id('svc');
  run(
    `INSERT INTO services (id,name,category,description,duration_min,buffer_min,price_pence,deposit_pence,
       online_bookable,active,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`,
    sid, body.name, body.category || 'Hair', body.description || '',
    body.durationMin, body.bufferMin ?? 10, body.pricePence, body.depositPence ?? 0,
    body.onlineBookable === false ? 0 : 1, Number(body.sortOrder) || 99, nowIso(),
  );
  audit({ actor: req.user, action: 'service.create', entity: 'service', entityId: sid, detail: body.name, ip: req.ip });
  res.status(201).json({ service: q1('SELECT * FROM services WHERE id = ?', sid) });
});

adminRouter.patch('/services/:id', canManage, (req, res) => {
  const body = req.body || {};
  const existing = q1('SELECT * FROM services WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'not_found', 'Service not found');
  const map = {
    name: 'name', category: 'category', description: 'description',
    durationMin: 'duration_min', bufferMin: 'buffer_min', pricePence: 'price_pence',
    depositPence: 'deposit_pence', sortOrder: 'sort_order',
  };
  const sets = []; const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); params.push(body[key]); }
  }
  if (body.onlineBookable !== undefined) { sets.push('online_bookable = ?'); params.push(body.onlineBookable ? 1 : 0); }
  if (body.active !== undefined) { sets.push('active = ?'); params.push(body.active ? 1 : 0); }
  if (!sets.length) return res.json({ service: existing });
  params.push(req.params.id);
  run(`UPDATE services SET ${sets.join(', ')} WHERE id = ?`, ...params);
  audit({ actor: req.user, action: 'service.update', entity: 'service', entityId: req.params.id, ip: req.ip });
  res.json({ service: q1('SELECT * FROM services WHERE id = ?', req.params.id) });
});

adminRouter.delete('/services/:id', canManage, (req, res) => {
  run('UPDATE services SET active = 0, online_bookable = 0 WHERE id = ?', req.params.id);
  audit({ actor: req.user, action: 'service.deactivate', entity: 'service', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

/* ══ staff ═══════════════════════════════════════════════════════════════ */

adminRouter.get('/staff', (req, res) => {
  const staff = q('SELECT * FROM staff ORDER BY sort_order');
  const skills = q('SELECT staff_id, service_id FROM staff_skills');
  const shifts = q('SELECT staff_id, COUNT(*) AS n FROM shifts GROUP BY staff_id');
  for (const member of staff) {
    member.serviceIds = skills.filter((s) => s.staff_id === member.id).map((s) => s.service_id);
    member.shiftCount = shifts.find((s) => s.staff_id === member.id)?.n || 0;
    member.user = q1('SELECT id, email, role, active FROM users WHERE staff_id = ?', member.id) || null;
  }
  res.json({ staff });
});

adminRouter.post('/staff', canManage, (req, res) => {
  const body = req.body || {};
  requireFields(body, { name: { required: true, maxLen: 80 } });
  const sid = id('stf');
  run(
    `INSERT INTO staff (id,name,title,bio,phone,email,colour,employment_type,commission_pct,active,sort_order,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`,
    sid, body.name, body.title || 'Stylist', body.bio || '', body.phone || '', body.email || '',
    body.colour || '#8B5CF6', body.employmentType || 'full_time',
    Number(body.commissionPct) || 0, Number(body.sortOrder) || 99, nowIso(),
  );
  if (Array.isArray(body.serviceIds)) {
    for (const svc of body.serviceIds) run('INSERT OR IGNORE INTO staff_skills (staff_id, service_id) VALUES (?,?)', sid, svc);
  }
  audit({ actor: req.user, action: 'staff.create', entity: 'staff', entityId: sid, detail: body.name, ip: req.ip });
  res.status(201).json({ staff: q1('SELECT * FROM staff WHERE id = ?', sid) });
});

adminRouter.patch('/staff/:id', canManage, (req, res) => {
  const body = req.body || {};
  const existing = q1('SELECT * FROM staff WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'not_found', 'Staff member not found');
  const map = {
    name: 'name', title: 'title', bio: 'bio', phone: 'phone', email: 'email',
    colour: 'colour', employmentType: 'employment_type', commissionPct: 'commission_pct',
    sortOrder: 'sort_order',
  };
  const sets = []; const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); params.push(body[key]); }
  }
  if (body.active !== undefined) { sets.push('active = ?'); params.push(body.active ? 1 : 0); }
  if (sets.length) { params.push(req.params.id); run(`UPDATE staff SET ${sets.join(', ')} WHERE id = ?`, ...params); }
  if (Array.isArray(body.serviceIds)) {
    run('DELETE FROM staff_skills WHERE staff_id = ?', req.params.id);
    for (const svc of body.serviceIds) run('INSERT OR IGNORE INTO staff_skills (staff_id, service_id) VALUES (?,?)', req.params.id, svc);
  }
  audit({ actor: req.user, action: 'staff.update', entity: 'staff', entityId: req.params.id, ip: req.ip });
  res.json({ staff: q1('SELECT * FROM staff WHERE id = ?', req.params.id) });
});

adminRouter.delete('/staff/:id', canManage, (req, res) => {
  run('UPDATE staff SET active = 0 WHERE id = ?', req.params.id);
  audit({ actor: req.user, action: 'staff.deactivate', entity: 'staff', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

/* ══ rota ════════════════════════════════════════════════════════════════ */

adminRouter.get('/rota', (req, res) => {
  const weekStart = startOfWeek(String(req.query.week || todayIn(tz())));
  const weekEnd = addDays(weekStart, 6);
  const staff = q('SELECT * FROM staff WHERE active = 1 ORDER BY sort_order');
  const shifts = q('SELECT * FROM shifts WHERE work_date BETWEEN ? AND ? ORDER BY start_time', weekStart, weekEnd);
  const offs = q(`SELECT * FROM time_off WHERE status != 'declined' AND end_date >= ? AND start_date <= ?`, weekStart, weekEnd);
  const grid = staff.map((member) => ({
    ...member,
    shifts: shifts.filter((s) => s.staff_id === member.id),
    timeOff: offs.filter((o) => o.staff_id === member.id),
  }));
  res.json({
    weekStart,
    days: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    grid,
    conflicts: rotaConflicts(weekStart, weekEnd),
    hours: q('SELECT * FROM opening_hours ORDER BY weekday'),
  });
});

adminRouter.post('/rota', canManage, (req, res) => {
  const body = req.body || {};
  requireFields(body, {
    staffId: { required: true },
    date: { required: true, type: 'date' },
    start: { required: true, type: 'time' },
    end: { required: true, type: 'time' },
  });
  if (body.start >= body.end) throw new ValidationError({ end: 'must be after the start time' });
  if (!q1('SELECT id FROM staff WHERE id = ?', body.staffId)) throw new HttpError(404, 'not_found', 'Staff member not found');
  if (shiftOverlap({ staffId: body.staffId, date: body.date, start: body.start, end: body.end }).length) {
    throw new HttpError(409, 'shift_overlap', 'That person already has a shift overlapping this time.');
  }
  const shiftId = id('sft');
  run('INSERT INTO shifts (id,staff_id,work_date,start_time,end_time,break_min,notes,created_at) VALUES (?,?,?,?,?,?,?,?)',
    shiftId, body.staffId, body.date, body.start, body.end, Number(body.breakMin) || 0, body.notes || '', nowIso());
  audit({ actor: req.user, action: 'rota.create', entity: 'shift', entityId: shiftId, detail: `${body.date} ${body.start}-${body.end}`, ip: req.ip });
  res.status(201).json({ shift: q1('SELECT * FROM shifts WHERE id = ?', shiftId) });
});

adminRouter.patch('/rota/:id', canManage, (req, res) => {
  const body = req.body || {};
  const shift = q1('SELECT * FROM shifts WHERE id = ?', req.params.id);
  if (!shift) throw new HttpError(404, 'not_found', 'Shift not found');
  const next = {
    start: body.start || shift.start_time,
    end: body.end || shift.end_time,
    staffId: body.staffId || shift.staff_id,
    date: body.date || shift.work_date,
  };
  if (next.start >= next.end) throw new ValidationError({ end: 'must be after the start time' });
  if (shiftOverlap({ staffId: next.staffId, date: next.date, start: next.start, end: next.end, ignoreId: shift.id }).length) {
    throw new HttpError(409, 'shift_overlap', 'That person already has a shift overlapping this time.');
  }
  run('UPDATE shifts SET staff_id=?, work_date=?, start_time=?, end_time=?, break_min=?, notes=? WHERE id=?',
    next.staffId, next.date, next.start, next.end,
    body.breakMin !== undefined ? Number(body.breakMin) : shift.break_min,
    body.notes !== undefined ? body.notes : shift.notes, shift.id);
  audit({ actor: req.user, action: 'rota.update', entity: 'shift', entityId: shift.id, ip: req.ip });
  res.json({ shift: q1('SELECT * FROM shifts WHERE id = ?', shift.id) });
});

adminRouter.delete('/rota/:id', canManage, (req, res) => {
  const shift = q1('SELECT * FROM shifts WHERE id = ?', req.params.id);
  if (!shift) throw new HttpError(404, 'not_found', 'Shift not found');
  const bookings = q(`SELECT a.reference FROM appointments a
                      WHERE a.staff_id = ? AND substr(a.start_at,1,10) = ? AND a.status != 'cancelled'`,
    shift.staff_id, shift.work_date);
  run('DELETE FROM shifts WHERE id = ?', shift.id);
  audit({ actor: req.user, action: 'rota.delete', entity: 'shift', entityId: shift.id, ip: req.ip });
  res.json({ ok: true, warnings: bookings.length ? `${bookings.length} booking(s) now have no shift: ${bookings.map((b) => b.reference).join(', ')}` : null });
});

adminRouter.post('/rota/copy', canManage, (req, res) => {
  const { fromWeek, toWeek } = req.body || {};
  if (!fromWeek || !toWeek) throw new ValidationError({ fromWeek: 'required', toWeek: 'required' });
  const from = startOfWeek(fromWeek);
  const to = startOfWeek(toWeek);
  if (from === to) throw new ValidationError({ toWeek: 'must be a different week' });
  const shifts = q('SELECT * FROM shifts WHERE work_date BETWEEN ? AND ?', from, addDays(from, 6));
  let copied = 0; let skipped = 0;
  tx(() => {
    for (const sh of shifts) {
      const offset = Math.round((new Date(sh.work_date) - new Date(from)) / 86_400_000);
      const date = addDays(to, offset);
      const exists = q1('SELECT id FROM shifts WHERE staff_id=? AND work_date=? AND start_time=?', sh.staff_id, date, sh.start_time);
      if (exists) { skipped += 1; continue; }
      run('INSERT INTO shifts (id,staff_id,work_date,start_time,end_time,break_min,notes,created_at) VALUES (?,?,?,?,?,?,?,?)',
        id('sft'), sh.staff_id, date, sh.start_time, sh.end_time, sh.break_min, sh.notes, nowIso());
      copied += 1;
    }
  });
  audit({ actor: req.user, action: 'rota.copy', entity: 'shift', detail: `${from} → ${to} (${copied})`, ip: req.ip });
  res.json({ ok: true, copied, skipped });
});

adminRouter.post('/rota/template', canManage, (req, res) => {
  const week = startOfWeek(String(req.body?.week || todayIn(tz())));
  const staff = q('SELECT * FROM staff WHERE active = 1');
  const recent = q('SELECT * FROM shifts WHERE work_date BETWEEN ? AND ?', addDays(week, -28), addDays(week, -1));
  let created = 0;
  tx(() => {
    for (const member of staff) {
      const mine = recent.filter((s) => s.staff_id === member.id);
      if (!mine.length) continue;
      const start = mine.map((s) => s.start_time).sort()[0];
      const end = mine.map((s) => s.end_time).sort().slice(-1)[0];
      const days = [...new Set(mine.map((s) => new Date(s.work_date + 'T00:00:00Z').getUTCDay()))];
      for (const day of days) {
        const offset = (day + 6) % 7;
        const date = addDays(week, offset);
        if (q1('SELECT id FROM shifts WHERE staff_id=? AND work_date=?', member.id, date)) continue;
        run('INSERT INTO shifts (id,staff_id,work_date,start_time,end_time,break_min,notes,created_at) VALUES (?,?,?,?,?,?,?,?)',
          id('sft'), member.id, date, start, end, 30, 'From pattern', nowIso());
        created += 1;
      }
    }
  });
  audit({ actor: req.user, action: 'rota.template', entity: 'shift', detail: `${week} (${created})`, ip: req.ip });
  res.json({ ok: true, created, weekStart: week });
});

/* ══ time off ════════════════════════════════════════════════════════════ */

adminRouter.get('/timeoff', (req, res) => {
  const rows = q(`SELECT t.*, s.name AS staff_name, s.colour FROM time_off t
                  JOIN staff s ON s.id = t.staff_id ORDER BY t.start_date DESC LIMIT 200`);
  res.json({ timeOff: rows });
});

adminRouter.post('/timeoff', (req, res) => {
  const body = req.body || {};
  requireFields(body, {
    staffId: { required: true },
    startDate: { required: true, type: 'date' },
    endDate: { required: true, type: 'date' },
  });
  if (body.endDate < body.startDate) throw new ValidationError({ endDate: 'must be on or after the start date' });
  const status = req.user.role === 'staff' ? 'pending' : (body.status || 'approved');
  const tofId = id('tof');
  run('INSERT INTO time_off (id,staff_id,start_date,end_date,type,reason,status,created_at) VALUES (?,?,?,?,?,?,?,?)',
    tofId, body.staffId, body.startDate, body.endDate, body.type || 'holiday', body.reason || '', status, nowIso());
  const clashes = q('SELECT * FROM shifts WHERE staff_id = ? AND work_date BETWEEN ? AND ?',
    body.staffId, body.startDate, body.endDate);
  audit({ actor: req.user, action: 'timeoff.create', entity: 'time_off', entityId: tofId, ip: req.ip });
  res.status(201).json({ timeOff: q1('SELECT * FROM time_off WHERE id = ?', tofId), clashingShifts: clashes });
});

adminRouter.patch('/timeoff/:id', canManage, (req, res) => {
  const { status } = req.body || {};
  if (!['pending', 'approved', 'declined'].includes(status)) throw new ValidationError({ status: 'invalid' });
  run('UPDATE time_off SET status = ? WHERE id = ?', status, req.params.id);
  audit({ actor: req.user, action: `timeoff.${status}`, entity: 'time_off', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

/* ══ website ═════════════════════════════════════════════════════════════ */

adminRouter.get('/site', (req, res) => res.json(publicSite()));

adminRouter.get('/preview', (req, res) => res.json(publicSite()));

adminRouter.patch('/site', canManage, (req, res) => {
  const content = req.body?.content || req.body || {};
  for (const [key, value] of Object.entries(content)) {
    if (typeof value !== 'string') continue;
    run(`INSERT INTO site_content (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`, key, value.slice(0, 4000));
  }
  audit({ actor: req.user, action: 'site.update', entity: 'site_content', detail: Object.keys(content).join(','), ip: req.ip });
  res.json(publicSite());
});

adminRouter.patch('/notice', canManage, (req, res) => {
  const body = req.body || {};
  const map = {
    active: 'site.notice_active', text: 'site.notice_text', link: 'site.notice_link',
    linkText: 'site.notice_link_text', tone: 'site.notice_tone',
  };
  for (const [key, setting] of Object.entries(map)) {
    if (body[key] === undefined) continue;
    setSetting(setting, key === 'active' ? (body[key] ? '1' : '0') : String(body[key]).slice(0, 300));
  }
  audit({ actor: req.user, action: 'notice.update', entity: 'settings', detail: Object.keys(body).join(','), ip: req.ip });
  res.json({ notice: publicSite().notice });
});

adminRouter.patch('/hours', canManage, (req, res) => {  const hours = req.body?.hours;
  if (!Array.isArray(hours)) throw new ValidationError({ hours: 'required' });
  for (const row of hours) {
    const weekday = Number(row.weekday);
    if (weekday < 0 || weekday > 6) continue;
    run(`INSERT INTO opening_hours (weekday, open_time, close_time, closed) VALUES (?,?,?,?)
         ON CONFLICT(weekday) DO UPDATE SET open_time=excluded.open_time, close_time=excluded.close_time, closed=excluded.closed`,
      weekday, row.closed ? null : row.open || '09:00', row.closed ? null : row.close || '17:00', row.closed ? 1 : 0);
  }
  audit({ actor: req.user, action: 'hours.update', entity: 'opening_hours', ip: req.ip });
  res.json({ hours: q('SELECT * FROM opening_hours ORDER BY weekday') });
});

/* ══ offers ══════════════════════════════════════════════════════════════ */

adminRouter.get('/offers', (req, res) => {
  const offers = q('SELECT * FROM offers ORDER BY created_at DESC');
  const links = q('SELECT * FROM offer_services');
  for (const offer of offers) offer.serviceIds = links.filter((l) => l.offer_id === offer.id).map((l) => l.service_id);
  res.json({ offers });
});

adminRouter.post('/offers', canManage, (req, res) => {
  const body = req.body || {};
  requireFields(body, { title: { required: true, maxLen: 90 } });
  const offerId = id('off');
  run(`INSERT INTO offers (id,title,description,kind,value,code,starts_on,ends_on,banner,emoji,active,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    offerId, body.title, body.description || '', body.kind || 'percent', Number(body.value) || 0,
    body.code || '', body.startsOn || null, body.endsOn || null, body.banner || '',
    body.emoji || '✨', body.active === false ? 0 : 1, nowIso());
  for (const svc of body.serviceIds || []) {
    run('INSERT OR IGNORE INTO offer_services (offer_id, service_id) VALUES (?,?)', offerId, svc);
  }
  audit({ actor: req.user, action: 'offer.create', entity: 'offer', entityId: offerId, detail: body.title, ip: req.ip });
  res.status(201).json({ offer: q1('SELECT * FROM offers WHERE id = ?', offerId) });
});

adminRouter.patch('/offers/:id', canManage, (req, res) => {
  const body = req.body || {};
  const existing = q1('SELECT * FROM offers WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'not_found', 'Offer not found');
  const map = {
    title: 'title', description: 'description', kind: 'kind', value: 'value', code: 'code',
    startsOn: 'starts_on', endsOn: 'ends_on', banner: 'banner', emoji: 'emoji',
  };
  const sets = []; const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); params.push(body[key]); }
  }
  if (body.active !== undefined) { sets.push('active = ?'); params.push(body.active ? 1 : 0); }
  if (sets.length) { params.push(req.params.id); run(`UPDATE offers SET ${sets.join(', ')} WHERE id = ?`, ...params); }
  if (Array.isArray(body.serviceIds)) {
    run('DELETE FROM offer_services WHERE offer_id = ?', req.params.id);
    for (const svc of body.serviceIds) run('INSERT OR IGNORE INTO offer_services (offer_id, service_id) VALUES (?,?)', req.params.id, svc);
  }
  audit({ actor: req.user, action: 'offer.update', entity: 'offer', entityId: req.params.id, ip: req.ip });
  res.json({ offer: q1('SELECT * FROM offers WHERE id = ?', req.params.id) });
});

adminRouter.delete('/offers/:id', canManage, (req, res) => {
  run('DELETE FROM offers WHERE id = ?', req.params.id);
  audit({ actor: req.user, action: 'offer.delete', entity: 'offer', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

/* ══ packages (loyalty) ══════════════════════════════════════════════════ */

adminRouter.get('/packages', (req, res) => {
  res.json({
    plans: listPlans({ includeInactive: true }),
    purchases: listPurchases({ limit: 300 }),
  });
});

adminRouter.post('/packages', canManage, (req, res) => {
  const body = req.body || {};
  requireFields(body, { name: { required: true, maxLen: 90 } });
  const planId = id('ppl');
  const serviceIds = Array.isArray(body.serviceIds) ? body.serviceIds : [];
  run(`INSERT INTO package_plans (id,name,description,service_ids,sessions,free_sessions,price_pence,
       validity_days,emoji,active,online,sort_order,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    planId, body.name, body.description || '', JSON.stringify(serviceIds),
    Math.max(1, Number(body.sessions) || 5), Math.max(0, Number(body.freeSessions ?? 1)),
    Math.max(0, Math.round(Number(body.pricePence) || 0)), Math.max(1, Number(body.validityDays) || 180),
    body.emoji || '🎁', body.active === false ? 0 : 1, body.online === false ? 0 : 1,
    Number(body.sortOrder) || 0, nowIso());
  audit({ actor: req.user, action: 'package_plan.create', entity: 'package_plan', entityId: planId, detail: body.name, ip: req.ip });
  res.status(201).json({ plan: getPlan(planId) });
});

adminRouter.patch('/packages/:id', canManage, (req, res) => {
  const body = req.body || {};
  const existing = getPlan(req.params.id);
  if (!existing) throw new HttpError(404, 'not_found', 'Package plan not found');
  const map = {
    name: 'name', description: 'description', sessions: 'sessions', freeSessions: 'free_sessions',
    pricePence: 'price_pence', validityDays: 'validity_days', emoji: 'emoji', sortOrder: 'sort_order',
  };
  const sets = []; const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); params.push(body[key]); }
  }
  if (Array.isArray(body.serviceIds)) {
    sets.push('service_ids = ?'); params.push(JSON.stringify(body.serviceIds));
  }
  if (body.active !== undefined) { sets.push('active = ?'); params.push(body.active ? 1 : 0); }
  if (body.online !== undefined) { sets.push('online = ?'); params.push(body.online ? 1 : 0); }
  if (sets.length) {
    params.push(req.params.id);
    run(`UPDATE package_plans SET ${sets.join(', ')} WHERE id = ?`, ...params);
  }
  audit({ actor: req.user, action: 'package_plan.update', entity: 'package_plan', entityId: req.params.id, ip: req.ip });
  res.json({ plan: getPlan(req.params.id) });
});

adminRouter.delete('/packages/:id', canManage, (req, res) => {
  run('UPDATE package_plans SET active = 0, online = 0 WHERE id = ?', req.params.id);
  audit({ actor: req.user, action: 'package_plan.deactivate', entity: 'package_plan', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

adminRouter.get('/package-purchases', (req, res) => {
  res.json({
    purchases: listPurchases({
      status: req.query.status || undefined,
      customerId: req.query.customerId || undefined,
      search: req.query.q || undefined,
      limit: req.query.limit,
    }),
  });
});

adminRouter.post('/package-purchases', canDesk, (req, res) => {
  const body = req.body || {};
  // Either planId (plan-based) or serviceId (custom single-service package)
  if (!body.planId && !body.serviceId) {
    throw new ValidationError({ planId: 'required or serviceId', serviceId: 'required or planId' });
  }
  if (!body.customerId) {
    requireFields(body.customer || {}, {
      firstName: { required: true, maxLen: 60 },
      phone: { required: true, type: 'phone' },
    });
  }
  let customPackage = null;
  if (body.serviceId) {
    const service = q1('SELECT * FROM services WHERE id = ? AND active = 1', body.serviceId);
    if (!service) throw new HttpError(404, 'not_found', 'Service not found');
    const sessions = Number(getSetting('packages.default_sessions') || 5);
    const freeSessions = Number(getSetting('packages.default_free') || 1);
    customPackage = {
      serviceId: service.id,
      serviceName: service.name,
      sessions,
      freeSessions,
      pricePence: service.price_pence * sessions,
    };
  }
  const result = purchasePackage({
    planId: body.planId || null,
    customerId: body.customerId || null,
    customer: body.customerId ? null : body.customer,
    channel: 'staff',
    soldByStaffId: body.soldByStaffId || req.user.staffId || null,
    soldByUserId: req.user.id,
    paidPence: Math.round(Number(body.paidPence) || 0),
    notes: body.notes || '',
    actor: req.user,
    ip: req.ip,
    customPackage,
  });
  res.status(201).json(result);
});

// Staff purchases are active immediately - no approval needed

adminRouter.get('/package-purchases/:id', (req, res, next) => {
  const purchase = getPurchase(req.params.id);
  if (!purchase) return next(new HttpError(404, 'not_found', 'Package not found'));
  res.json({ purchase });
});

adminRouter.post('/package-purchases/:id/payment', canDesk, (req, res) => {
  const body = req.body || {};
  const purchase = recordPackagePayment(req.params.id, {
    amountPence: Math.round(Number(body.amountPence) || 0),
    method: body.method || 'card',
    actor: req.user,
    ip: req.ip,
  });
  res.json({ purchase });
});

adminRouter.post('/package-purchases/:id/redeem', canDesk, (req, res) => {
  const body = req.body || {};
  const out = redeemSession({
    purchaseId: req.params.id,
    appointmentId: body.appointmentId || null,
    note: body.note || '',
    actor: req.user,
    ip: req.ip,
  });
  res.json(out);
});

adminRouter.post('/package-purchases/:id/cancel', canManage, (req, res) => {
  const purchase = cancelPurchase(req.params.id, {
    reason: req.body?.reason || '', actor: req.user, ip: req.ip,
  });
  res.json({ purchase });
});

adminRouter.get('/customers/:id/packages', (req, res) => {
  res.json({ purchases: customerPackages(req.params.id) });
});

/* ══ reviews ═════════════════════════════════════════════════════════════ */

adminRouter.get('/reviews', (req, res) => {
  res.json({
    reviews: q('SELECT * FROM reviews ORDER BY sort_order, reviewed_at DESC'),
    googleUrl: getSetting('reviews.google_url') || '',
    configured: Boolean(process.env.GOOGLE_PLACES_API_KEY && getSetting('reviews.google_place_id')),
  });
});

adminRouter.post('/reviews', canManage, (req, res) => {
  const body = req.body || {};
  requireFields(body, { author: { required: true, maxLen: 80 } });
  const reviewId = id('rev');
  run(`INSERT INTO reviews (id,author,rating,body,source,reviewed_at,featured,sort_order,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    reviewId, body.author, Math.min(5, Math.max(1, Number(body.rating) || 5)),
    String(body.body || '').slice(0, 1000), body.source || 'google', body.reviewedAt || todayIn(tz()),
    body.featured === false ? 0 : 1, Number(body.sortOrder) || 0, nowIso());
  audit({ actor: req.user, action: 'review.create', entity: 'review', entityId: reviewId, detail: body.author, ip: req.ip });
  res.status(201).json({ review: q1('SELECT * FROM reviews WHERE id = ?', reviewId) });
});

adminRouter.patch('/reviews/:id', canManage, (req, res) => {
  const body = req.body || {};
  const existing = q1('SELECT * FROM reviews WHERE id = ?', req.params.id);
  if (!existing) throw new HttpError(404, 'not_found', 'Review not found');
  const map = {
    author: 'author', rating: 'rating', body: 'body', source: 'source',
    reviewedAt: 'reviewed_at', sortOrder: 'sort_order',
  };
  const sets = []; const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined) { sets.push(`${col} = ?`); params.push(body[key]); }
  }
  if (body.featured !== undefined) { sets.push('featured = ?'); params.push(body.featured ? 1 : 0); }
  if (sets.length) { params.push(req.params.id); run(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`, ...params); }
  audit({ actor: req.user, action: 'review.update', entity: 'review', entityId: req.params.id, ip: req.ip });
  res.json({ review: q1('SELECT * FROM reviews WHERE id = ?', req.params.id) });
});

adminRouter.delete('/reviews/:id', canManage, (req, res) => {
  run('DELETE FROM reviews WHERE id = ?', req.params.id);
  audit({ actor: req.user, action: 'review.delete', entity: 'review', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

adminRouter.post('/reviews/sync', canManage, async (req, res, next) => {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const placeId = getSetting('reviews.google_place_id');
  if (!key || !placeId) {
    return res.json({
      synced: 0, configured: false,
      message: 'Add GOOGLE_PLACES_API_KEY to .env and the Google place ID in Settings to sync. Curated reviews are still shown.',
    });
  }
  try {
    const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`;
    const r = await fetch(url, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'reviews,rating,userRatingCount' },
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(502, 'google_error', data?.error?.message || `Google Places ${r.status}`);
    let synced = 0;
    for (const rev of data.reviews || []) {
      const author = rev.authorAttribution?.displayName || 'Google user';
      const text = rev.text?.text || '';
      const rating = Math.min(5, Math.max(1, Number(rev.rating) || 5));
      const when = rev.publishTime ? String(rev.publishTime).slice(0, 10) : todayIn(tz());
      const existing = q1('SELECT * FROM reviews WHERE source = ? AND author = ? AND body = ?', 'google', author, text);
      if (existing) {
        run('UPDATE reviews SET rating = ?, reviewed_at = ? WHERE id = ?', rating, when, existing.id);
        continue;
      }
      run(`INSERT INTO reviews (id,author,rating,body,source,reviewed_at,featured,sort_order,created_at)
           VALUES (?,?,?,?, 'google', ?, 1, 99, ?)`, id('rev'), author, rating, text, when, nowIso());
      synced += 1;
    }
    audit({ actor: req.user, action: 'review.sync', entity: 'review', detail: `${synced} new`, ip: req.ip });
    res.json({ synced, configured: true, average: data.rating || null, total: data.userRatingCount || 0 });
  } catch (err) {
    next(err);
  }
});

/* ══ staff sales & birthdays ═════════════════════════════════════════════ */

adminRouter.get('/sales', canManage, (req, res) => {
  res.json(salesReport({
    date: req.query.date || null,
    from: req.query.from || null,
    to: req.query.to || null,
  }));
});

adminRouter.get('/sales/export.csv', canManage, (req, res) => {
  const report = salesReport({
    date: req.query.date || null,
    from: req.query.from || null,
    to: req.query.to || null,
  });
  const body = csv(report.staff, [
    { label: 'Staff', get: (r) => r.name },
    { label: 'Appointments', get: (r) => r.appointments },
    { label: 'Services sold', get: (r) => r.servicesSold },
    { label: 'Service revenue', get: (r) => (r.serviceRevenue / 100).toFixed(2) },
    { label: 'Packages sold', get: (r) => r.packagesSold },
    { label: 'Package revenue', get: (r) => (r.packageRevenue / 100).toFixed(2) },
    { label: 'Total', get: (r) => (r.totalRevenue / 100).toFixed(2) },
    { label: 'Commission', get: (r) => (r.commissionPence / 100).toFixed(2) },
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="sales-${report.from}.csv"`);
  res.send(body);
});

adminRouter.get('/birthdays', (req, res) => {
  res.json({
    month: req.query.month || todayIn(tz()).slice(5, 7),
    upcoming: upcomingBirthdays(Number(req.query.days) || 7),
    customers: birthdaysInMonth(req.query.month || undefined),
  });
});

adminRouter.post('/birthdays/run', canManage, (req, res) => {
  const result = runBirthdayJob({ force: req.body?.force === true });
  audit({ actor: req.user, action: 'birthday.run', entity: 'notification', detail: `${result.queued} queued`, ip: req.ip });
  res.json(result);
});

/* ══ messaging ═══════════════════════════════════════════════════════════ */

adminRouter.get('/notifications', (req, res) => {
  const { status, customerId } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 300);
  const where = []; const params = [];
  if (status) { where.push('n.status = ?'); params.push(status); }
  if (customerId) { where.push('n.customer_id = ?'); params.push(customerId); }
  const rows = q(`SELECT n.*, c.first_name, c.last_name, a.reference FROM notifications n
                  LEFT JOIN customers c ON c.id = n.customer_id
                  LEFT JOIN appointments a ON a.id = n.appointment_id
                  ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                  ORDER BY n.created_at DESC LIMIT ?`, ...params, limit);
  const counts = q('SELECT status, COUNT(*) AS n FROM notifications GROUP BY status');
  res.json({
    notifications: rows,
    counts: Object.fromEntries(counts.map((c) => [c.status, c.n])),
    mode: whatsappMode(),
    configured: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
  });
});

adminRouter.post('/notifications/:id/send', (req, res, next) => {
  sendNotification(req.params.id)
    .then((out) => res.json(out))
    .catch(next);
});

adminRouter.post('/notifications/:id/retry', canDesk, (req, res) => {
  run("UPDATE notifications SET status='queued', attempts=0, last_error='', scheduled_for=? WHERE id=?", nowIso(), req.params.id);
  res.json({ ok: true });
});

adminRouter.post('/notifications/:id/mark-sent', canDesk, (req, res) => {
  markSent(req.params.id);
  res.json({ ok: true });
});

adminRouter.get('/templates', (req, res) => {
  res.json({ templates: q('SELECT * FROM message_templates ORDER BY name') });
});

adminRouter.put('/templates/:key', canManage, (req, res) => {
  const { body, enabled } = req.body || {};
  if (typeof body !== 'string' || !body.trim()) throw new ValidationError({ body: 'required' });
  run('UPDATE message_templates SET body = ?, enabled = ? WHERE key = ?',
    body.slice(0, 2000), enabled === false ? 0 : 1, req.params.key);
  audit({ actor: req.user, action: 'template.update', entity: 'message_template', entityId: req.params.key, ip: req.ip });
  res.json({ template: q1('SELECT * FROM message_templates WHERE key = ?', req.params.key) });
});

adminRouter.post('/broadcast', canManage, (req, res) => {
  const { offerId = null, segment = 'marketing' } = req.body || {};
  const result = broadcast({ offerId, segment });
  audit({ actor: req.user, action: 'broadcast.send', entity: 'notification', detail: `${segment} (${result.queued})`, ip: req.ip });
  res.json(result);
});

adminRouter.get('/segments', (req, res) => {
  res.json(Object.keys(SEGMENTS).map((key) => ({ key, size: segmentCustomers(key).length })));
});

/* ══ reports, settings, audit ════════════════════════════════════════════ */

adminRouter.get('/reports', canManage, (req, res) => {
  const to = String(req.query.to || todayIn(tz()));
  const from = String(req.query.from || addDays(to, -29));
  res.json(report(from, to));
});

adminRouter.get('/settings', (req, res) => {
  const settings = allSettings();
  delete settings['session.secret'];
  res.json({
    settings,
    defaults: SETTING_DEFAULTS,
    whatsappMode: whatsappMode(),
    whatsappConfigured: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
    siteUrl: process.env.SITE_URL || `http://localhost:${process.env.PORT || 4321}`,
  });
});

adminRouter.patch('/settings', canOwner, (req, res) => {
  const body = req.body || {};
  for (const [key, value] of Object.entries(body)) {
    if (key === 'session.secret') continue;
    if (!(key in SETTING_DEFAULTS)) continue;
    setSetting(key, value);
  }
  audit({ actor: req.user, action: 'settings.update', entity: 'settings', detail: Object.keys(body).join(','), ip: req.ip });
  res.json({ settings: allSettings() });
});

adminRouter.get('/audit', canManage, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  res.json({ entries: q('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?', limit) });
});

/* ══ Treatwell Integration ═════════════════════════════════════════════════════ */

adminRouter.get('/treatwell/status', canManage, (req, res) => {
  res.json({
    enabled: getSetting('treatwell.enabled') === '1',
    apiUrl: getSetting('treatwell.api_url'),
    lastSync: getSetting('treatwell.last_sync'),
    imports: listImports({ limit: 10 }),
  });
});

adminRouter.post('/treatwell/import/customers', canManage, (req, res) => {
  const { csvText } = req.body || {};
  if (!csvText || typeof csvText !== 'string') throw new ValidationError({ csvText: 'required' });
  const result = importCustomers({ csvText, actor: req.user, ip: req.ip });
  res.json(result);
});

adminRouter.post('/treatwell/import/bookings', canManage, (req, res) => {
  const { csvText } = req.body || {};
  if (!csvText || typeof csvText !== 'string') throw new ValidationError({ csvText: 'required' });
  const result = importBookings({ csvText, actor: req.user, ip: req.ip });
  res.json(result);
});

adminRouter.post('/treatwell/import/csv', canManage, (req, res) => {
  // For multipart/form-data, we'd need multer - keeping simple with text body for now
  const { csvText, type } = req.body || {};
  if (!csvText || typeof csvText !== 'string') throw new ValidationError({ csvText: 'required' });
  if (!type || !['customers', 'bookings'].includes(type)) throw new ValidationError({ type: 'must be customers or bookings' });
  const result = type === 'customers'
    ? importCustomers({ csvText, actor: req.user, ip: req.ip })
    : importBookings({ csvText, actor: req.user, ip: req.ip });
  res.json(result);
});

adminRouter.get('/treatwell/imports', canManage, (req, res) => {
  res.json({ imports: listImports({ limit: Number(req.query.limit) || 50 }) });
});

adminRouter.get('/treatwell/imports/:id', canManage, (req, res) => {
  const imp = getImport(req.params.id);
  if (!imp) throw new HttpError(404, 'not_found', 'Import not found');
  res.json({ import: imp });
});

adminRouter.get('/treatwell/mappings', canManage, (req, res) => {
  const status = req.query.status || undefined;
  res.json({ mappings: listMappings({ status, limit: Number(req.query.limit) || 200 }) });
});

adminRouter.post('/treatwell/mappings/:id/confirm', canManage, (req, res) => {
  const mapping = confirmMapping(req.params.id, { actor: req.user, ip: req.ip });
  if (!mapping) throw new HttpError(404, 'not_found', 'Mapping not found');
  res.json({ mapping });
});

adminRouter.post('/treatwell/mappings/:id/reject', canManage, (req, res) => {
  const mapping = rejectMapping(req.params.id, { actor: req.user, ip: req.ip });
  if (!mapping) throw new HttpError(404, 'not_found', 'Mapping not found');
  res.json({ mapping });
});

adminRouter.post('/treatwell/mappings/:id/merge', canManage, (req, res) => {
  const { keepId, mergeId } = req.body || {};
  if (!keepId || !mergeId) throw new ValidationError({ keepId: 'required', mergeId: 'required' });
  const customer = mergeCustomers(keepId, mergeId, { actor: req.user, ip: req.ip });
  res.json({ customer });
});

adminRouter.post('/treatwell/merge', canManage, (req, res) => {
  const { keepId, mergeId } = req.body || {};
  if (!keepId || !mergeId) throw new ValidationError({ keepId: 'required', mergeId: 'required' });
  const customer = mergeCustomers(keepId, mergeId, { actor: req.user, ip: req.ip });
  res.json({ customer });
});

adminRouter.patch('/treatwell/settings', canOwner, (req, res) => {
  const body = req.body || {};
  const allowed = ['treatwell.enabled', 'treatwell.api_url', 'treatwell.api_key'];
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.includes(key)) continue;
    setSetting(key, String(value).slice(0, 500));
  }
  audit({ actor: req.user, action: 'treatwell.settings_update', entity: 'settings', detail: Object.keys(body).join(','), ip: req.ip });
  res.json({ settings: allSettings() });
});

adminRouter.get('/appointments/export.csv', canManage, (req, res) => {
  const rows = listAppointments({ from: req.query.from, to: req.query.to, limit: 2000 });
  const body = csv(rows, [
    { label: 'Reference', get: (r) => r.reference },
    { label: 'Date', get: (r) => r.date },
    { label: 'Start', get: (r) => r.time },
    { label: 'End', get: (r) => r.endTime },
    { label: 'Client', get: (r) => `${r.first_name} ${r.last_name}` },
    { label: 'Phone', get: (r) => r.phone },
    { label: 'Staff', get: (r) => r.staff_name },
    { label: 'Services', get: (r) => r.items.map((i) => i.name_snapshot).join(' + ') },
    { label: 'Status', get: (r) => r.status },
    { label: 'Total', get: (r) => (r.total_pence / 100).toFixed(2) },
    { label: 'Paid', get: (r) => (r.paid_pence / 100).toFixed(2) },
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="appointments.csv"');
  res.send(body);
});
