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
    `SELECT COUNT(*) as count FROM bookings b WHERE b.tenant_id = $1 AND b.marked_noshow = TRUE${dateFilter}`,
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

// GET /api/admin/reports/export — download transactions as CSV
router.get('/export', asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  let where = 'p.tenant_id = $1 AND p.payment_status = \'completed\'';
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

  const transactions = await getAll(
    `SELECT p.amount, p.payment_method, p.paid_at, p.created_at,
            b.customer_name, b.customer_email, b.service_names, b.date as booking_date
     FROM payments p
     LEFT JOIN bookings b ON b.id = p.booking_id
     WHERE ${where}
     ORDER BY p.paid_at DESC`,
    params
  );

  // Build CSV
  const header = 'Date,Customer,Email,Service,Booking Date,Payment Method,Amount (£)';
  const rows = transactions.map(t => {
    const date = t.paid_at ? new Date(t.paid_at).toISOString().split('T')[0] : '';
    const bookingDate = t.booking_date ? new Date(t.booking_date).toISOString().split('T')[0] : '';
    const customer = (t.customer_name || '').replace(/"/g, '""');
    const email = (t.customer_email || '').replace(/"/g, '""');
    const service = (t.service_names || '').replace(/"/g, '""');
    const method = t.payment_method || '';
    const amount = parseFloat(t.amount).toFixed(2);
    return `${date},"${customer}","${email}","${service}",${bookingDate},${method},${amount}`;
  });

  const csv = [header, ...rows].join('\n');
  const filename = `transactions_${from || 'all'}_to_${to || 'now'}.csv`;

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}));

// GET /api/admin/reports/source-breakdown — bookings by source
router.get('/source-breakdown', asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  let dateFilter = '';
  const params = [req.tenantId];

  if (from && to) {
    dateFilter = ' AND b.date >= $2 AND b.date <= $3';
    params.push(from, to);
  }

  const breakdown = await getAll(
    `SELECT
       COALESCE(b.booking_source, 'direct') as source,
       COUNT(*)::int as count,
       COALESCE(SUM(b.total_price), 0)::numeric as revenue
     FROM bookings b
     WHERE b.tenant_id = $1${dateFilter}
     GROUP BY COALESCE(b.booking_source, 'direct')
     ORDER BY count DESC`,
    params
  );

  res.json(breakdown.map(r => ({
    source: r.source,
    count: r.count,
    revenue: parseFloat(r.revenue),
  })));
}));

// GET /api/admin/reports/tips — tips summary
router.get('/tips', asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  let dateFilter = '';
  const params = [req.tenantId];

  if (from && to) {
    dateFilter = ' AND b.date >= $2 AND b.date <= $3';
    params.push(from, to);
  }

  const stats = await getOne(
    `SELECT
       COALESCE(SUM(b.tip_amount), 0)::numeric as total_tips,
       COALESCE(AVG(CASE WHEN b.tip_amount > 0 THEN b.tip_amount END), 0)::numeric as avg_tip,
       COUNT(CASE WHEN b.tip_amount > 0 THEN 1 END)::int as bookings_with_tips,
       COUNT(*)::int as total_bookings
     FROM bookings b
     WHERE b.tenant_id = $1 AND b.status IN ('confirmed', 'completed')${dateFilter}`,
    params
  );

  res.json({
    total_tips: parseFloat(stats.total_tips),
    avg_tip: parseFloat(parseFloat(stats.avg_tip).toFixed(2)),
    bookings_with_tips: stats.bookings_with_tips,
    total_bookings: stats.total_bookings,
  });
}));

// GET /api/admin/reports/retention — retention analytics
router.get('/retention', asyncHandler(async (req, res) => {
  const { days = 60 } = req.query;

  // Rebooking rates
  const rebooking = await getOne(
    `WITH customer_bookings AS (
       SELECT customer_email, date,
         LAG(date) OVER (PARTITION BY customer_email ORDER BY date) as prev_date
       FROM bookings
       WHERE tenant_id = $1 AND status IN ('confirmed', 'completed')
     ),
     gaps AS (
       SELECT customer_email, (date - prev_date) as gap_days
       FROM customer_bookings WHERE prev_date IS NOT NULL
     )
     SELECT
       COUNT(CASE WHEN gap_days <= 30 THEN 1 END)::int as rebooked_30d,
       COUNT(CASE WHEN gap_days <= 60 THEN 1 END)::int as rebooked_60d,
       COUNT(CASE WHEN gap_days <= 90 THEN 1 END)::int as rebooked_90d,
       COUNT(*)::int as total_rebookings,
       COALESCE(AVG(gap_days), 0)::numeric as avg_gap_days
     FROM gaps`,
    [req.tenantId]
  );

  // Average LTV
  const ltv = await getOne(
    `SELECT COALESCE(AVG(total_spent), 0)::numeric as avg_ltv
     FROM (
       SELECT customer_email, SUM(total_price) as total_spent
       FROM bookings
       WHERE tenant_id = $1 AND status IN ('confirmed', 'completed')
       GROUP BY customer_email
     ) sub`,
    [req.tenantId]
  );

  // At-risk customers
  const atRisk = await getOne(
    `SELECT COUNT(DISTINCT customer_email)::int as count
     FROM (
       SELECT customer_email, MAX(date) as last_visit, COUNT(*) as visits
       FROM bookings
       WHERE tenant_id = $1 AND status IN ('confirmed', 'completed')
       GROUP BY customer_email
       HAVING COUNT(*) >= 2 AND MAX(date) < CURRENT_DATE - $2::int
     ) sub`,
    [req.tenantId, parseInt(days)]
  );

  res.json({
    rebooked_30d: rebooking.rebooked_30d,
    rebooked_60d: rebooking.rebooked_60d,
    rebooked_90d: rebooking.rebooked_90d,
    total_rebookings: rebooking.total_rebookings,
    avg_gap_days: parseFloat(parseFloat(rebooking.avg_gap_days).toFixed(1)),
    avg_ltv: parseFloat(parseFloat(ltv.avg_ltv).toFixed(2)),
    at_risk_count: atRisk.count,
  });
}));

// GET /api/admin/reports/cohort — cohort retention matrix
router.get('/cohort', asyncHandler(async (req, res) => {
  const cohorts = await getAll(
    `WITH first_bookings AS (
       SELECT customer_email, MIN(date) as first_date
       FROM bookings
       WHERE tenant_id = $1 AND status IN ('confirmed', 'completed')
       GROUP BY customer_email
     ),
     cohort_data AS (
       SELECT
         TO_CHAR(DATE_TRUNC('month', fb.first_date), 'YYYY-MM') as cohort_month,
         fb.customer_email,
         DATE_PART('month', AGE(b.date, fb.first_date))::int as months_since
       FROM first_bookings fb
       JOIN bookings b ON b.customer_email = fb.customer_email AND b.tenant_id = $1
         AND b.status IN ('confirmed', 'completed')
       WHERE fb.first_date >= CURRENT_DATE - INTERVAL '12 months'
     )
     SELECT
       cohort_month,
       months_since,
       COUNT(DISTINCT customer_email)::int as customers
     FROM cohort_data
     GROUP BY cohort_month, months_since
     ORDER BY cohort_month, months_since`,
    [req.tenantId]
  );

  // Build matrix
  const matrix = {};
  for (const row of cohorts) {
    if (!matrix[row.cohort_month]) matrix[row.cohort_month] = { month: row.cohort_month, size: 0, retention: [] };
    if (row.months_since === 0) matrix[row.cohort_month].size = row.customers;
    matrix[row.cohort_month].retention[row.months_since] = row.customers;
  }

  // Convert to percentages
  const result = Object.values(matrix).map(c => ({
    ...c,
    retention: c.retention.map(v => c.size > 0 ? Math.round((v / c.size) * 100) : 0),
  }));

  res.json(result);
}));

// GET /api/admin/reports/at-risk — at-risk customer list
router.get('/at-risk', asyncHandler(async (req, res) => {
  const { days = 60 } = req.query;

  const customers = await getAll(
    `SELECT c.id, c.name, c.email, c.phone, c.last_visit_date, c.total_visits,
       COALESCE(SUM(b.total_price), 0)::numeric as total_spent,
       (CURRENT_DATE - MAX(b.date))::int as days_since_last_visit
     FROM customers c
     JOIN bookings b ON b.customer_id = c.id AND b.tenant_id = c.tenant_id
       AND b.status IN ('confirmed', 'completed')
     WHERE c.tenant_id = $1
     GROUP BY c.id, c.name, c.email, c.phone, c.last_visit_date, c.total_visits
     HAVING COUNT(b.id) >= 2 AND MAX(b.date) < CURRENT_DATE - $2::int
     ORDER BY MAX(b.date) DESC
     LIMIT 50`,
    [req.tenantId, parseInt(days)]
  );

  res.json(customers.map(c => ({
    ...c,
    total_spent: parseFloat(c.total_spent),
  })));
}));

module.exports = router;
