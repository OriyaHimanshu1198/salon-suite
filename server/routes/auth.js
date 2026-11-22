import { Router } from 'express';
import { q1, audit, getSetting, verifyPassword } from '../db.js';
import {
  setSessionCookie, clearSessionCookie, currentUser,
  requireAuth, touchLogin, rateLimit,
} from '../auth.js';
import { HttpError, nowIso } from '../util.js';

export const authRouter = Router();

authRouter.post('/login', rateLimit({ windowMs: 15 * 60_000, max: 8, key: 'login' }), (req, res, next) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return next(new HttpError(422, 'validation_failed', 'Email and password are required', {
      fields: { ...(email ? {} : { email: 'required' }), ...(password ? {} : { password: 'required' }) },
    }));
  }
  const user = q1('SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1', String(email).trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return next(new HttpError(401, 'invalid_credentials', 'Email or password is incorrect.'));
  }
  touchLogin(user.id);
  setSessionCookie(res, user);
  audit({ actor: user, action: 'auth.login', entity: 'user', entityId: user.id, ip: req.ip });
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, staffId: user.staff_id },
    salon: { name: getSetting('salon.name'), timezone: getSetting('salon.timezone') },
  });
});

authRouter.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({
    user: req.user,
    salon: { name: getSetting('salon.name'), timezone: getSetting('salon.timezone'), currency: getSetting('salon.currency') },
  });
});
