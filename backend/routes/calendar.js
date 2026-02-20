const router = require('express').Router();
const { getAll } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.use(tenantAuth);

// GET /api/admin/calendar/feed — iCal feed of all upcoming bookings
router.get('/feed', asyncHandler(async (req, res) => {
  const bookings = await getAll(
    `SELECT * FROM bookings
     WHERE tenant_id = $1 AND date >= CURRENT_DATE AND status IN ('confirmed', 'pending')
     ORDER BY date, start_time`,
    [req.tenantId]
  );

  const tenant = req.tenant || { name: 'Booking Platform', business_address: '' };

  // Build VCALENDAR with all bookings
  let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BookingPlatform//EN\r\nX-WR-CALNAME:${tenant.name} Bookings\r\n`;

  for (const b of bookings) {
    const date = b.date.toISOString ? b.date.toISOString().split('T')[0] : String(b.date).split('T')[0];
    const startTime = b.start_time.slice(0, 5).replace(':', '');
    const endTime = b.end_time.slice(0, 5).replace(':', '');
    const dtStart = `${date.replace(/-/g, '')}T${startTime}00`;
    const dtEnd = `${date.replace(/-/g, '')}T${endTime}00`;

    ics += `BEGIN:VEVENT\r\n`;
    ics += `UID:booking-${b.id}@bookingplatform\r\n`;
    ics += `DTSTART:${dtStart}\r\n`;
    ics += `DTEND:${dtEnd}\r\n`;
    ics += `SUMMARY:${b.customer_name} - ${b.service_names}\r\n`;
    ics += `DESCRIPTION:Booking #${b.id}\\nServices: ${b.service_names}\\nCustomer: ${b.customer_name}\\nEmail: ${b.customer_email}\\nStatus: ${b.status}\\nTotal: £${parseFloat(b.total_price).toFixed(2)}\r\n`;
    ics += `LOCATION:${tenant.business_address || ''}\r\n`;
    ics += `STATUS:${b.status === 'confirmed' ? 'CONFIRMED' : 'TENTATIVE'}\r\n`;
    ics += `END:VEVENT\r\n`;
  }

  ics += `END:VCALENDAR`;

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', 'attachment; filename="bookings.ics"');
  res.send(ics);
}));

// GET /api/admin/calendar/download/:bookingId — single booking as .ics
router.get('/download/:bookingId', asyncHandler(async (req, res) => {
  const { getOne } = require('../config/database');

  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.bookingId, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tenant = req.tenant || { name: 'Booking Platform', business_address: '' };
  const date = booking.date.toISOString ? booking.date.toISOString().split('T')[0] : String(booking.date).split('T')[0];
  const startTime = booking.start_time.slice(0, 5).replace(':', '');
  const endTime = booking.end_time.slice(0, 5).replace(':', '');
  const dtStart = `${date.replace(/-/g, '')}T${startTime}00`;
  const dtEnd = `${date.replace(/-/g, '')}T${endTime}00`;

  const ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//BookingPlatform//EN\r\nBEGIN:VEVENT\r\nUID:booking-${booking.id}@bookingplatform\r\nDTSTART:${dtStart}\r\nDTEND:${dtEnd}\r\nSUMMARY:${booking.service_names} at ${tenant.name}\r\nDESCRIPTION:Booking #${booking.id}\\n${booking.service_names}\\nTotal: £${parseFloat(booking.total_price).toFixed(2)}\r\nLOCATION:${tenant.business_address || ''}\r\nSTATUS:CONFIRMED\r\nEND:VEVENT\r\nEND:VCALENDAR`;

  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="booking-${booking.id}.ics"`);
  res.send(ics);
}));

module.exports = router;
