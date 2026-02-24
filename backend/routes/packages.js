const adminRouter = require('express').Router();
const publicRouter = require('express').Router({ mergeParams: true });
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/auth');
const { customerAuth } = require('../middleware/customerAuth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ============================================
// ADMIN ROUTES
// ============================================
adminRouter.use(tenantAuth);

// GET /api/admin/packages — list all packages
adminRouter.get('/', asyncHandler(async (req, res) => {
  const packages = await getAll(
    `SELECT sp.*,
       (SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
        FROM package_services ps JOIN services s ON s.id = ps.service_id
        WHERE ps.package_id = sp.id) as services,
       (SELECT COUNT(*)::int FROM customer_packages cp WHERE cp.package_id = sp.id AND cp.status = 'active') as active_customers
     FROM service_packages sp
     WHERE sp.tenant_id = $1
     ORDER BY sp.created_at DESC`,
    [req.user.tenantId]
  );
  res.json(packages);
}));

// POST /api/admin/packages — create package
adminRouter.post('/', asyncHandler(async (req, res) => {
  const { name, description, packagePrice, originalPrice, sessionCount, category, validDays, serviceIds } = req.body;

  if (!name || !packagePrice || !sessionCount || !serviceIds?.length) {
    return res.status(400).json({ error: 'Name, price, session count, and services are required' });
  }

  const pkg = await getOne(
    `INSERT INTO service_packages (tenant_id, name, description, package_price, original_price, session_count, category, valid_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [req.user.tenantId, name, description || null, parseFloat(packagePrice), originalPrice ? parseFloat(originalPrice) : null,
     parseInt(sessionCount), category || null, validDays ? parseInt(validDays) : 365]
  );

  // Link services
  for (const serviceId of serviceIds) {
    await run(
      'INSERT INTO package_services (package_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [pkg.id, serviceId]
    );
  }

  res.status(201).json(pkg);
}));

// PUT /api/admin/packages/:id — update package
adminRouter.put('/:id', asyncHandler(async (req, res) => {
  const { name, description, packagePrice, originalPrice, sessionCount, category, validDays, serviceIds, active } = req.body;

  const pkg = await getOne(
    `UPDATE service_packages SET
       name = COALESCE($1, name), description = COALESCE($2, description),
       package_price = COALESCE($3, package_price), original_price = $4,
       session_count = COALESCE($5, session_count), category = $6,
       valid_days = COALESCE($7, valid_days), active = COALESCE($8, active)
     WHERE id = $9 AND tenant_id = $10
     RETURNING *`,
    [name, description, packagePrice ? parseFloat(packagePrice) : null, originalPrice ? parseFloat(originalPrice) : null,
     sessionCount ? parseInt(sessionCount) : null, category || null,
     validDays ? parseInt(validDays) : null, active, req.params.id, req.user.tenantId]
  );
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  // Update services if provided
  if (serviceIds) {
    await run('DELETE FROM package_services WHERE package_id = $1', [req.params.id]);
    for (const serviceId of serviceIds) {
      await run(
        'INSERT INTO package_services (package_id, service_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [req.params.id, serviceId]
      );
    }
  }

  res.json(pkg);
}));

// DELETE /api/admin/packages/:id
adminRouter.delete('/:id', asyncHandler(async (req, res) => {
  const pkg = await getOne(
    'SELECT id FROM service_packages WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.user.tenantId]
  );
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  await run('DELETE FROM package_services WHERE package_id = $1', [req.params.id]);
  await run('DELETE FROM service_packages WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId]);
  res.json({ success: true });
}));

// GET /api/admin/packages/:id/customers — customers who purchased this package
adminRouter.get('/:id/customers', asyncHandler(async (req, res) => {
  const customers = await getAll(
    `SELECT cp.*, c.name, c.email
     FROM customer_packages cp
     JOIN customers c ON c.id = cp.customer_id
     WHERE cp.package_id = $1 AND cp.tenant_id = $2
     ORDER BY cp.purchased_at DESC`,
    [req.params.id, req.user.tenantId]
  );
  res.json(customers);
}));

// ============================================
// PUBLIC ROUTES
// ============================================
publicRouter.use(resolveTenant);

// GET /api/t/:tenant/packages — list active packages
publicRouter.get('/', asyncHandler(async (req, res) => {
  const packages = await getAll(
    `SELECT sp.id, sp.name, sp.description, sp.package_price, sp.original_price, sp.session_count, sp.category, sp.valid_days,
       (SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
        FROM package_services ps JOIN services s ON s.id = ps.service_id
        WHERE ps.package_id = sp.id) as services
     FROM service_packages sp
     WHERE sp.tenant_id = $1 AND sp.active = TRUE
     ORDER BY sp.created_at DESC`,
    [req.tenantId]
  );
  res.json(packages);
}));

// POST /api/t/:tenant/packages/:id/purchase — purchase a package (Stripe)
publicRouter.post('/:id/purchase', customerAuth, asyncHandler(async (req, res) => {
  const pkg = await getOne(
    'SELECT * FROM service_packages WHERE id = $1 AND tenant_id = $2 AND active = TRUE',
    [req.params.id, req.tenantId]
  );
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant.stripe_secret_key) {
    return res.status(400).json({ error: 'Online payments are not configured' });
  }

  const stripe = require('stripe')(tenant.stripe_secret_key);
  const amountInPence = Math.round(parseFloat(pkg.package_price) * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInPence,
    currency: 'gbp',
    metadata: {
      type: 'package_purchase',
      package_id: pkg.id.toString(),
      customer_id: req.customer.id.toString(),
      tenant_id: req.tenantId.toString(),
    },
  });

  res.json({ clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id });
}));

// POST /api/t/:tenant/packages/:id/confirm-purchase — finalise after payment
publicRouter.post('/:id/confirm-purchase', customerAuth, asyncHandler(async (req, res) => {
  const { paymentIntentId } = req.body;
  if (!paymentIntentId) return res.status(400).json({ error: 'Payment intent ID required' });

  const pkg = await getOne(
    'SELECT * FROM service_packages WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!pkg) return res.status(404).json({ error: 'Package not found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (tenant.stripe_secret_key) {
    const stripe = require('stripe')(tenant.stripe_secret_key);
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment has not been completed' });
    }
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (pkg.valid_days || 365));

  const cp = await getOne(
    `INSERT INTO customer_packages (tenant_id, customer_id, package_id, sessions_remaining, stripe_payment_intent_id, payment_status, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'paid', $6)
     RETURNING *`,
    [req.tenantId, req.customer.id, pkg.id, pkg.session_count, paymentIntentId, expiresAt]
  );

  res.json({ success: true, customerPackage: cp });
}));

// GET /api/t/:tenant/packages/my-packages — customer's purchased packages
publicRouter.get('/my-packages', customerAuth, asyncHandler(async (req, res) => {
  const packages = await getAll(
    `SELECT cp.*, sp.name, sp.session_count as total_sessions, sp.valid_days,
       (SELECT json_agg(json_build_object('id', s.id, 'name', s.name))
        FROM package_services ps JOIN services s ON s.id = ps.service_id
        WHERE ps.package_id = cp.package_id) as services
     FROM customer_packages cp
     JOIN service_packages sp ON sp.id = cp.package_id
     WHERE cp.tenant_id = $1 AND cp.customer_id = $2
     ORDER BY cp.purchased_at DESC`,
    [req.tenantId, req.customer.id]
  );
  res.json(packages);
}));

module.exports = { adminRouter, publicRouter };
