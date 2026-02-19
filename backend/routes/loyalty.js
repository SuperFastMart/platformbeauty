const adminRouter = require('express').Router();
const publicRouter = require('express').Router({ mergeParams: true });
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/auth');
const { customerAuth } = require('../middleware/customerAuth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ============================================
// ADMIN ROUTES (behind tenantAuth)
// ============================================
adminRouter.use(tenantAuth);

// GET /api/admin/loyalty/config
adminRouter.get('/config', asyncHandler(async (req, res) => {
  let config = await getOne(
    'SELECT * FROM loyalty_config WHERE tenant_id = $1',
    [req.tenantId]
  );

  if (!config) {
    config = await getOne(
      `INSERT INTO loyalty_config (tenant_id) VALUES ($1) RETURNING *`,
      [req.tenantId]
    );
  }

  res.json(config);
}));

// PUT /api/admin/loyalty/config
adminRouter.put('/config', asyncHandler(async (req, res) => {
  const { stamps_needed, discount_percent, active } = req.body;

  const config = await getOne(
    `INSERT INTO loyalty_config (tenant_id, stamps_needed, discount_percent, active)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id) DO UPDATE SET
       stamps_needed = EXCLUDED.stamps_needed,
       discount_percent = EXCLUDED.discount_percent,
       active = EXCLUDED.active
     RETURNING *`,
    [req.tenantId, stamps_needed || 6, discount_percent || 50, active ?? false]
  );

  res.json(config);
}));

// GET /api/admin/loyalty/customers — customers with stamp counts
adminRouter.get('/customers', asyncHandler(async (req, res) => {
  const customers = await getAll(
    `SELECT c.id, c.name, c.email, c.phone,
            COALESCE(json_agg(
              json_build_object('category', cs.category, 'stamps', cs.stamps, 'lifetime_stamps', cs.lifetime_stamps)
            ) FILTER (WHERE cs.id IS NOT NULL), '[]') as stamp_data
     FROM customers c
     LEFT JOIN customer_category_stamps cs ON cs.customer_id = c.id AND cs.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1
     GROUP BY c.id
     ORDER BY c.name`,
    [req.tenantId]
  );

  res.json(customers);
}));

// GET /api/admin/loyalty/stats
adminRouter.get('/stats', asyncHandler(async (req, res) => {
  const config = await getOne(
    'SELECT * FROM loyalty_config WHERE tenant_id = $1',
    [req.tenantId]
  );

  const totalStamps = await getOne(
    'SELECT COALESCE(SUM(stamps), 0) as total, COALESCE(SUM(lifetime_stamps), 0) as lifetime FROM customer_category_stamps WHERE tenant_id = $1',
    [req.tenantId]
  );

  const totalRedemptions = await getOne(
    `SELECT COUNT(*) as count FROM redeemed_rewards WHERE tenant_id = $1 AND status = 'used'`,
    [req.tenantId]
  );

  const activeRewards = await getOne(
    `SELECT COUNT(*) as count FROM redeemed_rewards WHERE tenant_id = $1 AND status = 'active'`,
    [req.tenantId]
  );

  res.json({
    config,
    total_active_stamps: parseInt(totalStamps.total),
    lifetime_stamps: parseInt(totalStamps.lifetime),
    total_redemptions: parseInt(totalRedemptions.count),
    active_rewards: parseInt(activeRewards.count),
  });
}));

// POST /api/admin/loyalty/adjust/:customerId — manually adjust stamps
adminRouter.post('/adjust/:customerId', asyncHandler(async (req, res) => {
  const { category, adjustment, reason } = req.body;

  if (!category || adjustment === undefined) {
    return res.status(400).json({ error: 'category and adjustment are required' });
  }

  // Upsert stamps
  await run(
    `INSERT INTO customer_category_stamps (tenant_id, customer_id, category, stamps, lifetime_stamps)
     VALUES ($1, $2, $3, GREATEST(0, $4), GREATEST(0, $4))
     ON CONFLICT (tenant_id, customer_id, category) DO UPDATE SET
       stamps = GREATEST(0, customer_category_stamps.stamps + $4),
       lifetime_stamps = CASE WHEN $4 > 0
         THEN customer_category_stamps.lifetime_stamps + $4
         ELSE customer_category_stamps.lifetime_stamps END`,
    [req.tenantId, req.params.customerId, category, adjustment]
  );

  // Log transaction
  await run(
    `INSERT INTO loyalty_transactions (tenant_id, customer_id, points_change, transaction_type, description)
     VALUES ($1, $2, $3, 'manual', $4)`,
    [req.tenantId, req.params.customerId, adjustment, reason || 'Manual adjustment']
  );

  res.json({ message: 'Stamps adjusted' });
}));

// ============================================
// PUBLIC / CUSTOMER ROUTES (behind resolveTenant + customerAuth)
// ============================================
publicRouter.use(resolveTenant);

// GET /api/t/:tenant/loyalty/status — customer's loyalty status (requires auth)
publicRouter.get('/status', customerAuth, asyncHandler(async (req, res) => {
  const config = await getOne(
    'SELECT * FROM loyalty_config WHERE tenant_id = $1 AND active = TRUE',
    [req.tenantId]
  );

  if (!config) {
    return res.json({ active: false });
  }

  const stamps = await getAll(
    'SELECT category, stamps, lifetime_stamps FROM customer_category_stamps WHERE tenant_id = $1 AND customer_id = $2',
    [req.tenantId, req.customer.id]
  );

  const rewards = await getAll(
    `SELECT rr.*, lr.name as reward_name, lr.reward_value
     FROM redeemed_rewards rr
     LEFT JOIN loyalty_rewards lr ON lr.id = rr.reward_id
     WHERE rr.tenant_id = $1 AND rr.customer_id = $2 AND rr.status = 'active'
     ORDER BY rr.created_at DESC`,
    [req.tenantId, req.customer.id]
  );

  res.json({
    active: true,
    stamps_needed: config.stamps_needed,
    discount_percent: config.discount_percent,
    stamps,
    available_rewards: rewards,
  });
}));

// POST /api/t/:tenant/loyalty/redeem — redeem stamps for a reward
publicRouter.post('/redeem', customerAuth, asyncHandler(async (req, res) => {
  const { category } = req.body;

  const config = await getOne(
    'SELECT * FROM loyalty_config WHERE tenant_id = $1 AND active = TRUE',
    [req.tenantId]
  );

  if (!config) {
    return res.status(400).json({ error: 'Loyalty programme not active' });
  }

  const stampRecord = await getOne(
    'SELECT * FROM customer_category_stamps WHERE tenant_id = $1 AND customer_id = $2 AND category = $3',
    [req.tenantId, req.customer.id, category]
  );

  if (!stampRecord || stampRecord.stamps < config.stamps_needed) {
    return res.status(400).json({ error: `Need ${config.stamps_needed} stamps to redeem` });
  }

  // Deduct stamps
  await run(
    'UPDATE customer_category_stamps SET stamps = stamps - $1 WHERE id = $2',
    [config.stamps_needed, stampRecord.id]
  );

  // Generate reward code
  const code = `LOYALTY-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days

  const reward = await getOne(
    `INSERT INTO redeemed_rewards (tenant_id, customer_id, code, status, expires_at)
     VALUES ($1, $2, $3, 'active', $4) RETURNING *`,
    [req.tenantId, req.customer.id, code, expiresAt]
  );

  // Log transaction
  await run(
    `INSERT INTO loyalty_transactions (tenant_id, customer_id, points_change, transaction_type, description)
     VALUES ($1, $2, $3, 'redeem', $4)`,
    [req.tenantId, req.customer.id, -config.stamps_needed, `Redeemed ${config.discount_percent}% off ${category}`]
  );

  res.json({
    message: 'Reward redeemed!',
    code: reward.code,
    discount_percent: config.discount_percent,
    expires_at: reward.expires_at,
  });
}));

// GET /api/t/:tenant/loyalty/history — customer's transaction history
publicRouter.get('/history', customerAuth, asyncHandler(async (req, res) => {
  const transactions = await getAll(
    `SELECT * FROM loyalty_transactions
     WHERE tenant_id = $1 AND customer_id = $2
     ORDER BY created_at DESC LIMIT 50`,
    [req.tenantId, req.customer.id]
  );

  res.json(transactions);
}));

// ============================================
// INTERNAL: Award stamp for completed booking
// ============================================
async function awardStampForBooking(tenantId, customerId, bookingId, serviceId, usedDiscount) {
  // Don't award stamps if a discount was used on this booking
  if (usedDiscount) return;

  const config = await getOne(
    'SELECT * FROM loyalty_config WHERE tenant_id = $1 AND active = TRUE',
    [tenantId]
  );

  if (!config) return;

  // Get service category
  const service = await getOne('SELECT category FROM services WHERE id = $1', [serviceId]);
  const category = service?.category || 'General';

  // Award 1 stamp
  await run(
    `INSERT INTO customer_category_stamps (tenant_id, customer_id, category, stamps, lifetime_stamps)
     VALUES ($1, $2, $3, 1, 1)
     ON CONFLICT (tenant_id, customer_id, category) DO UPDATE SET
       stamps = customer_category_stamps.stamps + 1,
       lifetime_stamps = customer_category_stamps.lifetime_stamps + 1`,
    [tenantId, customerId, category]
  );

  // Log transaction
  await run(
    `INSERT INTO loyalty_transactions (tenant_id, customer_id, booking_id, points_change, transaction_type, description)
     VALUES ($1, $2, $3, 1, 'earn', $4)`,
    [tenantId, customerId, bookingId, `Earned stamp for ${category}`]
  );
}

module.exports = { adminRouter, publicRouter, awardStampForBooking };
