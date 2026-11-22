# 10 Security and Permissions
Privacy, roles and security.

## Current Implementation
**Authentication:**
- Scrypt (N=16384) with per-user salt, constant-time compare.
- HMAC-SHA256 signed session cookie (`ss_session`, HttpOnly, SameSite=Lax, 7-day sliding expiry).
- Rate limiting: login 8/15min/IP, booking 20/hr/IP, reads 240/min/IP.

**Authorisation (RBAC):**
| Role | Permissions |
|------|-------------|
| `owner` | All routes, settings (including session.secret), user management, GDPR erase |
| `manager` | All except billing settings, user management |
| `reception` | Calendar, clients, messages, bookings (create/update/status), packages, offers, website content |
| `staff` | Own column (calendar), own clients, mark complete/no-show, add notes, own time-off requests |

**Middleware:**
- `requireAuth` — validates session, attaches `req.user`.
- `requireRole(...)` — checks role against allowed list.
- `sameOrigin` — Origin header check on mutating admin routes (CSRF).

**Data Protection:**
- Prepared statements only (SQL injection prevention).
- `textContent` / `escapeHtml` only (XSS prevention).
- Passwords never logged.
- Audit log on every mutation (`audit_log` table).

## Gaps vs Target Platform
| Target Requirement | Current State | Gap |
|--------------------|---------------|-----|
| Role-based Access Control | ✅ (4 roles) | OK |
| Protect Customer PII | ✅ (server-side only) | OK |
| Restrict Financial Data | ⚠️ (role-based) | Need explicit permission matrix |
| Restrict Staff Performance | ⚠️ (role-based) | Need explicit permission matrix |
| Audit Logs | ✅ (all mutations) | OK |
| No Credentials in Frontend | ✅ | OK |
| PII Encryption at Rest | ❌ | SQLite file unencrypted |
| Data Retention Policies | ❌ | Not defined |
| Session Management | ✅ | OK |
| Brute Force Protection | ✅ | OK |

## Permission Matrix (Proposed)
| Resource | Owner | Manager | Reception | Staff |
|----------|-------|---------|-----------|-------|
| **Settings** | | | | |
| Salon info | RW | RW | R | - |
| Booking rules | RW | RW | R | - |
| WhatsApp config | RW | RW | - | - |
| Email/SMS config | RW | - | - | - |
| Session secret | RW | - | - | - |
| **Users & Staff** | | | | |
| Create users | RW | - | - | - |
| Edit roles | RW | - | - | - |
| Deactivate staff | RW | RW | - | - |
| View all staff | RW | RW | R | R (own) |
| **Clients** | | | | |
| View all | RW | RW | RW | R (own) |
| Create | RW | RW | RW | - |
| Edit | RW | RW | RW | - |
| Merge/Delete (GDPR) | RW | - | - | - |
| Export CSV | RW | RW | - | - |
| **Appointments** | | | | |
| View all | RW | RW | RW | R (own) |
| Create (any staff) | RW | RW | RW | - |
| Create (self) | RW | RW | RW | RW |
| Reschedule (any) | RW | RW | RW | - |
| Reschedule (self) | RW | RW | RW | RW |
| Cancel | RW | RW | RW | R (own) |
| Mark complete/no-show | RW | RW | RW | RW (own) |
| **Finance** | | | | |
| View revenue reports | RW | RW | R | - |
| View commission reports | RW | RW | - | - |
| Record payments | RW | RW | RW | - |
| Package pricing | RW | RW | - | - |
| **Marketing** | | | | |
| Campaign manager | RW | RW | R | - |
| Broadcast (WhatsApp) | RW | RW | RW | - |
| Consent management | RW | RW | R | - |
| **Website** | | | | |
| Content blocks | RW | RW | R | - |
| Offers | RW | RW | R | - |
| Announcements | RW | RW | R | - |
| Media upload | RW | RW | R | - |
| **Analytics** | | | | |
| Treatment analytics | RW | RW | R | - |
| Customer analytics | RW | RW | - | - |
| Staff analytics | RW | RW | - | R (own) |
| Marketing analytics | RW | RW | - | - |
| AI Analyst | RW | - | - | - |
| **System** | | | | |
| Audit log | RW | RW | R | - |
| Backup/Restore | RW | - | - | - |
| Treatwell integration | RW | RW | - | - |

## Security Enhancements Needed

### 1. PII Field Encryption (Optional)
- Encrypt `customers.phone`, `email`, `address`, `allergies`, `formula_notes`, `notes` at rest.
- Use `node:crypto` AES-256-GCM with key from `ENCRYPTION_KEY` env var.
- Decrypt on read in `db.js` helpers (transparent to application).

### 2. Data Retention Policy
```sql
CREATE TABLE retention_policies (
  id TEXT PRIMARY KEY,
  entity TEXT NOT NULL,           -- 'customers', 'appointments', 'notifications', 'audit_log'
  retention_days INTEGER NOT NULL,-- 0 = forever
  action TEXT NOT NULL DEFAULT 'anonymise', -- anonymise | delete
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
```
- Default: `audit_log` = forever, `notifications` = 2 years, `customers` = anonymise on GDPR request only.

### 3. Enhanced Audit Log
- Add `old_value`, `new_value` JSON for PATCH/UPDATE.
- Add `request_id` for correlation.

### 4. Security Headers (Already in `index.js`)
- CSP, HSTS, X-Frame-Options, Referrer-Policy, X-Content-Type-Options.

### 5. Dependency Scanning
- Add `npm audit` to CI.
- Pin exact versions in `package.json`.

### 6. Environment Validation
- Startup check: `SESSION_SECRET`, `WHATSAPP_TOKEN` (if API mode), email/SMS keys.
- Fail fast with clear message if missing.

## API Security
- All admin routes: `requireAuth` + `requireRole` + `sameOrigin`.
- Public routes: rate limited, validated, no auth.
- File uploads (future): type validation, size limit, virus scan (optional).

## Compliance Checklist (UK GDPR + PECR)
- [x] Lawful basis recorded (consent / legitimate interest / contract).
- [x] Right to erasure (DELETE endpoint, owner only).
- [x] Right to access (CSV export).
- [x] Data minimisation (only necessary fields collected).
- [x] Storage limitation (retention policies TBD).
- [x] Integrity & confidentiality (HTTPS in prod, encrypted cookies).
- [x] Accountability (audit log, DPIA for new features).
- [ ] DPIA documented for high-risk processing (marketing, analytics).
- [ ] Data Processing Agreements with providers (WhatsApp, Email, SMS).
- [ ] Privacy Policy version tracked per consent.

## Settings Additions
```js
'security.encryption_key': '',              // in .env
'security.retention_audit_log_days': '0',   // 0 = forever
'security.retention_notifications_days': '730',
'security.retention_appointments_days': '2555', -- 7 years (HMRC)
'security.session_idle_timeout_min': '60',  // auto-logout in admin
'security.max_failed_logins': '8',
'security.lockout_duration_min': '15',
```