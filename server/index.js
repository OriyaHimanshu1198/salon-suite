import './env.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedIfEmpty, getSetting, DB_PATH } from './db.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { adminRouter } from './routes/admin.js';
import { sameOrigin, rateLimit } from './auth.js';
import { dispatchDue, handleInbound, whatsappMode } from './whatsapp.js';
import { runBirthdayJob } from './packages.js';
import { todayIn } from './util.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PORT = Number(process.env.PORT || 4321);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'");
  next();
});

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api')) {
      const ms = Date.now() - started;
      if (res.statusCode >= 400) console.log(`${res.statusCode} ${req.method} ${req.path} ${ms}ms`);
    }
  });
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/public', publicRouter);
app.use('/api/admin', sameOrigin, adminRouter);

/* WhatsApp Cloud API webhook (verification + inbound STOP) */
app.get('/api/webhooks/whatsapp', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  if (mode === 'subscribe' && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.type('text/plain').send(String(req.query['hub.challenge'] || 'ok'));
  }
  res.status(403).type('text/plain').send('forbidden');
});

app.post('/api/webhooks/whatsapp', rateLimit({ windowMs: 60_000, max: 120, key: 'wa-hook' }), (req, res) => {
  const messages = req.body?.entry?.[0]?.changes?.[0]?.value?.messages || [];
  for (const msg of messages) {
    handleInbound({ from: msg.from, text: msg.text?.body });
  }
  res.json({ ok: true });
});

/* static frontends — revalidate so edits and deploys are picked up immediately */
app.use(express.static(path.join(root, 'public'), {
  extensions: ['html'],
  etag: true,
  lastModified: true,
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));
app.get('/admin', (req, res) => res.sendFile(path.join(root, 'public', 'admin.html')));
app.get('/health', (req, res) => res.json({ ok: true, db: DB_PATH, whatsapp: whatsappMode() }));

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'Unknown endpoint' }));

app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({
    error: err.code || 'server_error',
    message: status >= 500 ? 'Something went wrong. Please try again.' : err.message,
    ...(err.fields ? { fields: err.fields } : {}),
    ...(err.alternatives ? { alternatives: err.alternatives } : {}),
  });
});

const seeded = seedIfEmpty();

const server = app.listen(PORT, () => {
  const tz = getSetting('salon.timezone');
  console.log('');
  console.log(`  ${getSetting('salon.name')} — Salon Suite`);
  console.log(`  Website   http://localhost:${PORT}`);
  console.log(`  Admin     http://localhost:${PORT}/admin`);
  console.log(`  Today     ${todayIn(tz)} (${tz})`);
  console.log(`  WhatsApp  ${whatsappMode() === 'api' ? 'Cloud API' : 'click-to-send links'}`);
  console.log(`  Database  ${DB_PATH}${seeded ? '  (seeded)' : ''}`);
  console.log('');
  if (seeded) console.log('  Login: owner@lumiere.test / salon123\n');
});

setInterval(() => {
  try { runBirthdayJob(); } catch (err) { console.error('birthday job failed', err.message); }
  dispatchDue().catch((err) => console.error('dispatch failed', err.message));
}, 60_000).unref?.();

try { runBirthdayJob(); } catch (err) { console.error('birthday job failed', err.message); }

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log('\nShutting down…');
    server.close(() => process.exit(0));
  });
}
