const adminRouter = require('express').Router();
const publicRouter = require('express').Router({ mergeParams: true });
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth } = require('../middleware/auth');
const { resolveTenant } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// ============================================
// ADMIN ROUTES (behind tenantAuth)
// ============================================
adminRouter.use(tenantAuth);

// GET /api/admin/site-settings — all settings as key-value object
adminRouter.get('/', asyncHandler(async (req, res) => {
  const rows = await getAll(
    'SELECT setting_key, setting_value FROM tenant_settings WHERE tenant_id = $1',
    [req.tenantId]
  );

  const settings = {};
  rows.forEach(r => {
    // Try to parse JSON values
    try {
      settings[r.setting_key] = JSON.parse(r.setting_value);
    } catch {
      settings[r.setting_key] = r.setting_value;
    }
  });

  res.json(settings);
}));

// PUT /api/admin/site-settings/:key — update single setting
adminRouter.put('/:key', asyncHandler(async (req, res) => {
  const { value } = req.body;
  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value || '');

  await run(
    `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (tenant_id, setting_key) DO UPDATE SET
       setting_value = EXCLUDED.setting_value,
       updated_at = NOW()`,
    [req.tenantId, req.params.key, stringValue]
  );

  res.json({ success: true });
}));

// PUT /api/admin/site-settings — bulk update multiple settings
adminRouter.put('/', asyncHandler(async (req, res) => {
  const settings = req.body;

  for (const [key, value] of Object.entries(settings)) {
    const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value || '');
    await run(
      `INSERT INTO tenant_settings (tenant_id, setting_key, setting_value, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (tenant_id, setting_key) DO UPDATE SET
         setting_value = EXCLUDED.setting_value,
         updated_at = NOW()`,
      [req.tenantId, key, stringValue]
    );
  }

  res.json({ success: true });
}));

// ============================================
// PUBLIC ROUTES (behind resolveTenant)
// ============================================
publicRouter.use(resolveTenant);

// GET /api/t/:tenant/settings — public-safe settings
publicRouter.get('/', asyncHandler(async (req, res) => {
  const publicKeys = [
    'about_title', 'about_text', 'business_hours',
    'contact_phone', 'contact_email', 'contact_address',
    'category_order',
    'about_profile_image_url', 'about_show_map', 'about_map_embed_url',
    'social_embeds',
    'header_display', 'header_font', 'header_logo_url',
    'policy_cancellation', 'policy_noshow', 'policy_privacy', 'policy_terms',
  ];

  const placeholders = publicKeys.map((_, i) => `$${i + 2}`).join(',');
  const rows = await getAll(
    `SELECT setting_key, setting_value FROM tenant_settings
     WHERE tenant_id = $1 AND setting_key IN (${placeholders})`,
    [req.tenantId, ...publicKeys]
  );

  const settings = {};
  rows.forEach(r => {
    try {
      settings[r.setting_key] = JSON.parse(r.setting_value);
    } catch {
      settings[r.setting_key] = r.setting_value;
    }
  });

  res.json(settings);
}));

module.exports = { adminRouter, publicRouter };
