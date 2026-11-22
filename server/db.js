import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import {
  id, nowIso, reference, zonedToUtc, addDays, startOfWeek, zonedDate,
  normalisePhone, utcToZoned,
} from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const DB_PATH = process.env.SALON_DB || path.join(DATA_DIR, 'salon.db');

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');

/* ── tiny query helpers ─────────────────────────────────────────────────── */

export const q = (sql, ...params) => db.prepare(sql).all(...params);
export const q1 = (sql, ...params) => db.prepare(sql).get(...params);
export const run = (sql, ...params) => db.prepare(sql).run(...params);

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/* ── schema ─────────────────────────────────────────────────────────────── */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, title TEXT NOT NULL DEFAULT 'Stylist',
  bio TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
  colour TEXT NOT NULL DEFAULT '#C084FC', employment_type TEXT NOT NULL DEFAULT 'full_time',
  commission_pct REAL NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  name TEXT NOT NULL, role TEXT NOT NULL CHECK (role IN ('owner','manager','reception','staff')),
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL, active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Hair',
  description TEXT NOT NULL DEFAULT '', duration_min INTEGER NOT NULL,
  buffer_min INTEGER NOT NULL DEFAULT 10, price_pence INTEGER NOT NULL,
  deposit_pence INTEGER NOT NULL DEFAULT 0, online_bookable INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS staff_skills (
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_id, service_id)
);

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL UNIQUE, email TEXT NOT NULL DEFAULT '', dob TEXT,
  address TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',
  preferred_staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  allergies TEXT NOT NULL DEFAULT '', formula_notes TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '', whatsapp_opt_in INTEGER NOT NULL DEFAULT 1,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0, consent_at TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0, total_spend_pence INTEGER NOT NULL DEFAULT 0,
  visit_count INTEGER NOT NULL DEFAULT 0, last_visit_at TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id), staff_id TEXT NOT NULL REFERENCES staff(id),
  start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('pending','confirmed','arrived','completed','no_show','cancelled')),
  source TEXT NOT NULL DEFAULT 'online'
    CHECK (source IN ('online','phone','walkin','instagram','admin')),
  total_pence INTEGER NOT NULL DEFAULT 0, deposit_pence INTEGER NOT NULL DEFAULT 0,
  deposit_method TEXT NOT NULL DEFAULT '', paid_pence INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '', internal_notes TEXT NOT NULL DEFAULT '',
  cancelled_at TEXT, cancel_reason TEXT NOT NULL DEFAULT '', reminder_sent_at TEXT,
  created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_appt_staff_time ON appointments(staff_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appt_customer ON appointments(customer_id, start_at);
CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status, start_at);

CREATE TABLE IF NOT EXISTS appointment_items (
  id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id), name_snapshot TEXT NOT NULL,
  duration_min INTEGER NOT NULL, price_pence INTEGER NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_items_appt ON appointment_items(appointment_id);

CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL,
  break_min INTEGER NOT NULL DEFAULT 0, notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL, UNIQUE (staff_id, work_date, start_time)
);
CREATE INDEX IF NOT EXISTS idx_shifts_date ON shifts(work_date);

CREATE TABLE IF NOT EXISTS time_off (
  id TEXT PRIMARY KEY, staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'holiday', reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'approved', created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS opening_hours (
  weekday INTEGER PRIMARY KEY, open_time TEXT, close_time TEXT, closed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS site_content (key TEXT PRIMARY KEY, value TEXT NOT NULL DEFAULT '');

CREATE TABLE IF NOT EXISTS offers (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'percent', value REAL NOT NULL DEFAULT 0,
  code TEXT NOT NULL DEFAULT '', starts_on TEXT, ends_on TEXT,
  banner TEXT NOT NULL DEFAULT '', emoji TEXT NOT NULL DEFAULT '✨',
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offer_services (
  offer_id TEXT NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (offer_id, service_id)
);

CREATE TABLE IF NOT EXISTS message_templates (
  key TEXT PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp', template_key TEXT NOT NULL,
  to_phone TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued',
  scheduled_for TEXT NOT NULL, sent_at TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '', wa_link TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_due ON notifications(status, scheduled_for);

CREATE TABLE IF NOT EXISTS waitlist (
  id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
  staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  from_date TEXT NOT NULL, to_date TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'waiting', created_at TEXT NOT NULL
);

-- ── Packages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS package_plans (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  service_ids TEXT NOT NULL DEFAULT '[]', sessions INTEGER NOT NULL DEFAULT 5,
  free_sessions INTEGER NOT NULL DEFAULT 1, price_pence INTEGER NOT NULL DEFAULT 0,
  validity_days INTEGER NOT NULL DEFAULT 180, emoji TEXT NOT NULL DEFAULT '🎁',
  active INTEGER NOT NULL DEFAULT 1, online INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS package_purchases (
  id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES package_plans(id),
  plan_name TEXT NOT NULL DEFAULT '', sessions_total INTEGER NOT NULL,
  sessions_used INTEGER NOT NULL DEFAULT 0, price_pence INTEGER NOT NULL DEFAULT 0,
  paid_pence INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval','active','cancelled','completed')),
  channel TEXT NOT NULL DEFAULT 'online',
  sold_by_staff_id TEXT REFERENCES staff(id) ON DELETE SET NULL,
  sold_by_user_id TEXT, purchased_at TEXT NOT NULL, expires_at TEXT,
  approved_at TEXT, approved_by TEXT,
  notes TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_pkg_customer ON package_purchases(customer_id, status);
CREATE INDEX IF NOT EXISTS idx_pkg_sold ON package_purchases(sold_by_staff_id, purchased_at);

CREATE TABLE IF NOT EXISTS package_redemptions (
  id TEXT PRIMARY KEY, purchase_id TEXT NOT NULL REFERENCES package_purchases(id) ON DELETE CASCADE,
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  session_no INTEGER NOT NULL, is_free INTEGER NOT NULL DEFAULT 0,
  note TEXT NOT NULL DEFAULT '', redeemed_at TEXT NOT NULL, redeemed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_redemption_purchase ON package_redemptions(purchase_id);

-- ── Reviews ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY, author TEXT NOT NULL, rating INTEGER NOT NULL DEFAULT 5,
  body TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'google',
  reviewed_at TEXT, featured INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY, actor_id TEXT, actor_name TEXT NOT NULL DEFAULT 'system',
  action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT,
  detail TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ── Treatwell Integration ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS treatwell_imports (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('customers','bookings')),
  source TEXT NOT NULL DEFAULT 'csv',
  filename TEXT,
  rows_total INTEGER NOT NULL,
  rows_created INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_skipped INTEGER NOT NULL DEFAULT 0,
  errors TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'completed',
  created_by TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_treatwell_imports_created ON treatwell_imports(created_at);

CREATE TABLE IF NOT EXISTS treatwell_mappings (
  id TEXT PRIMARY KEY,
  local_customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  treatwell_customer_id TEXT NOT NULL,
  treatwell_email TEXT,
  treatwell_phone TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_treatwell_mappings_local ON treatwell_mappings(local_customer_id);
CREATE INDEX IF NOT EXISTS idx_treatwell_mappings_treatwell ON treatwell_mappings(treatwell_customer_id);
CREATE INDEX IF NOT EXISTS idx_treatwell_mappings_status ON treatwell_mappings(status);
`;

db.exec(SCHEMA);

/* ── migrations for databases created before this schema ────────────────── */

function ensureColumn(table, column, ddl) {
  const cols = q(`PRAGMA table_info(${table})`);
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}

ensureColumn('appointments', 'discount_pence', 'INTEGER NOT NULL DEFAULT 0');
ensureColumn('appointments', 'package_purchase_id', 'TEXT');
ensureColumn('appointments', 'treatwell_booking_id', 'TEXT');
ensureColumn('customers', 'qr_code', 'TEXT');
ensureColumn('customers', 'treatwell_customer_id', 'TEXT');
ensureColumn('package_purchases', 'approved_at', 'TEXT');
ensureColumn('package_purchases', 'approved_by', 'TEXT');
ensureColumn('package_purchases', 'status', "TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','completed'))");
ensureColumn('package_purchases', 'service_id', 'TEXT REFERENCES services(id) ON DELETE SET NULL');

// Backfill qr_code for existing customers
const customersWithoutQR = q("SELECT id FROM customers WHERE qr_code IS NULL OR qr_code = ''");
for (const c of customersWithoutQR) {
  const qr = 'QR-' + crypto.randomBytes(8).toString('hex').toUpperCase();
  run('UPDATE customers SET qr_code = ? WHERE id = ?', qr, c.id);
}

// Add unique index on qr_code after backfill (allow multiple NULLs)
try {
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_qr_code ON customers(qr_code) WHERE qr_code IS NOT NULL');
} catch (e) {
  console.warn('QR code unique index:', e.message);
}

/* ── settings ───────────────────────────────────────────────────────────── */

export const SETTING_DEFAULTS = {
  'salon.name': 'Lumière Hair & Beauty',
  'salon.timezone': 'Europe/London',
  'salon.currency': 'GBP',
  'salon.country_code': '44',
  'booking.slot_step_minutes': '15',
  'booking.min_notice_minutes': '120',
  'booking.horizon_days': '60',
  'booking.cancellation_notice_hours': '24',
  'booking.auto_confirm': '1',
  'booking.max_services': '4',
  'rota.block_break': '0',
  'whatsapp.mode': 'link',
  'whatsapp.reminder_hours': '24',
  'whatsapp.sender_name': 'Lumière',
  'whatsapp.quiet_start': '08:00',
  'whatsapp.quiet_end': '20:00',
  'reviews.url': '',
  'reviews.google_url': 'https://g.page/r/lumiere-salon/review',
  'reviews.google_place_id': '',
  'reviews.headline': 'Loved on Google',
  'reviews.min_rating': '4',
  'loyalty.points_per_pound': '1',
  'site.notice_active': '1',
  'site.notice_text': 'Christmas gift cards are here — 10% extra value when you spend £100 or more.',
  'site.notice_link': '#offers',
  'site.notice_link_text': 'See offers',
  'site.notice_tone': 'gold',
  'packages.enabled': '1',
  'packages.headline': 'Treatment packages',
  'birthday.enabled': '1',
  'birthday.discount_pct': '15',
  'birthday.window_days': '7',
  'birthday.last_run': '',
  'treatwell.enabled': '0',
  'treatwell.api_url': '',
  'treatwell.api_key': '',
  'treatwell.last_sync': '',
  'packages.default_sessions': '5',
  'packages.default_free': '1',
};

export function getSetting(key) {
  const row = q1('SELECT value FROM settings WHERE key = ?', key);
  return row ? row.value : SETTING_DEFAULTS[key];
}

export function setSetting(key, value) {
  run(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key, String(value),
  );
}

export function allSettings() {
  const rows = q('SELECT key, value FROM settings');
  const out = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

for (const [k, v] of Object.entries(SETTING_DEFAULTS)) {
  run('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)', k, v);
}

/* ── audit ──────────────────────────────────────────────────────────────── */

export function audit({ actor, action, entity, entityId = null, detail = '', ip = '' }) {
  run(
    `INSERT INTO audit_log (id, actor_id, actor_name, action, entity, entity_id, detail, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id('aud'), actor?.id || null, actor?.name || 'system', action, entity, entityId, detail, ip, nowIso(),
  );
}

/* ── password hashing ───────────────────────────────────────────────────── */

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const candidate = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

/* ── seed ───────────────────────────────────────────────────────────────── */

const TZ = () => getSetting('salon.timezone') || 'Europe/London';

const STAFF = [
  ['stf_anya', 'Anya Petrova', 'Senior Stylist', 'Precision cuts and curly hair. 12 years behind the chair.', '#8B5CF6', 12, 30],
  ['stf_marcus', 'Marcus Reid', 'Master Barber', 'Sharp fades, classic scissor work and beard sculpting.', '#0EA5E9', 10, 28],
  ['stf_priya', 'Priya Shah', 'Colour Specialist', 'Balayage, correction work and vivids. Wella master colourist.', '#EC4899', 11, 32],
  ['stf_chloe', 'Chloe Bennett', 'Stylist', 'Soft layered cuts and effortless blow-dries.', '#F59E0B', 9, 24],
  ['stf_jade', 'Jade Okafor', 'Nail Technician', 'Gel, builder and hand-painted nail art.', '#10B981', 9, 25],
  ['stf_sofia', 'Sofia Rossi', 'Beauty Therapist', 'Facials, brows and lash lifts.', '#F43F5E', 9, 26],
  ['stf_liam', 'Liam Doyle', 'Junior Stylist', 'Cuts, blow-dries and styling. Building a colour clientele.', '#64748B', 8, 18],
];

const SERVICES = [
  ['svc_cut', 'Cut & Finish', 'Hair', 'Consultation, wash, precision cut and finish.', 45, 10, 4500],
  ['svc_restyle', 'Restyle', 'Hair', 'A full shape change with styling advice.', 60, 10, 6500],
  ['svc_blowdry', 'Blow Dry', 'Hair', 'Wash and professional finish.', 30, 10, 3000],
  ['svc_kids', "Children's Cut", 'Hair', 'Ages 12 and under.', 30, 10, 2200],
  ['svc_gents', "Gents Cut", 'Hair', 'Clipper and scissor cut with a clean finish.', 30, 10, 2800],
  ['svc_fringe', 'Fringe Trim', 'Hair', 'Quick tidy between appointments.', 15, 5, 1000],
  ['svc_fullcolour', 'Full Head Colour', 'Colour', 'Single-process colour root to tip.', 120, 15, 9500],
  ['svc_roots', 'Root Touch-Up', 'Colour', 'Regrowth only, up to 2 cm.', 60, 15, 5500],
  ['svc_balayage', 'Balayage', 'Colour', 'Hand-painted freehand lightening.', 180, 20, 16000],
  ['svc_highlights', 'Highlights', 'Colour', 'Full or half head foils.', 150, 15, 13000],
  ['svc_toner', 'Toner & Gloss', 'Colour', 'Refresh tone and shine.', 45, 10, 4000],
  ['svc_keratin', 'Keratin Smoothing', 'Treatments', 'Frizz-reducing smoothing treatment.', 150, 15, 14000],
  ['svc_scalp', 'Scalp Ritual', 'Treatments', 'Massage, exfoliation and hydration.', 45, 10, 3800],
  ['svc_deep', 'Deep Conditioning', 'Treatments', 'Intensive repair mask under steam.', 30, 10, 2500],
  ['svc_gel', 'Gel Manicure', 'Nails', 'Shape, cuticle work and gel colour.', 60, 10, 4000],
  ['svc_pedi', 'Luxury Pedicure', 'Nails', 'Soak, file, massage and polish.', 75, 10, 5000],
  ['svc_nailart', 'Nail Art Add-on', 'Nails', 'Hand-painted detail, per hand.', 20, 5, 1500],
  ['svc_brows', 'Brow Shape & Tint', 'Brows', 'Wax, tidy and tint.', 30, 5, 2500],
  ['svc_lash', 'Lash Lift', 'Brows', 'Lift and tint, lasts 6-8 weeks.', 60, 10, 5500],
];

const SKILLS = {
  stf_anya: ['svc_cut', 'svc_restyle', 'svc_blowdry', 'svc_kids', 'svc_fringe', 'svc_fullcolour', 'svc_roots', 'svc_toner', 'svc_deep'],
  stf_marcus: ['svc_cut', 'svc_restyle', 'svc_gents', 'svc_kids', 'svc_fringe', 'svc_blowdry'],
  stf_priya: ['svc_fullcolour', 'svc_roots', 'svc_balayage', 'svc_highlights', 'svc_toner', 'svc_cut', 'svc_blowdry', 'svc_keratin'],
  stf_chloe: ['svc_cut', 'svc_restyle', 'svc_blowdry', 'svc_kids', 'svc_fringe', 'svc_deep', 'svc_toner'],
  stf_jade: ['svc_gel', 'svc_pedi', 'svc_nailart'],
  stf_sofia: ['svc_brows', 'svc_lash', 'svc_scalp', 'svc_deep'],
  stf_liam: ['svc_cut', 'svc_blowdry', 'svc_kids', 'svc_fringe', 'svc_gents'],
};

const CLIENTS = [
  ['Maya', 'Khan', '07700900121', 'VIP,Colour', 1, 1],
  ['Olivia', 'Hart', '07700900122', 'Regular', 1, 1],
  ['Grace', 'Adeyemi', '07700900123', 'Colour', 1, 0],
  ['Sophie', 'Turner', '07700900124', '', 1, 1],
  ['Amelia', 'Clarke', '07700900125', 'VIP', 1, 1],
  ['Isla', 'Murphy', '07700900126', 'Regular', 0, 0],
  ['Freya', 'Nolan', '07700900127', 'Colour,Nails', 1, 1],
  ['Aisha', 'Rahman', '07700900128', 'VIP,Colour', 1, 1],
  ['Chloe', 'Walsh', '07700900129', '', 1, 0],
  ['Hannah', 'Price', '07700900130', 'Regular', 1, 1],
  ['Zara', 'Ahmed', '07700900131', 'Nails', 1, 0],
  ['Ella', 'Fitzgerald', '07700900132', '', 0, 0],
  ['Niamh', 'Byrne', '07700900133', 'Colour', 1, 1],
  ['Ruby', 'Sanderson', '07700900134', 'Regular,VIP', 1, 1],
  ['Leah', 'Cohen', '07700900135', '', 1, 0],
  ['Fatima', 'Yusuf', '07700900136', 'Brows', 1, 1],
  ['Erin', 'Doyle', '07700900137', 'Regular', 1, 0],
  ['Tara', 'O\'Neill', '07700900138', '', 1, 1],
  ['Jasmine', 'Cole', '07700900139', 'VIP,Colour', 1, 1],
  ['Bethan', 'Evans', '07700900140', 'Nails', 1, 0],
  ['Nadia', 'Hussain', '07700900141', 'Colour', 1, 1],
  ['Katie', 'Morgan', '07700900142', '', 1, 0],
  ['Alice', 'Brennan', '07700900143', 'Regular', 1, 1],
  ['Sara', 'Lindqvist', '07700900144', 'VIP', 1, 1],
];

const TEMPLATES = [
  ['booking_confirmed', 'Booking confirmation',
    'Hi {{first_name}}, your {{service_list}} at {{salon_name}} is confirmed for {{date}} at {{time}} with {{staff_name}}. Ref {{reference}}. Reply STOP to opt out.'],
  ['reminder_24h', 'Appointment reminder',
    'Reminder: {{service_list}} tomorrow at {{time}} with {{staff_name}} at {{salon_name}}. Ref {{reference}}. See you then!'],
  ['booking_cancelled', 'Cancellation notice',
    'Hi {{first_name}}, your {{date}} {{time}} appointment has been cancelled. Ref {{reference}}. Call {{salon_phone}} to rebook.'],
  ['booking_rescheduled', 'Reschedule notice',
    'Hi {{first_name}}, your appointment has moved to {{date}} at {{time}} with {{staff_name}}. Ref {{reference}}.'],
  ['thank_you', 'Thank you + review',
    'Thank you {{first_name}}! We hope you love the {{service_list}}. Leave a review: {{review_url}} — rebook anytime: {{booking_url}}'],
  ['waitlist_open', 'Waitlist slot open',
    'Good news {{first_name}} — we have a {{service_list}} slot on {{date}} at {{time}}. Book: {{booking_url}}'],
  ['offer_broadcast', 'Offer broadcast',
    '{{offer_title}} — {{offer_description}} {{offer_code_line}} Book: {{booking_url}} Reply STOP to opt out.'],
  ['payment_receipt', 'Payment receipt',
    'Payment of {{amount}} received for {{date}}. Balance: {{balance}}. Thank you!'],
  ['birthday_offer', 'Birthday treat',
    'Happy birthday {{first_name}}! 🎂 Enjoy {{birthday_discount}}% off any treatment during your birthday week. Book: {{booking_url}} Reply STOP to opt out.'],
  ['package_purchased', 'Package reserved',
    'Hi {{first_name}}, your {{package_name}} is reserved. Ref {{reference}} — {{sessions}} treatments plus {{free}} free. We will confirm payment in the salon. See you soon!'],
  ['package_free_ready', 'Free session ready',
    '{{first_name}}, that was treatment {{used}} of {{paid}} on your {{package_name}} — your next one is on us. Book: {{booking_url}}'],
  ['package_complete', 'Package complete',
    '{{first_name}}, your {{package_name}} is complete. Thank you! Ready for a new one? {{booking_url}}'],
];

const CONTENT = {
  hero_kicker: 'Hair · Colour · Nails · Beauty',
  hero_title: 'A salon that <em>remembers you</em>',
  hero_sub: 'Precision cuts, considered colour and treatments that fit around your life. Book online in under a minute — no phone tag, no waiting.',
  about_title: 'Seven specialists, one calm room',
  about_body: 'We opened in 2016 with a simple idea: give every client enough time. That means no double-booked chairs, a proper consultation on every visit, and colourists who will tell you honestly when a trend will not suit your hair. Our team trains four times a year, and we only use products we would use on ourselves.',
  address: '18 Marlborough Lane, London SE10 8QH',
  phone: '020 7946 0812',
  email: 'hello@lumiere-salon.co.uk',
  instagram: '@lumiere.salon',
  facebook: 'lumierehairbeauty',
  tiktok: '@lumiere.salon',
  google: 'https://g.page/r/lumiere-salon',
  youtube: '',
  whatsapp: '447700900123',
  booking_policy: 'Please give us 24 hours notice to cancel or move an appointment. Deposits are transferable to a future visit. Late arrivals over 15 minutes may need to be rescheduled so the next client is not kept waiting.',
  footer_note: 'Open Monday to Saturday. Free consultation on all colour services.',
  review_url: 'https://g.page/r/lumiere-salon/review',
};

function seedDatabase() {
  const tz = TZ();
  const now = nowIso();
  const today = zonedDate(new Date(), tz);

  // deterministic-ish PRNG so the demo looks the same on reseed
  let s = 20260504;
  const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];

  // opening hours
  const hours = [[0, null, null, 1], [1, '09:00', '19:00', 0], [2, '09:00', '19:00', 0], [3, '09:00', '19:00', 0],
    [4, '09:00', '20:00', 0], [5, '09:00', '19:00', 0], [6, '09:00', '17:00', 0]];
  for (const [wd, open, close, closed] of hours) {
    run('INSERT OR REPLACE INTO opening_hours (weekday, open_time, close_time, closed) VALUES (?,?,?,?)', wd, open, close, closed);
  }

  for (const [k, v] of Object.entries(CONTENT)) {
    run('INSERT OR IGNORE INTO site_content (key, value) VALUES (?, ?)', k, v);
  }

  // staff
  STAFF.forEach(([sid, name, title, bio, colour, startHour, rate], i) => {
    run(`INSERT INTO staff (id,name,title,bio,phone,email,colour,employment_type,commission_pct,active,sort_order,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`,
      sid, name, title, bio, `0770090${2000 + i}`, `${name.split(' ')[0].toLowerCase()}@lumiere-salon.co.uk`,
      colour, i < 5 ? 'full_time' : 'part_time', rate, i, now);
  });

  // services
  SERVICES.forEach(([sid, name, cat, desc, dur, buf, price], i) => {
    run(`INSERT INTO services (id,name,category,description,duration_min,buffer_min,price_pence,deposit_pence,online_bookable,active,sort_order,created_at)
         VALUES (?,?,?,?,?,?,?,?,1,1,?,?)`,
      sid, name, cat, desc, dur, buf, price, price > 8000 ? 2000 : 0, i, now);
  });

  for (const [sid, list] of Object.entries(SKILLS)) {
    for (const svc of list) run('INSERT OR IGNORE INTO staff_skills (staff_id, service_id) VALUES (?,?)', sid, svc);
  }

  // users
  const accounts = [
    ['owner@lumiere.test', 'Salon Owner', 'owner', null],
    ['manager@lumiere.test', 'Dana Whitfield', 'manager', null],
    ['reception@lumiere.test', 'Kofi Mensah', 'reception', null],
    ['anya@lumiere.test', 'Anya Petrova', 'staff', 'stf_anya'],
    ['priya@lumiere.test', 'Priya Shah', 'staff', 'stf_priya'],
  ];
  for (const [email, name, role, staffId] of accounts) {
    run('INSERT INTO users (id,email,password_hash,name,role,staff_id,active,created_at) VALUES (?,?,?,?,?,?,1,?)',
      id('usr'), email, hashPassword('salon123'), name, role, staffId, now);
  }

  // clients — a few birthdays land around today so the demo shows the birthday flow
  const birthdayOffsets = { 1: 0, 6: 2, 12: 5, 18: -3 };
  CLIENTS.forEach(([first, last, phone, tags, wa, marketing], i) => {
    const monthDay = birthdayOffsets[i] !== undefined
      ? addDays(today, birthdayOffsets[i]).slice(5)
      : `0${1 + (i % 9)}-1${i % 9}`;
    run(`INSERT INTO customers (id,first_name,last_name,phone,email,dob,address,tags,preferred_staff_id,
         allergies,formula_notes,notes,whatsapp_opt_in,marketing_opt_in,consent_at,loyalty_points,total_spend_pence,
         visit_count,last_visit_at,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,0,NULL,?)`,
      `cus_${String(i + 1).padStart(3, '0')}`, first, last, normalisePhone(phone),
      `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@example.com`,
      `199${3 + (i % 8)}-${monthDay}`,
      `${10 + i} Ashburnham Road, London`, tags,
      tags.includes('Colour') ? 'stf_priya' : (i % 3 === 0 ? 'stf_anya' : null),
      i % 7 === 0 ? 'Sensitive scalp — avoid ammonia' : '',
      tags.includes('Colour') ? `Base ${4 + (i % 3)}.0, 6% developer, 30 min` : '',
      i % 5 === 0 ? 'Prefers quiet appointments, no small talk' : '',
      wa, marketing, wa ? now : null, now);
  });

  // shifts: 3 weeks back → 5 weeks forward
  const patterns = {
    stf_anya: ['09:00', '17:00', [1, 2, 3, 4, 5, 6]],
    stf_marcus: ['10:00', '18:00', [1, 2, 3, 5, 6]],
    stf_priya: ['10:00', '19:00', [1, 2, 4, 5, 6]],
    stf_chloe: ['09:00', '17:00', [1, 2, 3, 4, 6]],
    stf_jade: ['10:00', '18:00', [2, 3, 4, 5, 6]],
    stf_sofia: ['09:30', '17:30', [1, 3, 4, 5]],
    stf_liam: ['11:00', '19:00', [2, 3, 4, 5, 6]],
  };
  const baseMonday = startOfWeek(today);
  const openByDay = Object.fromEntries(hours.map(([wd, open, close, closed]) => [wd, { open, close, closed }]));
  for (let w = -3; w <= 4; w++) {
    const monday = addDays(baseMonday, w * 7);
    for (const [sid, [start, end, days]] of Object.entries(patterns)) {
      for (const offset of days) {
        const date = addDays(monday, offset - 1);
        const wd = new Date(date + 'T00:00:00Z').getUTCDay();
        const day = openByDay[wd];
        if (!day || day.closed) continue;
        const st = start < day.open ? day.open : start;
        const en = end > day.close ? day.close : end;
        if (st >= en) continue;
        run('INSERT OR IGNORE INTO shifts (id,staff_id,work_date,start_time,end_time,break_min,notes,created_at) VALUES (?,?,?,?,?,?,?,?)',
          id('sft'), sid, date, st, en, 30, '', now);
      }
    }
  }

  // time off
  run('INSERT INTO time_off (id,staff_id,start_date,end_date,type,reason,status,created_at) VALUES (?,?,?,?,?,?,?,?)',
    id('tof'), 'stf_chloe', addDays(today, 9), addDays(today, 13), 'holiday', 'Family trip', 'approved', now);
  run('INSERT INTO time_off (id,staff_id,start_date,end_date,type,reason,status,created_at) VALUES (?,?,?,?,?,?,?,?)',
    id('tof'), 'stf_liam', addDays(today, 4), addDays(today, 4), 'training', 'Colour course', 'approved', now);
  run('INSERT INTO time_off (id,staff_id,start_date,end_date,type,reason,status,created_at) VALUES (?,?,?,?,?,?,?,?)',
    id('tof'), 'stf_jade', addDays(today, 20), addDays(today, 21), 'holiday', 'Wedding', 'pending', now);

  // offers
  const offers = [
    ['Midweek Colour Club', '20% off any colour service Tuesday to Thursday, booked online.', 'percent', 20, 'COLOUR20', 0, 30, '✨'],
    ['First Visit Cut', '£10 off your first cut and finish with any stylist.', 'amount', 10, 'FIRST10', 0, 60, '✂️'],
    ['Gel Manicure + Pedicure', 'Book both nails services and save £15.', 'amount', 15, 'NAILS15', 0, 45, '💅'],
  ];
  offers.forEach(([title, desc, kind, value, code, startOffset, endOffset, emoji], i) => {
    run(`INSERT INTO offers (id,title,description,kind,value,code,starts_on,ends_on,banner,emoji,active,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?)`,
      `off_${i + 1}`, title, desc, kind, value, code,
      addDays(today, startOffset), addDays(today, endOffset), i === 0 ? 'Colour, but make it midweek' : '', emoji, now);
  });
  for (const svc of ['svc_fullcolour', 'svc_balayage', 'svc_highlights', 'svc_roots', 'svc_toner']) {
    run('INSERT OR IGNORE INTO offer_services (offer_id, service_id) VALUES (?,?)', 'off_1', svc);
  }
  run('INSERT OR IGNORE INTO offer_services (offer_id, service_id) VALUES (?,?)', 'off_2', 'svc_cut');
  run('INSERT OR IGNORE INTO offer_services (offer_id, service_id) VALUES (?,?)', 'off_3', 'svc_gel');
  run('INSERT OR IGNORE INTO offer_services (offer_id, service_id) VALUES (?,?)', 'off_3', 'svc_pedi');

  // templates
  for (const [key, name, body] of TEMPLATES) {
    run('INSERT OR REPLACE INTO message_templates (key,name,body,enabled) VALUES (?,?,?,1)', key, name, body);
  }

  // Google reviews (curated — the Places API is optional)
  const reviews = [
    ['Priya M.', 5, 'Anya actually listens. First cut in years where I did not have to fix it at home.', -12],
    ['James T.', 5, 'Booked online at 11pm, confirmed on WhatsApp by morning. The fade is sharp and the chat is good.', -20],
    ['Sofia R.', 5, 'Priya rescued a box-dye disaster without shaving it all off. Genuinely talented colourist.', -31],
    ['Hannah W.', 4, 'Lovely salon, great blow-dry. Only note is parking nearby is a nightmare.', -44],
    ['Amara O.', 5, 'The gel manicure lasted four weeks. Jade is meticulous and the nail art is unreal.', -58],
    ['Tom B.', 5, 'Took my daughter for her first proper haircut. They were so patient with her.', -70],
  ];
  reviews.forEach(([author, rating, body, dayOffset], i) => {
    run(`INSERT INTO reviews (id,author,rating,body,source,reviewed_at,featured,sort_order,created_at)
         VALUES (?,?,?,?,?,?,1,?,?)`,
      `rev_${i + 1}`, author, rating, body, 'google', addDays(today, dayOffset), i, now);
  });

  // appointments: past 21 days → next 13 days
  const staffRows = q('SELECT * FROM staff');
  const serviceRows = q('SELECT * FROM services');
  const skillMap = {};
  for (const row of q('SELECT staff_id, service_id FROM staff_skills')) {
    (skillMap[row.staff_id] ||= new Set()).add(row.service_id);
  }
  const customers = q('SELECT * FROM customers');
  const shiftRows = q('SELECT * FROM shifts');
  const shiftsByKey = {};
  for (const sh of shiftRows) (shiftsByKey[`${sh.staff_id}|${sh.work_date}`] ||= []).push(sh);

  const taken = []; // { staffId, start, end }
  const busy = (staffId, start, end) => taken.some((t) => t.staffId === staffId
    && new Date(start) < new Date(t.end) && new Date(t.start) < new Date(end));

  const statusesPast = ['completed', 'completed', 'completed', 'completed', 'completed', 'completed', 'no_show', 'cancelled'];

  for (let d = -21; d <= 13; d++) {
    const date = addDays(today, d);
    for (const staff of staffRows) {
      const shifts = shiftsByKey[`${staff.id}|${date}`];
      if (!shifts) continue;
      const sh = shifts[0];
      const dayStart = zonedToUtc(date, sh.start_time, tz).getTime();
      const dayEnd = zonedToUtc(date, sh.end_time, tz).getTime();
      const count = d < 0 ? 2 + Math.floor(rnd() * 4) : 1 + Math.floor(rnd() * 4);
      for (let n = 0; n < count; n++) {
        const servicesForStaff = serviceRows.filter((sv) => skillMap[staff.id]?.has(sv.id));
        if (!servicesForStaff.length) break;
        const svc = pickOne(servicesForStaff);
        const block = (svc.duration_min + svc.buffer_min) * 60000;
        const span = dayEnd - dayStart - block;
        if (span <= 0) continue;
        const startMs = dayStart + Math.floor((rnd() * span) / 900000) * 900000;
        const endMs = startMs + block;
        if (endMs > dayEnd) continue;
        if (busy(staff.id, new Date(startMs).toISOString(), new Date(endMs).toISOString())) continue;

        const customer = pickOne(customers);
        const past = startMs < Date.now();
        const status = past ? pickOne(statusesPast) : (rnd() > 0.15 ? 'confirmed' : 'pending');
        const apptId = id('apt');
        const startIso = new Date(startMs).toISOString();
        const endIso = new Date(endMs).toISOString();
        const deposit = svc.price_pence > 8000 ? 2000 : 0;

        run(`INSERT INTO appointments (id,reference,customer_id,staff_id,start_at,end_at,status,source,total_pence,
             deposit_pence,deposit_method,paid_pence,notes,internal_notes,cancelled_at,cancel_reason,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          apptId, reference(), customer.id, staff.id, startIso, endIso, status,
          pickOne(['online', 'phone', 'walkin', 'instagram', 'online']), svc.price_pence,
          deposit, deposit ? 'card' : '', status === 'completed' ? svc.price_pence : 0,
          '', '', status === 'cancelled' ? startIso : null,
          status === 'cancelled' ? 'Client rescheduled' : '', now, now);

        run(`INSERT INTO appointment_items (id,appointment_id,service_id,name_snapshot,duration_min,price_pence,sort_order)
             VALUES (?,?,?,?,?,?,0)`,
          id('itm'), apptId, svc.id, svc.name, svc.duration_min, svc.price_pence);

        taken.push({ staffId: staff.id, start: startIso, end: endIso });
      }
    }
  }

  // roll up customer stats
  for (const c of customers) {
    const stats = q1(`SELECT COUNT(*) AS visits, COALESCE(SUM(total_pence),0) AS spend, MAX(start_at) AS last
                      FROM appointments WHERE customer_id = ? AND status = 'completed'`, c.id);
    run('UPDATE customers SET visit_count = ?, total_spend_pence = ?, last_visit_at = ?, loyalty_points = ? WHERE id = ?',
      stats.visits, stats.spend, stats.last, Math.floor(stats.spend / 100), c.id);
  }

  // a few message rows so the outbox is not empty
  const sample = q(`SELECT a.*, c.first_name, c.phone, s.name AS service_name, st.name AS staff_name
                    FROM appointments a JOIN customers c ON c.id = a.customer_id
                    JOIN appointment_items ai ON ai.appointment_id = a.id
                    JOIN services s ON s.id = ai.service_id
                    JOIN staff st ON st.id = a.staff_id
                    WHERE a.start_at > ? ORDER BY a.start_at LIMIT 4`, now);
  for (const a of sample) {
    run(`INSERT INTO notifications (id,customer_id,appointment_id,channel,template_key,to_phone,body,status,
         scheduled_for,sent_at,attempts,last_error,wa_link,created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id('ntf'), a.customer_id, a.id, 'whatsapp', 'booking_confirmed', a.phone,
      `Hi ${a.first_name}, your ${a.service_name} at Lumière Hair & Beauty is confirmed for ${zonedDate(a.start_at, tz)} at ${utcToZoned(a.start_at, tz).time} with ${a.staff_name}. Ref ${a.reference}.`,
      'sent', a.created_at, a.created_at, 1, '', '', a.created_at);
  }
}

export function seedIfEmpty() {
  const row = q1('SELECT COUNT(*) AS n FROM users');
  if (row.n > 0) return false;
  tx(seedDatabase);
  return true;
}
