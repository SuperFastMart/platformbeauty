const router = require('express').Router({ mergeParams: true });
const { getOne, getAll, run } = require('../config/database');
const { resolveTenant } = require('../middleware/auth');
const {
  sendBookingPendingNotification, sendAdminNewBookingNotification,
} = require('../utils/emailService');
const { createSetupIntent } = require('../utils/stripeService');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// All routes resolve the tenant from the URL slug
router.use(resolveTenant);

// GET /api/t/:tenant/ - tenant public info
router.get('/', asyncHandler(async (req, res) => {
  const t = req.tenant;
  res.json({
    id: t.id,
    name: t.name,
    slug: t.slug,
    business_phone: t.business_phone,
    business_address: t.business_address,
    logo_url: t.logo_url,
    primary_color: t.primary_color,
  });
}));

// GET /api/t/:tenant/services - active services grouped by category
router.get('/services', asyncHandler(async (req, res) => {
  const services = await getAll(
    `SELECT id, name, description, duration, price, category, display_order
     FROM services
     WHERE tenant_id = $1 AND active = TRUE
     ORDER BY category, display_order, name`,
    [req.tenantId]
  );

  // Group by category
  const grouped = {};
  for (const service of services) {
    const cat = service.category || 'General';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(service);
  }

  res.json({ services, grouped });
}));

// GET /api/t/:tenant/slots?date=YYYY-MM-DD - available slots for a date
router.get('/slots', asyncHandler(async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Date query parameter is required' });
  }

  // Get available time slots
  const slots = await getAll(
    `SELECT id, date, start_time, end_time
     FROM time_slots
     WHERE tenant_id = $1 AND date = $2 AND is_available = TRUE
     ORDER BY start_time`,
    [req.tenantId, date]
  );

  res.json(slots);
}));

// POST /api/t/:tenant/bookings - create a booking
router.post('/bookings', asyncHandler(async (req, res) => {
  const { customerName, customerEmail, customerPhone, serviceIds, date, startTime, notes } = req.body;

  if (!customerName || !customerEmail || !serviceIds?.length || !date || !startTime) {
    return res.status(400).json({
      error: 'customerName, customerEmail, serviceIds, date, and startTime are required'
    });
  }

  // Validate and fetch services
  const placeholders = serviceIds.map((_, i) => `$${i + 2}`).join(',');
  const services = await getAll(
    `SELECT * FROM services WHERE id IN (${placeholders}) AND tenant_id = $1 AND active = TRUE`,
    [req.tenantId, ...serviceIds]
  );

  if (services.length !== serviceIds.length) {
    return res.status(400).json({ error: 'One or more services are invalid' });
  }

  // Calculate totals
  const totalPrice = services.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
  const serviceNames = services.map(s => s.name).join(', ');

  // Calculate end time
  const [hours, minutes] = startTime.split(':').map(Number);
  const endMinutes = hours * 60 + minutes + totalDuration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  // Check slot availability
  const availableSlots = await getAll(
    `SELECT * FROM time_slots
     WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4 AND is_available = TRUE
     ORDER BY start_time`,
    [req.tenantId, date, startTime, endTime]
  );

  // Verify we have enough consecutive slots
  const startMinutes = hours * 60 + minutes;
  const neededSlots = [];
  if (availableSlots.length > 0) {
    // Check that we have continuous coverage
    for (let m = startMinutes; m < endMinutes; m += 30) {
      const slotTime = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
      const found = availableSlots.find(s => s.start_time === slotTime);
      if (found) {
        neededSlots.push(found.id);
      }
    }
  }

  if (neededSlots.length === 0 && availableSlots.length === 0) {
    return res.status(409).json({ error: 'Selected time slot is no longer available' });
  }

  // Create booking
  const booking = await getOne(
    `INSERT INTO bookings (tenant_id, customer_name, customer_email, customer_phone,
       service_ids, service_names, date, start_time, end_time,
       total_price, total_duration, status, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12)
     RETURNING *`,
    [req.tenantId, customerName, customerEmail, customerPhone || null,
     serviceIds.join(','), serviceNames, date, startTime, endTime,
     totalPrice, totalDuration, notes || null]
  );

  // Mark time slots as unavailable
  if (neededSlots.length > 0) {
    const slotPlaceholders = neededSlots.map((_, i) => `$${i + 1}`).join(',');
    await run(
      `UPDATE time_slots SET is_available = FALSE WHERE id IN (${slotPlaceholders})`,
      neededSlots
    );
  } else {
    // Fallback: mark by time range
    await run(
      `UPDATE time_slots SET is_available = FALSE
       WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
      [req.tenantId, date, startTime, endTime]
    );
  }

  // Upsert customer and get customer_id
  const customer = await getOne(
    `INSERT INTO customers (tenant_id, name, email, phone)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, email) DO UPDATE SET
       name = EXCLUDED.name,
       phone = COALESCE(EXCLUDED.phone, customers.phone)
     RETURNING id`,
    [req.tenantId, customerName, customerEmail, customerPhone || null]
  );

  // Link booking to customer
  if (customer) {
    await run('UPDATE bookings SET customer_id = $1 WHERE id = $2', [customer.id, booking.id]);
  }

  // Send email notifications (fire and forget)
  const tenant = req.tenant;
  sendBookingPendingNotification(booking, tenant).catch(err => console.error('Email error:', err));
  sendAdminNewBookingNotification(booking, tenant).catch(err => console.error('Email error:', err));

  res.status(201).json(booking);
}));

// POST /api/t/:tenant/bookings/:id/setup-intent - get Stripe SetupIntent for card-on-file
router.post('/bookings/:id/setup-intent', asyncHandler(async (req, res) => {
  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const result = await createSetupIntent(req.tenant, booking.customer_email);
  if (!result) {
    return res.json({ available: false });
  }

  res.json({
    available: true,
    clientSecret: result.clientSecret,
    stripePublishableKey: req.tenant.stripe_publishable_key || null,
  });
}));

// POST /api/t/:tenant/bookings/:id/save-card - save payment method after SetupIntent completes
router.post('/bookings/:id/save-card', asyncHandler(async (req, res) => {
  const { paymentMethodId } = req.body;
  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // Save the payment method to the customer record
  const customer = await getOne(
    'SELECT id, stripe_customer_id FROM customers WHERE tenant_id = $1 AND email = $2',
    [req.tenantId, booking.customer_email]
  );

  if (customer) {
    await run(
      'UPDATE customers SET stripe_payment_method_id = $1 WHERE id = $2',
      [paymentMethodId, customer.id]
    );
  }

  // Record payment entry
  await run(
    `INSERT INTO payments (tenant_id, booking_id, amount, payment_method, payment_status, stripe_payment_method_id)
     VALUES ($1, $2, $3, 'card_on_file', 'card_saved', $4)`,
    [req.tenantId, booking.id, booking.total_price, paymentMethodId]
  );

  res.json({ success: true });
}));

// POST /api/t/:tenant/bookings/:id/payment - process card payment
router.post('/bookings/:id/payment', asyncHandler(async (req, res) => {
  const { createPaymentIntent } = require('../utils/stripeService');

  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  const result = await createPaymentIntent(
    req.tenant,
    parseFloat(booking.total_price),
    booking.customer_email,
    { booking_id: booking.id.toString() }
  );

  if (!result) {
    return res.json({ available: false });
  }

  // Record payment
  await run(
    `INSERT INTO payments (tenant_id, booking_id, amount, payment_method, payment_status, stripe_payment_id)
     VALUES ($1, $2, $3, 'card', 'pending', $4)`,
    [req.tenantId, booking.id, booking.total_price, result.paymentIntentId]
  );

  res.json({
    available: true,
    clientSecret: result.clientSecret,
    stripePublishableKey: req.tenant.stripe_publishable_key || null,
  });
}));

module.exports = router;
