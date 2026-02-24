const adminRouter = require('express').Router();
const publicRouter = require('express').Router({ mergeParams: true });
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

function generateGiftCardCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// ============================================
// ADMIN ROUTES (tenantAuth)
// ============================================
adminRouter.use(tenantAuth);

// GET /api/admin/gift-cards — list all gift cards
adminRouter.get('/', asyncHandler(async (req, res) => {
  const cards = await getAll(
    `SELECT gc.*,
       (SELECT COUNT(*)::int FROM gift_card_transactions gct WHERE gct.gift_card_id = gc.id) as transaction_count
     FROM gift_cards gc
     WHERE gc.tenant_id = $1
     ORDER BY gc.created_at DESC`,
    [req.user.tenantId]
  );
  res.json(cards);
}));

// GET /api/admin/gift-cards/stats — summary stats
adminRouter.get('/stats', asyncHandler(async (req, res) => {
  const stats = await getOne(
    `SELECT
       COUNT(*)::int as total_cards,
       COUNT(*) FILTER (WHERE status = 'active')::int as active_cards,
       COALESCE(SUM(initial_balance), 0) as total_sold,
       COALESCE(SUM(initial_balance - remaining_balance), 0) as total_redeemed,
       COALESCE(SUM(remaining_balance) FILTER (WHERE status = 'active'), 0) as outstanding_balance
     FROM gift_cards WHERE tenant_id = $1`,
    [req.user.tenantId]
  );
  res.json(stats);
}));

// POST /api/admin/gift-cards — create a gift card
adminRouter.post('/', asyncHandler(async (req, res) => {
  const { initialBalance, senderName, senderEmail, recipientName, recipientEmail, message, expiresAt } = req.body;

  if (!initialBalance || parseFloat(initialBalance) <= 0) {
    return res.status(400).json({ error: 'Initial balance must be greater than 0' });
  }

  let code;
  let attempts = 0;
  do {
    code = generateGiftCardCode();
    const existing = await getOne(
      'SELECT id FROM gift_cards WHERE tenant_id = $1 AND code = $2',
      [req.user.tenantId, code]
    );
    if (!existing) break;
    attempts++;
  } while (attempts < 10);

  const card = await getOne(
    `INSERT INTO gift_cards (tenant_id, code, initial_balance, remaining_balance, sender_name, sender_email, recipient_name, recipient_email, message, expires_at)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [req.user.tenantId, code, parseFloat(initialBalance), senderName || null, senderEmail || null,
     recipientName || null, recipientEmail || null, message || null, expiresAt || null]
  );

  // Create purchase transaction
  await run(
    `INSERT INTO gift_card_transactions (tenant_id, gift_card_id, amount, transaction_type, balance_after)
     VALUES ($1, $2, $3, 'purchase', $3)`,
    [req.user.tenantId, card.id, parseFloat(initialBalance)]
  );

  // Send email to recipient if provided
  if (recipientEmail) {
    try {
      const { sendGiftCardEmail } = require('../utils/emailService');
      const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.user.tenantId]);
      sendGiftCardEmail(recipientEmail, recipientName, code, parseFloat(initialBalance), senderName, message, tenant).catch(() => {});
    } catch (e) { /* email function may not exist */ }
  }

  res.status(201).json(card);
}));

// GET /api/admin/gift-cards/:id — card detail with transactions
adminRouter.get('/:id', asyncHandler(async (req, res) => {
  const card = await getOne(
    'SELECT * FROM gift_cards WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.user.tenantId]
  );
  if (!card) return res.status(404).json({ error: 'Gift card not found' });

  const transactions = await getAll(
    `SELECT gct.*, b.booking_date, b.customer_name
     FROM gift_card_transactions gct
     LEFT JOIN bookings b ON b.id = gct.booking_id
     WHERE gct.gift_card_id = $1 AND gct.tenant_id = $2
     ORDER BY gct.created_at DESC`,
    [req.params.id, req.user.tenantId]
  );
  res.json({ ...card, transactions });
}));

// PUT /api/admin/gift-cards/:id — update status
adminRouter.put('/:id', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['active', 'cancelled', 'expired'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const card = await getOne(
    'UPDATE gift_cards SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
    [status, req.params.id, req.user.tenantId]
  );
  if (!card) return res.status(404).json({ error: 'Gift card not found' });
  res.json(card);
}));

// DELETE /api/admin/gift-cards/:id
adminRouter.delete('/:id', asyncHandler(async (req, res) => {
  const card = await getOne(
    'SELECT id FROM gift_cards WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.user.tenantId]
  );
  if (!card) return res.status(404).json({ error: 'Gift card not found' });

  await run('DELETE FROM gift_card_transactions WHERE gift_card_id = $1', [req.params.id]);
  await run('DELETE FROM gift_cards WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId]);
  res.json({ success: true });
}));

// ============================================
// PUBLIC ROUTES (resolveTenant)
// ============================================
publicRouter.use(resolveTenant);

// POST /api/t/:tenant/gift-cards/validate — check code + balance
publicRouter.post('/validate', asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Gift card code is required' });

  const card = await getOne(
    "SELECT id, code, remaining_balance, status, expires_at FROM gift_cards WHERE tenant_id = $1 AND code = $2 AND status = 'active'",
    [req.tenantId, code.toUpperCase().trim()]
  );
  if (!card) return res.status(404).json({ error: 'Invalid or expired gift card code' });

  if (card.expires_at && new Date(card.expires_at) < new Date()) {
    await run("UPDATE gift_cards SET status = 'expired' WHERE id = $1", [card.id]);
    return res.status(400).json({ error: 'This gift card has expired' });
  }
  if (parseFloat(card.remaining_balance) <= 0) {
    return res.status(400).json({ error: 'This gift card has no remaining balance' });
  }

  res.json({
    valid: true,
    remaining_balance: parseFloat(card.remaining_balance),
    code: card.code,
  });
}));

// POST /api/t/:tenant/gift-cards/purchase — initiate Stripe payment for gift card
publicRouter.post('/purchase', asyncHandler(async (req, res) => {
  const { amount, senderName, senderEmail, recipientName, recipientEmail, message } = req.body;

  if (!amount || parseFloat(amount) <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than 0' });
  }
  if (!senderEmail || !recipientEmail) {
    return res.status(400).json({ error: 'Sender and recipient emails are required' });
  }

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant.stripe_secret_key) {
    return res.status(400).json({ error: 'Online payments are not configured for this business' });
  }

  const stripe = require('stripe')(tenant.stripe_secret_key);
  const amountInPence = Math.round(parseFloat(amount) * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountInPence,
    currency: 'gbp',
    metadata: {
      type: 'gift_card_purchase',
      tenant_id: req.tenantId.toString(),
      sender_email: senderEmail,
      recipient_email: recipientEmail,
    },
  });

  const code = generateGiftCardCode();

  res.json({
    clientSecret: paymentIntent.client_secret,
    giftCardCode: code,
    paymentIntentId: paymentIntent.id,
  });
}));

// POST /api/t/:tenant/gift-cards/confirm-purchase — finalise after Stripe payment
publicRouter.post('/confirm-purchase', asyncHandler(async (req, res) => {
  const { paymentIntentId, code, amount, senderName, senderEmail, recipientName, recipientEmail, message } = req.body;

  if (!paymentIntentId || !code || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (tenant.stripe_secret_key) {
    const stripe = require('stripe')(tenant.stripe_secret_key);
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      return res.status(400).json({ error: 'Payment has not been completed' });
    }
  }

  const parsedAmount = parseFloat(amount);
  const card = await getOne(
    `INSERT INTO gift_cards (tenant_id, code, initial_balance, remaining_balance, sender_name, sender_email, recipient_name, recipient_email, message, stripe_payment_intent_id)
     VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [req.tenantId, code, parsedAmount, senderName || null, senderEmail || null,
     recipientName || null, recipientEmail || null, message || null, paymentIntentId]
  );

  await run(
    `INSERT INTO gift_card_transactions (tenant_id, gift_card_id, amount, transaction_type, balance_after)
     VALUES ($1, $2, $3, 'purchase', $3)`,
    [req.tenantId, card.id, parsedAmount]
  );

  // Send gift card email to recipient
  try {
    const { sendGiftCardEmail } = require('../utils/emailService');
    sendGiftCardEmail(recipientEmail, recipientName, code, parsedAmount, senderName, message, tenant).catch(() => {});
  } catch (e) { /* email fn may not exist */ }

  res.json({ success: true, card });
}));

module.exports = { adminRouter, publicRouter };
