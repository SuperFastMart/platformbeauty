const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');
const {
  sendBookingApprovedNotification, sendBookingRejectedNotification,
  sendRequestApprovedNotification, sendRequestRejectedNotification,
} = require('../utils/emailService');
const { chargeNoShow, getCustomerPaymentMethods } = require('../utils/stripeService');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ============================================
// AUTH (no middleware)
// ============================================

// POST /api/admin/auth/login
router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await getOne(
    `SELECT tu.*, t.name as tenant_name, t.slug as tenant_slug
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.email = $1 AND t.active = TRUE`,
    [email]
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, tenantId: user.tenant_id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '24h' }
  );

  res.json({
    token,
    user: {
      id: user.id, tenantId: user.tenant_id, username: user.username,
      email: user.email, role: user.role,
      tenantName: user.tenant_name, tenantSlug: user.tenant_slug
    }
  });
}));

// ============================================
// All routes below require tenantAuth
// ============================================
router.use(tenantAuth);

// ============================================
// SERVICES
// ============================================

// GET /api/admin/services
router.get('/services', asyncHandler(async (req, res) => {
  const services = await getAll(
    'SELECT * FROM services WHERE tenant_id = $1 ORDER BY category, display_order, name',
    [req.tenantId]
  );
  res.json(services);
}));

// POST /api/admin/services
router.post('/services', asyncHandler(async (req, res) => {
  const { name, description, duration, price, category, display_order } = req.body;

  if (!name || !duration || !price) {
    return res.status(400).json({ error: 'Name, duration, and price are required' });
  }

  const service = await getOne(
    `INSERT INTO services (tenant_id, name, description, duration, price, category, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [req.tenantId, name, description || null, duration, price, category || null, display_order || 0]
  );

  res.status(201).json(service);
}));

// PUT /api/admin/services/:id
router.put('/services/:id', asyncHandler(async (req, res) => {
  const { name, description, duration, price, category, display_order, active } = req.body;

  const service = await getOne(
    `UPDATE services SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      duration = COALESCE($3, duration),
      price = COALESCE($4, price),
      category = COALESCE($5, category),
      display_order = COALESCE($6, display_order),
      active = COALESCE($7, active)
     WHERE id = $8 AND tenant_id = $9
     RETURNING *`,
    [name, description, duration, price, category, display_order, active, req.params.id, req.tenantId]
  );

  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  res.json(service);
}));

// DELETE /api/admin/services/:id (soft delete)
router.delete('/services/:id', asyncHandler(async (req, res) => {
  const service = await getOne(
    'UPDATE services SET active = FALSE WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [req.params.id, req.tenantId]
  );

  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  res.json({ message: 'Service deactivated' });
}));

// ============================================
// BOOKINGS
// ============================================

// GET /api/admin/bookings
router.get('/bookings', asyncHandler(async (req, res) => {
  const { date, status, from, to } = req.query;
  let sql = 'SELECT * FROM bookings WHERE tenant_id = $1';
  const params = [req.tenantId];

  if (date) {
    params.push(date);
    sql += ` AND date = $${params.length}`;
  }

  if (from && to) {
    params.push(from, to);
    sql += ` AND date >= $${params.length - 1} AND date <= $${params.length}`;
  }

  if (status) {
    params.push(status);
    sql += ` AND status = $${params.length}`;
  }

  sql += ' ORDER BY date DESC, start_time ASC';

  const bookings = await getAll(sql, params);
  res.json(bookings);
}));

// PUT /api/admin/bookings/:id/status
router.put('/bookings/:id/status', asyncHandler(async (req, res) => {
  const { status, reason, alternative } = req.body;

  if (!['confirmed', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Status must be confirmed, rejected, or cancelled' });
  }

  const booking = await getOne(
    `UPDATE bookings SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [status, req.params.id, req.tenantId]
  );

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // If rejected or cancelled, free up the time slots
  if (status === 'rejected' || status === 'cancelled') {
    await run(
      `UPDATE time_slots SET is_available = TRUE
       WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND end_time <= $4`,
      [req.tenantId, booking.date, booking.start_time, booking.end_time]
    );
  }

  // Send email notifications
  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (tenant) {
    if (status === 'confirmed') {
      sendBookingApprovedNotification(booking, tenant).catch(err => console.error('Email error:', err));
    } else if (status === 'rejected') {
      sendBookingRejectedNotification(booking, tenant, reason, alternative).catch(err => console.error('Email error:', err));
    }
  }

  res.json(booking);
}));

// ============================================
// SLOT TEMPLATES
// ============================================

// GET /api/admin/slot-templates
router.get('/slot-templates', asyncHandler(async (req, res) => {
  const templates = await getAll(
    'SELECT * FROM slot_templates WHERE tenant_id = $1 ORDER BY day_of_week, start_time',
    [req.tenantId]
  );
  res.json(templates);
}));

// POST /api/admin/slot-templates
router.post('/slot-templates', asyncHandler(async (req, res) => {
  const { name, day_of_week, start_time, end_time, slot_duration } = req.body;

  if (name === undefined || day_of_week === undefined || !start_time || !end_time) {
    return res.status(400).json({ error: 'Name, day_of_week, start_time, and end_time are required' });
  }

  const template = await getOne(
    `INSERT INTO slot_templates (tenant_id, name, day_of_week, start_time, end_time, slot_duration)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [req.tenantId, name, day_of_week, start_time, end_time, slot_duration || 30]
  );

  res.status(201).json(template);
}));

// PUT /api/admin/slot-templates/:id
router.put('/slot-templates/:id', asyncHandler(async (req, res) => {
  const { name, day_of_week, start_time, end_time, slot_duration, active } = req.body;

  const template = await getOne(
    `UPDATE slot_templates SET
      name = COALESCE($1, name),
      day_of_week = COALESCE($2, day_of_week),
      start_time = COALESCE($3, start_time),
      end_time = COALESCE($4, end_time),
      slot_duration = COALESCE($5, slot_duration),
      active = COALESCE($6, active)
     WHERE id = $7 AND tenant_id = $8
     RETURNING *`,
    [name, day_of_week, start_time, end_time, slot_duration, active, req.params.id, req.tenantId]
  );

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  res.json(template);
}));

// DELETE /api/admin/slot-templates/:id
router.delete('/slot-templates/:id', asyncHandler(async (req, res) => {
  const result = await run(
    'DELETE FROM slot_templates WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Template not found' });
  }

  res.json({ message: 'Template deleted' });
}));

// POST /api/admin/slot-templates/generate
router.post('/slot-templates/generate', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  // Get active templates for this tenant
  const templates = await getAll(
    'SELECT * FROM slot_templates WHERE tenant_id = $1 AND active = TRUE',
    [req.tenantId]
  );

  if (templates.length === 0) {
    return res.status(400).json({ error: 'No active slot templates found. Create templates first.' });
  }

  // Get exception dates in range
  const exceptions = await getAll(
    'SELECT date FROM slot_exceptions WHERE tenant_id = $1 AND date >= $2 AND date <= $3',
    [req.tenantId, startDate, endDate]
  );
  const exceptionDates = new Set(exceptions.map(e => e.date.toISOString().split('T')[0]));

  let slotsCreated = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    const dayOfWeek = current.getDay(); // 0=Sunday, 6=Saturday

    // Skip exception dates
    if (!exceptionDates.has(dateStr)) {
      // Find templates for this day of week
      const dayTemplates = templates.filter(t => t.day_of_week === dayOfWeek);

      for (const template of dayTemplates) {
        // Generate slots at interval from start_time to end_time
        const startParts = template.start_time.split(':').map(Number);
        const endParts = template.end_time.split(':').map(Number);
        const startMinutes = startParts[0] * 60 + startParts[1];
        const endMinutes = endParts[0] * 60 + endParts[1];
        const duration = template.slot_duration;

        for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
          const slotStart = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          const slotEnd = `${String(Math.floor((m + duration) / 60)).padStart(2, '0')}:${String((m + duration) % 60).padStart(2, '0')}`;

          try {
            await run(
              `INSERT INTO time_slots (tenant_id, date, start_time, end_time, is_available)
               VALUES ($1, $2, $3, $4, TRUE)
               ON CONFLICT (tenant_id, date, start_time) DO NOTHING`,
              [req.tenantId, dateStr, slotStart, slotEnd]
            );
            slotsCreated++;
          } catch (err) {
            // Skip duplicates if unique index doesn't exist yet
            if (err.code !== '23505') throw err;
          }
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  res.json({ message: `Generated ${slotsCreated} time slots`, slotsCreated });
}));

// ============================================
// SLOT EXCEPTIONS
// ============================================

// GET /api/admin/slot-exceptions
router.get('/slot-exceptions', asyncHandler(async (req, res) => {
  const exceptions = await getAll(
    'SELECT * FROM slot_exceptions WHERE tenant_id = $1 ORDER BY date',
    [req.tenantId]
  );
  res.json(exceptions);
}));

// POST /api/admin/slot-exceptions
router.post('/slot-exceptions', asyncHandler(async (req, res) => {
  const { date, reason } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const exception = await getOne(
    `INSERT INTO slot_exceptions (tenant_id, date, reason)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [req.tenantId, date, reason || null]
  );

  res.status(201).json(exception);
}));

// DELETE /api/admin/slot-exceptions/:id
router.delete('/slot-exceptions/:id', asyncHandler(async (req, res) => {
  const result = await run(
    'DELETE FROM slot_exceptions WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Exception not found' });
  }

  res.json({ message: 'Exception deleted' });
}));

// ============================================
// DASHBOARD
// ============================================

// GET /api/admin/dashboard
router.get('/dashboard', asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const [todayBookings, pendingCount, weekRevenue, totalCustomers] = await Promise.all([
    getOne(
      'SELECT COUNT(*) as count FROM bookings WHERE tenant_id = $1 AND date = $2',
      [req.tenantId, today]
    ),
    getOne(
      "SELECT COUNT(*) as count FROM bookings WHERE tenant_id = $1 AND status = 'pending'",
      [req.tenantId]
    ),
    getOne(
      `SELECT COALESCE(SUM(total_price), 0) as total FROM bookings
       WHERE tenant_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days' AND status = 'confirmed'`,
      [req.tenantId]
    ),
    getOne(
      'SELECT COUNT(*) as count FROM customers WHERE tenant_id = $1',
      [req.tenantId]
    ),
  ]);

  res.json({
    todayBookings: parseInt(todayBookings.count),
    pendingCount: parseInt(pendingCount.count),
    weekRevenue: parseFloat(weekRevenue.total),
    totalCustomers: parseInt(totalCustomers.count),
  });
}));

// ============================================
// BOOKING REQUESTS (cancel/amend from customers)
// ============================================

// GET /api/admin/bookings/requests
router.get('/bookings/requests', asyncHandler(async (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT br.*, b.service_names, b.date as booking_date, b.start_time as booking_time,
           b.end_time as booking_end_time, b.total_price, b.customer_name, b.customer_email,
           c.name as customer_name_full, c.phone as customer_phone
    FROM booking_requests br
    JOIN bookings b ON b.id = br.booking_id
    LEFT JOIN customers c ON c.id = br.customer_id
    WHERE br.tenant_id = $1`;
  const params = [req.tenantId];

  if (status && status !== 'all') {
    params.push(status);
    sql += ` AND br.status = $${params.length}`;
  }

  sql += ' ORDER BY br.created_at DESC';
  const requests = await getAll(sql, params);
  res.json(requests);
}));

// POST /api/admin/bookings/requests/:id/approve
router.post('/bookings/requests/:id/approve', asyncHandler(async (req, res) => {
  const { adminResponse } = req.body;

  const request = await getOne(
    `UPDATE booking_requests SET status = 'approved', admin_response = $1, resolved_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND status = 'pending' RETURNING *`,
    [adminResponse || null, req.params.id, req.tenantId]
  );

  if (!request) {
    return res.status(404).json({ error: 'Request not found or already processed' });
  }

  const booking = await getOne('SELECT * FROM bookings WHERE id = $1', [request.booking_id]);

  if (request.request_type === 'cancel') {
    // Cancel the booking
    await run(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [request.booking_id]);
    // Free up slots
    await run(
      `UPDATE time_slots SET is_available = TRUE
       WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
      [req.tenantId, booking.date, booking.start_time, booking.end_time]
    );
  } else if (request.request_type === 'amend' && request.requested_date) {
    // Update booking date/time
    await run(
      `UPDATE bookings SET date = $1, start_time = $2 WHERE id = $3`,
      [request.requested_date, request.requested_time, request.booking_id]
    );
  }

  // Email the customer
  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (tenant && booking) {
    sendRequestApprovedNotification(request, booking, tenant).catch(err => console.error('Email error:', err));
  }

  res.json(request);
}));

// POST /api/admin/bookings/requests/:id/reject
router.post('/bookings/requests/:id/reject', asyncHandler(async (req, res) => {
  const { adminResponse } = req.body;

  const request = await getOne(
    `UPDATE booking_requests SET status = 'rejected', admin_response = $1, resolved_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND status = 'pending' RETURNING *`,
    [adminResponse || null, req.params.id, req.tenantId]
  );

  if (!request) {
    return res.status(404).json({ error: 'Request not found or already processed' });
  }

  const booking = await getOne('SELECT * FROM bookings WHERE id = $1', [request.booking_id]);
  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (tenant && booking) {
    sendRequestRejectedNotification(request, booking, tenant).catch(err => console.error('Email error:', err));
  }

  res.json(request);
}));

// ============================================
// CUSTOMERS
// ============================================

// GET /api/admin/customers
router.get('/customers', asyncHandler(async (req, res) => {
  const customers = await getAll(
    `SELECT c.*,
       COUNT(DISTINCT b.id) as booking_count,
       COALESCE(SUM(CASE WHEN b.status IN ('confirmed','completed') THEN b.total_price ELSE 0 END), 0) as total_spent,
       MAX(b.date) as last_booking_date
     FROM customers c
     LEFT JOIN bookings b ON b.customer_email = c.email AND b.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [req.tenantId]
  );
  res.json(customers);
}));

// GET /api/admin/customers/search
router.get('/customers/search', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const search = `%${q}%`;
  const customers = await getAll(
    `SELECT * FROM customers
     WHERE tenant_id = $1 AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
     ORDER BY name LIMIT 20`,
    [req.tenantId, search]
  );
  res.json(customers);
}));

// GET /api/admin/customers/:id
router.get('/customers/:id', asyncHandler(async (req, res) => {
  const customer = await getOne(
    'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // Get booking history with stats
  const bookings = await getAll(
    `SELECT * FROM bookings
     WHERE tenant_id = $1 AND customer_email = $2
     ORDER BY date DESC, start_time DESC`,
    [req.tenantId, customer.email]
  );

  const stats = {
    total: bookings.length,
    completed: bookings.filter(b => b.status === 'confirmed' || b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
    noShows: bookings.filter(b => b.marked_noshow).length,
    totalSpent: bookings
      .filter(b => b.status === 'confirmed' || b.status === 'completed')
      .reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0),
  };

  // Find favourite service
  const serviceCounts = {};
  bookings.forEach(b => {
    if (b.service_names) {
      b.service_names.split(',').forEach(s => {
        const name = s.trim();
        serviceCounts[name] = (serviceCounts[name] || 0) + 1;
      });
    }
  });
  const entries = Object.entries(serviceCounts);
  stats.favouriteService = entries.length > 0
    ? entries.sort((a, b) => b[1] - a[1])[0][0]
    : null;

  res.json({ customer, bookings, stats });
}));

// PUT /api/admin/customers/:id/notes
router.put('/customers/:id/notes', asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const customer = await getOne(
    'UPDATE customers SET admin_notes = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
    [notes || null, req.params.id, req.tenantId]
  );

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  res.json(customer);
}));

// DELETE /api/admin/customers/:id (GDPR delete)
router.delete('/customers/:id', asyncHandler(async (req, res) => {
  const customer = await getOne(
    'SELECT id, email FROM customers WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // Cascading delete: booking_requests, email_logs, payments, bookings, customer
  await run('DELETE FROM booking_requests WHERE customer_id = $1 AND tenant_id = $2', [customer.id, req.tenantId]);
  await run('DELETE FROM email_logs WHERE customer_id = $1 AND tenant_id = $2', [customer.id, req.tenantId]);

  // Get booking IDs for this customer to delete payments
  const bookings = await getAll(
    'SELECT id FROM bookings WHERE customer_email = $1 AND tenant_id = $2',
    [customer.email, req.tenantId]
  );
  if (bookings.length > 0) {
    const bookingIds = bookings.map(b => b.id);
    const placeholders = bookingIds.map((_, i) => `$${i + 1}`).join(',');
    await run(`DELETE FROM payments WHERE booking_id IN (${placeholders})`, bookingIds);
  }

  await run('DELETE FROM bookings WHERE customer_email = $1 AND tenant_id = $2', [customer.email, req.tenantId]);
  await run('DELETE FROM customers WHERE id = $1 AND tenant_id = $2', [customer.id, req.tenantId]);

  res.json({ message: 'Customer and all associated data deleted' });
}));

// ============================================
// ADMIN SLOTS (for admin booking creation)
// ============================================

// GET /api/admin/slots?date=YYYY-MM-DD
router.get('/slots', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const slots = await getAll(
    `SELECT id, date, start_time, end_time
     FROM time_slots
     WHERE tenant_id = $1 AND date = $2 AND is_available = TRUE
     ORDER BY start_time`,
    [req.tenantId, date]
  );
  res.json(slots);
}));

// ============================================
// ADMIN BOOKING CREATION
// ============================================

// POST /api/admin/bookings/admin-create
router.post('/bookings/admin-create', asyncHandler(async (req, res) => {
  const { customerId, customerName, customerEmail, customerPhone, serviceIds, date, startTime, notes } = req.body;

  if (!serviceIds?.length || !date || !startTime) {
    return res.status(400).json({ error: 'serviceIds, date, and startTime are required' });
  }

  if (!customerId && (!customerName || !customerEmail)) {
    return res.status(400).json({ error: 'Either customerId or customerName + customerEmail required' });
  }

  // Resolve customer
  let customer;
  if (customerId) {
    customer = await getOne('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [customerId, req.tenantId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
  } else {
    // Upsert customer
    customer = await getOne(
      `INSERT INTO customers (tenant_id, name, email, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, email) DO UPDATE SET
         name = EXCLUDED.name, phone = COALESCE(EXCLUDED.phone, customers.phone)
       RETURNING *`,
      [req.tenantId, customerName, customerEmail, customerPhone || null]
    );
  }

  // Fetch services
  const placeholders = serviceIds.map((_, i) => `$${i + 2}`).join(',');
  const services = await getAll(
    `SELECT * FROM services WHERE id IN (${placeholders}) AND tenant_id = $1 AND active = TRUE`,
    [req.tenantId, ...serviceIds]
  );

  if (services.length !== serviceIds.length) {
    return res.status(400).json({ error: 'One or more services are invalid' });
  }

  const totalPrice = services.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
  const serviceNames = services.map(s => s.name).join(', ');

  const [hours, minutes] = startTime.split(':').map(Number);
  const endMinutes = hours * 60 + minutes + totalDuration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  // Create booking (auto-confirmed when admin creates)
  const booking = await getOne(
    `INSERT INTO bookings (tenant_id, customer_id, customer_name, customer_email, customer_phone,
       service_ids, service_names, date, start_time, end_time,
       total_price, total_duration, status, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed', $13, 'admin')
     RETURNING *`,
    [req.tenantId, customer.id, customer.name, customer.email, customer.phone || null,
     serviceIds.join(','), serviceNames, date, startTime, endTime,
     totalPrice, totalDuration, notes || null]
  );

  // Mark time slots as unavailable
  await run(
    `UPDATE time_slots SET is_available = FALSE
     WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
    [req.tenantId, date, startTime, endTime]
  );

  res.status(201).json(booking);
}));

// POST /api/admin/bookings/admin-create-recurring
router.post('/bookings/admin-create-recurring', asyncHandler(async (req, res) => {
  const { customerId, customerName, customerEmail, customerPhone, serviceIds, dates, notes } = req.body;

  if (!serviceIds?.length || !dates?.length) {
    return res.status(400).json({ error: 'serviceIds and dates are required' });
  }

  let customer;
  if (customerId) {
    customer = await getOne('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [customerId, req.tenantId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
  } else if (customerName && customerEmail) {
    customer = await getOne(
      `INSERT INTO customers (tenant_id, name, email, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, email) DO UPDATE SET
         name = EXCLUDED.name, phone = COALESCE(EXCLUDED.phone, customers.phone)
       RETURNING *`,
      [req.tenantId, customerName, customerEmail, customerPhone || null]
    );
  } else {
    return res.status(400).json({ error: 'Either customerId or customerName + customerEmail required' });
  }

  const placeholders = serviceIds.map((_, i) => `$${i + 2}`).join(',');
  const services = await getAll(
    `SELECT * FROM services WHERE id IN (${placeholders}) AND tenant_id = $1 AND active = TRUE`,
    [req.tenantId, ...serviceIds]
  );

  const totalPrice = services.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
  const serviceNames = services.map(s => s.name).join(', ');

  const created = [];
  for (const entry of dates) {
    const entryDate = entry.date || entry;
    const entryTime = entry.startTime || dates[0]?.startTime || '09:00';
    const [hours, minutes] = entryTime.split(':').map(Number);
    const endMinutes = hours * 60 + minutes + totalDuration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

    const booking = await getOne(
      `INSERT INTO bookings (tenant_id, customer_id, customer_name, customer_email, customer_phone,
         service_ids, service_names, date, start_time, end_time,
         total_price, total_duration, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed', $13, 'admin')
       RETURNING *`,
      [req.tenantId, customer.id, customer.name, customer.email, customer.phone || null,
       serviceIds.join(','), serviceNames, entryDate, entryTime, endTime,
       totalPrice, totalDuration, notes || null]
    );

    await run(
      `UPDATE time_slots SET is_available = FALSE
       WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
      [req.tenantId, entryDate, entryTime, endTime]
    );

    created.push(booking);
  }

  res.status(201).json({ bookings: created, count: created.length });
}));

// ============================================
// PAYMENTS
// ============================================

// POST /api/admin/bookings/:id/cash-payment
router.post('/bookings/:id/cash-payment', asyncHandler(async (req, res) => {
  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  // Record payment
  await getOne(
    `INSERT INTO payments (tenant_id, booking_id, amount, payment_method, payment_status, paid_at)
     VALUES ($1, $2, $3, 'cash', 'completed', NOW()) RETURNING *`,
    [req.tenantId, booking.id, booking.total_price]
  );

  // Update booking status
  await run(
    `UPDATE bookings SET status = 'completed', payment_status = 'paid' WHERE id = $1`,
    [booking.id]
  );

  // Update customer visit tracking
  if (booking.customer_email) {
    await run(
      `UPDATE customers SET total_visits = total_visits + 1, last_visit_date = $1
       WHERE tenant_id = $2 AND email = $3`,
      [booking.date, req.tenantId, booking.customer_email]
    );
  }

  res.json({ message: 'Cash payment recorded', booking_id: booking.id });
}));

// POST /api/admin/bookings/:id/charge-noshow
router.post('/bookings/:id/charge-noshow', asyncHandler(async (req, res) => {
  const { amount, paymentMethodId } = req.body;

  if (!amount || !paymentMethodId) {
    return res.status(400).json({ error: 'amount and paymentMethodId are required' });
  }

  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);

  try {
    const paymentIntent = await chargeNoShow(tenant, booking.customer_email, paymentMethodId, amount, booking.id);

    // Record payment
    await getOne(
      `INSERT INTO payments (tenant_id, booking_id, amount, payment_method, payment_status, stripe_payment_id, noshow_charge_id, paid_at)
       VALUES ($1, $2, $3, 'card', 'completed', $4, $4, NOW()) RETURNING *`,
      [req.tenantId, booking.id, amount, paymentIntent.id]
    );

    // Mark booking
    await run(
      `UPDATE bookings SET marked_noshow = TRUE, payment_status = 'paid' WHERE id = $1`,
      [booking.id]
    );

    res.json({ message: 'No-show charge processed', payment_intent_id: paymentIntent.id });
  } catch (err) {
    res.status(400).json({ error: `Charge failed: ${err.message}` });
  }
}));

// POST /api/admin/bookings/:id/charge-complete — charge card and mark service completed
router.post('/bookings/:id/charge-complete', asyncHandler(async (req, res) => {
  const { paymentMethodId } = req.body;

  if (!paymentMethodId) {
    return res.status(400).json({ error: 'paymentMethodId is required' });
  }

  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  const amount = parseFloat(booking.total_price);

  try {
    const paymentIntent = await chargeNoShow(tenant, booking.customer_email, paymentMethodId, amount, booking.id);

    // Record payment
    await getOne(
      `INSERT INTO payments (tenant_id, booking_id, amount, payment_method, payment_status, stripe_payment_id, paid_at)
       VALUES ($1, $2, $3, 'card', 'completed', $4, NOW()) RETURNING *`,
      [req.tenantId, booking.id, amount, paymentIntent.id]
    );

    // Mark booking completed
    await run(
      `UPDATE bookings SET status = 'completed', payment_status = 'paid' WHERE id = $1`,
      [booking.id]
    );

    // Update customer visit tracking
    if (booking.customer_email) {
      await run(
        `UPDATE customers SET total_visits = total_visits + 1, last_visit_date = $1
         WHERE tenant_id = $2 AND email = $3`,
        [booking.date, req.tenantId, booking.customer_email]
      );
    }

    res.json({ message: 'Card charged and service completed', payment_intent_id: paymentIntent.id });
  } catch (err) {
    res.status(400).json({ error: `Charge failed: ${err.message}` });
  }
}));

// GET /api/admin/bookings/:id/payment-methods
router.get('/bookings/:id/payment-methods', asyncHandler(async (req, res) => {
  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  const methods = await getCustomerPaymentMethods(tenant, booking.customer_email);

  res.json(methods);
}));

// ============================================
// SETTINGS (tenant self-service)
// ============================================

// GET /api/admin/settings
router.get('/settings', asyncHandler(async (req, res) => {
  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  // Return settings (mask secret key for display)
  res.json({
    name: tenant.name,
    slug: tenant.slug,
    owner_email: tenant.owner_email,
    owner_name: tenant.owner_name,
    business_phone: tenant.business_phone,
    business_address: tenant.business_address,
    logo_url: tenant.logo_url,
    primary_color: tenant.primary_color,
    stripe_publishable_key: tenant.stripe_publishable_key || '',
    stripe_secret_key_set: !!tenant.stripe_secret_key,
    stripe_secret_key_masked: tenant.stripe_secret_key
      ? `sk_...${tenant.stripe_secret_key.slice(-8)}`
      : '',
    brevo_enabled: tenant.brevo_enabled,
    sms_enabled: tenant.sms_enabled,
    subscription_tier: tenant.subscription_tier,
    subscription_status: tenant.subscription_status,
  });
}));

// PUT /api/admin/settings
router.put('/settings', asyncHandler(async (req, res) => {
  const {
    name, business_phone, business_address, logo_url, primary_color,
    stripe_publishable_key, stripe_secret_key,
  } = req.body;

  // Build dynamic update
  const updates = [];
  const params = [];
  let paramIndex = 1;

  const addField = (field, value) => {
    if (value !== undefined) {
      updates.push(`${field} = $${paramIndex++}`);
      params.push(value);
    }
  };

  addField('name', name);
  addField('business_phone', business_phone);
  addField('business_address', business_address);
  addField('logo_url', logo_url);
  addField('primary_color', primary_color);
  addField('stripe_publishable_key', stripe_publishable_key);

  // Only update secret key if a new one is provided (not the masked value)
  if (stripe_secret_key && !stripe_secret_key.startsWith('sk_...')) {
    addField('stripe_secret_key', stripe_secret_key);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push(`updated_at = NOW()`);
  params.push(req.tenantId);

  const tenant = await getOne(
    `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING
      id, name, slug, owner_email, owner_name, business_phone, business_address,
      logo_url, primary_color, stripe_publishable_key,
      brevo_enabled, sms_enabled, subscription_tier, subscription_status`,
    params
  );

  res.json(tenant);
}));

module.exports = router;
