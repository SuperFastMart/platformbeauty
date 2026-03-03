const adminRouter = require('express').Router();
const publicRouter = require('express').Router({ mergeParams: true });
const crypto = require('crypto');
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth, resolveTenant } = require('../middleware/auth');
const { sendConsultationFormEmail } = require('../utils/emailService');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const VALID_FIELD_TYPES = ['short_answer', 'long_answer', 'single_answer', 'single_checkbox', 'multiple_choice', 'dropdown', 'yes_no', 'description_text'];

// ============================================
// ADMIN ROUTES (tenantAuth)
// ============================================
adminRouter.use(tenantAuth);

// GET /api/admin/consultation-forms — list all forms
adminRouter.get('/', asyncHandler(async (req, res) => {
  const forms = await getAll(
    `SELECT cf.*,
       (SELECT COUNT(*)::int FROM consultation_form_fields cff WHERE cff.form_id = cf.id AND cff.active = TRUE) AS field_count,
       (SELECT COUNT(*)::int FROM consultation_form_responses cfr WHERE cfr.form_id = cf.id) AS response_count,
       (SELECT COUNT(*)::int FROM consultation_form_responses cfr WHERE cfr.form_id = cf.id AND cfr.status = 'completed') AS completed_count
     FROM consultation_forms cf
     WHERE cf.tenant_id = $1 AND cf.active = TRUE
     ORDER BY cf.display_order, cf.created_at DESC`,
    [req.tenantId]
  );
  res.json(forms);
}));

// POST /api/admin/consultation-forms — create form
adminRouter.post('/', asyncHandler(async (req, res) => {
  const { name, description, send_mode, frequency, service_scope, service_ids, require_signature } = req.body;
  if (!name) return res.status(400).json({ error: 'Form name is required' });

  const form = await getOne(
    `INSERT INTO consultation_forms (tenant_id, name, description, send_mode, frequency, service_scope, service_ids, require_signature)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [req.tenantId, name, description || null,
     send_mode || 'before_appointment', frequency || 'every_time',
     service_scope || 'all',
     Array.isArray(service_ids) ? service_ids.join(',') : (service_ids || null),
     require_signature || false]
  );
  res.status(201).json(form);
}));

// GET /api/admin/consultation-forms/:id — get form + fields
adminRouter.get('/:id', asyncHandler(async (req, res) => {
  const form = await getOne(
    'SELECT * FROM consultation_forms WHERE id = $1 AND tenant_id = $2 AND active = TRUE',
    [req.params.id, req.tenantId]
  );
  if (!form) return res.status(404).json({ error: 'Form not found' });

  const fields = await getAll(
    'SELECT * FROM consultation_form_fields WHERE form_id = $1 AND tenant_id = $2 AND active = TRUE ORDER BY display_order',
    [form.id, req.tenantId]
  );
  res.json({ ...form, fields });
}));

// PUT /api/admin/consultation-forms/:id — update form settings
adminRouter.put('/:id', asyncHandler(async (req, res) => {
  const { name, description, send_mode, frequency, service_scope, service_ids, require_signature } = req.body;
  const form = await getOne(
    `UPDATE consultation_forms SET
       name = COALESCE($3, name),
       description = $4,
       send_mode = COALESCE($5, send_mode),
       frequency = COALESCE($6, frequency),
       service_scope = COALESCE($7, service_scope),
       service_ids = $8,
       require_signature = COALESCE($9, require_signature),
       updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND active = TRUE RETURNING *`,
    [req.params.id, req.tenantId, name, description !== undefined ? description : null,
     send_mode, frequency, service_scope,
     Array.isArray(service_ids) ? service_ids.join(',') : (service_ids || null),
     require_signature]
  );
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json(form);
}));

// DELETE /api/admin/consultation-forms/:id — soft-delete
adminRouter.delete('/:id', asyncHandler(async (req, res) => {
  await run(
    'UPDATE consultation_forms SET active = FALSE WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  res.json({ message: 'Form deleted' });
}));

// POST /api/admin/consultation-forms/:id/fields — add field
adminRouter.post('/:id/fields', asyncHandler(async (req, res) => {
  const { field_type, label, description, required, options } = req.body;
  if (!label) return res.status(400).json({ error: 'Label is required' });
  if (!VALID_FIELD_TYPES.includes(field_type)) {
    return res.status(400).json({ error: `Invalid field type. Must be one of: ${VALID_FIELD_TYPES.join(', ')}` });
  }

  // Auto-increment display_order
  const maxOrder = await getOne(
    'SELECT COALESCE(MAX(display_order), -1) AS max_order FROM consultation_form_fields WHERE form_id = $1 AND active = TRUE',
    [req.params.id]
  );

  const field = await getOne(
    `INSERT INTO consultation_form_fields (form_id, tenant_id, field_type, label, description, required, options, display_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [req.params.id, req.tenantId, field_type, label, description || null,
     required || false, options ? JSON.stringify(options) : null,
     (maxOrder?.max_order ?? -1) + 1]
  );
  res.status(201).json(field);
}));

// PUT /api/admin/consultation-forms/:id/fields/:fieldId — update field
adminRouter.put('/:id/fields/:fieldId', asyncHandler(async (req, res) => {
  const { field_type, label, description, required, options } = req.body;
  if (field_type && !VALID_FIELD_TYPES.includes(field_type)) {
    return res.status(400).json({ error: `Invalid field type` });
  }

  const field = await getOne(
    `UPDATE consultation_form_fields SET
       field_type = COALESCE($3, field_type),
       label = COALESCE($4, label),
       description = $5,
       required = COALESCE($6, required),
       options = COALESCE($7, options)
     WHERE id = $1 AND form_id = $2 AND tenant_id = $8 RETURNING *`,
    [req.params.fieldId, req.params.id, field_type, label,
     description !== undefined ? description : null,
     required, options ? JSON.stringify(options) : null, req.tenantId]
  );
  if (!field) return res.status(404).json({ error: 'Field not found' });
  res.json(field);
}));

// DELETE /api/admin/consultation-forms/:id/fields/:fieldId — soft-delete field
adminRouter.delete('/:id/fields/:fieldId', asyncHandler(async (req, res) => {
  await run(
    'UPDATE consultation_form_fields SET active = FALSE WHERE id = $1 AND form_id = $2 AND tenant_id = $3',
    [req.params.fieldId, req.params.id, req.tenantId]
  );
  res.json({ message: 'Field deleted' });
}));

// PUT /api/admin/consultation-forms/:id/fields/reorder — batch reorder
adminRouter.put('/:id/fields/reorder', asyncHandler(async (req, res) => {
  const { fields } = req.body;
  if (!Array.isArray(fields)) return res.status(400).json({ error: 'fields array required' });

  for (const f of fields) {
    await run(
      'UPDATE consultation_form_fields SET display_order = $1 WHERE id = $2 AND form_id = $3 AND tenant_id = $4',
      [f.display_order, f.id, req.params.id, req.tenantId]
    );
  }
  res.json({ message: 'Reordered' });
}));

// POST /api/admin/consultation-forms/:id/send — manually send form to customer
adminRouter.post('/:id/send', asyncHandler(async (req, res) => {
  const { customerId, bookingId } = req.body;
  if (!customerId) return res.status(400).json({ error: 'customerId is required' });

  const form = await getOne(
    'SELECT * FROM consultation_forms WHERE id = $1 AND tenant_id = $2 AND active = TRUE',
    [req.params.id, req.tenantId]
  );
  if (!form) return res.status(404).json({ error: 'Form not found' });

  const customer = await getOne(
    'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
    [customerId, req.tenantId]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  if (!customer.email) return res.status(400).json({ error: 'Customer has no email address' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);

  const token = crypto.randomBytes(32).toString('hex');
  await getOne(
    `INSERT INTO consultation_form_responses (tenant_id, form_id, customer_id, booking_id, token, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [req.tenantId, form.id, customer.id, bookingId || null, token]
  );

  await sendConsultationFormEmail(customer, form, token, tenant, bookingId || null);
  res.json({ message: 'Form sent to customer' });
}));

// GET /api/admin/consultation-forms/customer/:customerId/responses — all form responses for customer
adminRouter.get('/customer/:customerId/responses', asyncHandler(async (req, res) => {
  const responses = await getAll(
    `SELECT cfr.*, cf.name AS form_name, cf.require_signature
     FROM consultation_form_responses cfr
     JOIN consultation_forms cf ON cf.id = cfr.form_id
     WHERE cfr.customer_id = $1 AND cfr.tenant_id = $2
     ORDER BY cfr.created_at DESC`,
    [req.params.customerId, req.tenantId]
  );

  // Attach fields array to completed responses for display
  for (const resp of responses) {
    if (resp.responses && resp.status === 'completed') {
      resp.fields = await getAll(
        'SELECT id, label, field_type, display_order FROM consultation_form_fields WHERE form_id = $1 AND active = true ORDER BY display_order',
        [resp.form_id]
      );
    }
  }
  res.json(responses);
}));

// ============================================
// PUBLIC ROUTES (resolveTenant)
// ============================================
publicRouter.use(resolveTenant);

// GET /api/t/:tenant/consultation-forms/fill/:token — get form for filling
publicRouter.get('/fill/:token', asyncHandler(async (req, res) => {
  const response = await getOne(
    `SELECT cfr.*, cf.name AS form_name, cf.description AS form_description, cf.require_signature
     FROM consultation_form_responses cfr
     JOIN consultation_forms cf ON cf.id = cfr.form_id
     WHERE cfr.token = $1 AND cfr.tenant_id = $2`,
    [req.params.token, req.tenantId]
  );

  if (!response) return res.status(404).json({ error: 'Form not found or link has expired' });

  if (response.status === 'completed') {
    return res.json({
      already_completed: true,
      form: { name: response.form_name, description: response.form_description },
      completed_at: response.completed_at,
    });
  }

  const fields = await getAll(
    'SELECT id, field_type, label, description, required, options, display_order FROM consultation_form_fields WHERE form_id = $1 AND active = TRUE ORDER BY display_order',
    [response.form_id]
  );

  const tenant = await getOne(
    'SELECT name, slug, primary_color, logo_url FROM tenants WHERE id = $1',
    [req.tenantId]
  );

  const customer = await getOne(
    'SELECT name FROM customers WHERE id = $1',
    [response.customer_id]
  );

  res.json({
    already_completed: false,
    form: { id: response.form_id, name: response.form_name, description: response.form_description, require_signature: response.require_signature },
    fields,
    tenant,
    customer_name: customer?.name || '',
  });
}));

// POST /api/t/:tenant/consultation-forms/fill/:token — submit form
publicRouter.post('/fill/:token', asyncHandler(async (req, res) => {
  const { responses, signed } = req.body;

  const existing = await getOne(
    'SELECT * FROM consultation_form_responses WHERE token = $1 AND tenant_id = $2',
    [req.params.token, req.tenantId]
  );

  if (!existing) return res.status(404).json({ error: 'Form not found' });
  if (existing.status === 'completed') return res.status(400).json({ error: 'Form already submitted' });

  await run(
    `UPDATE consultation_form_responses SET
       responses = $1, signed = $2, signed_at = $3, status = 'completed', completed_at = NOW()
     WHERE token = $4 AND tenant_id = $5`,
    [JSON.stringify(responses), signed || false, signed ? new Date() : null,
     req.params.token, req.tenantId]
  );

  res.json({ message: 'Form submitted successfully' });
}));

// ============================================
// AUTO-SEND HELPER (called from booking confirmation)
// ============================================
async function autoSendConsultationForms(booking, tenant) {
  try {
    const bookingServiceIds = String(booking.service_ids).split(',').map(id => parseInt(id.trim(), 10)).filter(Boolean);

    // Find matching active forms with send_mode = 'before_appointment'
    const forms = await getAll(
      `SELECT * FROM consultation_forms
       WHERE tenant_id = $1 AND active = TRUE AND send_mode = 'before_appointment'`,
      [tenant.id]
    );

    const customer = await getOne(
      'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
      [booking.customer_id, tenant.id]
    );
    if (!customer || !customer.email) return;

    for (const form of forms) {
      // Check service scope
      if (form.service_scope === 'specific' && form.service_ids) {
        const formServiceIds = form.service_ids.split(',').map(id => parseInt(id.trim(), 10)).filter(Boolean);
        const hasOverlap = bookingServiceIds.some(id => formServiceIds.includes(id));
        if (!hasOverlap) continue;
      }

      // Check frequency — if only_once, skip if already completed
      if (form.frequency === 'only_once') {
        const existing = await getOne(
          `SELECT id FROM consultation_form_responses
           WHERE form_id = $1 AND customer_id = $2 AND tenant_id = $3 AND status = 'completed'`,
          [form.id, customer.id, tenant.id]
        );
        if (existing) continue;
      }

      // Generate token and create pending response
      const token = crypto.randomBytes(32).toString('hex');
      await getOne(
        `INSERT INTO consultation_form_responses (tenant_id, form_id, customer_id, booking_id, token, status)
         VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
        [tenant.id, form.id, customer.id, booking.id, token]
      );

      // Send email
      await sendConsultationFormEmail(customer, form, token, tenant, booking.id);
      console.log(`[ConsultationForm] Auto-sent form "${form.name}" to ${customer.email} for booking #${booking.id}`);
    }
  } catch (err) {
    console.error('[ConsultationForm] Auto-send error:', err.message);
  }
}

module.exports = { adminRouter, publicRouter, autoSendConsultationForms };
