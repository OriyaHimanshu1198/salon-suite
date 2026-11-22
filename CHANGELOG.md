# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-11-22

### Added
- Initial release of Salon Suite
- Public booking website with 6-step wizard
- Admin management console (dashboard, calendar, clients, packages, sales, rota, messages, reports, settings)
- In-store package sales (plan-based and single-service)
- QR code verification and staff redemption
- Treatwell Connect CSV import (customers + bookings)
- WhatsApp notifications (click-to-send + Cloud API modes)
- Birthday automation
- Staff rota with conflict detection
- Time-off management
- Sales reports with CSV export
- Audit logging on all mutations
- Role-based access control (owner, manager, reception, staff)
- Scrypt password hashing + HMAC cookie sessions
- Multi-language ready (English default)

### Changed
- N/A (initial release)

### Deprecated
- N/A

### Removed
- N/A

### Fixed
- N/A

### Security
- CSP headers, rate limiting, CSRF protection
- Prepared statements only (no SQL injection)
- XSS prevention via textContent/escapeHtml

---

## [Unreleased]

### Planned
- Email/SMS marketing campaigns
- Website CMS (content blocks, announcements, media library)
- Advanced analytics (treatment profitability, cohort retention)
- Staff targets & performance tracking
- AI Data Analyst (natural language business queries)
- Stripe integration for online payments