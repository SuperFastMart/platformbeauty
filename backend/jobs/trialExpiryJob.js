const cron = require('node-cron');
const { getAll, run } = require('../config/database');

function initTrialExpiryJob() {
  // Run every hour to catch expired trials
  cron.schedule('0 * * * *', async () => {
    try {
      const expired = await getAll(
        `SELECT id, name, slug
         FROM tenants
         WHERE subscription_status = 'trial'
           AND trial_ends_at IS NOT NULL
           AND trial_ends_at < NOW()`
      );

      if (expired.length === 0) return;

      console.log(`[Trial Expiry] Found ${expired.length} expired trials, downgrading...`);

      for (const tenant of expired) {
        try {
          await run(
            `UPDATE tenants SET subscription_tier = 'free', subscription_status = 'trial_expired'
             WHERE id = $1 AND subscription_status = 'trial'`,
            [tenant.id]
          );
          console.log(`[Trial Expiry] Downgraded tenant ${tenant.slug} (#${tenant.id}) to free`);
        } catch (err) {
          console.error(`[Trial Expiry] Error downgrading tenant #${tenant.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Trial Expiry] Fatal error:', err);
    }
  });

  console.log('Trial expiry job scheduled (hourly).');
}

module.exports = { initTrialExpiryJob };
