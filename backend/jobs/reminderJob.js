const cron = require('node-cron');
const { getAll, getOne, run } = require('../config/database');
const { sendAppointmentReminder, sendSMSReminder24h, sendSMSReminder2h } = require('../utils/emailService');

// Helper: get a tenant setting value
async function getTenantSetting(tenantId, key, defaultValue = null) {
  const row = await getOne(
    'SELECT setting_value FROM tenant_settings WHERE tenant_id = $1 AND setting_key = $2',
    [tenantId, key]
  );
  return row ? row.setting_value : defaultValue;
}

function initReminderJob() {
  // 24h reminders — daily at 9am
  cron.schedule('0 9 * * *', async () => {
    console.log('[Reminder Job] Running 24h appointment reminders...');

    try {
      const bookings = await getAll(
        `SELECT b.*, t.id as t_id, t.name as t_name, t.slug as t_slug,
                t.owner_email as t_owner_email, t.owner_name as t_owner_name,
                t.primary_color as t_primary_color, t.business_address as t_business_address,
                t.brevo_enabled as t_brevo_enabled, t.sms_enabled as t_sms_enabled,
                t.subscription_tier as t_subscription_tier
         FROM bookings b
         JOIN tenants t ON t.id = b.tenant_id AND t.active = TRUE
         WHERE b.date = CURRENT_DATE + INTERVAL '1 day'
           AND b.status IN ('confirmed', 'pending')
           AND b.reminder_24h_sent = FALSE`
      );

      console.log(`[Reminder Job] Found ${bookings.length} bookings needing 24h reminders`);

      for (const b of bookings) {
        const tenant = {
          id: b.t_id, name: b.t_name, slug: b.t_slug,
          owner_email: b.t_owner_email, owner_name: b.t_owner_name,
          primary_color: b.t_primary_color, business_address: b.t_business_address,
          brevo_enabled: b.t_brevo_enabled, sms_enabled: b.t_sms_enabled,
          subscription_tier: b.t_subscription_tier,
        };

        try {
          // Send email reminder
          await sendAppointmentReminder(b, tenant);
          await run('UPDATE bookings SET reminder_24h_sent = TRUE WHERE id = $1', [b.id]);

          // Send SMS if enabled and phone available
          const sms24hEnabled = await getTenantSetting(tenant.id, 'sms_reminder_24h_enabled', 'true');
          if (tenant.sms_enabled && b.customer_phone && sms24hEnabled !== 'false') {
            await sendSMSReminder24h(b, tenant);
            await run('UPDATE bookings SET sms_24h_sent = TRUE WHERE id = $1', [b.id]);
          }

          console.log(`[Reminder Job] Sent 24h reminder for booking #${b.id}`);
        } catch (err) {
          console.error(`[Reminder Job] Error for booking #${b.id}:`, err.message);
        }
      }

      console.log('[Reminder Job] 24h reminders complete.');
    } catch (err) {
      console.error('[Reminder Job] Fatal error:', err);
    }
  });

  // 2h reminders — every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    try {
      const now = new Date();
      const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const in2h30 = new Date(now.getTime() + 2.5 * 60 * 60 * 1000);

      const bookings = await getAll(
        `SELECT b.*, t.id as t_id, t.name as t_name, t.slug as t_slug,
                t.sms_enabled as t_sms_enabled
         FROM bookings b
         JOIN tenants t ON t.id = b.tenant_id AND t.active = TRUE
         WHERE b.date = CURRENT_DATE
           AND b.status = 'confirmed'
           AND b.sms_2h_sent = FALSE
           AND b.customer_phone IS NOT NULL
           AND (b.date::text || ' ' || b.start_time)::timestamp BETWEEN $1 AND $2`,
        [in2h.toISOString(), in2h30.toISOString()]
      );

      if (bookings.length === 0) return;
      console.log(`[Reminder Job] Found ${bookings.length} bookings needing 2h SMS reminders`);

      for (const b of bookings) {
        const tenant = { id: b.t_id, name: b.t_name, slug: b.t_slug, sms_enabled: b.t_sms_enabled };

        try {
          // Check tenant has 2h reminders enabled
          const sms2hEnabled = await getTenantSetting(tenant.id, 'sms_reminder_2h_enabled', 'false');
          if (!tenant.sms_enabled || sms2hEnabled !== 'true') {
            continue;
          }

          await sendSMSReminder2h(b, tenant);
          await run('UPDATE bookings SET sms_2h_sent = TRUE WHERE id = $1', [b.id]);
          console.log(`[Reminder Job] Sent 2h SMS reminder for booking #${b.id}`);
        } catch (err) {
          console.error(`[Reminder Job] 2h SMS error for booking #${b.id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('[Reminder Job] 2h reminder error:', err);
    }
  });

  // Waitlist expiry — hourly
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await run(
        `UPDATE waitlist SET status = 'expired' WHERE status = 'notified' AND expires_at < NOW()`
      );
      if (result.rowCount > 0) {
        console.log(`[Waitlist] Expired ${result.rowCount} stale waitlist notifications`);
      }
    } catch (err) {
      // Waitlist table may not exist yet
      if (!err.message.includes('does not exist')) {
        console.error('[Waitlist] Expiry job error:', err.message);
      }
    }
  });

  console.log('Reminder jobs scheduled (24h daily 9am, 2h every 30min, waitlist hourly).');
}

module.exports = { initReminderJob };
