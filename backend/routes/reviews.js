const adminRouter = require('express').Router();
const publicRouter = require('express').Router({ mergeParams: true });
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ============================================
// ADMIN ROUTES (behind tenantAuth)
// ============================================
adminRouter.use(tenantAuth);

// GET /api/admin/reviews — all reviews with stats
adminRouter.get('/', asyncHandler(async (req, res) => {
  const reviews = await getAll(
    'SELECT * FROM reviews WHERE tenant_id = $1 ORDER BY created_at DESC',
    [req.tenantId]
  );

  const stats = await getOne(
    `SELECT
       COUNT(*) as total,
       COALESCE(AVG(rating), 0) as average_rating,
       COUNT(*) FILTER (WHERE visible = TRUE) as visible_count,
       COUNT(*) FILTER (WHERE rating = 5) as five_star,
       COUNT(*) FILTER (WHERE rating = 4) as four_star,
       COUNT(*) FILTER (WHERE rating = 3) as three_star,
       COUNT(*) FILTER (WHERE rating <= 2) as low_star
     FROM reviews WHERE tenant_id = $1`,
    [req.tenantId]
  );

  res.json({
    reviews,
    stats: {
      total: parseInt(stats.total),
      average_rating: parseFloat(parseFloat(stats.average_rating).toFixed(1)),
      visible_count: parseInt(stats.visible_count),
      five_star: parseInt(stats.five_star),
      four_star: parseInt(stats.four_star),
      three_star: parseInt(stats.three_star),
      low_star: parseInt(stats.low_star),
    },
  });
}));

// PATCH /api/admin/reviews/:id/toggle — toggle visibility
adminRouter.patch('/:id/toggle', asyncHandler(async (req, res) => {
  const review = await getOne(
    'UPDATE reviews SET visible = NOT visible WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [req.params.id, req.tenantId]
  );

  if (!review) return res.status(404).json({ error: 'Review not found' });
  res.json(review);
}));

// DELETE /api/admin/reviews/:id
adminRouter.delete('/:id', asyncHandler(async (req, res) => {
  await run('DELETE FROM reviews WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json({ message: 'Deleted' });
}));

// ============================================
// PUBLIC ROUTES (behind resolveTenant)
// ============================================
publicRouter.use(resolveTenant);

// GET /api/t/:tenant/reviews — visible reviews + stats
publicRouter.get('/', asyncHandler(async (req, res) => {
  const reviews = await getAll(
    'SELECT customer_name, rating, comment, service_category, created_at FROM reviews WHERE tenant_id = $1 AND visible = TRUE ORDER BY created_at DESC LIMIT 50',
    [req.tenantId]
  );

  const stats = await getOne(
    `SELECT
       COUNT(*) as total,
       COALESCE(AVG(rating), 0) as average_rating
     FROM reviews WHERE tenant_id = $1 AND visible = TRUE`,
    [req.tenantId]
  );

  res.json({
    reviews,
    average_rating: parseFloat(parseFloat(stats.average_rating).toFixed(1)),
    total: parseInt(stats.total),
  });
}));

// POST /api/t/:tenant/reviews — submit a review
publicRouter.post('/', asyncHandler(async (req, res) => {
  const { customerName, rating, comment, bookingId, serviceCategory } = req.body;

  if (!customerName || !rating) {
    return res.status(400).json({ error: 'customerName and rating are required' });
  }

  if (rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be between 1 and 5' });
  }

  // Try to find customer
  let customerId = null;
  const customer = await getOne(
    'SELECT id FROM customers WHERE tenant_id = $1 AND name = $2',
    [req.tenantId, customerName]
  );
  if (customer) customerId = customer.id;

  const review = await getOne(
    `INSERT INTO reviews (tenant_id, customer_name, rating, comment, customer_id, booking_id, service_category, visible)
     VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE) RETURNING *`,
    [req.tenantId, customerName, rating, comment || null, customerId, bookingId || null, serviceCategory || null]
  );

  res.status(201).json(review);
}));

module.exports = { adminRouter, publicRouter };
