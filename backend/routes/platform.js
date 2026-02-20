const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool, getOne, getAll, run } = require('../config/database');
const { platformAuth } = require('../middleware/auth');
const { sendVerificationEmail } = require('../utils/emailService');

// Helper: wrap async route handlers
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// POST /api/platform/auth/login
router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const admin = await getOne(
    'SELECT * FROM platform_admins WHERE email = $1',
    [email]
  );

  if (!admin) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, admin.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: admin.id, email: admin.email, role: 'platform_admin' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '24h' }
  );

  res.json({
    token,
    user: { id: admin.id, email: admin.email, name: admin.name, role: 'platform_admin' }
  });
}));

// ============================================
// PUBLIC SIGNUP (no auth required)
// ============================================

// POST /api/platform/signup — self-service tenant registration
router.post('/signup', asyncHandler(async (req, res) => {
  const { business_name, slug, owner_name, owner_email, password } = req.body;

  if (!business_name || !slug || !owner_name || !owner_email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  // Validate slug format
  if (!/^[a-z0-9]+$/.test(slug)) {
    return res.status(400).json({ error: 'URL slug must contain only lowercase letters and numbers' });
  }
  if (slug.length < 3 || slug.length > 50) {
    return res.status(400).json({ error: 'URL slug must be between 3 and 50 characters' });
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner_email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Password strength
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Check slug uniqueness
  const existing = await getOne('SELECT id FROM tenants WHERE slug = $1', [slug]);
  if (existing) {
    return res.status(409).json({ error: 'This URL is already taken. Please choose a different one.' });
  }

  // Check email uniqueness across tenant owners
  const existingEmail = await getOne('SELECT id FROM tenants WHERE owner_email = $1', [owner_email]);
  if (existingEmail) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, owner_email, owner_name, trial_ends_at)
       VALUES ($1, $2, $3, $4, NOW() + INTERVAL '14 days')
       RETURNING *`,
      [business_name, slug, owner_email, owner_name]
    );
    const tenant = tenantResult.rows[0];

    // Create admin user with email verification token
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await client.query(
      `INSERT INTO tenant_users (tenant_id, username, email, password, role, email_verified, email_verification_token, email_verification_expires)
       VALUES ($1, $2, $3, $4, 'admin', FALSE, $5, $6)`,
      [tenant.id, owner_email, owner_email, hashedPassword, verificationToken, verificationExpires]
    );

    // Create platform notification
    await client.query(
      `INSERT INTO platform_notifications (type, title, body, metadata, tenant_id)
       VALUES ('tenant_signup', $1, $2, $3, $4)`,
      [`New signup: ${business_name}`, `${owner_name} (${owner_email})`, JSON.stringify({ slug }), tenant.id]
    ).catch(() => {});

    await client.query('COMMIT');

    // Send verification email (non-blocking)
    sendVerificationEmail(owner_email, owner_name, verificationToken).catch(err => {
      console.error('[Signup] Failed to send verification email:', err);
    });

    // Generate JWT so user can access the verification page
    const userResult = await getOne(
      'SELECT id, tenant_id, username, email, role, email_verified FROM tenant_users WHERE tenant_id = $1 AND email = $2',
      [tenant.id, owner_email]
    );

    const token = jwt.sign(
      { id: userResult.id, tenantId: tenant.id, username: userResult.username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRY || '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: userResult.id,
        username: userResult.username,
        email: userResult.email,
        role: 'admin',
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        email_verified: false,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        subscription_status: tenant.subscription_status,
        trial_ends_at: tenant.trial_ends_at,
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// GET /api/platform/check-slug/:slug — check slug availability
router.get('/check-slug/:slug', asyncHandler(async (req, res) => {
  const existing = await getOne('SELECT id FROM tenants WHERE slug = $1', [req.params.slug]);
  res.json({ available: !existing });
}));

// GET /api/platform/verify-email?token=xxx — verify email address
router.get('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Verification token is required' });

  const user = await getOne(
    `SELECT tu.id, tu.email, tu.email_verified, tu.email_verification_expires, t.name as tenant_name, t.slug as tenant_slug
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.email_verification_token = $1`,
    [token]
  );

  if (!user) {
    return res.status(400).json({ error: 'Invalid or expired verification link' });
  }

  if (user.email_verified) {
    return res.json({ success: true, message: 'Email already verified', already_verified: true });
  }

  if (user.email_verification_expires && new Date(user.email_verification_expires) < new Date()) {
    return res.status(400).json({ error: 'Verification link has expired. Please request a new one.' });
  }

  await run(
    'UPDATE tenant_users SET email_verified = TRUE, email_verification_token = NULL, email_verification_expires = NULL WHERE id = $1',
    [user.id]
  );

  res.json({ success: true, message: 'Email verified successfully' });
}));

// POST /api/platform/resend-verification — resend verification email
router.post('/resend-verification', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = await getOne(
    `SELECT tu.id, tu.email, tu.email_verified, t.owner_name
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.email = $1`,
    [email]
  );

  if (!user) {
    // Don't reveal if email exists
    return res.json({ success: true, message: 'If an account exists, a verification email has been sent' });
  }

  if (user.email_verified) {
    return res.json({ success: true, message: 'Email is already verified' });
  }

  const newToken = crypto.randomBytes(32).toString('hex');
  const newExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await run(
    'UPDATE tenant_users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
    [newToken, newExpires, user.id]
  );

  sendVerificationEmail(user.email, user.owner_name || user.email, newToken).catch(err => {
    console.error('[Resend] Failed to send verification email:', err);
  });

  res.json({ success: true, message: 'Verification email sent' });
}));

// GET /api/platform/tenants
router.get('/tenants', platformAuth, asyncHandler(async (req, res) => {
  const tenants = await getAll(
    'SELECT id, name, slug, owner_email, owner_name, subscription_tier, subscription_status, active, created_at FROM tenants ORDER BY created_at DESC'
  );
  res.json(tenants);
}));

// POST /api/platform/tenants
router.post('/tenants', platformAuth, asyncHandler(async (req, res) => {
  const { name, slug, owner_email, owner_name, business_phone, admin_username, admin_password } = req.body;

  if (!name || !slug || !owner_email || !owner_name || !admin_username || !admin_password) {
    return res.status(400).json({ error: 'All fields are required: name, slug, owner_email, owner_name, admin_username, admin_password' });
  }

  // Check slug uniqueness
  const existing = await getOne('SELECT id FROM tenants WHERE slug = $1', [slug]);
  if (existing) {
    return res.status(409).json({ error: 'A business with this slug already exists' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create tenant
    const tenantResult = await client.query(
      `INSERT INTO tenants (name, slug, owner_email, owner_name, business_phone, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + INTERVAL '14 days')
       RETURNING *`,
      [name, slug, owner_email, owner_name, business_phone || null]
    );
    const tenant = tenantResult.rows[0];

    // Create tenant admin user
    const hashedPassword = await bcrypt.hash(admin_password, 10);
    const userResult = await client.query(
      `INSERT INTO tenant_users (tenant_id, username, email, password, role)
       VALUES ($1, $2, $3, $4, 'admin')
       RETURNING id, tenant_id, username, email, role, created_at`,
      [tenant.id, admin_username, owner_email, hashedPassword]
    );

    // Create platform notification for new tenant
    await client.query(
      `INSERT INTO platform_notifications (type, title, body, metadata, tenant_id)
       VALUES ('tenant_signup', $1, $2, $3, $4)`,
      [`New tenant: ${name}`, `${owner_name} (${owner_email})`, JSON.stringify({ slug }), tenant.id]
    ).catch(() => {});

    await client.query('COMMIT');

    res.status(201).json({
      tenant: {
        id: tenant.id, name: tenant.name, slug: tenant.slug,
        owner_email: tenant.owner_email, owner_name: tenant.owner_name,
        subscription_tier: tenant.subscription_tier, subscription_status: tenant.subscription_status,
        active: tenant.active, created_at: tenant.created_at
      },
      admin_user: userResult.rows[0]
    });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}));

// GET /api/platform/tenants/:id
router.get('/tenants/:id', platformAuth, asyncHandler(async (req, res) => {
  const tenant = await getOne(
    `SELECT id, name, slug, owner_email, owner_name, business_phone, business_address,
            logo_url, primary_color, subscription_tier, subscription_status, trial_ends_at,
            brevo_enabled, sms_enabled, active, created_at, updated_at
     FROM tenants WHERE id = $1`,
    [req.params.id]
  );

  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  // Get tenant admin users
  const users = await getAll(
    'SELECT id, username, email, role, created_at FROM tenant_users WHERE tenant_id = $1',
    [req.params.id]
  );

  res.json({ ...tenant, users });
}));

// PUT /api/platform/tenants/:id
router.put('/tenants/:id', platformAuth, asyncHandler(async (req, res) => {
  const { name, owner_email, owner_name, business_phone, business_address,
          subscription_tier, subscription_status, active } = req.body;

  const tenant = await getOne(
    `UPDATE tenants SET
      name = COALESCE($1, name),
      owner_email = COALESCE($2, owner_email),
      owner_name = COALESCE($3, owner_name),
      business_phone = COALESCE($4, business_phone),
      business_address = COALESCE($5, business_address),
      subscription_tier = COALESCE($6, subscription_tier),
      subscription_status = COALESCE($7, subscription_status),
      active = COALESCE($8, active),
      updated_at = CURRENT_TIMESTAMP
     WHERE id = $9
     RETURNING id, name, slug, owner_email, owner_name, business_phone, business_address,
               subscription_tier, subscription_status, active, updated_at`,
    [name, owner_email, owner_name, business_phone, business_address,
     subscription_tier, subscription_status, active, req.params.id]
  );

  if (!tenant) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  res.json(tenant);
}));

// ============================================
// ANALYTICS
// ============================================

// GET /api/platform/analytics
router.get('/analytics', platformAuth, asyncHandler(async (req, res) => {
  const totalTenants = await getOne('SELECT COUNT(*)::int as count FROM tenants WHERE active = TRUE');
  const activeTenants = await getOne(
    `SELECT COUNT(DISTINCT tu.tenant_id)::int as count FROM tenant_users tu
     WHERE tu.last_login_at > NOW() - INTERVAL '30 days'`
  );
  const totalBookings = await getOne('SELECT COUNT(*)::int as count FROM bookings');
  const totalRevenue = await getOne(
    "SELECT COALESCE(SUM(amount), 0)::bigint as total FROM payments WHERE payment_status = 'succeeded'"
  );
  const newThisMonth = await getOne(
    "SELECT COUNT(*)::int as count FROM tenants WHERE created_at > DATE_TRUNC('month', NOW())"
  );
  const planDistribution = await getAll(
    "SELECT COALESCE(subscription_tier, 'free') as tier, COUNT(*)::int as count FROM tenants WHERE active = TRUE GROUP BY subscription_tier ORDER BY count DESC"
  );

  // Total customers across all tenants
  const totalCustomers = await getOne('SELECT COUNT(*)::int as count FROM customers');

  // Bookings by hour of day (all time)
  const bookingsByHour = await getAll(
    `SELECT EXTRACT(HOUR FROM b.created_at)::int as hour, COUNT(*)::int as count
     FROM bookings b GROUP BY hour ORDER BY hour`
  );

  // Tenant growth (signups per month, last 6 months)
  const tenantGrowth = await getAll(
    `SELECT TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
            COUNT(*)::int as count
     FROM tenants
     WHERE created_at > NOW() - INTERVAL '6 months'
     GROUP BY month ORDER BY month`
  );

  // Top tenants by booking count (last 30 days)
  const topTenants = await getAll(
    `SELECT t.name, t.slug, COUNT(b.id)::int as booking_count
     FROM tenants t
     LEFT JOIN bookings b ON b.tenant_id = t.id AND b.created_at > NOW() - INTERVAL '30 days'
     WHERE t.active = TRUE
     GROUP BY t.id, t.name, t.slug
     ORDER BY booking_count DESC
     LIMIT 10`
  );

  // Booking status breakdown (last 30 days)
  const statusBreakdown = await getAll(
    `SELECT status, COUNT(*)::int as count
     FROM bookings
     WHERE created_at > NOW() - INTERVAL '30 days'
     GROUP BY status`
  );

  res.json({
    total_tenants: totalTenants?.count || 0,
    active_tenants: activeTenants?.count || 0,
    total_bookings: totalBookings?.count || 0,
    total_revenue: totalRevenue?.total || 0,
    new_this_month: newThisMonth?.count || 0,
    total_customers: totalCustomers?.count || 0,
    plan_distribution: planDistribution || [],
    bookings_by_hour: bookingsByHour || [],
    tenant_growth: tenantGrowth || [],
    top_tenants: topTenants || [],
    status_breakdown: statusBreakdown || [],
  });
}));

// GET /api/platform/analytics/trends?days=30
router.get('/analytics/trends', platformAuth, asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const trends = await getAll(
    `SELECT d::date as date,
       COALESCE(b.booking_count, 0)::int as bookings,
       COALESCE(p.revenue, 0)::bigint as revenue
     FROM generate_series(NOW() - $1::int * INTERVAL '1 day', NOW(), '1 day') d
     LEFT JOIN (
       SELECT DATE(created_at) as dt, COUNT(*) as booking_count
       FROM bookings
       WHERE created_at > NOW() - $1::int * INTERVAL '1 day'
       GROUP BY DATE(created_at)
     ) b ON b.dt = d::date
     LEFT JOIN (
       SELECT DATE(created_at) as dt, SUM(amount) as revenue
       FROM payments
       WHERE payment_status = 'succeeded' AND created_at > NOW() - $1::int * INTERVAL '1 day'
       GROUP BY DATE(created_at)
     ) p ON p.dt = d::date
     ORDER BY d`,
    [days]
  );
  res.json(trends);
}));

// ============================================
// TENANT DETAIL (ENHANCED)
// ============================================

// GET /api/platform/tenants/:id/detail
router.get('/tenants/:id/detail', platformAuth, asyncHandler(async (req, res) => {
  const tenant = await getOne(
    `SELECT id, name, slug, owner_email, owner_name, business_phone, business_address,
            logo_url, primary_color, subscription_tier, subscription_status, trial_ends_at,
            active, created_at, updated_at
     FROM tenants WHERE id = $1`,
    [req.params.id]
  );
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const users = await getAll(
    'SELECT id, username, email, role, last_login_at, created_at FROM tenant_users WHERE tenant_id = $1',
    [req.params.id]
  );

  const bookingCount = await getOne(
    "SELECT COUNT(*)::int as count FROM bookings WHERE tenant_id = $1 AND created_at > NOW() - INTERVAL '30 days'",
    [req.params.id]
  );

  const revenue = await getOne(
    "SELECT COALESCE(SUM(amount), 0)::bigint as total FROM payments WHERE tenant_id = $1 AND payment_status = 'succeeded' AND created_at > NOW() - INTERVAL '30 days'",
    [req.params.id]
  );

  const customerCount = await getOne(
    'SELECT COUNT(*)::int as count FROM customers WHERE tenant_id = $1',
    [req.params.id]
  );

  const serviceCount = await getOne(
    'SELECT COUNT(*)::int as count FROM services WHERE tenant_id = $1',
    [req.params.id]
  );

  res.json({
    ...tenant,
    users,
    booking_count: bookingCount?.count || 0,
    revenue: revenue?.total || 0,
    customer_count: customerCount?.count || 0,
    service_count: serviceCount?.count || 0,
  });
}));

// PUT /api/platform/tenants/:id/suspend
router.put('/tenants/:id/suspend', platformAuth, asyncHandler(async (req, res) => {
  const tenant = await getOne(
    'UPDATE tenants SET active = FALSE, updated_at = NOW() WHERE id = $1 RETURNING id, name, active',
    [req.params.id]
  );
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  // Log activity
  const { logActivity } = require('../utils/activityLog');
  logActivity(parseInt(req.params.id), 'platform_admin', req.user.id, req.user.email, 'tenant_suspended', { tenant_name: tenant.name });

  res.json({ success: true, active: false });
}));

// PUT /api/platform/tenants/:id/unsuspend
router.put('/tenants/:id/unsuspend', platformAuth, asyncHandler(async (req, res) => {
  const tenant = await getOne(
    'UPDATE tenants SET active = TRUE, updated_at = NOW() WHERE id = $1 RETURNING id, name, active',
    [req.params.id]
  );
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const { logActivity } = require('../utils/activityLog');
  logActivity(parseInt(req.params.id), 'platform_admin', req.user.id, req.user.email, 'tenant_unsuspended', { tenant_name: tenant.name });

  res.json({ success: true, active: true });
}));

// DELETE /api/platform/tenants/:id?confirm=true
router.delete('/tenants/:id', platformAuth, asyncHandler(async (req, res) => {
  if (req.query.confirm !== 'true') {
    return res.status(400).json({ error: 'Must confirm deletion with ?confirm=true' });
  }

  const tenant = await getOne('SELECT id, name FROM tenants WHERE id = $1', [req.params.id]);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Cascading deletes via foreign key constraints, but be explicit for safety
    await client.query('DELETE FROM ticket_messages WHERE ticket_id IN (SELECT id FROM support_tickets WHERE tenant_id = $1)', [req.params.id]);
    await client.query('DELETE FROM support_tickets WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM platform_notifications WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM activity_log WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM payments WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM bookings WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM time_slots WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM slot_templates WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM customers WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM services WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM tenant_settings WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM tenant_users WHERE tenant_id = $1', [req.params.id]);
    await client.query('DELETE FROM tenants WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({ success: true, deleted: tenant.name });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}));

// ============================================
// IMPERSONATION: Platform → Tenant
// ============================================

// POST /api/platform/impersonate/:tenantId
router.post('/impersonate/:tenantId', platformAuth, asyncHandler(async (req, res) => {
  const tenant = await getOne('SELECT id, name, slug FROM tenants WHERE id = $1', [req.params.tenantId]);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  // Get the tenant's admin user
  const adminUser = await getOne(
    "SELECT id, username, email, role FROM tenant_users WHERE tenant_id = $1 AND role = 'admin' ORDER BY id LIMIT 1",
    [tenant.id]
  );
  if (!adminUser) return res.status(404).json({ error: 'No admin user found for this tenant' });

  // Generate a tenant admin JWT (1 hour expiry)
  const token = jwt.sign(
    {
      id: adminUser.id,
      tenantId: tenant.id,
      username: adminUser.username,
      role: adminUser.role,
      impersonatedBy: { id: req.user.id, email: req.user.email, type: 'platform_admin' },
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Log impersonation session
  await run(
    `INSERT INTO impersonation_sessions (impersonator_type, impersonator_id, target_type, target_tenant_id)
     VALUES ('platform_admin', $1, 'tenant', $2)`,
    [req.user.id, tenant.id]
  ).catch(() => {});

  const { logActivity } = require('../utils/activityLog');
  logActivity(tenant.id, 'platform_admin', req.user.id, req.user.email, 'impersonation_started', { tenant_name: tenant.name });

  res.json({
    token,
    user: {
      id: adminUser.id,
      username: adminUser.username,
      email: adminUser.email,
      role: 'admin',
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      impersonating: true,
      impersonatedBy: req.user.email,
    },
  });
}));

// ============================================
// NOTIFICATIONS
// ============================================

// GET /api/platform/notifications
router.get('/notifications', platformAuth, asyncHandler(async (req, res) => {
  const notifications = await getAll(
    `SELECT * FROM platform_notifications
     ORDER BY created_at DESC LIMIT 50`
  );
  const unreadCount = await getOne(
    'SELECT COUNT(*)::int as count FROM platform_notifications WHERE read_at IS NULL'
  );
  res.json({ notifications, unread_count: unreadCount?.count || 0 });
}));

// PUT /api/platform/notifications/:id/read
router.put('/notifications/:id/read', platformAuth, asyncHandler(async (req, res) => {
  await run('UPDATE platform_notifications SET read_at = NOW() WHERE id = $1', [req.params.id]);
  res.json({ success: true });
}));

// PUT /api/platform/notifications/read-all
router.put('/notifications/read-all', platformAuth, asyncHandler(async (req, res) => {
  await run('UPDATE platform_notifications SET read_at = NOW() WHERE read_at IS NULL');
  res.json({ success: true });
}));

module.exports = router;
