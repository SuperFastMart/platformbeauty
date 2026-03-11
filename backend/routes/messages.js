const router = require('express').Router();
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');
const { sendEmail } = require('../utils/emailService');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

router.use(tenantAuth);

// GET /api/admin/messages/conversations — customer list with last message and unread count
router.get('/conversations', asyncHandler(async (req, res) => {
  const conversations = await getAll(
    `SELECT c.id, c.name, c.email, c.phone,
       (SELECT COUNT(*) FROM messages m WHERE m.customer_id = c.id AND m.tenant_id = c.tenant_id AND m.direction = 'inbound' AND m.read_at IS NULL) as unread_count,
       (SELECT body FROM messages m WHERE m.customer_id = c.id AND m.tenant_id = c.tenant_id ORDER BY m.created_at DESC LIMIT 1) as last_message,
       (SELECT created_at FROM messages m WHERE m.customer_id = c.id AND m.tenant_id = c.tenant_id ORDER BY m.created_at DESC LIMIT 1) as last_message_at
     FROM customers c
     WHERE c.tenant_id = $1
       AND EXISTS (SELECT 1 FROM messages m WHERE m.customer_id = c.id AND m.tenant_id = c.tenant_id)
     ORDER BY last_message_at DESC`,
    [req.tenantId]
  );

  res.json(conversations);
}));

// GET /api/admin/messages/customer/:id — full message thread
router.get('/customer/:id', asyncHandler(async (req, res) => {
  const messages = await getAll(
    `SELECT * FROM messages
     WHERE tenant_id = $1 AND customer_id = $2
     ORDER BY created_at ASC`,
    [req.tenantId, req.params.id]
  );

  // Mark inbound messages as read
  await run(
    `UPDATE messages SET read_at = NOW()
     WHERE tenant_id = $1 AND customer_id = $2 AND direction = 'inbound' AND read_at IS NULL`,
    [req.tenantId, req.params.id]
  );

  res.json(messages);
}));

// POST /api/admin/messages/send — send message to customer
router.post('/send', asyncHandler(async (req, res) => {
  const { customerId, subject, body } = req.body;

  if (!customerId || !body) {
    return res.status(400).json({ error: 'customerId and body are required' });
  }

  const customer = await getOne(
    'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
    [customerId, req.tenantId]
  );

  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  // Save message
  const message = await getOne(
    `INSERT INTO messages (tenant_id, customer_id, direction, subject, body, sent_via)
     VALUES ($1, $2, 'outbound', $3, $4, 'email') RETURNING *`,
    [req.tenantId, customerId, subject || null, body]
  );

  // Send email (fire and forget)
  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  sendEmail({
    to: customer.email,
    toName: customer.name,
    subject: subject || `Message from ${tenant.name}`,
    html: `<p>${body.replace(/\n/g, '<br>')}</p>`,
    tenant,
    emailType: 'message',
    customerId: customer.id,
  }).catch(err => console.error('Message email error:', err));

  res.status(201).json(message);
}));

// PATCH /api/admin/messages/:id/read — mark message as read
router.patch('/:id/read', asyncHandler(async (req, res) => {
  await run(
    'UPDATE messages SET read_at = NOW() WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  res.json({ success: true });
}));

// --- Templates ---

// GET /api/admin/messages/templates
router.get('/templates', asyncHandler(async (req, res) => {
  const templates = await getAll(
    'SELECT * FROM message_templates WHERE tenant_id = $1 ORDER BY name',
    [req.tenantId]
  );
  res.json(templates);
}));

// POST /api/admin/messages/templates
router.post('/templates', asyncHandler(async (req, res) => {
  const { name, subject, body, category } = req.body;
  if (!name || !body) {
    return res.status(400).json({ error: 'name and body are required' });
  }

  const template = await getOne(
    `INSERT INTO message_templates (tenant_id, name, subject, body, category)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [req.tenantId, name, subject || null, body, category || null]
  );

  res.status(201).json(template);
}));

// PUT /api/admin/messages/templates/:id
router.put('/templates/:id', asyncHandler(async (req, res) => {
  const { name, subject, body, category, active } = req.body;

  const template = await getOne(
    `UPDATE message_templates SET name = $3, subject = $4, body = $5, category = $6, active = $7
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [req.params.id, req.tenantId, name, subject || null, body, category || null, active ?? true]
  );

  if (!template) return res.status(404).json({ error: 'Template not found' });
  res.json(template);
}));

// DELETE /api/admin/messages/templates/:id
router.delete('/templates/:id', asyncHandler(async (req, res) => {
  await run('DELETE FROM message_templates WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json({ message: 'Deleted' });
}));

// GET /api/admin/messages/comms-log — unified email + SMS log across all customers
router.get('/comms-log', asyncHandler(async (req, res) => {
  const { channel, page = 1, limit = 50, search } = req.query;
  const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

  let emails = [];
  let sms = [];

  if (!channel || channel === 'all' || channel === 'email') {
    let emailSql = `SELECT e.id, e.recipient_email, e.recipient_name, e.email_type AS type,
         e.subject, e.status, e.error_message, e.sent_at, e.created_at, 'email' AS channel,
         e.booking_id, e.customer_id
       FROM email_logs e
       WHERE e.tenant_id = $1`;
    const emailParams = [req.tenantId];
    let idx = 2;
    if (search) {
      emailSql += ` AND (e.recipient_name ILIKE $${idx} OR e.recipient_email ILIKE $${idx} OR e.subject ILIKE $${idx})`;
      emailParams.push(`%${search}%`);
      idx++;
    }
    emailSql += ` ORDER BY e.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    emailParams.push(parseInt(limit), offset);
    emails = await getAll(emailSql, emailParams);
  }

  if (!channel || channel === 'all' || channel === 'sms') {
    let smsSql = `SELECT s.id, s.recipient_phone, s.recipient_name, s.sms_type AS type,
         s.message_preview, s.status, s.error_message, s.sent_at, s.created_at, 'sms' AS channel,
         s.booking_id, s.customer_id
       FROM sms_logs s
       WHERE s.tenant_id = $1`;
    const smsParams = [req.tenantId];
    let idx = 2;
    if (search) {
      smsSql += ` AND (s.recipient_name ILIKE $${idx} OR s.recipient_phone ILIKE $${idx} OR s.message_preview ILIKE $${idx})`;
      smsParams.push(`%${search}%`);
      idx++;
    }
    smsSql += ` ORDER BY s.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
    smsParams.push(parseInt(limit), offset);
    sms = await getAll(smsSql, smsParams);
  }

  // Merge and sort by created_at
  const combined = [...emails, ...sms].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  );

  // Get totals for pagination
  const emailCount = await getOne(
    'SELECT COUNT(*)::int as count FROM email_logs WHERE tenant_id = $1',
    [req.tenantId]
  );
  const smsCount = await getOne(
    'SELECT COUNT(*)::int as count FROM sms_logs WHERE tenant_id = $1',
    [req.tenantId]
  );

  res.json({
    items: combined,
    total_emails: emailCount?.count || 0,
    total_sms: smsCount?.count || 0,
    page: parseInt(page),
    limit: parseInt(limit),
  });
}));

module.exports = router;
