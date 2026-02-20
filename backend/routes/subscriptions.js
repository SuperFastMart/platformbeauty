const express = require('express');
const adminRouter = express.Router();
const publicRouter = express.Router();
const platformRouter = express.Router();
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth, platformAuth } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Platform-level Stripe instance (for subscription billing)
function getPlatformStripe() {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  const Stripe = require('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// ============================================
// PUBLIC ROUTES (no auth, for pricing page)
// ============================================

// GET /api/subscriptions/plans — list active plans
publicRouter.get('/plans', asyncHandler(async (req, res) => {
  const plans = await getAll(
    'SELECT id, name, tier, price_monthly, features, max_services, max_bookings_per_month, sms_enabled, display_order FROM subscription_plans WHERE is_active = TRUE ORDER BY display_order'
  );
  res.json(plans);
}));

// ============================================
// TENANT ADMIN ROUTES (behind tenantAuth)
// ============================================
adminRouter.use(tenantAuth);

// GET /api/admin/subscription — current subscription status
adminRouter.get('/', asyncHandler(async (req, res) => {
  const tenant = await getOne(
    `SELECT subscription_tier, subscription_status, trial_ends_at,
            stripe_subscription_id, subscription_price_id, subscription_current_period_end,
            platform_stripe_customer_id
     FROM tenants WHERE id = $1`,
    [req.tenantId]
  );

  const plans = await getAll(
    'SELECT id, name, tier, price_monthly, features, max_services, max_bookings_per_month, sms_enabled, display_order FROM subscription_plans WHERE is_active = TRUE ORDER BY display_order'
  );

  // Get current plan details
  const currentPlan = plans.find(p => p.tier === (tenant.subscription_tier || 'free')) || plans[0];

  // Check if trial has expired
  const trialExpired = tenant.subscription_status === 'trial' && tenant.trial_ends_at && new Date(tenant.trial_ends_at) < new Date();

  res.json({
    current_tier: tenant.subscription_tier || 'free',
    status: trialExpired ? 'trial_expired' : tenant.subscription_status,
    trial_ends_at: tenant.trial_ends_at,
    current_period_end: tenant.subscription_current_period_end,
    stripe_subscription_id: tenant.stripe_subscription_id,
    current_plan: currentPlan,
    plans,
  });
}));

// POST /api/admin/subscription/checkout — create Stripe Checkout session for a plan
adminRouter.post('/checkout', asyncHandler(async (req, res) => {
  const { tier } = req.body;
  const stripe = getPlatformStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const plan = await getOne('SELECT * FROM subscription_plans WHERE tier = $1 AND is_active = TRUE', [tier]);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  if (!plan.stripe_price_id) return res.status(400).json({ error: 'This plan is not available for purchase yet. Platform admin needs to configure Stripe prices.' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);

  // Get or create Stripe customer for this tenant
  let stripeCustomerId = tenant.platform_stripe_customer_id;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create({
      email: tenant.owner_email,
      name: tenant.name,
      metadata: { tenant_id: tenant.id.toString(), tenant_slug: tenant.slug },
    });
    stripeCustomerId = customer.id;
    await run('UPDATE tenants SET platform_stripe_customer_id = $1 WHERE id = $2', [stripeCustomerId, tenant.id]);
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const session = await stripe.checkout.sessions.create({
    customer: stripeCustomerId,
    mode: 'subscription',
    line_items: [{ price: plan.stripe_price_id, quantity: 1 }],
    success_url: `${frontendUrl}/admin/settings?tab=subscription&status=success`,
    cancel_url: `${frontendUrl}/admin/settings?tab=subscription&status=cancelled`,
    metadata: { tenant_id: tenant.id.toString(), tier: plan.tier },
    subscription_data: {
      metadata: { tenant_id: tenant.id.toString(), tier: plan.tier },
    },
  });

  res.json({ url: session.url });
}));

// POST /api/admin/subscription/portal — create Stripe Customer Portal session
adminRouter.post('/portal', asyncHandler(async (req, res) => {
  const stripe = getPlatformStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const tenant = await getOne('SELECT platform_stripe_customer_id FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant?.platform_stripe_customer_id) {
    return res.status(400).json({ error: 'No billing account found. Subscribe to a plan first.' });
  }

  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const session = await stripe.billingPortal.sessions.create({
    customer: tenant.platform_stripe_customer_id,
    return_url: `${frontendUrl}/admin/settings?tab=subscription`,
  });

  res.json({ url: session.url });
}));

// POST /api/admin/subscription/cancel — cancel subscription
adminRouter.post('/cancel', asyncHandler(async (req, res) => {
  const stripe = getPlatformStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const tenant = await getOne('SELECT stripe_subscription_id FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant?.stripe_subscription_id) {
    return res.status(400).json({ error: 'No active subscription found' });
  }

  // Cancel at end of billing period (not immediately)
  await stripe.subscriptions.update(tenant.stripe_subscription_id, {
    cancel_at_period_end: true,
  });

  await run(
    "UPDATE tenants SET subscription_status = 'cancelling' WHERE id = $1",
    [req.tenantId]
  );

  res.json({ success: true, message: 'Subscription will cancel at end of billing period' });
}));

// POST /api/admin/subscription/reactivate — reactivate a cancelling subscription
adminRouter.post('/reactivate', asyncHandler(async (req, res) => {
  const stripe = getPlatformStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const tenant = await getOne('SELECT stripe_subscription_id FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant?.stripe_subscription_id) {
    return res.status(400).json({ error: 'No subscription found' });
  }

  await stripe.subscriptions.update(tenant.stripe_subscription_id, {
    cancel_at_period_end: false,
  });

  await run(
    "UPDATE tenants SET subscription_status = 'active' WHERE id = $1",
    [req.tenantId]
  );

  res.json({ success: true });
}));

// ============================================
// PLATFORM ADMIN ROUTES
// ============================================
platformRouter.use(platformAuth);

// GET /api/platform/subscriptions/plans — list all plans (including inactive)
platformRouter.get('/plans', asyncHandler(async (req, res) => {
  const plans = await getAll('SELECT * FROM subscription_plans ORDER BY display_order');
  res.json(plans);
}));

// PUT /api/platform/subscriptions/plans/:id — update plan (set Stripe IDs, features, etc.)
platformRouter.put('/plans/:id', asyncHandler(async (req, res) => {
  const { name, price_monthly, stripe_product_id, stripe_price_id, features, max_services, max_bookings_per_month, sms_enabled, is_active, display_order } = req.body;

  const plan = await getOne(
    `UPDATE subscription_plans SET
      name = COALESCE($1, name),
      price_monthly = COALESCE($2, price_monthly),
      stripe_product_id = COALESCE($3, stripe_product_id),
      stripe_price_id = COALESCE($4, stripe_price_id),
      features = COALESCE($5, features),
      max_services = $6,
      max_bookings_per_month = $7,
      sms_enabled = COALESCE($8, sms_enabled),
      is_active = COALESCE($9, is_active),
      display_order = COALESCE($10, display_order),
      updated_at = NOW()
     WHERE id = $11
     RETURNING *`,
    [name, price_monthly, stripe_product_id, stripe_price_id,
     features ? JSON.stringify(features) : null,
     max_services !== undefined ? max_services : null,
     max_bookings_per_month !== undefined ? max_bookings_per_month : null,
     sms_enabled, is_active, display_order, req.params.id]
  );

  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  res.json(plan);
}));

// POST /api/platform/subscriptions/sync-stripe — create Stripe Products/Prices from plans
platformRouter.post('/sync-stripe', asyncHandler(async (req, res) => {
  const stripe = getPlatformStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const plans = await getAll('SELECT * FROM subscription_plans WHERE is_active = TRUE AND price_monthly > 0 ORDER BY display_order');
  const results = [];

  for (const plan of plans) {
    let productId = plan.stripe_product_id;
    let priceId = plan.stripe_price_id;

    // Create product if needed
    if (!productId) {
      const product = await stripe.products.create({
        name: `PlatformBeauty - ${plan.name}`,
        description: `${plan.name} subscription plan`,
        metadata: { plan_tier: plan.tier },
      });
      productId = product.id;
    }

    // Create price if needed
    if (!priceId) {
      const price = await stripe.prices.create({
        product: productId,
        unit_amount: Math.round(plan.price_monthly * 100),
        currency: 'gbp',
        recurring: { interval: 'month' },
        metadata: { plan_tier: plan.tier },
      });
      priceId = price.id;
    }

    // Update plan with Stripe IDs
    await run(
      'UPDATE subscription_plans SET stripe_product_id = $1, stripe_price_id = $2, updated_at = NOW() WHERE id = $3',
      [productId, priceId, plan.id]
    );

    results.push({ tier: plan.tier, product_id: productId, price_id: priceId });
  }

  res.json({ synced: results });
}));

// GET /api/platform/subscriptions/overview — subscription stats
platformRouter.get('/overview', asyncHandler(async (req, res) => {
  const byTier = await getAll(
    `SELECT COALESCE(subscription_tier, 'free') as tier, subscription_status as status, COUNT(*)::int as count
     FROM tenants WHERE active = TRUE GROUP BY subscription_tier, subscription_status ORDER BY tier`
  );

  const mrr = await getOne(
    `SELECT COALESCE(SUM(sp.price_monthly), 0)::numeric as total
     FROM tenants t
     JOIN subscription_plans sp ON sp.tier = t.subscription_tier
     WHERE t.subscription_status = 'active' AND t.active = TRUE`
  );

  const trialExpiring = await getAll(
    `SELECT id, name, slug, owner_email, trial_ends_at
     FROM tenants
     WHERE subscription_status = 'trial' AND trial_ends_at < NOW() + INTERVAL '7 days' AND trial_ends_at > NOW()
     ORDER BY trial_ends_at`
  );

  res.json({
    by_tier: byTier,
    mrr: parseFloat(mrr?.total || 0),
    trial_expiring: trialExpiring,
  });
}));

// ============================================
// STRIPE WEBHOOK
// ============================================

// This needs raw body, handled in server.js
async function handleStripeWebhook(req, res) {
  const stripe = getPlatformStripe();
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;
  try {
    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      // In dev, just parse the body
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription') {
        const tenantId = session.metadata?.tenant_id;
        const tier = session.metadata?.tier;
        if (tenantId && tier) {
          await run(
            `UPDATE tenants SET
              subscription_tier = $1,
              subscription_status = 'active',
              stripe_subscription_id = $2,
              platform_stripe_customer_id = $3
             WHERE id = $4`,
            [tier, session.subscription, session.customer, tenantId]
          );

          // Get the price ID from subscription
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          if (subscription.items?.data?.[0]?.price?.id) {
            await run(
              'UPDATE tenants SET subscription_price_id = $1, subscription_current_period_end = to_timestamp($2) WHERE id = $3',
              [subscription.items.data[0].price.id, subscription.current_period_end, tenantId]
            );
          }
        }
      }
      break;
    }

    case 'customer.subscription.updated': {
      const subscription = event.data.object;
      const tenantId = subscription.metadata?.tenant_id;
      if (tenantId) {
        const status = subscription.cancel_at_period_end ? 'cancelling' :
                       subscription.status === 'active' ? 'active' :
                       subscription.status === 'past_due' ? 'past_due' :
                       subscription.status;

        // Find the tier from the price
        const priceId = subscription.items?.data?.[0]?.price?.id;
        let tier = null;
        if (priceId) {
          const plan = await getOne('SELECT tier FROM subscription_plans WHERE stripe_price_id = $1', [priceId]);
          tier = plan?.tier;
        }

        await run(
          `UPDATE tenants SET
            subscription_status = $1,
            subscription_current_period_end = to_timestamp($2)
            ${tier ? ', subscription_tier = $5' : ''}
           WHERE id = $3 AND stripe_subscription_id = $4`,
          tier
            ? [status, subscription.current_period_end, tenantId, subscription.id, tier]
            : [status, subscription.current_period_end, tenantId, subscription.id]
        );
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      const tenantId = subscription.metadata?.tenant_id;
      if (tenantId) {
        await run(
          `UPDATE tenants SET
            subscription_tier = 'free',
            subscription_status = 'cancelled',
            stripe_subscription_id = NULL,
            subscription_price_id = NULL,
            subscription_current_period_end = NULL
           WHERE id = $1`,
          [tenantId]
        );
      }
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const subscriptionId = invoice.subscription;
      if (subscriptionId) {
        await run(
          "UPDATE tenants SET subscription_status = 'past_due' WHERE stripe_subscription_id = $1",
          [subscriptionId]
        );
      }
      break;
    }
  }

  res.json({ received: true });
}

module.exports = { adminRouter, publicRouter, platformRouter, handleStripeWebhook };
