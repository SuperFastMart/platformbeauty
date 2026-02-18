require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { migrate } = require('./scripts/migrate');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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
// app.use('/api/platform', platformRoutes);

// --- Tenant admin routes (authenticated, tenant scoped) ---
// app.use('/api/admin', tenantAdminRoutes);

// --- Public tenant routes (resolved by slug) ---
// app.use('/api/t/:tenant', publicTenantRoutes);

// Serve frontend for all non-API routes in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../frontend/build', 'index.html'));
    }
  });
}

// Start server
async function start() {
  try {
    // Run migrations on startup
    await migrate();
    console.log('Database ready.');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
