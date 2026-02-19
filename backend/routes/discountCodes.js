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

// GET /api/admin/discount-codes
adminRouter.get('/', asyncHandler(async (req, res) => {
  const codes = await getAll(
    'SELECT * FROM discount_codes WHERE tenant_id = $1 ORDER BY created_at DESC',
    [req.tenantId]
  );
  res.json(codes);
}));

// POST /api/admin/discount-codes
adminRouter.post('/', asyncHandler(async (req, res) => {
  const { code, description, discount_type, discount_value, max_uses, min_spend, category, expires_at } = req.body;

  if (!code || !discount_type || !discount_value) {
    return res.status(400).json({ error: 'code, discount_type, and discount_value are required' });
  }

  if (!['percentage', 'fixed'].includes(discount_type)) {
    return res.status(400).json({ error: 'discount_type must be percentage or fixed' });
  }

  const newCode = await getOne(
    `INSERT INTO discount_codes (tenant_id, code, description, discount_type, discount_value, max_uses, min_spend, category, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [req.tenantId, code.toUpperCase(), description || null, discount_type, discount_value,
     max_uses || null, min_spend || 0, category || null, expires_at || null]
  );

  res.status(201).json(newCode);
}));

// PUT /api/admin/discount-codes/:id
adminRouter.put('/:id', asyncHandler(async (req, res) => {
  const { code, description, discount_type, discount_value, max_uses, min_spend, category, active, expires_at } = req.body;

  const updated = await getOne(
    `UPDATE discount_codes SET
       code = COALESCE($3, code),
       description = $4,
       discount_type = COALESCE($5, discount_type),
       discount_value = COALESCE($6, discount_value),
       max_uses = $7,
       min_spend = COALESCE($8, min_spend),
       category = $9,
       active = COALESCE($10, active),
       expires_at = $11
     WHERE id = $1 AND tenant_id = $2 RETURNING *`,
    [req.params.id, req.tenantId, code?.toUpperCase(), description || null,
     discount_type, discount_value, max_uses || null, min_spend, category || null,
     active, expires_at || null]
  );

  if (!updated) return res.status(404).json({ error: 'Discount code not found' });
  res.json(updated);
}));

// DELETE /api/admin/discount-codes/:id
adminRouter.delete('/:id', asyncHandler(async (req, res) => {
  await run('DELETE FROM discount_code_uses WHERE discount_code_id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  await run('DELETE FROM discount_codes WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
  res.json({ message: 'Deleted' });
}));

// POST /api/admin/discount-codes/generate — generate random code
adminRouter.post('/generate', asyncHandler(async (req, res) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  res.json({ code });
}));

// ============================================
// PUBLIC ROUTES (behind resolveTenant)
// ============================================
publicRouter.use(resolveTenant);

// POST /api/t/:tenant/discount/validate — validate a code and calculate discount
publicRouter.post('/validate', asyncHandler(async (req, res) => {
  const { code, total_price, category } = req.body;

  if (!code) return res.status(400).json({ error: 'Code is required' });

  const discountCode = await getOne(
    `SELECT * FROM discount_codes WHERE tenant_id = $1 AND code = $2 AND active = TRUE`,
    [req.tenantId, code.toUpperCase()]
  );

  if (!discountCode) {
    return res.status(400).json({ error: 'Invalid or expired code' });
  }

  // Check expiry
  if (discountCode.expires_at && new Date(discountCode.expires_at) < new Date()) {
    return res.status(400).json({ error: 'This code has expired' });
  }

  // Check max uses
  if (discountCode.max_uses && discountCode.uses_count >= discountCode.max_uses) {
    return res.status(400).json({ error: 'This code has reached its usage limit' });
  }

  // Check min spend
  const price = parseFloat(total_price) || 0;
  if (price < parseFloat(discountCode.min_spend)) {
    return res.status(400).json({ error: `Minimum spend of £${parseFloat(discountCode.min_spend).toFixed(2)} required` });
  }

  // Check category restriction
  if (discountCode.category && category && discountCode.category !== category) {
    return res.status(400).json({ error: `This code is only valid for ${discountCode.category} services` });
  }

  // Calculate discount
  let discount_amount;
  if (discountCode.discount_type === 'percentage') {
    discount_amount = Math.round(price * (parseFloat(discountCode.discount_value) / 100) * 100) / 100;
  } else {
    discount_amount = Math.min(parseFloat(discountCode.discount_value), price);
  }

  res.json({
    valid: true,
    code: discountCode.code,
    discount_type: discountCode.discount_type,
    discount_value: parseFloat(discountCode.discount_value),
    discount_amount,
    final_price: Math.max(0, price - discount_amount),
    description: discountCode.description,
  });
}));

module.exports = { adminRouter, publicRouter };
