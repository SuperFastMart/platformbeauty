const router = require('express').Router({ mergeParams: true });
const { getOne, getAll, run } = require('../config/database');
const { resolveTenant } = require('../middleware/auth');
const {
  sendBookingPendingNotification, sendAdminNewBookingNotification,
} = require('../utils/emailService');
const { createSetupIntent, createDepositIntent, verifyPaymentIntent } = require('../utils/stripeService');

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

// GET /api/t/:tenant/services - active services grouped by category (excludes add-ons)
router.get('/services', asyncHandler(async (req, res) => {
  const services = await getAll(
    `SELECT id, name, description, duration, price, category, display_order
     FROM services
     WHERE tenant_id = $1 AND active = TRUE AND (is_addon = FALSE OR is_addon IS NULL)
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

// GET /api/t/:tenant/addon-links - all add-on links with full addon service details
router.get('/addon-links', asyncHandler(async (req, res) => {
  const links = await getAll(
    `SELECT sal.parent_service_id, sal.addon_service_id, sal.display_order,
       s.id, s.name, s.description, s.duration, s.price, s.category
     FROM service_addon_links sal
     JOIN services s ON s.id = sal.addon_service_id AND s.active = TRUE
     WHERE sal.tenant_id = $1
     ORDER BY sal.display_order, s.name`,
    [req.tenantId]
  );
  res.json(links);
}));

// GET /api/t/:tenant/addon-services - all add-on services
router.get('/addon-services', asyncHandler(async (req, res) => {
  const addons = await getAll(
    `SELECT id, name, description, duration, price, category
     FROM services
     WHERE tenant_id = $1 AND active = TRUE AND is_addon = TRUE
     ORDER BY name`,
    [req.tenantId]
  );
  res.json(addons);
}));

// GET /api/t/:tenant/tip/:token — validate tip token and return booking info
router.get('/tip/:token', asyncHandler(async (req, res) => {
  const jwt = require('jsonwebtoken');
  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    if (decoded.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const booking = await getOne(
      `SELECT b.id, b.customer_name, b.service_names, b.date, b.total_price, b.tip_amount
       FROM bookings b
       WHERE b.id = $1 AND b.tenant_id = $2 AND b.status = 'completed'`,
      [decoded.bookingId, req.tenantId]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (parseFloat(booking.tip_amount) > 0) {
      return res.json({ alreadyTipped: true, booking });
    }

    const tenant = await getOne('SELECT name, stripe_publishable_key FROM tenants WHERE id = $1', [req.tenantId]);
    res.json({ booking, tenantName: tenant.name, stripePublishableKey: tenant.stripe_publishable_key });
  } catch (err) {
    return res.status(400).json({ error: 'Invalid or expired link' });
  }
}));

// POST /api/t/:tenant/tip/:token — create a payment intent for the tip
router.post('/tip/:token', asyncHandler(async (req, res) => {
  const jwt = require('jsonwebtoken');
  const { amount } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Tip amount must be greater than zero' });
  }

  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    if (decoded.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const booking = await getOne(
      "SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2 AND status = 'completed'",
      [decoded.bookingId, req.tenantId]
    );
    if (!booking) return res.status(404).json({ error: 'Booking not found' });
    if (parseFloat(booking.tip_amount) > 0) {
      return res.status(400).json({ error: 'A tip has already been left for this booking' });
    }

    const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
    if (!tenant.stripe_secret_key) {
      return res.status(400).json({ error: 'Online payments are not configured' });
    }

    const stripe = require('stripe')(tenant.stripe_secret_key);
    const tipPence = Math.round(parseFloat(amount) * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: tipPence,
      currency: 'gbp',
      metadata: {
        type: 'tip',
        booking_id: booking.id.toString(),
        tenant_id: req.tenantId.toString(),
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Invalid or expired link' });
    }
    throw err;
  }
}));

// POST /api/t/:tenant/tip/:token/confirm — confirm tip payment
router.post('/tip/:token/confirm', asyncHandler(async (req, res) => {
  const jwt = require('jsonwebtoken');

  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    if (decoded.tenantId !== req.tenantId) {
      return res.status(403).json({ error: 'Invalid token' });
    }

    const { amount } = req.body;
    const tipAmount = Math.round(parseFloat(amount) * 100) / 100;

    await run(
      'UPDATE bookings SET tip_amount = $1 WHERE id = $2 AND tenant_id = $3',
      [tipAmount, decoded.bookingId, req.tenantId]
    );

    res.json({ success: true });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Invalid or expired link' });
    }
    throw err;
  }
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

// GET /api/t/:tenant/next-available — find the next available slot for given services
router.get('/next-available', asyncHandler(async (req, res) => {
  const { serviceIds, from } = req.query;

  if (!serviceIds) {
    return res.status(400).json({ error: 'serviceIds query parameter is required' });
  }

  const ids = serviceIds.split(',').map(Number).filter(Boolean);
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Invalid serviceIds' });
  }

  // Get total duration needed
  const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
  const services = await getAll(
    `SELECT duration FROM services WHERE id IN (${placeholders}) AND tenant_id = $1 AND active = TRUE`,
    [req.tenantId, ...ids]
  );

  if (services.length === 0) {
    return res.status(400).json({ error: 'No valid services found' });
  }

  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);

  // Get actual slot duration from existing slots instead of hardcoding 30
  const sampleSlot = await getOne(
    `SELECT start_time, end_time FROM time_slots
     WHERE tenant_id = $1 AND date >= CURRENT_DATE AND is_available = TRUE
     ORDER BY date, start_time LIMIT 1`,
    [req.tenantId]
  );
  let slotMinutes = 30;
  if (sampleSlot && sampleSlot.start_time && sampleSlot.end_time) {
    const st = sampleSlot.start_time.split(':').map(Number);
    const et = sampleSlot.end_time.split(':').map(Number);
    slotMinutes = (et[0] * 60 + et[1]) - (st[0] * 60 + st[1]);
    if (slotMinutes <= 0) slotMinutes = 30;
  }
  const slotsNeeded = Math.ceil(totalDuration / slotMinutes);

  const startDate = from || new Date().toISOString().split('T')[0];

  // Scan up to 30 days ahead
  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dateStr = checkDate.toISOString().split('T')[0];

    // Skip past dates
    const today = new Date().toISOString().split('T')[0];
    if (dateStr < today) continue;

    const slots = await getAll(
      `SELECT id, start_time, end_time FROM time_slots
       WHERE tenant_id = $1 AND date = $2 AND is_available = TRUE
       ORDER BY start_time`,
      [req.tenantId, dateStr]
    );

    // Find consecutive slots that cover the needed duration
    for (let i = 0; i <= slots.length - slotsNeeded; i++) {
      let consecutive = true;
      const candidateSlots = [slots[i]];

      for (let j = 1; j < slotsNeeded; j++) {
        const nextSlot = slots[i + j];
        const prevSlot = slots[i + j - 1];

        // Check slots are consecutive (previous end_time === next start_time)
        if (prevSlot.end_time !== nextSlot.start_time) {
          consecutive = false;
          break;
        }
        candidateSlots.push(nextSlot);
      }

      if (consecutive) {
        return res.json({
          found: true,
          date: dateStr,
          time: slots[i].start_time.slice(0, 5),
          slotIds: candidateSlots.map(s => s.id),
        });
      }
    }
  }

  res.json({ found: false, message: 'No available slots found in the next 30 days' });
}));

// POST /api/t/:tenant/bookings - create a booking
const { bookingLimiter } = require('../middleware/rateLimit');
router.post('/bookings', bookingLimiter, asyncHandler(async (req, res) => {
  const { customerName, customerEmail, customerPhone, serviceIds, date, startTime, notes, discountCode, depositPaymentIntentId, intakeResponses, bookingSource, tipAmount, giftCardCode, customerPackageId } = req.body;

  if (!customerName || !customerEmail || !serviceIds?.length || !date || !startTime) {
    return res.status(400).json({
      error: 'customerName, customerEmail, serviceIds, date, and startTime are required'
    });
  }

  // Enforce plan booking limit
  const tenantRecord = await getOne('SELECT subscription_tier FROM tenants WHERE id = $1', [req.tenantId]);
  const plan = await getOne(
    'SELECT max_bookings_per_month FROM subscription_plans WHERE tier = $1 AND is_active = TRUE',
    [tenantRecord?.subscription_tier || 'free']
  );
  if (plan?.max_bookings_per_month) {
    const { count } = await getOne(
      `SELECT COUNT(*)::int AS count FROM bookings
       WHERE tenant_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)`,
      [req.tenantId]
    );
    if (count >= plan.max_bookings_per_month) {
      return res.status(403).json({
        error: 'This business has reached their monthly booking limit. Please contact them directly.',
        code: 'PLAN_LIMIT_REACHED',
      });
    }
  }

  if (customerPhone) {
    const cleanPhone = customerPhone.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }
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
  const subtotal = services.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
  const serviceNames = services.map(s => s.name).join(', ');

  // Validate discount code if provided
  let discountAmount = 0;
  let discountCodeId = null;
  if (discountCode) {
    const dc = await getOne(
      'SELECT * FROM discount_codes WHERE tenant_id = $1 AND code = $2 AND active = TRUE',
      [req.tenantId, discountCode.toUpperCase()]
    );
    if (dc) {
      const notExpired = !dc.expires_at || new Date(dc.expires_at) > new Date();
      const notMaxed = !dc.max_uses || dc.uses_count < dc.max_uses;
      const meetsMin = subtotal >= parseFloat(dc.min_spend);
      if (notExpired && notMaxed && meetsMin) {
        discountCodeId = dc.id;
        if (dc.discount_type === 'percentage') {
          discountAmount = Math.round(subtotal * (parseFloat(dc.discount_value) / 100) * 100) / 100;
        } else {
          discountAmount = Math.min(parseFloat(dc.discount_value), subtotal);
        }
        // Increment uses
        await run('UPDATE discount_codes SET uses_count = uses_count + 1 WHERE id = $1', [dc.id]);
      }
    }
  }

  const totalPrice = subtotal - discountAmount;

  // Validate and apply gift card
  let giftCardId = null;
  let giftCardAmount = 0;
  if (giftCardCode) {
    const giftCard = await getOne(
      "SELECT id, remaining_balance, expires_at FROM gift_cards WHERE tenant_id = $1 AND code = $2 AND status = 'active'",
      [req.tenantId, giftCardCode.toUpperCase().trim()]
    );
    if (giftCard) {
      const notExpired = !giftCard.expires_at || new Date(giftCard.expires_at) > new Date();
      if (notExpired && parseFloat(giftCard.remaining_balance) > 0) {
        giftCardAmount = Math.min(parseFloat(giftCard.remaining_balance), totalPrice);
        giftCardAmount = Math.round(giftCardAmount * 100) / 100;
        giftCardId = giftCard.id;
      }
    }
  }

  // Validate package session usage
  let validPackageId = null;
  let packageCoveredPrice = 0;
  if (customerPackageId) {
    const cp = await getOne(
      "SELECT cp.*, sp.session_count FROM customer_packages cp JOIN service_packages sp ON sp.id = cp.package_id WHERE cp.id = $1 AND cp.tenant_id = $2 AND cp.status = 'active' AND cp.sessions_remaining > 0 AND cp.expires_at > NOW()",
      [customerPackageId, req.tenantId]
    );
    if (cp) {
      // Verify package covers at least one of the selected services
      const packageServices = await getAll(
        'SELECT service_id FROM package_services WHERE package_id = $1',
        [cp.package_id]
      );
      const packageServiceIds = packageServices.map(ps => ps.service_id);
      const covered = serviceIds.some(id => packageServiceIds.includes(id));
      if (covered) {
        validPackageId = cp.id;
        packageCoveredPrice = totalPrice; // Package covers full session
      }
    }
  }

  // Calculate deposit amount from services
  let depositAmount = 0;
  let depositRequired = false;
  for (const svc of services) {
    if (svc.deposit_enabled) {
      depositRequired = true;
      if (svc.deposit_type === 'percentage') {
        depositAmount += parseFloat(svc.price) * (parseFloat(svc.deposit_value) / 100);
      } else {
        depositAmount += parseFloat(svc.deposit_value);
      }
    }
  }
  depositAmount = Math.round(depositAmount * 100) / 100;

  // If deposit required, verify payment was made
  let depositStatus = 'none';
  if (depositRequired && depositAmount > 0) {
    if (depositPaymentIntentId) {
      const pi = await verifyPaymentIntent(req.tenant, depositPaymentIntentId);
      if (!pi || pi.status !== 'succeeded') {
        return res.status(400).json({ error: 'Deposit payment has not been completed' });
      }
      depositStatus = 'paid';
    } else {
      // No deposit payment — only allowed for admin-created bookings (checked by caller)
      depositStatus = 'pending';
    }
  }

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

  // Determine booking source
  let resolvedSource = bookingSource || 'direct';
  if (!bookingSource || bookingSource === 'direct') {
    // Check if returning customer
    const existingBooking = await getOne(
      'SELECT id FROM bookings WHERE tenant_id = $1 AND customer_email = $2 LIMIT 1',
      [req.tenantId, customerEmail]
    );
    if (existingBooking) resolvedSource = 'returning';
  }

  // Validate tip
  const validTip = tipAmount && parseFloat(tipAmount) > 0 ? Math.round(parseFloat(tipAmount) * 100) / 100 : 0;

  // Create booking
  const booking = await getOne(
    `INSERT INTO bookings (tenant_id, customer_name, customer_email, customer_phone,
       service_ids, service_names, date, start_time, end_time,
       total_price, total_duration, status, notes, discount_code_id, discount_amount,
       deposit_amount, deposit_status, deposit_payment_intent_id, intake_responses, booking_source, tip_amount,
       gift_card_id, gift_card_amount, customer_package_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
     RETURNING *`,
    [req.tenantId, customerName, customerEmail, customerPhone || null,
     serviceIds.join(','), serviceNames, date, startTime, endTime,
     validPackageId ? 0 : totalPrice, totalDuration, notes || null, discountCodeId, discountAmount,
     depositAmount, depositStatus, depositPaymentIntentId || null,
     intakeResponses ? JSON.stringify(intakeResponses) : null, resolvedSource, validTip,
     giftCardId, giftCardAmount, validPackageId]
  );

  // Deduct gift card balance atomically
  if (giftCardId && giftCardAmount > 0) {
    const deducted = await getOne(
      `UPDATE gift_cards SET remaining_balance = remaining_balance - $1
       WHERE id = $2 AND remaining_balance >= $1
       RETURNING id, remaining_balance`,
      [giftCardAmount, giftCardId]
    );
    if (deducted) {
      await run(
        `INSERT INTO gift_card_transactions (tenant_id, gift_card_id, booking_id, amount, transaction_type, balance_after)
         VALUES ($1, $2, $3, $4, 'redemption', $5)`,
        [req.tenantId, giftCardId, booking.id, giftCardAmount, parseFloat(deducted.remaining_balance)]
      );
      // Mark as redeemed if balance is zero
      if (parseFloat(deducted.remaining_balance) <= 0) {
        await run("UPDATE gift_cards SET status = 'redeemed' WHERE id = $1", [giftCardId]);
      }
    }
  }

  // Deduct package session atomically
  if (validPackageId) {
    const deducted = await getOne(
      `UPDATE customer_packages SET sessions_remaining = sessions_remaining - 1, sessions_used = sessions_used + 1
       WHERE id = $1 AND sessions_remaining > 0
       RETURNING id, sessions_remaining`,
      [validPackageId]
    );
    if (deducted) {
      await run(
        'INSERT INTO package_usage (customer_package_id, booking_id, used_at) VALUES ($1, $2, NOW())',
        [validPackageId, booking.id]
      );
      if (deducted.sessions_remaining <= 0) {
        await run("UPDATE customer_packages SET status = 'exhausted' WHERE id = $1", [validPackageId]);
      }
    }
  }

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

  // Record discount code usage
  if (discountCodeId && customer) {
    await run(
      `INSERT INTO discount_code_uses (tenant_id, discount_code_id, booking_id, customer_id, discount_amount)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.tenantId, discountCodeId, booking.id, customer.id, discountAmount]
    );
  }

  // Send email notifications (fire and forget)
  const tenant = req.tenant;
  sendBookingPendingNotification(booking, tenant).catch(err => console.error('Email error:', err));
  sendAdminNewBookingNotification(booking, tenant).catch(err => console.error('Email error:', err));

  // Activity log
  const { logActivity } = require('../utils/activityLog');
  logActivity(req.tenantId, 'customer', customer?.id, customerEmail, 'booking_created', { booking_id: booking.id, services: serviceNames, date, time: startTime });

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

// POST /api/t/:tenant/deposit-intent — create a Stripe PaymentIntent for deposit
router.post('/deposit-intent', asyncHandler(async (req, res) => {
  const { serviceIds, customerEmail } = req.body;

  if (!serviceIds?.length || !customerEmail) {
    return res.status(400).json({ error: 'serviceIds and customerEmail are required' });
  }

  const placeholders = serviceIds.map((_, i) => `$${i + 2}`).join(',');
  const services = await getAll(
    `SELECT * FROM services WHERE id IN (${placeholders}) AND tenant_id = $1 AND active = TRUE`,
    [req.tenantId, ...serviceIds]
  );

  let depositAmount = 0;
  for (const svc of services) {
    if (svc.deposit_enabled) {
      if (svc.deposit_type === 'percentage') {
        depositAmount += parseFloat(svc.price) * (parseFloat(svc.deposit_value) / 100);
      } else {
        depositAmount += parseFloat(svc.deposit_value);
      }
    }
  }
  depositAmount = Math.round(depositAmount * 100) / 100;

  if (depositAmount <= 0) {
    return res.json({ required: false, depositAmount: 0 });
  }

  const serviceNames = services.filter(s => s.deposit_enabled).map(s => s.name).join(', ');
  const result = await createDepositIntent(req.tenant, depositAmount, customerEmail, {
    services: serviceNames,
  });

  if (!result) {
    return res.json({ required: true, depositAmount, available: false });
  }

  res.json({
    required: true,
    depositAmount,
    available: true,
    clientSecret: result.clientSecret,
    paymentIntentId: result.paymentIntentId,
    stripePublishableKey: req.tenant.stripe_publishable_key || null,
  });
}));

// GET /api/t/:tenant/intake-questions — fetch active intake questions for given services
router.get('/intake-questions', asyncHandler(async (req, res) => {
  const serviceIdsParam = req.query.serviceIds;
  if (!serviceIdsParam) {
    return res.json([]);
  }

  const serviceIds = serviceIdsParam.split(',').map(Number).filter(n => !isNaN(n));
  if (serviceIds.length === 0) {
    return res.json([]);
  }

  const placeholders = serviceIds.map((_, i) => `$${i + 2}`).join(',');
  const questions = await getAll(
    `SELECT iq.*, s.name as service_name
     FROM intake_questions iq
     JOIN services s ON s.id = iq.service_id AND s.tenant_id = iq.tenant_id
     WHERE iq.tenant_id = $1 AND iq.service_id IN (${placeholders}) AND iq.active = TRUE
     ORDER BY iq.service_id, iq.display_order`,
    [req.tenantId, ...serviceIds]
  );

  res.json(questions);
}));

// POST /api/t/:tenant/waitlist — customer joins waitlist
router.post('/waitlist', asyncHandler(async (req, res) => {
  const { customer_name, customer_email, customer_phone, date, preferred_start_time, preferred_end_time, service_ids, service_names, notes } = req.body;

  if (!customer_name || !customer_email || !date) {
    return res.status(400).json({ error: 'Name, email, and date are required' });
  }

  // Check if already on waitlist for this date
  const existing = await getOne(
    `SELECT id FROM waitlist WHERE tenant_id = $1 AND customer_email = $2 AND date = $3 AND status = 'waiting'`,
    [req.tenantId, customer_email, date]
  );
  if (existing) {
    return res.status(409).json({ error: 'You are already on the waitlist for this date' });
  }

  // Look up customer_id if they have an account
  const customer = await getOne(
    'SELECT id FROM customers WHERE tenant_id = $1 AND email = $2',
    [req.tenantId, customer_email]
  );

  const entry = await getOne(
    `INSERT INTO waitlist (tenant_id, customer_name, customer_email, customer_phone, customer_id, date, preferred_start_time, preferred_end_time, service_ids, service_names, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [req.tenantId, customer_name, customer_email, customer_phone || null, customer?.id || null,
     date, preferred_start_time || null, preferred_end_time || null,
     service_ids || null, service_names || null, notes || null]
  );

  res.status(201).json(entry);
}));

module.exports = router;
