const adminRouter = require('express').Router();
const platformRouter = require('express').Router();
const { getOne, getAll, run } = require('../config/database');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const PLATFORM_ADMIN_EMAIL = process.env.PLATFORM_ADMIN_EMAIL || 'admin@bookingplatform.com';

// Simple email helper for support notifications (no tenant context needed)
async function sendSupportEmail(to, subject, htmlBody) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.log(`[Support Email] Would send "${subject}" to ${to}`);
    return;
  }
  try {
    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Booking Platform', email: process.env.BREVO_FROM_EMAIL || 'noreply@bookingplatform.com' },
        to: [{ email: to }],
        subject,
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #8B2635; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
              <h2 style="margin: 0;">${subject}</h2>
            </div>
            <div style="padding: 20px; background: #f9f9f9; border-radius: 0 0 8px 8px;">
              ${htmlBody}
            </div>
          </div>
        `,
      }),
    });
  } catch (err) {
    console.error('Support email error:', err.message);
  }
}

// ============================================
// TENANT ADMIN ROUTES
// ============================================

// POST / — create a support ticket
adminRouter.post('/', asyncHandler(async (req, res) => {
  const { subject, description, category, priority } = req.body;

  if (!subject || !description) {
    return res.status(400).json({ error: 'Subject and description are required' });
  }

  // Get the tenant user info
  const user = await getOne(
    'SELECT username, email FROM tenant_users WHERE id = $1 AND tenant_id = $2',
    [req.user.id, req.tenantId]
  );
  const tenant = await getOne('SELECT name FROM tenants WHERE id = $1', [req.tenantId]);

  const ticket = await getOne(
    `INSERT INTO support_tickets (tenant_id, subject, category, priority, created_by_email, created_by_name)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.tenantId, subject, category || 'general', priority || 'normal', user?.email || '', user?.username || '']
  );

  // Create the first message
  await run(
    `INSERT INTO ticket_messages (ticket_id, content, sender_type, sender_name, sender_email)
     VALUES ($1, $2, 'tenant', $3, $4)`,
    [ticket.id, description, user?.username || '', user?.email || '']
  );

  // Non-blocking email to platform admin
  sendSupportEmail(
    PLATFORM_ADMIN_EMAIL,
    `New support ticket: ${subject}`,
    `<p><strong>Subject:</strong> ${subject}</p>
     <p><strong>Category:</strong> ${(category || 'general').replace('_', ' ')}</p>
     <p><strong>Priority:</strong> ${priority || 'normal'}</p>
     <p><strong>From:</strong> ${tenant?.name || 'Unknown'} (${user?.email || ''})</p>
     <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />
     <p>${description}</p>`
  );

  // Create platform notification
  await run(
    `INSERT INTO platform_notifications (type, title, body, metadata, tenant_id)
     VALUES ('ticket_new', $1, $2, $3, $4)`,
    [`New ticket: ${subject}`, `From ${tenant?.name || 'Unknown'}`, JSON.stringify({ ticketId: ticket.id, category, priority }), req.tenantId]
  ).catch(() => {});

  res.status(201).json(ticket);
}));

// GET /unread-count — count tickets with unread platform replies
adminRouter.get('/unread-count', asyncHandler(async (req, res) => {
  const result = await getOne(
    `SELECT COUNT(DISTINCT st.id) as count
     FROM support_tickets st
     WHERE st.tenant_id = $1
       AND st.status IN ('open', 'in_progress')
       AND EXISTS (
         SELECT 1 FROM ticket_messages tm
         WHERE tm.ticket_id = st.id
         AND tm.sender_type = 'platform'
         AND tm.id = (SELECT MAX(id) FROM ticket_messages WHERE ticket_id = st.id)
       )`,
    [req.tenantId]
  );
  res.json({ count: parseInt(result.count) });
}));

// GET / — list tenant's tickets
adminRouter.get('/', asyncHandler(async (req, res) => {
  const tickets = await getAll(
    `SELECT st.*,
       (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = st.id) as message_count
     FROM support_tickets st
     WHERE st.tenant_id = $1
     ORDER BY st.updated_at DESC`,
    [req.tenantId]
  );
  res.json(tickets);
}));

// GET /:id — ticket detail with messages
adminRouter.get('/:id', asyncHandler(async (req, res) => {
  const ticket = await getOne(
    'SELECT * FROM support_tickets WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const messages = await getAll(
    'SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC',
    [ticket.id]
  );

  res.json({ ...ticket, messages });
}));

// POST /:id/messages — add reply
adminRouter.post('/:id/messages', asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });

  const ticket = await getOne(
    'SELECT * FROM support_tickets WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const user = await getOne(
    'SELECT username, email FROM tenant_users WHERE id = $1 AND tenant_id = $2',
    [req.user.id, req.tenantId]
  );

  const message = await getOne(
    `INSERT INTO ticket_messages (ticket_id, content, sender_type, sender_name, sender_email)
     VALUES ($1, $2, 'tenant', $3, $4) RETURNING *`,
    [ticket.id, content, user?.username || '', user?.email || '']
  );

  await run('UPDATE support_tickets SET updated_at = NOW() WHERE id = $1', [ticket.id]);

  // Notify platform admin
  const tenant = await getOne('SELECT name FROM tenants WHERE id = $1', [req.tenantId]);
  sendSupportEmail(
    PLATFORM_ADMIN_EMAIL,
    `Reply on ticket: ${ticket.subject}`,
    `<p><strong>${user?.username || 'Tenant'}</strong> from <strong>${tenant?.name || 'Unknown'}</strong> replied to:</p>
     <p style="font-size: 18px; font-weight: bold;">${ticket.subject}</p>`
  );

  res.status(201).json(message);
}));

// PUT /:id/status — tenant admin can resolve their own tickets
adminRouter.put('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (status !== 'resolved') {
    return res.status(400).json({ error: 'You can only mark tickets as resolved' });
  }
  const ticket = await getOne(
    'SELECT * FROM support_tickets WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  await run(
    `UPDATE support_tickets SET status = 'resolved', resolved_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [ticket.id]
  );
  res.json({ success: true, status: 'resolved' });
}));

// ============================================
// PLATFORM ADMIN ROUTES
// ============================================

// GET / — list all tickets across tenants
platformRouter.get('/', asyncHandler(async (req, res) => {
  const { status, priority, search } = req.query;

  let sql = `
    SELECT st.*, t.name as tenant_name,
      (SELECT COUNT(*) FROM ticket_messages WHERE ticket_id = st.id) as message_count
    FROM support_tickets st
    JOIN tenants t ON t.id = st.tenant_id
    WHERE 1=1
  `;
  const params = [];
  let paramIdx = 1;

  if (status) {
    sql += ` AND st.status = $${paramIdx++}`;
    params.push(status);
  }
  if (priority) {
    sql += ` AND st.priority = $${paramIdx++}`;
    params.push(priority);
  }
  if (search) {
    sql += ` AND (st.subject ILIKE $${paramIdx} OR t.name ILIKE $${paramIdx})`;
    params.push(`%${search}%`);
    paramIdx++;
  }

  sql += ' ORDER BY st.updated_at DESC';

  const tickets = await getAll(sql, params);
  res.json(tickets);
}));

// GET /:id — ticket detail with messages + tenant info
platformRouter.get('/:id', asyncHandler(async (req, res) => {
  const ticket = await getOne(
    `SELECT st.*, t.name as tenant_name, t.owner_email as tenant_email
     FROM support_tickets st
     JOIN tenants t ON t.id = st.tenant_id
     WHERE st.id = $1`,
    [req.params.id]
  );
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const messages = await getAll(
    'SELECT * FROM ticket_messages WHERE ticket_id = $1 ORDER BY created_at ASC',
    [ticket.id]
  );

  res.json({ ...ticket, messages });
}));

// POST /:id/messages — platform admin reply
platformRouter.post('/:id/messages', asyncHandler(async (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Content is required' });

  const ticket = await getOne(
    `SELECT st.*, t.name as tenant_name
     FROM support_tickets st JOIN tenants t ON t.id = st.tenant_id
     WHERE st.id = $1`,
    [req.params.id]
  );
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const message = await getOne(
    `INSERT INTO ticket_messages (ticket_id, content, sender_type, sender_name, sender_email)
     VALUES ($1, $2, 'platform', 'Booking Platform Support', $3) RETURNING *`,
    [ticket.id, content, PLATFORM_ADMIN_EMAIL]
  );

  // Auto-set to in_progress if still open
  if (ticket.status === 'open') {
    await run("UPDATE support_tickets SET status = 'in_progress', updated_at = NOW() WHERE id = $1", [ticket.id]);
  } else {
    await run('UPDATE support_tickets SET updated_at = NOW() WHERE id = $1', [ticket.id]);
  }

  // Notify the ticket creator
  sendSupportEmail(
    ticket.created_by_email,
    `Reply on your support ticket: ${ticket.subject}`,
    `<p>The support team has replied to your ticket:</p>
     <p style="font-size: 18px; font-weight: bold;">${ticket.subject}</p>
     <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />
     <div style="padding: 12px; background: white; border-radius: 4px; border-left: 3px solid #8B2635;">
       ${content.replace(/\n/g, '<br>')}
     </div>`
  );

  res.status(201).json(message);
}));

// PUT /:id/status — update ticket status
platformRouter.put('/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const ticket = await getOne('SELECT * FROM support_tickets WHERE id = $1', [req.params.id]);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

  const resolvedAt = (status === 'resolved' || status === 'closed') ? 'NOW()' : 'NULL';
  await run(
    `UPDATE support_tickets SET status = $1, resolved_at = ${resolvedAt}, updated_at = NOW() WHERE id = $2`,
    [status, ticket.id]
  );

  // Notify tenant
  sendSupportEmail(
    ticket.created_by_email,
    `Ticket update: ${ticket.subject} — now ${status.replace('_', ' ')}`,
    `<p>Your support ticket has been updated:</p>
     <p style="font-size: 18px; font-weight: bold;">${ticket.subject}</p>
     <p>New status: <strong style="text-transform: capitalize;">${status.replace('_', ' ')}</strong></p>`
  );

  res.json({ success: true, status });
}));

module.exports = { adminRouter, platformRouter };
