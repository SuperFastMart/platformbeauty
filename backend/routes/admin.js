const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { pool, getOne, getAll, run } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');
const {
  sendBookingApprovedNotification, sendBookingRejectedNotification,
  sendRequestApprovedNotification, sendRequestRejectedNotification,
  sendBookingConfirmedSMS, sendBookingRejectedSMS,
  sendCompletionFollowUpEmail,
} = require('../utils/emailService');
const { chargeNoShow, getCustomerPaymentMethods } = require('../utils/stripeService');
const { awardStampForBooking } = require('./loyalty');
const { TOTP, Secret } = require('otpauth');
const multer = require('multer');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PDF, DOC, DOCX, PNG and JPG files are allowed'));
  },
});
const QRCode = require('qrcode');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ============================================
// AUTH (no middleware)
// ============================================

// POST /api/admin/auth/login
router.post('/auth/login', asyncHandler(async (req, res) => {
  const { email, password, mfa_code } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await getOne(
    `SELECT tu.*, t.name as tenant_name, t.slug as tenant_slug
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.email = $1 AND t.active = TRUE`,
    [email]
  );

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Check MFA if enabled
  if (user.mfa_enabled && user.mfa_secret) {
    if (!mfa_code) {
      // Return MFA required flag — client should show MFA input
      return res.json({
        mfa_required: true,
        message: 'Please enter your two-factor authentication code',
      });
    }

    // Verify TOTP code
    const totp = new TOTP({ secret: Secret.fromBase32(user.mfa_secret), algorithm: 'SHA1', digits: 6, period: 30 });
    const valid = totp.validate({ token: mfa_code, window: 1 }) !== null;

    // Also check backup codes
    if (!valid && user.mfa_backup_codes) {
      const backupCodes = JSON.parse(user.mfa_backup_codes);
      const codeIdx = backupCodes.indexOf(mfa_code);
      if (codeIdx !== -1) {
        // Remove used backup code
        backupCodes.splice(codeIdx, 1);
        await run('UPDATE tenant_users SET mfa_backup_codes = $1 WHERE id = $2', [JSON.stringify(backupCodes), user.id]);
      } else {
        return res.status(401).json({ error: 'Invalid authentication code' });
      }
    } else if (!valid) {
      return res.status(401).json({ error: 'Invalid authentication code' });
    }
  }

  // Update last login timestamp
  run('UPDATE tenant_users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});

  const token = jwt.sign(
    { id: user.id, tenantId: user.tenant_id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '24h' }
  );

  res.json({
    token,
    user: {
      id: user.id, tenantId: user.tenant_id, username: user.username,
      email: user.email, role: user.role,
      tenantName: user.tenant_name, tenantSlug: user.tenant_slug,
      email_verified: user.email_verified !== false,
      mfa_enabled: !!user.mfa_enabled,
    }
  });
}));

// POST /api/admin/auth/mfa/verify — verify MFA code during login (alternative to inline)
router.post('/auth/mfa/verify', asyncHandler(async (req, res) => {
  const { email, password, mfa_code } = req.body;
  if (!email || !password || !mfa_code) {
    return res.status(400).json({ error: 'Email, password, and MFA code are required' });
  }

  // Re-validate credentials + MFA by forwarding to login handler logic
  const user = await getOne(
    `SELECT tu.*, t.name as tenant_name, t.slug as tenant_slug
     FROM tenant_users tu
     JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.email = $1 AND t.active = TRUE`,
    [email]
  );

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) return res.status(401).json({ error: 'Invalid credentials' });

  const totp = new TOTP({ secret: Secret.fromBase32(user.mfa_secret), algorithm: 'SHA1', digits: 6, period: 30 });
  const valid = totp.validate({ token: mfa_code, window: 1 }) !== null;

  if (!valid) {
    // Check backup codes
    if (user.mfa_backup_codes) {
      const backupCodes = JSON.parse(user.mfa_backup_codes);
      const codeIdx = backupCodes.indexOf(mfa_code);
      if (codeIdx !== -1) {
        backupCodes.splice(codeIdx, 1);
        await run('UPDATE tenant_users SET mfa_backup_codes = $1 WHERE id = $2', [JSON.stringify(backupCodes), user.id]);
      } else {
        return res.status(401).json({ error: 'Invalid authentication code' });
      }
    } else {
      return res.status(401).json({ error: 'Invalid authentication code' });
    }
  }

  run('UPDATE tenant_users SET last_login_at = NOW() WHERE id = $1', [user.id]).catch(() => {});

  const token = jwt.sign(
    { id: user.id, tenantId: user.tenant_id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRY || '24h' }
  );

  res.json({
    token,
    user: {
      id: user.id, tenantId: user.tenant_id, username: user.username,
      email: user.email, role: user.role,
      tenantName: user.tenant_name, tenantSlug: user.tenant_slug,
      email_verified: user.email_verified !== false,
      mfa_enabled: true,
    }
  });
}));

// ============================================
// All routes below require tenantAuth
// ============================================
router.use(tenantAuth);

// ============================================
// MFA (Two-Factor Authentication)
// ============================================

// GET /api/admin/mfa/status — check current MFA status
router.get('/mfa/status', asyncHandler(async (req, res) => {
  const user = await getOne(
    'SELECT mfa_enabled, mfa_dismissed_at FROM tenant_users WHERE id = $1',
    [req.user.id]
  );
  res.json({
    mfa_enabled: !!user?.mfa_enabled,
    mfa_dismissed_at: user?.mfa_dismissed_at || null,
  });
}));

// POST /api/admin/mfa/setup — generate TOTP secret and QR code
router.post('/mfa/setup', asyncHandler(async (req, res) => {
  const user = await getOne('SELECT email, mfa_enabled FROM tenant_users WHERE id = $1', [req.user.id]);
  if (user.mfa_enabled) {
    return res.status(400).json({ error: 'MFA is already enabled. Disable it first to reconfigure.' });
  }

  const secret = new Secret({ size: 20 });
  const totp = new TOTP({
    issuer: 'Boukd',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret,
  });

  const otpauthUri = totp.toString();

  // Generate QR code as data URL
  const qrDataUrl = await QRCode.toDataURL(otpauthUri, { width: 256, margin: 2 });

  // Store secret temporarily (not yet enabled)
  await run(
    'UPDATE tenant_users SET mfa_secret = $1 WHERE id = $2',
    [secret.base32, req.user.id]
  );

  res.json({
    secret: secret.base32,
    qr_code: qrDataUrl,
    otpauth_uri: otpauthUri,
  });
}));

// POST /api/admin/mfa/verify-setup — verify TOTP code and enable MFA
router.post('/mfa/verify-setup', asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Verification code is required' });

  const user = await getOne('SELECT mfa_secret, mfa_enabled FROM tenant_users WHERE id = $1', [req.user.id]);
  if (!user.mfa_secret) {
    return res.status(400).json({ error: 'Please start MFA setup first' });
  }
  if (user.mfa_enabled) {
    return res.status(400).json({ error: 'MFA is already enabled' });
  }

  const totp = new TOTP({ secret: Secret.fromBase32(user.mfa_secret), algorithm: 'SHA1', digits: 6, period: 30 });
  const valid = totp.validate({ token: code, window: 1 }) !== null;

  if (!valid) {
    return res.status(400).json({ error: 'Invalid code. Please try again.' });
  }

  // Generate backup codes
  const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex'));

  await run(
    'UPDATE tenant_users SET mfa_enabled = TRUE, mfa_backup_codes = $1 WHERE id = $2',
    [JSON.stringify(backupCodes), req.user.id]
  );

  res.json({
    success: true,
    backup_codes: backupCodes,
    message: 'Two-factor authentication has been enabled. Save your backup codes.',
  });
}));

// POST /api/admin/mfa/disable — disable MFA (requires current TOTP code)
router.post('/mfa/disable', asyncHandler(async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Current authentication code is required' });

  const user = await getOne('SELECT mfa_secret, mfa_enabled FROM tenant_users WHERE id = $1', [req.user.id]);
  if (!user.mfa_enabled) {
    return res.status(400).json({ error: 'MFA is not enabled' });
  }

  const totp = new TOTP({ secret: Secret.fromBase32(user.mfa_secret), algorithm: 'SHA1', digits: 6, period: 30 });
  const valid = totp.validate({ token: code, window: 1 }) !== null;

  if (!valid) return res.status(400).json({ error: 'Invalid code' });

  await run(
    'UPDATE tenant_users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_backup_codes = NULL WHERE id = $1',
    [req.user.id]
  );

  res.json({ success: true, message: 'Two-factor authentication has been disabled' });
}));

// POST /api/admin/mfa/dismiss — dismiss the MFA suggestion banner
router.post('/mfa/dismiss', asyncHandler(async (req, res) => {
  await run('UPDATE tenant_users SET mfa_dismissed_at = NOW() WHERE id = $1', [req.user.id]);
  res.json({ success: true });
}));

// ============================================
// TAX & COMPLIANCE (DAC7)
// ============================================

// GET /api/admin/tax-info — retrieve tenant tax/identity fields
router.get('/tax-info', asyncHandler(async (req, res) => {
  const tenant = await getOne(
    `SELECT legal_name, legal_entity_type, tax_reference, date_of_birth,
            address_line_1, address_line_2, city, postcode, country,
            tax_info_completed_at, created_at
     FROM tenants WHERE id = $1`,
    [req.tenantId]
  );
  res.json(tenant || {});
}));

// PUT /api/admin/tax-info — save tenant tax/identity fields
router.put('/tax-info', asyncHandler(async (req, res) => {
  const { legal_name, legal_entity_type, tax_reference, date_of_birth,
          address_line_1, address_line_2, city, postcode, country } = req.body;

  // Validate required fields
  if (!legal_name || !address_line_1 || !city || !postcode) {
    return res.status(400).json({ error: 'Legal name, address, city and postcode are required' });
  }
  if (legal_entity_type === 'individual' && !date_of_birth) {
    return res.status(400).json({ error: 'Date of birth is required for individual sellers' });
  }

  await run(
    `UPDATE tenants SET
      legal_name = $1, legal_entity_type = $2, tax_reference = $3,
      date_of_birth = $4, address_line_1 = $5, address_line_2 = $6,
      city = $7, postcode = $8, country = $9,
      tax_info_completed_at = COALESCE(tax_info_completed_at, NOW()),
      updated_at = NOW()
     WHERE id = $10`,
    [legal_name, legal_entity_type || 'individual', tax_reference || null,
     date_of_birth || null, address_line_1, address_line_2 || null,
     city, postcode, country || 'United Kingdom', req.tenantId]
  );

  res.json({ success: true });
}));

// ============================================
// SERVICES
// ============================================

// GET /api/admin/services
router.get('/services', asyncHandler(async (req, res) => {
  const services = await getAll(
    `SELECT s.*, COALESCE(sf.form_count, 0)::int AS form_count
     FROM services s
     LEFT JOIN (
       SELECT service_id, COUNT(*)::int AS form_count
       FROM service_forms WHERE tenant_id = $1 AND active = TRUE
       GROUP BY service_id
     ) sf ON sf.service_id = s.id
     WHERE s.tenant_id = $1
     ORDER BY s.category, s.display_order, s.name`,
    [req.tenantId]
  );
  res.json(services);
}));

// POST /api/admin/services
router.post('/services', asyncHandler(async (req, res) => {
  const { name, description, duration, price, category, display_order, deposit_enabled, deposit_type, deposit_value, is_addon } = req.body;

  if (!name || !duration || !price) {
    return res.status(400).json({ error: 'Name, duration, and price are required' });
  }

  const numDuration = parseInt(duration);
  const numPrice = parseFloat(price);
  if (isNaN(numDuration) || numDuration < 5 || numDuration > 480) {
    return res.status(400).json({ error: 'Duration must be between 5 and 480 minutes' });
  }
  if (isNaN(numPrice) || numPrice < 0 || numPrice > 10000) {
    return res.status(400).json({ error: 'Price must be between 0 and 10,000' });
  }

  // Validate deposit fields
  if (deposit_enabled) {
    const dVal = parseFloat(deposit_value);
    if (isNaN(dVal) || dVal <= 0) {
      return res.status(400).json({ error: 'Deposit value must be greater than 0' });
    }
    if (deposit_type === 'percentage' && dVal > 100) {
      return res.status(400).json({ error: 'Deposit percentage cannot exceed 100%' });
    }
    if (deposit_type === 'fixed' && dVal > numPrice) {
      return res.status(400).json({ error: 'Deposit amount cannot exceed the service price' });
    }
  }

  // Enforce plan service limit
  const tenant = await getOne('SELECT subscription_tier FROM tenants WHERE id = $1', [req.tenantId]);
  const plan = await getOne(
    'SELECT max_services FROM subscription_plans WHERE tier = $1 AND is_active = TRUE',
    [tenant?.subscription_tier || 'free']
  );
  if (plan?.max_services) {
    const { count } = await getOne(
      'SELECT COUNT(*)::int AS count FROM services WHERE tenant_id = $1 AND active = TRUE',
      [req.tenantId]
    );
    if (count >= plan.max_services) {
      return res.status(403).json({
        error: `Your plan allows up to ${plan.max_services} services. Upgrade to add more.`,
        code: 'PLAN_LIMIT_REACHED',
      });
    }
  }

  // Force category to 'Add-ons' for addon services
  const effectiveCategory = is_addon ? 'Add-ons' : (category || null);

  const service = await getOne(
    `INSERT INTO services (tenant_id, name, description, duration, price, category, display_order, deposit_enabled, deposit_type, deposit_value, is_addon)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [req.tenantId, name, description || null, numDuration, numPrice, effectiveCategory, display_order || 0,
     deposit_enabled || false, deposit_type || 'fixed', deposit_enabled ? parseFloat(deposit_value) || 0 : 0, is_addon || false]
  );

  // Auto-link addon to all existing non-addon services
  if (is_addon && service) {
    const parentServices = await getAll(
      `SELECT id FROM services WHERE tenant_id = $1 AND active = TRUE AND (is_addon = FALSE OR is_addon IS NULL) AND id != $2`,
      [req.tenantId, service.id]
    );
    for (const parent of parentServices) {
      await run(
        `INSERT INTO service_addon_links (tenant_id, parent_service_id, addon_service_id, display_order)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (tenant_id, parent_service_id, addon_service_id) DO NOTHING`,
        [req.tenantId, parent.id, service.id]
      );
    }
  }

  // Auto-link existing addons to this new non-addon service
  if (!is_addon && service) {
    const addonServices = await getAll(
      `SELECT id FROM services WHERE tenant_id = $1 AND active = TRUE AND is_addon = TRUE AND id != $2`,
      [req.tenantId, service.id]
    );
    for (const addon of addonServices) {
      await run(
        `INSERT INTO service_addon_links (tenant_id, parent_service_id, addon_service_id, display_order)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (tenant_id, parent_service_id, addon_service_id) DO NOTHING`,
        [req.tenantId, service.id, addon.id]
      );
    }
  }

  res.status(201).json(service);
}));

// PUT /api/admin/services/:id
router.put('/services/:id', asyncHandler(async (req, res) => {
  const { name, description, duration, price, category, display_order, active, deposit_enabled, deposit_type, deposit_value, is_addon } = req.body;

  if (duration !== undefined) {
    const numDuration = parseInt(duration);
    if (isNaN(numDuration) || numDuration < 5 || numDuration > 480) {
      return res.status(400).json({ error: 'Duration must be between 5 and 480 minutes' });
    }
  }
  if (price !== undefined) {
    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0 || numPrice > 10000) {
      return res.status(400).json({ error: 'Price must be between 0 and 10,000' });
    }
  }

  // Validate deposit fields if provided
  if (deposit_enabled !== undefined && deposit_enabled) {
    const dVal = parseFloat(deposit_value);
    if (isNaN(dVal) || dVal <= 0) {
      return res.status(400).json({ error: 'Deposit value must be greater than 0' });
    }
    if (deposit_type === 'percentage' && dVal > 100) {
      return res.status(400).json({ error: 'Deposit percentage cannot exceed 100%' });
    }
    const svcPrice = price !== undefined ? parseFloat(price) : null;
    if (deposit_type === 'fixed' && svcPrice !== null && dVal > svcPrice) {
      return res.status(400).json({ error: 'Deposit amount cannot exceed the service price' });
    }
  }

  // Force category to 'Add-ons' when marking as addon
  const effectiveCategory = (is_addon === true) ? 'Add-ons' : category;

  const service = await getOne(
    `UPDATE services SET
      name = COALESCE($1, name),
      description = COALESCE($2, description),
      duration = COALESCE($3, duration),
      price = COALESCE($4, price),
      category = COALESCE($5, category),
      display_order = COALESCE($6, display_order),
      active = COALESCE($7, active),
      deposit_enabled = COALESCE($10, deposit_enabled),
      deposit_type = COALESCE($11, deposit_type),
      deposit_value = COALESCE($12, deposit_value),
      is_addon = COALESCE($13, is_addon)
     WHERE id = $8 AND tenant_id = $9
     RETURNING *`,
    [name, description, duration, price, effectiveCategory, display_order, active, req.params.id, req.tenantId,
     deposit_enabled !== undefined ? deposit_enabled : null,
     deposit_type !== undefined ? deposit_type : null,
     deposit_value !== undefined ? parseFloat(deposit_value) : null,
     is_addon !== undefined ? is_addon : null]
  );

  if (!service) {
    return res.status(404).json({ error: 'Service not found' });
  }

  // Auto-link addon to all existing non-addon services when is_addon is toggled on
  if (is_addon === true && service) {
    const existingLinks = await getAll(
      `SELECT parent_service_id FROM service_addon_links WHERE tenant_id = $1 AND addon_service_id = $2`,
      [req.tenantId, service.id]
    );
    if (existingLinks.length === 0) {
      const parentServices = await getAll(
        `SELECT id FROM services WHERE tenant_id = $1 AND active = TRUE AND (is_addon = FALSE OR is_addon IS NULL) AND id != $2`,
        [req.tenantId, service.id]
      );
      for (const parent of parentServices) {
        await run(
          `INSERT INTO service_addon_links (tenant_id, parent_service_id, addon_service_id, display_order)
           VALUES ($1, $2, $3, 0)
           ON CONFLICT (tenant_id, parent_service_id, addon_service_id) DO NOTHING`,
          [req.tenantId, parent.id, service.id]
        );
      }
    }
  }

  res.json(service);
}));

// DELETE /api/admin/services/:id (soft delete for active, hard delete for inactive)
router.delete('/services/:id', asyncHandler(async (req, res) => {
  const existing = await getOne(
    'SELECT id, active FROM services WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!existing) {
    return res.status(404).json({ error: 'Service not found' });
  }

  if (existing.active) {
    // Soft delete: deactivate
    await run('UPDATE services SET active = FALSE WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    res.json({ message: 'Service deactivated', action: 'deactivated' });
  } else {
    // Hard delete: remove inactive service and its addon links
    await run('DELETE FROM service_addon_links WHERE (parent_service_id = $1 OR addon_service_id = $1) AND tenant_id = $2', [req.params.id, req.tenantId]);
    await run('DELETE FROM services WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    res.json({ message: 'Service permanently deleted', action: 'deleted' });
  }
}));

// ── Platform Broadcasts (tenant-facing) ──

// GET /api/admin/broadcasts — active broadcasts with read status
router.get('/broadcasts', asyncHandler(async (req, res) => {
  const broadcasts = await getAll(
    `SELECT b.id, b.title, b.body, b.type, b.priority, b.published_at,
       CASE WHEN br.id IS NOT NULL THEN TRUE ELSE FALSE END AS is_read
     FROM platform_broadcasts b
     LEFT JOIN platform_broadcast_reads br ON br.broadcast_id = b.id AND br.tenant_id = $1
     WHERE b.published = TRUE
       AND (b.expires_at IS NULL OR b.expires_at > NOW())
     ORDER BY b.published_at DESC
     LIMIT 20`,
    [req.tenantId]
  );
  res.json(broadcasts);
}));

// GET /api/admin/broadcasts/unread-count
router.get('/broadcasts/unread-count', asyncHandler(async (req, res) => {
  const result = await getOne(
    `SELECT COUNT(*)::int AS count
     FROM platform_broadcasts b
     WHERE b.published = TRUE
       AND (b.expires_at IS NULL OR b.expires_at > NOW())
       AND NOT EXISTS (
         SELECT 1 FROM platform_broadcast_reads br
         WHERE br.broadcast_id = b.id AND br.tenant_id = $1
       )`,
    [req.tenantId]
  );
  res.json({ count: result?.count || 0 });
}));

// PUT /api/admin/broadcasts/:id/read
router.put('/broadcasts/:id/read', asyncHandler(async (req, res) => {
  await run(
    `INSERT INTO platform_broadcast_reads (broadcast_id, tenant_id)
     VALUES ($1, $2)
     ON CONFLICT (broadcast_id, tenant_id) DO NOTHING`,
    [req.params.id, req.tenantId]
  );
  res.json({ success: true });
}));

// PUT /api/admin/broadcasts/read-all
router.put('/broadcasts/read-all', asyncHandler(async (req, res) => {
  const unread = await getAll(
    `SELECT b.id FROM platform_broadcasts b
     WHERE b.published = TRUE
       AND (b.expires_at IS NULL OR b.expires_at > NOW())
       AND NOT EXISTS (
         SELECT 1 FROM platform_broadcast_reads br
         WHERE br.broadcast_id = b.id AND br.tenant_id = $1
       )`,
    [req.tenantId]
  );
  for (const b of unread) {
    await run(
      `INSERT INTO platform_broadcast_reads (broadcast_id, tenant_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [b.id, req.tenantId]
    );
  }
  res.json({ success: true });
}));

// ── Service Add-on Links ──

// GET /api/admin/services/:id/addons
router.get('/services/:id/addons', asyncHandler(async (req, res) => {
  const links = await getAll(
    `SELECT sal.id as link_id, sal.display_order, s.id, s.name, s.duration, s.price, s.category
     FROM service_addon_links sal
     JOIN services s ON s.id = sal.addon_service_id
     WHERE sal.parent_service_id = $1 AND sal.tenant_id = $2
     ORDER BY sal.display_order, s.name`,
    [req.params.id, req.tenantId]
  );
  res.json(links);
}));

// POST /api/admin/services/:id/addons — link an add-on
router.post('/services/:id/addons', asyncHandler(async (req, res) => {
  const { addon_service_id, display_order } = req.body;
  if (!addon_service_id) return res.status(400).json({ error: 'addon_service_id is required' });

  const link = await getOne(
    `INSERT INTO service_addon_links (tenant_id, parent_service_id, addon_service_id, display_order)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (tenant_id, parent_service_id, addon_service_id) DO NOTHING
     RETURNING *`,
    [req.tenantId, req.params.id, addon_service_id, display_order || 0]
  );

  if (!link) return res.status(409).json({ error: 'Add-on already linked' });
  res.status(201).json(link);
}));

// DELETE /api/admin/services/:id/addons/:linkId
router.delete('/services/:id/addons/:linkId', asyncHandler(async (req, res) => {
  const result = await run(
    'DELETE FROM service_addon_links WHERE id = $1 AND tenant_id = $2',
    [req.params.linkId, req.tenantId]
  );
  if (result.rowCount === 0) return res.status(404).json({ error: 'Link not found' });
  res.json({ message: 'Add-on unlinked' });
}));

// POST /api/admin/services/import — bulk import services from CSV
router.post('/services/import', asyncHandler(async (req, res) => {
  const { services: rows } = req.body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'No services provided' });
  }
  if (rows.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 services per import' });
  }

  // Check plan limits
  const tenant = await getOne('SELECT subscription_tier FROM tenants WHERE id = $1', [req.tenantId]);
  const plan = await getOne(
    'SELECT max_services FROM subscription_plans WHERE tier = $1 AND is_active = TRUE',
    [tenant?.subscription_tier || 'free']
  );
  const { count: existingCount } = await getOne(
    'SELECT COUNT(*)::int AS count FROM services WHERE tenant_id = $1 AND active = TRUE',
    [req.tenantId]
  );

  // Validate each row
  const results = { imported: 0, skipped: 0, errors: [] };
  const validRows = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors = [];

    if (!row.name || !String(row.name).trim()) rowErrors.push('Name is required');

    const dur = parseInt(row.duration);
    if (isNaN(dur) || dur < 5 || dur > 480) rowErrors.push('Duration must be 5-480 minutes');

    const price = parseFloat(row.price);
    if (isNaN(price) || price < 0 || price > 10000) rowErrors.push('Price must be 0-10,000');

    if (rowErrors.length > 0) {
      results.errors.push({ row: i + 1, name: row.name || '(empty)', errors: rowErrors });
      results.skipped++;
    } else {
      validRows.push({
        name: String(row.name).trim(),
        description: row.description ? String(row.description).trim() : null,
        duration: dur,
        price,
        category: row.category ? String(row.category).trim() : null,
      });
    }
  }

  // Enforce plan limit
  const maxAllowed = plan?.max_services || null;
  if (maxAllowed && (existingCount + validRows.length) > maxAllowed) {
    const available = Math.max(0, maxAllowed - existingCount);
    return res.status(403).json({
      error: `Your plan allows ${maxAllowed} services. You have ${existingCount} and are importing ${validRows.length}. ${available} slot(s) available. Upgrade to add more.`,
      code: 'PLAN_LIMIT_EXCEEDED',
    });
  }

  // Insert in transaction
  if (validRows.length > 0) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const svc of validRows) {
        await client.query(
          `INSERT INTO services (tenant_id, name, description, duration, price, category, display_order)
           VALUES ($1, $2, $3, $4, $5, $6, 0)`,
          [req.tenantId, svc.name, svc.description, svc.duration, svc.price, svc.category]
        );
        results.imported++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  res.json({
    message: `Imported ${results.imported} service(s). ${results.skipped} skipped.`,
    imported: results.imported,
    skipped: results.skipped,
    errors: results.errors,
  });
}));

// ============================================
// INTAKE QUESTIONS
// ============================================

// GET /api/admin/services/:serviceId/intake-questions
router.get('/services/:serviceId/intake-questions', asyncHandler(async (req, res) => {
  const questions = await getAll(
    'SELECT * FROM intake_questions WHERE tenant_id = $1 AND service_id = $2 ORDER BY display_order',
    [req.tenantId, req.params.serviceId]
  );
  res.json(questions);
}));

// POST /api/admin/services/:serviceId/intake-questions
router.post('/services/:serviceId/intake-questions', asyncHandler(async (req, res) => {
  const { question_text, question_type, required, options } = req.body;

  if (!question_text?.trim()) {
    return res.status(400).json({ error: 'Question text is required' });
  }
  if (!['text', 'yes_no', 'checkbox'].includes(question_type)) {
    return res.status(400).json({ error: 'Question type must be text, yes_no, or checkbox' });
  }

  // Get next display order
  const last = await getOne(
    'SELECT MAX(display_order) as max_order FROM intake_questions WHERE tenant_id = $1 AND service_id = $2',
    [req.tenantId, req.params.serviceId]
  );
  const nextOrder = (last?.max_order || 0) + 1;

  const question = await getOne(
    `INSERT INTO intake_questions (tenant_id, service_id, question_text, question_type, required, display_order, options)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [req.tenantId, req.params.serviceId, question_text.trim(), question_type,
     required || false, nextOrder, options ? JSON.stringify(options) : null]
  );

  res.status(201).json(question);
}));

// PUT /api/admin/intake-questions/:id
router.put('/intake-questions/:id', asyncHandler(async (req, res) => {
  const { question_text, question_type, required, options, active, display_order } = req.body;

  if (question_type && !['text', 'yes_no', 'checkbox'].includes(question_type)) {
    return res.status(400).json({ error: 'Question type must be text, yes_no, or checkbox' });
  }

  const question = await getOne(
    `UPDATE intake_questions SET
      question_text = COALESCE($1, question_text),
      question_type = COALESCE($2, question_type),
      required = COALESCE($3, required),
      options = COALESCE($4, options),
      active = COALESCE($5, active),
      display_order = COALESCE($6, display_order)
     WHERE id = $7 AND tenant_id = $8
     RETURNING *`,
    [question_text, question_type, required, options ? JSON.stringify(options) : null,
     active, display_order, req.params.id, req.tenantId]
  );

  if (!question) {
    return res.status(404).json({ error: 'Question not found' });
  }
  res.json(question);
}));

// DELETE /api/admin/intake-questions/:id (soft delete)
router.delete('/intake-questions/:id', asyncHandler(async (req, res) => {
  const question = await getOne(
    'UPDATE intake_questions SET active = FALSE WHERE id = $1 AND tenant_id = $2 RETURNING id',
    [req.params.id, req.tenantId]
  );

  if (!question) {
    return res.status(404).json({ error: 'Question not found' });
  }
  res.json({ message: 'Question deactivated' });
}));

// PUT /api/admin/intake-questions/reorder
router.put('/intake-questions-reorder', asyncHandler(async (req, res) => {
  const { items } = req.body; // [{ id, display_order }]
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items array is required' });
  }

  for (const item of items) {
    await run(
      'UPDATE intake_questions SET display_order = $1 WHERE id = $2 AND tenant_id = $3',
      [item.display_order, item.id, req.tenantId]
    );
  }

  res.json({ message: 'Reorder complete' });
}));

// ============================================
// SERVICE FORMS (file attachments)
// ============================================

// GET /api/admin/services/:serviceId/forms — list forms for a service (no file data)
router.get('/services/:serviceId/forms', asyncHandler(async (req, res) => {
  const forms = await getAll(
    'SELECT id, form_name, file_name, mime_type, file_size, active, created_at FROM service_forms WHERE service_id = $1 AND tenant_id = $2 AND active = TRUE ORDER BY created_at',
    [req.params.serviceId, req.tenantId]
  );
  res.json(forms);
}));

// POST /api/admin/services/:serviceId/forms — upload a form
router.post('/services/:serviceId/forms', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Check max 3 forms per service
  const existing = await getOne(
    'SELECT COUNT(*)::int AS count FROM service_forms WHERE service_id = $1 AND tenant_id = $2 AND active = TRUE',
    [req.params.serviceId, req.tenantId]
  );
  if (existing.count >= 3) return res.status(400).json({ error: 'Maximum 3 forms per service. Delete an existing form first.' });

  const formName = req.body.form_name || req.file.originalname.replace(/\.[^.]+$/, '');

  const form = await getOne(
    `INSERT INTO service_forms (tenant_id, service_id, form_name, file_name, mime_type, file_size, file_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, form_name, file_name, mime_type, file_size, created_at`,
    [req.tenantId, req.params.serviceId, formName, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
  );

  res.status(201).json(form);
}));

// GET /api/admin/service-forms/:id/download — download a form file
router.get('/service-forms/:id/download', asyncHandler(async (req, res) => {
  const form = await getOne(
    'SELECT file_name, mime_type, file_data FROM service_forms WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!form) return res.status(404).json({ error: 'Form not found' });

  res.set({
    'Content-Type': form.mime_type,
    'Content-Disposition': `attachment; filename="${form.file_name}"`,
    'Content-Length': form.file_data.length,
  });
  res.send(form.file_data);
}));

// DELETE /api/admin/service-forms/:id — soft-delete a form
router.delete('/service-forms/:id', asyncHandler(async (req, res) => {
  await run(
    'UPDATE service_forms SET active = FALSE WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  res.json({ message: 'Form removed' });
}));

// ============================================
// BOOKINGS
// ============================================

// GET /api/admin/bookings
router.get('/bookings', asyncHandler(async (req, res) => {
  const { date, status, from, to } = req.query;
  let sql = `SELECT b.*, dc.code as discount_code, c.allergies as customer_allergies,
    (SELECT s.category FROM services s WHERE s.id = CAST(NULLIF(split_part(b.service_ids, ',', 1), '') AS INTEGER) AND s.tenant_id = b.tenant_id) AS primary_category
    FROM bookings b LEFT JOIN discount_codes dc ON dc.id = b.discount_code_id LEFT JOIN customers c ON c.id = b.customer_id WHERE b.tenant_id = $1`;
  const params = [req.tenantId];

  if (date) {
    params.push(date);
    sql += ` AND b.date = $${params.length}`;
  }

  if (from && to) {
    params.push(from, to);
    sql += ` AND b.date >= $${params.length - 1} AND b.date <= $${params.length}`;
  }

  if (status) {
    params.push(status);
    sql += ` AND b.status = $${params.length}`;
  }

  // Default to today onwards when no date filters applied (upcoming first)
  if (!date && !from && !to) {
    sql += ' AND b.date >= CURRENT_DATE ORDER BY b.date ASC, b.start_time ASC';
  } else {
    sql += ' ORDER BY b.date DESC, b.start_time ASC';
  }

  const bookings = await getAll(sql, params);
  res.json(bookings);
}));

// GET /api/admin/bookings/requests (must be before :id route)
router.get('/bookings/requests', asyncHandler(async (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT br.*, b.service_names, b.date as booking_date, b.start_time as booking_time,
           b.end_time as booking_end_time, b.total_price, b.customer_name, b.customer_email,
           c.name as customer_name_full, c.phone as customer_phone
    FROM booking_requests br
    JOIN bookings b ON b.id = br.booking_id
    LEFT JOIN customers c ON c.id = br.customer_id
    WHERE br.tenant_id = $1`;
  const params = [req.tenantId];

  if (status && status !== 'all') {
    params.push(status);
    sql += ` AND br.status = $${params.length}`;
  }

  sql += ' ORDER BY br.created_at DESC';
  const requests = await getAll(sql, params);
  res.json(requests);
}));

// GET /api/admin/bookings/:id — single booking detail
router.get('/bookings/:id', asyncHandler(async (req, res) => {
  const booking = await getOne(
    `SELECT b.*, dc.code as discount_code, c.allergies as customer_allergies,
            c.preferences as customer_preferences, c.admin_notes as customer_notes,
            c.stripe_payment_method_id as has_saved_card
     FROM bookings b
     LEFT JOIN discount_codes dc ON dc.id = b.discount_code_id
     LEFT JOIN customers c ON c.id = b.customer_id
     WHERE b.id = $1 AND b.tenant_id = $2`,
    [req.params.id, req.tenantId]
  );
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  let services = [];
  if (booking.service_ids) {
    const ids = booking.service_ids.split(',').map(Number).filter(Boolean);
    if (ids.length > 0) {
      const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
      services = await getAll(
        `SELECT id, name, price, duration, category FROM services WHERE id IN (${placeholders}) AND tenant_id = $1`,
        [req.tenantId, ...ids]
      );
    }
  }
  res.json({ ...booking, services });
}));

// PUT /api/admin/bookings/:id — edit booking
router.put('/bookings/:id', asyncHandler(async (req, res) => {
  const { serviceIds, date, startTime, customerId, customerName, customerEmail,
          customerPhone, notes, priceOverride, notifyCustomer } = req.body;

  const existing = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!existing) return res.status(404).json({ error: 'Booking not found' });

  if (!['pending', 'confirmed', 'pending_confirmation'].includes(existing.status)) {
    return res.status(400).json({ error: 'Cannot edit a booking with status: ' + existing.status });
  }

  // Resolve services
  let totalDuration = existing.total_duration;
  let totalPrice = existing.total_price;
  let serviceNames = existing.service_names;
  let serviceIdStr = existing.service_ids;

  if (serviceIds && serviceIds.length > 0) {
    const placeholders = serviceIds.map((_, i) => `$${i + 2}`).join(',');
    const services = await getAll(
      `SELECT * FROM services WHERE id IN (${placeholders}) AND tenant_id = $1 AND active = TRUE`,
      [req.tenantId, ...serviceIds]
    );
    if (services.length !== serviceIds.length) {
      return res.status(400).json({ error: 'One or more services are invalid' });
    }
    totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
    totalPrice = services.reduce((sum, s) => sum + parseFloat(s.price), 0);
    serviceNames = services.map(s => s.name).join(', ');
    serviceIdStr = serviceIds.join(',');
  }

  if (priceOverride != null && priceOverride >= 0) {
    totalPrice = parseFloat(priceOverride);
  }

  const finalDate = date || existing.date;
  const finalStartTime = startTime || existing.start_time;

  // Calculate end time
  const [hours, minutes] = finalStartTime.split(':').map(Number);
  const endMinutes = hours * 60 + minutes + totalDuration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  // Manage time slots if date/time changed
  const dateChanged = String(finalDate).slice(0, 10) !== String(existing.date).slice(0, 10);
  const timeChanged = finalStartTime.slice(0, 5) !== existing.start_time.slice(0, 5);

  if (dateChanged || timeChanged) {
    // Free old slots
    await run(
      `UPDATE time_slots SET is_available = TRUE
       WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
      [req.tenantId, existing.date, existing.start_time, existing.end_time]
    );
    // Mark new slots unavailable
    await run(
      `UPDATE time_slots SET is_available = FALSE
       WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
      [req.tenantId, finalDate, finalStartTime, endTime]
    );
  }

  const finalCustomerId = customerId || existing.customer_id;
  const finalCustomerName = customerName || existing.customer_name;
  const finalCustomerEmail = customerEmail || existing.customer_email;
  const finalCustomerPhone = customerPhone !== undefined ? customerPhone : existing.customer_phone;

  const updated = await getOne(
    `UPDATE bookings SET
       customer_id = $1, customer_name = $2, customer_email = $3, customer_phone = $4,
       service_ids = $5, service_names = $6, date = $7, start_time = $8, end_time = $9,
       total_price = $10, total_duration = $11, notes = $12
     WHERE id = $13 AND tenant_id = $14
     RETURNING *`,
    [finalCustomerId, finalCustomerName, finalCustomerEmail, finalCustomerPhone,
     serviceIdStr, serviceNames, finalDate, finalStartTime, endTime,
     totalPrice, totalDuration, notes !== undefined ? notes : existing.notes,
     req.params.id, req.tenantId]
  );

  // Notify customer if toggled and something changed
  if (notifyCustomer && (dateChanged || timeChanged || serviceIds)) {
    const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
    if (tenant) {
      const { sendBookingEditedNotification } = require('../utils/emailService');
      sendBookingEditedNotification(updated, tenant, existing).catch(err =>
        console.error('Edit notification error:', err)
      );
    }
  }

  const { logActivity } = require('../utils/activityLog');
  logActivity(req.tenantId, 'tenant_admin', req.user.id, req.user.email, 'booking_edited', {
    booking_id: updated.id, changes: { dateChanged, timeChanged, servicesChanged: !!serviceIds },
  });

  res.json(updated);
}));

// PUT /api/admin/bookings/:id/status
router.put('/bookings/:id/status', asyncHandler(async (req, res) => {
  const { status, reason, alternative } = req.body;

  if (!['confirmed', 'rejected', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Status must be confirmed, rejected, or cancelled' });
  }

  const booking = await getOne(
    `UPDATE bookings SET status = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *`,
    [status, req.params.id, req.tenantId]
  );

  if (!booking) {
    return res.status(404).json({ error: 'Booking not found' });
  }

  // If rejected or cancelled, free up the time slots and check waitlist
  if (status === 'rejected' || status === 'cancelled') {
    await run(
      `UPDATE time_slots SET is_available = TRUE
       WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND end_time <= $4`,
      [req.tenantId, booking.date, booking.start_time, booking.end_time]
    );
    // Notify waitlist customers about freed slot
    const { checkWaitlistForDate } = require('../utils/waitlistService');
    checkWaitlistForDate(req.tenantId, booking.date).catch(err =>
      console.error('[Waitlist] check error:', err.message)
    );
  }

  // Send email + SMS notifications
  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (tenant) {
    if (status === 'confirmed') {
      sendBookingApprovedNotification(booking, tenant).catch(err => console.error('Email error:', err));
      sendBookingConfirmedSMS(booking, tenant).catch(err => console.error('SMS error:', err));
      // Auto-send consultation forms
      const { autoSendConsultationForms } = require('./consultationForms');
      autoSendConsultationForms(booking, tenant).catch(err => console.error('Consultation form auto-send error:', err));
    } else if (status === 'rejected') {
      sendBookingRejectedNotification(booking, tenant, reason, alternative).catch(err => console.error('Email error:', err));
      sendBookingRejectedSMS(booking, tenant).catch(err => console.error('SMS error:', err));
    }
  }

  // Activity log
  const { logActivity } = require('../utils/activityLog');
  logActivity(req.tenantId, 'tenant_admin', req.user.id, req.user.email, `booking_${status}`, { booking_id: booking.id, customer: booking.customer_name });

  res.json(booking);
}));

// POST /api/admin/bookings/:id/send-notification — manually send/resend booking notification
router.post('/bookings/:id/send-notification', asyncHandler(async (req, res) => {
  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant) return res.status(500).json({ error: 'Tenant not found' });

  const { sendBookingCardConfirmationEmail, sendBookingCardConfirmationSMS } = require('../utils/emailService');

  if (booking.status === 'pending_confirmation') {
    // Resend card confirmation
    let token = booking.confirmation_token;
    if (!token || (booking.confirmation_token_expires && new Date(booking.confirmation_token_expires) < new Date())) {
      // Generate new token if expired
      token = crypto.randomBytes(32).toString('hex');
      await run(
        `UPDATE bookings SET confirmation_token = $1, confirmation_token_expires = NOW() + INTERVAL '48 hours' WHERE id = $2`,
        [token, booking.id]
      );
    }

    if (booking.customer_email) {
      await sendBookingCardConfirmationEmail(booking, tenant, token);
    } else if (booking.customer_phone) {
      await sendBookingCardConfirmationSMS(booking, tenant, token);
    } else {
      return res.status(400).json({ error: 'Customer has no email or phone number' });
    }
    res.json({ message: 'Card confirmation resent' });
  } else if (booking.status === 'confirmed') {
    // Send booking confirmed notification
    sendBookingApprovedNotification(booking, tenant).catch(err => console.error('Email error:', err));
    sendBookingConfirmedSMS(booking, tenant).catch(err => console.error('SMS error:', err));
    res.json({ message: 'Booking confirmation sent' });
  } else {
    return res.status(400).json({ error: `Cannot send notification for status: ${booking.status}` });
  }
}));

// GET /api/admin/bookings/:id/communications — email + SMS logs for a booking
router.get('/bookings/:id/communications', asyncHandler(async (req, res) => {
  const bookingId = req.params.id;

  // Verify booking belongs to tenant
  const booking = await getOne(
    'SELECT id FROM bookings WHERE id = $1 AND tenant_id = $2',
    [bookingId, req.tenantId]
  );
  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const [emails, sms] = await Promise.all([
    getAll(
      `SELECT id, recipient_email, recipient_name, email_type, subject, status, error_message, sent_at, created_at,
              'email' as channel
       FROM email_logs WHERE tenant_id = $1 AND booking_id = $2
       ORDER BY created_at DESC`,
      [req.tenantId, bookingId]
    ),
    getAll(
      `SELECT id, recipient_phone, recipient_name, sms_type, message_preview, status, error_message, sent_at, created_at,
              'sms' as channel
       FROM sms_logs WHERE tenant_id = $1 AND booking_id = $2
       ORDER BY created_at DESC`,
      [req.tenantId, bookingId]
    ),
  ]);

  // Merge and sort by created_at descending
  const all = [...emails, ...sms].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  res.json(all);
}));

// ============================================
// ROTATION SETTINGS
// ============================================

// GET /api/admin/rotation-settings
router.get('/rotation-settings', asyncHandler(async (req, res) => {
  const rows = await getAll(
    `SELECT setting_key, setting_value FROM tenant_settings
     WHERE tenant_id = $1 AND setting_key = ANY($2)`,
    [req.tenantId, ['rotation_weeks', 'rotation_start_date']]
  );
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
  res.json({
    rotation_weeks: parseInt(settings.rotation_weeks) || 1,
    rotation_start_date: settings.rotation_start_date || null,
  });
}));

// PUT /api/admin/rotation-settings
router.put('/rotation-settings', asyncHandler(async (req, res) => {
  const { rotation_weeks, rotation_start_date } = req.body;
  const weeks = parseInt(rotation_weeks);
  if (!weeks || weeks < 1 || weeks > 4) {
    return res.status(400).json({ error: 'rotation_weeks must be between 1 and 4' });
  }
  if (weeks > 1 && !rotation_start_date) {
    return res.status(400).json({ error: 'rotation_start_date is required when rotation is enabled' });
  }
  const keys = { rotation_weeks: String(weeks) };
  if (rotation_start_date) keys.rotation_start_date = rotation_start_date;
  for (const [key, value] of Object.entries(keys)) {
    await run(
      `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id, setting_key) DO UPDATE SET
         setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
      [req.tenantId, key, value]
    );
  }
  res.json({ message: 'Rotation settings saved', rotation_weeks: weeks, rotation_start_date: keys.rotation_start_date || null });
}));

// GET /api/admin/settings/terminology
router.get('/settings/terminology', asyncHandler(async (req, res) => {
  const row = await getOne(
    `SELECT setting_value FROM tenant_settings WHERE tenant_id = $1 AND setting_key = 'customer_label'`,
    [req.tenantId]
  );
  res.json({ value: row?.setting_value || 'customers' });
}));

// PUT /api/admin/settings/terminology
router.put('/settings/terminology', asyncHandler(async (req, res) => {
  const { value } = req.body;
  if (!['customers', 'clients'].includes(value)) {
    return res.status(400).json({ error: 'Value must be "customers" or "clients"' });
  }
  await run(
    `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, updated_at)
     VALUES ($1, 'customer_label', $2, NOW())
     ON CONFLICT (tenant_id, setting_key) DO UPDATE SET
       setting_value = EXCLUDED.setting_value, updated_at = NOW()`,
    [req.tenantId, value]
  );
  res.json({ message: 'Terminology updated', value });
}));

// ============================================
// SLOT TEMPLATES
// ============================================

// GET /api/admin/slot-templates
router.get('/slot-templates', asyncHandler(async (req, res) => {
  const templates = await getAll(
    'SELECT * FROM slot_templates WHERE tenant_id = $1 ORDER BY week_number, day_of_week, start_time',
    [req.tenantId]
  );
  res.json(templates);
}));

// POST /api/admin/slot-templates
router.post('/slot-templates', asyncHandler(async (req, res) => {
  const { name, day_of_week, start_time, end_time, slot_duration, week_number } = req.body;

  if (name === undefined || day_of_week === undefined || !start_time || !end_time) {
    return res.status(400).json({ error: 'Name, day_of_week, start_time, and end_time are required' });
  }

  const template = await getOne(
    `INSERT INTO slot_templates (tenant_id, name, day_of_week, start_time, end_time, slot_duration, week_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [req.tenantId, name, day_of_week, start_time, end_time, slot_duration || 30, week_number || 1]
  );

  res.status(201).json(template);
}));

// PUT /api/admin/slot-templates/:id
router.put('/slot-templates/:id', asyncHandler(async (req, res) => {
  const { name, day_of_week, start_time, end_time, slot_duration, active, week_number } = req.body;

  const template = await getOne(
    `UPDATE slot_templates SET
      name = COALESCE($1, name),
      day_of_week = COALESCE($2, day_of_week),
      start_time = COALESCE($3, start_time),
      end_time = COALESCE($4, end_time),
      slot_duration = COALESCE($5, slot_duration),
      active = COALESCE($6, active),
      week_number = COALESCE($7, week_number)
     WHERE id = $8 AND tenant_id = $9
     RETURNING *`,
    [name, day_of_week, start_time, end_time, slot_duration, active, week_number, req.params.id, req.tenantId]
  );

  if (!template) {
    return res.status(404).json({ error: 'Template not found' });
  }

  res.json(template);
}));

// DELETE /api/admin/slot-templates/:id
router.delete('/slot-templates/:id', asyncHandler(async (req, res) => {
  const result = await run(
    'DELETE FROM slot_templates WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Template not found' });
  }

  res.json({ message: 'Template deleted' });
}));

// POST /api/admin/slot-templates/generate
router.post('/slot-templates/generate', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;

  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'startDate and endDate are required' });
  }

  // Get active templates for this tenant
  const templates = await getAll(
    'SELECT * FROM slot_templates WHERE tenant_id = $1 AND active = TRUE',
    [req.tenantId]
  );

  if (templates.length === 0) {
    return res.status(400).json({ error: 'No active slot templates found. Create templates first.' });
  }

  // Load rotation settings
  const rotationRows = await getAll(
    `SELECT setting_key, setting_value FROM tenant_settings
     WHERE tenant_id = $1 AND setting_key = ANY($2)`,
    [req.tenantId, ['rotation_weeks', 'rotation_start_date']]
  );
  const rotationSettings = {};
  rotationRows.forEach(r => { rotationSettings[r.setting_key] = r.setting_value; });
  const rotationWeeks = parseInt(rotationSettings.rotation_weeks) || 1;
  const rotationStart = rotationSettings.rotation_start_date || startDate;

  // Get exception dates in range
  const exceptions = await getAll(
    'SELECT date FROM slot_exceptions WHERE tenant_id = $1 AND date >= $2 AND date <= $3',
    [req.tenantId, startDate, endDate]
  );
  const exceptionDates = new Set(exceptions.map(e => e.date.toISOString().split('T')[0]));

  let slotsCreated = 0;
  const current = new Date(startDate);
  const end = new Date(endDate);
  const rotationStartDate = new Date(rotationStart);

  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0];
    const dayOfWeek = current.getDay(); // 0=Sunday, 6=Saturday

    // Calculate which rotation week this date falls in
    const diffDays = Math.floor((current - rotationStartDate) / 86400000);
    const weekNumber = rotationWeeks > 1
      ? ((Math.floor(diffDays / 7) % rotationWeeks) + rotationWeeks) % rotationWeeks + 1
      : 1;

    // Skip exception dates
    if (!exceptionDates.has(dateStr)) {
      // Find templates for this day of week and rotation week
      const dayTemplates = templates.filter(
        t => t.day_of_week === dayOfWeek && t.week_number === weekNumber
      );

      for (const template of dayTemplates) {
        // Generate slots at interval from start_time to end_time
        const startParts = template.start_time.split(':').map(Number);
        const endParts = template.end_time.split(':').map(Number);
        const startMinutes = startParts[0] * 60 + startParts[1];
        const endMinutes = endParts[0] * 60 + endParts[1];
        const duration = template.slot_duration;

        for (let m = startMinutes; m + duration <= endMinutes; m += duration) {
          const slotStart = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
          const slotEnd = `${String(Math.floor((m + duration) / 60)).padStart(2, '0')}:${String((m + duration) % 60).padStart(2, '0')}`;

          try {
            await run(
              `INSERT INTO time_slots (tenant_id, date, start_time, end_time, is_available)
               VALUES ($1, $2, $3, $4, TRUE)
               ON CONFLICT (tenant_id, date, start_time) DO NOTHING`,
              [req.tenantId, dateStr, slotStart, slotEnd]
            );
            slotsCreated++;
          } catch (err) {
            // Skip duplicates if unique index doesn't exist yet
            if (err.code !== '23505') throw err;
          }
        }
      }
    }

    current.setDate(current.getDate() + 1);
  }

  // Activity log
  const { logActivity } = require('../utils/activityLog');
  logActivity(req.tenantId, 'tenant_admin', req.user.id, req.user.email, 'slots_generated', { start_date: startDate, end_date: endDate, slots_created: slotsCreated });

  res.json({ message: `Generated ${slotsCreated} time slots`, slotsCreated });
}));

// ============================================
// SLOT EXCEPTIONS
// ============================================

// GET /api/admin/slot-exceptions
router.get('/slot-exceptions', asyncHandler(async (req, res) => {
  const exceptions = await getAll(
    'SELECT * FROM slot_exceptions WHERE tenant_id = $1 ORDER BY date',
    [req.tenantId]
  );
  res.json(exceptions);
}));

// POST /api/admin/slot-exceptions
router.post('/slot-exceptions', asyncHandler(async (req, res) => {
  const { date, reason } = req.body;

  if (!date) {
    return res.status(400).json({ error: 'Date is required' });
  }

  const exception = await getOne(
    `INSERT INTO slot_exceptions (tenant_id, date, reason)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [req.tenantId, date, reason || null]
  );

  res.status(201).json(exception);
}));

// DELETE /api/admin/slot-exceptions/:id
router.delete('/slot-exceptions/:id', asyncHandler(async (req, res) => {
  const result = await run(
    'DELETE FROM slot_exceptions WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Exception not found' });
  }

  res.json({ message: 'Exception deleted' });
}));

// ============================================
// DASHBOARD
// ============================================

// GET /api/admin/dashboard
router.get('/dashboard', asyncHandler(async (req, res) => {
  const today = new Date().toISOString().split('T')[0];

  const [todayBookings, pendingCount, weekRevenue, totalCustomers, todayAppointments, pendingRequests, waitlistCount] = await Promise.all([
    getOne(
      'SELECT COUNT(*) as count FROM bookings WHERE tenant_id = $1 AND date = $2',
      [req.tenantId, today]
    ),
    getOne(
      "SELECT COUNT(*) as count FROM bookings WHERE tenant_id = $1 AND status = 'pending'",
      [req.tenantId]
    ),
    getOne(
      `SELECT COALESCE(SUM(total_price), 0) as total FROM bookings
       WHERE tenant_id = $1 AND date >= CURRENT_DATE - INTERVAL '7 days' AND status = 'confirmed'`,
      [req.tenantId]
    ),
    getOne(
      'SELECT COUNT(*) as count FROM customers WHERE tenant_id = $1',
      [req.tenantId]
    ),
    getAll(
      `SELECT b.id, b.customer_name, b.customer_email, b.service_names, b.start_time, b.end_time, b.status, b.total_price, c.allergies as customer_allergies
       FROM bookings b LEFT JOIN customers c ON c.id = b.customer_id
       WHERE b.tenant_id = $1 AND b.date = $2 AND b.status IN ('confirmed', 'pending')
       ORDER BY b.start_time`,
      [req.tenantId, today]
    ),
    getOne(
      "SELECT COUNT(*) as count FROM booking_requests WHERE tenant_id = $1 AND status = 'pending'",
      [req.tenantId]
    ),
    getOne(
      "SELECT COUNT(*)::int as count FROM waitlist WHERE tenant_id = $1 AND status = 'waiting'",
      [req.tenantId]
    ).catch(() => ({ count: 0 })),
  ]);

  res.json({
    todayBookings: parseInt(todayBookings.count),
    pendingCount: parseInt(pendingCount.count),
    weekRevenue: parseFloat(weekRevenue.total),
    totalCustomers: parseInt(totalCustomers.count),
    todayAppointments: todayAppointments || [],
    pendingRequests: parseInt(pendingRequests?.count || 0),
    waitlistCount: parseInt(waitlistCount?.count || 0),
  });
}));

// GET /api/admin/analytics — extended stats for dashboard charts
router.get('/analytics', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 30;
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];

  const [bookingTrends, revenueTrends, statusBreakdown, topServices, monthlyRevenue, newCustomers, repeatRate] = await Promise.all([
    // Daily booking counts
    getAll(
      `SELECT d::date as date, COALESCE(b.count, 0)::int as count
       FROM generate_series($2::date, $3::date, '1 day') d
       LEFT JOIN (
         SELECT date, COUNT(*) as count FROM bookings
         WHERE tenant_id = $1 AND date >= $2 AND date <= $3
         GROUP BY date
       ) b ON b.date = d::date
       ORDER BY d`,
      [req.tenantId, startStr, endStr]
    ),
    // Daily revenue
    getAll(
      `SELECT d::date as date, COALESCE(b.total, 0)::numeric as revenue
       FROM generate_series($2::date, $3::date, '1 day') d
       LEFT JOIN (
         SELECT date, SUM(total_price) as total FROM bookings
         WHERE tenant_id = $1 AND date >= $2 AND date <= $3 AND status = 'confirmed'
         GROUP BY date
       ) b ON b.date = d::date
       ORDER BY d`,
      [req.tenantId, startStr, endStr]
    ),
    // Status breakdown
    getAll(
      `SELECT status, COUNT(*)::int as count FROM bookings
       WHERE tenant_id = $1 AND date >= $2
       GROUP BY status ORDER BY count DESC`,
      [req.tenantId, startStr]
    ),
    // Top services
    getAll(
      `SELECT service_names, COUNT(*)::int as count, SUM(total_price)::numeric as revenue
       FROM bookings WHERE tenant_id = $1 AND date >= $2
       GROUP BY service_names ORDER BY count DESC LIMIT 5`,
      [req.tenantId, startStr]
    ),
    // Monthly revenue (last 6 months)
    getAll(
      `SELECT DATE_TRUNC('month', date) as month, SUM(total_price)::numeric as revenue, COUNT(*)::int as bookings
       FROM bookings WHERE tenant_id = $1 AND status = 'confirmed' AND date >= CURRENT_DATE - INTERVAL '6 months'
       GROUP BY DATE_TRUNC('month', date) ORDER BY month`,
      [req.tenantId]
    ),
    // New customers this period
    getOne(
      `SELECT COUNT(*)::int as count FROM customers WHERE tenant_id = $1 AND created_at >= $2`,
      [req.tenantId, startStr]
    ),
    // Repeat customer rate
    getOne(
      `SELECT
         COUNT(DISTINCT customer_email)::int as total_customers,
         COUNT(DISTINCT CASE WHEN booking_count > 1 THEN customer_email END)::int as repeat_customers
       FROM (
         SELECT customer_email, COUNT(*) as booking_count
         FROM bookings WHERE tenant_id = $1 AND date >= $2
         GROUP BY customer_email
       ) sub`,
      [req.tenantId, startStr]
    ),
  ]);

  res.json({
    booking_trends: bookingTrends || [],
    revenue_trends: revenueTrends || [],
    status_breakdown: statusBreakdown || [],
    top_services: topServices || [],
    monthly_revenue: monthlyRevenue || [],
    new_customers: newCustomers?.count || 0,
    repeat_customers: repeatRate?.repeat_customers || 0,
    total_unique_customers: repeatRate?.total_customers || 0,
  });
}));

// ============================================
// BOOKING REQUESTS (cancel/amend from customers)
// ============================================

// POST /api/admin/bookings/requests/:id/approve
router.post('/bookings/requests/:id/approve', asyncHandler(async (req, res) => {
  const { adminResponse } = req.body;

  const request = await getOne(
    `UPDATE booking_requests SET status = 'approved', admin_response = $1, resolved_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND status = 'pending' RETURNING *`,
    [adminResponse || null, req.params.id, req.tenantId]
  );

  if (!request) {
    return res.status(404).json({ error: 'Request not found or already processed' });
  }

  const booking = await getOne('SELECT * FROM bookings WHERE id = $1', [request.booking_id]);

  if (request.request_type === 'cancel') {
    // Cancel the booking
    await run(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [request.booking_id]);
    // Free up slots
    await run(
      `UPDATE time_slots SET is_available = TRUE
       WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
      [req.tenantId, booking.date, booking.start_time, booking.end_time]
    );
    // Notify waitlist customers about freed slot
    const { checkWaitlistForDate } = require('../utils/waitlistService');
    checkWaitlistForDate(req.tenantId, booking.date).catch(err =>
      console.error('[Waitlist] check error:', err.message)
    );
  } else if (request.request_type === 'amend' && request.requested_date) {
    // Update booking date/time
    await run(
      `UPDATE bookings SET date = $1, start_time = $2 WHERE id = $3`,
      [request.requested_date, request.requested_time, request.booking_id]
    );
  }

  // Email the customer
  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (tenant && booking) {
    sendRequestApprovedNotification(request, booking, tenant).catch(err => console.error('Email error:', err));
  }

  res.json(request);
}));

// POST /api/admin/bookings/requests/:id/reject
router.post('/bookings/requests/:id/reject', asyncHandler(async (req, res) => {
  const { adminResponse } = req.body;

  const request = await getOne(
    `UPDATE booking_requests SET status = 'rejected', admin_response = $1, resolved_at = NOW()
     WHERE id = $2 AND tenant_id = $3 AND status = 'pending' RETURNING *`,
    [adminResponse || null, req.params.id, req.tenantId]
  );

  if (!request) {
    return res.status(404).json({ error: 'Request not found or already processed' });
  }

  const booking = await getOne('SELECT * FROM bookings WHERE id = $1', [request.booking_id]);
  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (tenant && booking) {
    sendRequestRejectedNotification(request, booking, tenant).catch(err => console.error('Email error:', err));
  }

  res.json(request);
}));

// ============================================
// CUSTOMERS
// ============================================

// GET /api/admin/customers
router.get('/customers', asyncHandler(async (req, res) => {
  const customers = await getAll(
    `SELECT c.*,
       COUNT(DISTINCT b.id) as booking_count,
       COALESCE(SUM(CASE WHEN b.status IN ('confirmed','completed') THEN b.total_price ELSE 0 END), 0) as total_spent,
       MAX(b.date) as last_booking_date
     FROM customers c
     LEFT JOIN bookings b ON b.customer_email = c.email AND b.tenant_id = c.tenant_id
     WHERE c.tenant_id = $1
     GROUP BY c.id
     ORDER BY c.created_at DESC`,
    [req.tenantId]
  );
  res.json(customers);
}));

// POST /api/admin/customers — create a customer
router.post('/customers', asyncHandler(async (req, res) => {
  const { name, email, phone } = req.body;
  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }
  if (phone) {
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }
  }
  try {
    const customer = await getOne(
      `INSERT INTO customers (tenant_id, name, email, phone)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.tenantId, name, email, phone || null]
    );
    res.status(201).json(customer);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A customer with this email already exists' });
    }
    throw err;
  }
}));

// GET /api/admin/customers/search
router.get('/customers/search', asyncHandler(async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);

  const search = `%${q}%`;
  const customers = await getAll(
    `SELECT * FROM customers
     WHERE tenant_id = $1 AND (name ILIKE $2 OR email ILIKE $2 OR phone ILIKE $2)
     ORDER BY name LIMIT 20`,
    [req.tenantId, search]
  );
  res.json(customers);
}));

// GET /api/admin/customers/:id
router.get('/customers/:id', asyncHandler(async (req, res) => {
  const customer = await getOne(
    'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  // Get booking history with stats
  const bookings = await getAll(
    `SELECT * FROM bookings
     WHERE tenant_id = $1 AND customer_email = $2
     ORDER BY date DESC, start_time DESC`,
    [req.tenantId, customer.email]
  );

  const stats = {
    total: bookings.length,
    completed: bookings.filter(b => b.status === 'confirmed' || b.status === 'completed').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
    noShows: bookings.filter(b => b.marked_noshow).length,
    totalSpent: bookings
      .filter(b => b.status === 'confirmed' || b.status === 'completed')
      .reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0),
  };

  // Find favourite service
  const serviceCounts = {};
  bookings.forEach(b => {
    if (b.service_names) {
      b.service_names.split(',').forEach(s => {
        const name = s.trim();
        serviceCounts[name] = (serviceCounts[name] || 0) + 1;
      });
    }
  });
  const entries = Object.entries(serviceCounts);
  stats.favouriteService = entries.length > 0
    ? entries.sort((a, b) => b[1] - a[1])[0][0]
    : null;

  res.json({ customer, bookings, stats });
}));

// PUT /api/admin/customers/:id/contact — edit contact details
router.put('/customers/:id/contact', asyncHandler(async (req, res) => {
  const { name, email, phone, gender } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });

  // Check email uniqueness if changed
  if (email) {
    const existing = await getOne(
      'SELECT id FROM customers WHERE email = $1 AND tenant_id = $2 AND id != $3',
      [email.toLowerCase().trim(), req.tenantId, req.params.id]
    );
    if (existing) return res.status(409).json({ error: 'Another customer already has this email address' });
  }

  const customer = await getOne(
    `UPDATE customers SET name = $1, email = $2, phone = $3, gender = $4
     WHERE id = $5 AND tenant_id = $6 RETURNING *`,
    [name.trim(), email ? email.toLowerCase().trim() : null, phone?.trim() || null, gender || null, req.params.id, req.tenantId]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

// PUT /api/admin/customers/:id/notes
router.put('/customers/:id/notes', asyncHandler(async (req, res) => {
  const { notes } = req.body;
  const customer = await getOne(
    'UPDATE customers SET admin_notes = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
    [notes || null, req.params.id, req.tenantId]
  );

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  res.json(customer);
}));

// PUT /api/admin/customers/:id/preferences
router.put('/customers/:id/preferences', asyncHandler(async (req, res) => {
  const { allergies, preferences, tags } = req.body;
  const customer = await getOne(
    `UPDATE customers SET allergies = $1, preferences = $2, tags = $3
     WHERE id = $4 AND tenant_id = $5 RETURNING *`,
    [allergies || null, preferences || null, tags || null, req.params.id, req.tenantId]
  );

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  res.json(customer);
}));

// PUT /api/admin/customers/:id/card-exempt
router.put('/customers/:id/card-exempt', asyncHandler(async (req, res) => {
  const { exempt } = req.body;
  const customer = await getOne(
    'UPDATE customers SET card_required_exempt = $1 WHERE id = $2 AND tenant_id = $3 RETURNING *',
    [!!exempt, req.params.id, req.tenantId]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json(customer);
}));

// GET /api/admin/customers/:id/communications — email + SMS history
router.get('/customers/:id/communications', asyncHandler(async (req, res) => {
  const customer = await getOne(
    'SELECT id, email, phone FROM customers WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const emails = await getAll(
    `SELECT id, email_type AS type, subject, status, sent_at, created_at, 'email' AS channel
     FROM email_logs
     WHERE tenant_id = $1 AND (customer_id = $2 OR ($3 IS NOT NULL AND recipient_email = $3))
     ORDER BY created_at DESC
     LIMIT 100`,
    [req.tenantId, customer.id, customer.email]
  );

  const sms = await getAll(
    `SELECT id, sms_type AS type, message_preview, status, sent_at, created_at, 'sms' AS channel
     FROM sms_logs
     WHERE tenant_id = $1 AND (customer_id = $2 OR ($3 IS NOT NULL AND recipient_phone = $3))
     ORDER BY created_at DESC
     LIMIT 100`,
    [req.tenantId, customer.id, customer.phone]
  );

  const combined = [...emails, ...sms].sort((a, b) =>
    new Date(b.created_at) - new Date(a.created_at)
  );

  res.json(combined);
}));

// DELETE /api/admin/customers/:id (GDPR delete — anonymize bookings, preserve revenue)
router.delete('/customers/:id', asyncHandler(async (req, res) => {
  const customer = await getOne(
    'SELECT id, email FROM customers WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!customer) {
    return res.status(404).json({ error: 'Customer not found' });
  }

  const { deleteCustomerData } = require('../utils/gdprService');
  await deleteCustomerData(customer.id, req.tenantId, customer.email);

  // Activity log
  const { logActivity } = require('../utils/activityLog');
  logActivity(req.tenantId, 'tenant_admin', req.user.id, req.user.email, 'customer_gdpr_deleted', { customer_id: customer.id }).catch(() => {});

  res.json({ message: 'Customer data deleted. Revenue records preserved with anonymised data.' });
}));

// POST /api/admin/customers/bulk-delete (GDPR delete multiple customers)
router.post('/customers/bulk-delete', asyncHandler(async (req, res) => {
  const { customerIds } = req.body;
  if (!Array.isArray(customerIds) || customerIds.length === 0) {
    return res.status(400).json({ error: 'customerIds array is required' });
  }
  if (customerIds.length > 500) {
    return res.status(400).json({ error: 'Maximum 500 customers per bulk delete' });
  }

  const { deleteCustomerData } = require('../utils/gdprService');
  const { logActivity } = require('../utils/activityLog');
  let deleted = 0;
  const errors = [];

  for (const id of customerIds) {
    try {
      const customer = await getOne(
        'SELECT id, email FROM customers WHERE id = $1 AND tenant_id = $2',
        [id, req.tenantId]
      );
      if (!customer) {
        errors.push({ id, error: 'Not found' });
        continue;
      }
      await deleteCustomerData(customer.id, req.tenantId, customer.email);
      logActivity(req.tenantId, 'tenant_admin', req.user.id, req.user.email, 'customer_gdpr_deleted', { customer_id: customer.id }).catch(() => {});
      deleted++;
    } catch (err) {
      errors.push({ id, error: err.message });
    }
  }

  res.json({ deleted, errors, message: `${deleted} customer(s) deleted. Revenue records preserved with anonymised data.` });
}));

// POST /api/admin/customers/import — bulk import customers from CSV/XLSX
router.post('/customers/import', asyncHandler(async (req, res) => {
  const { customers: rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'customers array is required' });
  }
  if (rows.length > 1000) {
    return res.status(400).json({ error: 'Maximum 1000 customers per import' });
  }

  let imported = 0, updated = 0, skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors = [];

    if (!row.name || !row.name.trim()) rowErrors.push('Name is required');
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) rowErrors.push('Invalid email format');
    if (!row.email && !row.phone) rowErrors.push('Email or phone is required');
    if (row.phone) {
      const clean = row.phone.replace(/[\s\-\(\)]/g, '');
      if (!/^\+?[0-9]{7,15}$/.test(clean)) rowErrors.push('Invalid phone format');
    }

    if (rowErrors.length > 0) {
      errors.push({ row: i + 1, name: row.name || '', errors: rowErrors });
      skipped++;
      continue;
    }

    const email = row.email?.trim().toLowerCase() || null;

    try {
      let result;
      if (email) {
        // Has email — upsert by email (smart merge)
        result = await getOne(
          `INSERT INTO customers (tenant_id, name, email, phone, admin_notes, tags, gender, client_source, first_visit_date, last_visit_date, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()))
           ON CONFLICT (tenant_id, email) WHERE email IS NOT NULL DO UPDATE SET
             name = COALESCE(NULLIF($2, ''), customers.name),
             phone = COALESCE(NULLIF($4, ''), customers.phone),
             admin_notes = CASE WHEN $5 IS NOT NULL AND $5 != '' THEN COALESCE(customers.admin_notes || E'\n' || $5, $5) ELSE customers.admin_notes END,
             tags = CASE WHEN $6 IS NOT NULL AND $6 != '' THEN $6 ELSE customers.tags END,
             gender = COALESCE(NULLIF($7, ''), customers.gender),
             client_source = COALESCE(NULLIF($8, ''), customers.client_source),
             first_visit_date = COALESCE($9, customers.first_visit_date),
             last_visit_date = COALESCE($10, customers.last_visit_date)
           RETURNING id, (xmax = 0) as is_new`,
          [req.tenantId, row.name.trim(), email,
           row.phone?.trim() || null, row.notes?.trim() || null, row.tags?.trim() || null,
           row.gender?.trim() || null, row.client_source?.trim() || null,
           row.first_visit_date || null, row.last_visit_date || null,
           row.added_on || null]
        );
      } else {
        // No email — check for existing customer by name + phone to avoid duplicates
        const existing = await getOne(
          'SELECT id FROM customers WHERE tenant_id = $1 AND LOWER(name) = $2 AND phone = $3',
          [req.tenantId, row.name.trim().toLowerCase(), row.phone?.trim() || null]
        );
        if (existing) {
          // Merge data into the existing record
          await run(
            `UPDATE customers SET
               admin_notes = COALESCE(NULLIF($2, ''), admin_notes),
               tags = COALESCE(NULLIF($3, ''), tags),
               gender = COALESCE(NULLIF($4, ''), gender),
               client_source = COALESCE(NULLIF($5, ''), client_source),
               first_visit_date = COALESCE($6, first_visit_date),
               last_visit_date = COALESCE($7, last_visit_date)
             WHERE id = $1`,
            [existing.id, row.notes?.trim() || null, row.tags?.trim() || null,
             row.gender?.trim() || null, row.client_source?.trim() || null,
             row.first_visit_date || null, row.last_visit_date || null]
          );
          result = { is_new: false };
        } else {
          result = await getOne(
            `INSERT INTO customers (tenant_id, name, phone, admin_notes, tags, gender, client_source, first_visit_date, last_visit_date, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10, NOW()))
             RETURNING id, TRUE as is_new`,
            [req.tenantId, row.name.trim(),
             row.phone?.trim() || null, row.notes?.trim() || null, row.tags?.trim() || null,
             row.gender?.trim() || null, row.client_source?.trim() || null,
             row.first_visit_date || null, row.last_visit_date || null,
             row.added_on || null]
          );
        }
      }
      if (result.is_new) imported++; else updated++;
    } catch (err) {
      errors.push({ row: i + 1, name: row.name || '', errors: [err.message] });
      skipped++;
    }
  }

  res.json({ message: `Import complete: ${imported} created, ${updated} updated, ${skipped} skipped`, imported, updated, skipped, errors });
}));

// POST /api/admin/bookings/import — bulk import bookings from CSV/XLSX
router.post('/bookings/import', asyncHandler(async (req, res) => {
  const { bookings: rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'bookings array is required' });
  }
  if (rows.length > 2000) {
    return res.status(400).json({ error: 'Maximum 2000 bookings per import' });
  }

  // Pre-load customers and services for lookup
  const customers = await getAll(
    'SELECT id, name, email, phone FROM customers WHERE tenant_id = $1',
    [req.tenantId]
  );
  const customerByName = {};
  customers.forEach(c => { customerByName[c.name.toLowerCase()] = c; });

  const services = await getAll(
    'SELECT id, name, duration, price, category FROM services WHERE tenant_id = $1 AND active = TRUE',
    [req.tenantId]
  );
  const serviceByName = {};
  services.forEach(s => { serviceByName[s.name.toLowerCase()] = s; });

  let imported = 0, skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowErrors = [];

    if (!row.customer_name || !row.customer_name.trim()) rowErrors.push('Client name is required');
    if (!row.date) rowErrors.push('Date is required');
    if (!row.start_time || !row.end_time) rowErrors.push('Start and end time are required');

    if (rowErrors.length > 0) {
      errors.push({ row: i + 1, name: row.customer_name || '', errors: rowErrors });
      skipped++;
      continue;
    }

    // Lookup customer
    const customer = customerByName[row.customer_name.trim().toLowerCase()];
    const customerEmail = customer?.email || row.customer_email?.trim()?.toLowerCase() || '';
    const customerPhone = customer?.phone || '';

    // Lookup service
    const service = row.service_name ? serviceByName[row.service_name.trim().toLowerCase()] : null;

    // Map status
    const statusMap = { 'new': 'confirmed', 'confirmed': 'confirmed', 'completed': 'completed', 'cancelled': 'cancelled', 'no-show': 'confirmed' };
    const status = statusMap[(row.status || 'confirmed').toLowerCase()] || 'confirmed';

    try {
      await run(
        `INSERT INTO bookings (
          tenant_id, customer_name, customer_email, customer_phone,
          customer_id, service_ids, service_names, date,
          start_time, end_time, total_price, total_duration,
          status, payment_status, created_by, booking_source, notes,
          reminder_24h_sent, sms_24h_sent, sms_2h_sent, booked_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, TRUE, TRUE, TRUE, $18)`,
        [
          req.tenantId,
          row.customer_name.trim(),
          customerEmail,
          customerPhone,
          customer?.id || null,
          service?.id ? String(service.id) : null,
          row.service_name?.trim() || null,
          row.date,
          row.start_time,
          row.end_time,
          parseFloat(row.price) || 0,
          parseInt(row.duration) || null,
          status,
          status === 'cancelled' ? 'cancelled' : 'completed',
          'import',
          'import',
          row.notes?.trim() || null,
          row.booked_date || null,
        ]
      );
      imported++;
    } catch (err) {
      if (err.code === '23505') {
        skipped++;
      } else {
        errors.push({ row: i + 1, name: row.customer_name || '', errors: [err.message] });
        skipped++;
      }
    }
  }

  res.json({ message: `Import complete: ${imported} imported, ${skipped} skipped`, imported, skipped, errors });
}));

// POST /api/admin/bookings/import/enable-notifications — re-enable reminders for future imported bookings
router.post('/bookings/import/enable-notifications', asyncHandler(async (req, res) => {
  const result = await run(
    `UPDATE bookings
     SET reminder_24h_sent = FALSE, sms_24h_sent = FALSE, sms_2h_sent = FALSE
     WHERE tenant_id = $1
       AND booking_source = 'import'
       AND date >= CURRENT_DATE
       AND status IN ('confirmed', 'pending')
       AND reminder_24h_sent = TRUE`,
    [req.tenantId]
  );
  res.json({ updated: result.rowCount || 0 });
}));

// POST /api/admin/bookings/detect-recurring — analyse imported bookings for recurring patterns
router.post('/bookings/detect-recurring', asyncHandler(async (req, res) => {
  const bookings = await getAll(
    `SELECT id, customer_name, service_names, date, start_time, end_time
     FROM bookings
     WHERE tenant_id = $1 AND booking_source = 'import' AND recurring_group_id IS NULL
     ORDER BY customer_name, service_names, date`,
    [req.tenantId]
  );

  // Group by customer + service + day of week + time
  const groups = {};
  for (const b of bookings) {
    const dow = new Date(b.date).getDay();
    const key = `${b.customer_name.toLowerCase()}|${(b.service_names || '').toLowerCase()}|${dow}|${b.start_time}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  }

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const patterns = [];

  for (const [key, group] of Object.entries(groups)) {
    if (group.length < 3) continue;

    // Sort by date
    group.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate intervals between consecutive bookings
    const intervals = [];
    for (let i = 1; i < group.length; i++) {
      const diff = Math.round((new Date(group[i].date) - new Date(group[i - 1].date)) / (1000 * 60 * 60 * 24));
      intervals.push(diff);
    }

    // Detect frequency with tolerance
    const freqMap = { 7: 'weekly', 14: 'fortnightly', 28: '4-weekly' };
    let detectedFreq = null;
    let bestMatch = 0;

    for (const [target, name] of Object.entries(freqMap)) {
      const t = parseInt(target);
      const matches = intervals.filter(d => Math.abs(d - t) <= 2).length;
      if (matches > bestMatch && matches / intervals.length >= 0.6) {
        bestMatch = matches;
        detectedFreq = name;
      }
    }

    // Also check monthly (28-31 day intervals)
    if (!detectedFreq) {
      const monthlyMatches = intervals.filter(d => d >= 26 && d <= 33).length;
      if (monthlyMatches / intervals.length >= 0.6) {
        detectedFreq = 'monthly';
        bestMatch = monthlyMatches;
      }
    }

    if (!detectedFreq) continue;

    const [, , dowStr, startTime] = key.split('|');
    const lastDate = new Date(group[group.length - 1].date);

    // Generate suggested next dates
    const intervalDays = { weekly: 7, fortnightly: 14, '4-weekly': 28, monthly: 28 };
    const step = intervalDays[detectedFreq];
    const suggestedDates = [];
    let nextDate = new Date(lastDate);
    for (let i = 0; i < 4; i++) {
      nextDate = new Date(nextDate.getTime() + step * 24 * 60 * 60 * 1000);
      suggestedDates.push(nextDate.toISOString().split('T')[0]);
    }

    patterns.push({
      customer_name: group[0].customer_name,
      service_names: group[0].service_names || '',
      day_of_week: dayNames[parseInt(dowStr)],
      start_time: startTime,
      end_time: group[0].end_time,
      frequency: detectedFreq,
      booking_count: group.length,
      first_date: group[0].date,
      last_date: group[group.length - 1].date,
      booking_ids: group.map(b => b.id),
      suggested_next_dates: suggestedDates,
      confidence: Math.round((bestMatch / intervals.length) * 100),
    });
  }

  patterns.sort((a, b) => b.booking_count - a.booking_count);
  res.json({ patterns, total_analysed: bookings.length });
}));

// POST /api/admin/bookings/confirm-recurring — tag detected patterns and optionally create future bookings
router.post('/bookings/confirm-recurring', asyncHandler(async (req, res) => {
  const { patterns } = req.body;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return res.status(400).json({ error: 'patterns array is required' });
  }

  let tagged = 0, created = 0;

  for (const pattern of patterns) {
    const { booking_ids, frequency, continueForward, continueCount } = pattern;
    if (!booking_ids?.length) continue;

    const groupId = require('crypto').randomUUID();

    // Tag existing bookings
    const placeholders = booking_ids.map((_, i) => `$${i + 4}`).join(',');
    const result = await run(
      `UPDATE bookings SET recurring_group_id = $1, is_recurring = TRUE, recurring_frequency = $2
       WHERE tenant_id = $3 AND id IN (${placeholders})`,
      [groupId, frequency, req.tenantId, ...booking_ids]
    );
    tagged += result.rowCount || 0;

    // Create future bookings if requested
    if (continueForward && continueCount > 0) {
      // Get the last booking in the series for template data
      const lastBooking = await getOne(
        'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
        [booking_ids[booking_ids.length - 1], req.tenantId]
      );
      if (!lastBooking) continue;

      const intervalDays = { weekly: 7, fortnightly: 14, '4-weekly': 28, monthly: 28 };
      const step = intervalDays[frequency] || 28;
      let nextDate = new Date(lastBooking.date);

      for (let i = 0; i < Math.min(continueCount, 52); i++) {
        nextDate = new Date(nextDate.getTime() + step * 24 * 60 * 60 * 1000);
        const dateStr = nextDate.toISOString().split('T')[0];

        try {
          await run(
            `INSERT INTO bookings (tenant_id, customer_id, customer_name, customer_email, customer_phone,
               service_ids, service_names, date, start_time, end_time,
               total_price, total_duration, status, created_by,
               recurring_group_id, is_recurring, recurring_frequency)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed', 'admin', $13, TRUE, $14)`,
            [req.tenantId, lastBooking.customer_id, lastBooking.customer_name,
             lastBooking.customer_email, lastBooking.customer_phone,
             lastBooking.service_ids, lastBooking.service_names,
             dateStr, lastBooking.start_time, lastBooking.end_time,
             lastBooking.total_price, lastBooking.total_duration,
             groupId, frequency]
          );

          // Mark time slots unavailable
          await run(
            `UPDATE time_slots SET is_available = FALSE
             WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
            [req.tenantId, dateStr, lastBooking.start_time, lastBooking.end_time]
          );

          created++;
        } catch (err) {
          if (err.code !== '23505') throw err; // Skip duplicates silently
        }
      }
    }
  }

  res.json({ tagged, created, message: `${tagged} bookings tagged as recurring, ${created} future bookings created` });
}));

// GET /api/admin/customers/filter — filter customers with dynamic criteria
router.get('/customers/filter', asyncHandler(async (req, res) => {
  const { min_spent, max_spent, min_visits, max_visits, last_visit_after, last_visit_before, tags, has_allergies, min_bookings, max_bookings } = req.query;

  let where = 'c.tenant_id = $1';
  const params = [req.tenantId];
  let idx = 2;

  if (min_visits) { where += ` AND c.total_visits >= $${idx++}`; params.push(parseInt(min_visits)); }
  if (max_visits) { where += ` AND c.total_visits <= $${idx++}`; params.push(parseInt(max_visits)); }
  if (last_visit_after) { where += ` AND c.last_visit_date >= $${idx++}`; params.push(last_visit_after); }
  if (last_visit_before) { where += ` AND c.last_visit_date <= $${idx++}`; params.push(last_visit_before); }
  if (has_allergies === 'true') { where += ` AND c.allergies IS NOT NULL AND c.allergies != ''`; }
  if (tags) {
    const tagList = tags.split(',').map(t => t.trim());
    for (const tag of tagList) {
      where += ` AND c.tags ILIKE $${idx++}`;
      params.push(`%${tag}%`);
    }
  }

  let having = '';
  const havingClauses = [];
  if (min_spent) { havingClauses.push(`COALESCE(SUM(b.total_price), 0) >= $${idx++}`); params.push(parseFloat(min_spent)); }
  if (max_spent) { havingClauses.push(`COALESCE(SUM(b.total_price), 0) <= $${idx++}`); params.push(parseFloat(max_spent)); }
  if (min_bookings) { havingClauses.push(`COUNT(b.id) >= $${idx++}`); params.push(parseInt(min_bookings)); }
  if (max_bookings) { havingClauses.push(`COUNT(b.id) <= $${idx++}`); params.push(parseInt(max_bookings)); }
  if (havingClauses.length) having = ' HAVING ' + havingClauses.join(' AND ');

  const customers = await getAll(
    `SELECT c.id, c.name, c.email, c.phone, c.tags, c.allergies, c.total_visits, c.last_visit_date,
       COUNT(b.id)::int as booking_count,
       COALESCE(SUM(b.total_price), 0)::numeric as total_spent
     FROM customers c
     LEFT JOIN bookings b ON b.customer_id = c.id AND b.tenant_id = c.tenant_id AND b.status IN ('confirmed','completed')
     WHERE ${where}
     GROUP BY c.id, c.name, c.email, c.phone, c.tags, c.allergies, c.total_visits, c.last_visit_date
     ${having}
     ORDER BY c.name ASC`,
    params
  );

  res.json(customers.map(c => ({ ...c, total_spent: parseFloat(c.total_spent) })));
}));

// CRUD for customer segments
router.get('/segments', asyncHandler(async (req, res) => {
  const segments = await getAll(
    'SELECT * FROM customer_segments WHERE tenant_id = $1 ORDER BY created_at DESC',
    [req.tenantId]
  );
  res.json(segments);
}));

router.post('/segments', asyncHandler(async (req, res) => {
  const { name, description, filters } = req.body;
  if (!name || !filters) return res.status(400).json({ error: 'name and filters are required' });
  const segment = await getOne(
    `INSERT INTO customer_segments (tenant_id, name, description, filters, last_computed_at)
     VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
    [req.tenantId, name, description || null, JSON.stringify(filters)]
  );
  res.status(201).json(segment);
}));

router.put('/segments/:id', asyncHandler(async (req, res) => {
  const { name, description, filters } = req.body;
  const segment = await getOne(
    `UPDATE customer_segments SET name = COALESCE($3, name), description = $4, filters = COALESCE($5, filters), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [req.params.id, req.tenantId, name, description || null, filters ? JSON.stringify(filters) : null]
  );
  if (!segment) return res.status(404).json({ error: 'Segment not found' });
  res.json(segment);
}));

router.delete('/segments/:id', asyncHandler(async (req, res) => {
  await run('DELETE FROM customer_segments WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json({ message: 'Segment deleted' });
}));

// Customer photo routes
router.get('/customers/:customerId/photos', asyncHandler(async (req, res) => {
  const photos = await getAll(
    `SELECT id, customer_id, booking_id, photo_type, pair_id, caption, file_name, mime_type, file_size, taken_at, created_at
     FROM customer_photos WHERE tenant_id = $1 AND customer_id = $2
     ORDER BY created_at DESC`,
    [req.tenantId, req.params.customerId]
  );
  res.json(photos);
}));

router.post('/customers/:customerId/photos', upload.single('photo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Photo file is required' });
  if (!['image/png', 'image/jpeg'].includes(req.file.mimetype)) {
    return res.status(400).json({ error: 'Only PNG and JPEG images are allowed' });
  }

  const { photo_type, pair_id, caption, booking_id } = req.body;
  if (!photo_type || !['before', 'after'].includes(photo_type)) {
    return res.status(400).json({ error: 'photo_type must be "before" or "after"' });
  }

  const resolvedPairId = pair_id || (photo_type === 'before' ? require('crypto').randomUUID().slice(0, 8) : null);

  const photo = await getOne(
    `INSERT INTO customer_photos (tenant_id, customer_id, booking_id, photo_type, pair_id, caption, file_name, mime_type, file_size, file_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id, photo_type, pair_id, caption, file_name, mime_type, file_size, created_at`,
    [req.tenantId, req.params.customerId, booking_id || null, photo_type, resolvedPairId,
     caption || null, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
  );

  res.status(201).json(photo);
}));

router.get('/customers/:customerId/photos/:photoId', asyncHandler(async (req, res) => {
  const photo = await getOne(
    'SELECT file_data, mime_type, file_name FROM customer_photos WHERE id = $1 AND tenant_id = $2 AND customer_id = $3',
    [req.params.photoId, req.tenantId, req.params.customerId]
  );
  if (!photo) return res.status(404).json({ error: 'Photo not found' });
  res.setHeader('Content-Type', photo.mime_type);
  res.setHeader('Content-Disposition', `inline; filename="${photo.file_name}"`);
  res.send(photo.file_data);
}));

router.delete('/customers/:customerId/photos/:photoId', asyncHandler(async (req, res) => {
  await run('DELETE FROM customer_photos WHERE id = $1 AND tenant_id = $2 AND customer_id = $3',
    [req.params.photoId, req.tenantId, req.params.customerId]);
  res.json({ message: 'Photo deleted' });
}));

// ============================================
// ADMIN SLOTS (for admin booking creation)
// ============================================

// GET /api/admin/slots?date=YYYY-MM-DD
router.get('/slots', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const slots = await getAll(
    `SELECT id, date, start_time, end_time
     FROM time_slots
     WHERE tenant_id = $1 AND date = $2 AND is_available = TRUE
     ORDER BY start_time`,
    [req.tenantId, date]
  );
  res.json(slots);
}));

// GET /api/admin/slots/overview?days=14 — availability overview for upcoming days
router.get('/slots/overview', asyncHandler(async (req, res) => {
  const days = parseInt(req.query.days) || 14;
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + days);

  const overview = await getAll(
    `SELECT date,
       COUNT(*) FILTER (WHERE is_available = TRUE) as available,
       COUNT(*) FILTER (WHERE is_available = FALSE) as booked,
       COUNT(*) as total
     FROM time_slots
     WHERE tenant_id = $1 AND date >= CURRENT_DATE AND date <= $2
     GROUP BY date
     ORDER BY date`,
    [req.tenantId, endDate.toISOString().split('T')[0]]
  );

  res.json(overview);
}));

// GET /api/admin/slots/day?date=YYYY-MM-DD — all slots for a day (both available and booked)
router.get('/slots/day', asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const slots = await getAll(
    `SELECT ts.id, ts.start_time, ts.end_time, ts.is_available,
       b.id as booking_id, b.customer_name, b.service_names, b.status as booking_status
     FROM time_slots ts
     LEFT JOIN bookings b ON b.tenant_id = ts.tenant_id AND b.date = ts.date
       AND ts.start_time >= b.start_time AND ts.start_time < b.end_time
       AND b.status IN ('confirmed', 'pending')
     WHERE ts.tenant_id = $1 AND ts.date = $2
     ORDER BY ts.start_time`,
    [req.tenantId, date]
  );

  res.json(slots);
}));

// ============================================
// ADMIN BOOKING CREATION
// ============================================

// GET /api/admin/next-available — find next available slot for given services
router.get('/next-available', asyncHandler(async (req, res) => {
  const { serviceIds, from } = req.query;
  if (!serviceIds) return res.status(400).json({ error: 'serviceIds required' });

  const ids = serviceIds.split(',').map(Number).filter(Boolean);
  if (!ids.length) return res.status(400).json({ error: 'Invalid serviceIds' });

  const placeholders = ids.map((_, i) => `$${i + 2}`).join(',');
  const services = await getAll(
    `SELECT duration FROM services WHERE id IN (${placeholders}) AND tenant_id = $1 AND active = TRUE`,
    [req.tenantId, ...ids]
  );
  if (!services.length) return res.status(400).json({ error: 'No valid services found' });

  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);

  const sampleSlot = await getOne(
    `SELECT start_time, end_time FROM time_slots
     WHERE tenant_id = $1 AND date >= CURRENT_DATE AND is_available = TRUE
     ORDER BY date, start_time LIMIT 1`,
    [req.tenantId]
  );
  let slotMinutes = 30;
  if (sampleSlot && sampleSlot.start_time && sampleSlot.end_time) {
    const st = sampleSlot.start_time.split(':').map(Number);
    const et = sampleSlot.end_time.split(':').map(Number);
    slotMinutes = (et[0] * 60 + et[1]) - (st[0] * 60 + st[1]);
    if (slotMinutes <= 0) slotMinutes = 30;
  }
  const slotsNeeded = Math.ceil(totalDuration / slotMinutes);
  const startDate = from || new Date().toISOString().split('T')[0];

  for (let dayOffset = 0; dayOffset < 30; dayOffset++) {
    const checkDate = new Date(startDate);
    checkDate.setDate(checkDate.getDate() + dayOffset);
    const dateStr = checkDate.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    if (dateStr < today) continue;

    const slots = await getAll(
      `SELECT id, start_time, end_time FROM time_slots
       WHERE tenant_id = $1 AND date = $2 AND is_available = TRUE
       ORDER BY start_time`,
      [req.tenantId, dateStr]
    );

    for (let i = 0; i <= slots.length - slotsNeeded; i++) {
      let consecutive = true;
      for (let j = 1; j < slotsNeeded; j++) {
        if (slots[i + j - 1].end_time !== slots[i + j].start_time) {
          consecutive = false;
          break;
        }
      }
      if (consecutive) {
        return res.json({ found: true, date: dateStr, time: slots[i].start_time.slice(0, 5) });
      }
    }
  }

  res.json({ found: false });
}));

// POST /api/admin/bookings/admin-create
router.post('/bookings/admin-create', asyncHandler(async (req, res) => {
  const { customerId, customerName, customerEmail, customerPhone, serviceIds, date, startTime, notes, bookingSource, priceOverride } = req.body;

  if (!serviceIds?.length || !date || !startTime) {
    return res.status(400).json({ error: 'serviceIds, date, and startTime are required' });
  }

  if (!customerId && (!customerName || !customerEmail)) {
    return res.status(400).json({ error: 'Either customerId or customerName + customerEmail required' });
  }

  if (customerPhone) {
    const cleanPhone = customerPhone.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }
  }

  // Enforce plan booking limit
  const tenantRecord = await getOne('SELECT subscription_tier FROM tenants WHERE id = $1', [req.tenantId]);
  const plan = await getOne(
    'SELECT max_bookings_per_month FROM subscription_plans WHERE tier = $1 AND is_active = TRUE',
    [tenantRecord?.subscription_tier || 'free']
  );
  if (plan?.max_bookings_per_month) {
    const { count } = await getOne(
      `SELECT COUNT(*)::int AS count FROM bookings
       WHERE tenant_id = $1 AND date_trunc('month', created_at) = date_trunc('month', CURRENT_DATE)`,
      [req.tenantId]
    );
    if (count >= plan.max_bookings_per_month) {
      return res.status(403).json({
        error: `Your plan allows up to ${plan.max_bookings_per_month} bookings per month. Upgrade to increase your limit.`,
        code: 'PLAN_LIMIT_REACHED',
      });
    }
  }

  // Resolve customer
  let customer;
  if (customerId) {
    customer = await getOne('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [customerId, req.tenantId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
  } else {
    // Upsert customer
    customer = await getOne(
      `INSERT INTO customers (tenant_id, name, email, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, email) WHERE email IS NOT NULL DO UPDATE SET
         name = EXCLUDED.name, phone = COALESCE(EXCLUDED.phone, customers.phone)
       RETURNING *`,
      [req.tenantId, customerName, customerEmail, customerPhone || null]
    );
  }

  // Fetch services
  const placeholders = serviceIds.map((_, i) => `$${i + 2}`).join(',');
  const services = await getAll(
    `SELECT * FROM services WHERE id IN (${placeholders}) AND tenant_id = $1 AND active = TRUE`,
    [req.tenantId, ...serviceIds]
  );

  if (services.length !== serviceIds.length) {
    return res.status(400).json({ error: 'One or more services are invalid' });
  }

  const serviceTotalPrice = services.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalPrice = (priceOverride != null && priceOverride >= 0) ? parseFloat(priceOverride) : serviceTotalPrice;
  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
  const serviceNames = services.map(s => s.name).join(', ');

  const [hours, minutes] = startTime.split(':').map(Number);
  const endMinutes = hours * 60 + minutes + totalDuration;
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

  // Check payment policy: card confirmation required?
  const cardConfSetting = await getOne(
    "SELECT setting_value FROM tenant_settings WHERE tenant_id = $1 AND setting_key = 'require_card_confirmation'",
    [req.tenantId]
  );
  const requireCardConfirmation = cardConfSetting?.setting_value === 'true';
  const customerExempt = customer.card_required_exempt === true;
  const hasSavedCard = !!customer.stripe_payment_method_id;

  let bookingStatus = 'confirmed';
  let confirmationToken = null;
  let confirmationExpires = null;

  if (requireCardConfirmation && !customerExempt && !hasSavedCard) {
    bookingStatus = 'pending_confirmation';
    confirmationToken = crypto.randomBytes(32).toString('hex');
    confirmationExpires = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  }

  // Create booking
  const booking = await getOne(
    `INSERT INTO bookings (tenant_id, customer_id, customer_name, customer_email, customer_phone,
       service_ids, service_names, date, start_time, end_time,
       total_price, total_duration, status, notes, created_by, booking_source,
       confirmation_token, confirmation_token_expires)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'admin', $15, $16, $17)
     RETURNING *`,
    [req.tenantId, customer.id, customer.name, customer.email, customer.phone || null,
     serviceIds.join(','), serviceNames, date, startTime, endTime,
     totalPrice, totalDuration, bookingStatus, notes || null, bookingSource || 'walk_in',
     confirmationToken, confirmationExpires]
  );

  // Mark time slots as unavailable
  await run(
    `UPDATE time_slots SET is_available = FALSE
     WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
    [req.tenantId, date, startTime, endTime]
  );

  // Send card confirmation notification if payment policy triggered
  if (bookingStatus === 'pending_confirmation') {
    const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
    if (tenant) {
      const { sendBookingCardConfirmationEmail, sendBookingCardConfirmationSMS } = require('../utils/emailService');
      if (customer.email) {
        sendBookingCardConfirmationEmail(booking, tenant, confirmationToken).catch(err =>
          console.error('Card confirmation email error:', err)
        );
      } else if (customer.phone) {
        sendBookingCardConfirmationSMS(booking, tenant, confirmationToken).catch(err =>
          console.error('Card confirmation SMS error:', err)
        );
      }
    }
  }

  res.status(201).json(booking);
}));

// POST /api/admin/bookings/admin-create-recurring
router.post('/bookings/admin-create-recurring', asyncHandler(async (req, res) => {
  const { customerId, customerName, customerEmail, customerPhone, serviceIds, dates, notes, priceOverride, frequency } = req.body;

  if (!serviceIds?.length || !dates?.length) {
    return res.status(400).json({ error: 'serviceIds and dates are required' });
  }

  if (customerPhone) {
    const cleanPhone = customerPhone.replace(/[\s\-\(\)]/g, '');
    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }
  }

  let customer;
  if (customerId) {
    customer = await getOne('SELECT * FROM customers WHERE id = $1 AND tenant_id = $2', [customerId, req.tenantId]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
  } else if (customerName && customerEmail) {
    customer = await getOne(
      `INSERT INTO customers (tenant_id, name, email, phone)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, email) WHERE email IS NOT NULL DO UPDATE SET
         name = EXCLUDED.name, phone = COALESCE(EXCLUDED.phone, customers.phone)
       RETURNING *`,
      [req.tenantId, customerName, customerEmail, customerPhone || null]
    );
  } else {
    return res.status(400).json({ error: 'Either customerId or customerName + customerEmail required' });
  }

  const placeholders = serviceIds.map((_, i) => `$${i + 2}`).join(',');
  const services = await getAll(
    `SELECT * FROM services WHERE id IN (${placeholders}) AND tenant_id = $1 AND active = TRUE`,
    [req.tenantId, ...serviceIds]
  );

  const serviceTotalPrice = services.reduce((sum, s) => sum + parseFloat(s.price), 0);
  const totalPrice = (priceOverride != null && priceOverride >= 0) ? parseFloat(priceOverride) : serviceTotalPrice;
  const totalDuration = services.reduce((sum, s) => sum + s.duration, 0);
  const serviceNames = services.map(s => s.name).join(', ');

  const groupId = require('crypto').randomUUID();

  const created = [];
  for (const entry of dates) {
    const entryDate = entry.date || entry;
    const entryTime = entry.startTime || dates[0]?.startTime || '09:00';
    const [hours, minutes] = entryTime.split(':').map(Number);
    const endMinutes = hours * 60 + minutes + totalDuration;
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`;

    const booking = await getOne(
      `INSERT INTO bookings (tenant_id, customer_id, customer_name, customer_email, customer_phone,
         service_ids, service_names, date, start_time, end_time,
         total_price, total_duration, status, notes, created_by,
         recurring_group_id, is_recurring, recurring_frequency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'confirmed', $13, 'admin', $14, TRUE, $15)
       RETURNING *`,
      [req.tenantId, customer.id, customer.name, customer.email, customer.phone || null,
       serviceIds.join(','), serviceNames, entryDate, entryTime, endTime,
       totalPrice, totalDuration, notes || null, groupId, frequency || 'weekly']
    );

    await run(
      `UPDATE time_slots SET is_available = FALSE
       WHERE tenant_id = $1 AND date = $2 AND start_time >= $3 AND start_time < $4`,
      [req.tenantId, entryDate, entryTime, endTime]
    );

    created.push(booking);
  }

  res.status(201).json({ bookings: created, count: created.length });
}));

// ============================================
// PAYMENTS
// ============================================

// POST /api/admin/bookings/:id/cash-payment
router.post('/bookings/:id/cash-payment', asyncHandler(async (req, res) => {
  const { tipAmount } = req.body;
  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tip = tipAmount && parseFloat(tipAmount) > 0 ? Math.round(parseFloat(tipAmount) * 100) / 100 : 0;
  const paymentAmount = parseFloat(booking.total_price) + tip;

  // Record payment
  await getOne(
    `INSERT INTO payments (tenant_id, booking_id, amount, payment_method, payment_status, paid_at, tip_amount)
     VALUES ($1, $2, $3, 'cash', 'completed', NOW(), $4) RETURNING *`,
    [req.tenantId, booking.id, paymentAmount, tip]
  );

  // Update booking status and tip
  await run(
    `UPDATE bookings SET status = 'completed', payment_status = 'paid', tip_amount = $2 WHERE id = $1`,
    [booking.id, tip]
  );

  // Update customer visit tracking
  if (booking.customer_email) {
    await run(
      `UPDATE customers SET total_visits = total_visits + 1, last_visit_date = $1
       WHERE tenant_id = $2 AND email = $3`,
      [booking.date, req.tenantId, booking.customer_email]
    );
  }

  // Award loyalty stamp
  if (booking.customer_id && booking.service_ids) {
    const primaryServiceId = parseInt(booking.service_ids.split(',')[0]);
    if (primaryServiceId) {
      awardStampForBooking(req.tenantId, booking.customer_id, booking.id, primaryServiceId, booking.discount_code_id)
        .catch(err => console.error('Loyalty stamp error:', err));
    }
  }

  // Send completion follow-up email (review + tip)
  if (booking.customer_email) {
    const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
    const followUpToken = jwt.sign(
      { bookingId: booking.id, tenantId: req.tenantId },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    sendCompletionFollowUpEmail(booking, tenant, followUpToken)
      .catch(err => console.error('Follow-up email error:', err));
  }

  res.json({ message: 'Cash payment recorded', booking_id: booking.id });
}));

// POST /api/admin/bookings/:id/charge-noshow
router.post('/bookings/:id/charge-noshow', asyncHandler(async (req, res) => {
  const { amount, paymentMethodId } = req.body;

  if (!amount || !paymentMethodId) {
    return res.status(400).json({ error: 'amount and paymentMethodId are required' });
  }

  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);

  try {
    const paymentIntent = await chargeNoShow(tenant, booking.customer_email, paymentMethodId, amount, booking.id);

    // Record payment
    await getOne(
      `INSERT INTO payments (tenant_id, booking_id, amount, payment_method, payment_status, stripe_payment_id, noshow_charge_id, paid_at)
       VALUES ($1, $2, $3, 'card', 'completed', $4, $4, NOW()) RETURNING *`,
      [req.tenantId, booking.id, amount, paymentIntent.id]
    );

    // Mark booking
    await run(
      `UPDATE bookings SET marked_noshow = TRUE, payment_status = 'paid' WHERE id = $1`,
      [booking.id]
    );

    res.json({ message: 'No-show charge processed', payment_intent_id: paymentIntent.id });
  } catch (err) {
    res.status(400).json({ error: `Charge failed: ${err.message}` });
  }
}));

// POST /api/admin/bookings/:id/charge-complete — charge card and mark service completed
router.post('/bookings/:id/charge-complete', asyncHandler(async (req, res) => {
  const { paymentMethodId, tipAmount } = req.body;

  if (!paymentMethodId) {
    return res.status(400).json({ error: 'paymentMethodId is required' });
  }

  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  const tip = tipAmount && parseFloat(tipAmount) > 0 ? Math.round(parseFloat(tipAmount) * 100) / 100 : 0;
  const amount = parseFloat(booking.total_price) + tip;

  try {
    const paymentIntent = await chargeNoShow(tenant, booking.customer_email, paymentMethodId, amount, booking.id);

    // Record payment
    await getOne(
      `INSERT INTO payments (tenant_id, booking_id, amount, payment_method, payment_status, stripe_payment_id, paid_at, tip_amount)
       VALUES ($1, $2, $3, 'card', 'completed', $4, NOW(), $5) RETURNING *`,
      [req.tenantId, booking.id, amount, paymentIntent.id, tip]
    );

    // Mark booking completed
    await run(
      `UPDATE bookings SET status = 'completed', payment_status = 'paid', tip_amount = $2 WHERE id = $1`,
      [booking.id, tip]
    );

    // Update customer visit tracking
    if (booking.customer_email) {
      await run(
        `UPDATE customers SET total_visits = total_visits + 1, last_visit_date = $1
         WHERE tenant_id = $2 AND email = $3`,
        [booking.date, req.tenantId, booking.customer_email]
      );
    }

    // Award loyalty stamp
    if (booking.customer_id && booking.service_ids) {
      const primaryServiceId = parseInt(booking.service_ids.split(',')[0]);
      if (primaryServiceId) {
        awardStampForBooking(req.tenantId, booking.customer_id, booking.id, primaryServiceId, booking.discount_code_id)
          .catch(err => console.error('Loyalty stamp error:', err));
      }
    }

    // Send completion follow-up email (review + tip)
    if (booking.customer_email) {
      const followUpToken = jwt.sign(
        { bookingId: booking.id, tenantId: req.tenantId },
        process.env.JWT_SECRET,
        { expiresIn: '30d' }
      );
      sendCompletionFollowUpEmail(booking, tenant, followUpToken)
        .catch(err => console.error('Follow-up email error:', err));
    }

    res.json({ message: 'Card charged and service completed', payment_intent_id: paymentIntent.id });
  } catch (err) {
    res.status(400).json({ error: `Charge failed: ${err.message}` });
  }
}));

// GET /api/admin/bookings/:id/payment-methods
router.get('/bookings/:id/payment-methods', asyncHandler(async (req, res) => {
  const booking = await getOne(
    'SELECT * FROM bookings WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );

  if (!booking) return res.status(404).json({ error: 'Booking not found' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  const methods = await getCustomerPaymentMethods(tenant, booking.customer_email);

  res.json(methods);
}));

// ============================================
// SETTINGS (tenant self-service)
// ============================================

// GET /api/admin/settings
router.get('/settings', asyncHandler(async (req, res) => {
  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  // Return settings (mask secret key for display)
  res.json({
    name: tenant.name,
    slug: tenant.slug,
    owner_email: tenant.owner_email,
    owner_name: tenant.owner_name,
    business_phone: tenant.business_phone,
    business_address: tenant.business_address,
    logo_url: tenant.logo_url,
    primary_color: tenant.primary_color,
    stripe_publishable_key: tenant.stripe_publishable_key || '',
    stripe_secret_key_set: !!tenant.stripe_secret_key,
    stripe_secret_key_masked: tenant.stripe_secret_key
      ? `sk_...${tenant.stripe_secret_key.slice(-8)}`
      : '',
    brevo_enabled: tenant.brevo_enabled,
    sms_enabled: tenant.sms_enabled,
    subscription_tier: tenant.subscription_tier,
    subscription_status: tenant.subscription_status,
  });
}));

// PUT /api/admin/settings
router.put('/settings', asyncHandler(async (req, res) => {
  const {
    name, business_phone, business_address, logo_url, primary_color,
    stripe_publishable_key, stripe_secret_key,
  } = req.body;

  // Validate URL fields
  if (logo_url) {
    const { validateUrl } = require('../utils/urlValidator');
    const check = validateUrl(logo_url);
    if (!check.valid) return res.status(400).json({ error: `Logo URL: ${check.error}` });
  }

  // Build dynamic update
  const updates = [];
  const params = [];
  let paramIndex = 1;

  const addField = (field, value) => {
    if (value !== undefined) {
      updates.push(`${field} = $${paramIndex++}`);
      params.push(value);
    }
  };

  addField('name', name);
  addField('business_phone', business_phone);
  addField('business_address', business_address);
  addField('logo_url', logo_url);
  addField('primary_color', primary_color);
  addField('stripe_publishable_key', stripe_publishable_key);

  // Only update secret key if a new one is provided (not the masked value)
  if (stripe_secret_key && !stripe_secret_key.startsWith('sk_...')) {
    addField('stripe_secret_key', stripe_secret_key);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push(`updated_at = NOW()`);
  params.push(req.tenantId);

  const tenant = await getOne(
    `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING
      id, name, slug, owner_email, owner_name, business_phone, business_address,
      logo_url, primary_color, stripe_publishable_key,
      brevo_enabled, sms_enabled, subscription_tier, subscription_status`,
    params
  );

  // Activity log
  const { logActivity } = require('../utils/activityLog');
  logActivity(req.tenantId, 'tenant_admin', req.user.id, req.user.email, 'settings_updated', { fields: Object.keys(req.body) });

  res.json(tenant);
}));

// ============================================
// IMPERSONATION: Tenant Admin → Customer
// ============================================

// POST /api/admin/impersonate/customer/:customerId
router.post('/impersonate/customer/:customerId', asyncHandler(async (req, res) => {
  const customer = await getOne(
    'SELECT id, name, email, phone, allow_admin_impersonation FROM customers WHERE id = $1 AND tenant_id = $2',
    [req.params.customerId, req.tenantId]
  );
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  if (!customer.allow_admin_impersonation) {
    return res.status(403).json({ error: 'Customer has not enabled admin impersonation' });
  }

  const tenant = await getOne('SELECT name, slug FROM tenants WHERE id = $1', [req.tenantId]);

  // Generate a customer-level token
  const token = jwt.sign(
    {
      customerId: customer.id,
      tenantId: req.tenantId,
      email: customer.email,
      role: 'customer',
      impersonatedBy: { id: req.user.id, username: req.user.username, type: 'tenant_admin' },
    },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Log impersonation session
  await run(
    `INSERT INTO impersonation_sessions (impersonator_type, impersonator_id, target_type, target_tenant_id, target_customer_id)
     VALUES ('tenant_admin', $1, 'customer', $2, $3)`,
    [req.user.id, req.tenantId, customer.id]
  ).catch(() => {});

  const { logActivity } = require('../utils/activityLog');
  logActivity(req.tenantId, 'tenant_admin', req.user.id, req.user.email, 'customer_impersonation_started', { customer_name: customer.name, customer_id: customer.id });

  res.json({
    token,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      impersonating: true,
      impersonatedBy: req.user.username,
    },
    tenantSlug: tenant?.slug,
  });
}));

// ── Setup Status (onboarding wizard) ──
router.get('/setup-status', asyncHandler(async (req, res) => {
  const [services, about, branding, templates, dismissed] = await Promise.all([
    getOne('SELECT COUNT(*)::int AS cnt FROM services WHERE tenant_id = $1 AND active = true', [req.tenantId]),
    getOne(`SELECT setting_value FROM tenant_settings WHERE tenant_id = $1 AND setting_key = 'about_text'`, [req.tenantId]),
    getOne(`SELECT setting_value FROM tenant_settings WHERE tenant_id = $1 AND setting_key = 'primary_color'`, [req.tenantId]),
    getOne('SELECT COUNT(*)::int AS cnt FROM slot_templates WHERE tenant_id = $1', [req.tenantId]),
    getOne(`SELECT setting_value FROM tenant_settings WHERE tenant_id = $1 AND setting_key = 'setup_wizard_dismissed'`, [req.tenantId]),
  ]);

  const tenant = await getOne('SELECT stripe_publishable_key, stripe_secret_key FROM tenants WHERE id = $1', [req.tenantId]);

  res.json({
    hasServices: (services?.cnt || 0) > 0,
    hasAbout: !!(about?.setting_value),
    hasBranding: !!(branding?.setting_value),
    hasStripe: !!(tenant?.stripe_publishable_key && tenant?.stripe_secret_key),
    hasTemplates: (templates?.cnt || 0) > 0,
    dismissed: dismissed?.setting_value === 'true',
  });
}));

router.post('/setup-status/dismiss', asyncHandler(async (req, res) => {
  await run(
    `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, updated_at)
     VALUES ($1, 'setup_wizard_dismissed', 'true', NOW())
     ON CONFLICT (tenant_id, setting_key) DO UPDATE SET
       setting_value = 'true', updated_at = NOW()`,
    [req.tenantId]
  );
  res.json({ ok: true });
}));

// ── SMS Settings ──
const SMS_SETTING_KEYS = [
  'sms_booking_confirmed_enabled',
  'sms_booking_rejected_enabled',
  'sms_reminder_24h_enabled',
  'sms_reminder_2h_enabled',
];

router.get('/sms-settings', asyncHandler(async (req, res) => {
  const rows = await getAll(
    `SELECT setting_key, setting_value FROM tenant_settings
     WHERE tenant_id = $1 AND setting_key = ANY($2)`,
    [req.tenantId, SMS_SETTING_KEYS]
  );

  // Build settings object with defaults
  const settings = {
    sms_booking_confirmed_enabled: 'true',
    sms_booking_rejected_enabled: 'true',
    sms_reminder_24h_enabled: 'true',
    sms_reminder_2h_enabled: 'false',
  };
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });

  // Check if tenant plan supports SMS
  const tenant = await getOne('SELECT sms_enabled, subscription_tier FROM tenants WHERE id = $1', [req.tenantId]);
  let planSmsEnabled = tenant?.sms_enabled;
  if (!planSmsEnabled) {
    const plan = await getOne(
      'SELECT sms_enabled FROM subscription_plans WHERE tier = $1 AND is_active = TRUE',
      [tenant?.subscription_tier || 'free']
    );
    planSmsEnabled = plan?.sms_enabled;
  }

  res.json({ settings, sms_available: !!planSmsEnabled });
}));

router.put('/sms-settings', asyncHandler(async (req, res) => {
  const { settings } = req.body;
  if (!settings) return res.status(400).json({ error: 'settings is required' });

  for (const key of SMS_SETTING_KEYS) {
    if (settings[key] !== undefined) {
      await run(
        `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (tenant_id, setting_key) DO UPDATE SET
           setting_value = $3, updated_at = NOW()`,
        [req.tenantId, key, String(settings[key])]
      );
    }
  }

  res.json({ message: 'SMS settings saved' });
}));

// ============================================
// WAITLIST
// ============================================

// GET /api/admin/waitlist
router.get('/waitlist', asyncHandler(async (req, res) => {
  const { date, status } = req.query;
  let query = `SELECT * FROM waitlist WHERE tenant_id = $1`;
  const params = [req.tenantId];

  if (date) {
    params.push(date);
    query += ` AND date = $${params.length}`;
  }
  if (status) {
    params.push(status);
    query += ` AND status = $${params.length}`;
  }

  query += ' ORDER BY date ASC, created_at ASC';
  const entries = await getAll(query, params);
  res.json(entries);
}));

// GET /api/admin/waitlist/count — active waitlist count for dashboard
router.get('/waitlist/count', asyncHandler(async (req, res) => {
  const result = await getOne(
    `SELECT COUNT(*)::int as count FROM waitlist WHERE tenant_id = $1 AND status = 'waiting'`,
    [req.tenantId]
  );
  res.json({ count: result?.count || 0 });
}));

// DELETE /api/admin/waitlist/:id
router.delete('/waitlist/:id', asyncHandler(async (req, res) => {
  const entry = await getOne(
    'DELETE FROM waitlist WHERE id = $1 AND tenant_id = $2 RETURNING *',
    [req.params.id, req.tenantId]
  );
  if (!entry) return res.status(404).json({ error: 'Waitlist entry not found' });
  res.json({ message: 'Removed from waitlist' });
}));

// POST /api/admin/waitlist/:id/notify — manually notify a waitlist entry
router.post('/waitlist/:id/notify', asyncHandler(async (req, res) => {
  const entry = await getOne(
    `SELECT * FROM waitlist WHERE id = $1 AND tenant_id = $2 AND status = 'waiting'`,
    [req.params.id, req.tenantId]
  );
  if (!entry) return res.status(404).json({ error: 'Waitlist entry not found or not in waiting status' });

  const tenant = await getOne('SELECT * FROM tenants WHERE id = $1', [req.tenantId]);
  const { notifyWaitlistCustomer } = require('../utils/waitlistService');
  await notifyWaitlistCustomer(entry, tenant);

  res.json({ message: 'Customer notified' });
}));

module.exports = router;
