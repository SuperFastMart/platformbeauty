const jwt = require('jsonwebtoken');

// Authenticate tenant admin users
const tenantAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, tenantId, username, role }
    req.tenantId = decoded.tenantId;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Authenticate platform super admins
const platformAuth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'platform_admin') {
      return res.status(403).json({ error: 'Platform admin access required' });
    }

    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Resolve tenant from slug in URL (for public-facing routes)
const resolveTenant = async (req, res, next) => {
  const { getOne } = require('../config/database');

  const slug = req.params.tenant || req.headers['x-tenant-slug'];
  if (!slug) {
    return res.status(400).json({ error: 'Tenant not specified' });
  }

  const tenant = await getOne(
    'SELECT * FROM tenants WHERE slug = $1 AND active = TRUE',
    [slug]
  );

  if (!tenant) {
    return res.status(404).json({ error: 'Business not found' });
  }

  req.tenant = tenant;
  req.tenantId = tenant.id;
  next();
};

module.exports = { tenantAuth, platformAuth, resolveTenant };
