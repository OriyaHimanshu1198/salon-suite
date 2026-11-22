# SALON PLATFORM: MASTER PROJECT CHECKLIST

**Document:** `13_MASTER_PROJECT_CHECKLIST.md`  
**Purpose:** Track development, security, SEO, quality assurance and future improvements.  
**Status:** Living project document. Update it throughout development.

---

# 1. Instructions for AI Coding Assistants

Before working on any task, follow these rules:

- [ ] Read `MASTER_PROMPT.md`.
- [ ] Read the relevant project documentation.
- [ ] Inspect the existing code before making changes.
- [ ] Understand the existing frontend, backend, database and integrations.
- [ ] Preserve the existing website design, colours, layout and working functionality.
- [ ] Reuse existing components and services wherever appropriate.
- [ ] Do not rebuild the application unnecessarily.
- [ ] Do not invent API endpoints, integrations, database fields or functionality.
- [ ] Do not introduce unnecessary dependencies.
- [ ] Do not expose secrets, credentials or personal information.
- [ ] Do not make unrelated changes.
- [ ] Do not mark a feature complete until it has been tested.
- [ ] Update relevant documentation after implementation.
- [ ] Record any known limitations, risks and outstanding issues.

**Required AI response after every development task:**

1. What was inspected?
2. What was changed?
3. Which files were changed?
4. What database changes were made?
5. What tests were performed?
6. Did the tests pass?
7. What remains incomplete?
8. Are there any security or performance concerns?

If an important requirement is unclear, ask before implementing it.

---

# 2. Existing Website and System Audit

- [ ] Identify existing frontend technology.
- [ ] Identify backend technology.
- [ ] Identify database technology.
- [ ] Identify hosting and deployment environment.
- [ ] Document existing website routes and pages.
- [ ] Document existing admin dashboard.
- [ ] Document existing customer functionality.
- [ ] Document existing booking functionality.
- [ ] Identify existing Treatwell integration.
- [ ] Identify existing authentication system.
- [ ] Inspect existing database relationships.
- [ ] Identify existing third-party services.
- [ ] Document existing UI colours, typography and design components.
- [ ] Identify existing technical debt.
- [ ] Identify existing security weaknesses.
- [ ] Create a backup before approved structural changes.
- [ ] Produce an audit report before development.

**Acceptance criteria:** The AI understands the existing application and documents what must be preserved before changing code.

---

# 3. Existing Website Preservation

- [ ] Preserve existing website design and branding.
- [ ] Preserve existing navigation.
- [ ] Preserve existing working pages.
- [ ] Preserve existing booking links and Treatwell functionality.
- [ ] Preserve existing responsive layouts.
- [ ] Preserve existing forms and validation.
- [ ] Preserve existing admin functionality.
- [ ] Avoid unnecessary redesigns.
- [ ] Check mobile, tablet and desktop layouts.
- [ ] Test existing features after every major change.

**Acceptance criteria:** New features work without breaking existing website functionality.

---

# 4. Customer PWA

- [ ] Website can be installed on compatible mobile devices.
- [ ] Add-to-Home-Screen experience.
- [ ] PWA manifest configured correctly.
- [ ] App icons and splash-screen assets.
- [ ] Responsive mobile interface.
- [ ] Appropriate standalone display mode.
- [ ] Secure HTTPS deployment.
- [ ] Customer login and logout.
- [ ] Mobile OTP authentication.
- [ ] Customer profile.
- [ ] Customer booking history.
- [ ] Customer treatment history.
- [ ] Customer package dashboard.
- [ ] Customer QR code.
- [ ] Customer offers and announcements.
- [ ] Appropriate loading and error states.
- [ ] Session expiry and secure logout.

**Acceptance criteria:** Customers can access the salon platform from their mobile home screen and securely view their own information.

---

# 5. Customer Authentication and Account Management

- [ ] Registration using verified mobile number.
- [ ] One-time password verification.
- [ ] Secure OTP expiry.
- [ ] OTP rate limiting.
- [ ] Protection against repeated verification attempts.
- [ ] Secure session management.
- [ ] Customer account recovery.
- [ ] Existing customer matching.
- [ ] Duplicate customer detection.
- [ ] Account update functionality.
- [ ] Customer account deactivation process.
- [ ] Protection against unauthorised account access.
- [ ] Customers cannot access another customer's records.

**Acceptance criteria:** Customer identities are verified, duplicate records are controlled and private account data is protected.

---

# 6. Treatwell and Booking Management

### Guest booking

- [ ] Existing Treatwell booking functionality remains available.
- [ ] Customers can book as guests through Treatwell.
- [ ] Existing booking links or widgets continue to work.
- [ ] Booking source is recorded where available.

### Returning customer booking

- [ ] Registered customers can submit booking requests through the PWA.
- [ ] Customer selects treatment.
- [ ] Customer selects preferred date and time.
- [ ] Customer can select a preferred staff member where supported.
- [ ] Booking request is recorded.
- [ ] Admin receives notification.
- [ ] Admin checks Treatwell availability.
- [ ] Admin confirms or declines the request.
- [ ] Customer receives the booking result.
- [ ] Confirmed booking is recorded in the internal system.
- [ ] Admin enters the confirmed appointment into Treatwell when required.
- [ ] Booking status is tracked.
- [ ] Cancellation and rescheduling are handled.
- [ ] Package balances are not deducted when a booking is requested.

### Booking safeguards

- [ ] Prevent duplicate booking requests.
- [ ] Prevent accidental double booking through the admin confirmation process.
- [ ] Clearly distinguish pending requests from confirmed appointments.
- [ ] Do not assume live Treatwell calendar synchronisation.
- [ ] Verify any authorised Treatwell API or export capabilities before integration.

**Acceptance criteria:** Every PWA booking requires administrator confirmation, and Treatwell remains the existing booking diary until a supported alternative is approved.

---

# 7. Treatment Package Management

### Package purchase

- [ ] Packages can only be purchased in person at the salon.
- [ ] Online package checkout is not available.
- [ ] Staff can find an existing customer.
- [ ] Staff can create a customer profile if necessary.
- [ ] Staff can select a treatment package.
- [ ] Staff records package price and quantity.
- [ ] Staff records payment method.
- [ ] Staff records payment date.
- [ ] Staff records the selling employee.
- [ ] Package is activated after payment is received and recorded.
- [ ] Package appears in the correct customer's account.

### Package rules

- [ ] Buy five paid treatments and receive one free.
- [ ] Free treatment unlocks only after five completed paid treatments.
- [ ] Booking does not count as completed treatment.
- [ ] Payment alone does not count as completed treatment.
- [ ] Free treatment is restricted to the purchased treatment.
- [ ] Different treatment packages cannot be exchanged.
- [ ] Packages have no expiry date.
- [ ] Multiple packages can belong to one customer.
- [ ] Each package has an independent balance.
- [ ] Paid and complimentary treatments are tracked separately.

### Package history

- [ ] Purchase history.
- [ ] Activation history.
- [ ] Redemption history.
- [ ] Remaining paid treatments.
- [ ] Complimentary treatment eligibility.
- [ ] Last treatment date.
- [ ] Staff member who recorded each transaction.
- [ ] Authorised correction and reversal records.
- [ ] Full transaction audit history.

**Acceptance criteria:** Package rules are enforced by the backend, not just by the customer interface.

---

# 8. QR Code and Treatment Verification

- [ ] Each customer has a secure QR identifier.
- [ ] QR code is linked to the correct customer.
- [ ] QR code does not expose personal information.
- [ ] Staff can scan using a supported device camera.
- [ ] Staff can identify the customer.
- [ ] Staff can view active packages.
- [ ] Staff can select the correct package.
- [ ] Treatment eligibility is verified.
- [ ] Staff must confirm treatment completion.
- [ ] Package balance updates after confirmation.
- [ ] Duplicate redemption is prevented.
- [ ] Incorrect redemption can be corrected by authorised staff.
- [ ] All corrections are audited.
- [ ] Unauthorised users cannot redeem packages.

**Acceptance criteria:** Scanning a QR code identifies the customer but does not automatically deduct a treatment.

---

# 9. CRM and Customer Management

- [ ] Central customer profiles.
- [ ] Customer contact information.
- [ ] Booking history.
- [ ] Treatment history.
- [ ] Package ownership.
- [ ] Package balances.
- [ ] Customer spending history.
- [ ] Last visit date.
- [ ] Customer notes.
- [ ] New customer segmentation.
- [ ] Returning customer segmentation.
- [ ] VIP customer segmentation.
- [ ] Inactive customer segmentation.
- [ ] Customer search.
- [ ] Customer deduplication.
- [ ] Customer data import and export.
- [ ] Import error reporting.
- [ ] Customer data correction process.

**Acceptance criteria:** One reliable customer profile connects bookings, packages, treatment history and marketing preferences.

---

# 10. Website Content Management

- [ ] Manage homepage banners.
- [ ] Manage promotional offers.
- [ ] Manage treatment descriptions.
- [ ] Manage treatment images.
- [ ] Manage staff profiles.
- [ ] Manage opening hours.
- [ ] Manage announcements.
- [ ] Manage temporary closures.
- [ ] Manage new treatments.
- [ ] Manage loyalty information.
- [ ] Draft and preview content.
- [ ] Approve and publish content.
- [ ] Schedule publication.
- [ ] Unpublish content.
- [ ] Automatically expire scheduled offers.
- [ ] Preserve existing website appearance.

**Acceptance criteria:** Authorised administrators can update public website content without changing source code.

---

# 11. Marketing and Customer Communication

- [ ] Email marketing.
- [ ] SMS marketing.
- [ ] Booking notifications.
- [ ] Appointment reminders.
- [ ] Package purchase confirmations.
- [ ] Treatment completion notifications.
- [ ] Birthday offers.
- [ ] Promotional campaign management.
- [ ] Customer audience segmentation.
- [ ] Campaign performance tracking.
- [ ] Unsubscribe functionality.
- [ ] Marketing suppression list.
- [ ] Separate email and SMS preferences.
- [ ] Record consent source and timestamp.
- [ ] Record the wording and version of consent.
- [ ] Record withdrawals and opt-outs.
- [ ] Do not automatically market to all Treatwell customers.

**Acceptance criteria:** Promotional messages are sent only to customers with an appropriate legal basis and recorded channel permissions.

---

# 12. Security and Safety Checklist

Security must be treated as a continuous requirement, not a final development phase.

### Application security

- [ ] HTTPS enforced.
- [ ] Secure authentication.
- [ ] Role-based access control.
- [ ] Server-side permission checks.
- [ ] Input validation.
- [ ] Output encoding.
- [ ] Protection against SQL injection.
- [ ] Protection against cross-site scripting (XSS).
- [ ] Protection against cross-site request forgery (CSRF), where applicable.
- [ ] Secure file upload validation.
- [ ] Rate limiting.
- [ ] Secure session and cookie configuration.
- [ ] Appropriate security headers.
- [ ] Safe error messages.
- [ ] No sensitive information in logs.
- [ ] No API keys or passwords committed to source control.

### Database and data protection

- [ ] Database access restricted.
- [ ] Sensitive information encrypted where appropriate.
- [ ] Backups configured.
- [ ] Backup restoration tested.
- [ ] Database migrations reviewed.
- [ ] Customer data access restricted by role.
- [ ] Data retention rules documented.
- [ ] Customer data export process.
- [ ] Customer data correction process.
- [ ] Customer deletion and retention procedures.
- [ ] Audit logs protected against unauthorised changes.
- [ ] Production and test customer data kept separate.

### UK privacy and compliance

- [ ] UK GDPR requirements reviewed.
- [ ] Privacy notice available.
- [ ] Cookie notice and consent controls reviewed where required.
- [ ] PECR marketing requirements reviewed.
- [ ] Email consent or applicable soft opt-in recorded.
- [ ] SMS consent or applicable soft opt-in recorded.
- [ ] Transactional messages separated from promotional marketing.
- [ ] Data controller and processor responsibilities documented.
- [ ] Third-party integrations reviewed.
- [ ] Data breach response procedure documented.
- [ ] Staff access and permissions reviewed.

### Staff and admin safety

- [ ] Separate staff and customer permissions.
- [ ] Administrator-only package corrections.
- [ ] Administrator-only staff management.
- [ ] Staff actions recorded.
- [ ] Sensitive actions require appropriate authorisation.
- [ ] Account access can be revoked.
- [ ] Admin login protected against brute-force attempts.
- [ ] No shared administrator accounts.

**Acceptance criteria:** Security controls are tested and documented. Passing a checklist alone is not evidence of security.

---

# 13. Google SEO and Search Visibility

SEO should be built into the website architecture, content and publishing system.

### Technical SEO

- [ ] Search engines can access public website pages.
- [ ] Important pages return correct HTTP status codes.
- [ ] Correct page titles.
- [ ] Unique meta descriptions.
- [ ] Canonical URLs.
- [ ] XML sitemap.
- [ ] Robots.txt.
- [ ] Correct indexing directives.
- [ ] No accidental indexing of private customer pages.
- [ ] No accidental indexing of admin pages.
- [ ] Clean and meaningful URL structure.
- [ ] HTTPS.
- [ ] Mobile-friendly layouts.
- [ ] Correct image alt text.
- [ ] Internal links.
- [ ] Breadcrumbs where appropriate.
- [ ] Redirects for changed URLs.
- [ ] Custom 404 page.
- [ ] Duplicate page handling.
- [ ] Open Graph metadata for social sharing.

### Structured data

- [ ] Appropriate LocalBusiness or relevant salon business structured data.
- [ ] Correct business name.
- [ ] Correct address.
- [ ] Correct telephone number.
- [ ] Correct opening hours.
- [ ] Website URL.
- [ ] Relevant service information.
- [ ] Breadcrumb structured data where appropriate.
- [ ] Structured data matches visible website content.
- [ ] Validate structured data using Google's testing tools.

Do not add fake ratings, fake reviews, invented prices or misleading structured data.

### Local SEO

- [ ] Google Business Profile created or reviewed.
- [ ] Business name consistent across the website and listings.
- [ ] Business address consistent.
- [ ] Telephone number consistent.
- [ ] Opening hours accurate.
- [ ] Relevant service categories.
- [ ] Location and service information.
- [ ] Genuine customer reviews encouraged.
- [ ] Review responses managed.
- [ ] Location page has useful original content.
- [ ] Contact page includes accurate business details.
- [ ] Embedded map where useful.

### Content SEO

- [ ] Individual treatment pages.
- [ ] Useful treatment descriptions.
- [ ] Relevant local search terms.
- [ ] Natural headings and page structure.
- [ ] Unique content for each treatment.
- [ ] Useful FAQs.
- [ ] Clear prices and service information.
- [ ] Relevant internal links.
- [ ] Image optimisation.
- [ ] Avoid duplicate or automatically generated low-value pages.
- [ ] Regular content review.

### SEO monitoring

- [ ] Google Search Console configured.
- [ ] Sitemap submitted.
- [ ] Search indexing monitored.
- [ ] Search queries monitored.
- [ ] Search impressions monitored.
- [ ] Click-through rate monitored.
- [ ] Organic traffic monitored.
- [ ] Broken links checked.
- [ ] Indexing errors reviewed.
- [ ] SEO changes documented.

**Acceptance criteria:** Public pages are technically accessible, indexable where appropriate, locally relevant and monitored. SEO improvements do not guarantee a particular Google ranking.

---

# 14. Website Performance and Accessibility

### Performance

- [ ] Optimise images.
- [ ] Use modern image formats where supported.
- [ ] Lazy-load appropriate images.
- [ ] Avoid unnecessary JavaScript.
- [ ] Reduce unused CSS.
- [ ] Optimise font loading.
- [ ] Review caching.
- [ ] Review database query performance.
- [ ] Avoid unnecessary third-party scripts.
- [ ] Test mobile performance.
- [ ] Monitor Core Web Vitals.

Target Google's Core Web Vitals good thresholds:

- LCP: 2.5 seconds or less.
- INP: 200 milliseconds or less.
- CLS: 0.1 or less.

### Accessibility

- [ ] Semantic HTML.
- [ ] Keyboard navigation.
- [ ] Visible focus indicators.
- [ ] Accessible forms.
- [ ] Proper form labels.
- [ ] Appropriate colour contrast.
- [ ] Image alternative text.
- [ ] Accessible buttons.
- [ ] Accessible error messages.
- [ ] Screen-reader testing.
- [ ] Responsive text sizing.
- [ ] Review WCAG 2.2 AA requirements.

**Acceptance criteria:** The website is usable on mobile devices, performs well and supports users with different accessibility needs.

---

# 15. Quality Assurance and Testing

QA must be completed before every production release.

### Unit testing

- [ ] Authentication logic.
- [ ] Package purchase logic.
- [ ] Package entitlement calculations.
- [ ] Complimentary treatment unlocking.
- [ ] Package redemption.
- [ ] Treatment eligibility.
- [ ] Booking validation.
- [ ] Permission checks.
- [ ] Marketing consent checks.
- [ ] Data validation.

### Integration testing

- [ ] Frontend and backend communication.
- [ ] Customer account and database.
- [ ] OTP provider.
- [ ] QR scanning and redemption.
- [ ] Booking request notifications.
- [ ] Package purchase and activation.
- [ ] CRM customer matching.
- [ ] Email service.
- [ ] SMS service.
- [ ] Treatwell workflow where supported.

### End-to-end testing

- [ ] New customer visits website.
- [ ] New customer books through Treatwell.
- [ ] Customer visits salon.
- [ ] Customer buys a package in person.
- [ ] Staff records package against customer.
- [ ] Customer registers or logs in.
- [ ] Customer sees their package.
- [ ] Customer requests next appointment through PWA.
- [ ] Admin receives booking notification.
- [ ] Admin checks Treatwell diary.
- [ ] Admin confirms booking.
- [ ] Customer receives confirmation.
- [ ] Staff scans customer QR code after treatment.
- [ ] Staff confirms completed treatment.
- [ ] Customer sees updated balance.
- [ ] Fifth paid completion unlocks the free treatment.
- [ ] Customer redeems the complimentary treatment.

### Negative and edge-case testing

- [ ] Invalid OTP.
- [ ] Expired OTP.
- [ ] Repeated OTP requests.
- [ ] Duplicate customer registration.
- [ ] Unauthorised account access.
- [ ] Unauthorised package access.
- [ ] Inactive package redemption.
- [ ] Wrong treatment redemption.
- [ ] Duplicate QR redemption.
- [ ] Treatment confirmation without a valid booking or authorised workflow.
- [ ] Cancelled booking.
- [ ] Customer does not attend.
- [ ] Package correction.
- [ ] Package refund.
- [ ] Network interruption during redemption.
- [ ] Multiple staff attempting to redeem the same entitlement.
- [ ] Expired or revoked login session.

### Browser and device testing

- [ ] Chrome desktop.
- [ ] Safari desktop.
- [ ] Chrome Android.
- [ ] Safari iPhone.
- [ ] Android PWA installation.
- [ ] iPhone home-screen installation.
- [ ] Tablet layout.
- [ ] Staff camera permissions.
- [ ] QR scanning on supported devices.

### User acceptance testing

- [ ] Salon owner tests admin dashboard.
- [ ] Receptionist tests customer registration.
- [ ] Staff tests QR redemption.
- [ ] Customer tests PWA.
- [ ] Customer tests booking request.
- [ ] Customer checks package balance.
- [ ] Staff tests package purchase.
- [ ] Owner approves final workflow.

**Acceptance criteria:** Critical workflows pass on the actual supported devices and browsers. Failed tests must be fixed or formally accepted as known limitations before release.

---

# 16. Reporting and Business Intelligence

- [ ] Total customers.
- [ ] New customers.
- [ ] Returning customers.
- [ ] Customer retention.
- [ ] Popular treatments.
- [ ] Treatment revenue.
- [ ] Average treatment price.
- [ ] Package sales.
- [ ] Package redemption.
- [ ] Complimentary treatment count.
- [ ] Unused package balances.
- [ ] Staff performance.
- [ ] Rebooking rates.
- [ ] Cancellation rates.
- [ ] Retail sales.
- [ ] Revenue reporting.
- [ ] Weekly and monthly reporting.
- [ ] Export reports.
- [ ] AI data analyst with permission-controlled database access.
- [ ] AI-generated reports must be based on actual data and show their reporting period.

**Acceptance criteria:** Reports use verified source data and do not invent missing figures.

---

# 17. Deployment and Maintenance

- [ ] Development environment configured.
- [ ] Testing/staging environment configured.
- [ ] Production environment configured.
- [ ] Environment variables secured.
- [ ] Database backups configured.
- [ ] Restore process tested.
- [ ] Database migrations reviewed.
- [ ] Deployment process documented.
- [ ] Rollback procedure documented.
- [ ] Error monitoring configured.
- [ ] Uptime monitoring configured.
- [ ] Dependency updates reviewed.
- [ ] Security updates reviewed.
- [ ] Production release checklist completed.
- [ ] Post-release smoke tests completed.

**Acceptance criteria:** Every production release has a tested deployment and recovery process.

---

# 18. Future Improvements

These are future enhancements, not immediate requirements.

- [ ] Native Android application, if justified.
- [ ] Native iOS application, if justified.
- [ ] Advanced customer loyalty programmes.
- [ ] Automated appointment reminders.
- [ ] Advanced staff performance dashboard.
- [ ] AI business analyst.
- [ ] Advanced customer retention predictions.
- [ ] Automated campaign suggestions.
- [ ] More advanced reporting.
- [ ] Additional approved booking integrations.
- [ ] Advanced stock and inventory management.
- [ ] Multi-branch salon management, if required.

---

# 19. AI Development Task Completion Record

The AI must update this section after completing each development task.

| Field | Required information |
|---|---|
| Task | Feature or bug being addressed |
| Date | Date of work |
| Files changed | List of modified files |
| Database changes | Migrations or schema changes |
| Tests performed | Test names and results |
| Security review | Findings and fixes |
| SEO impact | Relevant changes, if applicable |
| Performance impact | Relevant measurements, if applicable |
| Known issues | Outstanding defects |
| Documentation | Updated documentation |
| Approval | Awaiting owner approval / Approved |

## Task status definitions

- [ ] Not started
- [ ] In progress
- [ ] Implemented
- [ ] Tested
- [ ] Failed QA
- [ ] Awaiting owner approval
- [ ] Approved
- [ ] Released

A task must not be marked Approved or Released without the required testing and owner approval.

---

# 20. Final AI Working Agreement

Whenever you receive a new request:

1. Read this checklist and the relevant project documents.
2. Identify the requested feature.
3. Check dependencies and existing functionality.
4. Explain the proposed changes before making significant structural changes.
5. Implement only the approved scope.
6. Run relevant automated and manual tests.
7. Review security, privacy, SEO and performance impacts.
8. Update documentation.
9. Update this checklist.
10. Report the results honestly.

Never mark a task complete simply because code was generated.

Never sacrifice existing functionality, customer privacy, security or website design to implement a new feature.

The existing application is the foundation. Extend it carefully and maintain it professionally.