const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool, getOne, getAll, run } = require('../config/database');
const { platformAuth } = require('../middleware/auth');

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

module.exports = router;
