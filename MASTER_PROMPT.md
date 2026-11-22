# MASTER PROJECT PROMPT
Existing Salon Website and CRM Management Platform

## 1. Project Objective
You are working on my existing salon website and business management application.
Your responsibility is to help develop and improve the existing application into an integrated Salon Management Platform.
This is NOT a request to rebuild my website from scratch.
The existing website, frontend, backend, database, UI design, colours, components and working features must be preserved unless I explicitly approve changes.
The system should eventually combine:
- Website management
- Booking management
- Treatwell Connect integration
- Customer CRM
- Customer loyalty programme
- Birthday rewards
- Email and SMS marketing
- Website offers and announcements
- Staff management and targets
- Treatment and revenue analytics
- Business intelligence and AI data analysis

All these features should work together within one application.

## 2. Most Important Development Rules
Before making any changes:
1. Inspect the entire existing project.
2. Identify the frontend framework and version.
3. Identify the backend framework and version.
4. Identify the database and existing data structure.
5. Review existing routes, pages, components and APIs.
6. Identify existing authentication and user permissions.
7. Understand the current website design and branding.
8. Identify which features are already implemented.
9. Identify incomplete features and technical limitations.
10. Produce an audit report before development.

DO NOT:
- Rebuild the website unnecessarily.
- Replace the existing frontend framework.
- Replace the database without approval.
- Delete existing features.
- Change existing UI colours without approval.
- Change fonts, spacing, layouts or navigation unnecessarily.
- Remove existing booking workflows.
- Introduce duplicate customer databases.
- Install unnecessary dependencies.
- Expose customer personal information.
- Assume Treatwell API access is available.
- Invent API endpoints or integration capabilities.

Always reuse existing components, services, database tables and functionality wherever practical.

## 3. Design and User Interface
Preserve the existing website's visual identity.
Before developing a new module:
- Inspect existing colours.
- Inspect typography.
- Inspect button styles.
- Inspect navigation.
- Inspect cards and tables.
- Inspect spacing and responsive layouts.
- Inspect existing desktop and mobile designs.

All new modules must follow the existing design system.
The application should be professional, modern, responsive and easy for salon staff to use.
Do not introduce an entirely different visual style for new modules.

## 4. Booking Management and Treatwell
The salon currently uses Treatwell Connect to manage bookings.
Treatwell remains the existing booking source initially.
The application should support:
- Treatwell customer imports.
- Booking imports.
- Customer matching.
- Duplicate detection.
- Booking history.
- Customer profile updates.
- Import history.
- Error reporting.

Investigate whether Treatwell offers authorised API access, webhooks or scheduled exports.
Do not assume that Treatwell provides automatic two-way calendar synchronisation.
If API access is unavailable, support CSV import as a fallback.
Build the integration so that API synchronisation can be added later without redesigning the CRM.
Never scrape Treatwell or bypass its access restrictions.

## 5. Customer CRM
Create one central customer database.
Each customer profile should support:
- Full name.
- Email address.
- Phone number.
- Birthday.
- Booking history.
- Treatment history.
- Assigned staff member.
- Total completed visits.
- Total customer spending.
- Last visit.
- Favourite treatments.
- Loyalty progress.
- Reward history.
- Marketing preferences.
- Consent records.

Customer matching should identify possible duplicates using normalised email addresses and phone numbers.
Do not automatically merge uncertain matches.
Preserve historical information and provide a review process for potential duplicates.

## 6. Visit-Based Loyalty Programme
Create a configurable visit-based loyalty system.
Initial suggested rules:
- Five qualifying completed visits.
- £10 reward after five visits.
- One visit per completed appointment.
- Only confirmed eligible visits count.
- Refunded or reversed transactions must be handled correctly.
- Reward expiry must be configurable.
- Minimum redemption spend must be configurable.

Customers should have a loyalty history showing:
- Visits earned.
- Rewards unlocked.
- Rewards redeemed.
- Rewards expired.
- Manual adjustments.

Store loyalty activity as individual transactions.
Do not simply overwrite the customer's visit balance.

## 7. Birthday Rewards
Create a birthday promotion system.
Initial suggested rules:
- 15% birthday discount.
- Send seven days before the birthday.
- Valid during the birthday month.
- Unique voucher code per eligible customer.
- One redemption per customer.
- Configurable minimum spend.
- Configurable treatment exclusions.

Birthday campaigns should be automatically prepared for customers with appropriate marketing permissions.

## 8. Email and SMS Marketing
Create a marketing campaign manager supporting both email and SMS.
Features:
- Create campaigns.
- Design message templates.
- Select customer groups.
- Schedule campaigns.
- Send campaigns.
- Track delivery where supported.
- Track clicks where supported.
- Track resulting bookings where attribution is available.
- Manage customer unsubscribes.
- View campaign history.

Marketing permissions must be recorded separately for email and SMS.
Store:
- Consent status.
- Consent source.
- Date and time.
- Consent wording or version.
- Channel.
- Withdrawal date.

Do not assume that a Treatwell booking automatically gives the salon permission to send independent marketing messages.
Follow applicable UK GDPR and PECR requirements.

## 9. Website Content Management
Create a Website Management module inside the CRM.
The salon owner should manage existing website content from the CRM.
Features:
- Homepage banners.
- Special offers.
- Promotions.
- Announcements.
- New treatment announcements.
- Opening hours.
- Staff profiles.
- Treatment descriptions.
- Promotional images.
- Loyalty programme information.

The website should retrieve published content from the existing application backend.
Support:
- Draft.
- Preview.
- Publish.
- Schedule publication.
- Unpublish.
- Expiry dates.

Publishing an offer on the website must not automatically send marketing messages.
Use the existing website design and branding.

## 10. Offer Management
Create an offer management module.
Support:
- Percentage discounts.
- Fixed-value discounts.
- Treatment-specific promotions.
- New customer offers.
- VIP customer offers.
- Birthday offers.
- Seasonal promotions.
- Voucher codes.
- Minimum spend.
- Start and end dates.
- Redemption limits.
- Usage reports.

Allow the owner to choose where an offer appears:
- Website homepage.
- Website offers page.
- Email campaigns.
- SMS campaigns.

Do not automatically publish or send an offer until the authorised user approves it.

## 11. Announcement Management
Create an announcement manager.
Support:
- New treatments.
- Holiday opening hours.
- Special events.
- Staff announcements.
- Temporary closures.
- Last-minute availability.
- General salon news.

Announcements should support:
- Drafts.
- Preview.
- Approval.
- Scheduled publication.
- Expiry dates.
- Website display locations.

## 12. Team Management
Create a staff management module.
Support:
- Staff profiles.
- Roles and permissions.
- Working schedules.
- Assigned appointments.
- Completed treatments.
- Revenue attribution.
- Individual targets.
- Team targets.

Staff performance reporting should include:
- Revenue.
- Number of treatments.
- Average transaction value.
- Rebooking rate.
- Retail sales.
- Customer retention.
- Appointment utilisation.

Targets should be configurable weekly and monthly.
Account for working hours, holidays, staff roles and shared bookings when comparing performance.

## 13. Business Analytics
Create a Business Analytics module.
The system should analyse:
Treatment analytics:
- Most popular treatments.
- Least popular treatments.
- Treatment revenue.
- Average treatment price.
- Repeat booking rate.
- Treatment profitability where costs are available.

Customer analytics:
- New customers.
- Returning customers.
- VIP customers.
- Inactive customers.
- Customer retention.
- Average customer spending.
- Visit frequency.

Staff analytics:
- Revenue against targets.
- Treatment counts.
- Rebooking performance.
- Retail sales.
- Individual and team performance.

Marketing analytics:
- Campaign performance.
- Birthday voucher usage.
- Loyalty redemption.
- Email and SMS results.
- Campaign-attributed bookings.

Provide date filters, charts, tables and exportable reports.
Never invent missing data.
Clearly distinguish actual figures from estimates.

## 14. AI Data Analyst
Create a future-ready AI analytics feature.
The salon owner should be able to ask questions such as:
- Which treatment is most popular?
- Which treatment generates the highest revenue?
- Which staff member is achieving their target?
- Which customers have not returned for 90 days?
- Which promotions generate the most bookings?
- How does this month compare with last month?
- Which services have the highest repeat booking rate?

The AI assistant should analyse authorised business data and provide:
- Answers.
- Charts.
- Reports.
- Comparisons.
- Business insights.

The AI must not invent figures or expose information to unauthorised users.

## 15. Security and Permissions
Implement role-based access control.
Suggested roles:
- Owner.
- Administrator.
- Manager.
- Receptionist.
- Staff member.

Protect customer personal information.
Restrict access to financial and staff performance information according to permissions.
Maintain audit logs for important changes.
Never expose credentials, API keys or private customer data in frontend code or logs.

## 16. Database and Architecture
Before creating new database tables:
1. Inspect existing tables.
2. Identify reusable structures.
3. Check existing relationships.
4. Identify possible data conflicts.
5. Propose necessary schema changes.

Avoid duplicate records and unnecessary tables.
Use migrations for database changes.
Keep integrations modular.
Separate business logic from the UI.
Make sure the application can scale as customer and booking records grow.

## 17. Development Workflow
Development must happen in controlled phases.
For every phase:
1. Inspect existing functionality.
2. Explain the proposed changes.
3. Identify affected files.
4. Explain database changes.
5. Implement the approved changes.
6. Test existing functionality.
7. Test the new functionality.
8. Check mobile responsiveness.
9. Report completed work.
10. Update documentation.

Do not make large unrelated changes.
Do not move to the next major phase until the current phase is reviewed.

## 18. Documentation Requirements
Maintain these project documents:
- Existing system audit.
- Design guidelines.
- System architecture.
- Database documentation.
- Booking and Treatwell integration.
- Customer CRM.
- Loyalty and rewards.
- Marketing system.
- Website content management.
- Team and analytics.
- Security and permissions.
- Development roadmap.
- Changelog.

Update documentation whenever important implementation decisions or system changes occur.

## 19. First Task: Audit Only
For your first response, DO NOT write or modify any application code.
Inspect the existing project and produce:
1. Current technology stack.
2. Current application architecture.
3. Existing website pages and modules.
4. Existing design system.
5. Existing database structure.
6. Existing booking workflow.
7. Existing authentication and permissions.
8. Existing integrations.
9. Features that can be reused.
10. Missing features.
11. Risks and technical limitations.
12. Recommended development roadmap.

Create the documentation structure and proposed audit reports.
Wait for my approval before modifying application code.

## Final Principle
Preserve what already works. Improve what needs improvement. Build new features around the existing application.
The goal is one integrated salon management platform, not several disconnected applications.
