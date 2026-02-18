const cron = require('node-cron');
const { getAll, run } = require('../config/database');
const { sendAppointmentReminder, sendSMSReminder24h } = require('../utils/emailService');

function initReminderJob() {
  // Run daily at 9am
  cron.schedule('0 9 * * *', async () => {
    console.log('[Reminder Job] Running 24h appointment reminders...');

    try {
      // Get tomorrow's bookings that haven't had reminders sent
      const bookings = await getAll(
        `SELECT b.*, t.id as t_id, t.name as t_name, t.slug as t_slug,
                t.owner_email as t_owner_email, t.owner_name as t_owner_name,
                t.primary_color as t_primary_color, t.business_address as t_business_address,
                t.brevo_enabled as t_brevo_enabled, t.sms_enabled as t_sms_enabled
         FROM bookings b
         JOIN tenants t ON t.id = b.tenant_id AND t.active = TRUE
         WHERE b.date = CURRENT_DATE + INTERVAL '1 day'
           AND b.status IN ('confirmed', 'pending')
           AND b.reminder_24h_sent = FALSE`
      );

      console.log(`[Reminder Job] Found ${bookings.length} bookings needing reminders`);

      for (const b of bookings) {
        const tenant = {
          id: b.t_id, name: b.t_name, slug: b.t_slug,
          owner_email: b.t_owner_email, owner_name: b.t_owner_name,
          primary_color: b.t_primary_color, business_address: b.t_business_address,
          brevo_enabled: b.t_brevo_enabled, sms_enabled: b.t_sms_enabled,
        };

        try {
          // Send email reminder
          await sendAppointmentReminder(b, tenant);
          await run('UPDATE bookings SET reminder_24h_sent = TRUE WHERE id = $1', [b.id]);

          // Send SMS if enabled and phone available
          if (tenant.sms_enabled && b.customer_phone) {
            await sendSMSReminder24h(b, tenant);
            await run('UPDATE bookings SET sms_24h_sent = TRUE WHERE id = $1', [b.id]);
          }

          console.log(`[Reminder Job] Sent reminder for booking #${b.id}`);
        } catch (err) {
          console.error(`[Reminder Job] Error for booking #${b.id}:`, err.message);
        }
      }

      console.log('[Reminder Job] Complete.');
    } catch (err) {
      console.error('[Reminder Job] Fatal error:', err);
    }
  });

  console.log('Reminder job scheduled (daily at 9am).');
}

module.exports = { initReminderJob };
