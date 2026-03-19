const router = require('express').Router();
const { getAll, getOne } = require('../config/database');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const CURRENCY_SYMBOLS = { GBP: '£', USD: '$', EUR: '€' };

async function getCurrSymbol(tenantId) {
  const row = await getOne(`SELECT setting_value FROM tenant_settings WHERE tenant_id = $1 AND setting_key = 'currency'`, [tenantId]);
  const code = (row?.setting_value || 'GBP').toUpperCase();
  return CURRENCY_SYMBOLS[code] || code + ' ';
}

// GET /api/cal/customer/:token - customer personal iCal feed
router.get('/customer/:token', asyncHandler(async (req, res) => {
  const customer = await getOne(
    'SELECT c.*, t.name AS tenant_name, t.business_address, t.id AS tenant_id FROM customers c JOIN tenants t ON t.id = c.tenant_id WHERE c.calendar_feed_token = $1',
    [req.params.token]
  );
  if (!customer) return res.status(404).send('Calendar feed not found');

  const bookings = await getAll(
    `SELECT * FROM bookings
     WHERE tenant_id = $1 AND customer_email = $2
       AND (
         (status IN ('confirmed', 'pending') AND date >= CURRENT_DATE)
         OR (status = 'cancelled' AND date >= CURRENT_DATE - INTERVAL '30 days')
       )
     ORDER BY date, start_time`,
    [customer.tenant_id, customer.email]
  );

  const currSymbol = await getCurrSymbol(customer.tenant_id);

  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Boukd//EN
X-WR-CALNAME:${`My Bookings at ${customer.tenant_name}`}
METHOD:PUBLISH
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
    ics += `SUMMARY:${`${b.service_names} at ${customer.tenant_name}`}
`;
    ics += `DESCRIPTION:${`${b.service_names}
Total: ${currSymbol}${parseFloat(b.total_price).toFixed(2)}`}
`;
    ics += `LOCATION:${customer.business_address || ''}
`;
    ics += `STATUS:${b.status === 'confirmed' ? 'CONFIRMED' : b.status === 'cancelled' ? 'CANCELLED' : 'TENTATIVE'}
`;
    ics += `END:VEVENT
`;
  }

  ics += `END:VCALENDAR`;

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="my-bookings.ics"');
  res.send(ics);
}));

// GET /api/cal/:token - tenant iCal feed (no auth, token-based)
router.get('/:token', asyncHandler(async (req, res) => {
  const tenant = await getOne(
    'SELECT * FROM tenants WHERE calendar_feed_token = $1',
    [req.params.token]
  );
  if (!tenant) return res.status(404).send('Calendar feed not found');

  const bookings = await getAll(
    `SELECT * FROM bookings
     WHERE tenant_id = $1
       AND (
         (status IN ('confirmed', 'pending') AND date >= CURRENT_DATE)
         OR (status = 'cancelled' AND date >= CURRENT_DATE - INTERVAL '30 days')
       )
     ORDER BY date, start_time`,
    [tenant.id]
  );

  const currSymbol = await getCurrSymbol(tenant.id);

  let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Boukd//EN
X-WR-CALNAME:${`${tenant.name} Bookings`}
METHOD:PUBLISH
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
    ics += `SUMMARY:${`${b.customer_name} - ${b.service_names}`}
`;
    ics += `DESCRIPTION:${`Booking #${b.id}
Services: ${b.service_names}
Customer: ${b.customer_name}
Email: ${b.customer_email}
Status: ${b.status}
Total: ${currSymbol}${parseFloat(b.total_price).toFixed(2)}`}
`;
    ics += `LOCATION:${tenant.business_address || ''}
`;
    ics += `STATUS:${b.status === 'confirmed' ? 'CONFIRMED' : b.status === 'cancelled' ? 'CANCELLED' : 'TENTATIVE'}
`;
    ics += `END:VEVENT
`;
  }

  ics += `END:VCALENDAR`;

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'inline; filename="bookings.ics"');
  res.send(ics);
}));

module.exports = router;
