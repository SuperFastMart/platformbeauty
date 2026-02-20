require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { migrate } = require('./scripts/migrate');
const { seed } = require('./scripts/seed');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL
    : ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Platform admin routes ---
const platformRoutes = require('./routes/platform');
app.use('/api/platform', platformRoutes);

// --- Tenant admin routes (authenticated, tenant scoped) ---
const tenantAdminRoutes = require('./routes/admin');
app.use('/api/admin', tenantAdminRoutes);

// --- Public tenant routes (resolved by slug) ---
const publicTenantRoutes = require('./routes/public');
app.use('/api/t/:tenant', publicTenantRoutes);

// --- Customer auth routes (tenant-scoped, public + authenticated) ---
const customerAuthRoutes = require('./routes/customerAuth');
app.use('/api/t/:tenant/auth', customerAuthRoutes);

// --- Sprint 3: Loyalty, Discount Codes, Reports ---
const { adminRouter: loyaltyAdminRoutes, publicRouter: loyaltyPublicRoutes } = require('./routes/loyalty');
app.use('/api/admin/loyalty', loyaltyAdminRoutes);
app.use('/api/t/:tenant/loyalty', loyaltyPublicRoutes);

const { adminRouter: discountCodeAdminRoutes, publicRouter: discountCodePublicRoutes } = require('./routes/discountCodes');
app.use('/api/admin/discount-codes', discountCodeAdminRoutes);
app.use('/api/t/:tenant/discount', discountCodePublicRoutes);

const reportsRoutes = require('./routes/reports');
app.use('/api/admin/reports', reportsRoutes);

// --- Sprint 4: Messages, Site Settings, Reviews ---
const messagesRoutes = require('./routes/messages');
app.use('/api/admin/messages', messagesRoutes);

const { adminRouter: siteSettingsAdminRoutes, publicRouter: siteSettingsPublicRoutes } = require('./routes/siteSettings');
app.use('/api/admin/site-settings', siteSettingsAdminRoutes);
app.use('/api/t/:tenant/settings', siteSettingsPublicRoutes);

const { adminRouter: reviewsAdminRoutes, publicRouter: reviewsPublicRoutes } = require('./routes/reviews');
app.use('/api/admin/reviews', reviewsAdminRoutes);
app.use('/api/t/:tenant/reviews', reviewsPublicRoutes);

// --- Sprint 5: Calendar feed ---
const calendarRoutes = require('./routes/calendar');
app.use('/api/admin/calendar', calendarRoutes);

// --- Sprint 6: Support tickets ---
const { tenantAuth, platformAuth } = require('./middleware/auth');
const { adminRouter: supportAdminRoutes, platformRouter: supportPlatformRoutes } = require('./routes/support');
app.use('/api/admin/support', tenantAuth, supportAdminRoutes);
app.use('/api/platform/support', platformAuth, supportPlatformRoutes);

// Serve frontend for all non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
    }
  });
}

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function start() {
  try {
    // Run migrations on startup
    await migrate();
    console.log('Database ready.');

    // Seed initial data (safe to run repeatedly - skips existing records)
    await seed();

    // Init scheduled jobs
    const { initReminderJob } = require('./jobs/reminderJob');
    initReminderJob();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
