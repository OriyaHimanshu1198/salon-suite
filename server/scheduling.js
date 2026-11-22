import { q, q1, getSetting } from './db.js';
import {
  zonedToUtc, utcToZoned, addMinutes, addDays, todayIn, dayRange, HttpError,
} from './util.js';

const tz = () => getSetting('salon.timezone') || 'Europe/London';

export function serviceBundle(serviceIds) {
  if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
    throw new HttpError(422, 'validation_failed', 'Choose at least one service', { fields: { serviceIds: 'required' } });
  }
  const unique = [...new Set(serviceIds)];
  const rows = unique.map((sid) => q1('SELECT * FROM services WHERE id = ? AND active = 1', sid));
  if (rows.some((r) => !r)) {
    throw new HttpError(422, 'validation_failed', 'One of those services is no longer available', { fields: { serviceIds: 'invalid' } });
  }
  return {
    services: rows,
    durationMin: rows.reduce((n, r) => n + r.duration_min, 0),
    bufferMin: Math.max(...rows.map((r) => r.buffer_min)),
    pricePence: rows.reduce((n, r) => n + r.price_pence, 0),
    depositPence: rows.reduce((n, r) => n + r.deposit_pence, 0),
  };
}

export function qualifiedStaff(serviceIds, staffId = 'any') {
  const ids = [...new Set(serviceIds)];
  const placeholders = ids.map(() => '?').join(',');
  const rows = q(
    `SELECT s.* FROM staff s
     WHERE s.active = 1
       AND (? = 'any' OR s.id = ?)
       AND (SELECT COUNT(*) FROM staff_skills k WHERE k.staff_id = s.id AND k.service_id IN (${placeholders})) = ?
     ORDER BY s.sort_order`,
    staffId, staffId, ...ids, ids.length,
  );
  return rows;
}

function dayWindows(staffId, date) {
  const zone = tz();
  const shiftRows = q('SELECT * FROM shifts WHERE staff_id = ? AND work_date = ? ORDER BY start_time', staffId, date);
  if (!shiftRows.length) return [];
  const off = q(`SELECT 1 FROM time_off WHERE staff_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?`,
    staffId, date, date);
  if (off.length) return [];
  return shiftRows.map((sh) => ({
    start: zonedToUtc(date, sh.start_time, zone).getTime(),
    end: zonedToUtc(date, sh.end_time, zone).getTime(),
    breakMin: sh.break_min,
  }));
}

function bookedBlocks(staffId, date) {
  const zone = tz();
  const { start, end } = dayRange(date, zone);
  return q(
    `SELECT start_at, end_at FROM appointments
     WHERE staff_id = ? AND status != 'cancelled' AND start_at < ? AND end_at > ?`,
    staffId, end, start,
  ).map((r) => ({ start: new Date(r.start_at).getTime(), end: new Date(r.end_at).getTime() }));
}

function subtract(windows, blocks) {
  let out = windows.map((w) => ({ start: w.start, end: w.end }));
  for (const b of blocks) {
    const next = [];
    for (const w of out) {
      if (b.end <= w.start || b.start >= w.end) { next.push(w); continue; }
      if (b.start > w.start) next.push({ start: w.start, end: b.start });
      if (b.end < w.end) next.push({ start: b.end, end: w.end });
    }
    out = next;
  }
  return out;
}

/** All bookable start times for a date, one per start time (first qualified staff). */
export function availability({ serviceIds, staffId = 'any', date }) {
  const zone = tz();
  const bundle = serviceBundle(serviceIds);
  const block = (bundle.durationMin + bundle.bufferMin) * 60_000;
  const step = Number(getSetting('booking.slot_step_minutes') || 15) * 60_000;
  const noticeMs = Number(getSetting('booking.min_notice_minutes') || 120) * 60_000;
  const horizonMs = Number(getSetting('booking.horizon_days') || 60) * 86_400_000;

  const hours = q1('SELECT * FROM opening_hours WHERE weekday = ?', utcToZoned(zonedToUtc(date, '12:00', zone), zone).weekday);
  if (!hours || hours.closed) return { date, slots: [] };

  const now = Date.now();
  const staff = qualifiedStaff(serviceIds, staffId);
  const byStart = new Map();

  for (const member of staff) {
    const windows = dayWindows(member.id, date);
    if (!windows.length) continue;
    const free = subtract(windows, bookedBlocks(member.id, date));
    for (const w of free) {
      let t = Math.ceil(w.start / step) * step;
      for (; t + block <= w.end; t += step) {
        if (t < now + noticeMs) continue;
        if (t > now + horizonMs) continue;
        if (!byStart.has(t)) {
          byStart.set(t, {
            start: new Date(t).toISOString(),
            end: new Date(t + bundle.durationMin * 60_000).toISOString(),
            staffId: member.id,
            staffName: member.name,
          });
        }
      }
    }
  }

  const slots = [...byStart.values()].sort((a, b) => new Date(a.start) - new Date(b.start));
  return { date, durationMin: bundle.durationMin, pricePence: bundle.pricePence, slots };
}

export function monthAvailability({ serviceIds, staffId = 'any', month }) {
  const [y, m] = month.split('-').map(Number);
  const first = `${month}-01`;
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayIn(tz());
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    if (date < today) { days.push({ date, count: 0 }); continue; }
    const { slots } = availability({ serviceIds, staffId, date });
    days.push({ date, count: slots.length });
  }
  return { month, first, days };
}

/** Throws 409/422 unless the exact slot is bookable for that staff member. */
export function assertBookable({ serviceIds, staffId, startIso }) {
  const zone = tz();
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) {
    throw new HttpError(422, 'validation_failed', 'Invalid start time', { fields: { start: 'invalid' } });
  }
  const date = utcToZoned(start, zone).date;
  const bundle = serviceBundle(serviceIds);
  const block = (bundle.durationMin + bundle.bufferMin) * 60_000;

  const candidates = staffId === 'any' ? qualifiedStaff(serviceIds) : qualifiedStaff(serviceIds, staffId);
  if (!candidates.length) {
    throw new HttpError(409, 'no_staff', 'No one on the team can do that combination of services.');
  }

  const now = Date.now();
  const noticeMs = Number(getSetting('booking.min_notice_minutes') || 120) * 60_000;
  const horizonMs = Number(getSetting('booking.horizon_days') || 60) * 86_400_000;
  if (start.getTime() < now + noticeMs) {
    throw new HttpError(409, 'too_soon', 'That time is too soon to book online. Please call the salon.');
  }
  if (start.getTime() > now + horizonMs) {
    throw new HttpError(409, 'too_far', 'That date is beyond our booking window.');
  }

  const endMs = start.getTime() + block;
  const openRow = q1('SELECT * FROM opening_hours WHERE weekday = ?', utcToZoned(start, zone).weekday);
  if (!openRow || openRow.closed) throw new HttpError(409, 'closed', 'The salon is closed that day.');

  for (const member of candidates) {
    const windows = dayWindows(member.id, date);
    const free = subtract(windows, bookedBlocks(member.id, date));
    const fits = free.some((w) => start.getTime() >= w.start && endMs <= w.end);
    if (fits) {
      return { staff: member, bundle, startAt: new Date(start).toISOString(), endAt: new Date(endMs).toISOString() };
    }
  }

  const { slots } = availability({ serviceIds, staffId, date });
  throw new HttpError(409, 'slot_taken', 'That time was just taken. Please pick another.', {
    alternatives: slots.slice(0, 6).map((s) => s.start),
  });
}

/** Re-check inside a transaction just before insert. */
export function assertNoOverlap({ staffId, startAt, endAt, ignoreAppointmentId = null }) {
  const rows = q(
    `SELECT id FROM appointments
     WHERE staff_id = ? AND status != 'cancelled' AND start_at < ? AND end_at > ?
       AND (? IS NULL OR id != ?)`,
    staffId, endAt, startAt, ignoreAppointmentId, ignoreAppointmentId,
  );
  if (rows.length) {
    throw new HttpError(409, 'slot_taken', 'That slot overlaps another booking.');
  }
}

export function shiftOverlap({ staffId, date, start, end, ignoreId = null }) {
  const rows = q('SELECT * FROM shifts WHERE staff_id = ? AND work_date = ?', staffId, date);
  return rows.filter((r) => r.id !== ignoreId).filter((r) => start < r.end_time && r.start_time < end);
}

export function rotaConflicts(weekStart, weekEnd) {
  const zone = tz();
  const shifts = q('SELECT * FROM shifts WHERE work_date BETWEEN ? AND ?', weekStart, weekEnd);
  const offs = q(`SELECT * FROM time_off WHERE status = 'approved' AND end_date >= ? AND start_date <= ?`, weekStart, weekEnd);
  const appts = q(`SELECT a.*, s.name AS service_name FROM appointments a
                   JOIN appointment_items ai ON ai.appointment_id = a.id
                   JOIN services s ON s.id = ai.service_id
                   WHERE a.status != 'cancelled' AND substr(a.start_at,1,10) BETWEEN ? AND ?`, weekStart, weekEnd);
  const hours = q('SELECT * FROM opening_hours');
  const conflicts = [];

  for (const sh of shifts) {
    const clash = shifts.find((o) => o.id !== sh.id && o.staff_id === sh.staff_id && o.work_date === sh.work_date
      && sh.start_time < o.end_time && o.start_time < sh.end_time);
    if (clash) conflicts.push({ code: 'shift_overlap', staffId: sh.staff_id, date: sh.work_date, detail: `${sh.start_time}–${sh.end_time} overlaps ${clash.start_time}–${clash.end_time}` });
    const off = offs.find((o) => o.staff_id === sh.staff_id && o.start_date <= sh.work_date && o.end_date >= sh.work_date);
    if (off) conflicts.push({ code: 'timeoff_overlap', staffId: sh.staff_id, date: sh.work_date, detail: `On approved ${off.type} leave` });
    const wd = utcToZoned(zonedToUtc(sh.work_date, '12:00', zone), zone).weekday;
    const h = hours.find((x) => x.weekday === wd);
    if (h && !h.closed && (sh.start_time < h.open_time || sh.end_time > h.close_time)) {
      conflicts.push({ code: 'outside_hours', staffId: sh.staff_id, date: sh.work_date, detail: `Shift ${sh.start_time}–${sh.end_time} vs salon ${h.open_time}–${h.close_time}` });
    }
  }

  for (const a of appts) {
    const date = utcToZoned(a.start_at, zone).date;
    const hasShift = shifts.some((s) => s.staff_id === a.staff_id && s.work_date === date
      && s.start_time <= utcToZoned(a.start_at, zone).time && s.end_time >= utcToZoned(a.end_at, zone).time);
    if (!hasShift) conflicts.push({ code: 'unrostered_booking', staffId: a.staff_id, date, detail: `${a.reference} ${a.service_name} has no matching shift` });
  }

  return conflicts;
}

export function nextAvailableDate({ serviceIds, staffId = 'any', fromDate, maxDays = 14 }) {
  for (let i = 0; i < maxDays; i++) {
    const date = addDays(fromDate, i);
    const { slots } = availability({ serviceIds, staffId, date });
    if (slots.length) return { date, slots };
  }
  return null;
}
