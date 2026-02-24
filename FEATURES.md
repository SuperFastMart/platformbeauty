# Boukd Platform — Feature Inventory

> Living document. Updated each sprint. Last updated: Sprint 9 (Feb 2026).

---

## Booking & Scheduling

- [x] 24/7 online booking via tenant-branded booking page
- [x] Multi-step booking flow (services → date → time → intake forms → details → confirm)
- [x] Service categories with accordion-based selection
- [x] Multi-service booking in a single appointment
- [x] Floating tally bar showing selected services, price, duration
- [x] Available time slot display grouped by morning/afternoon/evening
- [x] Consecutive slot calculation for multi-service durations
- [x] "Find Next Available" — scans 30 days ahead for matching slots
- [x] Slot templates — recurring weekly availability patterns
- [x] Booking approval workflow (pending → confirmed / rejected)
- [x] Admin-created bookings (on behalf of customers)
- [x] Recurring appointment creation (admin)
- [x] iCal calendar feed for Google/Apple/Outlook
- [x] Booking notes (customer and admin)
- [x] Discount code application during booking
- [x] Deposit collection at booking time (Stripe)
- [x] Intake form questions per service (text, yes/no, checkbox)
- [x] Service document/form attachments (PDF/DOC sent with confirmation email)
- [ ] Waitlist management — auto-notify on cancellation *(Sprint 9)*
- [ ] Service add-ons / upsells *(Sprint 9)*
- [ ] Buffer/processing time between appointments
- [ ] Group bookings
- [ ] Room/resource scheduling

## Payments

- [x] Stripe integration (per-tenant API keys)
- [x] Card-on-file via SetupIntent (not charged at booking)
- [x] Deposit payments (fixed amount or percentage per service)
- [x] No-show charges on saved cards
- [x] Cash payment recording
- [x] Payment status tracking (pending, completed, refunded)
- [x] Cancellation fee support
- [x] Stripe subscription billing for tenant plans
- [ ] Gift cards / vouchers
- [ ] Service packages / bundles
- [ ] Memberships (recurring client subscriptions)
- [ ] Tips at checkout
- [ ] Buy Now Pay Later (Afterpay/Klarna)

## Customer Management

- [x] Customer database with contact details
- [x] Customer profiles with booking history and stats
- [x] Admin notes on customer profiles
- [x] Total visits and last visit tracking
- [x] Favourite service calculation
- [x] Customer search (name, email, phone)
- [x] Auto-create customer on first booking
- [x] Stripe customer ID linking
- [x] Saved payment methods per customer
- [x] Admin impersonation of customer portal (with permission)
- [ ] Allergies / alerts field with visual indicators *(Sprint 9)*
- [ ] Structured preferences (colour formulas, products) *(Sprint 9)*
- [ ] Client tags / labels *(Sprint 9)*
- [ ] GDPR self-service account deletion *(Sprint 9)*
- [ ] Before/after photo storage
- [ ] Client segmentation / filtering for campaigns
- [ ] Client import (CSV bulk upload)

## Customer Portal

- [x] Magic link login (passwordless)
- [x] Password-based login
- [x] Email verification
- [x] Password reset flow
- [x] View upcoming and past bookings
- [x] Cancel / reschedule booking requests
- [x] Loyalty stamp card viewing
- [x] Reward redemption
- [x] Customer-admin messaging
- [x] Profile management
- [ ] Self-service account deletion (GDPR) *(Sprint 9)*

## Loyalty & Discounts

- [x] Loyalty stamp cards (per service category)
- [x] Configurable stamps-to-reward threshold
- [x] Automatic stamp awarding on booking completion
- [x] Reward redemption (generates discount code)
- [x] Loyalty transaction history
- [x] Discount codes — fixed amount or percentage
- [x] Category-restricted discounts
- [x] Usage limits and expiry dates
- [x] Minimum spend requirements
- [x] Discount validation in booking flow

## Communications

- [x] Brevo email integration (platform-level API key)
- [x] Booking pending notification (customer + admin)
- [x] Booking confirmed notification (customer)
- [x] Booking rejected notification (customer)
- [x] 24-hour appointment reminder (email)
- [x] SMS notifications via Brevo (confirmation, rejection, 24h reminder)
- [x] Admin-to-customer messaging
- [x] Message templates
- [x] Magic link emails
- [x] Password reset emails
- [x] Service form attachments in confirmation emails
- [x] Email logging (all sent emails tracked)
- [ ] SMS settings admin UI *(Sprint 9)*
- [ ] 2-hour SMS reminder *(Sprint 9)*
- [ ] Email marketing campaigns (blast)
- [ ] Automated campaigns (birthday, win-back)
- [ ] WhatsApp notifications

## Reviews

- [x] Customer review submission (rating + text)
- [x] Admin review moderation (approve/hide)
- [x] Public review display on tenant landing page
- [x] Review rating aggregation

## Reports & Analytics

- [x] Revenue reports (total, card, cash, average)
- [x] Daily revenue breakdown
- [x] Service performance (bookings per service, estimated revenue)
- [x] Booking stats by status
- [x] Recent transactions list (paginated)
- [x] Date range filtering
- [x] CSV transaction export
- [ ] Client retention metrics
- [ ] Staff performance reports
- [ ] Booking source tracking

## Admin Settings

- [x] Business details (name, phone, address, logo)
- [x] Branding (primary colour, applied across tenant pages)
- [x] Business hours configuration
- [x] Category ordering
- [x] About / "Meet Me" section with profile image
- [x] Google Maps embed
- [x] Instagram / social media embed
- [x] Cancellation, no-show, privacy, terms policies
- [x] Email notification toggles
- [x] MFA (two-factor authentication)
- [x] Password management
- [x] DAC7 tax compliance (legal name, tax reference, address)
- [ ] SMS notification toggles *(Sprint 9)*

## Services Management

- [x] Service CRUD (name, description, price, duration, category)
- [x] Service categories with display ordering
- [x] Active/inactive toggle (soft delete)
- [x] Deposit configuration per service (fixed or percentage)
- [x] Intake form questions per service
- [x] Document/form file attachments per service
- [x] Form count badge indicator
- [ ] Service add-ons / upsells *(Sprint 9)*
- [ ] Service variants (different durations/prices)

## Platform Administration

- [x] Platform admin login (separate auth)
- [x] Tenant signup and management
- [x] Tenant list with search
- [x] Tenant detail view
- [x] Subscription plan management (Free, Growth, Pro)
- [x] Stripe subscription sync
- [x] MRR and subscription overview stats
- [x] Trial expiry tracking
- [x] DAC7 compliance stats and HMRC export
- [x] Platform notifications
- [x] Support ticket system (tenant ↔ platform)
- [x] Activity logging / audit trail
- [ ] Platform analytics dashboard (deeper metrics)
- [ ] Tenant impersonation from platform level

## Security & Compliance

- [x] JWT authentication (tenant admin + customer)
- [x] MFA for tenant admins
- [x] Email verification
- [x] Rate limiting on booking and auth endpoints
- [x] Multi-tenancy isolation (tenant_id on all tables)
- [x] GDPR customer deletion (admin-initiated)
- [x] DAC7 tax information collection
- [x] Activity logging
- [x] Stripe PCI compliance (no card data stored)
- [ ] GDPR customer self-service deletion *(Sprint 9)*

## Mobile & Accessibility

- [x] Fully responsive design (mobile-first MUI)
- [x] Touch-friendly booking flow
- [x] Mobile-optimised admin dashboard
- [x] Collapsible sidebar navigation
- [x] Dark mode support

## Integrations

- [x] Stripe (payments, subscriptions)
- [x] Brevo (email + SMS)
- [x] iCal calendar feed
- [ ] Embeddable booking widget (iframe)
- [ ] Reserve with Google
- [ ] Instagram / Facebook booking buttons
- [ ] QuickBooks / Xero accounting sync
- [ ] Zapier / API access

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Express.js (CommonJS) |
| Database | PostgreSQL (raw SQL via `pg` Pool) |
| Frontend | React + Vite + MUI |
| Payments | Stripe |
| Email/SMS | Brevo |
| Hosting | Railway (backend + DB), auto-deploy from GitHub |
| Auth | JWT (tenant admin, customer, platform admin) |
