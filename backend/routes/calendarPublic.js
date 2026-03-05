const router = require('express').Router();
const { getAll, getOne } = require('../config/database');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// GET /api/cal/:token — public iCal feed (no auth, token-based)
router.get('/:token', asyncHandler(async (req, res) => {
  const tenant = await getOne(
    'SELECT * FROM tenants WHERE calendar_feed_token = $1',
    [req.params.token]
  );
  if (!tenant) return res.status(404).send('Calendar feed not found');

  const bookings = await getAll(
    `SELECT * FROM bookings
     WHERE tenant_id = $1 AND date >= CURRENT_DATE AND status IN ('confirmed', 'pending')
     ORDER BY date, start_time`,
    [tenant.id]
  );

  const currSetting = await getOne(
    `SELECT setting_value FROM tenant_settings WHERE tenant_id = $1 AND setting_key = 'currency'`,
    [tenant.id]
  );
  const currMap = { GBP: '\u00a3', USD: '$', EUR: '\u20ac' };
  const currSymbol = currMap[(currSetting?.setting_value || 'GBP')] || '\u00a3';

  let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Boukd//EN\r\nX-WR-CALNAME:${tenant.name} Bookings\r\nMETHOD:PUBLISH\r\n`;

  for (const b of bookings) {
    const date = b.date.toISOString ? b.date.toISOString().split('T')[0] : String(b.date).split('T')[0];
    const startTime = b.start_time.slice(0, 5).replace(':', '');
    const endTime = b.end_time.slice(0, 5).replace(':', '');
    const dtStart = `${date.replace(/-/g, '')}T${startTime}00`;
    const dtEnd = `${date.replace(/-/g, '')}T${endTime}00`;

    ics += `BEGIN:VEVENT\r\n`;
    ics += `UID:booking-${b.id}@boukd\r\n`;
    ics += `DTSTART:${dtStart}\r\n`;
    ics += `DTEND:${dtEnd}\r\n`;
    ics += `SUMMARY:${b.customer_name} - ${b.service_names}\r\n`;
    ics += `DESCRIPTION:Booking #${b.id}\nServices: ${b.service_names}\nCustomer: ${b.customer_name}\nEmail: ${b.customer_email}\nStatus: ${b.status}\nTotal: ${currSymbol}${parseFloat(b.total_price).toFixed(2)}\r\n`;
    ics += `LOCATION:${tenant.business_address || ''}\r\n`;
    ics += `STATUS:${b.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}\r\n`;
    ics += `END:VEVENT\r\n`;
  }

  ics += `END:VCALENDAR`;

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="bookings.ics"');
  res.send(ics);
}));

module.exports = router;
