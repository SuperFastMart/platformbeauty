const multer = require('multer');
const { getOne, getAll, run } = require('../config/database');
const { tenantAuth, resolveTenant } = require('../middleware/auth');

const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (['image/png', 'image/jpeg', 'image/webp'].includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only PNG, JPEG and WebP images are allowed'));
  },
});

// ============================================
// ADMIN ROUTES (behind tenantAuth)
// ============================================
const adminRouter = require('express').Router();
adminRouter.use(tenantAuth);

adminRouter.post('/:imageKey', upload.single('image'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });

  const { imageKey } = req.params;
  const allowedKeys = ['logo', 'header_logo', 'profile', 'banner'];
  const isGallery = /^gallery_\d+$/.test(imageKey);
  if (!allowedKeys.includes(imageKey) && !isGallery) {
    return res.status(400).json({ error: 'Invalid image key' });
  }

  await run(
    `INSERT INTO tenant_images (tenant_id, image_key, file_name, mime_type, file_size, file_data)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (tenant_id, image_key)
     DO UPDATE SET file_name = $3, mime_type = $4, file_size = $5, file_data = $6, created_at = CURRENT_TIMESTAMP`,
    [req.tenantId, imageKey, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]
  );

  const tenant = await getOne('SELECT slug FROM tenants WHERE id = $1', [req.tenantId]);
  const url = `/api/t/${tenant.slug}/images/${imageKey}`;
  res.json({ image_key: imageKey, url, file_name: req.file.originalname, file_size: req.file.size });
}));

adminRouter.delete('/:imageKey', asyncHandler(async (req, res) => {
  await run(
    'DELETE FROM tenant_images WHERE tenant_id = $1 AND image_key = $2',
    [req.tenantId, req.params.imageKey]
  );
  res.json({ deleted: true });
}));

adminRouter.get('/', asyncHandler(async (req, res) => {
  const images = await getAll(
    'SELECT id, image_key, file_name, mime_type, file_size, created_at FROM tenant_images WHERE tenant_id = $1 ORDER BY image_key',
    [req.tenantId]
  );
  const tenant = await getOne('SELECT slug FROM tenants WHERE id = $1', [req.tenantId]);
  res.json(images.map(img => ({
    ...img,
    url: `/api/t/${tenant.slug}/images/${img.image_key}`
  })));
}));

// ============================================
// PUBLIC ROUTES (behind resolveTenant)
// ============================================
const publicRouter = require('express').Router({ mergeParams: true });
publicRouter.use(resolveTenant);

publicRouter.get('/:imageKey', asyncHandler(async (req, res) => {
  const image = await getOne(
    'SELECT mime_type, file_data, created_at FROM tenant_images WHERE tenant_id = $1 AND image_key = $2',
    [req.tenantId, req.params.imageKey]
  );
  if (!image) return res.status(404).send('Image not found');

  res.set('Content-Type', image.mime_type);
  res.set('Cache-Control', 'public, max-age=300, must-revalidate');
  res.set('ETag', `"${req.params.imageKey}-${new Date(image.created_at).getTime()}"`);
  res.send(image.file_data);
}));

publicRouter.get('/', asyncHandler(async (req, res) => {
  const images = await getAll(
    "SELECT image_key, file_name, file_size FROM tenant_images WHERE tenant_id = $1 AND image_key LIKE 'gallery_%' ORDER BY image_key",
    [req.tenantId]
  );
  const tenant = await getOne('SELECT slug FROM tenants WHERE id = $1', [req.tenantId]);
  res.json(images.map(img => ({
    image_key: img.image_key,
    url: `/api/t/${tenant.slug}/images/${img.image_key}`
  })));
}));

module.exports = { adminRouter, publicRouter };
