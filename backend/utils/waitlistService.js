const { getAll, getOne, run } = require('../config/database');
const { sendWaitlistNotification, sendWaitlistSMS } = require('./emailService');

/**
 * Check if any waitlist entries can be notified for a given date.
 * Called after a booking is cancelled or rejected to fill freed slots.
 */
async function checkWaitlistForDate(tenantId, date) {
  try {
    const entries = await getAll(
      `SELECT * FROM waitlist
       WHERE tenant_id = $1 AND date = $2 AND status = 'waiting'
       ORDER BY created_at ASC`,
      [tenantId, date]
    );

    if (entries.length === 0) return;

    const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [tenantId]);
    if (!tenant) return;

    // Notify the first waiting entry
    const entry = entries[0];
    await notifyWaitlistCustomer(entry, tenant);
  } catch (err) {
    // Waitlist table may not exist yet
    if (!err.message.includes('does not exist')) {
      console.error('[Waitlist] checkWaitlistForDate error:', err.message);
    }
  }
}

/**
 * Notify a waitlist customer that a slot has opened.
 * Sets status to 'notified' with a 4-hour expiry window.
 */
async function notifyWaitlistCustomer(entry, tenant) {
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours

  await run(
    `UPDATE waitlist SET status = 'notified', notified_at = NOW(), expires_at = $1 WHERE id = $2`,
    [expiresAt.toISOString(), entry.id]
  );

  // Send email notification
  sendWaitlistNotification(entry, tenant).catch(err =>
    console.error(`[Waitlist] Email error for entry #${entry.id}:`, err.message)
  );

  // Send SMS if phone available
  if (entry.customer_phone) {
    sendWaitlistSMS(entry, tenant).catch(err =>
      console.error(`[Waitlist] SMS error for entry #${entry.id}:`, err.message)
    );
  }

  console.log(`[Waitlist] Notified entry #${entry.id} (${entry.customer_email}) for ${entry.date}`);
}

module.exports = { checkWaitlistForDate, notifyWaitlistCustomer };
