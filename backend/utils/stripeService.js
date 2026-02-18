const { getOne, run } = require('../config/database');

// Get a Stripe instance for a specific tenant
function getStripeInstance(tenant) {
  if (!tenant.stripe_secret_key) {
    return null;
  }
  const Stripe = require('stripe');
  return new Stripe(tenant.stripe_secret_key);
}

// Create a SetupIntent for saving a card (no charge)
async function createSetupIntent(tenant, customerEmail) {
  const stripe = getStripeInstance(tenant);
  if (!stripe) return null;

  // Get or create Stripe customer
  const stripeCustomerId = await getOrCreateStripeCustomer(stripe, tenant, customerEmail);

  const setupIntent = await stripe.setupIntents.create({
    customer: stripeCustomerId,
    payment_method_types: ['card'],
  });

  return {
    clientSecret: setupIntent.client_secret,
    stripeCustomerId,
  };
}

// Create a PaymentIntent (charge customer)
async function createPaymentIntent(tenant, amount, customerEmail, metadata = {}) {
  const stripe = getStripeInstance(tenant);
  if (!stripe) return null;

  const stripeCustomerId = await getOrCreateStripeCustomer(stripe, tenant, customerEmail);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100), // Convert to pence
    currency: 'gbp',
    customer: stripeCustomerId,
    metadata,
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

// Charge a saved card off-session (for no-shows)
async function chargeNoShow(tenant, customerEmail, paymentMethodId, amount, bookingId) {
  const stripe = getStripeInstance(tenant);
  if (!stripe) throw new Error('Stripe not configured for this business');

  const customer = await getOne(
    'SELECT stripe_customer_id FROM customers WHERE tenant_id = $1 AND email = $2',
    [tenant.id, customerEmail]
  );

  if (!customer?.stripe_customer_id) {
    throw new Error('Customer has no saved payment method');
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amount * 100),
    currency: 'gbp',
    customer: customer.stripe_customer_id,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    metadata: {
      booking_id: bookingId,
      type: 'noshow_charge',
    },
  });

  return paymentIntent;
}

// Get saved card details
async function getCardDetails(tenant, paymentMethodId) {
  const stripe = getStripeInstance(tenant);
  if (!stripe) return null;

  const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
  return {
    last4: pm.card?.last4,
    brand: pm.card?.brand,
    expMonth: pm.card?.exp_month,
    expYear: pm.card?.exp_year,
  };
}

// Get or create a Stripe customer for this tenant's customer
async function getOrCreateStripeCustomer(stripe, tenant, customerEmail) {
  const customer = await getOne(
    'SELECT id, stripe_customer_id, name FROM customers WHERE tenant_id = $1 AND email = $2',
    [tenant.id, customerEmail]
  );

  if (customer?.stripe_customer_id) {
    return customer.stripe_customer_id;
  }

  // Create Stripe customer
  const stripeCustomer = await stripe.customers.create({
    email: customerEmail,
    name: customer?.name || customerEmail,
    metadata: { tenant_id: tenant.id.toString(), platform_customer_id: customer?.id?.toString() },
  });

  // Save Stripe customer ID
  if (customer) {
    await run(
      'UPDATE customers SET stripe_customer_id = $1 WHERE id = $2',
      [stripeCustomer.id, customer.id]
    );
  }

  return stripeCustomer.id;
}

// Get customer's saved payment methods
async function getCustomerPaymentMethods(tenant, customerEmail) {
  const stripe = getStripeInstance(tenant);
  if (!stripe) return [];

  const customer = await getOne(
    'SELECT stripe_customer_id FROM customers WHERE tenant_id = $1 AND email = $2',
    [tenant.id, customerEmail]
  );

  if (!customer?.stripe_customer_id) return [];

  const methods = await stripe.paymentMethods.list({
    customer: customer.stripe_customer_id,
    type: 'card',
  });

  return methods.data.map(pm => ({
    id: pm.id,
    last4: pm.card?.last4,
    brand: pm.card?.brand,
    expMonth: pm.card?.exp_month,
    expYear: pm.card?.exp_year,
  }));
}

module.exports = {
  getStripeInstance,
  createSetupIntent,
  createPaymentIntent,
  chargeNoShow,
  getCardDetails,
  getCustomerPaymentMethods,
};
