import crypto from 'node:crypto';
import { q1, run, getSetting, setSetting } from './db.js';
import { HttpError, nowIso } from './util.js';

const COOKIE = 'ss_session';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function secret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  let stored = getSetting('session.secret');
  if (!stored) {
    stored = crypto.randomBytes(32).toString('hex');
    setSetting('session.secret', stored);
  }
  return stored;
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function signSession(user) {
  const payload = b64u(JSON.stringify({ uid: user.id, exp: Date.now() + MAX_AGE_MS }));
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readSession(token) {
  try {
    const [payload, sig] = String(token || '').split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function setSessionCookie(res, user) {
  const token = signSession(user);
  res.setHeader('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(MAX_AGE_MS / 1000)}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  const session = readSession(token);
  if (!session) return null;
  const user = q1('SELECT id, email, name, role, staff_id AS staffId, active FROM users WHERE id = ?', session.uid);
  if (!user || !user.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, staffId: user.staffId };
}

export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return next(new HttpError(401, 'unauthorised', 'Please sign in.'));
  req.user = user;
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(new HttpError(401, 'unauthorised', 'Please sign in.'));
    if (!roles.includes(req.user.role)) {
      return next(new HttpError(403, 'forbidden', 'Your role cannot do that.'));
    }
    next();
  };
}

export function touchLogin(userId) {
  run('UPDATE users SET last_login_at = ? WHERE id = ?', nowIso(), userId);
}

/* ── rate limiting ──────────────────────────────────────────────────────── */

const buckets = new Map();

export function rateLimit({ windowMs = 60_000, max = 60, key = 'default' } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const id = `${key}:${ip}`;
    const now = Date.now();
    let bucket = buckets.get(id);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(id, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      const retry = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retry));
      return next(new HttpError(429, 'rate_limited', `Too many attempts. Try again in ${retry}s.`));
    }
    next();
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
}, 60_000).unref?.();

/* ── CSRF: same-origin check for mutating admin calls ───────────────────── */

export function sameOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  if (!origin) return next();
  try {
    const host = new URL(origin).host;
    if (host !== req.headers.host) {
      return next(new HttpError(403, 'bad_origin', 'Cross-origin request blocked.'));
    }
  } catch {
    return next(new HttpError(403, 'bad_origin', 'Malformed origin.'));
  }
  next();
}

export const ROLES = ['owner', 'manager', 'reception', 'staff'];
