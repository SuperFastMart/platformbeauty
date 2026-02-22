const { getOne, run } = require('../config/database');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms';

// Branded HTML email template
function wrapInTemplate(content, tenant) {
  const color = tenant.primary_color || '#8B2635';
  const name = tenant.name || 'Boukd';
  const platformUrl = process.env.PLATFORM_URL || 'https://boukd.com';
  const boukdLogoUrl = `${platformUrl}/boukd-logo.png`;

  // Header: show tenant logo if available, otherwise text
  const headerContent = tenant.logo_url
    ? `<img src="${tenant.logo_url}" alt="${name}" style="max-height:44px;max-width:200px;display:block;" />`
    : `<h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${name}</h1>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:20px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${color};padding:24px 32px;">
          ${headerContent}
        </td></tr>
        <tr><td style="padding:32px;">${content}</td></tr>
        <tr><td style="padding:20px 32px;background:#fafafa;border-top:1px solid #eee;text-align:center;">
          <a href="https://boukd.com" style="text-decoration:none;display:inline-block;" target="_blank">
            <img src="${boukdLogoUrl}" alt="Boukd" style="height:36px;display:inline-block;vertical-align:middle;opacity:0.6;" />
          </a>
          <p style="margin:6px 0 0;font-size:11px;color:#bbb;">
            Powered by <a href="https://boukd.com" style="color:#bbb;text-decoration:none;">Boukd</a> — the booking platform built for you
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// Log email to database and send via Brevo
async function sendEmail({ to, toName, subject, html, tenant, emailType, bookingId, customerId }) {
  const tenantId = tenant.id;
  const apiKey = process.env.BREVO_API_KEY;

  // Log the email attempt
  const log = await getOne(
    `INSERT INTO email_logs (tenant_id, recipient_email, recipient_name, email_type, subject, booking_id, customer_id, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending') RETURNING id`,
    [tenantId, to, toName || null, emailType || null, subject, bookingId || null, customerId || null]
  );

  if (!apiKey) {
    console.log(`[Email] BREVO_API_KEY not set. Would send "${subject}" to ${to}`);
    await run('UPDATE email_logs SET status = $1, error_message = $2 WHERE id = $3',
      ['skipped', 'BREVO_API_KEY not configured', log.id]);
    return { success: false, reason: 'no_api_key' };
  }

  try {
    const fromName = `${tenant.name} via Boukd`;
    const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@boukd.com';

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: fromName, email: fromEmail },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent: wrapInTemplate(html, tenant),
      }),
    });

    const result = await response.json();

    if (response.ok) {
      await run('UPDATE email_logs SET status = $1, provider_message_id = $2, sent_at = NOW() WHERE id = $3',
        ['sent', result.messageId || null, log.id]);
      return { success: true, messageId: result.messageId };
    } else {
      await run('UPDATE email_logs SET status = $1, error_message = $2 WHERE id = $3',
        ['failed', JSON.stringify(result), log.id]);
      console.error('[Email] Brevo error:', result);
      return { success: false, error: result };
    }
  } catch (err) {
    await run('UPDATE email_logs SET status = $1, error_message = $2 WHERE id = $3',
      ['failed', err.message, log.id]);
    console.error('[Email] Send error:', err.message);
    return { success: false, error: err.message };
  }
}

// Send SMS via Brevo
async function sendSMS(phone, message, tenant) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log('[SMS] Skipped: no API key');
    return { success: false };
  }

  // Check SMS eligibility: tenant-level flag OR plan-level flag
  let smsEnabled = tenant.sms_enabled;
  if (!smsEnabled) {
    const plan = await getOne(
      'SELECT sms_enabled FROM subscription_plans WHERE tier = $1 AND is_active = TRUE',
      [tenant.subscription_tier || 'free']
    );
    smsEnabled = plan?.sms_enabled;
  }
  if (!smsEnabled) {
    console.log('[SMS] Skipped: SMS disabled for tenant plan');
    return { success: false };
  }

  try {
    const response = await fetch(BREVO_SMS_URL, {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        type: 'transactional',
        unicodeEnabled: true,
        sender: tenant.name.slice(0, 11),
        recipient: phone,
        content: message,
      }),
    });
    const result = await response.json();
    return { success: response.ok, result };
  } catch (err) {
    console.error('[SMS] Error:', err.message);
    return { success: false, error: err.message };
  }
}

// Generate ICS calendar content
function generateBookingICS(booking, tenant) {
  const date = booking.date.toISOString ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
  const startTime = booking.start_time.slice(0, 5).replace(':', '');
  const endTime = booking.end_time.slice(0, 5).replace(':', '');
  const dtStart = `${date.replace(/-/g, '')}T${startTime}00`;
  const dtEnd = `${date.replace(/-/g, '')}T${endTime}00`;

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Boukd//EN
BEGIN:VEVENT
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${booking.service_names} at ${tenant.name}
DESCRIPTION:Booking #${booking.id}\\n${booking.service_names}\\nTotal: £${parseFloat(booking.total_price).toFixed(2)}
LOCATION:${tenant.business_address || ''}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;
}

// ============================================
// Specific email senders
// ============================================

async function sendBookingPendingNotification(booking, tenant) {
  const platformUrl = process.env.PLATFORM_URL || 'https://boukd.com';
  const date = booking.date.toISOString ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
  const html = `
    <h2 style="margin:0 0 16px;color:#333;">Booking Request Received</h2>
    <p style="color:#555;">Hi ${booking.customer_name},</p>
    <p style="color:#555;">Your booking request has been submitted and is awaiting confirmation.</p>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:4px 0;"><strong>Services:</strong> ${booking.service_names}</p>
      <p style="margin:4px 0;"><strong>Date:</strong> ${date}</p>
      <p style="margin:4px 0;"><strong>Time:</strong> ${booking.start_time.slice(0, 5)} - ${booking.end_time.slice(0, 5)}</p>
      <p style="margin:4px 0;"><strong>Total:</strong> £${parseFloat(booking.total_price).toFixed(2)}</p>
    </div>
    <p style="color:#555;">We'll send you another email once your booking is confirmed.</p>
    <p style="color:#555;">
      <a href="${platformUrl}/t/${tenant.slug}/portal/login" style="color:${tenant.primary_color || '#8B2635'};">
        View your bookings in the customer portal
      </a>
    </p>`;

  return sendEmail({
    to: booking.customer_email,
    toName: booking.customer_name,
    subject: `Booking Request Received - ${tenant.name}`,
    html,
    tenant,
    emailType: 'booking_pending',
    bookingId: booking.id,
  });
}

async function sendBookingApprovedNotification(booking, tenant) {
  const platformUrl = process.env.PLATFORM_URL || 'https://boukd.com';
  const date = booking.date.toISOString ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
  const html = `
    <h2 style="margin:0 0 16px;color:#2e7d32;">Booking Confirmed!</h2>
    <p style="color:#555;">Hi ${booking.customer_name},</p>
    <p style="color:#555;">Great news — your booking has been confirmed!</p>
    <div style="background:#f0f7f0;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #2e7d32;">
      <p style="margin:4px 0;"><strong>Services:</strong> ${booking.service_names}</p>
      <p style="margin:4px 0;"><strong>Date:</strong> ${date}</p>
      <p style="margin:4px 0;"><strong>Time:</strong> ${booking.start_time.slice(0, 5)} - ${booking.end_time.slice(0, 5)}</p>
      <p style="margin:4px 0;"><strong>Total:</strong> £${parseFloat(booking.total_price).toFixed(2)}</p>
    </div>
    <p style="color:#555;">
      <a href="${platformUrl}/t/${tenant.slug}/portal/login" style="color:${tenant.primary_color || '#8B2635'};">
        Manage your booking in the customer portal
      </a>
    </p>`;

  return sendEmail({
    to: booking.customer_email,
    toName: booking.customer_name,
    subject: `Booking Confirmed - ${tenant.name}`,
    html,
    tenant,
    emailType: 'booking_approved',
    bookingId: booking.id,
  });
}

async function sendBookingRejectedNotification(booking, tenant, reason, alternative) {
  const platformUrl = process.env.PLATFORM_URL || 'https://boukd.com';
  let html = `
    <h2 style="margin:0 0 16px;color:#d32f2f;">Booking Update</h2>
    <p style="color:#555;">Hi ${booking.customer_name},</p>
    <p style="color:#555;">Unfortunately, we were unable to confirm your booking for <strong>${booking.service_names}</strong>.</p>`;

  if (reason) {
    html += `<p style="color:#555;"><strong>Reason:</strong> ${reason}</p>`;
  }
  if (alternative) {
    html += `<p style="color:#555;"><strong>Suggestion:</strong> ${alternative}</p>`;
  }

  html += `
    <p style="color:#555;">
      <a href="${platformUrl}/t/${tenant.slug}/book" style="display:inline-block;background:${tenant.primary_color || '#8B2635'};color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;margin-top:8px;">
        Book a different time
      </a>
    </p>`;

  return sendEmail({
    to: booking.customer_email,
    toName: booking.customer_name,
    subject: `Booking Update - ${tenant.name}`,
    html,
    tenant,
    emailType: 'booking_rejected',
    bookingId: booking.id,
  });
}

async function sendAppointmentReminder(booking, tenant) {
  const date = booking.date.toISOString ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
  const html = `
    <h2 style="margin:0 0 16px;color:#333;">Appointment Reminder</h2>
    <p style="color:#555;">Hi ${booking.customer_name},</p>
    <p style="color:#555;">This is a friendly reminder about your upcoming appointment tomorrow.</p>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:4px 0;"><strong>Services:</strong> ${booking.service_names}</p>
      <p style="margin:4px 0;"><strong>Date:</strong> ${date}</p>
      <p style="margin:4px 0;"><strong>Time:</strong> ${booking.start_time.slice(0, 5)} - ${booking.end_time.slice(0, 5)}</p>
    </div>
    <p style="color:#555;">We look forward to seeing you!</p>`;

  return sendEmail({
    to: booking.customer_email,
    toName: booking.customer_name,
    subject: `Appointment Reminder - ${tenant.name}`,
    html,
    tenant,
    emailType: 'reminder_24h',
    bookingId: booking.id,
  });
}

async function sendAdminNewBookingNotification(booking, tenant) {
  const date = booking.date.toISOString ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
  const html = `
    <h2 style="margin:0 0 16px;color:#333;">New Booking Request</h2>
    <p style="color:#555;">You have a new booking request that needs your attention.</p>
    <div style="background:#fff3e0;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #ff9800;">
      <p style="margin:4px 0;"><strong>Customer:</strong> ${booking.customer_name} (${booking.customer_email})</p>
      <p style="margin:4px 0;"><strong>Services:</strong> ${booking.service_names}</p>
      <p style="margin:4px 0;"><strong>Date:</strong> ${date}</p>
      <p style="margin:4px 0;"><strong>Time:</strong> ${booking.start_time.slice(0, 5)} - ${booking.end_time.slice(0, 5)}</p>
      <p style="margin:4px 0;"><strong>Total:</strong> £${parseFloat(booking.total_price).toFixed(2)}</p>
    </div>
    <p style="color:#555;">Log in to the admin panel to approve or reject this booking.</p>`;

  return sendEmail({
    to: tenant.owner_email,
    toName: tenant.owner_name,
    subject: `New Booking Request - ${booking.customer_name}`,
    html,
    tenant,
    emailType: 'admin_new_booking',
    bookingId: booking.id,
  });
}

async function sendMagicLinkEmail(customer, tenant, token) {
  const platformUrl = process.env.PLATFORM_URL || 'https://boukd.com';
  const link = `${platformUrl}/t/${tenant.slug}/portal/verify?token=${token}`;
  const html = `
    <h2 style="margin:0 0 16px;color:#333;">Sign In to Your Account</h2>
    <p style="color:#555;">Hi ${customer.name},</p>
    <p style="color:#555;">Click the button below to sign in to your account. This link expires in 15 minutes.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:${tenant.primary_color || '#8B2635'};color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">
        Sign In
      </a>
    </p>
    <p style="color:#999;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>`;

  return sendEmail({
    to: customer.email,
    toName: customer.name,
    subject: `Sign In Link - ${tenant.name}`,
    html,
    tenant,
    emailType: 'magic_link',
    customerId: customer.id,
  });
}

async function sendPasswordResetEmail(customer, tenant, token) {
  const platformUrl = process.env.PLATFORM_URL || 'https://boukd.com';
  const link = `${platformUrl}/t/${tenant.slug}/portal/login?reset=${token}`;
  const html = `
    <h2 style="margin:0 0 16px;color:#333;">Reset Your Password</h2>
    <p style="color:#555;">Hi ${customer.name},</p>
    <p style="color:#555;">Click below to reset your password. This link expires in 1 hour.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:${tenant.primary_color || '#8B2635'};color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-weight:600;">
        Reset Password
      </a>
    </p>
    <p style="color:#999;font-size:13px;">If you didn't request this, you can safely ignore this email.</p>`;

  return sendEmail({
    to: customer.email,
    toName: customer.name,
    subject: `Password Reset - ${tenant.name}`,
    html,
    tenant,
    emailType: 'password_reset',
    customerId: customer.id,
  });
}

async function sendSMSReminder24h(booking, tenant) {
  if (!booking.customer_phone) return { success: false };
  const date = booking.date.toISOString ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
  const message = `Reminder: Your appointment at ${tenant.name} is tomorrow at ${booking.start_time.slice(0, 5)}. ${booking.service_names}. See you then!`;
  return sendSMS(booking.customer_phone, message, tenant);
}

async function sendBookingConfirmedSMS(booking, tenant) {
  if (!booking.customer_phone) {
    console.log(`[SMS] Skipped booking #${booking.id}: no phone number on booking`);
    return { success: false };
  }
  const date = booking.date.toISOString ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
  const message = `Hi ${booking.customer_name}, your booking at ${tenant.name} on ${date} at ${booking.start_time.slice(0, 5)} is confirmed! See you then.`;
  return sendSMS(booking.customer_phone, message, tenant);
}

async function sendBookingRejectedSMS(booking, tenant) {
  if (!booking.customer_phone) {
    console.log(`[SMS] Skipped booking #${booking.id}: no phone number on booking`);
    return { success: false };
  }
  const message = `Hi ${booking.customer_name}, unfortunately your booking at ${tenant.name} could not be confirmed. Please visit our booking page to rebook.`;
  return sendSMS(booking.customer_phone, message, tenant);
}

async function sendBookingRequestNotification(request, booking, tenant) {
  const typeLabel = request.request_type === 'cancel' ? 'Cancellation' : 'Amendment';
  const html = `
    <h2 style="margin:0 0 16px;color:#333;">Booking ${typeLabel} Request</h2>
    <p style="color:#555;">A customer has requested a ${typeLabel.toLowerCase()} for their booking.</p>
    <div style="background:#f9f9f9;border-radius:8px;padding:16px;margin:16px 0;">
      <p style="margin:4px 0;"><strong>Customer:</strong> ${booking.customer_name}</p>
      <p style="margin:4px 0;"><strong>Booking:</strong> ${booking.service_names}</p>
      <p style="margin:4px 0;"><strong>Original Date:</strong> ${String(booking.date).split('T')[0]} at ${booking.start_time.slice(0, 5)}</p>
      ${request.reason ? `<p style="margin:4px 0;"><strong>Reason:</strong> ${request.reason}</p>` : ''}
      ${request.requested_date ? `<p style="margin:4px 0;"><strong>Requested New Date:</strong> ${request.requested_date} at ${request.requested_time}</p>` : ''}
    </div>
    <p style="color:#555;">Log in to the admin panel to review this request.</p>`;

  return sendEmail({
    to: tenant.owner_email,
    toName: tenant.owner_name,
    subject: `Booking ${typeLabel} Request - ${booking.customer_name}`,
    html,
    tenant,
    emailType: `booking_request_${request.request_type}`,
    bookingId: booking.id,
  });
}

async function sendRequestApprovedNotification(request, booking, tenant) {
  const typeLabel = request.request_type === 'cancel' ? 'cancellation' : 'amendment';
  let html = `
    <h2 style="margin:0 0 16px;color:#2e7d32;">Request Approved</h2>
    <p style="color:#555;">Hi ${booking.customer_name},</p>
    <p style="color:#555;">Your ${typeLabel} request has been approved.</p>`;

  if (request.admin_response) {
    html += `<p style="color:#555;"><strong>Note from ${tenant.name}:</strong> ${request.admin_response}</p>`;
  }

  return sendEmail({
    to: booking.customer_email,
    toName: booking.customer_name,
    subject: `Request Approved - ${tenant.name}`,
    html,
    tenant,
    emailType: 'request_approved',
    bookingId: booking.id,
  });
}

async function sendRequestRejectedNotification(request, booking, tenant) {
  const typeLabel = request.request_type === 'cancel' ? 'cancellation' : 'amendment';
  let html = `
    <h2 style="margin:0 0 16px;color:#d32f2f;">Request Declined</h2>
    <p style="color:#555;">Hi ${booking.customer_name},</p>
    <p style="color:#555;">Unfortunately, your ${typeLabel} request could not be approved.</p>`;

  if (request.admin_response) {
    html += `<p style="color:#555;"><strong>Note from ${tenant.name}:</strong> ${request.admin_response}</p>`;
  }

  return sendEmail({
    to: booking.customer_email,
    toName: booking.customer_name,
    subject: `Request Update - ${tenant.name}`,
    html,
    tenant,
    emailType: 'request_rejected',
    bookingId: booking.id,
  });
}

// Platform-level email (for signup verification, etc.)
async function sendPlatformEmail({ to, toName, subject, html }) {
  const apiKey = process.env.BREVO_API_KEY;
  const platformName = 'Boukd';
  const platformColor = '#8B2635';

  if (!apiKey) {
    console.log(`[Email] BREVO_API_KEY not set. Would send "${subject}" to ${to}`);
    return { success: false, reason: 'no_api_key' };
  }

  try {
    const fromEmail = process.env.BREVO_FROM_EMAIL || 'noreply@boukd.com';
    const wrappedHtml = wrapInTemplate(html, { name: platformName, primary_color: platformColor });

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: { 'accept': 'application/json', 'content-type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        sender: { name: platformName, email: fromEmail },
        to: [{ email: to, name: toName || to }],
        subject,
        htmlContent: wrappedHtml,
      }),
    });

    const result = await response.json();
    if (response.ok) {
      return { success: true, messageId: result.messageId };
    } else {
      console.error('[Email] Platform email error:', result);
      return { success: false, error: result };
    }
  } catch (err) {
    console.error('[Email] Platform email error:', err.message);
    return { success: false, error: err.message };
  }
}

async function sendVerificationEmail(email, name, token) {
  const platformUrl = process.env.PLATFORM_URL || 'https://boukd.com';
  const link = `${platformUrl}/verify-email?token=${token}`;
  const html = `
    <h2 style="margin:0 0 16px;color:#333;">Verify Your Email</h2>
    <p style="color:#555;">Hi ${name},</p>
    <p style="color:#555;">Thanks for signing up! Please verify your email address to activate your account.</p>
    <p style="text-align:center;margin:24px 0;">
      <a href="${link}" style="display:inline-block;background:#8B2635;color:#fff;padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:600;font-size:16px;">
        Verify Email Address
      </a>
    </p>
    <p style="color:#999;font-size:13px;">This link expires in 24 hours. If you didn't create an account, you can safely ignore this email.</p>
    <p style="color:#ccc;font-size:11px;margin-top:20px;">Or copy this link: ${link}</p>`;

  return sendPlatformEmail({ to: email, toName: name, subject: 'Verify your email - Boukd', html });
}

module.exports = {
  sendEmail,
  sendPlatformEmail,
  sendVerificationEmail,
  sendBookingPendingNotification,
  sendBookingApprovedNotification,
  sendBookingRejectedNotification,
  sendAppointmentReminder,
  sendAdminNewBookingNotification,
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendSMS,
  sendSMSReminder24h,
  sendBookingConfirmedSMS,
  sendBookingRejectedSMS,
  sendBookingRequestNotification,
  sendRequestApprovedNotification,
  sendRequestRejectedNotification,
  generateBookingICS,
};
