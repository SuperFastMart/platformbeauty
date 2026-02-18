# Booking Platform - Project Brief

## What is this?
A multi-tenant SaaS booking platform for beauty professionals. Think "Fresha alternative" - each beautician/salon gets their own booking system hosted on a shared platform.

## Origin
Built as an evolution of a single-tenant system (Studio Jen - separate repo). That system is live and battle-tested with real bookings, payments, Stripe, email reminders, loyalty cards, reviews, etc. This new project takes those proven features and rebuilds them with multi-tenancy from day one.

## Architecture
- **Single Railway deployment** - Express backend serves both the API and the React frontend (no Vercel)
- **PostgreSQL** - one database, all tenant tables have `tenant_id` foreign key
- **Three auth levels**: platform admin (us), tenant admin (beauticians), public (their customers)
- **Tenant routing**: public booking pages accessed via slug (e.g. `/t/studiojen`)

## What's already scaffolded
- Database config with connection pooling (`backend/config/database.js`)
- Migration system with 11 tables (`backend/scripts/migrate.js`)
- Auth middleware: `platformAuth`, `tenantAuth`, `resolveTenant` (`backend/middleware/auth.js`)
- Express server with static frontend serving (`backend/server.js`)
- Railway deployment config (`backend/railway.json`)
- Frontend directory exists but is empty - needs React app created

## Key tables
- `tenants` - business profiles, Stripe keys, subscription tier, branding
- `platform_admins` - super admin accounts (us)
- `tenant_users` - beautician admin accounts (scoped per tenant)
- `services`, `bookings`, `customers`, `time_slots` - core booking system (all tenant-scoped)
- `reviews`, `tenant_settings`, `slot_templates`, `slot_exceptions` - supporting features

## Subscription tiers (planned)
- **Basic (£5/mo)**: Booking system only
- **Premium (£10/mo)**: Booking + email notifications via Brevo
- **Pro (£15/mo)**: Booking + email + SMS reminders

## Key design decisions
- **Stripe**: Each tenant provides their own Stripe API keys. Payments go directly to them. May move to Stripe Connect later.
- **Email**: All sent from `noreply@ourplatform.com` with tenant name in the "From Name" field (e.g. "Studio Jen via Platform"). Single Brevo account.
- **SMS**: Brevo SMS, cost covered by subscription pricing. Auto-top-up on the platform Brevo account.
- **Domains**: Tenants get `platform.com/t/their-slug` - no custom domains needed initially.

## Reference implementation
The Studio Jen single-tenant system (`SuperFastMart/beauty-booking-system` on GitHub) is the feature spec. Key features to port over:
- Service categories with custom ordering
- Multi-service booking with total calculation
- 5-day calendar view + month view
- Time slot templates and exceptions
- Customer portal with magic link login
- Booking approval/rejection flow
- Loyalty stamp cards (per service category)
- Discount/promo codes
- Reviews system
- Reports (revenue, services performance, booking stats)
- Email notifications (booking confirmation, reminders, admin alerts)
- Stripe card-on-file for no-show protection

## Tech stack
- **Backend**: Node.js, Express, PostgreSQL (pg), JWT auth, Stripe, Brevo
- **Frontend**: React, MUI (Material UI), react-router, axios, dayjs
- **Deployment**: Railway (single service)
- **Repo**: `SuperFastMart/platformbeauty`

## Dev environment
- Windows 11, VS Code, Git Bash
- GitHub: `SuperFastMart` org
