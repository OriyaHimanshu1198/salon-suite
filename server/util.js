import crypto from 'node:crypto';

/* ── ids & time ─────────────────────────────────────────────────────────── */

export const nowIso = () => new Date().toISOString();

export function id(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

export function reference() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 4; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return `LS-${out}`;
}

export const MINUTE = 60_000;

export function addMinutes(date, minutes) {
  return new Date(new Date(date).getTime() + minutes * MINUTE);
}

/** ms overlap test on half-open intervals */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(bStart) < new Date(aEnd);
}

function tzOffsetMs(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const map = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const asUtc = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour % 24, +map.minute, +map.second);
  return asUtc - date.getTime();
}

/** "2026-05-04" + "09:30" in salon timezone → Date (UTC instant) */
export function zonedToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
  let ts = naive - tzOffsetMs(new Date(naive), tz);
  ts = naive - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

/** Date → { date: 'YYYY-MM-DD', time: 'HH:MM', weekday: 0-6 } in timezone */
export function utcToZoned(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const map = {};
  for (const p of dtf.formatToParts(new Date(date))) map[p.type] = p.value;
  const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[map.weekday];
  return {
    date: `${map.year}-${map.month}-${map.day}`,
    time: `${String(map.hour % 24).padStart(2, '0')}:${map.minute}`,
    weekday: wd,
  };
}

export const zonedDate = (date, tz) => utcToZoned(date, tz).date;
export const zonedTime = (date, tz) => utcToZoned(date, tz).time;

export function todayIn(tz) {
  return utcToZoned(new Date(), tz).date;
}

export function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function startOfWeek(dateStr, mondayFirst = true) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = mondayFirst ? (day === 0 ? -6 : 1 - day) : -day;
  return addDays(dateStr, diff);
}

export function dayRange(dateStr, tz) {
  const start = zonedToUtc(dateStr, '00:00', tz);
  const end = zonedToUtc(addDays(dateStr, 1), '00:00', tz);
  return { start: start.toISOString(), end: end.toISOString() };
}

/* ── money & text ───────────────────────────────────────────────────────── */

export const money = (pence) => `£${(Number(pence || 0) / 100).toFixed(2)}`;

export function normalisePhone(input) {
  return String(input || '').replace(/[^\d]/g, '').replace(/^0{2}/, '');
}

export function displayPhone(phone) {
  const p = normalisePhone(phone);
  if (p.length === 11 && p.startsWith('0')) return `${p.slice(0, 5)} ${p.slice(5)}`;
  if (p.length > 10) return `+${p.slice(0, 2)} ${p.slice(2, 5)} ${p.slice(5)}`;
  return p;
}

/** E.164-ish for wa.me (UK default country code) */
export function waNumber(phone, countryCode = '44') {
  let p = normalisePhone(phone);
  if (p.startsWith('0')) p = countryCode + p.slice(1);
  if (p.startsWith('00')) p = p.slice(2);
  return p;
}

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function titleCase(s) {
  return String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function initials(name) {
  return String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

export function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

/* ── validation ─────────────────────────────────────────────────────────── */

export class ValidationError extends Error {
  constructor(fields, message = 'Please check the highlighted fields') {
    super(message);
    this.status = 422;
    this.code = 'validation_failed';
    this.fields = fields;
  }
}

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    Object.assign(this, extra);
  }
}

export function requireFields(body, spec) {
  const errors = {};
  for (const [key, rule] of Object.entries(spec)) {
    const raw = body?.[key];
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (rule.required && (value === undefined || value === null || value === '')) {
      errors[key] = 'required';
      continue;
    }
    if (value === undefined || value === null || value === '') continue;
    if (rule.type === 'int') {
      const n = Number(value);
      if (!Number.isFinite(n) || !Number.isInteger(n)) errors[key] = 'must be a whole number';
      else if (rule.min !== undefined && n < rule.min) errors[key] = `must be at least ${rule.min}`;
      else if (rule.max !== undefined && n > rule.max) errors[key] = `must be at most ${rule.max}`;
    }
    if (rule.type === 'number') {
      const n = Number(value);
      if (!Number.isFinite(n)) errors[key] = 'must be a number';
      else if (rule.min !== undefined && n < rule.min) errors[key] = `must be at least ${rule.min}`;
    }
    if (rule.type === 'phone') {
      const p = normalisePhone(value);
      if (p.length < 10 || p.length > 15) errors[key] = 'must be a valid phone number';
    }
    if (rule.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      errors[key] = 'must be YYYY-MM-DD';
    }
    if (rule.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))) {
      errors[key] = 'must be HH:MM';
    }
    if (rule.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
      errors[key] = 'must be an email address';
    }
    if (rule.type === 'enum' && !rule.values.includes(value)) {
      errors[key] = `must be one of ${rule.values.join(', ')}`;
    }
    if (rule.maxLen && String(value).length > rule.maxLen) {
      errors[key] = `must be ${rule.maxLen} characters or fewer`;
    }
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
}

/* ── misc ───────────────────────────────────────────────────────────────── */

export function slug(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function csv(rows, columns) {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => escape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => escape(c.get(r))).join(',')).join('\n');
  return head + '\n' + body + '\n';
}
