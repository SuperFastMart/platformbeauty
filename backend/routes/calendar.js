const router = require('express').Router();
const { getAll, getOne } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');

const CURRENCY_SYMBOLS = { GBP: '£', USD: '$', EUR: '€' };

async function getTenantCurrency(tenantId) {
  const row = await getOne(`SELECT setting_value FROM tenant_settings WHERE tenant_id = $1 AND setting_key = 'currency'`, [tenantId]);
  return (row?.setting_value || 'GBP').toUpperCase();
}

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.use(tenantAuth);

// GET /api/admin/calendar/feed-url
router.get('/feed-url', asyncHandler(async (req, res) => {
  let tenant = await getOne('SELECT calendar_feed_token FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant?.calendar_feed_token) {
    tenant = await getOne(
      'UPDATE tenants SET calendar_feed_token = gen_random_uuid() WHERE id = $1 RETURNING calendar_feed_token',
      [req.tenantId]
    );
  }
  res.json({ token: tenant.calendar_feed_token });
}));

// POST /api/admin/calendar/regenerate-token
router.post('/regenerate-token', asyncHandler(async (req, res) => {
  const tenant = await getOne(
    'UPDATE tenants SET calendar_feed_token = gen_random_uuid() WHERE id = $1 RETURNING calendar_feed_token',
    [req.tenantId]
  );
  res.json({ token: tenant.calendar_feed_token });
}));

// GET /api/admin/calendar/feed
router.get('/feed', asyncHandler(async (req, res) => {
  const bookings = await getAll(
    `SELECT * FROM bookings
     WHERE tenant_id = $1 AND date >= CURRENT_DATE AND status IN ('confirmed', 'pending')
     ORDER BY date, start_time`,
    [req.tenantId]
  );

  const tenant = req.tenant || { name: 'Boukd', business_address: '' };
  const currency = await getTenantCurrency(req.tenantId);
  const currSymbol = CURRENCY_SYMBOLS[currency] || currency + ' ';

  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Boukd//EN
X-WR-CALNAME:${tenant.name} Bookings
`;

  for (const b of bookings) {
    const date = b.date.toISOString ? b.date.toISOString().split('T')[0] : String(b.date).split('T')[0];
    const startTime = b.start_time.slice(0, 5).replace(':', '');
    const endTime = b.end_time.slice(0, 5).replace(':', '');
    const dtStart = `${date.replace(/-/g, '')}T${startTime}00`;
    const dtEnd = `${date.replace(/-/g, '')}T${endTime}00`;

    ics += `BEGIN:VEVENT
`;
    ics += `UID:booking-${b.id}@boukd
`;
    ics += `DTSTART:${dtStart}
`;
    ics += `DTEND:${dtEnd}
`;
    ics += `SUMMARY:${b.customer_name} - ${b.service_names}
`;
    ics += `DESCRIPTION:Booking #${b.id}\nServices: ${b.service_names}\nCustomer: ${b.customer_name}\nEmail: ${b.customer_email}\nStatus: ${b.status}\nTotal: ${currSymbol}${parseFloat(b.total_price).toFixed(2)}
`;
    ics += `LOCATION:${tenant.business_address || ''}
`;
    ics += `STATUS:${b.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}
`;
    ics += `END:VEVENT
`;
  }

  ics += `END:VCALENDAR`;

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="bookings.ics"');
  res.send(ics);
}));

// GET /api/admin/calendar/download/:bookingId
router.get('/download/:bookingId', asyncHandler(async (req, res) => {
  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.bookingId, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tenant = req.tenant || { name: 'Boukd', business_address: '' };
  const currency = await getTenantCurrency(req.tenantId);
  const currSymbol = CURRENCY_SYMBOLS[currency] || currency + ' ';
  const date = booking.date.toISOString ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
  const startTime = booking.start_time.slice(0, 5).replace(':', '');
  const endTime = booking.end_time.slice(0, 5).replace(':', '');
  const dtStart = `${date.replace(/-/g, '')}T${startTime}00`;
  const dtEnd = `${date.replace(/-/g, '')}T${endTime}00`;

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Boukd//EN
BEGIN:VEVENT
UID:booking-${booking.id}@boukd
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${booking.service_names} at ${tenant.name}
DESCRIPTION:Booking #${booking.id}\n${booking.service_names}\nTotal: ${currSymbol}${parseFloat(booking.total_price).toFixed(2)}
LOCATION:${tenant.business_address || ''}
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="booking-${booking.id}.ics"`);
  res.send(ics);
}));

module.exports = router;
