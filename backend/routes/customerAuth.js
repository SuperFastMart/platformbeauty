const router = require('express').Router({ mergeParams: true });
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getOne, getAll, run } = require('../config/database');
const { resolveTenant } = require('../middleware/auth');
const { customerAuth } = require('../middleware/customerAuth');
const {
  sendMagicLinkEmail, sendPasswordResetEmail, sendBookingRequestNotification,
} = require('../utils/emailService');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// All routes resolve tenant from URL slug
router.use(resolveTenant);

// ============================================
// PUBLIC AUTH (no customer auth needed)
// ============================================

// POST /api/t/:tenant/auth/register
router.post('/register', asyncHandler(async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  // Check if customer already exists with a password
  const existing = await getOne(
    'SELECT id, password_hash FROM customers WHERE tenant_id = $1 AND email = $2',
    [req.tenantId, email]
  );

  if (existing && existing.password_hash) {
    return res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let customer;
  if (existing) {
    // Customer record exists (from a previous booking) — add password
    customer = await getOne(
      `UPDATE customers SET password_hash = $1, name = COALESCE($2, name), phone = COALESCE($3, phone), email_verified = TRUE
       WHERE id = $4 RETURNING id, name, email, phone`,
      [passwordHash, name, phone || null, existing.id]
    );
  } else {
    customer = await getOne(
      `INSERT INTO customers (tenant_id, name, email, phone, password_hash, email_verified)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING id, name, email, phone`,
      [req.tenantId, name, email, phone || null, passwordHash]
    );
  }

  const token = jwt.sign(
    { customerId: customer.id, tenantId: req.tenantId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({ token, customer });
}));

// POST /api/t/:tenant/auth/login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const customer = await getOne(
    'SELECT id, name, email, phone, password_hash FROM customers WHERE tenant_id = $1 AND email = $2',
    [req.tenantId, email]
  );

  if (!customer || !customer.password_hash) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, customer.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { customerId: customer.id, tenantId: req.tenantId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token,
    customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
  });
}));

// POST /api/t/:tenant/auth/magic-link
router.post('/magic-link', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  // Always return success to prevent email enumeration
  const customer = await getOne(
    'SELECT id, name, email FROM customers WHERE tenant_id = $1 AND email = $2',
    [req.tenantId, email]
  );

  if (customer) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await run(
      'UPDATE customers SET magic_link_token = $1, magic_link_expires = $2 WHERE id = $3',
      [token, expires, customer.id]
    );

    await sendMagicLinkEmail(customer, req.tenant, token);
  }

  res.json({ message: 'If an account exists with that email, a sign-in link has been sent.' });
}));

// POST /api/t/:tenant/auth/verify-magic-link
router.post('/verify-magic-link', asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const customer = await getOne(
    `SELECT id, name, email, phone FROM customers
     WHERE tenant_id = $1 AND magic_link_token = $2 AND magic_link_expires > NOW()`,
    [req.tenantId, token]
  );

  if (!customer) {
    return res.status(400).json({ error: 'Invalid or expired link. Please request a new one.' });
  }

  // Clear token and mark verified
  await run(
    'UPDATE customers SET magic_link_token = NULL, magic_link_expires = NULL, email_verified = TRUE WHERE id = $1',
    [customer.id]
  );

  const jwtToken = jwt.sign(
    { customerId: customer.id, tenantId: req.tenantId },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    token: jwtToken,
    customer: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone },
  });
}));

// POST /api/t/:tenant/auth/forgot-password
router.post('/forgot-password', asyncHandler(async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const customer = await getOne(
    'SELECT id, name, email FROM customers WHERE tenant_id = $1 AND email = $2 AND password_hash IS NOT NULL',
    [req.tenantId, email]
  );

  if (customer) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await run(
      'UPDATE customers SET reset_token = $1, reset_token_expires = $2 WHERE id = $3',
      [token, expires, customer.id]
    );

    await sendPasswordResetEmail(customer, req.tenant, token);
  }

  res.json({ message: 'If an account exists with that email, a reset link has been sent.' });
}));

// POST /api/t/:tenant/auth/reset-password
router.post('/reset-password', asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const customer = await getOne(
    `SELECT id FROM customers
     WHERE tenant_id = $1 AND reset_token = $2 AND reset_token_expires > NOW()`,
    [req.tenantId, token]
  );

  if (!customer) {
    return res.status(400).json({ error: 'Invalid or expired reset link.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await run(
    'UPDATE customers SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL WHERE id = $2',
    [passwordHash, customer.id]
  );

  res.json({ message: 'Password reset successfully. You can now sign in.' });
}));

// ============================================
// AUTHENTICATED CUSTOMER ROUTES
// ============================================
router.use(customerAuth);

// GET /api/t/:tenant/auth/me
router.get('/me', asyncHandler(async (req, res) => {
  const customer = await getOne(
    'SELECT id, name, email, phone, total_visits, last_visit_date, created_at FROM customers WHERE id = $1',
    [req.customer.id]
  );

  // Upcoming bookings
  const upcoming = await getAll(
    `SELECT * FROM bookings
     WHERE tenant_id = $1 AND customer_email = $2 AND date >= CURRENT_DATE AND status IN ('pending', 'confirmed')
     ORDER BY date, start_time`,
    [req.tenantId, customer.email]
  );

  // Recent past bookings
  const history = await getAll(
    `SELECT * FROM bookings
     WHERE tenant_id = $1 AND customer_email = $2 AND (date < CURRENT_DATE OR status IN ('cancelled', 'rejected', 'completed'))
     ORDER BY date DESC, start_time DESC
     LIMIT 20`,
    [req.tenantId, customer.email]
  );

  res.json({ customer, upcoming, history });
}));

// PUT /api/t/:tenant/auth/profile
router.put('/profile', asyncHandler(async (req, res) => {
  const { name, phone } = req.body;

  const customer = await getOne(
    `UPDATE customers SET name = COALESCE($1, name), phone = COALESCE($2, phone)
     WHERE id = $3 RETURNING id, name, email, phone`,
    [name || null, phone || null, req.customer.id]
  );

  res.json(customer);
}));

// POST /api/t/:tenant/auth/change-password
router.post('/change-password', asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const customer = await getOne(
    'SELECT password_hash FROM customers WHERE id = $1',
    [req.customer.id]
  );

  if (!customer.password_hash) {
    return res.status(400).json({ error: 'No password set. Use magic link to sign in.' });
  }

  const valid = await bcrypt.compare(currentPassword, customer.password_hash);
  if (!valid) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  const hash = await bcrypt.hash(newPassword, 10);
  await run('UPDATE customers SET password_hash = $1 WHERE id = $2', [hash, req.customer.id]);

  res.json({ message: 'Password changed successfully' });
}));

// ============================================
// MESSAGES
// ============================================

// GET /api/t/:tenant/auth/messages
router.get('/messages', asyncHandler(async (req, res) => {
  const messages = await getAll(
    `SELECT * FROM messages
     WHERE tenant_id = $1 AND customer_id = $2
     ORDER BY created_at ASC`,
    [req.tenantId, req.customer.id]
  );

  // Mark inbound (from admin) as read
  await run(
    `UPDATE messages SET read_at = NOW()
     WHERE tenant_id = $1 AND customer_id = $2 AND direction = 'outbound' AND read_at IS NULL`,
    [req.tenantId, req.customer.id]
  );

  res.json(messages);
}));

// POST /api/t/:tenant/auth/messages — customer sends reply
router.post('/messages', asyncHandler(async (req, res) => {
  const { body, subject } = req.body;
  if (!body) return res.status(400).json({ error: 'Message body is required' });

  const message = await getOne(
    `INSERT INTO messages (tenant_id, customer_id, direction, subject, body, sent_via)
     VALUES ($1, $2, 'inbound', $3, $4, 'portal') RETURNING *`,
    [req.tenantId, req.customer.id, subject || null, body]
  );

  res.status(201).json(message);
}));

// ============================================
// BOOKING REQUESTS (cancel / amend)
// ============================================

// POST /api/t/:tenant/auth/booking-request
router.post('/booking-request', asyncHandler(async (req, res) => {
  const { bookingId, requestType, reason, requestedDate, requestedTime } = req.body;

  if (!bookingId || !requestType) {
    return res.status(400).json({ error: 'bookingId and requestType are required' });
  }

  if (!['cancel', 'amend'].includes(requestType)) {
    return res.status(400).json({ error: 'requestType must be cancel or amend' });
  }

  // Verify booking belongs to this customer
  const booking = await getOne(
    `SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2 AND customer_email = $3 AND status IN ('pending', 'confirmed')`,
    [bookingId, req.tenantId, req.customer.email]
  );

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // Calculate hours notice
  const bookingDateTime = new Date(`${String(booking.date).split('T')[0]}T${booking.start_time}`);
  const hoursNotice = Math.max(0, (bookingDateTime - new Date()) / (1000 * 60 * 60));

  const request = await getOne(
    `INSERT INTO booking_requests (tenant_id, booking_id, customer_id, request_type, reason, requested_date, requested_time, hours_notice)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [req.tenantId, bookingId, req.customer.id, requestType, reason || null,
     requestedDate || null, requestedTime || null, hoursNotice.toFixed(1)]
  );

  // Notify admin
  await sendBookingRequestNotification(request, booking, req.tenant);

  res.status(201).json(request);
}));

// GET /api/t/:tenant/auth/booking-requests
router.get('/booking-requests', asyncHandler(async (req, res) => {
  const requests = await getAll(
    `SELECT br.*, b.service_names, b.date as booking_date, b.start_time as booking_time
     FROM booking_requests br
     JOIN bookings b ON b.id = br.booking_id
     WHERE br.customer_id = $1 AND br.tenant_id = $2
     ORDER BY br.created_at DESC`,
    [req.customer.id, req.tenantId]
  );
  res.json(requests);
}));

// DELETE /api/t/:tenant/auth/booking-request/:id
router.delete('/booking-request/:id', asyncHandler(async (req, res) => {
  const result = await run(
    `DELETE FROM booking_requests WHERE id = $1 AND customer_id = $2 AND tenant_id = $3 AND status = 'pending'`,
    [req.params.id, req.customer.id, req.tenantId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Request not found or already processed' });
  }

  res.json({ message: 'Request cancelled' });
}));

module.exports = router;
