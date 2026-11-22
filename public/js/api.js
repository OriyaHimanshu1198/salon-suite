/* Shared helpers for both frontends. No framework, no build step. */

export class ApiError extends Error {
  constructor(payload, status) {
    super(payload?.message || 'Request failed');
    this.status = status;
    this.code = payload?.error;
    this.fields = payload?.fields || {};
    this.alternatives = payload?.alternatives || [];
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
  if (!res.ok) throw new ApiError(data, res.status);
  return data;
}

/* ── formatting ─────────────────────────────────────────────────────────── */

export const money = (pence) => `£${(Number(pence || 0) / 100).toFixed(2)}`;
export const moneyShort = (pence) => {
  const n = Number(pence || 0) / 100;
  return Number.isInteger(n) ? `£${n}` : `£${n.toFixed(2)}`;
};

export function hhmm(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function longDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function shortDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function relTime(iso) {
  if (!iso) return '';
  const diff = (new Date(iso).getTime() - Date.now()) / 60000;
  if (Math.abs(diff) < 60) return diff >= 0 ? `in ${Math.round(diff)} min` : `${Math.round(-diff)} min ago`;
  if (Math.abs(diff) < 1440) return diff >= 0 ? `in ${Math.round(diff / 60)} h` : `${Math.round(-diff / 60)} h ago`;
  return diff >= 0 ? `in ${Math.round(diff / 1440)} d` : `${Math.round(-diff / 1440)} d ago`;
}

export const titleCase = (s) => String(s || '').replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const initials = (name) => String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* Tagged template. Interpolations are escaped unless they are markup
   fragments — from html`` / raw(), or a string containing a tag, which is how
   joined fragments arrive. Scalar data such as names and prices stays escaped. */
class SafeHtml {
  constructor(value) { this.value = value; this.__raw = true; }
  toString() { return this.value; }
}

export function html(strings, ...values) {
  const out = strings.reduce((acc, str, i) => acc + renderPart(values[i - 1]) + str, '');
  return new SafeHtml(out);
}

export const raw = (value) => new SafeHtml(String(value ?? ''));

function renderPart(value) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map(renderPart).join('');
  if (typeof value === 'object' && value.__raw) return value.value;
  const s = String(value);
  return s.includes('<') ? s : escapeHtml(s);
}

/* ── dom ────────────────────────────────────────────────────────────────── */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function on(root, event, selector, handler) {
  root.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}

export function toast(message, kind = 'ok') {
  let host = $('#toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toasts';
    document.body.appendChild(host);
  }
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.textContent = message;
  host.appendChild(item);
  setTimeout(() => item.classList.add('toast-out'), 3200);
  setTimeout(() => item.remove(), 3800);
}

export function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

export function weekStartStr(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
