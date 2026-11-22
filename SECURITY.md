# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 1.0.x   | ✅        |

## Reporting a Vulnerability

Please report security vulnerabilities privately via email to the repository maintainer.
Do not open public issues for security vulnerabilities.

## Security Features

### Authentication
- Passwords hashed with scrypt (N=16384, r=8, p=1)
- HMAC-SHA256 signed session cookies
- 7-day sliding session expiry
- Rate limiting: 8 login attempts / 15 min / IP

### Authorization
- Role-based access control (owner, manager, reception, staff)
- Server-side permission checks on all privileged routes
- Staff restricted to own appointments/clients

### Data Protection
- Prepared statements only (no SQL injection)
- Integer pence for money (no float drift)
- Timestamps stored as UTC ISO-8601
- Soft deletes (status changes, no hard deletes)
- Audit log on every mutation

### Transport
- CSP headers (strict)
- HSTS, X-Frame-Options, Referrer-Policy
- SameSite=Lax cookies
- CSRF protection via Origin header check

### WhatsApp
- Click-to-send mode requires manual send (no auto)
- Cloud API mode requires template approval
- Inbound STOP honoured (flips opt-in flags)

## Environment Variables

Never commit `.env`. Required variables:
- `SESSION_SECRET` — 32+ char random string
- `WHATSAPP_TOKEN` — Meta Cloud API token (optional)
- `WHATSAPP_PHONE_ID` — Meta phone ID (optional)
- `WHATSAPP_VERIFY_TOKEN` — webhook verify token (optional)

## Compliance

- UK GDPR: Right to erasure endpoint (`DELETE /api/admin/customers/:id`)
- PECR: Marketing opt-in required, unsubscribe via STOP
- HMRC: Appointment data retained 7 years (soft delete)