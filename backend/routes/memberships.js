const adminRouter = require('express').Router();
const publicRouter = require('express').Router({ mergeParams: true });
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/auth');
const { customerAuth } = require('../middleware/customerAuth');
const { getStripeInstance } = require('../utils/stripeService');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ============================================
// ADMIN ROUTES
// ============================================
adminRouter.use(tenantAuth);

// GET /api/admin/memberships — list all plans
adminRouter.get('/', asyncHandler(async (req, res) => {
  const plans = await getAll(
    `SELECT mp.*,
       (SELECT COUNT(*)::int FROM customer_memberships cm WHERE cm.membership_plan_id = mp.id AND cm.status IN ('active', 'past_due')) as active_subscribers,
       (SELECT json_agg(json_build_object('id', mis.id, 'service_id', mis.service_id, 'category', mis.category, 'sessions_per_month', mis.sessions_per_month, 'service_name', s.name))
        FROM membership_included_services mis LEFT JOIN services s ON s.id = mis.service_id
        WHERE mis.membership_plan_id = mp.id) as included_services
     FROM membership_plans mp
     WHERE mp.tenant_id = $1
     ORDER BY mp.display_order, mp.created_at`,
    [req.user.tenantId]
  );
  res.json(plans);
}));

// POST /api/admin/memberships — create plan (+ Stripe Product/Price)
adminRouter.post('/', asyncHandler(async (req, res) => {
  const { name, description, priceMonthly, includedSessions, discountPercent, priorityBooking, includedServices } = req.body;

  if (!name || !priceMonthly) {
    return res.status(400).json({ error: 'Name and monthly price are required' });
  }

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.user.tenantId]);
  let stripeProductId = null;
  let stripePriceId = null;

  // Create Stripe Product + Price if Stripe is configured
  if (tenant.stripe_secret_key) {
    const stripe = require('stripe')(tenant.stripe_secret_key);

    const product = await stripe.products.create({
      name: `${name} Membership`,
      description: description || undefined,
      metadata: { tenant_id: req.user.tenantId.toString(), type: 'membership' },
    });
    stripeProductId = product.id;

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(parseFloat(priceMonthly) * 100),
      currency: 'gbp',
      recurring: { interval: 'month' },
    });
    stripePriceId = price.id;
  }

  const plan = await getOne(
    `INSERT INTO membership_plans (tenant_id, name, description, price_monthly, included_sessions, discount_percent, priority_booking, stripe_product_id, stripe_price_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [req.user.tenantId, name, description || null, parseFloat(priceMonthly),
     includedSessions || 0, discountPercent || 0, priorityBooking || false,
     stripeProductId, stripePriceId]
  );

  // Add included services
  if (includedServices?.length > 0) {
    for (const svc of includedServices) {
      await run(
        'INSERT INTO membership_included_services (membership_plan_id, service_id, category, sessions_per_month) VALUES ($1, $2, $3, $4)',
        [plan.id, svc.serviceId || null, svc.category || null, svc.sessionsPerMonth || 1]
      );
    }
  }

  res.status(201).json(plan);
}));

// PUT /api/admin/memberships/:id — update plan
adminRouter.put('/:id', asyncHandler(async (req, res) => {
  const { name, description, includedSessions, discountPercent, priorityBooking, active, includedServices } = req.body;

  const plan = await getOne(
    `UPDATE membership_plans SET
       name = COALESCE($1, name), description = COALESCE($2, description),
       included_sessions = COALESCE($3, included_sessions), discount_percent = COALESCE($4, discount_percent),
       priority_booking = COALESCE($5, priority_booking), active = COALESCE($6, active)
     WHERE id = $7 AND tenant_id = $8
     RETURNING *`,
    [name, description, includedSessions, discountPercent, priorityBooking, active, req.params.id, req.user.tenantId]
  );
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  // Update included services if provided
  if (includedServices) {
    await run('DELETE FROM membership_included_services WHERE membership_plan_id = $1', [req.params.id]);
    for (const svc of includedServices) {
      await run(
        'INSERT INTO membership_included_services (membership_plan_id, service_id, category, sessions_per_month) VALUES ($1, $2, $3, $4)',
        [req.params.id, svc.serviceId || null, svc.category || null, svc.sessionsPerMonth || 1]
      );
    }
  }

  res.json(plan);
}));

// DELETE /api/admin/memberships/:id
adminRouter.delete('/:id', asyncHandler(async (req, res) => {
  const plan = await getOne(
    'SELECT id, stripe_product_id FROM membership_plans WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.user.tenantId]
  );
  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  // Check for active subscribers
  const activeSubs = await getOne(
    "SELECT COUNT(*)::int as count FROM customer_memberships WHERE membership_plan_id = $1 AND status IN ('active', 'past_due')",
    [req.params.id]
  );
  if (activeSubs.count > 0) {
    return res.status(400).json({ error: 'Cannot delete a plan with active subscribers. Deactivate it instead.' });
  }

  await run('DELETE FROM membership_included_services WHERE membership_plan_id = $1', [req.params.id]);
  await run('DELETE FROM membership_plans WHERE id = $1 AND tenant_id = $2', [req.params.id, req.user.tenantId]);
  res.json({ success: true });
}));

// GET /api/admin/memberships/:id/subscribers
adminRouter.get('/:id/subscribers', asyncHandler(async (req, res) => {
  const subscribers = await getAll(
    `SELECT cm.*, c.name, c.email
     FROM customer_memberships cm
     JOIN customers c ON c.id = cm.customer_id
     WHERE cm.membership_plan_id = $1 AND cm.tenant_id = $2
     ORDER BY cm.created_at DESC`,
    [req.params.id, req.user.tenantId]
  );
  res.json(subscribers);
}));

// GET /api/admin/memberships/stats — overview stats
adminRouter.get('/all/stats', asyncHandler(async (req, res) => {
  const stats = await getOne(
    `SELECT
       (SELECT COUNT(*)::int FROM membership_plans WHERE tenant_id = $1 AND active = TRUE) as active_plans,
       (SELECT COUNT(*)::int FROM customer_memberships WHERE tenant_id = $1 AND status = 'active') as active_members,
       (SELECT COALESCE(SUM(mp.price_monthly), 0) FROM customer_memberships cm JOIN membership_plans mp ON mp.id = cm.membership_plan_id WHERE cm.tenant_id = $1 AND cm.status = 'active') as monthly_revenue,
       (SELECT COUNT(*)::int FROM customer_memberships WHERE tenant_id = $1 AND status = 'past_due') as past_due
    `,
    [req.user.tenantId]
  );
  res.json(stats);
}));

// ============================================
// PUBLIC ROUTES
// ============================================
publicRouter.use(resolveTenant);

// GET /api/t/:tenant/memberships — list active plans
publicRouter.get('/', asyncHandler(async (req, res) => {
  const plans = await getAll(
    `SELECT mp.id, mp.name, mp.description, mp.price_monthly, mp.included_sessions, mp.discount_percent, mp.priority_booking,
       (SELECT json_agg(json_build_object('service_id', mis.service_id, 'category', mis.category, 'sessions_per_month', mis.sessions_per_month, 'service_name', s.name))
        FROM membership_included_services mis LEFT JOIN services s ON s.id = mis.service_id
        WHERE mis.membership_plan_id = mp.id) as included_services
     FROM membership_plans mp
     WHERE mp.tenant_id = $1 AND mp.active = TRUE
     ORDER BY mp.display_order, mp.price_monthly`,
    [req.tenantId]
  );
  res.json(plans);
}));

// POST /api/t/:tenant/memberships/:planId/subscribe — create Stripe subscription
publicRouter.post('/:planId/subscribe', customerAuth, asyncHandler(async (req, res) => {
  const plan = await getOne(
    'SELECT * FROM membership_plans WHERE id = $1 AND tenant_id = $2 AND active = TRUE',
    [req.params.planId, req.tenantId]
  );
  if (!plan) return res.status(404).json({ error: 'Membership plan not found' });
  if (!plan.stripe_price_id) return res.status(400).json({ error: 'This plan is not configured for online payments' });

  // Check if customer already has an active membership
  const existing = await getOne(
    "SELECT id FROM customer_memberships WHERE tenant_id = $1 AND customer_id = $2 AND status IN ('active', 'past_due')",
    [req.tenantId, req.customer.id]
  );
  if (existing) return res.status(400).json({ error: 'You already have an active membership' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant.stripe_secret_key) return res.status(400).json({ error: 'Online payments are not configured' });

  const stripe = require('stripe')(tenant.stripe_secret_key);

  // Get or create Stripe customer
  let stripeCustomerId = req.customer.stripe_customer_id;
  if (!stripeCustomerId) {
    const stripeCustomer = await stripe.customers.create({
      email: req.customer.email,
      name: req.customer.name,
      metadata: { tenant_id: req.tenantId.toString(), customer_id: req.customer.id.toString() },
    });
    stripeCustomerId = stripeCustomer.id;
    await run('UPDATE customers SET stripe_customer_id = $1 WHERE id = $2', [stripeCustomerId, req.customer.id]);
  }

  // Create subscription with incomplete payment
  const subscription = await stripe.subscriptions.create({
    customer: stripeCustomerId,
    items: [{ price: plan.stripe_price_id }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
    metadata: {
      tenant_id: req.tenantId.toString(),
      customer_id: req.customer.id.toString(),
      plan_id: plan.id.toString(),
    },
  });

  // Create membership record (pending until payment succeeds)
  await getOne(
    `INSERT INTO customer_memberships (tenant_id, customer_id, membership_plan_id, stripe_subscription_id, stripe_customer_id, status, current_period_start, current_period_end)
     VALUES ($1, $2, $3, $4, $5, 'active', NOW(), NOW() + INTERVAL '1 month')
     RETURNING *`,
    [req.tenantId, req.customer.id, plan.id, subscription.id, stripeCustomerId]
  );

  const clientSecret = subscription.latest_invoice?.payment_intent?.client_secret;

  res.json({
    subscriptionId: subscription.id,
    clientSecret,
  });
}));

// POST /api/t/:tenant/memberships/cancel — cancel membership
publicRouter.post('/cancel', customerAuth, asyncHandler(async (req, res) => {
  const membership = await getOne(
    "SELECT cm.*, mp.name as plan_name FROM customer_memberships cm JOIN membership_plans mp ON mp.id = cm.membership_plan_id WHERE cm.tenant_id = $1 AND cm.customer_id = $2 AND cm.status IN ('active', 'past_due')",
    [req.tenantId, req.customer.id]
  );
  if (!membership) return res.status(404).json({ error: 'No active membership found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (tenant.stripe_secret_key && membership.stripe_subscription_id) {
    const stripe = require('stripe')(tenant.stripe_secret_key);
    await stripe.subscriptions.update(membership.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  }

  await run(
    "UPDATE customer_memberships SET cancel_at_period_end = TRUE, status = 'cancelling' WHERE id = $1",
    [membership.id]
  );

  res.json({ success: true, message: 'Membership will be cancelled at the end of the current billing period' });
}));

// GET /api/t/:tenant/memberships/my-membership — customer's current membership
publicRouter.get('/my-membership', customerAuth, asyncHandler(async (req, res) => {
  const membership = await getOne(
    `SELECT cm.*, mp.name as plan_name, mp.price_monthly, mp.included_sessions, mp.discount_percent, mp.priority_booking
     FROM customer_memberships cm
     JOIN membership_plans mp ON mp.id = cm.membership_plan_id
     WHERE cm.tenant_id = $1 AND cm.customer_id = $2 AND cm.status IN ('active', 'past_due', 'cancelling')
     ORDER BY cm.created_at DESC LIMIT 1`,
    [req.tenantId, req.customer.id]
  );
  res.json(membership || null);
}));

// ============================================
// WEBHOOK HANDLER (called from server.js with raw body)
// ============================================
async function handleTenantStripeWebhook(req, res) {
  const { tenantId } = req.params;

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [tenantId]);
  if (!tenant || !tenant.stripe_secret_key) {
    return res.status(404).json({ error: 'Tenant not found' });
  }

  const stripe = require('stripe')(tenant.stripe_secret_key);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    if (tenant.stripe_webhook_secret) {
      event = stripe.webhooks.constructEvent(req.body, sig, tenant.stripe_webhook_secret);
    } else {
      // If no webhook secret configured, parse event directly (less secure)
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error(`[Webhook] Signature verification failed for tenant ${tenantId}:`, err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  try {
    switch (event.type) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        const membership = await getOne(
          'SELECT * FROM customer_memberships WHERE stripe_subscription_id = $1 AND tenant_id = $2',
          [subscriptionId, parseInt(tenantId)]
        );
        if (membership) {
          // Reset sessions for new billing period
          await run(
            `UPDATE customer_memberships SET
               status = 'active', sessions_used_this_period = 0,
               current_period_start = to_timestamp($1), current_period_end = to_timestamp($2)
             WHERE id = $3`,
            [invoice.period_start, invoice.period_end, membership.id]
          );
          console.log(`[Webhook] Membership ${membership.id} renewed for tenant ${tenantId}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        await run(
          "UPDATE customer_memberships SET status = 'past_due' WHERE stripe_subscription_id = $1 AND tenant_id = $2",
          [subscriptionId, parseInt(tenantId)]
        );
        console.log(`[Webhook] Membership payment failed for subscription ${subscriptionId}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        await run(
          "UPDATE customer_memberships SET status = 'cancelled', cancelled_at = NOW() WHERE stripe_subscription_id = $1 AND tenant_id = $2",
          [subscription.id, parseInt(tenantId)]
        );
        console.log(`[Webhook] Membership cancelled: subscription ${subscription.id}`);
        break;
      }
    }
  } catch (err) {
    console.error(`[Webhook] Error processing event for tenant ${tenantId}:`, err);
  }

  res.json({ received: true });
}

module.exports = { adminRouter, publicRouter, handleTenantStripeWebhook };
