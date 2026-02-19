const router = require('express').Router();
const { getOne, getAll } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.use(tenantAuth);

// GET /api/admin/reports/revenue — aggregate revenue stats
router.get('/revenue', asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  let dateFilter = '';
  const params = [req.tenantId];

  if (from && to) {
    dateFilter = ' AND p.paid_at >= $2 AND p.paid_at <= $3';
    params.push(from, to + ' 23:59:59');
  } else if (from) {
    dateFilter = ' AND p.paid_at >= $2';
    params.push(from);
  } else if (to) {
    dateFilter = ' AND p.paid_at <= $2';
    params.push(to + ' 23:59:59');
  }

  const stats = await getOne(
    `SELECT
       COALESCE(SUM(p.amount), 0) as total_revenue,
       COALESCE(SUM(CASE WHEN p.payment_method = 'card' THEN p.amount ELSE 0 END), 0) as card_revenue,
       COALESCE(SUM(CASE WHEN p.payment_method = 'cash' THEN p.amount ELSE 0 END), 0) as cash_revenue,
       COUNT(*) as total_payments,
       COALESCE(AVG(p.amount), 0) as average_payment
     FROM payments p
     WHERE p.tenant_id = $1 AND p.payment_status = 'completed'${dateFilter}`,
    params
  );

  res.json({
    total_revenue: parseFloat(stats.total_revenue),
    card_revenue: parseFloat(stats.card_revenue),
    cash_revenue: parseFloat(stats.cash_revenue),
    total_payments: parseInt(stats.total_payments),
    average_payment: parseFloat(parseFloat(stats.average_payment).toFixed(2)),
  });
}));

// GET /api/admin/reports/daily-revenue — revenue per day for charts
router.get('/daily-revenue', asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  let dateFilter = '';
  const params = [req.tenantId];

  if (from && to) {
    dateFilter = ' AND p.paid_at >= $2 AND p.paid_at <= $3';
    params.push(from, to + ' 23:59:59');
  }

  const daily = await getAll(
    `SELECT
       DATE(p.paid_at) as date,
       COALESCE(SUM(p.amount), 0) as revenue,
       COUNT(*) as payments,
       COALESCE(SUM(CASE WHEN p.payment_method = 'card' THEN p.amount ELSE 0 END), 0) as card,
       COALESCE(SUM(CASE WHEN p.payment_method = 'cash' THEN p.amount ELSE 0 END), 0) as cash
     FROM payments p
     WHERE p.tenant_id = $1 AND p.payment_status = 'completed'${dateFilter}
     GROUP BY DATE(p.paid_at)
     ORDER BY date DESC`,
    params
  );

  res.json(daily.map(d => ({
    ...d,
    revenue: parseFloat(d.revenue),
    card: parseFloat(d.card),
    cash: parseFloat(d.cash),
  })));
}));

// GET /api/admin/reports/services-performance — bookings and revenue per service
router.get('/services-performance', asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  let dateFilter = '';
  const params = [req.tenantId];

  if (from && to) {
    dateFilter = ' AND b.date >= $2 AND b.date <= $3';
    params.push(from, to);
  }

  // Since service_ids is stored as comma-separated text, we need to join differently
  // Get all bookings and aggregate by service_names
  const services = await getAll(
    `SELECT
       s.id, s.name, s.category, s.price as service_price,
       COUNT(DISTINCT b.id) as booking_count,
       COALESCE(SUM(CASE WHEN b.status = 'completed' THEN 1 ELSE 0 END), 0) as completed_count,
       COALESCE(SUM(CASE WHEN b.status = 'cancelled' OR b.status = 'rejected' THEN 1 ELSE 0 END), 0) as cancelled_count,
       COUNT(DISTINCT b.id) * s.price as estimated_revenue
     FROM services s
     LEFT JOIN bookings b ON b.tenant_id = s.tenant_id
       AND b.service_ids LIKE '%' || s.id::text || '%'
       AND b.status IN ('confirmed', 'completed')${dateFilter}
     WHERE s.tenant_id = $1 AND s.active = TRUE
     GROUP BY s.id, s.name, s.category, s.price
     ORDER BY booking_count DESC`,
    params
  );

  res.json(services.map(s => ({
    ...s,
    service_price: parseFloat(s.service_price),
    estimated_revenue: parseFloat(s.estimated_revenue),
  })));
}));

// GET /api/admin/reports/bookings-stats — booking counts by status
router.get('/bookings-stats', asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  let dateFilter = '';
  const params = [req.tenantId];

  if (from && to) {
    dateFilter = ' AND b.date >= $2 AND b.date <= $3';
    params.push(from, to);
  }

  const stats = await getAll(
    `SELECT
       b.status,
       COUNT(*) as count
     FROM bookings b
     WHERE b.tenant_id = $1${dateFilter}
     GROUP BY b.status`,
    params
  );

  const noshows = await getOne(
    `SELECT COUNT(*) as count FROM bookings WHERE tenant_id = $1 AND marked_noshow = TRUE${dateFilter}`,
    params
  );

  const total = stats.reduce((sum, s) => sum + parseInt(s.count), 0);

  res.json({
    total,
    by_status: stats.reduce((obj, s) => ({ ...obj, [s.status]: parseInt(s.count) }), {}),
    noshows: parseInt(noshows.count),
  });
}));

// GET /api/admin/reports/transactions — paginated payment transactions
router.get('/transactions', asyncHandler(async (req, res) => {
  const { from, to, method, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = 'p.tenant_id = $1';
  const params = [req.tenantId];
  let paramIndex = 2;

  if (from) {
    where += ` AND p.paid_at >= $${paramIndex++}`;
    params.push(from);
  }
  if (to) {
    where += ` AND p.paid_at <= $${paramIndex++}`;
    params.push(to + ' 23:59:59');
  }
  if (method) {
    where += ` AND p.payment_method = $${paramIndex++}`;
    params.push(method);
  }

  const countResult = await getOne(
    `SELECT COUNT(*) as total FROM payments p WHERE ${where}`,
    params
  );

  params.push(parseInt(limit), offset);
  const transactions = await getAll(
    `SELECT p.*, b.customer_name, b.service_names, b.date as booking_date
     FROM payments p
     LEFT JOIN bookings b ON b.id = p.booking_id
     WHERE ${where}
     ORDER BY p.created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    params
  );

  res.json({
    transactions: transactions.map(t => ({
      ...t,
      amount: parseFloat(t.amount),
    })),
    total: parseInt(countResult.total),
    page: parseInt(page),
    pages: Math.ceil(parseInt(countResult.total) / parseInt(limit)),
  });
}));

module.exports = router;
